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
 * The inline text composer below the CHAT_COMPOSER_SEAM is a minimal text-only
 * placeholder; Plan 02 swaps in the multimodal ChatComposer at that seam.
 */
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { createChatConversation } from '@/lib/actions/chat'
import { ChatMessage } from '@/components/chat/chat-message'

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
  const [text, setText] = useState('')

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

  async function submit() {
    const value = text.trim()
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

    setText('')
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

      {/* CHAT_COMPOSER_SEAM — Plan 02 swaps the multimodal ChatComposer here. */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <Textarea
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void submit()
              }
            }}
            placeholder={t('Type a message…')}
            disabled={busy}
            className="max-h-32 min-h-[40px] flex-1 resize-none"
          />
          <Button
            onClick={() => void submit()}
            disabled={busy || text.trim().length === 0}
            size="icon"
            aria-label={t('Send')}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}
