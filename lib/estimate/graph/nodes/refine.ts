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
 * `getAIProvider`) so refine inherits the OpenRouter-only failure mapping AND the
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
import type { EstimateOutput, EstimateSectionOutput } from '@/lib/ai/types'
import { resolveLinePrices } from '@/lib/estimate/pricing/resolve-prices'
import { matchUnchangedLines, normalizeText } from '@/lib/estimate/refine-merge'
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
        // The estimate's OWN language wins over the company default: refining a
        // Portuguese estimate must not flip it to the company's English default.
        if (isEstimateLang(state.estimateLanguage)) language = state.estimateLanguage

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
        // RefineEstimateInput.costContext lets the OpenRouter adapter
        // attribute the refine call's real cost to THIS request instead of a
        // random attemptId + null companyId.
        const costContext = {
          attemptId: state.attemptId ?? null,
          companyId: state.companyId,
          projectId: state.projectId,
        }

        const provider = await getAIProviderWithFallback(state.companyId)
        const modelRefined = await provider.refineEstimate({
          existingEstimate: state.existingEstimate!,
          instruction: state.instruction!,
          priceBookItems,
          currencyCode,
          industry,
          language,
          costContext,
        })

        // Price guardrails on what the model touched (never throws).
        return applyRefineGuardrails({
          existing: state.existingEstimate!,
          refined: modelRefined,
          companyId: state.companyId,
          projectId: state.projectId,
          attemptId: state.attemptId,
          currencyCode,
          priceBookItems,
          svc,
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

function isEstimateLang(v: unknown): v is 'en' | 'pt' | 'es' {
  return v === 'en' || v === 'pt' || v === 'es'
}

/**
 * Run the shared price pipeline on the lines the refine CHANGED or ADDED, and only
 * those. A line identical to an existing one (same normalized description, quantity
 * and unit_price) keeps its existing unit_price and price_source untouched, so an
 * owner's manual price edit survives a refine. Never throws: on any failure the
 * model's refined estimate is returned as-is.
 */
async function applyRefineGuardrails(args: {
  existing: EstimateOutput
  refined: EstimateOutput
  companyId: string
  projectId: string
  attemptId: string | undefined
  currencyCode: string
  priceBookItems: Array<{ name: string; unit_price: number }>
  svc: ReturnType<typeof requireServiceClient>
}): Promise<EstimateOutput> {
  try {
    const { existing, refined } = args
    const existingByTitle = new Map<string, EstimateSectionOutput>()
    for (const sec of existing.sections) {
      const key = normalizeText(sec.title)
      if (!existingByTitle.has(key)) existingByTitle.set(key, sec)
    }

    // Split: per section, which refined lines are unchanged (keep as-is, restoring
    // the current source) and which go through the pipeline.
    const keep: Array<Array<EstimateSectionOutput['items'][number] | null>> = []
    const toResolve: EstimateSectionOutput[] = refined.sections.map((sec, si) => {
      const current = existingByTitle.get(normalizeText(sec.title))
      const matches = current ? matchUnchangedLines(current.items, sec.items) : sec.items.map(() => -1)
      keep[si] = sec.items.map((item, ii) => {
        const ci = matches[ii]
        if (ci < 0 || !current) return null
        const cur = current.items[ci]
        return { ...item, unit_price: cur.unit_price, price_source: cur.price_source }
      })
      return { ...sec, items: sec.items.filter((_, ii) => keep[si][ii] === null) }
    })

    if (toResolve.every((s) => s.items.length === 0)) return refined

    // Region from the project's client (best-effort).
    let region: { city: string | null; state: string | null } = { city: null, state: null }
    try {
      const { data: project } = await args.svc
        .from('projects')
        .select('client:clients(city, state)')
        .eq('id', args.projectId)
        .single()
      const client = (project as { client?: { city?: string | null; state?: string | null } | null } | null)
        ?.client
      region = { city: client?.city ?? null, state: client?.state ?? null }
    } catch {
      // no region = unregioned research, same as a client-less generate
    }

    const resolved = await resolveLinePrices(toResolve, {
      companyId: args.companyId,
      currencyCode: args.currencyCode,
      priceBookItems: args.priceBookItems,
      region,
      supabase: args.svc,
      attemptId: args.attemptId,
      projectId: args.projectId,
      // No dedupe: this is a partial line set.
    })

    const sections = refined.sections.map((sec, si) => {
      const rItems = resolved.sections[si]?.items
      const expected = keep[si].filter((k) => k === null).length
      if (!rItems || rItems.length !== expected) return sec // defensive: keep the model's lines
      let next = 0
      return {
        ...sec,
        items: keep[si].map((kept) => kept ?? rItems[next++]),
      }
    })
    return { ...refined, sections }
  } catch (err) {
    console.warn('[estimate-graph] refine price guardrails failed (non-fatal):', err)
    return args.refined
  }
}
