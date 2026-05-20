'use client'

import Link from 'next/link'
import { NotificationItem } from './notification-item'
import type { NotificationListItem } from './use-notifications'

interface PanelState {
  items: NotificationListItem[]
  unreadCount: number
  loading: boolean
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
}

interface NotificationPanelProps {
  state: PanelState
  onItemClick?: () => void
}

/**
 * Day-label for a notification timestamp. "Today" / "Yesterday" / full date.
 */
function dayLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'Earlier'
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfYesterday.getDate() - 1)
  if (d >= startOfToday) return 'Today'
  if (d >= startOfYesterday) return 'Yesterday'
  return d.toLocaleDateString()
}

function groupByDay(items: NotificationListItem[]): Array<{ label: string; items: NotificationListItem[] }> {
  const groups: Array<{ label: string; items: NotificationListItem[] }> = []
  let current: { label: string; items: NotificationListItem[] } | null = null
  for (const item of items) {
    const label = dayLabel(item.created_at)
    if (!current || current.label !== label) {
      current = { label, items: [] }
      groups.push(current)
    }
    current.items.push(item)
  }
  return groups
}

export function NotificationPanel({ state, onItemClick }: NotificationPanelProps) {
  const { items, unreadCount, loading, markRead, markAllRead } = state
  const unread = items.filter((i) => !i.read_at)
  const read = items.filter((i) => i.read_at)

  return (
    <div className="flex flex-col max-h-[70vh]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-[var(--glass-border)]">
        <h3 className="text-sm font-semibold">Notifications</h3>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={() => markAllRead()}
            className="text-xs text-primary hover:underline focus:outline-none focus-visible:underline"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading && items.length === 0 ? (
          <div className="px-3 py-8 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-muted-foreground">
            All caught up
          </div>
        ) : (
          <>
            {unread.length > 0 && (
              <section>
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Unread
                </div>
                {groupByDay(unread).map((group) => (
                  <div key={`u-${group.label}`}>
                    <div className="px-3 py-1 text-[10px] text-muted-foreground/80">
                      {group.label}
                    </div>
                    {group.items.map((item) => (
                      <NotificationItem
                        key={item.id}
                        item={item}
                        onMarkRead={markRead}
                        onAfterNavigate={onItemClick}
                      />
                    ))}
                  </div>
                ))}
              </section>
            )}
            {read.length > 0 && (
              <section>
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Recent
                </div>
                {groupByDay(read).map((group) => (
                  <div key={`r-${group.label}`}>
                    <div className="px-3 py-1 text-[10px] text-muted-foreground/80">
                      {group.label}
                    </div>
                    {group.items.map((item) => (
                      <NotificationItem
                        key={item.id}
                        item={item}
                        onMarkRead={markRead}
                        onAfterNavigate={onItemClick}
                      />
                    ))}
                  </div>
                ))}
              </section>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-[var(--glass-border)] px-3 py-2 text-right">
        <Link
          href="/notifications"
          onClick={onItemClick}
          className="text-xs text-primary hover:underline"
        >
          See all →
        </Link>
      </div>
    </div>
  )
}
