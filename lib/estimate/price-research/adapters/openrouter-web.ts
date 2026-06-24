import 'server-only'
/**
 * OpenRouter-web price-research adapter — PLACEHOLDER SEAM (Phase 107 Plan 01).
 *
 * Plan 01 ships the factory shape only: `makeOpenRouterWebProvider()` returns a
 * `PriceResearchProvider` whose `lookup` is a safe no-op (returns no candidates =
 * all misses) so the seam is type-checkable and dispatchable today. PLAN 02 fills
 * `lookup` with the real SEPARATE `openrouter:web_search` call (engine `exa`
 * default / `native` configurable) per .planning/research/STACK.md, validating the
 * payload via priceResearchPayloadSchema and gating each result with
 * isUsableCandidate. Never throws — research failures degrade to misses.
 *
 * Channel-neutral (ENGINE-01): imports no channel package.
 */
import type { PriceResearchProvider } from '../provider'

export function makeOpenRouterWebProvider(): PriceResearchProvider {
  return {
    // Plan 02 implements the real batched openrouter:web_search lookup here.
    async lookup() {
      return []
    },
  }
}
