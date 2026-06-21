/**
 * lib/estimate/failure.ts
 *
 * HARD-04 — the SINGLE typed failure model for the estimate engine.
 *
 * One `FailureReason` union is the source of truth that BOTH sides derive from:
 *   - the HTTP boundary, via `failureReasonToXtimatorError(reason, detail?)` →
 *     `XtimatorError` on surface 'estimates' (status from `statusByType`, unchanged);
 *   - the channel adapters, via `failureReasonToChannelCopy(reason)` → the human
 *     reply string for WhatsApp/default.
 *
 * This module lives under `lib/estimate/` (next to its only readers — the graph
 * state + adapters) so `lib/errors/` never has to depend on `lib/estimate/`.
 * It only IMPORTS `XtimatorError`/`ErrorType`; it introduces no parallel error class.
 */
import { XtimatorError } from '@/lib/errors'
import type { ErrorType } from '@/lib/errors/codes'

/**
 * The typed failure vocabulary. STRICT SUPERSET of the only two values produced
 * today (`'generation_failed'` at generate.ts, `'no_usable_input'` at whatsapp.ts:323)
 * so the string→union migration is behavior-preserving.
 *
 * Option A (research §"no_usable_input vs no_input"): we KEEP `'no_usable_input'`
 * verbatim — NOT CONTEXT's illustrative `'no_input'` — so the single producer
 * (whatsapp.ts ingest) and the presence-based onError reader need zero string change.
 */
export type FailureReason =
  | 'no_usable_input' // KEEP exact (producer: lib/estimate/adapters/whatsapp.ts:323)
  | 'transcription_failed'
  | 'vision_failed'
  | 'generation_failed' // KEEP exact (producer: lib/estimate/graph/nodes/generate.ts)
  | 'invalid_output' // DEFINED here, PRODUCED in Phase 100 (GUARD-01)
  | 'provider_unavailable' // set when callWithFallback re-throws (both providers down)

/**
 * FailureReason → ErrorType. Surface is always 'estimates'. Statuses are additive
 * (no contract break): no_usable_input→400, transcription/vision/generation/invalid
 * →500, provider_unavailable→503 (offline).
 */
const REASON_TO_TYPE: Record<FailureReason, ErrorType> = {
  no_usable_input: 'bad_request',
  transcription_failed: 'internal',
  vision_failed: 'internal',
  generation_failed: 'internal',
  invalid_output: 'internal',
  provider_unavailable: 'offline',
}

/**
 * Map a FailureReason to the canonical HTTP-boundary error. Used wherever a graph
 * failure must surface as a typed JSON response (`asResponse` consumes it).
 */
export function failureReasonToXtimatorError(
  reason: FailureReason,
  detail?: string
): XtimatorError {
  return new XtimatorError(REASON_TO_TYPE[reason], 'estimates', detail ?? reason, undefined, {
    reason,
  })
}

/**
 * Human reply copy per reason, sourced by both channel adapters' onError.
 *
 * For `generation_failed` and `no_usable_input` these are the EXACT strings the
 * WhatsApp adapter shipped before unification (regression-gated by
 * channel-adapter.test.ts — do NOT edit them). The other reasons get clear English
 * fallbacks. `_language` is a forward seam (i18n deferred); default English.
 */
const REASON_TO_COPY: Record<FailureReason, string> = {
  generation_failed:
    "Sorry, I hit a problem generating your estimate. Please try again in a moment — if it keeps happening, describe the job in a text message.",
  no_usable_input:
    "Sorry, I couldn't process your message. Please describe the job in a text message and I'll generate an estimate for you.",
  transcription_failed:
    "Sorry, I couldn't process your message. Please describe the job in a text message and I'll generate an estimate for you.",
  vision_failed:
    "Sorry, I couldn't process your message. Please describe the job in a text message and I'll generate an estimate for you.",
  invalid_output:
    "Sorry, I hit a problem generating your estimate. Please try again in a moment — if it keeps happening, describe the job in a text message.",
  provider_unavailable:
    "Sorry, our estimating service is briefly unavailable. Please try again in a moment.",
}

export function failureReasonToChannelCopy(
  reason: FailureReason,
  _language?: 'en' | 'pt' | 'es'
): string {
  return REASON_TO_COPY[reason]
}
