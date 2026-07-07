/**
 * Phase 67: Inngest function — wraps Phase 41 generateEstimateForProject service
 * with step.run checkpoints. Retries skip already-successful steps so Anthropic
 * is never charged twice for the same job.
 *
 * Implements:
 *   - INNGEST-02 (route returns jobId; recordUsage on success only)
 *   - INNGEST-06 (idempotent via event.data.requestId)
 */
import { randomUUID } from 'node:crypto'
import { inngest } from '@/lib/inngest/client'
import { makeDefaultAdapter } from '@/lib/estimate/adapters/default'
import { buildEstimateGraph } from '@/lib/estimate/graph'
import { requireServiceClient } from '@/lib/supabase/service'
import { recordUsage } from '@/lib/quota'
import { recordCreditDebit } from '@/lib/billing/credit-ledger'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'
import { recordPipelineEvent } from '@/lib/observability/pipeline-events'
import { notifyOps } from '@/lib/observability/ops-alert'
import {
  EVENT_ESTIMATE_GENERATE,
  type EstimateGeneratePayload,
} from '@/lib/inngest/events'
import { CallbackHandler } from '@langfuse/langchain'
import { langfuseProcessor } from '@/instrumentation'

async function loadOwnerUserId(companyId: string): Promise<string | null> {
  try {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('companies')
      .select('user_id')
      .eq('id', companyId)
      .single()
    return (data as { user_id?: string | null } | null)?.user_id ?? null
  } catch {
    return null
  }
}

