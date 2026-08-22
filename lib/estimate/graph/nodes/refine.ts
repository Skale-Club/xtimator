/**
 * lib/estimate/graph/nodes/refine.ts
 *
 * CORE refine node (channel-neutral, HARD-01 / UNIFY-03). Mirrors makeGenerateNode:
 * wraps the AI refine call in the injected StepRunner and NEVER throws (ENGINE-04).
 *
 * On success it RESOLVES with `{ refined: EstimateOutput }` — the refined PREVIEW,
 * which rides a channel-neutral state field and is NEVER persisted in the graph.
 * On failure it RESOLVES with a typed `{ failure: { reason } }`, mapping the typed
 * markers BYTE-IDENTICALLY to generate.ts:
 *   - ProvidersUnavailableError  -> 'provider_unavailable'
 *   - InvalidEstimateOutputError -> 'invalid_output'
 *   - missing existingEstimate / instruction -> 'no_usable_input'
 *   - any other error -> 'generation_failed'
 *
 * CRITICAL: it resolves the provider via `getAIProviderWithFallback(companyId)` (NOT
 * `getAIProvider`) so refine inherits the Phase-99 OpenRouter->Gemini fallback AND the
 * Phase-100 zod validation + bounded schema-retry for free. It threads the SAME builder
 * inputs as generate (language / industry / currency / price book resolved from the
 * company row by companyId) so refine feeds the shared prompt builder equivalently.
 *
 * companyId comes ONLY from state (trusted tenant scope, never LLM-derived).
 */
import { getAIProviderWithFallback } from '@/lib/ai/provider-with-fallback'
import { getPriceBookItems } from '@/lib/queries/price-book'
import { requireServiceClient } from '@/lib/supabase/service'
import { normalizeCurrencyCode } from '@/lib/money/currency'
import { ProvidersUnavailableError, InvalidEstimateOutputError } from '@/lib/ai/with-fallback'
import type { FailureReason } from '@/lib/estimate/failure'
import type { EstimateStateType } from '../state'
import type { StepRunner } from '../types'

export const makeRefineNode =
  (runner: StepRunner) =>
  async (state: EstimateStateType): Promise<Partial<EstimateStateType>> => {
    try {
      if (!state.existingEstimate || !state.instruction) {
        return { failure: { reason: 'no_usable_input' } }
      }

      const refined = await runner.run('ai-refine', async () => {
        // Resolve company language / industry / currency + the company-scoped price
        // book EXACTLY like generateEstimateForProject so refine feeds the SAME
        // builder inputs (strongest UNIFY-02 equivalence). companyId is from state
        // (trusted, never LLM-derived).
        const svc = requireServiceClient()

        // Builder-context enrichment is best-effort: a company-row lookup failure
        // must NOT sink the refine pass — fall back to neutral defaults (USD, no
        // industry, default language). The existingEstimate + instruction are the
        // load-bearing inputs; this only sharpens prompt context.
        let currencyCode = normalizeCurrencyCode(undefined)
        let industry: string | null = null
        let language: 'en' | 'pt' | 'es' | undefined
        try {
          const { data: company } = await svc
            .from('companies')
            .select('industry, currency_code, default_estimate_language')
            .eq('id', state.companyId)
            .single()
          currencyCode = normalizeCurrencyCode(company?.currency_code)
          industry = (company?.industry as string | null) ?? null
          language =
            (company?.default_estimate_language as 'en' | 'pt' | 'es' | null) ?? undefined
        } catch {
          // keep neutral defaults
        }

        let priceBookItems: Array<{
          folder_name: string | null
          name: string
          unit: string | null
          unit_price: number
          currency_code?: string | null
        }> = []
        try {
          priceBookItems = (await getPriceBookItems(svc, state.companyId))
            .filter((i) => normalizeCurrencyCode(i.currency_code) === currencyCode)
            .map((i) => ({
              folder_name: i.folder_name,
              name: i.name,
              unit: i.unit,
              unit_price: i.unit_price,
              currency_code: i.currency_code,
            }))
        } catch {
          // no price book = no injection (same as generate's empty-array path)
        }

        // Fix (refine credit attribution): the SAME non-LLM costContext shape
        // generate.ts's node builds from state — attemptId/companyId/projectId
        // are trusted, never LLM-derived. Threading this through
        // RefineEstimateInput.costContext lets the OpenRouter/Gemini adapter
        // attribute the refine call's real cost to THIS request instead of a
        // random attemptId + null companyId.
        const costContext = {
          attemptId: state.attemptId ?? null,
          companyId: state.companyId,
          projectId: state.projectId,
        }

        const provider = await getAIProviderWithFallback(state.companyId)
        return provider.refineEstimate({
          existingEstimate: state.existingEstimate!,
          instruction: state.instruction!,
          priceBookItems,
          currencyCode,
          industry,
          language,
          costContext,
        })
      })

      return { refined }
    } catch (err) {
      console.error('[estimate-graph] refine failed; routing to onError:', err)
      // Deterministic detection of the typed markers via the SAME instanceof +
      // brand-check duo used by generate.ts (survives module-instance boundaries).
      const reason: FailureReason =
        err instanceof ProvidersUnavailableError ||
        (err as { providerUnavailable?: unknown } | null)?.providerUnavailable === true
          ? 'provider_unavailable'
          : err instanceof InvalidEstimateOutputError ||
              (err as { invalidOutput?: unknown } | null)?.invalidOutput === true
            ? 'invalid_output'
            : 'generation_failed'
      return { failure: { reason } }
    }
  }
