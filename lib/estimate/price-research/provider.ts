import 'server-only'
/**
 * lib/estimate/price-research/provider.ts
 *
 * Server-only. The swappable PriceResearchProvider SEAM — mirrors
 * `getAIProviderWithFallback` (lib/ai/provider-with-fallback.ts). Phase 108 wires
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
}

export interface PriceResearchProvider {
  /**
   * BATCHED: all unmatched item names in one call. Per-item-vs-batched stays
   * internal to the adapter. Never throws — adapters catch and return misses.
   */
  lookup(
    items: { name: string }[],
    region: Region,
    currency: string
  ): Promise<PriceResearchResult[]>
}

/** Active-source string persisted in platform_integrations (admin UI deferred). */
export type PriceResearchSource = 'openrouter_web' | 'anthropic_web'

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
  if (source === 'anthropic_web') return 'anthropic_web'
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
    case 'anthropic_web': {
      const { makeAnthropicWebProvider } = await import('./adapters/anthropic-web')
      return makeAnthropicWebProvider()
    }
    default:
      return null
  }
}

/**
 * Resolve the ORDERED, gated provider chain `[primary, fallback?]` (Phase 109).
 *
 * The configured PRIMARY source comes first (via the same dispatch as
 * {@link getPriceResearchProvider}). The Anthropic-web quality-fallback is appended
 * ONLY when it is BOTH (a) not already the primary AND (b) configured/available — the
 * gate is `getIntegrationKey('anthropic')` resolving to a real key, the same credential
 * the Anthropic adapter itself uses. Mirrors the AI provider-fallback ordering
 * (lib/ai/provider-with-fallback.ts): primary first, fallback attempted at most once.
 *
 * Returns `[]` when nothing is configured (the Phase-108 safe no-op is preserved —
 * the orchestrator touches no provider). Never throws: a gate read failure simply
 * omits the fallback. The orchestrator iterates this chain over the SHRINKING miss
 * set, attempting the fallback only for items the primary left without evidence.
 */
export async function getPriceResearchProviderChain(): Promise<PriceResearchProvider[]> {
  const source = await getActiveResearchSource()
  const primary = await getPriceResearchProvider()
  // Unconfigured → empty chain (safe no-op; orchestrator never touches a provider).
  if (!primary) return []

  const chain: PriceResearchProvider[] = [primary]

  // Append the gated Anthropic-web quality-fallback when the primary is NOT already
  // Anthropic AND an Anthropic key is configured. The gate keeps the fallback dormant
  // on installs without Anthropic credentials (no wasted call that all-misses anyway).
  if (source !== 'anthropic_web') {
    let anthropicKey: string | null = null
    try {
      const { getIntegrationKey } = await import('@/lib/platform-config')
      anthropicKey = await getIntegrationKey('anthropic')
    } catch {
      anthropicKey = null // a gate read failure simply omits the fallback (never throws)
    }
    if (anthropicKey) {
      const { makeAnthropicWebProvider } = await import('./adapters/anthropic-web')
      chain.push(makeAnthropicWebProvider())
    }
  }

  return chain
}
