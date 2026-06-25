'use client'

/**
 * components/chat/chat-thread.tsx — the v6 useChat streaming surface (CHATUI-01).
 *
 * Drives @ai-sdk/react useChat with a DefaultChatTransport pointed at the frozen
 * Phase-124 /api/chat route. v6 contract invariants (Pitfalls 1/2/3):
 *   - useChat has no pre-v6 input/submit-change handlers — we own a useState for
 *     the composer text and call sendMessage({ text }).
 *   - The transport sends the FULL messages array by default; we DO NOT override
 *     the send-request shaping to send only the last message (the route's
 *     convertToModelMessages needs the full array).
 *   - body carries conversationId so the route persists onto ONE conversation.
 *
 * New-conversation (Pitfall 5): when activeId is null, the first submit pre-creates
 * a conversation via createChatConversation(), router.replace's to /chat/<id>, and
 * sends with that id — so the first turn never splits into a duplicate thread.
 *
 * The multimodal ChatComposer (text + audio + photo via normalizeChatInput) is
 * mounted at the CHAT_COMPOSER_SEAM (Plan 02 / CHATUI-03).
 */
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n/use-translation'
import { createChatConversation } from '@/lib/actions/chat'
import { ChatMessage } from '@/components/chat/chat-message'
import { ChatComposer } from '@/components/chat/chat-composer'

export function ChatThread({
  conversationId,
  initialMessages,
}: {
  conversationId: string | null
  initialMessages: UIMessage[]
}) {
  const router = useRouter()
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string | null>(conversationId)

  const { messages, sendMessage, status } = useChat({
    id: activeId ?? undefined,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { conversationId: activeId },
    }),
  })

  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length, status])

  const busy = status !== 'ready'

  async function submit(raw: string) {
    const value = raw.trim()
    if (!value || busy) return

    // Pre-create the conversation on the first turn of a new chat so the id rides
    // in the transport body (no duplicate conversation from the route's onFinish).
    if (!activeId) {
      const conv = await createChatConversation()
      if (conv) {
        setActiveId(conv.id)
        router.replace(`/chat/${conv.id}`)
      }
    }

    // Full-array default send — do NOT override the request to send only the last.
    sendMessage({ text: value })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center text-sm text-muted-foreground">
            <p>{t('Ask me to generate an estimate or look something up.')}</p>
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} />)
        )}
        <div ref={endRef} />
      </div>

      {/* CHAT_COMPOSER_SEAM — the multimodal composer (text + audio + photo). */}
      <ChatComposer onSend={(value) => void submit(value)} busy={busy} />
    </div>
  )
}
