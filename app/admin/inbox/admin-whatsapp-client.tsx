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
                  const accentClass =
                    isSelected || isUnread
                      ? "before:bg-[image:var(--gradient-brand)]"
                      : "before:bg-transparent"
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
                      className={`relative flex items-center gap-3 px-3 py-3 pl-4 cursor-pointer transition-colors before:content-[''] before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:rounded-l-sm ${accentClass} ${
                        isSelected
                          ? 'bg-[var(--glass-bg)] backdrop-blur-[var(--glass-blur)]'
                          : 'hover:bg-[var(--glass-bg-light)]'
                      }`}
                    >
                      <Avatar>
                        <AvatarFallback className={`${avatarColor.bg} ${avatarColor.text} font-semibold`}>
                          {getInitials(row.contact_name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold truncate">
                            {row.contact_name || <T>(unknown)</T>}
                          </span>
                          <span className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
                            {isUnread && (
                              <span className="h-2 w-2 rounded-full bg-[hsl(var(--primary))]" aria-hidden="true" />
                            )}
                            {ts ? new Date(ts).toLocaleString() : '—'}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground truncate">
                            {row.last_message_preview ?? '—'}
                          </span>
                          {isUnread && <Badge variant="outline">{row.unread_count}</Badge>}
                        </div>
                        <span className="text-xs text-muted-foreground truncate">
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
                <div className="border-b px-4 py-3">
                  <button
                    type="button"
                    onClick={clearSelection}
                    className="mb-1 flex h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground md:hidden"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    <T>Back</T>
                  </button>
                  <p className="text-sm font-medium">
                    {thread?.conversation.contact_name?.trim() || thread?.conversation.contact_phone}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {thread?.conversation.contact_phone}
                    {companyLabel ? ` · ${companyLabel}` : ''}
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
                  {loading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
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
