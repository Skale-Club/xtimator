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
import { getPriceResearchProviderChain, isUsableCandidate } from './provider'
import { get as cacheGet, put as cachePut } from './cache'
import { checkQuota, recordUsage } from '@/lib/quota'
import { recordCreditDebit } from '@/lib/billing/credit-ledger'
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
  /**
   * WI-1 (HARDEN-OBS-01): OPTIONAL attempted-vs-usable research telemetry. Surfaces the
   * true research demand (candidates) versus what was actually usable (cacheHits +
   * providerUsable) so a degraded provider — a low providerUsable/candidates hit-rate —
   * becomes observable. STRICTLY ADDITIVE: every existing caller and all orchestrator
   * tests ignore it and keep passing. Absent on the never-throw catch paths (optional).
   *   - candidates      = true demand (post-anchor ai_estimate set size, pre-cap).
   *   - cacheHits        = items re-tagged 'researched' from a cache HIT (free, no provider).
   *   - providerUsable   = items re-tagged 'researched' via an evidence-gated provider/memo result.
   *   - missed           = candidates − cacheHits − providerUsable (stayed ai_estimate), floored 0.
   */
  telemetry?: { candidates: number; cacheHits: number; providerUsable: number; missed: number }
}

/**
 * COST/LATENCY BOUND (Phase 109): research at most this many unmatched items per
 * estimate. Mirrors AUTO_REFINE_MAX_ATTEMPTS (decide.ts) EXACTLY — env-overridable,
 * a malformed/non-positive value falls back to the default. Items beyond the cap KEEP
 * their non-zero ai_estimate price (never $0) and NEVER reach the provider; the dropped
 * count is LOGGED (no silent truncation). Default 25 (a sane worst-case per estimate).
 */
const MAX_RESEARCH_ITEMS_PER_ESTIMATE = (() => {
  const raw = Number(process.env.MAX_RESEARCH_ITEMS_PER_ESTIMATE)
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 25
})()

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
 * IN-RUN MEMO KEY (Phase 109): `${normName}@@${region}` — the same normalized
 * (name, region) derivation the cache uses. The memo is a per-CALL `Map` (see below):
 * within a single generation run the Phase-96 auto-refine loop re-invokes generate in
 * the SAME process, so a second pass over the same item is a memo HIT — it pays NO
 * provider call and NO allowance. It is a plain Map; lookups never throw.
 */
