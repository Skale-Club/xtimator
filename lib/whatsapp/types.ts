// WhatsApp Cloud API v21.0 — inbound payload shapes

export interface WhatsAppTextMessage {
  type: 'text'
  text: { body: string }
}

export interface WhatsAppAudioMessage {
  type: 'audio'
  audio: { id: string; mime_type: string }
}

export interface WhatsAppImageMessage {
  type: 'image'
  image: { id: string; mime_type: string; caption?: string }
}

export type WhatsAppMessageType = WhatsAppTextMessage | WhatsAppAudioMessage | WhatsAppImageMessage

/** Meta `location` message body. */
export interface WhatsAppLocation {
  latitude: number
  longitude: number
  name?: string
  address?: string
}

/** One entry of a Meta `contacts` (shared contact card) message. */
export interface WhatsAppSharedContact {
  name?: { formatted_name?: string; first_name?: string; last_name?: string }
  phones?: Array<{ phone?: string; wa_id?: string; type?: string }>
}

/** Meta `interactive` reply (tap on a reply button or a list row). */
export interface WhatsAppInteractiveReply {
  type?: 'button_reply' | 'list_reply' | string
  button_reply?: { id?: string; title?: string }
  list_reply?: { id?: string; title?: string; description?: string }
}

export interface WhatsAppMessage {
  id: string        // wamid.*
  from: string      // E.164 without leading +
  timestamp: string
  type:
    | 'text'
    | 'audio'
    | 'image'
    | 'document'
    | 'video'
    | 'sticker'
    | 'reaction'
    | 'button'
    | 'location'
    | 'contacts'
    | 'interactive'
    | 'system'
    | 'request_welcome'
    | 'unsupported'
    | 'unknown'
  text?: { body: string }
  /** `voice` is true for a recorded voice note (vs. an attached audio file). */
  audio?: { id: string; mime_type: string; voice?: boolean }
  image?: { id: string; mime_type: string; caption?: string }
  document?: { id?: string; mime_type?: string; filename?: string; caption?: string }
  video?: { id?: string; mime_type?: string; caption?: string }
  sticker?: { id?: string; mime_type?: string; animated?: boolean }
  reaction?: { message_id?: string; emoji?: string }
  /** Legacy quick-reply button tap (template buttons). */
  button?: { text?: string; payload?: string }
  location?: WhatsAppLocation
  contacts?: WhatsAppSharedContact[]
  interactive?: WhatsAppInteractiveReply
}

export interface WhatsAppValue {
  messaging_product: 'whatsapp'
  metadata: { display_phone_number: string; phone_number_id: string }
  contacts?: Array<{ profile: { name: string }; wa_id: string }>
  messages?: WhatsAppMessage[]
  statuses?: Array<{
    id: string
    status: string
    timestamp: string
    recipient_id: string
    /** Phase 2b: Meta's pricing block (per-message billing category / billable flag). */
    pricing?: { billable?: boolean; pricing_model?: string; category?: string; type?: string }
    errors?: Array<{ code?: number; title?: string; message?: string }>
  }>
}

export interface WhatsAppChange {
  value: WhatsAppValue
  field: 'messages'
}

export interface WhatsAppEntry {
  id: string
  changes: WhatsAppChange[]
}

export interface WhatsAppPayload {
  object: 'whatsapp_business_account'
  entry: WhatsAppEntry[]
}
