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

export interface WhatsAppMessage {
  id: string        // wamid.*
  from: string      // E.164 without leading +
  timestamp: string
  type: 'text' | 'audio' | 'image' | 'document' | 'video' | 'sticker' | 'reaction' | 'unknown'
  text?: { body: string }
  audio?: { id: string; mime_type: string }
  image?: { id: string; mime_type: string; caption?: string }
}

export interface WhatsAppValue {
  messaging_product: 'whatsapp'
  metadata: { display_phone_number: string; phone_number_id: string }
  contacts?: Array<{ profile: { name: string }; wa_id: string }>
  messages?: WhatsAppMessage[]
  statuses?: Array<{ id: string; status: string; timestamp: string; recipient_id: string }>
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
