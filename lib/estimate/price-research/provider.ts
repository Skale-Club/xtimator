import 'server-only'
/**
 * lib/estimate/price-research/provider.ts
 *
 * Server-only. The swappable PriceResearchProvider SEAM — mirrors
 * `getAIProviderWithFallback` (lib/ai/provider-with-fallback.ts). Every research source is
 * OpenRouter-backed (owner rule: no direct Anthropic/Gemini/OpenAI). Phase 108 wires
 * this into the estimate pipeline; THIS phase only ships the port + contracts.
 *
 * Contract guarantees:
 *  - BATCHED: an adapter resolves all unmatched item names in ONE `lookup` call;
 *    the per-item-vs-batched concern stays internal to the adapter.
 *  - EVIDENCE-GATED: a result is only a usable (researched) price when it carries a
 *    real source_url + snippet + positive unit_price (see `isUsableCandidate`). A
 *    hallucinated citation-less number is NEVER surfaced as researched.
 *  - NULL-ON-UNCONFIGURED: `getPriceResearchProvider()` returns null when no source
 *    is set in platform_integrations, so the Phase-108 enrichment is a safe no-op
 *    (mirrors the getXphereConfig()/Stripe-Connect degrade pattern).
 *  - companyId / region are caller-supplied, NEVER read from LLM output
 *    (multi-tenant invariant).
 *
 * Channel-neutral (ENGINE-01): this module imports no channel package.
 */
import { createServiceClient } from '@/lib/supabase/service'

export interface Region {
  city: string | null
  state: string | null
}

/**
 * What an adapter returns per requested item. Evidence-gated by contract: a price
 * is only "usable" when source_url + snippet are real (see `isUsableCandidate`).
 */
export interface PriceResearchResult {
  /** Echoes the requested item name (for re-association after a batched lookup). */
  name: string
  unit_price: number | null
  currency: string
  source_url: string | null
  snippet: string | null
  confidence?: number | null
  /**
   * SEED-057 E: the unit the quoted price is FOR ("sq ft", "each"...). Optional so
   * every existing adapter and fixture keeps working; when present and different
   * from the requested unit the orchestrator treats the result as a miss.
   */
  unit?: string | null
}

/**
 * Fix (price-research cost attribution): non-LLM correlation context, mirroring
 * lib/ai/openrouter-client.ts's CostContext shape. The orchestrator generates
 * ONE id per `researchUnmatchedPrices` call (its OWN attemptId, distinct from
 * the generation's `ctx.attemptId`) and threads it into every `lookup` call so
 * an adapter's recordAICost row — and the orchestrator's later read-back — key
 * off THIS id + operation_type 'price_research', never the generation's own
 * attemptId (which the 'estimate' op already owns).
 */
export interface ResearchCostContext {
  attemptId?: string | null
  companyId?: string | null
  projectId?: string | null
}

export interface PriceResearchProvider {
  /**
   * BATCHED: all unmatched item names in one call. Per-item-vs-batched stays
   * internal to the adapter. Never throws — adapters catch and return misses.
   * `costContext` is OPTIONAL/additive — an adapter that ignores it keeps
   * recording (or not recording) cost exactly as before.
   */
  lookup(
    items: { name: string; unit?: string | null }[],
    region: Region,
    currency: string,
    costContext?: ResearchCostContext
  ): Promise<PriceResearchResult[]>
}

/** Active-source string persisted in platform_integrations (admin UI deferred). */
export type PriceResearchSource = 'openrouter_web'

/**
 * THE EVIDENCE GATE — load-bearing correctness contract (Pitfall 1).
 *
 * A research result is usable (returned as a *researched* price) ONLY when it has
 * a real citation: a non-empty source_url AND a non-empty snippet AND a finite,
 * strictly-positive unit_price. A hallucinated, citation-less, or $0 guess must
 * NEVER be surfaced as researched — Phase 108 instead falls it to a non-zero
 * ai_estimate. Do not relax any clause without revisiting that guarantee.
 */
export function isUsableCandidate(r: PriceResearchResult): boolean {
  return (
    typeof r.source_url === 'string' &&
    r.source_url.trim().length > 0 &&
    typeof r.snippet === 'string' &&
    r.snippet.trim().length > 0 &&
    typeof r.unit_price === 'number' &&
    Number.isFinite(r.unit_price) &&
    r.unit_price > 0
  )
}

/**
 * Reads the active research source from platform_integrations — mirrors
 * `getOpenRouterDefaultModel()` (lib/platform-config.ts). Returns null when the
 * service client is unavailable, no row exists, or the value is unrecognized.
 * (The admin UI that SETS this is a deferred Future Requirement; reading it here
 * is the seam.)
 */
async function getActiveResearchSource(): Promise<PriceResearchSource | null> {
  const svc = createServiceClient()
  if (!svc) return null
  const { data } = await svc
    .from('platform_integrations')
    .select('metadata')
    .eq('provider', 'price_research')
    .maybeSingle()
  const source = (data?.metadata as { research_source?: string } | null)?.research_source
  if (source === 'openrouter_web') return 'openrouter_web'
  // Legacy: installs that stored the retired direct-Anthropic source resolve to the
  // OpenRouter web source (owner rule: every AI call goes through OpenRouter).
  if (source === 'anthropic_web') return 'openrouter_web'
  return null
}

/**
 * Resolve the active PriceResearchProvider, or null when unconfigured.
 *
 * The adapter modules are loaded via dynamic import so Plan 01 stays independently
 * type-checkable before Plan 02 lands them (and so the test can mock the import).
 * Null-on-unconfigured makes the Phase-108 enrichment a safe no-op.
 */
export async function getPriceResearchProvider(): Promise<PriceResearchProvider | null> {
  const source = await getActiveResearchSource()
  switch (source) {
    case 'openrouter_web': {
      const { makeOpenRouterWebProvider } = await import('./adapters/openrouter-web')
      return makeOpenRouterWebProvider()
    }
    default:
      return null
  }
}

/**
 * Resolve the ORDERED provider chain. Owner rule: every provider is OpenRouter-backed,
 * so the chain is `[primary]` or `[]` when nothing is configured (the Phase-108 safe
 * no-op is preserved). A configured Anthropic key does NOT add a direct-Anthropic
 * quality fallback any more. Never throws.
 */
export async function getPriceResearchProviderChain(): Promise<PriceResearchProvider[]> {
  const primary = await getPriceResearchProvider()
  return primary ? [primary] : []
}
