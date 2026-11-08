/**
 * lib/estimate/pricing/resolve-prices.ts
 *
 * The ONE line-price pipeline shared by generate (lib/services/generate-estimate.ts)
 * and refine (lib/estimate/graph/nodes/refine.ts). Order of precedence, strongest
 * first, exactly as generation always ran it:
 *
 *   1. demote: a model may never claim 'price_book' / 'researched' / 'company_history'
 *      (only the server assigns them) -> 'ai_estimate'
 *   2. price book anchoring + out-of-bounds clamp (re-tags real matches 'price_book')
 *   3. company history (median of the company's ACCEPTED estimates)
 *   4. web price research for what is still 'ai_estimate' (never resolves to $0)
 *   5. exact-duplicate dedupe (only when the caller supplies `totalCeiling`)
 *
 * NEVER throws: every stage that can fail degrades to the previous stage's sections,
 * so a pricing failure can never fail a generation or a refine.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstimateSectionOutput } from '@/lib/ai/types'
import { anchorAndClampSections, type AnchorBookRow } from '@/lib/ai/price-anchoring'
import type { Playbook } from '@/lib/ai/playbooks/types'
import {
  ceilingInCurrency,
  isPriceBandsEnabled,
  priceOutsideBand,
} from '@/lib/estimate/pricing/price-bands'
import { researchUnmatchedPrices } from '@/lib/estimate/price-research/orchestrator'
import {
  applyCompanyHistory,
  historyCandidateKeys,
  loadCompanyHistory,
} from '@/lib/estimate/pricing/company-history'
import {
  checkEstimateConsistency,
  type ConsistencyFlag,
} from '@/lib/estimate/quality/consistency'

export type ResearchTelemetry = {
  candidates: number
  cacheHits: number
  providerUsable: number
  missed: number
}

export interface ResolvePricesProgress {
  candidates: number
  itemCount: number
  sectionCount: number
  /** Present only on the exit report, once research has resolved. */
  researched?: number
}

export interface ResolvePricesOptions {
  companyId: string // trusted, never LLM-derived
  currencyCode: string
  /**
   * Already company-scoped and currency-filtered by the caller. `unit`, `pricing_type`,
   * `price_per_unit` and `minimum_price` are optional: when present they are passed to anchoring
   * (area_based rows with unit_price 0 stop anchoring a $0 line; the unit check is flagged).
   */
  priceBookItems: AnchorBookRow[]
  region: { city: string | null; state: string | null }
  supabase: SupabaseClient
  attemptId?: string
  /** Fallback metering seed when no attemptId exists. */
  projectId?: string
  /**
   * When set, exact-duplicate lines are collapsed (AIREL-04) against this absurdity
   * ceiling. Omit to skip the dedupe (refine does: it works on a partial line set).
   */
  totalCeiling?: number
  /**
   * ESTIMATOR_PRICE_BANDS (flagged): the trade playbook the estimate was drafted under. When it
   * has `priceBands`, a model or researched price outside its band gets confidence 'low' (the
   * price is never changed). Omit to skip the check.
   */
  playbook?: Pick<Playbook, 'priceBands'> | null
  /** Phase narration hook; called at pricing entry and again after research. */
  onProgress?: (progress: ResolvePricesProgress) => void
}

export interface ResolvePricesResult {
  sections: EstimateSectionOutput[]
  anchoredCount: number
  clampedCount: number
  historyAppliedCount: number
  flaggedUnpriced: number
  /** Undefined until research ran; stays undefined on a research failure ("no data, no alarm"). */
  researchTelemetry: ResearchTelemetry | undefined
  /** Duplicate / qty-0 flags from the dedupe pass (empty when dedupe is skipped). */
  consistencyFlags: ConsistencyFlag[]
}

const SERVER_ONLY_SOURCES = new Set(['price_book', 'researched', 'company_history'])

/** Demote any server-only price_source claimed by the model to 'ai_estimate'. */
export function demoteModelPriceSources(sections: EstimateSectionOutput[]): EstimateSectionOutput[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) =>
      SERVER_ONLY_SOURCES.has(item.price_source as string)
        ? { ...item, price_source: 'ai_estimate' as const }
        : item
    ),
  }))
}

function countCandidates(sections: EstimateSectionOutput[]): number {
  return sections.reduce(
    (n, section) => n + section.items.filter((item) => item.price_source === 'ai_estimate').length,
    0
  )
}

