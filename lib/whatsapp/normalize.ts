/**
 * Quick task 260603-lrf — Task 1.
 *
 * normalizeMessage turns ANY inbound WhatsApp message into plain text BEFORE the
 * intent classifier runs, so audio/photo arriving mid-confirmation is read (not
 * rejected with a canned reply).
 *
 * It reuses the EXACT same provider path the estimate flow uses today:
 *   - audio → downloadWhatsAppMedia + transcribeAudioOR (OpenAI whisper-1 direct)
 *   - photo → downloadWhatsAppMedia + analyzePhotoOR (OpenRouter vision)
 *   - text  → passthrough
 * The mime/ext derivation (strip codec param, remap mp4 → m4a) is copied verbatim
 * from estimate-graph.ts processMessageNode — the m4a remap is load-bearing for
 * Whisper container detection.
 *
 * NEVER throws — failures return { ok: false, reason } so the router can fall
 * back to a graceful "couldn't read your message, please describe in text" reply.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { transcribeAudioOR, analyzePhotoOR } from '@/lib/ai/openrouter-client'
import { downloadWhatsAppMedia } from '@/lib/whatsapp/client'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'

export type NormalizeKind = 'text' | 'audio' | 'photo' | 'unknown'

export interface NormalizeResult {
  text: string
  kind: NormalizeKind
  ok: boolean
  reason?: string
}

export async function normalizeMessage(
  msg: WhatsAppMessage,
  _companyId: string,
  // supabase reserved for future enrichment (e.g. media re-download); kept in the
  // signature so callers don't churn when that lands.
  _supabase: SupabaseClient
): Promise<NormalizeResult> {
  // --- text ---------------------------------------------------------------
  if (msg.type === 'text' && msg.text?.body) {
    return { text: msg.text.body, kind: 'text', ok: true }
  }

  // --- audio --------------------------------------------------------------
  if (msg.type === 'audio' && msg.audio?.id) {
    // Strip the codec parameter ("audio/ogg; codecs=opus" → "audio/ogg"),
    // then remap mp4 → m4a so OpenAI Whisper identifies the container.
    const mimeType = (msg.audio.mime_type ?? 'audio/ogg').split(';')[0].trim()
    const rawExt = mimeType.split('/')[1] ?? 'ogg'
    const ext = rawExt === 'mp4' ? 'm4a' : rawExt

    let buf: Buffer
    try {
      buf = await downloadWhatsAppMedia(msg.audio.id)
    } catch (err) {
      console.error('[normalize] audio download failed:', err)
      return { text: '', kind: 'audio', ok: false, reason: 'download_failed' }
    }

    try {
      const text = await transcribeAudioOR(
        new Blob([new Uint8Array(buf)], { type: mimeType }),
        ext
      )
      if (!text) return { text: '', kind: 'audio', ok: false, reason: 'empty_transcript' }
      return { text, kind: 'audio', ok: true }
    } catch (err) {
      console.error('[normalize] audio transcription failed:', err)
      return { text: '', kind: 'audio', ok: false, reason: 'transcription_failed' }
    }
  }

  // --- image --------------------------------------------------------------
  if (msg.type === 'image' && msg.image?.id) {
    const mimeType = msg.image.mime_type ?? 'image/jpeg'

    let buf: Buffer
    try {
      buf = await downloadWhatsAppMedia(msg.image.id)
    } catch (err) {
      console.error('[normalize] image download failed:', err)
      return { text: '', kind: 'photo', ok: false, reason: 'download_failed' }
    }

    try {
      const description = await analyzePhotoOR(buf.toString('base64'), mimeType)
      const caption = msg.image.caption?.trim()
      const text = caption ? `${caption}\n\n${description}` : description
      if (!text) return { text: '', kind: 'photo', ok: false, reason: 'empty_analysis' }
      return { text, kind: 'photo', ok: true }
    } catch (err) {
      console.error('[normalize] image analysis failed:', err)
      return { text: '', kind: 'photo', ok: false, reason: 'analysis_failed' }
    }
  }

  // --- anything else (document/video/sticker/reaction/unknown) ------------
  return { text: '', kind: 'unknown', ok: false, reason: 'unsupported_type' }
}
