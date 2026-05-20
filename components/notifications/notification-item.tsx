'use client'

import { useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { CategoryIcon } from './category-icon'
import type { NotificationListItem } from './use-notifications'

/**
 * Compact relative time (no extra dep). 30s buckets → "now"; 60s →
 * "{n}m"; 3600s → "{n}h"; >24h → date-string.
 */
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.floor((Date.now() - then) / 1000)
  if (diffSec < 60) return 'now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m`
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)}h`
  if (diffSec < 7 * 86_400) return `${Math.floor(diffSec / 86_400)}d`
  return new Date(iso).toLocaleDateString()
}

interface NotificationItemProps {
  item: NotificationListItem
  onMarkRead: (id: string) => void | Promise<void>
  onAfterNavigate?: () => void
}

export function NotificationItem({
  item,
  onMarkRead,
  onAfterNavigate,
}: NotificationItemProps) {
  const router = useRouter()
  const isUnread = !item.read_at

  const handleClick = async () => {
    if (isUnread) await onMarkRead(item.id)
    if (item.link_url) {
      router.push(item.link_url)
      onAfterNavigate?.()
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`Notification: ${item.title}`}
      className={cn(
        'w-full text-left px-3 py-3 flex gap-3 items-start transition-colors',
        'hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isUnread
          ? 'bg-[var(--glass-bg)] border-l-2 border-l-[var(--gradient-brand-from,theme(colors.primary.DEFAULT))]'
          : 'opacity-80',
      )}
      data-unread={isUnread || undefined}
      data-testid="notification-item"
    >
      <div
        className={cn(
          'mt-0.5 flex-shrink-0 inline-flex items-center justify-center h-7 w-7 rounded-md',
          isUnread ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
        )}
      >
        <CategoryIcon category={item.category} className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p
            className={cn(
              'text-sm truncate',
              isUnread ? 'font-semibold text-foreground' : 'text-foreground/80',
            )}
          >
            {item.title}
          </p>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground flex-shrink-0">
            {relativeTime(item.created_at)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
          {item.body}
        </p>
      </div>
    </button>
  )
}
