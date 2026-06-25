/**
 * Quick task 260603-lrf — Task 1.
 *
 * normalizeMessage turns ANY inbound WhatsApp message into plain text BEFORE the
 * intent classifier runs, so audio/photo arriving mid-confirmation is read (not
 * rejected with a canned reply).
 *
 * This is now a THIN CHANNEL ADAPTER over the channel-neutral normalizeInput
 * (lib/agent-tools/normalize-input.ts, which wraps the ingestMultimodal
 * primitive). The WhatsApp-specific parts kept here:
 *   - downloadWhatsAppMedia (media fetch by id)
 *   - the mime/ext derivation: strip the codec param + remap mp4 → m4a (the m4a
 *     remap is load-bearing for OpenAI Whisper container detection)
 *   - the WhatsAppMessage type-switch
 * The actual transcribe/analyze is delegated to normalizeInput.
 *
 * NEVER throws — failures return { ok: false, reason } so the router can fall
 * back to a graceful "couldn't read your message, please describe in text" reply.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { downloadWhatsAppMedia } from '@/lib/whatsapp/client'
import type { WhatsAppMessage } from '@/lib/whatsapp/types'
import {
  normalizeInput,
  type NormalizeKind,
  type NormalizeResult,
} from '@/lib/agent-tools/normalize-input'

// Re-exported so existing importers (intent-router) keep their type imports
// stable while the implementation home moves to lib/agent-tools/.
export type { NormalizeKind, NormalizeResult }

export async function normalizeMessage(
  msg: WhatsAppMessage,
  _companyId: string,
  // supabase reserved for future enrichment (e.g. media re-download); kept in the
  // signature so callers don't churn when that lands.
  _supabase: SupabaseClient
): Promise<NormalizeResult> {
  // --- text ---------------------------------------------------------------
  if (msg.type === 'text' && msg.text?.body) {
    return normalizeInput({ kind: 'text', body: msg.text.body })
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

    return normalizeInput({
      kind: 'audio',
      blob: new Blob([new Uint8Array(buf)], { type: mimeType }),
      ext,
    })
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

    return normalizeInput({
      kind: 'photo',
      base64: buf.toString('base64'),
      mimeType,
      caption: msg.image.caption?.trim(),
    })
  }

  // --- anything else (document/video/sticker/reaction/unknown) ------------
  return { text: '', kind: 'unknown', ok: false, reason: 'unsupported_type' }
}
