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
 * Phone = a compact floating window; desktop = a card beside the launcher.
 * Both drag by the header and resize from the top or lower corner, inside the
 * visible viewport (including when the keyboard opens). The panel stays mounted
 * so an in-flight stream / draft survives close→reopen.
 *
 * Entitlement: the server layout passes chatEnabled (getEntitlements(tier)) —
 * a non-entitled owner sees a compact upgrade card (same conversion copy as
 * ChatUpgradePrompt), mirroring the route's 403 chat_not_on_plan boundary.
 * The bubble is NOT mounted for the demo company or Support Mode (layout).
 */
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import Link from 'next/link'
import { SAVE_BAR_CLEARANCE_GAP, useSaveBarRect } from '@/lib/ui/save-bar-clearance'
import {
  MessageSquare,
  Minus,
  Grip,
  X,
  Plus,
  History,
  Sparkles,
  Loader2,
  Trash2,
} from 'lucide-react'
import type { UIMessage } from 'ai'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n/use-translation'
import { Button } from '@/components/ui/button'
import { AppIcon } from '@/components/ui/app-icon'
import { useChatPanel } from '@/hooks/use-chat-panel'
import { useIsPhone } from '@/components/ui/use-is-phone'
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

export function ChatBubble({ chatEnabled, logoUrl }: { chatEnabled: boolean; logoUrl?: string | null }) {
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
    if (drag.current) return
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

  function onPointerCancel(event: PointerEvent<HTMLButtonElement>) {
    if (drag.current?.id !== event.pointerId) return
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
  const launcherRef = useRef<HTMLButtonElement>(null)

  // A visible save bar the bubble would sit on top of: lift the bubble just
  // above it (only then; a bubble beside the bar stays put), so Save is never
  // covered. Horizontal position never changes with the lift, so the current
  // rect is enough to test the overlap.
  const saveBar = useSaveBarRect()
  const [liftTo, setLiftTo] = useState<number | null>(null)
  useEffect(() => {
    const el = launcherRef.current
    if (!saveBar || !el || open) { setLiftTo(null); return }
    const r = el.getBoundingClientRect()
    const overlapsX = r.right > saveBar.left && r.left < saveBar.right
    setLiftTo(overlapsX ? Math.round(window.innerHeight - saveBar.top + SAVE_BAR_CLEARANCE_GAP) : null)
  }, [saveBar, open, spot])
  const baseBottom = spot ? `clamp(8px, ${spot.bottom}px, calc(100dvh - ${BUBBLE_PX + 8}px))` : 'var(--bubble-bottom)'
  const placedStyle: CSSProperties | undefined =
    liftTo !== null && !dragAt
      ? { ...launcherStyle, bottom: `max(${baseBottom}, ${liftTo}px)`, transition: 'bottom 200ms ease, transform 150ms, box-shadow 150ms' }
      : launcherStyle
  const panelRef = useRef<HTMLDivElement>(null)
  // Phones (< 640px): a drawer pinned to the bottom, like every other phone
  // overlay. No drag-to-move or resize; pulling the grab bar or header down closes it.
  const isPhone = useIsPhone()
  const panel = useChatPanel(isPhone)
  const [sheetDy, setSheetDy] = useState(0)
  const sheetDrag = useRef<{ id: number; y: number; t: number; v: number; dy: number } | null>(null)
  const panelStyle: CSSProperties & { '--chat-panel-height': string } = {
    left: panel.rect.x, top: panel.rect.y, width: panel.rect.width, height: panel.rect.height,
    '--chat-panel-height': `${panel.rect.height}px`,
    ...(isPhone
      ? {
          paddingBottom: 'env(safe-area-inset-bottom)',
          transform: sheetDy > 0 ? `translate3d(0, ${sheetDy}px, 0)` : undefined,
          transition: sheetDrag.current ? 'none' : 'transform 220ms cubic-bezier(0.32,0.72,0,1)',
        }
      : null),
  }
  const sheetHandlers = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      if (sheetDrag.current) return
      if (event.pointerType === 'mouse' && event.button !== 0) return
      if ((event.target as Element).closest('button, a, [role="menuitem"]')) return
      event.currentTarget.setPointerCapture?.(event.pointerId)
      sheetDrag.current = { id: event.pointerId, y: event.clientY, t: event.timeStamp, v: 0, dy: 0 }
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      const d = sheetDrag.current
      if (!d || d.id !== event.pointerId) return
      const dt = event.timeStamp - d.t
      const dy = Math.max(0, event.clientY - d.y)
      if (dt > 0) d.v = (dy - d.dy) / dt
      d.dy = dy
      d.t = event.timeStamp
      setSheetDy(dy)
    },
    onPointerUp: (event: React.PointerEvent<HTMLElement>) => {
      const d = sheetDrag.current
      if (!d || d.id !== event.pointerId) return
      sheetDrag.current = null
      if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
      const shouldClose = d.dy > Math.min(panel.rect.height * 0.3, 160) || (d.v > 0.5 && d.dy > 24)
      setSheetDy(0)
      if (shouldClose) hidePanel()
    },
    onPointerCancel: () => {
      sheetDrag.current = null
      setSheetDy(0)
    },
  }

  function hidePanel() {
    setOpen(false)
    // Return keyboard focus to the launcher after React mounts it again.
    requestAnimationFrame(() => launcherRef.current?.focus({ preventScroll: true }))
  }

  useEffect(() => {
    if (open) panelRef.current?.focus({ preventScroll: true })
  }, [open])

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
    } catch {
      toast.error(t('Could not load conversations. Please try again.'))
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
    } catch {
      toast.error(t('Could not load conversations. Please try again.'))
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
            panel.place(launcherRef.current?.getBoundingClientRect())
            void openPanel()
          }}
          ref={launcherRef}
          data-shell="chat-launcher"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={onPointerCancel}
          aria-label={t('Open chat assistant')}
          data-hide-on-keyboard
          title={t('Drag to move')}
          style={placedStyle}
          className={cn(
            'fixed z-40 [--bubble-edge:1.5rem] lg:[--bubble-edge:2rem]',
            '[--bubble-bottom:6rem] lg:[--bubble-bottom:2rem] bottom-[var(--bubble-bottom)] right-[var(--bubble-edge)]',
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
          <MessageSquare className="pointer-events-none h-5 w-5" aria-hidden="true" />
        </button>
      )}

      {/* The workspace stays visible and usable around this non-modal window. */}
      {mounted && open && <div aria-hidden className="pointer-events-none fixed inset-0 z-[59] bg-black/15 lg:hidden" />}

      {mounted && (
        <div
          ref={panelRef}
          data-chat-panel
          role="dialog"
          aria-label="Xtimator AI"
          aria-modal={false}
          tabIndex={-1}
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !event.defaultPrevented) {
              event.preventDefault()
              hidePanel()
            }
          }}
          style={panelStyle}
          className={cn(
            'fixed z-[60] min-h-0 min-w-0 flex-col overflow-hidden border border-border bg-background shadow-2xl outline-none',
            isPhone ? 'rounded-t-[28px] rounded-b-none border-x-0 border-b-0' : 'rounded-2xl',
            open ? 'flex' : 'hidden',
          )}
        >
          {isPhone ? (
            <div
              {...sheetHandlers}
              data-testid="chat-grabber"
              aria-hidden="true"
              className="flex h-6 w-full shrink-0 cursor-grab touch-none select-none items-center justify-center active:cursor-grabbing"
            >
              <span className="h-[5px] w-10 rounded-full bg-foreground/30" />
            </div>
          ) : (
            <button
              type="button"
              aria-label={t('Resize chat height')}
              title={t('Drag to resize. Use arrow keys for smaller adjustments.')}
              {...panel.handlers('top')}
              className="flex h-6 w-full shrink-0 touch-none cursor-ns-resize select-none items-center justify-center hover:bg-muted/60 focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <span className="h-1 w-10 rounded-full bg-muted-foreground/35" />
            </button>
          )}
          {/* Dragging and resizing have separate targets; scrolling messages is safe. */}
          <header
            {...(isPhone ? sheetHandlers : panel.handlers('move'))}
            {...(isPhone ? {} : { tabIndex: 0, 'aria-label': t('Move chat window'), title: t('Drag to move') })}
            className={cn(
              'flex min-w-0 shrink-0 touch-none select-none items-center gap-0.5 border-b border-border px-2 pb-2 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
              !isPhone && (panel.gestureKind === 'move' ? 'cursor-grabbing' : 'cursor-grab'),
            )}
          >
            <AppIcon logoUrl={logoUrl} className="pointer-events-none mr-1 h-6 w-6 shrink-0" />
            <h2 className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-tight sm:text-sm">
              Xtimator AI
            </h2>

            {chatEnabled && (
              <>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={newChat}
                  disabled={loading}
                  aria-label={t('New chat')}
                  title={t('New chat')}
                  className="h-10 w-10 shrink-0"
                >
                  <Plus className="h-4 w-4" />
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      disabled={loading}
                      aria-label={t('Chat history')}
                      title={t('Chat history')}
                      className="h-10 w-10 shrink-0"
                    >
                      <History className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] w-64 max-w-[calc(100vw-2rem)] overflow-y-auto">
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
              onClick={hidePanel}
              aria-label={t('Minimize chat')}
              title={t('Minimize chat')}
              className="h-10 w-10 shrink-0"
            >
              <Minus className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={hidePanel}
              aria-label={t('Close chat')}
              title={t('Close chat')}
              className="h-10 w-10 shrink-0"
            >
              <X className="h-4 w-4" />
            </Button>
          </header>

          {/* Body */}
          {!chatEnabled ? (
            <div className="flex min-h-0 flex-1 items-center justify-center overflow-y-auto p-4">
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
          {!isPhone && <div className="relative h-3 shrink-0">
            <button
              type="button"
              aria-label={t('Resize chat window')}
              title={t('Drag to resize. Use arrow keys for smaller adjustments.')}
              {...panel.handlers('corner')}
              className="absolute bottom-0 right-0 flex h-6 w-6 touch-none cursor-nwse-resize select-none items-center justify-center rounded-tl-lg text-muted-foreground/60 hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
            >
              <Grip className="h-3 w-3" />
            </button>
          </div>}
        </div>
      )}
    </>
  )
}
