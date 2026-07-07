/**
 * Phase 67: Inngest function — Claude Vision analysis with one step.run per photo.
 * Each photo is independently retriable, so partial failures don't re-charge for
 * already-analyzed photos.
 *
 * Implements:
 *   - INNGEST-04 (analyze-photos route returns jobId; Vision moves to worker)
 *   - INNGEST-06 (idempotent via event.data.requestId)
 */
import { randomUUID } from 'node:crypto'
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { analyzePhotoOR } from '@/lib/ai/openrouter-client'
import { recordUsage } from '@/lib/quota'
import { recordCreditDebit } from '@/lib/billing/credit-ledger'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'
import { recordPipelineEvent } from '@/lib/observability/pipeline-events'
import { notifyOps } from '@/lib/observability/ops-alert'
import {
  EVENT_ANALYZE_PHOTOS,
  EVENT_ESTIMATE_GENERATE,
  type AnalyzePhotosPayload,
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

// Server-side ceiling on photos analyzed per job. The client caps at 16
// (capture-recorder.tsx), but that's UI-only — createPhoto has no server
// limit, so a caller could otherwise queue hundreds of Vision calls in a
// single dispatch.
const MAX_PHOTOS_PER_JOB = 20

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

function getMimeType(storagePath: string): ImageMediaType {
  const ext = storagePath.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'png':
      return 'image/png'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    default:
      return 'image/jpeg'
  }
}

