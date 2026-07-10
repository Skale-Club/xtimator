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
  /** The AI SDK UIMessage id the client generated (null on pre-migration rows). */
  client_id: string | null
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
  /** UIMessage id from the client/stream — persisted so reloads keep the same ids. */
  clientId?: string | null
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
      client_id: args.clientId ?? null,
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

/** True when the conversation exists, belongs to the active company AND this owner.
 *  The cheap ownership gate the write actions (edit/truncate/vote/delete) run
 *  before touching rows — chat threads are owner-private within a company. */
export async function ownsConversation(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return false
  const svc = createServiceClient()
  if (!svc) return false

  const { data } = await svc
    .from('chat_conversations')
    .select('id')
    .eq('id', conversationId)
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle()

  return !!data
}

/** Delete one conversation (messages/votes cascade), tenant + owner scoped. */
export async function deleteConversation(
  conversationId: string,
  userId: string,
): Promise<boolean> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return false
  const svc = createServiceClient()
  if (!svc) return false

  const { error } = await svc
    .from('chat_conversations')
    .delete()
    .eq('id', conversationId)
    .eq('company_id', companyId)
    .eq('user_id', userId)

  return !error
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Resolve a UIMessage id to its persisted row within one conversation.
 * New rows match on client_id; pre-migration history rows seed the DB uuid as
 * the UIMessage id, so a uuid-shaped miss falls back to the primary key.
 */
export async function findMessageRow(
  conversationId: string,
  messageId: string,
): Promise<ChatMessageRow | null> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return null
  const svc = createServiceClient()
  if (!svc) return null

  const { data: byClientId } = await svc
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('company_id', companyId)
    .eq('client_id', messageId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (byClientId) return byClientId as ChatMessageRow

  if (!UUID_RE.test(messageId)) return null
  const { data: byId } = await svc
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('company_id', companyId)
    .eq('id', messageId)
    .maybeSingle()
  return (byId as ChatMessageRow) ?? null
}

/** Replace one persisted message's parts (the edit-user-message rewrite). */
export async function updateMessageParts(
  rowId: string,
  conversationId: string,
  parts: unknown,
): Promise<boolean> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return false
  const svc = createServiceClient()
  if (!svc) return false

  const { error } = await svc
    .from('chat_messages')
    .update({ parts })
    .eq('id', rowId)
    .eq('conversation_id', conversationId)
    .eq('company_id', companyId)

  return !error
}

/**
 * Delete a conversation's persisted tail from an anchor row's created_at —
 * inclusive (regenerate: the old assistant turn goes too) or exclusive (edit:
 * the edited user row is UPDATED in place, only what followed it goes).
 * Keeps the DB in sync with the client-side truncation sendMessage({messageId})
 * / regenerate() perform, so a reload never resurrects replaced turns.
 */
export async function deleteMessagesFrom(args: {
  conversationId: string
  fromCreatedAt: string
  inclusive: boolean
}): Promise<boolean> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return false
  const svc = createServiceClient()
  if (!svc) return false

  let query = svc
    .from('chat_messages')
    .delete()
    .eq('conversation_id', args.conversationId)
    .eq('company_id', companyId)
  query = args.inclusive
    ? query.gte('created_at', args.fromCreatedAt)
    : query.gt('created_at', args.fromCreatedAt)
  const { error } = await query

  return !error
}

/** Upsert one owner's 👍/👎 on a message (keyed by UIMessage id). */
export async function upsertMessageVote(args: {
  conversationId: string
  messageId: string
  userId: string
  isUpvoted: boolean
}): Promise<boolean> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return false
  const svc = createServiceClient()
  if (!svc) return false

  const { error } = await svc.from('chat_message_votes').upsert(
    {
      conversation_id: args.conversationId,
      company_id: companyId,
      user_id: args.userId,
      message_id: args.messageId,
      is_upvoted: args.isUpvoted,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'conversation_id,message_id,user_id' },
  )

  return !error
}

/** One conversation's votes for one owner, as UIMessage-id → is_upvoted. */
export async function listMessageVotes(
  conversationId: string,
  userId: string,
): Promise<Record<string, boolean>> {
  const companyId = await getActiveCompanyId()
  if (!companyId) return {}
  const svc = createServiceClient()
  if (!svc) return {}

  const { data } = await svc
    .from('chat_message_votes')
    .select('message_id, is_upvoted')
    .eq('conversation_id', conversationId)
    .eq('company_id', companyId)
    .eq('user_id', userId)

  const out: Record<string, boolean> = {}
  for (const row of (data ?? []) as { message_id: string; is_upvoted: boolean }[]) {
    out[row.message_id] = row.is_upvoted
  }
  return out
}
