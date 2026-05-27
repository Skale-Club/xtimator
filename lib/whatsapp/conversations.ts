/**
 * WhatsApp conversation + message logging.
 *
 * Persists every inbound/outbound WhatsApp message into a per-(company, contact)
 * thread so the /whatsapp inbox can render conversations and replies. Until this
 * module, inbound content was ephemeral (recordings/photos + a 30-min session).
 *
 * Service-role ONLY: whatsapp_conversations / whatsapp_messages have RLS enabled
 * with no policies (deny-all to anon/authenticated). Always pass a service client.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type WaDirection = 'inbound' | 'outbound'
export type WaMsgType = 'text' | 'image' | 'audio' | 'document' | 'system'
export type WaMessageStatus = 'sent' | 'delivered' | 'read' | 'failed'

export interface WaConversationRow {
  id: string
  company_id: string
  contact_phone: string
  contact_name: string | null
  client_id: string | null
  last_message_at: string | null
  last_message_preview: string | null
  last_inbound_at: string | null
  unread_count: number
  created_at: string
  updated_at: string
}

export interface WaMessageRow {
  id: string
  conversation_id: string
  company_id: string
  direction: WaDirection
  msg_type: WaMsgType
  body: string | null
  media_url: string | null
  wa_message_id: string | null
  status: WaMessageStatus | null
  error_message: string | null
  created_at: string
}

/** Meta's customer-service window: free-text replies are only allowed within 24h of the last inbound. */
export const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000

/** Normalize a phone to E.164 with a single leading '+'. */
export function toE164(phone: string): string {
  const trimmed = phone.trim()
  if (trimmed.startsWith('+')) return `+${trimmed.slice(1).replace(/[^\d]/g, '')}`
  return `+${trimmed.replace(/[^\d]/g, '')}`
}

/** True when free-text replies are still allowed (within 24h of the last inbound message). */
export function isWithinReplyWindow(lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false
  return Date.now() - new Date(lastInboundAt).getTime() < REPLY_WINDOW_MS
}

/** Short preview string for the conversation list. */
function previewOf(body: string | null | undefined, type: WaMsgType): string {
  if (type === 'image') return '📷 Photo'
  if (type === 'audio') return '🎤 Voice message'
  if (type === 'document') return '📄 Document'
  const text = (body ?? '').replace(/\s+/g, ' ').trim()
  return text.length > 80 ? `${text.slice(0, 80)}…` : text
}

/**
 * Get the conversation id for (company, contactPhone), creating it if absent.
 * Backfills contact_name / client_id when newly known (never overwrites existing values).
 */
export async function getOrCreateConversation(
  svc: SupabaseClient,
  companyId: string,
  contactPhone: string,
  opts?: { contactName?: string | null; clientId?: string | null },
): Promise<string> {
  const phone = toE164(contactPhone)

  const { data: existing } = await svc
    .from('whatsapp_conversations')
    .select('id, contact_name, client_id')
    .eq('company_id', companyId)
    .eq('contact_phone', phone)
    .maybeSingle()

  if (existing) {
    const patch: Record<string, unknown> = {}
    if (opts?.contactName && !existing.contact_name) patch.contact_name = opts.contactName
    if (opts?.clientId && !existing.client_id) patch.client_id = opts.clientId
    if (Object.keys(patch).length > 0) {
      await svc.from('whatsapp_conversations').update(patch).eq('id', existing.id)
    }
    return existing.id as string
  }

  const { data: created, error } = await svc
    .from('whatsapp_conversations')
    .insert({
      company_id: companyId,
      contact_phone: phone,
      contact_name: opts?.contactName ?? null,
      client_id: opts?.clientId ?? null,
    })
    .select('id')
    .single()

  if (error || !created) {
    // Likely a concurrent insert won the UNIQUE(company_id, contact_phone) race — re-select.
    const { data: again } = await svc
      .from('whatsapp_conversations')
      .select('id')
      .eq('company_id', companyId)
      .eq('contact_phone', phone)
      .single()
    if (!again) throw new Error(`[whatsapp] could not get/create conversation: ${error?.message}`)
    return again.id as string
  }

  return created.id as string
}

