'use client'

/**
 * components/chat/chat-sidebar.tsx — the conversation list pane (CHATUI-02).
 *
 * Mirrors the WhatsApp inbox `aside`: a "New chat" button at the top, then the
 * conversation rows newest-first (listConversations already returns updated_at
 * DESC — the UI renders that order as-is). Each row is a next/link to /chat/<id>
 * so clicking it triggers an RSC reload that seeds that conversation's history.
 * The active row is highlighted; "New chat" clears the active conversation.
 */
import Link from 'next/link'
import { MessageSquare, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'
import { Button } from '@/components/ui/button'
import type { ChatConversationRow } from '@/lib/queries/chat'

function relativeTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ChatSidebar({
  conversations,
  activeId,
  onNew,
}: {
  conversations: ChatConversationRow[]
  activeId: string | null
  onNew: () => void
}) {
  const { t } = useTranslation()

  return (
    <aside
      className={cn(
        'w-full shrink-0 flex-col overflow-y-auto border-r border-border md:flex md:w-80',
        activeId ? 'hidden md:flex' : 'flex',
      )}
    >
      <div className="border-b border-border p-3">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-full justify-start"
          onClick={onNew}
        >
          <Plus className="mr-2 h-4 w-4" />
          {t('New chat')}
        </Button>
      </div>

      {conversations.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
          <MessageSquare className="h-10 w-10 opacity-40" />
          <p className="text-sm">{t('No conversations yet.')}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link
                href={`/chat/${c.id}`}
                className={cn(
                  'flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-muted/50',
                  activeId === c.id && 'bg-muted/60',
                )}
              >
                <span className="truncate text-sm font-medium">
                  {c.title ?? t('Untitled chat')}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {relativeTime(c.updated_at)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </aside>
  )
}
