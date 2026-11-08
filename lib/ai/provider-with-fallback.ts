/**
 * lib/ai/provider-with-fallback.ts
 *
 * Server-only. The AIProvider for the chat paths (generate + refine). Resolves the
 * OpenRouter provider via the EXISTING `getAIProvider(companyId)` (per-company
 * model selection untouched). Owner rule: every AI call goes through OpenRouter
 * only; there is NO secondary provider. Both `generateEstimate` and
 * `refineEstimate` run through the shared `callWithFallback` seam, so an
 * OpenRouter failure raises the MARKED `ProvidersUnavailableError`, which
 * propagates UNCHANGED (the `.result` access never runs) so the generate node's
 * never-throw catch maps it to the typed reason `'provider_unavailable'`.
 *
 * `companyId` stays a param/closure — NEVER read from LLM output (multi-tenant
 * invariant).
 */
import type { AIProvider } from './provider.interface'
import type { EstimateInput, EstimateOutput, RefineEstimateInput } from './types'
import { getAIProvider, type GetAIProviderOptions } from '@/lib/ai'
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
 * `call(extraHint?)` runs the OpenRouter call once. If it
 * rejects with the GUARD-01 marker `InvalidEstimateOutputError` (OpenRouter produced schema-invalid output), we re-invoke EXACTLY ONCE with a
 * schema-repair hint. A second invalid output propagates unchanged (no third call).
 *
 * Orthogonality: `ProvidersUnavailableError` (OpenRouter down) is NOT an
 * `InvalidEstimateOutputError`, so it is rethrown immediately — provider-unavailable
 * behavior is untouched and there is no retry storm. Valid-first-time = exactly one
 * provider call (the happy-path AI call count is unchanged).
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
 * Returns an AIProvider whose generate/refine run OpenRouter only; a failure
 * raises `ProvidersUnavailableError` (no fallback). `getAIProvider` (model
 * selection) is left untouched.
 */
export async function getAIProviderWithFallback(
  companyId?: string,
  opts?: GetAIProviderOptions
): Promise<AIProvider> {
  // Pass `opts` only when given so existing one-argument callers/mocks see the same call.
  const primary = opts ? await getAIProvider(companyId, opts) : await getAIProvider(companyId)

  return {
    async generateEstimate(input: EstimateInput): Promise<EstimateOutput> {
      // OUTER schema-retry (cap 1) over the OpenRouter call.
      return withSchemaRetry(async (hint) => {
        const withHint = hint ? { ...input, retryHint: hint } : input
        return (
          await callWithFallback({
            op: 'generate',
            primary: () => primary.generateEstimate(withHint),
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
          })
        ).result
      })
    },
  }
}
