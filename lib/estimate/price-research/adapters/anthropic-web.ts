import 'server-only'
/**
 * Anthropic-web price-research adapter — PLACEHOLDER SEAM (Phase 107 Plan 01).
 *
 * GATED, non-default quality-fallback (Anthropic is the fallback vendor — do NOT
 * invert the hierarchy). Plan 01 ships the factory shape only:
 * `makeAnthropicWebProvider()` returns a `PriceResearchProvider` whose `lookup` is
 * a safe no-op (all misses). PLAN 02 fills `lookup` with the real
 * `@anthropic-ai/sdk` `web_search` call using `user_location { city, region: state,
 * country: 'US' }` (the strongest regional grounding), validating via
 * priceResearchPayloadSchema and gating with isUsableCandidate. Never throws.
 *
 * Channel-neutral (ENGINE-01): imports no channel package.
 */
import type { PriceResearchProvider } from '../provider'

export function makeAnthropicWebProvider(): PriceResearchProvider {
  return {
    // Plan 02 implements the real batched Anthropic web_search lookup here.
    async lookup() {
      return []
    },
  }
}
