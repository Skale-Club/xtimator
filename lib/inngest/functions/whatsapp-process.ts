/**
 * Phase 67: Inngest function — replaces the inline Whisper/Vision/generate sequence
 * in lib/whatsapp/handler.ts:processInboundMessages. Single function, N+2 sequential
 * step.run blocks (one per inbound message + generate-estimate + confirm reply).
 *
 * Implements:
 *   - INNGEST-07 (WhatsApp handler dispatches via Inngest)
 *   - INNGEST-06 (idempotent via event.data.batchKey)
 */
import Anthropic from '@anthropic-ai/sdk'
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { getIntegrationKey } from '@/lib/platform-config'
import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import {
  downloadWhatsAppMedia,
  sendWhatsAppMessage,
  sendTypingIndicator,
} from '@/lib/whatsapp/client'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'
import {
  EVENT_WHATSAPP_PROCESS,
  type WhatsAppProcessPayload,
} from '@/lib/inngest/events'

const SESSION_TTL_MINUTES = 30

type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

export const whatsAppProcessJob = inngest.createFunction(
  {
    id: 'whatsapp-process',
    idempotency: 'event.data.batchKey',
    retries: 1,
    triggers: [{ event: EVENT_WHATSAPP_PROCESS }],
  },
  async ({ event, step }) => {
    const data = event.data as Omit<WhatsAppProcessPayload, 'messages'> & {
      messages: WhatsAppMessage[]
    }
    const { companyId, projectId, ownerPhone, messages } = data

    // ONE step.run per inbound message — each independently retriable.
    for (const msg of messages) {
      await step.run(`process-${msg.id}`, async () => {
        const supabase = requireServiceClient()
        if (msg.type === 'text' && msg.text?.body) {
          await supabase.from('recordings').insert({
            project_id: projectId,
            company_id: companyId,
            storage_path: null,
            transcript: msg.text.body,
            duration_seconds: null,
          })
        } else if (msg.type === 'audio' && msg.audio?.id) {
          const openaiKey = await getIntegrationKey('openai')
          if (!openaiKey) throw new Error('OpenAI key not configured')
          const audioBuffer = await downloadWhatsAppMedia(msg.audio.id)
          const form = new FormData()
          form.append(
            'file',
            new Blob([new Uint8Array(audioBuffer)], { type: 'audio/ogg' }),
            'audio.ogg'
          )
          form.append('model', 'whisper-1')
          form.append('response_format', 'text')
          const res = await fetch(
            'https://api.openai.com/v1/audio/transcriptions',
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${openaiKey}` },
              body: form,
            }
          )
          if (!res.ok) {
            throw new Error(
              `Whisper failed: ${await res.text().catch(() => 'unknown')}`
            )
          }
          const transcript = (await res.text()).trim()
          if (!transcript) throw new Error('Empty transcription')
          await supabase.from('recordings').insert({
            project_id: projectId,
            company_id: companyId,
            storage_path: null,
            transcript,
            duration_seconds: null,
          })
        } else if (msg.type === 'image' && msg.image?.id) {
          const anthropicKey = await getIntegrationKey('anthropic')
          if (!anthropicKey) throw new Error('Anthropic key not configured')
          const imageBuffer = await downloadWhatsAppMedia(msg.image.id)
          const mimeType = (msg.image.mime_type ??
            'image/jpeg') as ImageMediaType
          const ext = mimeType.split('/')[1] ?? 'jpg'
          const storagePath = `${companyId}/whatsapp/${projectId}-${msg.image.id}.${ext}`
          await supabase.storage.from('photos').upload(storagePath, imageBuffer, {
            contentType: mimeType,
            upsert: false,
          })
          const anthropic = new Anthropic({ apiKey: anthropicKey })
          const visionRes = await anthropic.messages.create({
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
                      data: imageBuffer.toString('base64'),
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
          const aiDescription =
            visionRes.content[0]?.type === 'text' ? visionRes.content[0].text : ''
          await supabase.from('photos').insert({
            project_id: projectId,
            company_id: companyId,
            storage_path: storagePath,
            ai_description: aiDescription || null,
            caption: msg.image.caption ?? null,
            sort_order: 0,
          })
        }
      })
    }

    // Refresh typing indicator before AI generation (best-effort)
    await step.run('refresh-typing', async () => {
      const lastMsgId = messages[messages.length - 1]?.id
      if (lastMsgId) await sendTypingIndicator(lastMsgId).catch(() => undefined)
    })

    // Generate estimate from the aggregated project
    const result = await step.run('generate-estimate', async () => {
      return await generateEstimateForProject(companyId, projectId)
    })

    // Create awaiting_confirm session + send confirmation summary
    await step.run('confirm-and-session', async () => {
      const supabase = requireServiceClient()
      const expiresAt = new Date(
        Date.now() + SESSION_TTL_MINUTES * 60 * 1000
      ).toISOString()
      await supabase.from('whatsapp_sessions').insert({
        company_id: companyId,
        phone_number: ownerPhone,
        state: 'awaiting_confirm',
        draft_project_id: projectId,
        draft_estimate_id: result.estimateId,
        expires_at: expiresAt,
      })
      const { data: estimate } = await supabase
        .from('estimates')
        .select(
          'total, summary, sections:estimate_sections(title, subtotal)'
        )
        .eq('id', result.estimateId)
        .single()
      const totalNum =
        (estimate as { total: number } | null)?.total ?? 0
      const total = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(totalNum)
      const sectionRows =
        (estimate as {
          sections?: Array<{ title: string; subtotal: number }>
        } | null)?.sections ?? []
      const sections = sectionRows
        .map(
          (s) =>
            `- ${s.title}: ${new Intl.NumberFormat('en-US', {
              style: 'currency',
              currency: 'USD',
            }).format(s.subtotal)}`
        )
        .join('\n')
      const body = [
        `Estimate ready - ${total}`,
        '',
        sections,
        '',
        'Reply *send* to deliver to your client, or *cancel* to discard.',
      ].join('\n')
      await sendWhatsAppMessage(ownerPhone, { type: 'text', text: { body } })
    })

    return result
  }
)
