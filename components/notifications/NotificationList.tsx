'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState, useTransition } from 'react'
import {
  CATEGORY_LABELS,
  NotificationFilters,
  categoryIconFor,
} from './NotificationFilters'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/utils/format-date'
import {
  EVENT_CATEGORIES,
  type EventCategory,
  type EventType,
} from '@/lib/notifications/event-types'
import type { NotificationRow } from '@/lib/notifications/queries'

export interface NotificationListProps {
  items: NotificationRow[]
  nextCursor: string | null
  category: EventCategory | null
  unreadOnly: boolean
}

export function NotificationList({
  items,
  nextCursor,
  category,
  unreadOnly,
}: NotificationListProps) {
  const router = useRouter()
  const params = useSearchParams()
  const [, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  // Hydration guard: SSR and the first client paint render a deterministic,
  // time-independent value (formatDate). After mount we upgrade to the live
  // relative string ("3m ago"), avoiding the React #418 text mismatch.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return items
    return items.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.body.toLowerCase().includes(q),
    )
  }, [items, search])

  const loadMore = () => {
    if (!nextCursor) return
    const sp = new URLSearchParams(params?.toString() ?? '')
    sp.set('cursor', nextCursor)
    startTransition(() => {
      router.push(`/notifications?${sp.toString()}`)
    })
  }

  const emptyMessage = (): string => {
    if (search.trim()) return `No notifications match “${search.trim()}”.`
    if (unreadOnly && category)
      return `No unread ${(CATEGORY_LABELS[category] ?? category).toLowerCase()} notifications.`
    if (unreadOnly) return 'No unread notifications.'
    if (category)
      return `No ${(CATEGORY_LABELS[category] ?? category).toLowerCase()} notifications yet.`
    return 'No notifications yet.'
  }

  return (
    <div className="flex flex-col gap-6">
      <NotificationFilters
        category={category}
        unreadOnly={unreadOnly}
        search={search}
        onSearchChange={setSearch}
      />

      {filtered.length === 0 ? (
        <Card
          variant="glass"
          className="flex flex-col items-center justify-center gap-2 px-6 py-16 text-center"
          data-testid="notifications-empty"
        >
          <p className="text-sm text-muted-foreground">{emptyMessage()}</p>
        </Card>
      ) : (
        <ul
          className="flex flex-col gap-2"
          data-testid="notifications-list"
        >
          {filtered.map((n) => (
            <NotificationRow key={n.id} row={n} mounted={mounted} />
          ))}
        </ul>
      )}

      {nextCursor && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            onClick={loadMore}
            data-testid="notifications-load-more"
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  )
}

function NotificationRow({ row, mounted }: { row: NotificationRow; mounted: boolean }) {
  const category: EventCategory =
    EVENT_CATEGORIES[row.event_type as EventType] ?? 'system'
  const Icon = categoryIconFor(category)
  const unread = !row.read_at

  const content = (
    <Card
      variant={unread ? 'glass' : 'default'}
      className={cn(
        'flex items-start gap-3 px-4 py-3 transition-colors',
        unread ? 'border-l-2 border-l-primary' : 'opacity-80',
      )}
      data-testid="notification-item"
      data-unread={unread ? 'true' : 'false'}
    >
      <div
        className={cn(
          'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          unread ? 'gradient-brand text-white' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h3
            className={cn(
              'truncate text-sm',
              unread ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground',
            )}
          >
            {row.title}
          </h3>
          <time
            className="shrink-0 text-xs text-muted-foreground"
            dateTime={row.created_at}
            suppressHydrationWarning
          >
            {mounted ? formatRelative(row.created_at) : formatDate(row.created_at)}
          </time>
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">
          {row.body}
        </p>
      </div>
      {row.pinned && (
        <span
          className="rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400"
          aria-label="Pinned"
        >
          Pinned
        </span>
      )}
    </Card>
  )

  if (row.link_url) {
    return (
      <li>
        <Link
          href={row.link_url}
          className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-[var(--radius-md)]"
        >
          {content}
        </Link>
      </li>
    )
  }
  return <li>{content}</li>
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffSec = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`
  return formatDate(iso)
}
