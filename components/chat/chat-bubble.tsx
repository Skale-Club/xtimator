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
 * Layout: the launcher can be dragged anywhere and snaps to the nearer side.
 * Phone = a centred popup over a dimmed page (z-[60], above the z-50 bottom
 * nav), fixed in place; desktop = a card that opens beside the launcher and
 * drags by its header. The launcher hides while the panel is open. The panel stays MOUNTED after first open (hidden via CSS)
 * so an in-flight stream / draft survives close→reopen.
 *
 * Entitlement: the server layout passes chatEnabled (getEntitlements(tier)) —
 * a non-entitled owner sees a compact upgrade card (same conversion copy as
 * ChatUpgradePrompt), mirroring the route's 403 chat_not_on_plan boundary.
 * The bubble is NOT mounted for the demo company or Support Mode (layout).
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import Link from 'next/link'
import {
  MessageSquare,
  X,
  Plus,
  History,
  Sparkles,
  Loader2,
  Trash2,
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
  deleteChatConversation,
  type ChatConversationSummary,
} from '@/lib/actions/chat'
import { ChatThread } from '@/components/chat/chat-thread'
import { useIsTwa } from '@/components/pwa/twa-provider'
import '@/lib/visual-viewport'

interface ThreadState {
  id: string | null
  messages: UIMessage[]
  votes: Record<string, boolean>
  /** Remount key — bumping it resets useChat state across switches (mirrors
   *  the /chat page's key={activeId ?? 'new'} contract). */
  key: number
}

// The launcher can be dragged anywhere (finger or mouse). On release it snaps to
// the nearer side edge and keeps its height; the spot is remembered per browser.
const SPOT_KEY = 'xtimator.chat-bubble.spot'
const BUBBLE_PX = 48
// Gap between the resting bubble and the side edge: --bubble-edge, set on the
// button (1.5rem phone, 2rem desktop) so the default spot and the snap match.
const EDGE = 'var(--bubble-edge)'
const DRAG_THRESHOLD_PX = 6

interface BubbleSpot {
  side: 'left' | 'right'
  /** Distance from the bottom of the viewport, px. */
  bottom: number
}

