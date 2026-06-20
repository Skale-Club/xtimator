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
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'
import { recordPipelineEvent } from '@/lib/observability/pipeline-events'
import {
  EVENT_ESTIMATE_GENERATE,
  type EstimateGeneratePayload,
} from '@/lib/inngest/events'

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
    },
  },
  async ({ event, step }) => {
    const data = event.data as EstimateGeneratePayload
    const { companyId, projectId, requestId, language, prompts } = data
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
      return graph.invoke({
        companyId,
        projectId,
        channel: 'web',
        prompts: prompts && prompts.length > 0 ? prompts : undefined,
        estimateLanguage: language ?? undefined,
      })
    })

    // Step 2: Record usage ONLY on AI success — separate step so a DB write
    // failure can retry independently. usage_events partial UNIQUE index on
    // (company_id, idempotency_key) makes this idempotent at the DB layer.
    await step.run('record-usage', async () => {
      const supabase = requireServiceClient()
      await recordUsage(supabase, companyId, 'estimate_generated', 1, requestId)
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
