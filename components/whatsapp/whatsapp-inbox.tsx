'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  MessageCircle,
  Send,
  Loader2,
  ArrowLeft,
  FileText,
  AlertTriangle,
  CheckCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { WaConversationRow, WaMessageRow } from '@/lib/whatsapp/conversations'
import {
  loadConversation,
  sendReply,
  listSendableEstimates,
  sendEstimateToConversation,
} from '@/lib/actions/whatsapp-inbox'
import type { ConversationThread, SendableEstimate } from '@/lib/whatsapp/inbox-types'

const REPLY_WINDOW_MS = 24 * 60 * 60 * 1000

function withinReplyWindow(lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false
  return Date.now() - new Date(lastInboundAt).getTime() < REPLY_WINDOW_MS
}

function displayName(c: Pick<WaConversationRow, 'contact_name' | 'contact_phone'>): string {
  return c.contact_name?.trim() || c.contact_phone
}

function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function MessageBubble({ m }: { m: WaMessageRow }) {
  const outbound = m.direction === 'outbound'
  const failed = m.status === 'failed'

  const content =
    m.msg_type === 'audio' && m.media_url ? (
      <audio
        src={m.media_url}
        controls
        preload="none"
        className="w-full max-w-[260px]"
      />
    ) : (
      <span>
        {m.body ??
          (m.msg_type === 'image'
            ? '📷 Photo'
            : m.msg_type === 'audio'
              ? '🎤 Voice message'
              : m.msg_type === 'document'
                ? '📄 Document'
                : '')}
      </span>
    )

  return (
    <div className={cn('flex', outbound ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words',
          outbound
            ? failed
              ? 'bg-destructive/10 text-foreground border border-destructive/40'
              : 'bg-[image:var(--gradient-brand)] text-white'
            : 'bg-muted text-foreground',
        )}
      >
        {content}
        <span
          className={cn(
            'mt-1 flex items-center gap-1 text-[10px] opacity-70',
            outbound ? 'justify-end' : 'justify-start',
          )}
        >
          {formatTime(m.created_at)}
          {outbound && !failed && <CheckCheck className="h-3 w-3" />}
          {failed && <span className="text-destructive">· failed</span>}
        </span>
      </div>
    </div>
  )
}

