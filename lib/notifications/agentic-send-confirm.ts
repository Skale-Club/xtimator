import 'server-only'
import { randomUUID, createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SendChannel } from '@/lib/notifications/customer-send-gate'
import type { TriggerSource } from '@/lib/notifications/customer-send'
import { rateLimit } from '@/lib/ratelimit'
import { isRedisAvailable } from '@/lib/redis'

/**
 * Phase 178 Plan 01 (AGENT-01/02/03) — the confirmation state-machine BOTH
 * the WhatsApp assistant (178-03) and the MCP tool pair (178-04) bind to.
 * A row is the durable, server-authoritative record of "owner was shown
 * exactly this recipient + body and has not yet said yes" — send only ever
 * reads a row back, never re-accepts recipient/body from the LLM at confirm
 * time (Pitfall 8: a distinct confirm turn; Pitfall 9: prompt-injection
 * resistance via a structural hash binding, not a naming convention).
 *
 * Never-throw discipline: every exported DB-READING function
 * (resolvePendingByChannelRef, resolveByToken) and every STATUS-WRITING
 * function (markConfirmed, markCancelled, markRefused) wraps its entire
 * body in try/catch and resolves a safe fallback on ANY failure — this is
 * what makes 178-03's unconditional call from lib/whatsapp/handler.ts's hot
 * path safe against every existing handler test's mock shape (none of which
 * know about this table) without touching a single existing test file.
 * createSendConfirmation is the ONE function allowed to throw — a failed
 * draft creation is the caller's problem to surface (178-02).
 */

export type ConfirmationStatus = 'pending' | 'confirmed' | 'cancelled' | 'expired' | 'refused'

export interface PendingSendConfirmation {
  id: string
  companyId: string
  clientId: string
  channel: SendChannel
  subject: string | null
  body: string
  bodyHash: string
  triggerSource: TriggerSource
  /** Opaque per-channel binding key. For 'agentic-whatsapp' this is the
   * owner's E.164 phone (maps to the owner_phone column). Unused/null for
   * 'agentic-mcp' (which uses `token` instead). Never inspected for meaning
   * by this module beyond equality matching. */
  channelRef: string | null
  token: string | null
  status: ConfirmationStatus
  expiresAt: string
}

export const CONFIRMATION_TTL_MINUTES = 10

export interface CreateSendConfirmationParams {
  companyId: string
  clientId: string
  channel: SendChannel
  body: string
  subject?: string | null
  triggerSource: TriggerSource
  channelRef?: string | null
}

const TABLE = 'agentic_send_confirmations'

// ---------------------------------------------------------------------------
// Pure functions -- no mocks needed.
// ---------------------------------------------------------------------------

/**
 * Structural integrity hash over the fields that define WHO a message goes
 * to and WHAT it says. `subject: undefined` and `subject: null` are treated
 * as the same "absent" value (both normalize to the empty string), so a
 * caller passing either produces an identical hash. Fields are joined with
 * a fixed separator plus each field's own length, so no combination of
 * field values can be re-partitioned into a different (clientId, channel,
 * subject, body) tuple that hashes the same way.
 */
export function computeBodyHash(
  clientId: string,
  channel: string,
  body: string,
  subject?: string | null,
): string {
  const normalizedSubject = subject ?? ''
  const fields = [clientId, channel, normalizedSubject, body]
  const material = fields.map((f) => `${f.length}:${f}`).join('|')
  return createHash('sha256').update(material, 'utf8').digest('hex')
}

/**
 * Recomputes the hash from the row's OWN (clientId, channel, body, subject)
 * and compares to the stored bodyHash -- a structural integrity guard, not
 * just a naming convention. A tampered `body` with a stale `bodyHash`
 * fails this check.
 */
export function verifyBinding(row: PendingSendConfirmation): boolean {
  return computeBodyHash(row.clientId, row.channel, row.body, row.subject) === row.bodyHash
}

const CONFIRM_PHRASES = [
  'yes',
  'y',
  'confirm',
  'send it',
  'go ahead',
  'ok send',
  'sim',
  'pode enviar',
  'manda',
  'si',
]

const CANCEL_PHRASES = ['no', 'n', 'cancel', 'stop', "don't send", 'não', 'cancela']

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function matchesAnyPhrase(normalized: string, phrases: string[]): boolean {
  return phrases.some((phrase) => new RegExp(`^${escapeRegExp(phrase)}\\b`, 'i').test(normalized))
}

/**
 * Pure, deterministic (no LLM call) so a WhatsApp owner's confirm/cancel
 * reply classifies the same way every time, in English, Portuguese, and
 * Spanish. Case-insensitive, trims input, strips trailing punctuation, and
 * anchors matches to the START of the normalized string -- "yes please send
 * it" still matches confirm, but a longer unrelated sentence (e.g. a
 * legitimate CREATE-shaped message like "build a new deck") falls through
 * to 'unclear' instead of false-positiving.
 */
