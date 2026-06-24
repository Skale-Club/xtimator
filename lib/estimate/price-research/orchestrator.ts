import 'server-only'
/**
 * lib/estimate/price-research/orchestrator.ts
 *
 * THE PAYOFF (Phase 108) — `researchUnmatchedPrices(sections, ctx)`.
 *
 * Channel-neutral (ENGINE-01): this module imports NOTHING from `lib/whatsapp`.
 * NEVER-THROWS: any cache/provider/quota error is swallowed and the INPUT sections
 * are returned unchanged (mirrors `anchorAndClampSections`'s non-fatal contract —
 * a research failure must never break estimate generation).
 *
 * What it does (composition of Phase 106 cache + Phase 107 provider + 108-01 quota):
 *   1. Candidate set = post-anchor items still tagged `ai_estimate`. `price_book`
 *      (authoritative) and owner-edited (price_source null) items are NEVER touched
 *      — RPRICE-03 runtime precedence (price_book > researched > ai_estimate).
 *   2. cache.get HIT (positive price) → re-tag `researched` with the cached price
 *      (NO provider call, NO allowance consumed — a hit is free).
 *   3. cache MISS + checkQuota('price_research') allowed → ONE batched provider.lookup
 *      for the miss set; each result is metered via recordUsage (idempotent), then
 *      EVIDENCE-GATED (RPRICE-04): only `isUsableCandidate` results are re-tagged
 *      `researched` + cache.put. An unevidenced result KEEPS `ai_estimate` (no put).
 *   4. Over-allowance (checkQuota allowed:false) SKIPS the provider for the whole
 *      miss set (items keep `ai_estimate`); the call still returns sections (RMETER-03).
 *   5. NEVER-$0 ladder (RFALL-01): an item that still resolves to unit_price<=0 after
 *      research (model gave $0 / no evidence / over-quota) is COUNTED in
 *      `flaggedUnpriced` — it KEEPS `ai_estimate` and is never silently dropped nor
 *      mutated to a fake price. The integration (108-04) routes a flaggedUnpriced>0
 *      estimate to the EXISTING `awaiting_details` surfacing while still persisting
 *      the priced lines (and only when total>0, per the 108-02 vagueness gate).
 *
 * The FLAGGED-UNPRICED MECHANISM (Claude's discretion, per CONTEXT + Task 1):
 *   We do NOT invent a new `price_source` enum value (the DB CHECK is
 *   price_book|ai_estimate|researched only — Phase 105). Instead, a $0-resolved item
 *   KEEPS its `ai_estimate` tag and its (possibly non-zero) model unit_price, and the
 *   only signal threaded out is the `flaggedUnpriced` COUNT in `ResearchOutcome`. The
 *   integration sets `awaiting_details` when `flaggedUnpriced > 0 AND total > 0`,
 *   which is exactly what the refined 108-02 vagueness gate already permits (a
 *   partially-priced estimate is not vague). This keeps the orchestrator
 *   DB-schema-neutral and reuses the existing recourse path with zero new state.
 */
import type { EstimateSectionOutput, LineItemOutput } from '@/lib/ai/types'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Context supplied by the caller (generate-estimate.ts, in 108-04). Region/currency/
 * companyId are caller-supplied, NEVER read from model output (multi-tenant invariant).
 */
export interface ResearchContext {
  companyId: string
  region: { city: string | null; state: string | null }
  currency: string
  /** Service-role client passed by generate-estimate.ts — REUSE, do not create. */
  supabase: SupabaseClient
  /**
   * Per-generation-attempt token for the metering idempotency key. When supplied by
   * the caller, the key is `${attemptId}:research:${normName}:${region}` — stable
   * across an Inngest retry of the SAME attempt, distinct across estimates.
   *
   * When absent (caller cannot supply a real attempt token yet), we fall back to a
   * PROJECT-scoped seed via {@link ResearchContext.projectId} → company-scoped seed.
   * A project-scoped seed is finer than a company-scoped one and the cache-overlap is
   * benign: a repeat of the same service+region within the TTL is a cache HIT anyway,
   * so it consumes NO allowance regardless of the seed (see the Warning-#1 rationale).
   */
  attemptId?: string
  /** Project-scoped fallback seed for the idempotency key when attemptId is absent. */
  projectId?: string
}

export interface ResearchOutcome {
  sections: EstimateSectionOutput[]
  /**
   * Count of items that resolved to unit_price<=0 after the research pass (no
   * price_book / researched / non-zero ai_estimate). The integration routes a
   * flaggedUnpriced>0 (with total>0) estimate to awaiting_details.
   */
  flaggedUnpriced: number
}

/** Count items whose unit_price is not a finite positive number (the $0 risk set). */
function countFlaggedUnpriced(sections: EstimateSectionOutput[]): number {
  let n = 0
  for (const section of sections) {
    for (const item of section.items) {
      if (!(typeof item.unit_price === 'number' && Number.isFinite(item.unit_price) && item.unit_price > 0)) {
        n++
      }
    }
  }
  return n
}

/**
 * Research the post-anchor `ai_estimate` items against the tenant cache + the gated
 * provider, evidence-gate the re-tag, meter each search, and never resolve to $0.
 * NEVER throws — any error returns the input sections + a best-effort flagged count.
 */
export async function researchUnmatchedPrices(
  sections: EstimateSectionOutput[],
  ctx: ResearchContext
): Promise<ResearchOutcome> {
  try {
    // Candidate set: items still tagged 'ai_estimate' after anchoring. price_book +
    // owner-edited (price_source null) items are out of scope (RPRICE-03 precedence).
    const candidates: LineItemOutput[] = []
    for (const section of sections) {
      for (const item of section.items) {
        if (item.price_source === 'ai_estimate') candidates.push(item)
      }
    }

    // No candidates → return byte-identical sections; the provider is never touched.
    if (candidates.length === 0) {
      return { sections, flaggedUnpriced: countFlaggedUnpriced(sections) }
    }

    // The cache/provider/metering body lands in Task 2. Until then the contract is
    // a safe no-op: nothing is re-tagged, and the flagged count reflects any
    // pre-existing $0 ai_estimate items so the integration signal already works.
    return { sections, flaggedUnpriced: countFlaggedUnpriced(sections) }
  } catch {
    // NEVER-THROWS: return the original sections + a best-effort flagged count.
    try {
      return { sections, flaggedUnpriced: countFlaggedUnpriced(sections) }
    } catch {
      return { sections, flaggedUnpriced: 0 }
    }
  }
}
