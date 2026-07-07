'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Loader2, MessageSquare, ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { T } from '@/components/i18n/t'
import { MessageBubble } from '@/components/whatsapp/message-bubble'
import { EmptyState } from '@/components/dashboard/empty-state'
import { loadAdminConversationThread } from '@/lib/actions/admin-whatsapp'
import { getInitials, getAvatarColor } from '@/lib/utils/avatar'
import type { ConversationThread } from '@/lib/whatsapp/inbox-types'

type Row = {
  id: string
  company_id: string
  contact_phone: string
  contact_name: string | null
  last_message_at: string | null
  last_message_preview: string | null
  last_inbound_at: string | null
  unread_count: number
  company_name: string | null
}

export function AdminWhatsAppClient({
  conversations,
  initialConversationId,
  filtersSlot,
  paginationSlot,
}: {
  conversations: Row[]
  initialConversationId: string | null
  filtersSlot: React.ReactNode
  paginationSlot: React.ReactNode
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const selectedId = sp.get('conversation') ?? initialConversationId

  const [thread, setThread] = useState<ConversationThread | null>(null)
  const [loading, setLoading] = useState(false)

  function selectConversation(row: Row) {
    const params = new URLSearchParams(sp.toString())
    params.set('conversation', row.id)
    router.replace(`/admin/inbox?${params.toString()}`, { scroll: false })
  }

  function clearSelection() {
    const params = new URLSearchParams(sp.toString())
    params.delete('conversation')
    router.replace(`/admin/inbox?${params.toString()}`, { scroll: false })
  }

  useEffect(() => {
    if (!selectedId) {
      setThread(null)
      return
    }
    let cancelled = false
    setThread(null)
    setLoading(true)
    const row = conversations.find((r) => r.id === selectedId)
    loadAdminConversationThread(selectedId, row?.company_id).then((res) => {
      if (cancelled) return
      if (res.ok) {
        setThread(res.thread)
      } else {
        toast.error(res.error)
        clearSelection()
      }
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const selectedRow = conversations.find((r) => r.id === selectedId)
  const companyLabel = thread?.conversation.company_id ? selectedRow?.company_name : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="flex h-full min-h-0 gap-0">
          {/* LIST PANE — hidden below md: when a conversation is selected */}
          <div
            className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full md:w-[320px] md:shrink-0 min-h-0 flex-col border-r border-border overflow-hidden`}
          >
            <div className="border-b px-4 py-3">{filtersSlot}</div>
            <div className="flex-1 overflow-y-auto">
              {conversations.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                  <T>No conversations found.</T>
                </p>
              ) : (
                conversations.map((row) => {
                  const ts = row.last_message_at ?? row.last_inbound_at
                  const isSelected = row.id === selectedId
                  const isUnread = row.unread_count > 0
                  const avatarColor = getAvatarColor(row.contact_name || row.contact_phone)
                  return (
                    <div
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => selectConversation(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          selectConversation(row)
                        }
                      }}
                      className={`relative flex items-center gap-3 px-4 py-3.5 cursor-pointer transition-all border-b border-border/40 last:border-0 ${
                        isSelected
                          ? 'bg-primary/5 before:absolute before:inset-y-0 before:left-0 before:w-1 before:bg-[hsl(var(--primary))]'
                          : 'hover:bg-[var(--glass-bg-light)]'
                      }`}
                    >
                      <Avatar className="h-10 w-10 shrink-0 shadow-sm border border-border/50">
                        <AvatarFallback className={`${avatarColor.bg} ${avatarColor.text} font-semibold text-sm`}>
                          {getInitials(row.contact_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-1 flex-col gap-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-sm truncate ${isSelected || isUnread ? 'font-semibold text-foreground' : 'font-medium text-foreground/90'}`}>
                            {row.contact_name || <T>(unknown)</T>}
                          </span>
                          <span className={`text-[11px] whitespace-nowrap ${isUnread ? 'text-[hsl(var(--primary))] font-medium' : 'text-muted-foreground'}`}>
                            {ts ? new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`text-xs truncate ${isUnread ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>
                            {row.last_message_preview ?? '—'}
                          </span>
                          {isUnread && <Badge className="h-5 min-w-[20px] px-1.5 flex items-center justify-center text-[10px] rounded-full bg-[hsl(var(--primary))] text-primary-foreground border-none">{row.unread_count}</Badge>}
                        </div>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 truncate font-semibold">
                          {row.company_name || <T>(unknown company)</T>}
                        </span>
                      </div>
                    </div>
                  )
                })
              )}
            </div>
            <div className="border-t px-4 py-3">{paginationSlot}</div>
          </div>

          {/* THREAD PANE — hidden below md: when NOTHING is selected */}
          <div className={`${selectedId ? 'flex' : 'hidden md:flex'} flex-1 min-h-0 flex-col overflow-hidden`}>
            {!selectedId ? (
              <div className="flex flex-1 items-center justify-center">
                <EmptyState
                  icon={MessageSquare}
                  title="Select a conversation"
                  description="Choose a conversation from the list to view its messages."
                />
              </div>
            ) : (
              <>
                <div className="border-b border-border/40 bg-[var(--glass-bg-light)] px-5 py-4 shadow-sm z-10">
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="mb-1 flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:hidden"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <T>Back</T>
                  </button>
                  <div className="flex items-center gap-3">
                    <Avatar>
                      <AvatarFallback
                        className={`${getAvatarColor(thread?.conversation.contact_name || thread?.conversation.contact_phone).bg} ${getAvatarColor(thread?.conversation.contact_name || thread?.conversation.contact_phone).text} font-semibold`}
                      >
                        {getInitials(thread?.conversation.contact_name ?? null)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col">
                      <p className="text-base font-semibold truncate tracking-tight text-foreground/95">
                        {thread?.conversation.contact_name?.trim() || thread?.conversation.contact_phone}
                      </p>
                      <p className="text-xs font-medium text-muted-foreground truncate">
                        {thread?.conversation.contact_phone}
                        {companyLabel ? ` · ${companyLabel}` : ''}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#262626_1px,transparent_1px)] [background-size:16px_16px] bg-[var(--glass-bg-light)]">
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground/50" />
                    </div>
                  ) : (thread?.messages.length ?? 0) === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      <T>No messages in the last 30 days.</T>
                    </p>
                  ) : (
                    thread?.messages.map((m) => <MessageBubble key={m.id} m={m} />)
                  )}
                </div>
                <div className="border-t px-4 py-2 text-xs text-muted-foreground">
                  <T>Read-only. Shows up to the last 30 days of messages.</T>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