export const analyzePhotosJob = inngest.createFunction(
  {
    id: 'analyze-photos',
    idempotency: 'event.data.requestId',
    retries: 2,
    triggers: [{ event: EVENT_ANALYZE_PHOTOS }],
    // Phase 77 NOTIF-04: ai_job.failed on retry exhaustion.
    onFailure: async ({ event, error }) => {
      const payload = (event as { data?: { event?: { data?: AnalyzePhotosPayload } } })
        .data?.event?.data
      if (!payload) return
      const userId = await loadOwnerUserId(payload.companyId)

      // Phase 92 (EVENT-02/D-05): terminal failed analyze event via onFailure.
      void recordPipelineEvent({
        attemptId: payload.attemptId ?? randomUUID(),
        inputType: payload.inputType ?? 'photo',
        step: 'analyze',
        status: 'failed',
        companyId: payload.companyId,
        projectId: payload.projectId,
        userId,
        provider: 'openrouter',
        errorMessage: error instanceof Error ? error.message : String(error),
      })
      const copy = buildNotificationCopy('ai_job.failed', {
        jobType: 'Photo analysis',
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
        metadata: { dedupe_key: `ai-fail-photos-${payload.requestId}` },
      })

      // quick-260705-c1y-03: additive ops alert (never-throw fire-and-forget)
      // alongside the tenant notify above — routes terminal vision failures to the
      // operator's Telegram once configured. Does not gate or alter notify().
      void notifyOps({
        kind: 'vision_failed',
        title: 'Photo analysis failed after retries',
        message: `company=${payload.companyId} project=${payload.projectId} request=${payload.requestId} err=${error instanceof Error ? error.message : String(error)}`,
        severity: 'error',
        dedupeKey: `vision_fail:${payload.companyId}`,
        suppressWindowSec: 600,
      })
    },
  },
  async ({ event, step }) => {
    const data = event.data as AnalyzePhotosPayload
    const { companyId, projectId, requestId } = data
    // Phase 92 (EVENT-02/D-08): attempt lineage with server fallback.
    const attemptId = data.attemptId ?? randomUUID()
    const inputType = data.inputType ?? 'photo'
    const t0 = Date.now()

    // Phase 92 (EVENT-02/D-03): started analyze event at handler entry.
    const ownerUserId = await loadOwnerUserId(companyId)
    void recordPipelineEvent({
      attemptId,
      inputType,
      step: 'analyze',
      status: 'started',
      companyId,
      projectId,
      userId: ownerUserId,
    })

    // Step 1: Load photo list (cheap; checkpointed so a retry skips the query).
    // Security: this runs on the service-role client (bypasses RLS), so the
    // query MUST scope by company_id — not project_id alone — or any caller
    // able to dispatch this event with a foreign projectId could trigger paid
    // Vision analysis (and an ai_description overwrite) on another tenant's
    // photos. Capped at 20 photos/job — MAX_PHOTOS_PER_JOB below — since the
    // client-side cap (capture-recorder.tsx) is not enforced server-side.
    const photos = await step.run('load-photos', async () => {
      const supabase = requireServiceClient()
      const { data } = await supabase
        .from('photos')
        .select('id, storage_path')
        .eq('project_id', projectId)
        .eq('company_id', companyId)
        .order('sort_order')
        .limit(MAX_PHOTOS_PER_JOB)
      return (data ?? []) as Array<{ id: string; storage_path: string }>
    })

    // Step 2: ONE step.run PER photo — each independently retriable.
    // Promise.all parallelizes within Inngest's concurrency model; if one
    // photo fails the others remain checkpointed and won't re-call Anthropic.
    const descriptions = await Promise.all(
      photos.map((photo) =>
        step.run(`vision-${photo.id}`, async () => {
          const supabase = requireServiceClient()

          const { data: fileData, error: dlErr } = await supabase.storage
            .from('photos')
            .download(photo.storage_path)
          if (dlErr || !fileData) {
            throw new Error(
              `Failed to download photo ${photo.id}: ${dlErr?.message ?? 'no data'}`
            )
          }

          const arrayBuffer = await fileData.arrayBuffer()
          const base64 = Buffer.from(arrayBuffer).toString('base64')
          const mimeType = getMimeType(photo.storage_path)

          const description = await analyzePhotoOR(base64, mimeType)
          await supabase
            .from('photos')
            .update({ ai_description: description })
            .eq('id', photo.id)
          return { photoId: photo.id, description }
        })
      )
    )

    // 260707-hhp (P1): when the client requested fire-and-forget mode, chain
    // directly into estimate generation now that descriptions are persisted —
    // mirrors transcribe-audio.ts's dispatch-generate-estimate step exactly.
    if (data.autoGenerateEstimate && projectId) {
      await step.run('dispatch-generate-estimate', async () => {
        const reqId = data.requestId ?? randomUUID()
        await inngest.send({
          name: EVENT_ESTIMATE_GENERATE,
          id: `estimate-${projectId}-${reqId}`,
          data: {
            companyId,
            projectId,
            requestId: reqId,
            language: data.estimateLanguage,
            attemptId: data.attemptId,
            inputType: 'photo' as const,
            channel: 'web' as const,
          },
        })
      })
    }

    // Step 3: Final step — record usage on success only.
    await step.run('record-usage', async () => {
      const supabase = requireServiceClient()
      await recordUsage(
        supabase,
        companyId,
        'photo_analyzed',
        photos.length,
        requestId
      )
    })

    // Phase 112 (CREDIT-02): fire the credit debit AFTER record-usage, in its own
    // retry-isolated step. recordCreditDebit is never-throw, so a ledger failure
    // never breaks analysis; enforcement is OFF, so this RECORDS but never blocks.
    // The per-photo vision cost was captured deep at the provider seam (void
    // recordAICost — RESEARCH Pitfall 6), so read it BACK from ai_cost_events by
    // attemptId and SUM all rows — the per-photo `vision` sub-calls roll up into the
    // single `photo_batch` debit (Open Question 2). Bounded read-back: up to 3×150ms
    // (~450ms worst case) ONLY on the cost-miss path — fine for a background step.
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
      await recordCreditDebit({ companyId, operationType: 'photo_batch', realCostUsd, attemptId })
    })

    // Phase 92 (EVENT-02/D-03): terminal succeeded analyze event with duration_ms.
    void recordPipelineEvent({
      attemptId,
      inputType,
      step: 'analyze',
      status: 'succeeded',
      companyId,
      projectId,
      userId: ownerUserId,
      provider: 'openrouter',
      durationMs: Date.now() - t0,
    })

    // Phase 77 NOTIF-04: opt-in success notification.
    try {
      const userId = await loadOwnerUserId(companyId)
      const copy = buildNotificationCopy('ai_job.completed', {
        jobType: 'Photo analysis',
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
        metadata: { dedupe_key: `ai-ok-photos-${requestId}` },
      })
    } catch {
      /* best-effort */
    }

    return { results: descriptions }
  }
)
