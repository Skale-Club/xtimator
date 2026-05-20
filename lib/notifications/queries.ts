import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import {
  type EventCategory,
  type EventType,
  EVENT_CATEGORIES,
} from './event-types'

/**
 * Phase 77 (NOTIF-06) — Server-side notification list query.
 *
 * Used by the `/notifications` full-page view to fetch user-scoped paginated
 * notifications with optional category + unread filters.
 *
 * Pagination uses cursor (ISO `created_at`) instead of offset to remain stable
 * under live inserts. We fetch `limit+1` to derive `nextCursor` without a
 * separate count query.
 */

export type NotificationRow = {
  id: string
  company_id: string
  user_id: string | null
  event_type: EventType
  title: string
  body: string
  link_url: string | null
  resource_type: string | null
  resource_id: string | null
  metadata: Record<string, unknown>
  read_at: string | null
  pinned: boolean
  created_at: string
  expires_at: string | null
}

export interface ListNotificationsArgs {
  companyId: string
  userId: string
  category?: EventCategory | null
  unreadOnly?: boolean
  cursor?: string | null // ISO timestamp of created_at
  limit?: number
}

export interface ListNotificationsResult {
  items: NotificationRow[]
  nextCursor: string | null
}

export async function listNotificationsPage(
  args: ListNotificationsArgs,
): Promise<ListNotificationsResult> {
  const svc = requireServiceClient()
  const limit = Math.min(args.limit ?? 50, 100)

  let q = svc
    .from('notifications')
    .select('*')
    .eq('company_id', args.companyId)
    .or(`user_id.is.null,user_id.eq.${args.userId}`)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit + 1)

  if (args.cursor) q = q.lt('created_at', args.cursor)
  if (args.unreadOnly) q = q.is('read_at', null)
  if (args.category) {
    const types = (Object.keys(EVENT_CATEGORIES) as EventType[]).filter(
      (t) => EVENT_CATEGORIES[t] === args.category,
    )
    if (types.length === 0) {
      return { items: [], nextCursor: null }
    }
    q = q.in('event_type', types)
  }

  const { data, error } = await q
  if (error) {
    console.warn('[notifications.queries] listNotificationsPage failed:', error.message)
    return { items: [], nextCursor: null }
  }
  const rows = (data ?? []) as NotificationRow[]
  const items = rows.slice(0, limit)
  const nextCursor =
    rows.length > limit && items.length > 0
      ? items[items.length - 1].created_at
      : null
  return { items, nextCursor }
}
