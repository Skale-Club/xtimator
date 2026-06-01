/**
 * Phase 67: Inngest function — replaces the inline Whisper/Vision/generate sequence
 * in lib/whatsapp/handler.ts:processInboundMessages. Single function, N+2 sequential
 * step.run blocks (one per inbound message + generate-estimate + confirm reply).
 *
 * Implements:
 *   - INNGEST-07 (WhatsApp handler dispatches via Inngest)
 *   - INNGEST-06 (idempotent via event.data.batchKey)
 */
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { transcribeAudioOR, analyzePhotoOR } from '@/lib/ai/openrouter-client'
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
import { formatMoney } from '@/lib/money/currency'
import {
  isVagueEstimate,
  buildAskDetailsMessage,
  revertVagueEstimate,
} from '@/lib/whatsapp/ask-details'
import { logOutboundMessage } from '@/lib/whatsapp/conversations'
import { getServerStorage } from '@/lib/storage'

const SESSION_TTL_MINUTES = 30

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
    // Steps return { ok: true } on success or { ok: false, reason } on handled
    // errors (e.g. audio transcription failure) so the outer loop can send a
    // user-facing WhatsApp message instead of silently failing.
    const stepResults: Array<{ ok: boolean; reason?: string }> = []

    for (const msg of messages) {
      const result = await step.run(`process-${msg.id}`, async () => {
        const supabase = requireServiceClient()
        if (msg.type === 'text' && msg.text?.body) {
          await supabase.from('recordings').insert({
            project_id: projectId,
            company_id: companyId,
            storage_path: null,
            transcript: msg.text.body,
            duration_seconds: null,
          })
          return { ok: true }
        } else if (msg.type === 'audio' && msg.audio?.id) {
          // Derive MIME type and extension from the message — WhatsApp sends
          // "audio/ogg; codecs=opus" (Android) or "audio/mp4" (iOS). Strip the
          // codec parameter before splitting, and remap mp4 → m4a so OpenAI
          // Whisper can identify the container from the filename.
          const mimeType = (msg.audio.mime_type ?? 'audio/ogg').split(';')[0].trim()
          const rawExt = mimeType.split('/')[1] ?? 'ogg'
          const ext = rawExt === 'mp4' ? 'm4a' : rawExt
          let audioBuffer: Buffer
          try {
            audioBuffer = await downloadWhatsAppMedia(msg.audio.id)
          } catch (err) {
            console.error('[WhatsApp] audio download failed:', err)
            return { ok: false, reason: 'download_failed' }
          }
          // Upload audio to private storage bucket BEFORE transcription so the
          // inbox can play it back even if transcription fails (e.g. missing key).
          const storagePath = `${companyId}/whatsapp/${msg.id}.${ext}`
          try {
            await getServerStorage().upload('audio', storagePath, audioBuffer, {
              contentType: mimeType,
              upsert: false,
            })
            await supabase
              .from('whatsapp_messages')
              .update({ media_url: storagePath })
              .eq('wa_message_id', msg.id)
              .eq('company_id', companyId)
          } catch {
            // Non-fatal — inbox falls back to emoji text if storage fails
          }
          let transcript: string
          try {
            transcript = await transcribeAudioOR(
              new Blob([new Uint8Array(audioBuffer)], { type: mimeType }),
              ext
            )
          } catch (err) {
            console.error('[WhatsApp] audio transcription failed:', err)
            return { ok: false, reason: 'transcription_failed' }
          }
          if (!transcript) return { ok: false, reason: 'empty_transcript' }
          await supabase.from('recordings').insert({
            project_id: projectId,
            company_id: companyId,
            storage_path: null,
            transcript,
            duration_seconds: null,
          })
          return { ok: true }
        } else if (msg.type === 'image' && msg.image?.id) {
          const imageBuffer = await downloadWhatsAppMedia(msg.image.id)
          const mimeType = msg.image.mime_type ?? 'image/jpeg'
          const ext = mimeType.split('/')[1] ?? 'jpg'
          const storagePath = `${companyId}/whatsapp/${projectId}-${msg.image.id}.${ext}`
          await supabase.storage.from('photos').upload(storagePath, imageBuffer, {
            contentType: mimeType,
            upsert: false,
          })
          const aiDescription = await analyzePhotoOR(
            imageBuffer.toString('base64'),
            mimeType
          )
          await supabase.from('photos').insert({
            project_id: projectId,
            company_id: companyId,
            storage_path: storagePath,
            ai_description: aiDescription || null,
            caption: msg.image.caption ?? null,
            sort_order: 0,
          })
          return { ok: true }
        }
        return { ok: true }
      })
      stepResults.push(result as { ok: boolean; reason?: string })
    }

    // If ALL message steps failed (e.g. audio transcription unavailable and no
    // text/image in the batch), reply with a user-facing error instead of
    // silently failing to generate an estimate.
    const hasUsableInput = stepResults.some((r) => r.ok)
    if (!hasUsableInput) {
      await step.run('send-audio-error', async () => {
        const body =
          "Sorry, I couldn't process your audio message. Please describe the job in a text message and I'll generate an estimate for you."
        await sendWhatsAppMessage(ownerPhone, { type: 'text', text: { body } })
        await logOutboundMessage(requireServiceClient(), {
          companyId,
          contactPhone: ownerPhone,
          body,
          msgType: 'text',
          status: 'sent',
        }).catch(() => undefined)
      })
      return
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

    // Re-evaluate "vagueness" — vague inbound text often yields a $0 estimate
    // with no line items. In that case ask the owner for more details instead of
    // sending a useless $0 confirmation. (Quick task 260529-lc0)
    const isVague = await step.run('evaluate-vagueness', async () => {
      const supabase = requireServiceClient()
      const { data: est } = await supabase
        .from('estimates')
        .select('total, sections:estimate_sections(items:estimate_items(id))')
        .eq('id', result.estimateId)
        .single()
      return isVagueEstimate(
        est as {
          total: number | null
          sections: Array<{ items?: Array<unknown> | null }> | null
        } | null
      )
    })

    if (isVague) {
      await step.run('ask-details', async () => {
        const supabase = requireServiceClient()
        // Remove the $0 estimate and revert the project to draft so the next
        // inbound message regenerates cleanly against the same project.
        await revertVagueEstimate(supabase, projectId, result.estimateId)
        const expiresAt = new Date(
          Date.now() + SESSION_TTL_MINUTES * 60 * 1000
        ).toISOString()
        await supabase.from('whatsapp_sessions').insert({
          company_id: companyId,
          phone_number: ownerPhone,
          state: 'awaiting_details',
          draft_project_id: projectId,
          draft_estimate_id: null,
          expires_at: expiresAt,
        })
        const body = buildAskDetailsMessage(result.language)
        await sendWhatsAppMessage(ownerPhone, { type: 'text', text: { body } })
        await logOutboundMessage(requireServiceClient(), {
          companyId,
          contactPhone: ownerPhone,
          body,
          msgType: 'text',
          status: 'sent',
        }).catch(() => undefined)
      })
      return result
    }

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
          'total, currency_code, summary, sections:estimate_sections(title, subtotal)'
        )
        .eq('id', result.estimateId)
        .single()
      const totalNum =
        (estimate as { total: number } | null)?.total ?? 0
      const currencyCode =
        (estimate as { currency_code: string | null } | null)?.currency_code ?? 'USD'
      const total = formatMoney(totalNum, currencyCode)
      const sectionRows =
        (estimate as {
          sections?: Array<{ title: string; subtotal: number }>
        } | null)?.sections ?? []
      const sections = sectionRows
        .map(
          (s) =>
              `- ${s.title}: ${formatMoney(s.subtotal, currencyCode)}`
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
      await logOutboundMessage(requireServiceClient(), {
        companyId,
        contactPhone: ownerPhone,
        body,
        msgType: 'text',
        status: 'sent',
      }).catch(() => undefined)
    })

    return result
  }
)
