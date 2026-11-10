/**
 * Phase 4 — the ONE decision for every inbound WhatsApp message type.
 *
 * Pure module (no I/O, no imports of server code). The single-message router
 * (intent-router / normalize), the batch handler + CREATE-graph adapter and the
 * awaiting-details path all call classifyInboundMessage so a message type behaves
 * identically everywhere. Only the business owner/team reaches this code (clients
 * are stopped earlier in the webhook).
 *
 * Rules:
 *   text                       process (unchanged)
 *   audio                      process; rejected over MAX_AUDIO_BYTES (size check at download)
 *   image                      process; rejected over MAX_IMAGE_BYTES (size check at download)
 *   video                      never processed: ask for photos or an audio
 *   document / PDF             not supported yet: ask for photos or an audio
 *   sticker / reaction         ignore: no reply, no AI, no message cost
 *   location                   use as the job address (context text)
 *   contacts                   use as the estimate's client (context text)
 *   interactive / button reply the reply title is the owner's text
 *   anything else              one short "not supported" reply
 *
 * Each bot reply is a paid message, so replies are one or two short sentences and
 * localized (pt/en/es).
 */
import type { WhatsAppMessage } from '@/lib/whatsapp/types'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

/** Meta's own cap for audio/voice messages. */
export const MAX_AUDIO_BYTES = 16 * 1024 * 1024
/** Photos above this are rejected before download (vision cost + latency). */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

export type PolicyAction =
  | 'process_text'
  | 'process_audio'
  | 'process_image'
  | 'use_location'
  | 'use_contact'
  | 'reply_unsupported'
  | 'ignore'

export type PolicyReplyKey =
  | 'video_unsupported'
  | 'document_unsupported'
  | 'unknown_unsupported'
  | 'audio_too_long'
  | 'image_too_large'
  | 'audio_unreadable'
  | 'photo_unreadable'

export interface PolicyDecision {
  action: PolicyAction
  /** Machine-readable why (stable strings, used in logs and tests). */
  reason: string
  /**
   * For process_text / use_location / use_contact: the text handed to the agent
   * (or stored as a recordings row in the batch path).
   */
  text?: string
  /** For reply_unsupported: which localized copy to send. */
  reply?: PolicyReplyKey
}

const ignore = (reason: string): PolicyDecision => ({ action: 'ignore', reason })
const unsupported = (reason: string, reply: PolicyReplyKey): PolicyDecision => ({
  action: 'reply_unsupported',
  reason,
  reply,
})

/** "Job location: <name>, <address> (<lat>,<lng>)" — null when there is no usable location. */
export function formatLocationText(loc: WhatsAppMessage['location']): string | null {
  if (!loc) return null
  const hasCoords = Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude)
  const label = [loc.name?.trim(), loc.address?.trim()].filter(Boolean).join(', ')
  if (!label && !hasCoords) return null
  const coords = hasCoords ? `(${loc.latitude},${loc.longitude})` : ''
  return `Job location: ${[label, coords].filter(Boolean).join(' ')}`
}

/** "Client: <name>, <phone>" for each shared contact — null when nothing usable. */
export function formatContactsText(contacts: WhatsAppMessage['contacts']): string | null {
  if (!Array.isArray(contacts)) return null
  const lines: string[] = []
  for (const c of contacts) {
    const name =
      c?.name?.formatted_name?.trim() ||
      [c?.name?.first_name, c?.name?.last_name].filter(Boolean).join(' ').trim()
    const first = c?.phones?.find((p) => p?.wa_id || p?.phone)
    const phone = first?.wa_id ? `+${first.wa_id.replace(/\D/g, '')}` : first?.phone?.trim()
    const parts = [name, phone].filter(Boolean)
    if (parts.length > 0) lines.push(`Client: ${parts.join(', ')}`)
  }
  return lines.length > 0 ? lines.join('\n') : null
}

/** The title/text of an interactive or legacy button reply, or null. */
export function interactiveReplyText(msg: WhatsAppMessage): string | null {
  if (msg.type === 'button') return msg.button?.text?.trim() || null
  const i = msg.interactive
  if (!i) return null
  return (i.button_reply?.title ?? i.list_reply?.title)?.trim() || null
}

export function classifyInboundMessage(msg: WhatsAppMessage): PolicyDecision {
  switch (msg.type) {
    case 'text': {
      const body = msg.text?.body
      return body && body.trim()
        ? { action: 'process_text', reason: 'text', text: body }
        : ignore('empty_text')
    }
    case 'audio':
      return msg.audio?.id
        ? { action: 'process_audio', reason: msg.audio.voice ? 'voice_note' : 'audio' }
        : unsupported('audio_missing_media', 'unknown_unsupported')
    case 'image':
      return msg.image?.id
        ? { action: 'process_image', reason: 'image' }
        : unsupported('image_missing_media', 'unknown_unsupported')
    case 'video':
      return unsupported('video', 'video_unsupported')
    case 'document':
      return unsupported('document', 'document_unsupported')
    case 'sticker':
      return ignore('sticker')
    case 'reaction':
      return ignore('reaction')
    case 'system':
    case 'request_welcome':
      return ignore(msg.type)
    case 'location': {
      const text = formatLocationText(msg.location)
      return text
        ? { action: 'use_location', reason: 'location', text }
        : unsupported('location_empty', 'unknown_unsupported')
    }
    case 'contacts': {
      const text = formatContactsText(msg.contacts)
      return text
        ? { action: 'use_contact', reason: 'contacts', text }
        : unsupported('contacts_empty', 'unknown_unsupported')
    }
    case 'interactive':
    case 'button': {
      const text = interactiveReplyText(msg)
      return text
        ? { action: 'process_text', reason: msg.type === 'button' ? 'button_reply' : 'interactive_reply', text }
        : ignore('interactive_empty')
    }
    default:
      return unsupported('unknown_type', 'unknown_unsupported')
  }
}

