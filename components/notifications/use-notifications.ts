'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient as createBrowserSupabase } from '@/lib/supabase/client'
import {
  type EventCategory,
  EVENT_CATEGORIES,
  type EventType,
} from '@/lib/notifications/event-types'

/**
 * Phase 77 (NOTIF-05 + NOTIF-11) — Bell-panel state hook.
 *
 *  - Initial load: GET /api/notifications/list?limit=20
 *  - Live updates: Supabase Realtime channel
 *      `notifications:${companyId}:${userId}` filtered to INSERTs on `notifications`
 *      where `company_id = $companyId`; client-side filters out other users.
 *  - 300ms debounce batches bursts (e.g. multi-row dispatches) before flushing.
 *  - markRead / markAllRead are optimistic — UI updates first, API call confirms.
 *  - Channel removed + debounce cleared on unmount → no leak.
 */

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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingRef = useRef<NotificationListItem[]>([])

  const flush = useCallback(() => {
    if (pendingRef.current.length === 0) return
    const batch = pendingRef.current
    pendingRef.current = []
    setItems((prev) => {
      // Dedupe by id (avoid double-render if refresh + realtime race).
      const seen = new Set(prev.map((i) => i.id))
      const fresh = batch.filter((i) => !seen.has(i.id))
      return [...fresh, ...prev]
    })
  }, [])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications/list?limit=20')
      if (!res.ok) {
        setLoading(false)
        return
      }
      const data = (await res.json()) as { items: RawNotificationRow[] }
      setItems((data.items ?? []).map(rowToItem))
    } catch {
      // best-effort; keep last-known state
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  useEffect(() => {
    if (!companyId || !userId) return
    const supabase = createBrowserSupabase()
    const channel = supabase
      .channel(`notifications:${companyId}:${userId}`)
      .on(
        'postgres_changes' as never,
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `company_id=eq.${companyId}`,
        } as never,
        (payload: { new: RawNotificationRow }) => {
          const row = payload.new
          // Server channel filter is company-wide; client-side narrow:
          // visible if (user_id is null OR user_id === me).
          if (row.user_id && row.user_id !== userId) return
          pendingRef.current.push(rowToItem(row))
          if (debounceRef.current) clearTimeout(debounceRef.current)
          debounceRef.current = setTimeout(flush, 300)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
    }
  }, [companyId, userId, flush])

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
