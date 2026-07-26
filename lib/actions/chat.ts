'use server'

/**
 * lib/actions/chat.ts — CHATUI-03 multimodal normalize server action.
 *
 * normalizeChatInput is the owner-scoped seam the chat composer calls to turn an
 * audio clip or a photo into text BEFORE it becomes a normal sendMessage({ text }).
 * It is a thin wrapper over the channel-neutral normalizeInput (lib/agent-tools)
 * — the chat reimplements NO domain logic.
 *
 * Auth posture mirrors app/api/chat/route.ts exactly: authenticate the owner via
 * supabase.auth.getClaims() (the plan's `getAuthClaims` helper does not exist in
 * this codebase — the route uses createClient().auth.getClaims() — Rule 3), then
 * resolve the ACTIVE company via getActiveCompanyId() (the trusted tenant, NEVER
 * from the argument).
 *
 * CHATMETER-01: adds NO credit code. normalizeInput → ingestMultimodal already
 * accounts for transcription/vision per v4.7; re-accounting here would double-charge.
 * NEVER throws (mirrors normalizeInput).
 */
import { normalizeInput } from '@/lib/agent-tools'
import { createClient } from '@/lib/supabase/server'
import { getActiveCompanyId } from '@/lib/queries/active-company'
import {
  createConversation,
  listConversations,
  getConversationWithMessages,
  deleteConversation,
  ownsConversation,
  findMessageRow,
  updateMessageParts,
  deleteMessagesFrom,
  upsertMessageVote,
  listMessageVotes,
} from '@/lib/queries/chat'
import { toUIMessages } from '@/lib/chat/history-mapper'
import { getCurrentEstimate } from '@/lib/queries/estimate'
import { requireServiceClient } from '@/lib/supabase/service'
import { assertWritable } from '@/lib/demo/guard'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { UIMessage } from 'ai'

type ChatNormalizeArg =
  | { kind: 'audio'; base64: string; ext: string }
  | { kind: 'photo'; base64: string; mimeType: string; caption?: string }

export async function normalizeChatInput(
  arg: ChatNormalizeArg,
): Promise<{ ok: boolean; text: string; reason?: string }> {
  // 1. Authenticate the owner (same path as the chat route).
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims?.sub) {
    return { ok: false, text: '', reason: 'unauthorized' }
  }

  // 2. Resolve the ACTIVE company — the trusted tenant (never from the arg).
  const companyId = await getActiveCompanyId()
  if (!companyId) {
    return { ok: false, text: '', reason: 'no_active_company' }
  }

  const denied = await assertWritable()
  if (denied) return { ok: false, text: '', reason: 'demo_readonly' }

  if (arg.kind === 'audio') {
    const bytes = Buffer.from(arg.base64, 'base64')
    const blob = new Blob([bytes])
    const r = await normalizeInput({ kind: 'audio', blob, ext: arg.ext })
    return { ok: r.ok, text: r.text, reason: r.reason }
  }

  const r = await normalizeInput({
    kind: 'photo',
    base64: arg.base64,
    mimeType: arg.mimeType,
    caption: arg.caption,
  })
  return { ok: r.ok, text: r.text, reason: r.reason }
}

/**
 * createChatConversation — CHATUI-02 new-conversation pre-create (Pitfall 5).
 *
 * The chat UI pre-creates the conversation BEFORE the first turn so the id can
 * ride in the transport body. Otherwise the route's onFinish would create a
 * second conversation, splitting the first turn across two threads. Owner-scoped:
 * auth mirrors normalizeChatInput / app/api/chat/route.ts. Returns the id or null.
 */
export async function createChatConversation(
  title?: string | null,
): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub as string | undefined
  if (!userId) return null

  const denied = await assertWritable()
  if (denied) return null

  // Title = the first user message, truncated — mirrors the Vercel AI Chatbot's
  // auto-title so the history list never shows a wall of "Untitled chat".
  const trimmed = title?.trim().slice(0, 80) || null
  const conv = await createConversation(userId, trimmed)
  return conv ? { id: conv.id } : null
}

/** Compact conversation summary for the bubble's history menu. */
export interface ChatConversationSummary {
  id: string
  title: string | null
  updated_at: string
}

/**
 * listChatConversations — owner-scoped conversation list for the chat bubble.
 *
 * The bubble is a client island mounted in the app-shell layout, so it cannot
 * receive server-fetched props per page load without taxing EVERY route; it
 * lazily calls this on first open instead. Auth posture mirrors
 * createChatConversation; tenant scoping lives in listConversations.
 */
export async function listChatConversations(): Promise<ChatConversationSummary[]> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub as string | undefined
  if (!userId) return []

  const rows = await listConversations(userId)
  return rows.map(({ id, title, updated_at }) => ({ id, title, updated_at }))
}

