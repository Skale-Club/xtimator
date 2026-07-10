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
 *   - conversationId rides in per-send request options (not only the transport
 *     body) so the FIRST turn of a new chat carries the just-pre-created id even
 *     before the activeId state commit re-renders the transport.
 *
 * New-conversation (Pitfall 5): when activeId is null, the first submit pre-creates
 * a conversation via createChatConversation() — titled with the first message, so
 * the history list never fills with "Untitled chat" — and sends with that id.
 * Standalone (page) mode router.replace's to /chat/<id>; embedded (bubble) mode
 * instead notifies the host via onConversationCreated.
 *
 * The multimodal ChatComposer (text + audio + photo via normalizeChatInput) is
 * mounted at the CHAT_COMPOSER_SEAM (Plan 02 / CHATUI-03).
 */
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/use-translation'
import { createChatConversation } from '@/lib/actions/chat'
import { ChatMessage } from '@/components/chat/chat-message'
import { ChatComposer } from '@/components/chat/chat-composer'

/** Empty-state starter prompts (Vercel AI Chatbot "suggested actions" pattern).
 *  Each maps onto one of the route's neutral tools so the first turn lands well. */
const SUGGESTIONS = [
  'Show my recent estimates',
  'What services do I offer?',
  'Create an estimate for a new job',
]

/** Map a transport error body onto owner-facing copy (the route's 403/429 JSON). */
function describeChatError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: string }
    if (parsed.error === 'chat_not_on_plan') {
      return 'In-app chat is a Pro feature — upgrade your plan to use it.'
    }
    if (parsed.error === 'rate_limit') {
      return 'You are sending messages too quickly. Please wait a moment and try again.'
    }
  } catch {
    // Not the route's JSON error shape — fall through to the generic copy.
  }
  return 'Something went wrong. Please try again.'
}

export function ChatThread({
  conversationId,
  initialMessages,
  embedded = false,
  onConversationCreated,
}: {
  conversationId: string | null
  initialMessages: UIMessage[]
  /** Bubble mode: no route navigation on conversation create. */
  embedded?: boolean
  /** Notifies the host (e.g. the bubble's history menu) of a pre-created conversation. */
  onConversationCreated?: (id: string) => void
}) {
  const router = useRouter()
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string | null>(conversationId)

  const { messages, sendMessage, status, stop } = useChat({
    id: activeId ?? undefined,
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: '/api/chat',
      body: { conversationId: activeId },
    }),
    onError(error) {
      toast.error(t(describeChatError(error.message)))
    },
  })

  // Smart autoscroll (Vercel AI Chatbot pattern): follow the stream only while
  // the user is pinned near the bottom — never yank them back mid-scrollback.
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const endRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (pinnedRef.current) endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, status])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  // 'error' must NOT count as busy — a failed turn would otherwise lock the
  // composer forever (no way back to 'ready' without a new send).
  const streaming = status === 'submitted' || status === 'streaming'
  const busy = streaming

  async function submit(raw: string) {
    const value = raw.trim()
    if (!value || busy) return

    // Pre-create the conversation on the first turn of a new chat so the id rides
    // with the send (no duplicate conversation from the route's onFinish). The
    // first message doubles as the conversation title.
    let convId = activeId
    if (!convId) {
      const conv = await createChatConversation(value)
      if (conv) {
        convId = conv.id
        setActiveId(conv.id)
        if (embedded) {
          onConversationCreated?.(conv.id)
        } else {
          router.replace(`/chat/${conv.id}`)
        }
      }
    }

    // Full-array default send — do NOT override the request to send only the last.
    // conversationId goes in per-send options: the transport body above still holds
    // the PRE-create activeId (state hasn't re-rendered yet on the first turn).
    sendMessage({ text: value }, { body: { conversationId: convId } })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
      >
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center text-sm text-muted-foreground">
            <p>{t('Ask me to generate an estimate or look something up.')}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void submit(t(s))}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground transition-colors hover:bg-muted"
                >
                  {t(s)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => <ChatMessage key={m.id} message={m} />)
        )}
        <div ref={endRef} />
      </div>

      {/* CHAT_COMPOSER_SEAM — the multimodal composer (text + audio + photo). */}
      <ChatComposer
        onSend={(value) => void submit(value)}
        busy={busy}
        streaming={streaming}
        onStop={() => void stop()}
      />
    </div>
  )
}
