/**
 * lib/estimate/project-status.ts
 *
 * The single rule that decides whether a freshly persisted estimate leaves the project in
 * `estimate_ready` or in the non-destructive `awaiting_details` recourse state. Shared by
 * normal generation (lib/services/generate-estimate.ts) and the Phase 4d patch-refine
 * persistence (lib/services/persist-patched-estimate.ts) so both surfaces agree.
 *
 * flag > block (adaptive-first): the estimate stays current and editable either way; the owner
 * is just prompted to review.
 */
import type { EstimateSectionOutput } from '@/lib/ai/types'
import { ceilingInCurrency } from '@/lib/estimate/pricing/price-bands'

/**
 * AIREL-04 (audit C4) — absurdity ceiling on the computed grand total, in USD. Env-at-the-boundary
 * (`ESTIMATE_TOTAL_CEILING_USD`); a malformed/non-positive value falls back to the default.
 *
 * The default MUST sit ABOVE the existing $1M PER-UNIT price-anchoring clamp
 * (UNIT_PRICE_CEILING, lib/ai/price-anchoring.ts) and real remodel jobs routinely exceed $250k:
 * this catches hallucinations only, not a business-realistic cap.
 */
export const DEFAULT_ESTIMATE_TOTAL_CEILING_USD = 2_000_000
export function resolveEstimateTotalCeiling(): number {
  const raw = Number(process.env.ESTIMATE_TOTAL_CEILING_USD)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_ESTIMATE_TOTAL_CEILING_USD
}

/** Count lines whose unit_price is not a finite positive number (the unpriced risk set). */
export function countUnpricedLines(sections: EstimateSectionOutput[]): number {
  let n = 0
  for (const section of sections) {
    for (const item of section.items) {
      const p = item.unit_price
      if (!(typeof p === 'number' && Number.isFinite(p) && p > 0)) n++
    }
  }
  return n
}

/**
 * `awaiting_details` when an unpriced line sits in an estimate that still has real value
 * (total > 0), or when the grand total is over the absurdity ceiling (already in the estimate's
 * currency); otherwise `estimate_ready`.
 */
export function resolveProjectStatusAfterEstimate(args: {
  flaggedUnpriced: number
  grandTotal: number
  ceilingLocal: number
}): { status: 'awaiting_details' | 'estimate_ready'; overCeiling: boolean } {
  const overCeiling = args.grandTotal > args.ceilingLocal
  const status =
    (args.flaggedUnpriced > 0 && args.grandTotal > 0) || overCeiling ? 'awaiting_details' : 'estimate_ready'
  return { status, overCeiling }
}

/** Convenience for callers that only have the sections and the total (the patch path). */
export function resolveProjectStatusForSections(
  sections: EstimateSectionOutput[],
  grandTotal: number,
  currencyCode: string | null | undefined
) {
  const ceilingLocal = ceilingInCurrency(resolveEstimateTotalCeiling(), currencyCode)
  return {
    ...resolveProjectStatusAfterEstimate({
      flaggedUnpriced: countUnpricedLines(sections),
      grandTotal,
      ceilingLocal,
    }),
    ceilingLocal,
  }
}