function readSpot(): BubbleSpot | null {
  try {
    const raw = window.localStorage.getItem(SPOT_KEY)
    if (!raw) return null
    const spot = JSON.parse(raw) as Partial<BubbleSpot>
    if ((spot.side === 'left' || spot.side === 'right') && typeof spot.bottom === 'number' && Number.isFinite(spot.bottom)) {
      return { side: spot.side, bottom: spot.bottom }
    }
  } catch { /* storage blocked or bad JSON: use the default spot */ }
  return null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

// Desktop panel size, matching lg:w-[400px] lg:h-[min(640px,calc(100dvh-6rem))].
const PANEL_W_PX = 400
function panelHeight() {
  return Math.min(640, window.innerHeight - 96)
}
function clampPanel(x: number, y: number) {
  return {
    x: clamp(x, 8, window.innerWidth - PANEL_W_PX - 8),
    y: clamp(y, 8, window.innerHeight - panelHeight() - 8),
  }
}

export function ChatBubble({ chatEnabled }: { chatEnabled: boolean }) {
  const isTwa = useIsTwa()
  const { t } = useTranslation()
  const [spot, setSpot] = useState<BubbleSpot | null>(null)
  const [dragAt, setDragAt] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ id: number; dx: number; dy: number; sx: number; sy: number; x: number; y: number; moved: boolean } | null>(null)
  // A drag ends with a click event on the button; this swallows that one click.
  const swallowClick = useRef(false)
  const [open, setOpen] = useState(false)

  useEffect(() => { setSpot(readSpot()) }, [])

  function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    const rect = event.currentTarget.getBoundingClientRect()
    drag.current = {
      id: event.pointerId,
      dx: event.clientX - rect.left,
      dy: event.clientY - rect.top,
      sx: event.clientX,
      sy: event.clientY,
      x: rect.left,
      y: rect.top,
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    if (!d.moved && Math.hypot(event.clientX - d.sx, event.clientY - d.sy) < DRAG_THRESHOLD_PX) return
    d.moved = true
    d.x = clamp(event.clientX - d.dx, 8, window.innerWidth - BUBBLE_PX - 8)
    d.y = clamp(event.clientY - d.dy, 8, window.innerHeight - BUBBLE_PX - 8)
    setDragAt({ x: d.x, y: d.y })
  }

  function onPointerUp(event: PointerEvent<HTMLButtonElement>) {
    const d = drag.current
    if (!d || d.id !== event.pointerId) return
    drag.current = null
    setDragAt(null)
    if (!d.moved) return
    swallowClick.current = true
    const next: BubbleSpot = {
      side: d.x + BUBBLE_PX / 2 < window.innerWidth / 2 ? 'left' : 'right',
      bottom: Math.round(window.innerHeight - d.y - BUBBLE_PX),
    }
    setSpot(next)
    try { window.localStorage.setItem(SPOT_KEY, JSON.stringify(next)) } catch { /* not remembered, still moved */ }
  }

  function onPointerCancel() {
    drag.current = null
    setDragAt(null)
  }

  // Inline position overrides the default Tailwind spot (bottom-24 /
  // lg:bottom-8, --bubble-edge from the right). The clamp keeps a saved spot on screen after the
  // window shrinks or the phone rotates.
  const launcherStyle: CSSProperties | undefined = dragAt
    ? { left: dragAt.x, top: dragAt.y, right: 'auto', bottom: 'auto', transition: 'none' }
    : spot
      ? {
          [spot.side]: EDGE,
          [spot.side === 'left' ? 'right' : 'left']: 'auto',
          top: 'auto',
          bottom: `clamp(8px, ${spot.bottom}px, calc(100dvh - ${BUBBLE_PX + 8}px))`,
        }
      : undefined
  // ── Panel position (desktop only; on a phone the panel is full screen) ──
  // It opens beside wherever the bubble sits and can be dragged by its header.
  const launcherRef = useRef<HTMLButtonElement>(null)
  const [isDesktop, setIsDesktop] = useState(false)
  const [panelAt, setPanelAt] = useState<{ x: number; y: number } | null>(null)
  const [panelDragging, setPanelDragging] = useState(false)
  const panelDrag = useRef<{ id: number; dx: number; dy: number } | null>(null)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return // jsdom and very old browsers
    const mq = window.matchMedia('(min-width: 1024px)')
    const sync = () => setIsDesktop(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // Keeps a dragged panel on screen when the window shrinks.
  useEffect(() => {
    if (!panelAt) return
    const onResize = () => setPanelAt((at) => (at ? clampPanel(at.x, at.y) : at))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [panelAt])

  function placePanelNearBubble() {
    const rect = launcherRef.current?.getBoundingClientRect()
    if (!rect) return
    const onLeft = rect.left + rect.width / 2 < window.innerWidth / 2
    // Same side edge as the bubble, bottoms lined up: the card grows out of it.
    setPanelAt(clampPanel(onLeft ? rect.left : rect.right - PANEL_W_PX, rect.bottom - panelHeight()))
  }

  function onHeaderPointerDown(event: PointerEvent<HTMLElement>) {
    if (!isDesktop || !panelAt) return
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // The header's own buttons (new chat, history, close) keep working.
    if ((event.target as Element).closest('button, a, [role=menuitem]')) return
    panelDrag.current = { id: event.pointerId, dx: event.clientX - panelAt.x, dy: event.clientY - panelAt.y }
    event.currentTarget.setPointerCapture(event.pointerId)
    setPanelDragging(true)
  }

  function onHeaderPointerMove(event: PointerEvent<HTMLElement>) {
    const d = panelDrag.current
    if (!d || d.id !== event.pointerId) return
    setPanelAt(clampPanel(event.clientX - d.dx, event.clientY - d.dy))
  }

  function onHeaderPointerEnd(event: PointerEvent<HTMLElement>) {
    if (panelDrag.current?.id !== event.pointerId) return
    panelDrag.current = null
    setPanelDragging(false)
  }

  const panelStyle: CSSProperties | undefined =
    isDesktop && panelAt ? { left: panelAt.x, top: panelAt.y, right: 'auto', bottom: 'auto' } : undefined

  const [mounted, setMounted] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadedOnce, setLoadedOnce] = useState(false)
  const [conversations, setConversations] = useState<ChatConversationSummary[]>([])
  const [thread, setThread] = useState<ThreadState>({
    id: null,
    messages: [],
    votes: {},
    key: 0,
  })

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
        if (th) {
          setThread((s) => ({ id: th.id, messages: th.messages, votes: th.votes, key: s.key + 1 }))
        }
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
      if (th) {
        setThread((s) => ({ id: th.id, messages: th.messages, votes: th.votes, key: s.key + 1 }))
      }
    } finally {
      setLoading(false)
    }
  }

  function newChat() {
    setThread((s) => ({ id: null, messages: [], votes: {}, key: s.key + 1 }))
  }

  async function removeConversation(id: string) {
    // Optimistic removal; the delete cascades messages + votes server-side.
    setConversations((list) => list.filter((c) => c.id !== id))
    if (id === thread.id) newChat()
    await deleteChatConversation(id)
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
          onClick={() => {
            if (swallowClick.current) { swallowClick.current = false; return }
            placePanelNearBubble()
            void openPanel()
          }}
          ref={launcherRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          aria-label={t('Open chat assistant')}
          title={t('Drag to move')}
          style={launcherStyle}
          className={cn(
            'fixed z-40 [--bubble-edge:1.5rem] lg:[--bubble-edge:2rem]',
            'bottom-24 right-[var(--bubble-edge)] lg:bottom-8',
            'flex h-12 w-12 items-center justify-center rounded-full',
            'bg-primary text-primary-foreground shadow-lg',
            // touch-none: a finger on the bubble drags it instead of scrolling the page.
            'touch-none select-none [-webkit-touch-callout:none]',
            dragAt
              ? 'scale-110 cursor-grabbing shadow-2xl'
              // Only scale/shadow animate: animating position would slide the bubble
              // from the default corner to its saved spot on every page load.
              : 'cursor-grab transition-[transform,box-shadow] hover:scale-105 active:scale-95',
          )}
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      )}

      {/* Phone: dim the page behind the popup. A tap on it does nothing, so a stray
          touch never closes the chat (only the X does); desktop has no backdrop. */}
      {mounted && open && <div aria-hidden className="fixed inset-0 z-[59] bg-black/60 backdrop-blur-[2px] lg:hidden" />}

      {mounted && (
        <div
          role="dialog"
          aria-label={t('Chat assistant')}
          style={panelStyle}
          className={cn(
            'fixed z-[60] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl',
            // Phone: a popup with side margins, centred in the part of the screen
            // the keyboard leaves visible (lib/visual-viewport.ts), fixed in place.
            'inset-x-5 mx-auto max-w-md top-[calc(var(--app-vv-top,0px)+var(--app-vvh,100dvh)/2)] -translate-y-1/2',
            'h-[min(42rem,calc(var(--app-vvh,100dvh)-1.5rem))]',
            // Desktop: a card that opens beside the bubble and drags by its header.
            'lg:inset-x-auto lg:mx-0 lg:max-w-none lg:top-auto lg:translate-y-0 lg:bottom-6 lg:right-6',
            'lg:h-[min(640px,calc(100dvh-6rem))] lg:w-[400px]',
            open ? 'flex' : 'hidden',
          )}
        >
          {/* Header — the drag handle on desktop */}
          <header
            onPointerDown={onHeaderPointerDown}
            onPointerMove={onHeaderPointerMove}
            onPointerUp={onHeaderPointerEnd}
            onPointerCancel={onHeaderPointerEnd}
            className={cn(
              'flex items-center gap-2 border-b border-border px-4 py-3',
              'lg:touch-none lg:select-none',
              panelDragging ? 'lg:cursor-grabbing' : 'lg:cursor-grab',
            )}
          >
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
                          className={cn('group/item gap-2', thread.id === c.id && 'bg-muted/60')}
                        >
                          <span className="min-w-0 flex-1 truncate">
                            {c.title ?? t('Untitled chat')}
                          </span>
                          <button
                            type="button"
                            aria-label={t('Delete conversation')}
                            onClick={(e) => {
                              e.stopPropagation()
                              e.preventDefault()
                              void removeConversation(c.id)
                            }}
                            className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:text-destructive"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
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
                    'Upgrade to Pro or Business to chat with your AI assistant. Generate estimates, query your data, and ask trade how-to questions without leaving Xtimator.',
                  )}
                </p>
                {!isTwa && (
                  <Button asChild size="sm" className="mt-1">
                    <Link href="/settings/billing">{t('Upgrade your plan')}</Link>
                  </Button>
                )}
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
              initialVotes={thread.votes}
              embedded
              onConversationCreated={onConversationCreated}
            />
          )}
        </div>
      )}
    </>
  )
}
