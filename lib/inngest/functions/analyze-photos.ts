/**
 * Phase 67: Inngest function — Claude Vision analysis with one step.run per photo.
 * Each photo is independently retriable, so partial failures don't re-charge for
 * already-analyzed photos.
 *
 * Implements:
 *   - INNGEST-04 (analyze-photos route returns jobId; Vision moves to worker)
 *   - INNGEST-06 (idempotent via event.data.requestId)
 */
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { analyzePhotoOR } from '@/lib/ai/openrouter-client'
import { recordUsage } from '@/lib/quota'
import { notify } from '@/lib/notifications/dispatch'
import { buildNotificationCopy } from '@/lib/notifications/copy'
import {
  EVENT_ANALYZE_PHOTOS,
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
    },
  },
  async ({ event, step }) => {
    const { companyId, projectId, requestId } =
      event.data as AnalyzePhotosPayload

    // Step 1: Load photo list (cheap; checkpointed so a retry skips the query)
    const photos = await step.run('load-photos', async () => {
      const supabase = requireServiceClient()
      const { data } = await supabase
        .from('photos')
        .select('id, storage_path')
        .eq('project_id', projectId)
        .order('sort_order')
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