export function WhatsAppInbox({
  initialConversations,
}: {
  initialConversations: WaConversationRow[]
}) {
  const searchParams = useSearchParams()
  const [conversations, setConversations] = useState<WaConversationRow[]>(initialConversations)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [thread, setThread] = useState<ConversationThread | null>(null)
  const [loadingThread, setLoadingThread] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [isSending, startSending] = useTransition()

  // Send-estimate panel
  const [showEstimates, setShowEstimates] = useState(false)
  const [estimates, setEstimates] = useState<SendableEstimate[] | null>(null)
  const [clientLinked, setClientLinked] = useState(true)
  const [loadingEstimates, setLoadingEstimates] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  // Guards the ?c= deep-link auto-open so it fires only once per mount.
  const didDeepLink = useRef(false)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [thread?.messages.length])

  function syncConversation(conv: WaConversationRow) {
    setConversations((prev) => {
      const rest = prev.filter((c) => c.id !== conv.id)
      return [conv, ...rest]
    })
  }

  async function openConversation(id: string) {
    setSelectedId(id)
    setThread(null)
    setShowEstimates(false)
    setEstimates(null)
    setLoadingThread(true)
    const res = await loadConversation(id)
    setLoadingThread(false)
    if (!res.ok) {
      toast.error(res.error)
      return
    }
    setThread(res.thread)
    syncConversation(res.thread.conversation)
    // zero the unread badge in the list
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)),
    )
  }

  // Deep-link: /whatsapp?c=<conversationId> auto-opens that conversation once on
  // mount. openConversation -> loadConversation is company-scoped server-side, so
  // an unknown/unowned id falls through to the existing not-found toast.
  useEffect(() => {
    const cid = searchParams.get('c')
    if (cid && !didDeepLink.current && selectedId !== cid) {
      didDeepLink.current = true
      void openConversation(cid)
    }
    // didDeepLink ref short-circuits after the first run, so this fires only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  function onSend() {
    if (!thread) return
    const text = replyText.trim()
    if (!text) return
    startSending(async () => {
      const res = await sendReply(thread.conversation.id, text)
      if (!res.ok) {
        toast.error(res.error)
        if (res.error.toLowerCase().includes('logged as failed')) {
          // refresh to show the failed bubble
          const reload = await loadConversation(thread.conversation.id)
          if (reload.ok) setThread(reload.thread)
        }
        return
      }
      setReplyText('')
      setThread(res.thread)
      syncConversation(res.thread.conversation)
    })
  }

  async function toggleEstimates() {
    if (!thread) return
    const next = !showEstimates
    setShowEstimates(next)
    if (next && estimates === null) {
      setLoadingEstimates(true)
      const res = await listSendableEstimates(thread.conversation.id)
      setLoadingEstimates(false)
      if (!res.ok) {
        toast.error(res.error)
        setShowEstimates(false)
        return
      }
      setClientLinked(res.clientLinked)
      setEstimates(res.estimates)
    }
  }

  function onSendEstimate(estimateId: string) {
    if (!thread) return
    startSending(async () => {
      const res = await sendEstimateToConversation(thread.conversation.id, estimateId)
      if (!res.ok) {
        toast.error(res.error)
        return
      }
      setThread(res.thread)
      syncConversation(res.thread.conversation)
      setShowEstimates(false)
      toast.success(
        res.fallback === 'share_link'
          ? 'PDF unavailable — sent the share link instead.'
          : 'Estimate sent via WhatsApp.',
      )
    })
  }

  const open = thread?.conversation ?? null
  const canReply = open ? withinReplyWindow(open.last_inbound_at) : false

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="flex items-center gap-2 border-b border-border px-6 py-4">
        <MessageCircle className="h-5 w-5 text-primary" />
        <h1 className="text-xl font-semibold tracking-tight">WhatsApp</h1>
        <span className="text-sm text-muted-foreground">· Conversations</span>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Conversation list */}
        <aside
          className={cn(
            'w-full shrink-0 flex-col overflow-y-auto border-r border-border md:flex md:w-80',
            selectedId ? 'hidden md:flex' : 'flex',
          )}
        >
          {conversations.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
              <MessageCircle className="h-10 w-10 opacity-40" />
              <p className="text-sm">No conversations yet.</p>
              <p className="text-xs">
                Inbound WhatsApp messages to your connected number will appear here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => openConversation(c.id)}
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                      selectedId === c.id && 'bg-muted/60',
                    )}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                      {displayName(c).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{displayName(c)}</span>
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {formatTime(c.last_message_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs text-muted-foreground">
                          {c.last_message_preview ?? ''}
                        </span>
                        {c.unread_count > 0 && (
                          <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                            {c.unread_count}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Thread pane */}
        <section
          className={cn(
            'min-w-0 flex-1 flex-col',
            selectedId ? 'flex' : 'hidden md:flex',
          )}
        >
          {!selectedId ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <MessageCircle className="h-12 w-12 opacity-30" />
              <p className="text-sm">Select a conversation to view messages.</p>
            </div>
          ) : loadingThread || !open ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Thread header */}
              <div className="flex items-center gap-3 border-b border-border px-4 py-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() => setSelectedId(null)}
                  aria-label="Back"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-sm font-medium">
                  {displayName(open).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{displayName(open)}</p>
                  <p className="truncate text-xs text-muted-foreground">{open.contact_phone}</p>
                </div>
                <div className="ml-auto">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={toggleEstimates}
                    disabled={isSending}
                  >
                    <FileText className="mr-2 h-4 w-4" />
                    Send estimate
                  </Button>
                </div>
              </div>

              {/* Send-estimate panel */}
              {showEstimates && (
                <div className="border-b border-border bg-muted/30 px-4 py-3">
                  {loadingEstimates ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading estimates…
                    </div>
                  ) : !clientLinked ? (
                    <p className="text-sm text-muted-foreground">
                      This contact isn’t linked to a client. Add a client with this phone number to
                      send their estimates.
                    </p>
                  ) : estimates && estimates.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No consolidated estimates for this client yet.
                    </p>
                  ) : (
                    <ul className="space-y-1">
                      {estimates?.map((e) => (
                        <li key={e.id}>
                          <button
                            type="button"
                            disabled={isSending}
                            onClick={() => onSendEstimate(e.id)}
                            className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted disabled:opacity-50"
                          >
                            <span className="truncate">{e.label}</span>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {e.total != null
                                ? `${e.currencyCode ?? ''} ${e.total.toFixed(2)}`.trim()
                                : ''}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4">
                {(thread?.messages.length ?? 0) === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">No messages yet.</p>
                ) : (
                  thread?.messages.map((m) => <MessageBubble key={m.id} m={m} />)
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply box */}
              <div className="border-t border-border p-3">
                {!canReply && (
                  <div className="mb-2 flex items-start gap-2 rounded-md bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>
                      The 24-hour reply window is closed. WhatsApp only allows free-text replies
                      within 24h of the client’s last message. You can still send an estimate.
                    </span>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <Textarea
                    rows={1}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        onSend()
                      }
                    }}
                    placeholder={canReply ? 'Type a message…' : 'Reply window closed'}
                    disabled={!canReply || isSending}
                    className="max-h-32 min-h-[40px] flex-1 resize-none"
                  />
                  <Button
                    onClick={onSend}
                    disabled={!canReply || isSending || replyText.trim().length === 0}
                    size="icon"
                  >
                    {isSending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
