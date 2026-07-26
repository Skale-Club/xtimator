import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { assertSendAllowed } from '@/lib/notifications/customer-send-gate'
import type { TriggerSource } from '@/lib/notifications/customer-send'
import { sendCustomerMessage as dispatchCustomerMessage } from '@/lib/notifications/customer-send'
import { assertCompanyWritable } from '@/lib/demo/guard'
import {
  createSendConfirmation,
  resolvePendingByChannelRef,
  resolveByToken,
  markConfirmed,
  markCancelled,
  markRefused,
  verifyBinding,
  checkAgenticSendRateLimit,
  type PendingSendConfirmation,
} from '@/lib/notifications/agentic-send-confirm'

/**
 * Phase 178 Plan 02 (AGENT-01/02/03) — the ONE neutral capability both
 * channel adapters (WhatsApp 178-03, MCP 178-04) bind to: draft a customer
 * message (resolve client, rate-limit, create a pending confirmation), and
 * confirm/cancel it (re-validate server-side, gate, dispatch through Phase
 * 177's single funnel, `sendCustomerMessage()`). All business logic —
 * recipient scoping, rate limiting, gate-then-dispatch ordering — lives
 * here exactly once so both channels get an identical guarantee instead of
 * two hand-rolled, potentially-diverging implementations.
 *
 * ENGINE-01 channel neutrality: this file NEVER references the WhatsApp
 * channel package, the "owner" + "Phone" binding-parameter name, WhatsApp
 * message types, or the WhatsApp send primitive — the per-channel binding
 * key always arrives here as an opaque `channelRef` string, never
 * inspected for meaning.
 *
 * CLAIM-BEFORE-DISPATCH (Wave-2 ADOPTED deviation from this plan's
 * literal finalize order — supersedes it): `finalizeConfirmedSend` calls
 * `markConfirmed()` FIRST as an atomic conditional claim (a single
 * UPDATE ... WHERE id = ? AND status = 'pending', returning the affected
 * row) — if the claim fails (another caller already claimed / the row was
 * refused / cancelled / expired), it returns `already_processed`
 * immediately with NO integrity check, NO gate check, and NO dispatch.
 * Only after a successful claim do binding verification, the gate, and
 * dispatch run. This closes the double-confirm race the plan's literal
 * "verify -> gate -> dispatch -> markConfirmed(always)" order left open:
 * two concurrent confirm calls on the same row could otherwise both pass
 * the gate and both dispatch before either write landed.
 */

export interface ClientMatch {
  id: string
  name: string | null
  phone: string | null
  email: string | null
}

export interface DraftSendParams {
  companyId: string
  /** Free-text name, LLM-supplied, untrusted. Never a phone/email — the
   * ONLY way to reach a recipient is by resolving to an existing `clients`
   * row scoped to companyId. */
  clientQuery: string
  channel: 'email' | 'sms'
  /** LLM-authored or owner-dictated, untrusted. */
  body: string
  subject?: string
  triggerSource: TriggerSource
  /** Opaque per-channel binding key. Never inspected for meaning here. */
  channelRef?: string | null
}

export type DraftSendResult =
  | {
      ok: true
      confirmationId: string
      token: string | null
      clientId: string
      clientName: string | null
      recipient: string
      channel: 'email' | 'sms'
      body: string
      subject?: string
    }
  | {
      ok: false
      error:
        | 'client_not_found'
        | 'client_ambiguous'
        | 'no_recipient_email'
        | 'no_recipient_phone'
        | 'rate_limited'
      candidates?: string[]
    }

export interface ConfirmSendResult {
  ok: boolean
  error?: string
}

const DEFAULT_BUSINESS_NAME = 'Your contractor'

/** Module-private. Untrusted, LLM-supplied `clientQuery` is used ONLY as
 * an `ilike` filter scoped to `company_id` — there is no code path that
 * accepts a raw phone number or email as a send target. */
async function findClientCandidates(
  supabase: SupabaseClient,
  companyId: string,
  clientQuery: string,
): Promise<ClientMatch[]> {
  const { data } = await supabase
    .from('clients')
    .select('id,name,phone,email')
    .eq('company_id', companyId)
    .ilike('name', `%${clientQuery}%`)
    .limit(5)
  return (data as ClientMatch[] | null) ?? []
}

/** Module-private. Same fallback ('Your contractor') used both for the
 * draft-time SMS preview and the confirm-time dispatch, so the two never
 * diverge. */
async function resolveBusinessName(supabase: SupabaseClient, companyId: string): Promise<string> {
  const { data } = await supabase.from('companies').select('name').eq('id', companyId).maybeSingle()
  return (data as { name?: string | null } | null)?.name ?? DEFAULT_BUSINESS_NAME
}

/**
 * 1. `checkAgenticSendRateLimit` — a rate-limited company never reaches a
 *    client lookup or a DB write.
 * 2. `clients` lookup, scoped by `company_id`. 0 rows -> client_not_found.
 *    2+ rows -> client_ambiguous with candidate names. Exactly 1 -> proceed.
 * 3. Channel-appropriate recipient must be on file.
 * 4. `createSendConfirmation` stores the RAW (pre-prefix) body — dispatch
 *    (customer-send.ts) applies the SMS business-name prefix itself at
 *    send time, so storing it pre-prefixed here would double it.
 * 5. Return the resolved preview. For SMS, the echoed `body` mirrors the
 *    business-name prefix BYTE-FOR-BYTE so the owner confirms exactly what
 *    the customer will receive; the stored row stays pre-prefix.
 */
