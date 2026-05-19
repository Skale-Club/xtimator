/**
 * Phase 67: Inngest event name constants + payload type aliases.
 *
 * Implements INNGEST-01 (event name registry).
 *
 * Event-name constants give type-safety at dispatch sites. Payload shapes
 * are documented inline; consumers cast `event.data` to the typed payload.
 */

export const EVENT_ESTIMATE_GENERATE = 'estimate/generate.requested' as const
export const EVENT_TRANSCRIBE_AUDIO = 'audio/transcribe.requested' as const
export const EVENT_ANALYZE_PHOTOS = 'photos/analyze.requested' as const
export const EVENT_WHATSAPP_PROCESS = 'whatsapp/process.requested' as const

export type EstimateGeneratePayload = {
  companyId: string
  projectId: string
  requestId: string
  /** Optional language override — forwarded from the UI language selector. */
  language?: 'en' | 'pt' | 'es'
}

export type TranscribeAudioPayload = {
  companyId: string
  recordingId: string
  storagePath: string
}

export type AnalyzePhotosPayload = {
  companyId: string
  projectId: string
  requestId: string
}

export type WhatsAppProcessPayload = {
  companyId: string
  projectId: string
  ownerPhone: string
  messages: unknown[] // WhatsAppMessage[] in the handler — left as unknown[] here to avoid a circular import
  batchKey: string
}