function buildMemoKey(region: ResearchContext['region'], name: string): string {
  return `${normalizeServiceNameKey(name)}@@${normalizeRegion(region)}`
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
      return {
        sections,
        flaggedUnpriced: countFlaggedUnpriced(sections),
        telemetry: { candidates: 0, cacheHits: 0, providerUsable: 0, missed: 0 },
      }
    }

    // --- Cost-control CAP (Phase 109): research at most MAX_RESEARCH_ITEMS_PER_ESTIMATE
    // items. The over-cap remainder is left untouched — those items KEEP their non-zero
    // ai_estimate price (the model already priced them; they are never $0'd here) and
    // never reach the cache/provider. NO-SILENT-CAPS: the dropped count is logged.
    const researchTargets = candidates.slice(0, MAX_RESEARCH_ITEMS_PER_ESTIMATE)
    const droppedCount = candidates.length - researchTargets.length
    if (droppedCount > 0) {
      console.warn(
        `[price-research] cap hit: researching ${researchTargets.length}/${candidates.length} items ` +
          `(MAX_RESEARCH_ITEMS_PER_ESTIMATE=${MAX_RESEARCH_ITEMS_PER_ESTIMATE}); ${droppedCount} dropped to ai_estimate`
      )
    }

    // IN-RUN MEMO (Phase 109): keyed by `${normName}@@${region}`. SCOPE = this CALL.
    // Two candidates sharing a normalized (name, region) within one estimate hit the
    // memo on the second lookup → ONE provider call + ONE recordUsage for that key. (A
    // memo HIT stages a result without re-querying the provider or re-paying allowance.)
    // It is a plain Map → lookups never throw. A null entry records a known MISS so a
    // duplicate miss is not re-searched within the same call.
    const memo = new Map<string, import('./provider').PriceResearchResult | null>()

    // Staged re-tags: candidate item reference → its rewritten 'researched' item.
    // Items absent from this map are returned untouched (price_book, owner-edited,
    // and ai_estimate items the research could not improve all stay as-is).
    const retag = new Map<LineItemOutput, LineItemOutput>()

    // WI-1 telemetry counters (observability only — never influence the re-tag logic):
    // cacheHits increments on a cache-pass re-tag; providerUsable on a memo/provider
    // evidence-gated re-tag. `candidates.length` is the true demand (pre-cap).
    let cacheHits = 0
    let providerUsable = 0

    // --- Step 1: cache pass (a HIT is free — no provider call, no allowance) ---
    // Each cacheGet is independent, so fire them all in parallel (up to
    // MAX_RESEARCH_ITEMS_PER_ESTIMATE reads) instead of awaiting one at a time,
    // then partition into hits (re-tag) / misses. Promise.all preserves array
    // order, so the misses list keeps its original researchTargets ordering.
    const cacheReads = await Promise.all(
      researchTargets.map(async (item) => {
        try {
          const cached = await cacheGet(ctx.companyId, item.description, ctx.region, ctx.currency)
          return { item, cached }
        } catch {
          return { item, cached: null } // a cache read failure degrades to a MISS, never throws
        }
      })
    )

    const misses: LineItemOutput[] = []
    for (const { item, cached } of cacheReads) {
      if (cached && isPriced(cached.unit_price)) {
        retag.set(item, { ...item, unit_price: cached.unit_price, price_source: 'researched' as const })
        cacheHits++ // telemetry: a free cache-hit re-tag
      } else {
        misses.push(item)
      }
    }

    // --- Step 2: gated, fallback-aware, batched provider pass for the misses ---
    if (misses.length > 0) {
      // First, satisfy any miss whose memo key was already resolved earlier in THIS
      // call (a duplicate (normName, region) within the estimate). A memo HIT re-tags
      // from the stored result with NO provider call and NO allowance; a memoized
      // null is a known miss. The remainder still needs a real search.
      const stillMissing: LineItemOutput[] = []
      for (const m of misses) {
        const mk = buildMemoKey(ctx.region, m.description)
        if (memo.has(mk)) {
          const memoized = memo.get(mk) ?? null
          if (memoized && isUsableCandidate(memoized) && typeof memoized.unit_price === 'number') {
            retag.set(m, { ...m, unit_price: memoized.unit_price, price_source: 'researched' as const })
            providerUsable++ // telemetry: memo HIT re-tag came from an evidence-gated provider result
          }
          // memoized null (or unusable) → known miss; item keeps ai_estimate.
        } else {
          stillMissing.push(m)
        }
      }

      if (stillMissing.length > 0) {
        // Over-allowance SKIPS the provider for the whole miss set (RMETER-03). The
        // misses keep ai_estimate; the call still returns sections (never hard-fails).
        const quota = await checkQuota(ctx.supabase, ctx.companyId, 'price_research')
        if (quota.allowed) {
          // ORDERED provider chain: OpenRouter-web primary → gated Anthropic-web
          // quality-fallback (Phase 109). An empty chain (unconfigured) is a safe
          // no-op — misses keep ai_estimate.
          const chain = await getPriceResearchProviderChain()

          // The shrinking miss set fed to each provider in turn. The fallback is
          // attempted only for items the primary left WITHOUT usable evidence (or that
          // it errored on), before they degrade to ai_estimate.
          let remaining = stillMissing

          for (const provider of chain) {
            if (remaining.length === 0) break

            // Dedup THIS round's lookup by memo key so a batch never carries two items
            // sharing a normalized (name, region): the search runs ONCE per key and
            // every item sharing that key re-tags from the one result + one recordUsage.
            const repByKey = new Map<string, LineItemOutput>()
            for (const m of remaining) {
              const mk = buildMemoKey(ctx.region, m.description)
              if (!repByKey.has(mk)) repByKey.set(mk, m)
            }
            const lookupItems = Array.from(repByKey.values())

            let results: import('./provider').PriceResearchResult[] = []
            try {
              results = await provider.lookup(
                lookupItems.map((m) => ({ name: m.description })),
                ctx.region,
                ctx.currency
              )
            } catch {
              // A provider erroring falls through to the NEXT provider in the chain
              // (never throws). `remaining` is unchanged → the fallback re-searches them.
              continue
            }

            // Re-associate each result to its requested item by name.
            const byName = new Map<string, LineItemOutput>()
            for (const m of lookupItems) byName.set(m.description, m)

            for (const result of results) {
              if (!byName.has(result.name)) continue
              const mk = buildMemoKey(ctx.region, result.name)

              // Meter once per actual search per key (idempotent — RMETER-01). A cache
              // HIT or a memo HIT never reaches here, so neither consumes allowance. A
              // fallback re-search of a still-missing key IS a real second search.
              try {
                await recordUsage(ctx.supabase, ctx.companyId, 'price_researched', 1, buildIdemKey(ctx, result.name))
              } catch {
                // Metering is best-effort; a ledger error must not drop the price.
              }

              // Phase 112 (CREDIT-02): inline credit debit for price_research. This
              // call lives INSIDE the per-result loop, so it fires once per result —
              // BUT recordCreditDebit is idempotent on `${ctx.attemptId}:debit:price_research`,
              // so every per-result call after the first is a no-op (check-then-insert
              // / 23505 swallow, Plan 03). Intended cardinality: exactly ONE
              // price_research debit per attempt; the loop repetition collapses to it.
              // Only when ctx.attemptId is set (no stable key → no debit). The real
              // cost was captured by recordAICost at the OpenRouter-web call, keyed by
              // attemptId — read it back (same bounded shape as the Inngest seams).
              // Wrapped in try/catch to mirror the best-effort metering contract above.
              if (ctx.attemptId) {
                const attemptId = ctx.attemptId
                try {
                  let realCostUsd: number | null = null
                  for (let i = 0; i < 3; i++) {
                    const { data } = await ctx.supabase
                      .from('ai_cost_events')
                      .select('real_cost_usd')
                      .eq('attempt_id', attemptId)
                    const rows = (data ?? []) as { real_cost_usd: number | null }[]
                    if (rows.length > 0) {
                      const known = rows
                        .map((r) => r.real_cost_usd)
                        .filter((c): c is number => c != null)
                      realCostUsd = known.length > 0 ? known.reduce((a, b) => a + b, 0) : null
                      break
                    }
                    await new Promise((r) => setTimeout(r, 150))
                  }
                  await recordCreditDebit({
                    companyId: ctx.companyId,
                    operationType: 'price_research',
                    realCostUsd,
                    attemptId,
                  })
                } catch {
                  // Metering is best-effort; a ledger error must not drop the price.
                }
              }

              const usable = isUsableCandidate(result) && typeof result.unit_price === 'number'
              // Memoize the outcome (a usable result, or null for a known miss) so a
              // duplicate (normName, region) later in THIS call is a free memo HIT.
              memo.set(mk, usable ? result : null)

              // EVIDENCE GATE (RPRICE-04): re-tag 'researched' ONLY with a usable,
              // cited, positive price — across ALL items sharing this memo key.
              if (usable) {
                for (const m of remaining) {
                  if (buildMemoKey(ctx.region, m.description) === mk) {
                    // telemetry: count each NEWLY re-tagged item once (skip an already-tagged one).
                    if (!retag.has(m)) providerUsable++
                    retag.set(m, { ...m, unit_price: result.unit_price as number, price_source: 'researched' as const })
                  }
                }
                try {
                  await cachePut({
                    companyId: ctx.companyId,
                    name: result.name,
                    region: ctx.region,
                    currency: ctx.currency,
                    datum: { unit_price: result.unit_price as number, source: result.source_url, confidence: result.confidence },
                  })
                } catch {
                  // A cache write failure must not break the (already staged) re-tag.
                }
              }
            }

            // Items with no USABLE result this round fall through to the NEXT provider
            // (the gated fallback). An item already re-tagged 'researched' is resolved.
            remaining = remaining.filter((m) => !retag.has(m))
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
    // WI-1 telemetry: candidates = true demand (pre-cap); missed = candidates that stayed
    // ai_estimate after the whole pass, floored at 0.
    const telemetry = {
      candidates: candidates.length,
      cacheHits,
      providerUsable,
      missed: Math.max(0, candidates.length - cacheHits - providerUsable),
    }
    return { sections: rewritten, flaggedUnpriced: countFlaggedUnpriced(rewritten), telemetry }
  } catch {
    // NEVER-THROWS: return the original sections + a best-effort flagged count.
    try {
      return { sections, flaggedUnpriced: countFlaggedUnpriced(sections) }
    } catch {
      return { sections, flaggedUnpriced: 0 }
    }
  }
}
