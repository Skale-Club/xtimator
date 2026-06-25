/**
 * Server-side read + write queries for the in-app chat (CHATDB-02).
 *
 * chat_conversations / chat_messages are RLS tenant-readable (members read their
 * own threads), but the helper path goes through the service client scoped to the
 * validated active company (getActiveCompanyId()) for one consistent pattern the
 * Phase-124 route handler writes through without RLS friction — RLS is
 * defense-in-depth. Mirrors lib/queries/whatsapp-inbox.ts: every query is
 * re-scoped by company_id (+ user_id for owner-only conversations) so a
 * cross-tenant id resolves to no row.
 *
 * The write helpers (createConversation / appendMessage) make the Phase-123 tables
 * ready-to-consume: Phase 124's backend persists turns through them, and Phase 125's
 * sidebar reloads history through the read helpers. appendMessage bumps the parent
 * conversation's updated_at (mirrors whatsapp bumpConversation) so new activity
 * re-sorts to the top of the history list.
 */
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { createServiceClient } from '@/lib/supabase/service'

export type ChatRole = 'user' | 'assistant' | 'tool' | 'system'

export interface ChatConversationRow {
  id: string
  company_id: string
  user_id: string
  title: string | null
  created_at: string
  updated_at: string
}

export interface ChatMessageRow {
  id: string
  conversation_id: string
  company_id: string
  role: ChatRole
  parts: unknown
  attachments: unknown | null
  created_at: string
}

export interface ChatThread {
  conversation: ChatConversationRow
  messages: ChatMessageRow[]
}

/** All conversations for the active company + current owner, newest-updated first. */
export async function listConversations(userId: string): Promise<ChatConversationRow[]> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return []
  const svc = createServiceClient()
  if (!svc) return []

  const { data } = await svc
    .from('chat_conversations')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(200)

  return (data ?? []) as ChatConversationRow[]
}

/** One conversation + its messages (oldest first), tenant + owner scoped. Null if not found/owned. */
export async function getConversationWithMessages(
  conversationId: string,
  userId: string,
): Promise<ChatThread | null> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return null
  const svc = createServiceClient()
  if (!svc) return null

  const { data: conversation } = await svc
    .from('chat_conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle()

  if (!conversation) return null

  const { data: messages } = await svc
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })
    .limit(500)

  return {
    conversation: conversation as ChatConversationRow,
    messages: (messages ?? []) as ChatMessageRow[],
  }
}

/** Create a new conversation scoped to the active company + owner. Returns the row or null. */
export async function createConversation(
  userId: string,
  title: string | null = null,
): Promise<ChatConversationRow | null> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return null
  const svc = createServiceClient()
  if (!svc) return null

  const { data } = await svc
    .from('chat_conversations')
    .insert({ company_id: companyId, user_id: userId, title })
    .select('*')
    .single()

  return (data as ChatConversationRow) ?? null
}

/**
 * Append a message to a conversation (carries the denormalized company_id) and
 * bump the parent conversation's updated_at so new activity re-sorts to the top
 * (mirrors whatsapp bumpConversation — Pitfall 5). Returns the inserted row or null.
 */
export async function appendMessage(args: {
  conversationId: string
  role: ChatRole
  parts: unknown
  attachments?: unknown | null
}): Promise<ChatMessageRow | null> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return null
  const svc = createServiceClient()
  if (!svc) return null

  const { data } = await svc
    .from('chat_messages')
    .insert({
      conversation_id: args.conversationId,
      company_id: companyId,
      role: args.role,
      parts: args.parts ?? [],
      attachments: args.attachments ?? null,
    })
    .select('*')
    .single()

  // Bump the parent so the sidebar (Phase 125) re-sorts by updated_at DESC.
  await svc
    .from('chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', args.conversationId)
    .eq('company_id', companyId)

  return (data as ChatMessageRow) ?? null
}
