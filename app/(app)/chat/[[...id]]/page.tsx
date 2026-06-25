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
import { getActiveCompanyId } from '@/lib/queries/active-company'
import { requireServiceClient } from '@/lib/supabase/service'
import { getEntitlements } from '@/lib/entitlements'
import { listConversations, getConversationWithMessages } from '@/lib/queries/chat'
import { toUIMessages } from '@/lib/chat/history-mapper'
import { ChatWorkspace } from '@/components/chat/chat-workspace'
import { ChatUpgradePrompt } from '@/components/chat/chat-upgrade-prompt'

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

  // CHATMETER-02 — page-level entitlement gate. The route (Plan 126-01) is the
  // security boundary (403); this is the conversion-preserving UX affordance so
  // a non-entitled owner sees an upgrade prompt instead of a dead chat (the
  // global UpgradeModal only catches 402, NOT this 403).
  //
  // PITFALL: the active-company helper does NOT select `tier` — reading tier
  // from it returns undefined → getEntitlements('free') → chat WRONGLY blocked
  // for paying users. The page MUST do its OWN tier read (the active-company
  // layout pattern). See app/(app)/layout.tsx.
  const companyId = await getActiveCompanyId()
  const { data: companyRow } = await requireServiceClient()
    .from('companies')
    .select('tier')
    .eq('id', companyId!)
    .maybeSingle()
  const tier = (companyRow as { tier?: string | null } | null)?.tier ?? 'free'
  if (!getEntitlements(tier).chatEnabled) {
    return <ChatUpgradePrompt />
  }

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
