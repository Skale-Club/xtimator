/**
 * app/(app)/chat/[[...id]]/page.tsx — the owner-facing chat surface (CHATUI-01/02).
 *
 * An optional-catch-all RSC: with no segment it renders an empty thread + the
 * conversation sidebar; with `/chat/<id>` it loads that conversation's persisted
 * history (oldest-first → toUIMessages) and seeds it into the client useChat.
 *
 * Auth is inherited from the (app) layout; we still read the userId here for the
 * owner-scoped queries (listConversations / getConversationWithMessages both
 * re-scope to the active company + this user, so a foreign id resolves to null).
 *
 * `dynamic = 'force-dynamic'` mirrors app/(app)/whatsapp/page.tsx — conversations
 * change as messages arrive, so the list must never be statically cached.
 */
import { getAuthClaims } from '@/lib/queries/auth'
import { listConversations, getConversationWithMessages } from '@/lib/queries/chat'
import { toUIMessages } from '@/lib/chat/history-mapper'
import { ChatWorkspace } from '@/components/chat/chat-workspace'

export const metadata = { title: 'Chat' }

export const dynamic = 'force-dynamic'

export default async function ChatPage({
  params,
}: {
  params: Promise<{ id?: string[] }>
}) {
  const { id } = await params
  const conversationId = id?.[0] ?? null

  const claims = await getAuthClaims()
  const userId = claims?.sub as string

  const conversations = await listConversations(userId)
  const thread = conversationId
    ? await getConversationWithMessages(conversationId, userId)
    : null
  const initialMessages = thread ? toUIMessages(thread.messages) : []

  return (
    <ChatWorkspace
      conversations={conversations}
      activeId={conversationId}
      initialMessages={initialMessages}
    />
  )
}
