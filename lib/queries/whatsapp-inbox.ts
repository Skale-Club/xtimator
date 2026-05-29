/**
 * Server-side read queries for the /whatsapp inbox.
 *
 * whatsapp_conversations / whatsapp_messages are RLS deny-all, so reads go through
 * the service client scoped to the validated active company (getActiveCompanyId()).
 */
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { createServiceClient } from '@/lib/supabase/service'
import { toE164 } from '@/lib/whatsapp/conversations'
import type { WaConversationRow, WaMessageRow } from '@/lib/whatsapp/conversations'
import type { ConversationThread } from '@/lib/whatsapp/inbox-types'

export type { ConversationThread }

/**
 * Result of resolving a project to its linked client's WhatsApp conversation.
 * `conversationId` is null for every "no conversation" branch (no company,
 * no linked client, no client phone, or no matching conversation).
 */
export interface ProjectConversationLink {
  conversationId: string | null
  contactName: string | null
  lastMessagePreview: string | null
  lastMessageAt: string | null
}

const NO_CONVERSATION: ProjectConversationLink = {
  conversationId: null,
  contactName: null,
  lastMessagePreview: null,
  lastMessageAt: null,
}

/**
 * Resolve a project → its linked client's phone → the matching WhatsApp
 * conversation (by E.164 contact_phone), all scoped to the active company.
 *
 * No migration: the link is resolved purely by phone number. Uses the service
 * client (whatsapp_conversations is RLS deny-all) and re-scopes every query by
 * company_id so a cross-tenant projectId resolves to no row → null link.
 */
export async function getProjectConversationLink(
  projectId: string,
): Promise<ProjectConversationLink> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return NO_CONVERSATION
  const svc = createServiceClient()
  if (!svc) return NO_CONVERSATION

  // 1. Resolve the project's linked client (company-scoped).
  const { data: project } = await svc
    .from('projects')
    .select('client_id')
    .eq('id', projectId)
    .eq('company_id', companyId)
    .maybeSingle()

  const clientId = (project?.client_id as string | null) ?? null
  if (!clientId) return NO_CONVERSATION

  // 2. Resolve the client's phone (company-scoped).
  const { data: client } = await svc
    .from('clients')
    .select('phone')
    .eq('id', clientId)
    .eq('company_id', companyId)
    .maybeSingle()

  const phone = (client?.phone as string | null) ?? null
  if (!phone || !phone.trim()) return NO_CONVERSATION

  // 3. Resolve the conversation by normalized E.164 contact_phone.
  const e164Phone = toE164(phone)
  const { data: conversation } = await svc
    .from('whatsapp_conversations')
    .select('id, contact_name, contact_phone, last_message_preview, last_message_at')
    .eq('company_id', companyId)
    .eq('contact_phone', e164Phone)
    .maybeSingle()

  if (!conversation) return NO_CONVERSATION

  const row = conversation as Pick<
    WaConversationRow,
    'id' | 'contact_name' | 'contact_phone' | 'last_message_preview' | 'last_message_at'
  >

  return {
    conversationId: row.id,
    contactName: row.contact_name?.trim() || row.contact_phone,
    lastMessagePreview: row.last_message_preview,
    lastMessageAt: row.last_message_at,
  }
}

/** All conversations for the active company, newest activity first. */
export async function listConversations(): Promise<WaConversationRow[]> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return []
  const svc = createServiceClient()
  if (!svc) return []

  const { data } = await svc
    .from('whatsapp_conversations')
    .select('*')
    .eq('company_id', companyId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(200)

  return (data ?? []) as WaConversationRow[]
}

/** One conversation + its messages (oldest first), tenant-scoped. Null if not found/owned. */
export async function getConversationThread(
  conversationId: string,
): Promise<ConversationThread | null> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return null
  const svc = createServiceClient()
  if (!svc) return null

  const { data: conversation } = await svc
    .from('whatsapp_conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('company_id', companyId)
    .maybeSingle()

  if (!conversation) return null

  const { data: messages } = await svc
    .from('whatsapp_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500)

  return {
    conversation: conversation as WaConversationRow,
    messages: (messages ?? []) as WaMessageRow[],
  }
}
