/**
 * Server-side read queries for the /whatsapp inbox.
 *
 * whatsapp_conversations / whatsapp_messages are RLS deny-all, so reads go through
 * the service client scoped to the validated active company (getActiveCompanyId()).
 */
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { createServiceClient } from '@/lib/supabase/service'
import type { WaConversationRow, WaMessageRow } from '@/lib/whatsapp/conversations'
import type { ConversationThread } from '@/lib/whatsapp/inbox-types'

export type { ConversationThread }

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