export function interpretConfirmationReply(text: string): 'confirm' | 'cancel' | 'unclear' {
  const normalized = text.trim().replace(/[!?.,;:]+$/g, '').trim()
  if (matchesAnyPhrase(normalized, CONFIRM_PHRASES)) return 'confirm'
  if (matchesAnyPhrase(normalized, CANCEL_PHRASES)) return 'cancel'
  return 'unclear'
}

const SEND_GATE_REFUSAL_EXPLANATIONS: Record<string, string> = {
  suppressed: 'This customer has opted out and cannot be contacted.',
  no_consent: 'This customer has not consented to text messages yet.',
  quiet_hours: "It's currently outside this customer's allowed contact hours.",
  unresolvable_timezone: "We couldn't determine this customer's timezone to check quiet hours.",
  client_not_found: 'This client could not be found.',
  integrity_error: 'This confirmation no longer matches what was originally drafted and cannot be sent.',
}

/**
 * Each known gate-refusal reason returns a distinct, non-empty, human
 * string. `undefined` or an unrecognized reason returns a safe generic
 * fallback -- NEVER an empty string (a gate refusal must never be silent).
 */
export function explainSendGateRefusal(reason: string | undefined): string {
  if (reason && SEND_GATE_REFUSAL_EXPLANATIONS[reason]) {
    return SEND_GATE_REFUSAL_EXPLANATIONS[reason]
  }
  return 'This message could not be sent right now. Please try again later.'
}

// ---------------------------------------------------------------------------
// DB-backed functions.
// ---------------------------------------------------------------------------

interface AgenticSendConfirmationRow {
  id: string
  company_id: string
  client_id: string
  channel: string
  subject: string | null
  body: string
  body_hash: string
  trigger_source: string
  owner_phone: string | null
  token: string | null
  status: string
  expires_at: string
}

function mapRow(row: AgenticSendConfirmationRow): PendingSendConfirmation {
  return {
    id: row.id,
    companyId: row.company_id,
    clientId: row.client_id,
    channel: row.channel as SendChannel,
    subject: row.subject,
    body: row.body,
    bodyHash: row.body_hash,
    triggerSource: row.trigger_source as TriggerSource,
    channelRef: row.owner_phone,
    token: row.token,
    status: row.status as ConfirmationStatus,
    expiresAt: row.expires_at,
  }
}

/**
 * Creates the durable, pending confirmation row BEFORE any send is
 * attempted. The ONE function in this module allowed to throw -- a failed
 * draft creation is 178-02's draftCustomerMessage's problem to surface, not
 * something to silently swallow.
 */
export async function createSendConfirmation(
  supabase: SupabaseClient,
  params: CreateSendConfirmationParams,
): Promise<{ id: string; token: string | null; expiresAt: string }> {
  const bodyHash = computeBodyHash(params.clientId, params.channel, params.body, params.subject)
  const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MINUTES * 60_000).toISOString()
  const token = params.triggerSource === 'agentic-mcp' ? randomUUID() : null
  const ownerPhone = params.triggerSource === 'agentic-whatsapp' ? (params.channelRef ?? null) : null

  const { data, error } = await supabase
    .from(TABLE)
    .insert({
      company_id: params.companyId,
      client_id: params.clientId,
      channel: params.channel,
      subject: params.subject ?? null,
      body: params.body,
      body_hash: bodyHash,
      trigger_source: params.triggerSource,
      owner_phone: ownerPhone,
      token,
      status: 'pending',
      expires_at: expiresAt,
    })
    .select('id')
    .single()

  if (error || !data) {
    throw new Error(
      `[agentic-send-confirm] createSendConfirmation failed: ${error?.message ?? 'no row returned'}`,
    )
  }

  return { id: (data as { id: string }).id, token, expiresAt }
}

/**
 * Resolves the most recent pending, unexpired confirmation for a WhatsApp
 * owner (looked up on their NEXT inbound message). `.order` + `.limit(1)`
 * makes this multi-pending safe -- if an owner somehow has more than one
 * pending draft, the newest wins. Never throws: a DB/mock failure (including
 * a mock `.from()` with no `.select` method, mirroring handler.test.ts's
 * fallback shape) resolves `null`.
 */
