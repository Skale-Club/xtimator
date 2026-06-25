'use client'

/**
 * components/chat/chat-workspace.tsx — the two-pane chat shell (CHATUI-01/02).
 *
 * Mirrors the WhatsApp inbox layout: a ChatSidebar aside (conversation list +
 * New chat) beside a section holding the ChatThread. "New chat" pushes /chat
 * (clears the id → empty thread). Switching conversations happens via the
 * sidebar's next/link rows (RSC reload seeds the new initialMessages); the
 * key={activeId ?? 'new'} on ChatThread resets useChat state across switches.
 */
import { useRouter } from 'next/navigation'
import { MessageSquare } from 'lucide-react'
import type { UIMessage } from 'ai'
import { useTranslation } from '@/lib/i18n/use-translation'
import type { ChatConversationRow } from '@/lib/queries/chat'
import { ChatSidebar } from '@/components/chat/chat-sidebar'
import { ChatThread } from '@/components/chat/chat-thread'

export function ChatWorkspace({
  conversations,
  activeId,
  initialMessages,
}: {
  conversations: ChatConversationRow[]
  activeId: string | null
  initialMessages: UIMessage[]
}) {
  const router = useRouter()
  const { t } = useTranslation()

  function onNew() {
    router.push('/chat')
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="flex items-center gap-2 border-b border-border px-6 py-4">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold tracking-tight">{t('Chat')}</h1>
      </header>

      <div className="flex min-h-0 flex-1">
        <ChatSidebar conversations={conversations} activeId={activeId} onNew={onNew} />

        <section className="flex min-w-0 flex-1 flex-col">
          <ChatThread
            key={activeId ?? 'new'}
            conversationId={activeId}
            initialMessages={initialMessages}
          />
        </section>
      </div>
    </div>
  )
}
