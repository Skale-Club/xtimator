'use client'

/**
 * components/chat/chat-bubble.tsx — the floating chat launcher + panel.
 *
 * Activates the (previously dormant) in-app chat as a bubble available on every
 * app-shell page instead of a dedicated /chat route (which stays a redirect).
 * A client island mounted by app/(app)/layout.tsx, so it must stay cheap on
 * every page load: conversations + the latest thread load LAZILY on first open
 * via the owner-scoped server actions (listChatConversations / getChatThread) —
 * closed, it renders only the launcher button.
 *
 * Layout: mobile = full-screen panel (covers the z-50 bottom nav → z-[60]);
 * desktop = a fixed bottom-right card. The launcher sits at the tour help
 * button's spot (bottom-24 mobile / bottom-6 desktop, right) and hides while
 * the panel is open. The panel stays MOUNTED after first open (hidden via CSS)
 * so an in-flight stream / draft survives close→reopen.
 *
 * Entitlement: the server layout passes chatEnabled (getEntitlements(tier)) —
 * a non-entitled owner sees a compact upgrade card (same conversion copy as
 * ChatUpgradePrompt), mirroring the route's 403 chat_not_on_plan boundary.
 * The bubble is NOT mounted for the demo company or Support Mode (layout).
 */
import { useState } from 'react'
import Link from 'next/link'
import {
  MessageSquare,
  X,
  Plus,
  History,
  Sparkles,
  Loader2,
} from 'lucide-react'
import type { UIMessage } from 'ai'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  listChatConversations,
  getChatThread,
  type ChatConversationSummary,
} from '@/lib/actions/chat'
import { ChatThread } from '@/components/chat/chat-thread'

interface ThreadState {
  id: string | null
  messages: UIMessage[]
  /** Remount key — bumping it resets useChat state across switches (mirrors
   *  the /chat page's key={activeId ?? 'new'} contract). */
  key: number
}

export function ChatBubble({ chatEnabled }: { chatEnabled: boolean }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([])
  const [thread, setThread] = useState<ThreadState>({ id: null, messages: [], key: 0 })

  async function openPanel() {
    setOpen(true)
    setMounted(true)
    if (!chatEnabled || loadedOnce) return

    // First open: load the history list and resume the most recent conversation
    // (the bubble equivalent of landing on /chat/<latest>).
    setLoading(true)
    try {
      const convs = await listChatConversations()
      setConversations(convs)
      if (convs[0]) {
        const th = await getChatThread(convs[0].id)
        if (th) setThread((s) => ({ id: th.id, messages: th.messages, key: s.key + 1 }))
      }
      setLoadedOnce(true)
    } finally {
      setLoading(false)
    }
  }

  async function selectConversation(id: string) {
    if (id === thread.id) return
    setLoading(true)
    try {
      const th = await getChatThread(id)
      if (th) setThread((s) => ({ id: th.id, messages: th.messages, key: s.key + 1 }))
    } finally {
      setLoading(false)
    }
  }

  function newChat() {
    setThread((s) => ({ id: null, messages: [], key: s.key + 1 }))
  }

  function onConversationCreated() {
    // Refresh the history menu in the background — the new conversation's title
    // comes from the server (first-message auto-title).
    void listChatConversations().then(setConversations)
  }

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => void openPanel()}
          aria-label={t('Open chat assistant')}
          className={cn(
            'fixed bottom-24 right-4 md:bottom-6 md:right-6 z-40',
            'flex h-12 w-12 items-center justify-center rounded-full',
            'bg-primary text-primary-foreground shadow-lg',
            'transition-all hover:scale-105 active:scale-95',
          )}
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      )}

      {mounted && (
        <div
          role="dialog"
          aria-label={t('Chat assistant')}
          className={cn(
            'fixed z-[60] flex-col overflow-hidden bg-background',
            'inset-0 pt-[env(safe-area-inset-top,_0px)]',
            'md:inset-auto md:bottom-6 md:right-6 md:h-[min(640px,calc(100dvh-6rem))] md:w-[400px]',
            'md:rounded-2xl md:border md:border-border md:pt-0 md:shadow-2xl',
            open ? 'flex' : 'hidden',
          )}
        >
          {/* Header */}
          <header className="flex items-center gap-2 border-b border-border px-4 py-3">
            <MessageSquare className="h-4 w-4 text-primary" />
            <h2 className="flex-1 truncate text-sm font-semibold tracking-tight">
              {t('Assistant')}
            </h2>

            {chatEnabled && (
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={newChat}
                  aria-label={t('New chat')}
                  className="h-8 w-8"
                >
                  <Plus className="h-4 w-4" />
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={t('Chat history')}
                      className="h-8 w-8"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-80 w-64 overflow-y-auto">
                    {conversations.length === 0 ? (
                      <DropdownMenuItem disabled>{t('No conversations yet.')}</DropdownMenuItem>
                    ) : (
                      conversations.slice(0, 20).map((c) => (
                        <DropdownMenuItem
                          key={c.id}
                          onSelect={() => void selectConversation(c.id)}
                          className={cn(thread.id === c.id && 'bg-muted/60')}
                        >
                          <span className="truncate">{c.title ?? t('Untitled chat')}</span>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}

            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => setOpen(false)}
              aria-label={t('Close chat')}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          {/* Body */}
          {!chatEnabled ? (
            <div className="flex flex-1 items-center justify-center p-6">
              <div className="flex max-w-xs flex-col items-center gap-3 text-center">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-5 w-5 text-primary" />
                </div>
                <h3 className="text-base font-semibold tracking-tight">
                  {t('In-app chat is a Pro feature')}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {t(
                    'Upgrade to Pro or Business to chat with your AI assistant — generate estimates, query your data, and ask trade how-to questions without leaving Xtimator.',
                  )}
                </p>
                <Button asChild size="sm" className="mt-1">
                  <Link href="/settings/billing">{t('Upgrade your plan')}</Link>
                </Button>
              </div>
            </div>
          ) : loading ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ChatThread
              key={thread.key}
              conversationId={thread.id}
              initialMessages={thread.messages}
              embedded
              onConversationCreated={onConversationCreated}
            />
          )}
        </div>
      )}
    </>
  )
}