export async function resolvePendingByChannelRef(
  supabase: SupabaseClient,
  companyId: string,
  channelRef: string,
): Promise<PendingSendConfirmation | null> {
  try {
    const nowIso = new Date().toISOString()
    const { data, error } = (await supabase
      .from(TABLE)
      .select('*')
      .eq('company_id', companyId)
      .eq('owner_phone', channelRef)
      .eq('trigger_source', 'agentic-whatsapp')
      .eq('status', 'pending')
      .gt('expires_at', nowIso)
      .order('created_at', { ascending: false })
      .limit(1)) as unknown as {
      data: AgenticSendConfirmationRow[] | null
      error: { message: string } | null
    }

    if (error) {
      console.warn('[agentic-send-confirm] resolvePendingByChannelRef read failed:', error.message)
      return null
    }
    const row = data?.[0]
    return row ? mapRow(row) : null
  } catch (err) {
    console.warn(
      '[agentic-send-confirm] resolvePendingByChannelRef unexpected:',
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}

/**
 * Resolves a pending, unexpired confirmation by its MCP token, company-scoped
 * -- a token guessed/leaked from another company can never resolve. `token`
 * is UNIQUE at the schema level, so a single-row lookup (no order/limit
 * needed) is sufficient here, unlike resolvePendingByChannelRef. Never
 * throws.
 */
export async function resolveByToken(
  supabase: SupabaseClient,
  companyId: string,
  token: string,
): Promise<PendingSendConfirmation | null> {
  try {
    const nowIso = new Date().toISOString()
    const { data, error } = (await supabase
      .from(TABLE)
      .select('*')
      .eq('token', token)
      .eq('company_id', companyId)
      .eq('trigger_source', 'agentic-mcp')
      .eq('status', 'pending')
      .gt('expires_at', nowIso)
      .maybeSingle()) as unknown as {
      data: AgenticSendConfirmationRow | null
      error: { message: string } | null
    }

    if (error) {
      console.warn('[agentic-send-confirm] resolveByToken read failed:', error.message)
      return null
    }
    return data ? mapRow(data) : null
  } catch (err) {
    console.warn(
      '[agentic-send-confirm] resolveByToken unexpected:',
      err instanceof Error ? err.message : String(err),
    )
    return null
  }
}

/**
 * CLAIM-BEFORE-DISPATCH: the atomic conditional claim primitive 178-02's
 * finalize flow calls FIRST -- claim -> gate -> dispatch -- before ever
 * touching the send primitive. A single UPDATE statement with BOTH `id` and
 * `status = 'pending'` in the WHERE clause (via chained `.eq()`), returning
 * the affected row via `.select()`: the claim succeeded if and only if a row
 * came back. Under concurrent callers racing the same row, exactly one
 * UPDATE matches (the second sees status already flipped away from
 * 'pending' and matches zero rows) -- this is what makes it safe to call
 * unconditionally without a separate read-then-write race window. Never
 * throws: an update failure resolves `false` (no claim), mirroring
 * logCustomerMessage's never-throw discipline for status writes.
 */
export async function markConfirmed(supabase: SupabaseClient, id: string): Promise<boolean> {
  try {
    const { data, error } = (await supabase
      .from(TABLE)
      .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'pending')
      .select('id')) as unknown as {
      data: Array<{ id: string }> | null
      error: { message: string } | null
    }

    if (error) {
      console.warn('[agentic-send-confirm] markConfirmed update failed:', error.message)
      return false
    }
    return Array.isArray(data) && data.length > 0
  } catch (err) {
    console.warn(
      '[agentic-send-confirm] markConfirmed unexpected:',
      err instanceof Error ? err.message : String(err),
    )
    return false
  }
}

export async function markCancelled(supabase: SupabaseClient, id: string): Promise<void> {
  try {
    const { error } = await supabase.from(TABLE).update({ status: 'cancelled' }).eq('id', id)
    if (error) {
      console.warn('[agentic-send-confirm] markCancelled update failed:', error.message)
    }
  } catch (err) {
    console.warn(
      '[agentic-send-confirm] markCancelled unexpected:',
      err instanceof Error ? err.message : String(err),
    )
  }
}

export async function markRefused(supabase: SupabaseClient, id: string): Promise<void> {
  try {
    const { error } = await supabase.from(TABLE).update({ status: 'refused' }).eq('id', id)
    if (error) {
      console.warn('[agentic-send-confirm] markRefused update failed:', error.message)
    }
  } catch (err) {
    console.warn(
      '[agentic-send-confirm] markRefused unexpected:',
      err instanceof Error ? err.message : String(err),
    )
  }
}

// ---------------------------------------------------------------------------
// Rate limit wrapper.
// ---------------------------------------------------------------------------

/**
 * FAIL-CLOSED (ratified deviation from lib/ratelimit.ts's normal fail-OPEN
 * posture -- every other limit in that file allows the request through when
 * Redis is unavailable). Agentic sends are real-money, irreversible
 * dispatches to a third party (the end customer), not an internal cost
 * control -- there is no second gate bounding a false ALLOW the way the
 * per-send owner confirmation gate bounds the UX cost of an occasional
 * false BLOCK. So: Redis unconfigured -> false immediately (never even
 * calls rateLimit()). Redis configured but errors mid-request -> rateLimit()
 * itself still fails open internally and reports `count: 0` (the sentinel
 * value for "the INCR never actually happened" -- a real evaluated request
 * always has count >= 1) -- treated as blocked here too, for the same
 * fail-closed rationale.
 */
export async function checkAgenticSendRateLimit(companyId: string): Promise<boolean> {
  if (!isRedisAvailable()) {
    return false
  }
  const result = await rateLimit('agenticSendPerCompanyPerDay', companyId)
  if (result.count === 0) {
    return false
  }
  return result.allowed
}
