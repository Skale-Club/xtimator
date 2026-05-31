'use client'

import Link from 'next/link'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { ProjectConversationLink } from '@/lib/queries/whatsapp-inbox'

interface ProjectWhatsAppCardProps {
  conversationLink: ProjectConversationLink
  onStartFlow: () => void
}

/** Short, locale-relative timestamp (mirrors the inbox formatTime style). */
function formatTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

export function ProjectWhatsAppCard({ conversationLink, onStartFlow }: ProjectWhatsAppCardProps) {
  const { conversationId, contactName, lastMessagePreview, lastMessageAt } = conversationLink

  if (conversationId) {
    return (
      <Card variant="glass">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
              <MessageCircle className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{contactName}</p>
              {lastMessagePreview && (
                <p className="truncate text-xs text-muted-foreground">{lastMessagePreview}</p>
              )}
              {lastMessageAt && (
                <p className="mt-0.5 text-[10px] text-muted-foreground">
                  {formatTime(lastMessageAt)}
                </p>
              )}
            </div>
          </div>
          <Button asChild className="mt-4 w-full">
            <Link href={`/whatsapp?c=${conversationId}`}>
              <MessageCircle className="mr-2 h-4 w-4" />
              Abrir conversa no WhatsApp
            </Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card variant="glass">
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted">
            <MessageCircle className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">
            Nenhuma conversa ainda — envie o estimate pelo WhatsApp para iniciar
          </p>
        </div>
        <Button variant="outline" className="mt-4 w-full" onClick={onStartFlow}>
          <MessageCircle className="mr-2 h-4 w-4" />
          Enviar pelo WhatsApp
        </Button>
      </CardContent>
    </Card>
  )
}
