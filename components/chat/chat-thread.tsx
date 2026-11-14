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
import { ArrowUpRight, Sparkles } from 'lucide-react'
import { useTranslation } from '@/lib/i18n/use-translation'
import {
  createChatConversation,
  voteChatMessage,
  editChatMessage,
  truncateChatFrom,
} from '@/lib/actions/chat'
import { ChatMessage } from '@/components/chat/chat-message'
import { ChatComposer } from '@/components/chat/chat-composer'

/** Empty-state starter prompts (Vercel AI Chatbot "suggested actions" pattern).
 *  Each maps onto one of the route's neutral tools so the first turn lands well. */
const SUGGESTIONS = [
  { label: 'Create an estimate', prompt: 'Create an estimate for a new job' },
  { label: 'Recent estimates', prompt: 'Show my recent estimates' },
  { label: 'My services', prompt: 'What services do I offer?' },
]

/** Map a transport error body onto owner-facing copy (the route's 403/429 JSON). */
function describeChatError(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: string }
    if (parsed.error === 'plan_limit_reached') {
      // The UpgradeModal opens for the 402 itself; this is the inline fallback.
      return 'You are out of credits. Open Billing to subscribe or buy more.'
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
  initialVotes = {},
  embedded = false,
  onConversationCreated,
}: {
  conversationId: string | null
  initialMessages: UIMessage[]
  /** This owner's persisted votes for the seeded history (UIMessage id → 👍/👎). */
  initialVotes?: Record<string, boolean>
  /** Bubble mode: no route navigation on conversation create. */
  embedded?: boolean
  /** Notifies the host (e.g. the bubble's history menu) of a pre-created conversation. */
  onConversationCreated?: (id: string) => void
}) {
  const router = useRouter()
  const { t } = useTranslation()
  const [activeId, setActiveId] = useState<string | null>(conversationId)
  const [votes, setVotes] = useState<Record<string, boolean>>(initialVotes)
  const [preparing, setPreparing] = useState(false)
  const preparingRef = useRef(false)

  const { messages, sendMessage, status, stop, regenerate } = useChat({
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
  useEffect(() => {
    const el = scrollRef.current
    if (el && pinnedRef.current) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [messages, status])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }

  // 'error' must NOT count as busy — a failed turn would otherwise lock the
  // composer forever (no way back to 'ready' without a new send).
  const streaming = status === 'submitted' || status === 'streaming'
  const busy = streaming || preparing

  async function submit(raw: string) {
    const value = raw.trim()
    if (!value || busy || preparingRef.current) return
    preparingRef.current = true
    setPreparing(true)

    try {
      // Pre-create the conversation on the first turn so the id rides with the
      // send. Gate all entry points while creating it, including starter prompts.
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

      // Per-send options carry the just-created id before the transport re-renders.
      sendMessage({ text: value }, { body: { conversationId: convId } })
    } finally {
      preparingRef.current = false
      setPreparing(false)
    }
  }

  // ── Message actions (AI-chatbot parity) ────────────────────────────────────

  function handleVote(messageId: string, isUpvoted: boolean) {
    if (!activeId) return
    // Optimistic — a failed persist just leaves the local highlight; harmless.
    setVotes((v) => ({ ...v, [messageId]: isUpvoted }))
    void voteChatMessage({ conversationId: activeId, messageId, isUpvoted })
  }

  async function handleEdit(messageId: string, text: string) {
    if (busy) return
    // Server first: rewrite the edited row + drop what followed, so the resend's
    // onFinish appends onto a consistent history.
    if (activeId) {
      await editChatMessage({ conversationId: activeId, messageId, text })
    }
    // sendMessage({ messageId }) replaces the message and truncates after it.
    sendMessage({ text, messageId }, { body: { conversationId: activeId } })
  }

  async function handleRegenerate(messageId: string) {
    if (busy) return
    // Server first: drop the old assistant turn (inclusive) before re-requesting.
    if (activeId) {
      await truncateChatFrom({ conversationId: activeId, messageId })
    }
    void regenerate({ messageId, body: { conversationId: activeId } })
  }

  const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        role="log"
        aria-label={t('Conversation')}
        aria-busy={streaming}
        className="min-h-0 min-w-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-5 sm:px-5"
      >
        {messages.length === 0 ? (
          <div className="mx-auto flex min-h-full w-full max-w-md flex-col items-center justify-center gap-4 py-4 text-center">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold tracking-tight">{t('Xtimator AI')}</h2>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {t('Describe a job. Let’s build your estimate.')}
              </p>
            </div>
            <div className="flex w-full flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.prompt}
                  type="button"
                  onClick={() => void submit(t(s.prompt)).catch(() => {
                    toast.error(t('Could not send the message. Please try again.'))
                  })}
                  disabled={busy}
                  className="inline-flex min-h-11 min-w-0 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left text-xs text-foreground transition-colors hover:border-primary/30 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {t(s.label)}
                  <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <ChatMessage
              key={m.id}
              message={m}
              busy={busy}
              vote={votes[m.id]}
              onVote={activeId ? handleVote : undefined}
              onEdit={m.role === 'user' ? (id, text) => void handleEdit(id, text) : undefined}
              onRegenerate={
                m.id === lastAssistantId ? (id) => void handleRegenerate(id) : undefined
              }
            />
          ))
        )}
      </div>

      {/* CHAT_COMPOSER_SEAM — the multimodal composer (text + audio + photo). */}
      <ChatComposer
        onSend={submit}
        busy={busy}
        streaming={streaming}
        onStop={() => void stop()}
      />
    </div>
  )
}
