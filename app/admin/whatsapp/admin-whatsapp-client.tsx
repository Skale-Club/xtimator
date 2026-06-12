'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { T } from '@/components/i18n/t'
import { MessageBubble } from '@/components/whatsapp/message-bubble'
import { loadAdminConversationThread } from '@/lib/actions/admin-whatsapp'
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

export function AdminWhatsAppClient({ conversations }: { conversations: Row[] }) {
  const [openRow, setOpenRow] = useState<Row | null>(null)
  const [thread, setThread] = useState<ConversationThread | null>(null)
  const [loading, setLoading] = useState(false)

  async function openThread(row: Row) {
    setOpenRow(row)
    setThread(null)
    setLoading(true)
    const res = await loadAdminConversationThread(row.id)
    if (res.ok) {
      setThread(res.thread)
    } else {
      toast.error(res.error)
      setOpenRow(null)
    }
    setLoading(false)
  }

  return (
    <>
      <Card variant="glass" className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Phone</th>
                <th className="text-left px-4 py-3 font-medium">Name</th>
                <th className="text-left px-4 py-3 font-medium">Company</th>
                <th className="text-left px-4 py-3 font-medium">Unread</th>
                <th className="text-left px-4 py-3 font-medium">Last message</th>
                <th className="text-left px-4 py-3 font-medium">Last activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {conversations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    <T>No conversations found.</T>
                  </td>
                </tr>
              ) : (
                conversations.map((row) => {
                  const ts = row.last_message_at ?? row.last_inbound_at
                  return (
                    <tr
                      key={row.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openThread(row)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          openThread(row)
                        }
                      }}
                      className="cursor-pointer hover:bg-muted/20"
                    >
                      <td className="px-4 py-3 font-mono text-xs">{row.contact_phone}</td>
                      <td className="px-4 py-3">
                        {row.contact_name ? (
                          row.contact_name
                        ) : (
                          <span className="text-muted-foreground">
                            <T>(unknown)</T>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {row.company_name ? (
                          row.company_name
                        ) : (
                          <span className="text-muted-foreground">
                            <T>(unknown company)</T>
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">{row.unread_count}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <span className="block max-w-[280px] truncate text-muted-foreground">
                          {row.last_message_preview ?? '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {ts ? new Date(ts).toLocaleString() : '—'}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Sheet
        open={openRow !== null}
        onOpenChange={(o) => {
          if (!o) {
            setOpenRow(null)
            setThread(null)
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md flex flex-col p-0">
          <SheetHeader className="border-b px-4 py-3">
            <SheetTitle>{openRow?.contact_name?.trim() || openRow?.contact_phone}</SheetTitle>
            <SheetDescription>
              {openRow?.contact_phone}
              {openRow?.company_name ? ` · ${openRow.company_name}` : ''}
            </SheetDescription>
          </SheetHeader>
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
        </SheetContent>
      </Sheet>
    </>
  )
}