export const generateEstimateJob = inngest.createFunction(
  {
    id: 'generate-estimate',
    idempotency: 'event.data.requestId',
    retries: 2,
    // Pre-launch audit fix (M-2): serialize generation runs PER PROJECT. The
    // idempotency key above only dedupes the SAME requestId (a retry of one
    // attempt) — it does nothing for two genuinely different attempts fired
    // close together (a double-click, or two channels racing: web + chat/MCP,
    // each minting its own requestId). The version-bump/is_current flip inside
    // generateEstimateForProject is read-then-write, so two concurrent runs
    // against the same project could both read the same max(version) and both
    // write is_current=true. limit:1 per projectId forces the second run to
    // queue behind the first rather than race it.
    concurrency: {
      limit: 1,
      key: 'event.data.projectId',
    },
    triggers: [{ event: EVENT_ESTIMATE_GENERATE }],
    // Phase 77 NOTIF-04: on final retry exhaustion fire ai_job.failed.
    onFailure: async ({ event, error }) => {
      const payload = (event as { data?: { event?: { data?: EstimateGeneratePayload } } })
        .data?.event?.data
      if (!payload) return
      const userId = await loadOwnerUserId(payload.companyId)

      // Phase 92 (EVENT-02/D-05): terminal failed generate_estimate event.
      void recordPipelineEvent({
        attemptId: payload.attemptId ?? randomUUID(),
        inputType: payload.inputType ?? 'manual_text',
        step: 'generate_estimate',
        status: 'failed',
        companyId: payload.companyId,
        projectId: payload.projectId,
        userId,
        provider: null,
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      const copy = buildNotificationCopy('ai_job.failed', {
        jobType: 'Estimate generation',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      void notify({
        companyId: payload.companyId,
        userId,
        eventType: 'ai_job.failed',
        title: copy.title,
        body: copy.body,
        linkUrl: `/projects/${payload.projectId}`,
        resourceType: 'project',
        resourceId: payload.projectId,
        metadata: { dedupe_key: `ai-fail-estimate-${payload.requestId}` },
      })

      // quick-260705-c1y-03: additive ops alert (never-throw fire-and-forget)
      // alongside the tenant notify above — routes terminal generation failures
      // to the operator's Telegram once configured. Does not gate or alter notify().
      void notifyOps({
        kind: 'estimate_generation_failed',
        title: 'Estimate generation failed after retries',
        message: `company=${payload.companyId} project=${payload.projectId} err=${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
        dedupeKey: `gen_fail:${payload.companyId}`,
        suppressWindowSec: 600,
      })
    },
  },
  async ({ event, step }) => {
    const data = event.data as EstimateGeneratePayload
    const { companyId, projectId, requestId, language, prompts, createdByUserId } = data
    // Phase 92 (EVENT-02/D-08): attempt lineage with server fallback.
    const attemptId = data.attemptId ?? randomUUID()
    const inputType = data.inputType ?? 'manual_text'
    const t0 = Date.now()

    // Phase 92 (EVENT-02/D-03): started generate_estimate event at handler entry.
    const ownerUserId = await loadOwnerUserId(companyId)
    void recordPipelineEvent({
      attemptId,
      inputType,
      step: 'generate_estimate',
      status: 'started',
      companyId,
      projectId,
      userId: ownerUserId,
    })

    // Step 1: Shared graph invocation — checkpointed (DURABLE-02: whole graph in one step.run,
    // mirroring lib/inngest/functions/whatsapp-process.ts). A retry of step 2 will NOT re-run
    // the graph. The web/MCP adapter ingest + finalize are passthroughs; onError re-throws
    // so Inngest retry + onFailure fires on generation failure (D-02).
    const result = await step.run('orchestrate-estimate', async () => {
      const supabase = requireServiceClient()
      const adapter = makeDefaultAdapter({ companyId, supabase })
      const graph = buildEstimateGraph(adapter)

      // OBS-01: unified Langfuse trace per estimate run.
      // channel from payload (mcp) or fallback to 'web' for UI path.
      // Safe-metadata rule v4.2: only project/company IDs allowed — no sensitive data.
      const traceChannel = (data.channel ?? 'web') as 'web' | 'mcp'
      const handler = new CallbackHandler({
        sessionId: `${traceChannel}:${projectId}`,
        userId: companyId,
        tags: [traceChannel, 'estimate-engine'],
      })

      const invokeResult = await graph.invoke(
        {
          companyId,
          projectId,
          channel: traceChannel,
          // Phase 110 (COST-01): thread the attempt id (Phase 91/92 lineage) into
          // the graph state so the generate node can build a non-LLM costContext
          // for OpenRouter cost attribution. Same id used as the Langfuse
          // correlationId below — joins the cost row to the trace + pipeline_events.
          attemptId,
          // HARD-07: thread the handler-entry timestamp (t0, captured outside
          // step.run) so any finalize TTL is replay-safe. The web/MCP adapter
          // finalize is a passthrough today, but the field stays consistent.
          requestedAt: t0,
          prompts: prompts && prompts.length > 0 ? prompts : undefined,
          estimateLanguage: language ?? undefined,
          // origin/dev: carry the triggering user so the service can stamp
          // created_by_user_id → drives "Prepared by" in generated PDFs.
          createdByUserId: createdByUserId ?? undefined,
        },
        {
          callbacks: [handler],
          // GUARD-04: promote the existing attemptId (Phase 91/92 lineage) to THE
          // correlation id and thread it into the Langfuse v5 trace via the runnable
          // config metadata. The langfuseSessionId/langfuseUserId tokens are the v5
          // (@langfuse/langchain@5.5.3) config-metadata form read by the CallbackHandler
          // — they also close the pre-existing OBS-03 RED. correlationId === attemptId
          // joins this trace to pipeline_events (which already carry attemptId) and to
          // any Sentry event (asResponse tags correlation_id from XtimatorError.meta).
          //
          // SAFE-METADATA rule (OBS-03 / safe-metadata v4.2): ONLY non-sensitive
          // identifiers are allowed here — no user content or secrets ever enter
          // trace metadata. This object is inert (cannot throw), so it never fails
          // or retries the generation job.
          metadata: {
            langfuseSessionId: `${traceChannel}:${projectId}`,
            langfuseUserId: companyId,
            correlationId: attemptId,
          },
          tags: [traceChannel, 'estimate-engine'],
        }
      )

      // OBS-03 / Pitfall 3: flush Langfuse spans before the step.run returns.
      // In serverless, the process may suspend before the buffer drains naturally.
      await langfuseProcessor?.forceFlush()

      return invokeResult
    })

    // Step 2: Record usage ONLY on AI success — separate step so a DB write
    // failure can retry independently. usage_events partial UNIQUE index on
    // (company_id, idempotency_key) makes this idempotent at the DB layer.
    await step.run('record-usage', async () => {
      const supabase = requireServiceClient()
      await recordUsage(supabase, companyId, 'estimate_generated', 1, requestId)
    })

    // Phase 112 (CREDIT-02): fire the credit debit AFTER record-usage, in its own
    // retry-isolated step. recordCreditDebit is never-throw, so a ledger failure
    // never breaks generation; enforcement is OFF (Plan 02 flag default false), so
    // this RECORDS but never blocks. The real cost was captured deep at the provider
    // seam (void recordAICost — RESEARCH Pitfall 6), so read it BACK from
    // ai_cost_events by attemptId. The bounded read-back sleeps up to 3×150ms
    // (~450ms worst case) ONLY on the cost-miss path (the fire-and-forget cost insert
    // may not have committed yet) — acceptable for a background, never-blocking step.
    // All-null costs → realCostUsd: null (recordCreditDebit no-ops; null vs guessed 0).
    await step.run('record-credit-debit', async () => {
      const svc = requireServiceClient()
      let realCostUsd: number | null = null
      for (let i = 0; i < 3; i++) {
        const { data } = await svc
          .from('ai_cost_events')
          .select('real_cost_usd')
          .eq('attempt_id', attemptId)
        const rows = (data ?? []) as { real_cost_usd: number | null }[]
        if (rows.length > 0) {
          const known = rows
            .map((r) => r.real_cost_usd)
            .filter((c): c is number => c != null)
          realCostUsd = known.length > 0 ? known.reduce((a, b) => a + b, 0) : null
          break
        }
        await new Promise((r) => setTimeout(r, 150))
      }
      await recordCreditDebit({ companyId, operationType: 'estimate', realCostUsd, attemptId })
    })

    // Phase 92 (EVENT-02/D-03): resolve the new estimate id from the AI result
    // (trivially in scope — GenerateEstimateResult.estimateId; no extra query).
    const estimateId =
      (result as { estimateId?: string | null } | null)?.estimateId ?? null

    // Phase 92 (EVENT-02/D-03): terminal succeeded generate_estimate event.
    // provider left null (Open-Question 2 — not trivially in scope here, nullable).
    void recordPipelineEvent({
      attemptId,
      inputType,
      step: 'generate_estimate',
      status: 'succeeded',
      companyId,
      projectId,
      userId: ownerUserId,
      estimateId,
      provider: null,
      durationMs: Date.now() - t0,
    })

    // Phase 92 (EVENT-02/D-04, Open-Question 3): preview_redirect succeeded marker.
    // The client redirect (router.push to ?tab=estimate) is non-instrumentable per
    // D-04, so we emit this server-side logical "reached preview" terminal marker
    // from the generate succeeded path — the deterministic consequence of success.
    void recordPipelineEvent({
      attemptId,
      inputType,
      step: 'preview_redirect',
      status: 'succeeded',
      companyId,
      projectId,
      userId: ownerUserId,
      estimateId,
      provider: null,
      durationMs: null,
    })

    // Phase 77 NOTIF-04: success notification (opt-in via DEFAULT_PREFERENCES
    // for ai_job category — both channels default OFF, so only users who
    // explicitly opt in will see this).
    try {
      const userId = await loadOwnerUserId(companyId)
      const copy = buildNotificationCopy('ai_job.completed', {
        jobType: 'Estimate generation',
      })
      void notify({
        companyId,
        userId,
        eventType: 'ai_job.completed',
        title: copy.title,
        body: copy.body,
        linkUrl: `/projects/${projectId}`,
        resourceType: 'project',
        resourceId: projectId,
        metadata: { dedupe_key: `ai-ok-estimate-${requestId}` },
      })
    } catch {
      /* best-effort */
    }

    return result
  }
)
