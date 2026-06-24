/**
 * lib/estimate/graph/nodes/generate.ts
 *
 * CORE generate node (channel-neutral). Wraps the shared, channel-agnostic
 * generateEstimateForProject via the injected StepRunner (DURABLE-01) so the AI
 * call can LATER become its own Inngest step.run without the core importing
 * Inngest. With the default passthroughRunner this is exactly today's call.
 *
 * NEVER throws (ENGINE-04): on failure it RESOLVES with a `failure?` state
 * channel (generalizing the old per-channel boolean failure flag). A throw would
 * propagate out of graph.invoke → fail the Inngest step → job dies after retries
 * with NO reply (the recurring silent-failure bug). decide() routes a failure
 * state to the adapter's onError terminal so the user always gets a reply.
 */
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { ProvidersUnavailableError, InvalidEstimateOutputError } from '@/lib/ai/with-fallback'
import type { FailureReason } from '@/lib/estimate/failure'
import type { EstimateStateType } from '../state'
import type { StepRunner } from '../types'

export const makeGenerateNode =
  (runner: StepRunner) =>
  async (state: EstimateStateType): Promise<Partial<EstimateStateType>> => {
    try {
      // Phase 110 (COST-01): non-LLM cost-correlation context, built ONLY from
      // trusted state (never any LLM/`parsed` value). Threaded into the service →
      // EstimateInput.costContext so the OpenRouter adapter can attribute cost.
      const costContext = {
        attemptId: state.attemptId ?? null,
        companyId: state.companyId,
        projectId: state.projectId,
      }
      const opts =
        state.channel === 'whatsapp'
          ? { channel: 'whatsapp' as const, prompts: state.prompts, costContext }
          : {
              prompts: state.prompts,
              // origin/dev: stamp "Prepared by" on web/MCP-triggered estimates.
              createdByUserId: state.createdByUserId,
              costContext,
            }
      const result = await runner.run('ai-generate', () =>
        generateEstimateForProject(state.companyId, state.projectId, opts)
      )
      return {
        estimateId: result.estimateId,
        estimateLanguage: result.language,
      }
    } catch (err) {
      console.error('[estimate-graph] generate failed; routing to onError:', err)
      // Deterministic detection of the typed markers via the SAME instanceof +
      // brand-check duo (survives module-instance boundaries):
      //   - both-providers-down marker re-thrown by callWithFallback (99-01) ->
      //     'provider_unavailable'
      //   - GUARD-01 schema-retry marker thrown when the bounded retry exhausts
      //     (100-01) -> 'invalid_output'
      // Everything else stays the verbatim 'generation_failed'.
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