/**
 * getChatThread — one conversation's history as UIMessages, for the bubble.
 *
 * Owner + tenant scoped via getConversationWithMessages (a cross-tenant or
 * cross-owner id resolves to null). Rows map through the same toUIMessages
 * seed the /chat page used, so history round-trips into useChat verbatim.
 */
export async function getChatThread(
  conversationId: string,
): Promise<{ id: string; messages: UIMessage[]; votes: Record<string, boolean> } | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub as string | undefined
  if (!userId) return null

  const thread = await getConversationWithMessages(conversationId, userId)
  if (!thread) return null
  const votes = await listMessageVotes(conversationId, userId)
  return { id: thread.conversation.id, messages: toUIMessages(thread.messages), votes }
}

/**
 * deleteChatConversation — owner-scoped conversation delete for the bubble's
 * history menu. Messages and votes cascade at the DB level.
 */
export async function deleteChatConversation(conversationId: string): Promise<boolean> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub as string | undefined
  if (!userId) return false

  const denied = await assertWritable()
  if (denied) return false

  return deleteConversation(conversationId, userId)
}

/**
 * voteChatMessage — upsert one owner's 👍/👎 on an assistant message, keyed by
 * the UIMessage id (stable across reloads via chat_messages.client_id).
 */
export async function voteChatMessage(args: {
  conversationId: string
  messageId: string
  isUpvoted: boolean
}): Promise<boolean> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub as string | undefined
  if (!userId) return false

  const denied = await assertWritable()
  if (denied) return false
  if (!(await ownsConversation(args.conversationId, userId))) return false

  return upsertMessageVote({
    conversationId: args.conversationId,
    messageId: args.messageId,
    userId,
    isUpvoted: args.isUpvoted,
  })
}

/**
 * editChatMessage — server-side half of edit-and-resend.
 *
 * useChat's sendMessage({ text, messageId }) truncates the CLIENT history after
 * the edited user message and replaces it; this keeps the PERSISTED history in
 * sync: rewrite the edited row's parts in place, then delete every row that
 * followed it. The resend's onFinish then re-appends the new assistant turn
 * (and skips the user row — it already exists by client id).
 */
export async function editChatMessage(args: {
  conversationId: string
  messageId: string
  text: string
}): Promise<boolean> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub as string | undefined
  if (!userId) return false

  const denied = await assertWritable()
  if (denied) return false
  if (!(await ownsConversation(args.conversationId, userId))) return false

  const row = await findMessageRow(args.conversationId, args.messageId)
  if (!row || row.role !== 'user') return false

  const updated = await updateMessageParts(row.id, args.conversationId, [
    { type: 'text', text: args.text },
  ])
  if (!updated) return false

  return deleteMessagesFrom({
    conversationId: args.conversationId,
    fromCreatedAt: row.created_at,
    inclusive: false,
  })
}

/**
 * truncateChatFrom — server-side half of regenerate.
 *
 * useChat's regenerate({ messageId }) drops the assistant message (and anything
 * after) client-side and re-requests; this deletes the same span from the
 * persisted history (inclusive — the old assistant turn goes too) so a reload
 * never resurrects the replaced response.
 */
export async function truncateChatFrom(args: {
  conversationId: string
  messageId: string
}): Promise<boolean> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const userId = claimsData?.claims?.sub as string | undefined
  if (!userId) return false

  const denied = await assertWritable()
  if (denied) return false
  if (!(await ownsConversation(args.conversationId, userId))) return false

  const row = await findMessageRow(args.conversationId, args.messageId)
  if (!row) return false

  return deleteMessagesFrom({
    conversationId: args.conversationId,
    fromCreatedAt: row.created_at,
    inclusive: true,
  })
}

/**
 * resolveCurrentEstimateId — CHATUI-04 editor-link resolver.
 *
 * The createEstimate tool returns a {jobId} but NOT the produced estimate id (the
 * estimate is written asynchronously by the Inngest generation job). Once the job
 * completes the inline EstimateCard calls this to resolve the now-current estimate
 * for the project so it can link to /projects/<id>?tab=estimate&estimate=<estId>.
 *
 * Owner-scoped: authenticate (same posture as normalizeChatInput), resolve the
 * ACTIVE company (the trusted tenant), and verify the estimate belongs to it
 * before returning its id (Rule 2 — authorization; never leak across tenants).
 * NEVER throws — returns null on any auth/tenant/lookup miss.
 */
export async function resolveCurrentEstimateId(projectId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  if (!claimsData?.claims?.sub) return null

  const companyId = await getActiveCompanyId()
  if (!companyId) return null

  const svc = requireServiceClient() as unknown as SupabaseClient
  const est = await getCurrentEstimate(svc, projectId)
  if (!est) return null
  // Tenant guard: only surface an estimate owned by the active company.
  if (est.company_id !== companyId) return null
  return est.id
}