/** True when the decision hands plain text to the agent / estimate input. */
export function isTextBearing(d: PolicyDecision): boolean {
  return d.action === 'process_text' || d.action === 'use_location' || d.action === 'use_contact'
}

// ---------------------------------------------------------------------------
// Size limits (checked from Meta's media metadata `file_size`, before download)
// ---------------------------------------------------------------------------

export type MediaKind = 'audio' | 'image'

export function maxBytesFor(kind: MediaKind): number {
  return kind === 'audio' ? MAX_AUDIO_BYTES : MAX_IMAGE_BYTES
}

/** Kind of a media mime type for limit purposes; null when no limit applies. */
export function mediaKindFromMime(mime: string | null | undefined): MediaKind | null {
  const m = (mime ?? '').toLowerCase()
  if (m.startsWith('audio/')) return 'audio'
  if (m.startsWith('image/')) return 'image'
  return null
}

export function isOverMediaLimit(kind: MediaKind, bytes: number | null | undefined): boolean {
  return typeof bytes === 'number' && Number.isFinite(bytes) && bytes > maxBytesFor(kind)
}

/** Thrown by the media download helper when Meta's metadata says the file is too big. */
export class MediaTooLargeError extends Error {
  readonly kind: MediaKind
  readonly bytes: number
  constructor(kind: MediaKind, bytes: number) {
    super(`[WhatsApp] ${kind} too large: ${bytes} bytes (max ${maxBytesFor(kind)})`)
    this.name = 'MediaTooLargeError'
    this.kind = kind
    this.bytes = bytes
  }
}

export function tooLargeReplyKey(kind: MediaKind): PolicyReplyKey {
  return kind === 'audio' ? 'audio_too_long' : 'image_too_large'
}

// ---------------------------------------------------------------------------
// Localized reply copy (short: one or two sentences each)
// ---------------------------------------------------------------------------

const REPLY_COPY: Record<EstimateLanguage, Record<PolicyReplyKey, string>> = {
  pt: {
    video_unsupported: 'Não consigo processar vídeos. Me manda fotos ou um áudio do serviço.',
    document_unsupported: 'Ainda não leio documentos nem PDFs. Me manda fotos ou um áudio do serviço.',
    unknown_unsupported: 'Esse tipo de mensagem eu ainda não entendo. Me manda texto, áudio ou fotos.',
    audio_too_long: 'Esse áudio é longo demais. Me manda em partes menores.',
    image_too_large: 'Essa foto é pesada demais (máximo 10 MB). Me manda uma menor.',
    audio_unreadable: 'Não consegui ouvir seu áudio. Me descreve o serviço por texto.',
    photo_unreadable: 'Não consegui ler sua foto. Me descreve o serviço por texto.',
  },
  en: {
    video_unsupported: "I can't process videos. Send me photos or a voice message of the job.",
    document_unsupported: "I can't read documents or PDFs yet. Send me photos or a voice message of the job.",
    unknown_unsupported: "I don't understand that kind of message yet. Send me text, audio or photos.",
    audio_too_long: 'That audio is too long. Send it in shorter parts.',
    image_too_large: 'That photo is too large (10 MB max). Send a smaller one.',
    audio_unreadable: "Sorry, I couldn't read your audio. Please describe the job in a text message.",
    photo_unreadable: "Sorry, I couldn't read your photo. Please describe the job in a text message.",
  },
  es: {
    video_unsupported: 'No puedo procesar videos. Envíeme fotos o un audio del trabajo.',
    document_unsupported: 'Todavía no leo documentos ni PDFs. Envíeme fotos o un audio del trabajo.',
    unknown_unsupported: 'Todavía no entiendo ese tipo de mensaje. Envíeme texto, audio o fotos.',
    audio_too_long: 'Ese audio es demasiado largo. Envíalo en partes más cortas.',
    image_too_large: 'Esa foto es demasiado pesada (máximo 10 MB). Envíe una más pequeña.',
    audio_unreadable: 'No pude escuchar su audio. Descríbame el trabajo por texto.',
    photo_unreadable: 'No pude leer su foto. Descríbame el trabajo por texto.',
  },
}

export function policyReplyText(key: PolicyReplyKey, language: EstimateLanguage): string {
  return (REPLY_COPY[language] ?? REPLY_COPY.en)[key]
}
