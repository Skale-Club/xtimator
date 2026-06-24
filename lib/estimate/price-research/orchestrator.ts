import 'server-only'
/**
 * lib/estimate/price-research/orchestrator.ts
 *
 * THE PAYOFF (Phase 108) — `researchUnmatchedPrices(sections, ctx)`.
 *
 * Channel-neutral (ENGINE-01): this module imports NOTHING from any channel package.
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
import { getPriceResearchProvider, isUsableCandidate } from './provider'
import { get as cacheGet, put as cachePut } from './cache'
import { checkQuota, recordUsage } from '@/lib/quota'
import { normalizeServiceNameKey, normalizeRegion } from './normalize'

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

/** True when a unit_price is a finite, strictly-positive number (a real price). */
function isPriced(unit_price: number): boolean {
  return typeof unit_price === 'number' && Number.isFinite(unit_price) && unit_price > 0
}

/** Count items whose unit_price is not a finite positive number (the $0 risk set). */
function countFlaggedUnpriced(sections: EstimateSectionOutput[]): number {
  let n = 0
  for (const section of sections) {
    for (const item of section.items) {
      if (!isPriced(item.unit_price)) n++
    }
  }
  return n
}

/**
 * Build the metering idempotency key for a single research SEARCH (Warning-#1 fix).
 *
 * The seed is per-generation-attempt (`attemptId`) when supplied — retry-stable for
 * the SAME attempt, distinct across estimates so research is not under-metered across
 * estimates. Falls back to a PROJECT-scoped seed (`projectId`), then a company-scoped
 * seed. A finer-than-company seed is safe because a repeat of the same service+region
 * within the cache TTL is a HIT (which consumes NO allowance regardless of the seed).
 */
function buildIdemKey(ctx: ResearchContext, name: string): string {
  const seed = ctx.attemptId ?? ctx.projectId ?? ctx.companyId
  return `${seed}:research:${normalizeServiceNameKey(name)}:${normalizeRegion(ctx.region)}`
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

    // Staged re-tags: candidate item reference → its rewritten 'researched' item.
    // Items absent from this map are returned untouched (price_book, owner-edited,
    // and ai_estimate items the research could not improve all stay as-is).
    const retag = new Map<LineItemOutput, LineItemOutput>()

    // --- Step 1: cache pass (a HIT is free — no provider call, no allowance) ---
    const misses: LineItemOutput[] = []
    for (const item of candidates) {
      let cached = null
      try {
        cached = await cacheGet(ctx.companyId, item.description, ctx.region, ctx.currency)
      } catch {
        cached = null // a cache read failure degrades to a MISS, never throws
      }
      if (cached && isPriced(cached.unit_price)) {
        retag.set(item, { ...item, unit_price: cached.unit_price, price_source: 'researched' as const })
      } else {
        misses.push(item)
      }
    }

    // --- Step 2: gated, batched provider pass for the misses ---
    if (misses.length > 0) {
      // Over-allowance SKIPS the provider for the whole miss set (RMETER-03). The
      // misses keep ai_estimate; the call still returns sections (never hard-fails).
      const quota = await checkQuota(ctx.supabase, ctx.companyId, 'price_research')
      if (quota.allowed) {
        const provider = await getPriceResearchProvider()
        // Unconfigured provider (null) → misses keep ai_estimate (safe no-op).
        if (provider) {
          const results = await provider.lookup(
            misses.map((m) => ({ name: m.description })),
            ctx.region,
            ctx.currency
          )

          // Re-associate each result to its requested item by name.
          const byName = new Map<string, LineItemOutput>()
          for (const m of misses) byName.set(m.description, m)

          for (const result of results) {
            const item = byName.get(result.name)
            if (!item) continue

            // Meter once per searched item (idempotent — RMETER-01). A cache HIT
            // never reaches here, so a hit consumes no allowance.
            try {
              await recordUsage(ctx.supabase, ctx.companyId, 'price_researched', 1, buildIdemKey(ctx, result.name))
            } catch {
              // Metering is best-effort; a ledger error must not drop the price.
            }

            // EVIDENCE GATE (RPRICE-04): re-tag 'researched' ONLY with a usable,
            // cited, positive price; otherwise the item KEEPS ai_estimate (no put).
            if (isUsableCandidate(result) && typeof result.unit_price === 'number') {
              retag.set(item, { ...item, unit_price: result.unit_price, price_source: 'researched' as const })
              try {
                await cachePut({
                  companyId: ctx.companyId,
                  name: result.name,
                  region: ctx.region,
                  currency: ctx.currency,
                  datum: { unit_price: result.unit_price, source: result.source_url, confidence: result.confidence },
                })
              } catch {
                // A cache write failure must not break the (already staged) re-tag.
              }
            }
          }
        }
      }
    }

    // --- Step 3: apply the staged re-tags to an immutable section tree ---
    const rewritten: EstimateSectionOutput[] =
      retag.size === 0
        ? sections
        : sections.map((section) => ({
            ...section,
            items: section.items.map((item) => retag.get(item) ?? item),
          }))

    // --- Step 4: never-$0 ladder — count items still at unit_price<=0 ---
    // price_book is never $0 by definition; researched is >0 by the evidence gate;
    // the only $0 risk is an ai_estimate item priced at 0 with no research improvement.
    // Those FLAGGED UNPRICED items keep ai_estimate (not mutated, not dropped).
    return { sections: rewritten, flaggedUnpriced: countFlaggedUnpriced(rewritten) }
  } catch {
    // NEVER-THROWS: return the original sections + a best-effort flagged count.
    try {
      return { sections, flaggedUnpriced: countFlaggedUnpriced(sections) }
    } catch {
      return { sections, flaggedUnpriced: 0 }
    }
  }
}