export async function resolveLinePrices(
  sections: EstimateSectionOutput[],
  opts: ResolvePricesOptions
): Promise<ResolvePricesResult> {
  // GUARD-02: demote + anchor + clamp. Non-fatal (pure, but defended anyway).
  let guardedSections = sections
  let anchoredCount = 0
  let clampedCount = 0
  let historyAppliedCount = 0
  try {
    const bands = isPriceBandsEnabled()
    const anchored = anchorAndClampSections(
      demoteModelPriceSources(sections),
      opts.priceBookItems.map((p) => ({
        name: p.name,
        unit_price: p.unit_price,
        unit: p.unit,
        pricing_type: p.pricing_type,
        price_per_unit: p.price_per_unit,
        minimum_price: p.minimum_price,
      })),
      bands ? { compareUnits: true, currencyCode: opts.currencyCode } : {}
    )
    anchoredCount = anchored.anchoredCount
    clampedCount = anchored.clampedCount

    // SEED-057 E3: company history beats research and the model, loses to the price book.
    const history = await loadCompanyHistory(
      opts.supabase,
      opts.companyId,
      opts.currencyCode,
      historyCandidateKeys(anchored.sections)
    )
    const applied = applyCompanyHistory(anchored.sections, history)
    historyAppliedCount = applied.applied
    guardedSections = applied.sections
    if (historyAppliedCount > 0) {
      console.info('[company_history]', { companyId: opts.companyId, applied: historyAppliedCount })
    }
  } catch (err) {
    console.warn('[resolve-prices] anchoring/history failed (non-fatal)', err)
  }

  let researchedSections = guardedSections
  let flaggedUnpriced = 0
  let researchTelemetry: ResearchTelemetry | undefined

  const candidates = countCandidates(guardedSections)
  const itemCount = guardedSections.reduce((n, s) => n + s.items.length, 0)
  const sectionCount = guardedSections.length
  try {
    opts.onProgress?.({ candidates, itemCount, sectionCount })
  } catch {
    // narration must never break pricing
  }

  try {
    const research = await researchUnmatchedPrices(guardedSections, {
      companyId: opts.companyId,
      region: opts.region,
      currency: opts.currencyCode,
      supabase: opts.supabase,
      projectId: opts.projectId,
      attemptId: opts.attemptId ?? undefined,
    })
    researchedSections = research.sections
    flaggedUnpriced = research.flaggedUnpriced
    researchTelemetry = research.telemetry
    if (researchTelemetry) {
      try {
        opts.onProgress?.({
          candidates: researchTelemetry.candidates,
          researched: researchTelemetry.cacheHits + researchTelemetry.providerUsable,
          itemCount,
          sectionCount,
        })
      } catch {
        // narration must never break pricing
      }
    }
  } catch (err) {
    // Non-fatal: keep the pre-research sections.
    console.warn('[generate-estimate] price research failed (non-fatal)', err)
  }

  // ESTIMATOR_PRICE_BANDS: low confidence on lines whose model/researched price is outside the
  // playbook band. Never changes a price.
  if (opts.playbook?.priceBands?.length && isPriceBandsEnabled()) {
    try {
      researchedSections = markOutOfBandLines(researchedSections, opts.playbook, opts.currencyCode)
    } catch (err) {
      console.warn('[resolve-prices] playbook bands failed (non-fatal)', err)
    }
  }

  if (opts.totalCeiling === undefined) {
    return {
      sections: researchedSections,
      anchoredCount,
      clampedCount,
      historyAppliedCount,
      flaggedUnpriced,
      researchTelemetry,
      consistencyFlags: [],
    }
  }

  // AIREL-04: collapse exact-duplicate lines (computedTotal 0: the over-ceiling verdict
  // is the caller's, against the real server grand total).
  // `totalCeiling` is a USD figure; flagged, it is converted for a non-USD estimate (approximate).
  const consistency = checkEstimateConsistency(researchedSections, 0, {
    totalCeiling: ceilingInCurrency(opts.totalCeiling, opts.currencyCode),
  })
  return {
    sections: consistency.sections as unknown as EstimateSectionOutput[],
    anchoredCount,
    clampedCount,
    historyAppliedCount,
    flaggedUnpriced,
    researchTelemetry,
    consistencyFlags: consistency.flags,
  }
}

/**
 * Set confidence 'low' on every model/researched line priced outside its playbook band. The price,
 * price_source and every other field are untouched. Pure.
 */
export function markOutOfBandLines(
  sections: EstimateSectionOutput[],
  playbook: Pick<Playbook, 'priceBands'>,
  currencyCode: string
): EstimateSectionOutput[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((item) =>
      priceOutsideBand(playbook, item, currencyCode) ? { ...item, confidence: 'low' as const } : item
    ),
  }))
}
