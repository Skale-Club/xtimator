import 'server-only'
/**
 * lib/whatsapp/credits.ts
 *
 * Phase 2a: credit debits for AI work started from WhatsApp. Mirrors the web
 * paths (lib/inngest/functions/transcribe-audio.ts, analyze-photos.ts,
 * generate-estimate.ts, app/api/chat/route.ts): the real cost is recorded in
 * ai_cost_events, read back (or taken from the meter), and debited ONCE through
 * recordCreditDebit with the standard `${attemptId}:debit:${op}` idempotency key.
 *
 * BYOK companies and billing_config.meteredOperations are honoured centrally by
 * recordCreditDebit (BYOK -> no debit). Debits RECORD only; blocking on
 * billing_config.enforcementEnabled stays with checkCredits, as on the web.
 *
 * Attempt ids: ai_cost_events.attempt_id is a UUID column, so every WhatsApp
 * attempt id is a DETERMINISTIC UUID derived from a stable WhatsApp id:
 *   - per inbound message (wamid)   -> waAttemptId(wamid)         audio / photo / chat
 *   - per estimate batch (batchKey) -> waGenerationAttemptId(key) estimate (+ price research)
 * The same wamid always yields the same attempt id and so the same debit key:
 * an Inngest retry, or the router and the CREATE graph both reading the same
 * voice note, can never debit twice.
 *
 * Never throws: metering must not break the reply to the owner. The credit
 * ledger and cost recorder are loaded lazily so importing this module is cheap.
 */
import { createHash } from 'node:crypto'
import { requireServiceClient } from '@/lib/supabase/service'
import type { WhatsAppCostMeter } from '@/lib/whatsapp/cost-meter'

const NAMESPACE = 'xtimator:whatsapp-credits:v1'
const READBACK_ATTEMPTS = 3
const READBACK_DELAY_MS = 150

/** Deterministic RFC-4122 (v5-style) UUID from a seed string. */
function deterministicUuid(seed: string): string {
  const bytes = Uint8Array.from(
    createHash('sha1').update(`${NAMESPACE}:${seed}`).digest().subarray(0, 16)
  )
  bytes[6] = (bytes[6] & 0x0f) | 0x50
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Buffer.from(bytes).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

/** Attempt id for everything one inbound message costs (Whisper, vision, chat). */
export function waAttemptId(wamid: string): string {
  return deterministicUuid(`wa:${wamid}`)
}

/** Attempt id for one estimate-generation batch (whatsapp-process event batchKey). */
export function waGenerationAttemptId(batchKey: string): string {
  return deterministicUuid(`wa-gen:${batchKey}`)
}

/**
 * Sum the real cost recorded for `attemptId` under the given operation types.
 * Bounded read-back (3 x 150ms) covers a not-yet-committed row, exactly like the
 * web jobs; an absent or all-null result is null (recordCreditDebit then no-ops).
 */
async function readCostUsd(attemptId: string, operationTypes: string[]): Promise<number | null> {
  const svc = requireServiceClient()
  for (let i = 0; i < READBACK_ATTEMPTS; i++) {
    const { data } = await svc
      .from('ai_cost_events')
      .select('real_cost_usd')
      .eq('attempt_id', attemptId)
      .in('operation_type', operationTypes)
    const rows = (data ?? []) as { real_cost_usd: number | null }[]
    if (rows.length > 0) {
      const known = rows.map((r) => r.real_cost_usd).filter((c): c is number => c != null)
      return known.length > 0 ? known.reduce((a, b) => a + b, 0) : null
    }
    await new Promise((r) => setTimeout(r, READBACK_DELAY_MS))
  }
  return null
}

/**
 * Debit the transcription ('audio_minutes') or vision ('photo_batch') spend of
 * ONE inbound WhatsApp media message. Call only after the media was read OK.
 * Key: `${waAttemptId(wamid)}:debit:audio_minutes|photo_batch`.
 */
export async function debitWhatsAppMedia(input: {
  companyId: string
  wamid: string
  kind: 'audio' | 'photo'
}): Promise<void> {
  try {
    const { recordCreditDebit } = await import('@/lib/billing/credit-ledger')
    const attemptId = waAttemptId(input.wamid)
    const audio = input.kind === 'audio'
    const realCostUsd = await readCostUsd(attemptId, [audio ? 'audio_minutes' : 'vision'])
    await recordCreditDebit({
      companyId: input.companyId,
      operationType: audio ? 'audio_minutes' : 'photo_batch',
      realCostUsd,
      attemptId,
    })
  } catch (err) {
    console.warn('[whatsapp-credits] media debit skipped:', err instanceof Error ? err.message : err)
  }
}

/**
 * Debit the 'estimate' spend of one WhatsApp generation batch. Same read-back as
 * generate-estimate.ts: 'estimate' + 'estimate_retry' rows only (price research
 * debits itself from the orchestrator; audio/vision rows live under per-message
 * attempt ids). Key: `${attemptId}:debit:estimate`.
 */
export async function debitWhatsAppEstimate(input: {
  companyId: string
  attemptId: string
}): Promise<void> {
  try {
    const { recordCreditDebit } = await import('@/lib/billing/credit-ledger')
    const realCostUsd = await readCostUsd(input.attemptId, ['estimate', 'estimate_retry'])
    await recordCreditDebit({
      companyId: input.companyId,
      operationType: 'estimate',
      realCostUsd,
      attemptId: input.attemptId,
    })
  } catch (err) {
    console.warn('[whatsapp-credits] estimate debit skipped:', err instanceof Error ? err.message : err)
  }
}

/**
 * Settle the LangChain assistant calls (intent classifier, edit/QUERY/MANAGE
 * agents) of one inbound message: ONE 'chat' cost row + ONE 'chat' debit, like
 * app/api/chat/route.ts does per turn. No LLM call -> nothing recorded (pending
 * send replies, deterministic confirmations). Key: `${waAttemptId(wamid)}:debit:chat`.
 */
export async function settleWhatsAppChat(input: {
  companyId: string
  wamid: string
  meter: WhatsAppCostMeter
}): Promise<void> {
  try {
    if (input.meter.calls === 0) return
    const [{ recordCreditDebit }, { recordAICost }] = await Promise.all([
      import('@/lib/billing/credit-ledger'),
      import('@/lib/billing/record-ai-cost'),
    ])
    const attemptId = waAttemptId(input.wamid)
    const realCostUsd = input.meter.costUsd
    await recordAICost({
      attemptId,
      operationType: 'chat',
      provider: 'openrouter',
      realCostUsd,
      companyId: input.companyId,
      model: input.meter.model,
    })
    await recordCreditDebit({
      companyId: input.companyId,
      operationType: 'chat',
      realCostUsd,
      attemptId,
    })
  } catch (err) {
    console.warn('[whatsapp-credits] chat settle skipped:', err instanceof Error ? err.message : err)
  }
}
