/**
 * lib/ai/provider-with-fallback.ts
 *
 * Server-only. The fallback-aware AIProvider for the chat paths (generate +
 * refine). Resolves the primary OpenRouter provider via the EXISTING
 * `getAIProvider(companyId)` (per-company model selection stays untouched and
 * orthogonal to fallback) and lazily builds a Gemini fallback adapter. Both
 * `generateEstimate` and `refineEstimate` run through the shared `callWithFallback`
 * policy: OpenRouter primary, Gemini fallback at most once (HARD-03).
 *
 * On both-providers-down, `callWithFallback` throws the MARKED
 * `ProvidersUnavailableError`; it propagates UNCHANGED out of these methods (the
 * `.result` access never runs) so the generate node's never-throw catch (99-02)
 * maps it to the typed reason `'provider_unavailable'`. We do NOT catch it here.
 *
 * `companyId` stays a param/closure — NEVER read from LLM output (multi-tenant
 * invariant). The Gemini import is dynamic to keep bundles lean.
 */
import type { AIProvider } from './provider.interface'
import type { EstimateInput, EstimateOutput, RefineEstimateInput } from './types'
import { getAIProvider } from '@/lib/ai'
import { callWithFallback } from '@/lib/ai/with-fallback'

/**
 * Returns an AIProvider whose generate/refine attempt OpenRouter first and fall
 * back to Gemini exactly once on failure. Generate/refine call sites become a
 * one-line swap from `getAIProvider`. `getAIProvider` (model selection) is left
 * untouched.
 */
export async function getAIProviderWithFallback(companyId?: string): Promise<AIProvider> {
  const primary = await getAIProvider(companyId)
  const { GeminiAdapter } = await import('@/lib/ai/providers/gemini')
  const fallbackProvider = new GeminiAdapter()

  return {
    async generateEstimate(input: EstimateInput): Promise<EstimateOutput> {
      return (
        await callWithFallback({
          op: 'generate',
          primary: () => primary.generateEstimate(input),
          fallback: () => fallbackProvider.generateEstimate(input),
        })
      ).result
    },
    async refineEstimate(input: RefineEstimateInput): Promise<EstimateOutput> {
      return (
        await callWithFallback({
          op: 'refine',
          primary: () => primary.refineEstimate(input),
          fallback: () => fallbackProvider.refineEstimate(input),
        })
      ).result
    },
  }
}
