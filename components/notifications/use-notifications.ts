'use client'

import { useEffect, useState, useCallback } from 'react'
import {
  type EventCategory,
  EVENT_CATEGORIES,
  type EventType,
  isVisibleNotificationEventType,
} from '@/lib/notifications/event-types'

/**
 * Phase 77 (NOTIF-05 + NOTIF-11) — Bell-panel state hook.
 *
 *  - Initial load: GET /api/notifications/list?limit=20
 *  - Live updates: SEED-056 replaced the Supabase Realtime `postgres_changes`
 *      subscription (which never delivered: the publication had 0 tables) with
 *      bounded polling of the same list endpoint - every NOTIFICATIONS_POLL_MS
 *      while the tab is visible, paused while hidden, and refetched on focus /
 *      when the tab becomes visible again. Polls are silent (no loading flicker).
 *  - markRead / markAllRead are optimistic - UI updates first, API call confirms.
 *  - Interval + listeners removed on unmount, so nothing leaks.
 */

export const NOTIFICATIONS_POLL_MS = 30_000

export interface NotificationListItem {
  id: string
  event_type: EventType
  category: EventCategory
  title: string
  body: string
  link_url: string | null
  created_at: string
  read_at: string | null
  pinned: boolean
}

interface UseNotificationsArgs {
  companyId: string
  userId: string
}

interface UseNotificationsState {
  items: NotificationListItem[]
  unreadCount: number
  loading: boolean
  markRead: (id: string) => Promise<void>
  markAllRead: () => Promise<void>
  refresh: () => Promise<void>
}

type RawNotificationRow = {
  id: string
  event_type: string
  title: string
  body: string
  link_url: string | null
  created_at: string
  read_at: string | null
  pinned: boolean
  user_id: string | null
}

function categorize(eventType: string): EventCategory {
  return EVENT_CATEGORIES[eventType as EventType] ?? 'system'
}

function rowToItem(row: RawNotificationRow): NotificationListItem {
  return {
    id: row.id,
    event_type: row.event_type as EventType,
    category: categorize(row.event_type),
    title: row.title,
    body: row.body,
    link_url: row.link_url,
    created_at: row.created_at,
    read_at: row.read_at,
    pinned: row.pinned,
  }
}

export function useNotifications({
  companyId,
  userId,
}: UseNotificationsArgs): UseNotificationsState {
  const [items, setItems] = useState<NotificationListItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch('/api/notifications/list?limit=20')
      if (!res.ok) return
      const data = (await res.json()) as { items: RawNotificationRow[] }
      setItems(
        (data.items ?? [])
          .filter((row) => isVisibleNotificationEventType(row.event_type))
          .map(rowToItem),
      )
    } catch {
      // best-effort; keep last-known state
    } finally {
      if (!silent) setLoading(false)
    }
  }, [])

  const refresh = useCallback(() => load(false), [load])

  useEffect(() => {
    void load(false)
  }, [load])

  // Bounded polling: only while the tab is visible; refetch on focus/visible.
  useEffect(() => {
    if (!companyId || !userId) return
    let timer: ReturnType<typeof setInterval> | null = null

    const stop = () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
    const start = () => {
      if (timer) return
      timer = setInterval(() => void load(true), NOTIFICATIONS_POLL_MS)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void load(true)
        start()
      } else {
        stop()
      }
    }
    const onFocus = () => {
      if (document.visibilityState === 'visible') void load(true)
    }

    if (document.visibilityState === 'visible') start()
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('focus', onFocus)
    return () => {
      stop()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('focus', onFocus)
    }
  }, [companyId, userId, load])

  const markRead = useCallback(async (id: string) => {
    const now = new Date().toISOString()
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, read_at: i.read_at ?? now } : i)),
    )
    try {
      await fetch(`/api/notifications/${id}/read`, { method: 'PATCH' })
    } catch {
      // best-effort; UI already reflects optimistic state
    }
  }, [])

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString()
    setItems((prev) =>
      prev.map((i) => (i.read_at ? i : { ...i, read_at: now })),
    )
    try {
      await fetch('/api/notifications/mark-all-read', { method: 'POST' })
    } catch {
      // best-effort
    }
  }, [])

  const unreadCount = items.reduce(
    (n, i) => (i.read_at ? n : n + 1),
    0,
  )

  return { items, unreadCount, loading, markRead, markAllRead, refresh }
}
