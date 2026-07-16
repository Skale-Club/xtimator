/**
 * lib/whatsapp/media.ts
 *
 * SINGLE source of the WhatsApp-specific inbound-media logic shared by BOTH
 * ingestion paths:
 *   1. the intent-router path — lib/whatsapp/normalize.ts (normalizeMessage) →
 *      lib/agent-tools/normalize-input.ts (normalizeInput), and
 *   2. the CREATE-graph adapter — lib/estimate/adapters/whatsapp.ts
 *      (processMessageNode).
 *
 * Before this module the codec/extension derivation ("audio/ogg; codecs=opus" →
 * "audio/ogg", the load-bearing mp4 → m4a remap for OpenAI Whisper container
 * detection, the image jpeg default) and the buffer → transcript / buffer →
 * description invocation over the channel-neutral `ingestMultimodal` primitive
 * were copy-pasted into both files. They now live here, once.
 *
 * SCOPE: this module owns ONLY the download-agnostic media transforms — MIME/
 * codec/extension derivation + the transcribe/vision invocation. The CREATE
 * path's persistence side-effects (storage upload, whatsapp_messages.media_url
 * update, recordings/photos inserts) stay in the adapter, composed AROUND these
 * helpers, because they interleave with the download/transcribe steps and are
 * specific to that path. The actual media download stays with its owner
 * (downloadWhatsAppMedia in lib/whatsapp/client.ts), called by each path so the
 * per-path failure mapping (NormalizeResult vs mediaResults) is preserved.
 *
 * The transcribe/vision wrappers NEVER throw for a provider failure:
 * ingestMultimodal already swallows per-item failures and returns [], so the
 * wrappers surface '' which each caller maps to its own empty-transcript /
 * empty-analysis outcome. (Callers still wrap the call in a try/catch to preserve
 * the belt-and-suspenders transcription_failed / unknown_error reasons unchanged.)
 */
import { ingestMultimodal } from '@/lib/estimate/ingest/multimodal'

export interface WhatsAppMediaFormat {
  /** MIME type with any codec parameter stripped (e.g. "audio/ogg"). */
  mimeType: string
  /** Container extension for the transcriber / storage key (mp4 remapped to m4a). */
  ext: string
}

/**
 * Derive the MIME type + container extension for an inbound WhatsApp AUDIO
 * message. WhatsApp sends "audio/ogg; codecs=opus" (Android) or "audio/mp4"
 * (iOS). Strip the codec parameter before splitting, and remap mp4 → m4a so
 * OpenAI Whisper can identify the container from the filename.
 */
export function deriveAudioFormat(mimeTypeRaw?: string): WhatsAppMediaFormat {
  const mimeType = (mimeTypeRaw ?? 'audio/ogg').split(';')[0].trim()
  const rawExt = mimeType.split('/')[1] ?? 'ogg'
  const ext = rawExt === 'mp4' ? 'm4a' : rawExt
  return { mimeType, ext }
}

/**
 * Derive the MIME type + extension for an inbound WhatsApp IMAGE message.
 * Defaults to image/jpeg (WhatsApp's default) and derives the extension from the
 * MIME subtype (jpeg → "jpeg", falling back to "jpg").
 */
export function deriveImageFormat(mimeTypeRaw?: string): WhatsAppMediaFormat {
  const mimeType = mimeTypeRaw ?? 'image/jpeg'
  const ext = mimeType.split('/')[1] ?? 'jpg'
  return { mimeType, ext }
}

/**
 * Transcribe a downloaded WhatsApp audio buffer via the channel-neutral
 * ingestion path (UNIFY-01). Builds the container-typed Blob and returns the
 * transcript, or '' when ingestMultimodal skipped the item (empty result).
 */
export async function transcribeAudioBuffer(
  buffer: Buffer,
  format: WhatsAppMediaFormat
): Promise<string> {
  const { transcripts } = await ingestMultimodal({
    audio: [
      { blob: new Blob([new Uint8Array(buffer)], { type: format.mimeType }), ext: format.ext },
    ],
  })
  return transcripts[0] ?? ''
}

/**
 * Analyze a downloaded WhatsApp image buffer via the channel-neutral ingestion
 * path (UNIFY-01). Returns the AI description, or '' when ingestMultimodal
 * skipped the item (empty result).
 */
export async function analyzeImageBuffer(buffer: Buffer, mimeType: string): Promise<string> {
  const { photoDescriptions } = await ingestMultimodal({
    photos: [{ base64: buffer.toString('base64'), mimeType }],
  })
  return photoDescriptions[0] ?? ''
}
