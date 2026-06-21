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
import { callWithFallback, InvalidEstimateOutputError } from '@/lib/ai/with-fallback'

/**
 * GUARD-01 corrective hint appended to the user content on the single schema-retry
 * re-call. Adapters surface it via `appendRetryHint(input.retryHint)`.
 */
const SCHEMA_REPAIR_HINT =
  'IMPORTANT: your previous response failed validation. Return valid JSON matching ' +
  'the create_estimate schema exactly (all required fields, numbers as plain ' +
  'numbers >= 0).'

/**
 * Bounded schema-retry (cap = 1), the OUTER seam over the INNER provider fallback.
 *
 * `call(extraHint?)` runs the whole OpenRouter→Gemini fallback pair once. If it
 * rejects with the GUARD-01 marker `InvalidEstimateOutputError` (whichever provider
 * served produced schema-invalid output), we re-invoke the pair EXACTLY ONCE with a
 * schema-repair hint. A second invalid output propagates unchanged (no third call).
 *
 * Orthogonality: `ProvidersUnavailableError` (both providers down) is NOT an
 * `InvalidEstimateOutputError`, so it is rethrown immediately — provider-unavailable
 * behavior is untouched and there is no retry storm. Valid-first-time = exactly one
 * served-provider call (the happy-path AI call count is unchanged).
 */
async function withSchemaRetry(
  call: (extraHint?: string) => Promise<EstimateOutput>
): Promise<EstimateOutput> {
  try {
    return await call()
  } catch (err) {
    const isInvalidOutput =
      err instanceof InvalidEstimateOutputError ||
      (err as { invalidOutput?: unknown } | null)?.invalidOutput === true
    if (!isInvalidOutput) throw err
    // Single corrective re-call. A second InvalidEstimateOutputError propagates.
    return await call(SCHEMA_REPAIR_HINT)
  }
}

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
      // OUTER schema-retry (cap 1) over the INNER provider fallback (once).
      return withSchemaRetry(async (hint) => {
        const withHint = hint ? { ...input, retryHint: hint } : input
        return (
          await callWithFallback({
            op: 'generate',
            primary: () => primary.generateEstimate(withHint),
            fallback: () => fallbackProvider.generateEstimate(withHint),
          })
        ).result
      })
    },
    async refineEstimate(input: RefineEstimateInput): Promise<EstimateOutput> {
      // Refine inherits the same schema-retry seam (Phase 101 routes through here).
      return withSchemaRetry(async (hint) => {
        const withHint = hint ? { ...input, retryHint: hint } : input
        return (
          await callWithFallback({
            op: 'refine',
            primary: () => primary.refineEstimate(withHint),
            fallback: () => fallbackProvider.refineEstimate(withHint),
          })
        ).result
      })
    },
  }
}
