/**
 * Phase 67: Inngest function — Claude Vision analysis with one step.run per photo.
 * Each photo is independently retriable, so partial failures don't re-charge for
 * already-analyzed photos.
 *
 * Implements:
 *   - INNGEST-04 (analyze-photos route returns jobId; Vision moves to worker)
 *   - INNGEST-06 (idempotent via event.data.requestId)
 */
import Anthropic from '@anthropic-ai/sdk'
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'
import { recordUsage } from '@/lib/quota'
import {
  EVENT_ANALYZE_PHOTOS,
  type AnalyzePhotosPayload,
} from '@/lib/inngest/events'

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
          const anthropicKey = await getIntegrationKey('anthropic')
          if (!anthropicKey) throw new Error('Anthropic key not configured')

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

          const anthropic = new Anthropic({ apiKey: anthropicKey })
          const res = await anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 200,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: mimeType,
                      data: base64,
                    },
                  },
                  {
                    type: 'text',
                    text: "Describe this photo from a contractor's perspective. Note materials, conditions, measurements if visible, damage, and areas needing work. Be specific and concise.",
                  },
                ],
              },
            ],
          })

          const description =
            res.content[0]?.type === 'text' ? res.content[0].text : ''
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

    return { results: descriptions }
  }
)