/** Update the conversation's denormalized last-message fields (and unread/window on inbound). */
async function bumpConversation(
  svc: SupabaseClient,
  conversationId: string,
  opts: { preview: string; at: string; inbound: boolean },
): Promise<void> {
  const patch: Record<string, unknown> = {
    last_message_at: opts.at,
    last_message_preview: opts.preview,
    updated_at: opts.at,
  }
  if (opts.inbound) {
    patch.last_inbound_at = opts.at
    const { data } = await svc
      .from('whatsapp_conversations')
      .select('unread_count')
      .eq('id', conversationId)
      .single()
    patch.unread_count = ((data?.unread_count as number | null) ?? 0) + 1
  }
  await svc.from('whatsapp_conversations').update(patch).eq('id', conversationId)
}

/** Persist an inbound message and bump its conversation. Idempotent on wa_message_id. */
export async function logInboundMessage(
  svc: SupabaseClient,
  params: {
    companyId: string
    contactPhone: string
    contactName?: string | null
    body?: string | null
    msgType?: WaMsgType
    waMessageId?: string | null
    mediaUrl?: string | null
  },
): Promise<string> {
  const conversationId = await getOrCreateConversation(svc, params.companyId, params.contactPhone, {
    contactName: params.contactName ?? null,
  })
  const type = params.msgType ?? 'text'
  const now = new Date().toISOString()

  const { error } = await svc.from('whatsapp_messages').insert({
    conversation_id: conversationId,
    company_id: params.companyId,
    direction: 'inbound',
    msg_type: type,
    body: params.body ?? null,
    media_url: params.mediaUrl ?? null,
    wa_message_id: params.waMessageId ?? null,
    status: null,
  })

  // 23505 = duplicate wa_message_id (webhook retry) — already logged, don't double-bump.
  if (error) {
    if (error.code === '23505') return conversationId
    throw new Error(`[whatsapp] logInboundMessage failed: ${error.message}`)
  }

  await bumpConversation(svc, conversationId, { preview: previewOf(params.body, type), at: now, inbound: true })
  return conversationId
}

/** Persist an outbound message and bump its conversation. */
export async function logOutboundMessage(
  svc: SupabaseClient,
  params: {
    companyId: string
    contactPhone: string
    contactName?: string | null
    clientId?: string | null
    body?: string | null
    msgType?: WaMsgType
    waMessageId?: string | null
    mediaUrl?: string | null
    status?: WaMessageStatus
    errorMessage?: string | null
  },
): Promise<string> {
  const conversationId = await getOrCreateConversation(svc, params.companyId, params.contactPhone, {
    contactName: params.contactName ?? null,
    clientId: params.clientId ?? null,
  })
  const type = params.msgType ?? 'text'
  const now = new Date().toISOString()

  await svc.from('whatsapp_messages').insert({
    conversation_id: conversationId,
    company_id: params.companyId,
    direction: 'outbound',
    msg_type: type,
    body: params.body ?? null,
    media_url: params.mediaUrl ?? null,
    wa_message_id: params.waMessageId ?? null,
    status: params.status ?? 'sent',
    error_message: params.errorMessage ?? null,
  })

  // A failed send shouldn't reset the inbound reply window, but it's still the last activity.
  await bumpConversation(svc, conversationId, { preview: previewOf(params.body, type), at: now, inbound: false })
  return conversationId
}

/** Clear the unread badge for a conversation. */
export async function markConversationRead(svc: SupabaseClient, conversationId: string): Promise<void> {
  await svc.from('whatsapp_conversations').update({ unread_count: 0 }).eq('id', conversationId)
}
