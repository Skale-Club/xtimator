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
/**
 * Quick task 260603-lrf — dispatched by handler.ts for session-state inbound
 * (awaiting_confirm). Carries a SINGLE message + session snapshot; the
 * whatsAppIntentRouterJob runs the intent-router graph off the webhook ack path.
 */
export const EVENT_WHATSAPP_INTENT = 'whatsapp/intent.requested' as const

export type EstimateGeneratePayload = {
  companyId: string
  projectId: string
  requestId: string
  /** Optional language override — forwarded from the UI language selector. */
  language?: 'en' | 'pt' | 'es'
  /**
   * Free-form prompts from non-recording sources (MCP `create_estimate` tool,
   * WhatsApp text messages, future "describe in your own words" UI). Forwarded
   * to `generateEstimateForProject` so projects without transcripts/photos can
   * still produce an estimate.
   */
  prompts?: string[]
  /**
   * Phase 91 (REC-03): attempt lineage carried in-flight only; Phase 92 owns
   * durable persistence. Minted once per capture session and reused on Retry so
   * the lineage survives a re-dispatch. Optional so older callers still compile.
   */
  attemptId?: string
  /**
   * Phase 92 (EVENT-03): input type derived at the entrypoint (D-07) so every
   * downstream pipeline_events row can record which path produced the estimate.
   * Optional so older callers still compile; routes default to `manual_text`.
   */
  inputType?: 'recording' | 'photo' | 'manual_text'
}

export type TranscribeAudioPayload = {
  companyId: string
  recordingId: string
  storagePath: string
  /**
   * Phase 91 (REC-03): attempt lineage carried in-flight only; Phase 92 owns
   * durable persistence. Optional so older callers still compile.
   */
  attemptId?: string
  /**
   * Phase 92 (EVENT-03): input type derived at the entrypoint (D-07). The
   * transcribe path is always `recording`. Optional so older callers compile.
   */
  inputType?: 'recording' | 'photo' | 'manual_text'
}

export type AnalyzePhotosPayload = {
  companyId: string
  projectId: string
  requestId: string
  /**
   * Phase 92 (EVENT-03 / RESEARCH Pitfall 2): attempt lineage — this payload had
   * NO attemptId before Phase 92. Minted client-side (crypto.randomUUID, reused
   * on Retry) or a server fallback (D-08). Optional so older callers compile.
   */
  attemptId?: string
  /**
   * Phase 92 (EVENT-03): input type derived at the entrypoint (D-07). The
   * analyze-photos path is always `photo`. Optional so older callers compile.
   */
  inputType?: 'recording' | 'photo' | 'manual_text'
}

export type WhatsAppProcessPayload = {
  companyId: string
  projectId: string
  ownerPhone: string
  messages: unknown[] // WhatsAppMessage[] in the handler — left as unknown[] here to avoid a circular import
  batchKey: string
}

/**
 * Quick task 260603-lrf — payload for EVENT_WHATSAPP_INTENT.
 *
 * Carries a single inbound message + the active session snapshot. The router
 * normalizes the message (audio/photo→text), classifies the intent, and routes
 * to the existing confirm/edit/create/query flows.
 *
 * ownerPhone is E.164 WITH '+'; fromPhone is E.164 WITHOUT '+' (the shape
 * processInboundMessages expects for the CREATE path).
 */
export type WhatsAppIntentPayload = {
  companyId: string
  ownerPhone: string
  fromPhone: string
  message: unknown // WhatsAppMessage — unknown[] to avoid circular import
  session: {
    id: string
    state: string
    draft_project_id: string | null
    draft_estimate_id: string | null
  } | null
  batchKey: string
}

/**
 * Phase 77 (NOTIF-03 / NOTIF-09) — Notification email queue event.
 *
 * Emitted by `lib/notifications/dispatch.ts` when an event resolves to the
 * email channel. Handled by the digest worker (77-06), which groups
 * notifications by user + category and sends a branded Resend email.
 */
export const EVENT_NOTIFICATION_EMAIL_QUEUED =
  'notification/email.queued' as const

export type NotificationEmailQueuedPayload = {
  notificationId: string
  userId: string
  companyId: string
  eventType: string
  category: string
  title: string
  body: string
  linkUrl?: string
}

export type NotificationEmailQueuedEvent = {
  name: typeof EVENT_NOTIFICATION_EMAIL_QUEUED
  data: NotificationEmailQueuedPayload
}
