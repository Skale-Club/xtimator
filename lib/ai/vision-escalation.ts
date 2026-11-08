/**
 * lib/ai/vision-escalation.ts
 *
 * Phase 4b: Haiku-first photo vision with escalation to the Sonnet chat model.
 *
 * ACTIVE ONLY when the admin `vision` slot is set to a Haiku model. With the slot
 * unset (or Sonnet/Opus) the analyze-photos job keeps today's ladder untouched.
 *
 * Ladder in this mode (at most 3 calls per photo, usually 1):
 *   1. structured extraction on the Haiku slot model;
 *   2. if that call failed (zod, truncation, HTTP, no tool call) OR the result is
 *      weak (overall_description < 40 chars, or no measurements although
 *      trade_signals are present) -> ONE structured call on OR_DEFAULTS.chat;
 *   3. the prose path (no truncation retry) runs only when no structured result
 *      exists at all, i.e. Haiku failed AND the escalated call failed. A weak but
 *      valid Haiku result is kept when the escalation call itself fails: it is
 *      real data, and a prose description would not be better.
 *
 * Every call records its own cost row with its own `model`; the serving model and
 * the escalation reason are also sent to Langfuse as generation metadata.
 */
import {
  analyzePhotoStructuredOR,
  OR_DEFAULTS,
  type CostContext,
} from '@/lib/ai/openrouter-client'
import type { PhotoExtraction } from '@/lib/ai/photo-extraction-schema'

/** Descriptions shorter than this are treated as a weak extraction. */
export const MIN_OVERALL_DESCRIPTION_CHARS = 40

/** Why a structured result should be redone on the stronger model, or null when it is good. */
export function weakExtractionReason(e: PhotoExtraction): string | null {
  if (e.overall_description.trim().length < MIN_OVERALL_DESCRIPTION_CHARS) return 'short_description'
  if (e.measurements.length === 0 && e.trade_signals.length > 0) return 'empty_measurements_with_signals'
  return null
}

export type HaikuFirstResult = {
  extraction: PhotoExtraction | undefined
  /** Model that produced `extraction` (undefined when none did). */
  servedBy: string | undefined
  escalated: boolean
  escalationReason: string | null
}

export async function extractPhotoHaikuFirst(
  base64: string,
  mimeType: string,
  haikuModel: string,
  costContext?: CostContext,
  escalationModel: string = OR_DEFAULTS.chat
): Promise<HaikuFirstResult> {
  let haikuResult: PhotoExtraction | undefined
  let reason: string | null = null
  try {
    haikuResult = await analyzePhotoStructuredOR(base64, mimeType, haikuModel, costContext, {
      vision_mode: 'haiku_first',
      escalated: false,
    })
    reason = weakExtractionReason(haikuResult)
  } catch (err) {
    reason = err instanceof Error && err.name === 'InvalidPhotoExtractionError' ? 'schema_invalid' : 'structured_call_failed'
  }

  if (haikuResult && !reason) {
    console.info(`[analyze-photos] vision served by ${haikuModel} (no escalation)`)
    return { extraction: haikuResult, servedBy: haikuModel, escalated: false, escalationReason: null }
  }

  console.info(`[analyze-photos] vision escalating ${haikuModel} -> ${escalationModel} (${reason})`)
  try {
    const extraction = await analyzePhotoStructuredOR(base64, mimeType, escalationModel, costContext, {
      vision_mode: 'haiku_first',
      escalated: true,
      escalated_from: haikuModel,
      escalation_reason: reason,
    })
    return { extraction, servedBy: escalationModel, escalated: true, escalationReason: reason }
  } catch (err) {
    console.warn(
      '[analyze-photos] escalated structured extraction failed:',
      err instanceof Error ? err.message : String(err)
    )
    // Keep a valid-but-weak Haiku result; otherwise the caller falls to prose.
    return haikuResult
      ? { extraction: haikuResult, servedBy: haikuModel, escalated: true, escalationReason: reason }
      : { extraction: undefined, servedBy: undefined, escalated: true, escalationReason: reason }
  }
}