export async function draftCustomerMessage(
  supabase: SupabaseClient,
  params: DraftSendParams,
): Promise<DraftSendResult> {
  const denied = await assertCompanyWritable(params.companyId)
  if (denied) throw new Error(denied.error)

  const rateOk = await checkAgenticSendRateLimit(params.companyId)
  if (!rateOk) {
    return { ok: false, error: 'rate_limited' }
  }

  const candidates = await findClientCandidates(supabase, params.companyId, params.clientQuery)
  if (candidates.length === 0) {
    return { ok: false, error: 'client_not_found' }
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      error: 'client_ambiguous',
      candidates: candidates.map((c) => c.name ?? ''),
    }
  }

  const client = candidates[0]!
  if (params.channel === 'email' && !client.email) {
    return { ok: false, error: 'no_recipient_email' }
  }
  if (params.channel === 'sms' && !client.phone) {
    return { ok: false, error: 'no_recipient_phone' }
  }

  let previewBody = params.body
  if (params.channel === 'sms') {
    const businessName = await resolveBusinessName(supabase, params.companyId)
    previewBody = `${businessName}: ${params.body}`
  }

  const recipient = params.channel === 'email' ? client.email! : client.phone!

  const created = await createSendConfirmation(supabase, {
    companyId: params.companyId,
    clientId: client.id,
    channel: params.channel,
    body: params.body,
    subject: params.subject,
    triggerSource: params.triggerSource,
    channelRef: params.channelRef ?? null,
  })

  return {
    ok: true,
    confirmationId: created.id,
    token: created.token,
    clientId: client.id,
    clientName: client.name,
    recipient,
    channel: params.channel,
    body: previewBody,
    subject: params.subject,
  }
}

/**
 * Module-private, shared by both public confirm-by-* entry points.
 * CLAIM-BEFORE-DISPATCH order (see file header): claim -> verify -> gate
 * -> dispatch. Never dispatches without a fresh `assertSendAllowed()`
 * permit; never calls `sendCustomerSms`/`sendCustomerEmail` directly — the
 * ONLY dispatch path is `sendCustomerMessage()` (Phase 177's funnel).
 */
async function finalizeConfirmedSend(
  supabase: SupabaseClient,
  pending: PendingSendConfirmation,
): Promise<ConfirmSendResult> {
  // 1. Atomic claim. A failed claim means another caller already resolved
  // this row (confirmed/refused/cancelled) — stop here, no further reads,
  // no gate check, no dispatch attempt.
  const claimed = await markConfirmed(supabase, pending.id)
  if (!claimed) {
    return { ok: false, error: 'already_processed' }
  }

  // 2. Structural integrity — a tampered row (stale hash) never reaches
  // the gate or dispatch, even though the claim already flipped its
  // status; markRefused overrides that to the correct terminal state.
  if (!verifyBinding(pending)) {
    await markRefused(supabase, pending.id)
    return { ok: false, error: 'integrity_error' }
  }

  // 3. Gate — a real, freshly-granted SendPermit is required before any
  // dispatch attempt.
  const gate = await assertSendAllowed(pending.companyId, pending.clientId, pending.channel)
  if (!gate.allowed || !gate.permit) {
    await markRefused(supabase, pending.id)
    return { ok: false, error: gate.reason ?? 'gate_denied' }
  }

  // 4. Dispatch through Phase 177's single funnel, never a channel
  // primitive directly. subject/body come from the STORED row, never
  // re-derived from any fresh LLM input at confirm time.
  const businessName = await resolveBusinessName(supabase, pending.companyId)
  const result = await dispatchCustomerMessage({
    permit: gate.permit,
    companyId: pending.companyId,
    clientId: pending.clientId,
    businessName,
    triggerSource: pending.triggerSource,
    freeform: { subject: pending.subject ?? undefined, body: pending.body },
  })

  return { ok: result.ok, error: result.error }
}

export async function confirmSendByChannelRef(
  supabase: SupabaseClient,
  companyId: string,
  channelRef: string,
): Promise<ConfirmSendResult> {
  const denied = await assertCompanyWritable(companyId)
  if (denied) throw new Error(denied.error)

  const pending = await resolvePendingByChannelRef(supabase, companyId, channelRef)
  if (!pending) {
    return { ok: false, error: 'not_found' }
  }
  return finalizeConfirmedSend(supabase, pending)
}

export async function confirmSendByToken(
  supabase: SupabaseClient,
  companyId: string,
  token: string,
): Promise<ConfirmSendResult> {
  const denied = await assertCompanyWritable(companyId)
  if (denied) throw new Error(denied.error)

  const pending = await resolveByToken(supabase, companyId, token)
  if (!pending) {
    return { ok: false, error: 'not_found' }
  }
  return finalizeConfirmedSend(supabase, pending)
}

export async function cancelSendByChannelRef(
  supabase: SupabaseClient,
  companyId: string,
  channelRef: string,
): Promise<{ ok: boolean }> {
  const denied = await assertCompanyWritable(companyId)
  if (denied) throw new Error(denied.error)

  const pending = await resolvePendingByChannelRef(supabase, companyId, channelRef)
  if (!pending) {
    return { ok: false }
  }
  await markCancelled(supabase, pending.id)
  return { ok: true }
}
