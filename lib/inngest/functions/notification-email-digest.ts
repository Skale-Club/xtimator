/**
 * Phase 77 plan 06 (NOTIF-07) — Notification email digest worker.
 *
 * Two triggers, one function:
 *   1. Event `notification/email.queued` (from lib/notifications/dispatch.ts)
 *      — opportunistic immediate send for low-volume periods.
 *   2. Cron `*\/15 * * * *` — batch sweep for anything that wasn't sent
 *      immediately (or was throttled because >3 events landed in the same
 *      15-min window for the same user+category).
 *
 * Grouping policy:
 *   - Within a 15-min window, group unsent notifications by (user_id, category).
 *   - If a group has >3 unsent items → send ONE digest email tagged
 *     `groupedByCategory: true`.
 *   - Else send each item as an immediate one-off (still via the same template
 *     with `groupedByCategory: false` and items.length === 1).
 *
 * "Sent" tracking: we patch the row's `metadata.email_sent_at` JSONB key
 * (no schema change). The cron sweep filters on
 * `metadata->>email_sent_at IS NULL`.
 *
 * Idempotency: when triggered by an event, key on `event.data.notificationId`
 * so duplicate Inngest deliveries don't double-send.
 *
 * Best-effort: any per-group failure is logged and skipped. The function as a
 * whole never throws (returns counts) to keep the cron retry semantics sane.
 */
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { getBranding } from '@/lib/platform-config'
import { sendNotificationDigestEmail } from '@/lib/email/notification-emails'
import {
  EVENT_CATEGORIES,
  type EventType,
  type EventCategory,
} from '@/lib/notifications/event-types'

const FIFTEEN_MIN_MS = 15 * 60 * 1000
const GROUP_THRESHOLD = 3 // >3 → grouped; ≤3 → immediate-style one-offs

interface NotificationRow {
  id: string
  user_id: string | null
  company_id: string
  event_type: string
  title: string
  body: string
  link_url: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}

function categoryFor(eventType: string): EventCategory {
  return EVENT_CATEGORIES[eventType as EventType] ?? 'system'
}

export const notificationEmailDigest = inngest.createFunction(
  {
    id: 'notification-email-digest',
    // Idempotency only matters for the event-trigger path; the cron path
    // doesn't have a stable per-run key. Inngest accepts a CEL expression
    // that resolves to undefined when the field is absent, so this is safe
    // for both triggers.
    idempotency: 'event.data.notificationId',
    triggers: [
      { event: 'notification/email.queued' },
      { cron: '*/15 * * * *' },
    ],
  },
  async ({ step }) => {
    const svc = requireServiceClient()
    const windowStart = new Date(Date.now() - FIFTEEN_MIN_MS).toISOString()

    // Fetch all unsent notifications in the last 15 min that belong to a
    // specific user (company-wide notifications with user_id=null don't get
    // emails — they live in-app only).
    const fetched = await step.run('fetch-unsent', async () => {
      const { data, error } = await svc
        .from('notifications')
        .select(
          'id, user_id, company_id, event_type, title, body, link_url, created_at, metadata',
        )
        .gte('created_at', windowStart)
        .not('user_id', 'is', null)
        .filter('metadata->>email_sent_at', 'is', null)
      if (error) {
        console.warn('[notification-email-digest] fetch failed:', error.message)
        return [] as NotificationRow[]
      }
      return (data ?? []) as NotificationRow[]
    })

    if (fetched.length === 0) {
      return { sent: 0, groups: 0 }
    }

    // Group by (user_id, category).
    const groups = new Map<string, NotificationRow[]>()
    for (const row of fetched) {
      if (!row.user_id) continue
      const cat = categoryFor(row.event_type)
      const key = `${row.user_id}|${cat}`
      const list = groups.get(key) ?? []
      list.push(row)
      groups.set(key, list)
    }

    const branding = await getBranding()
    let totalSent = 0

    for (const [key, items] of groups) {
      const [userId, cat] = key.split('|') as [string, EventCategory]
      try {
        // Look up the user email via service-role admin API.
        const userResp = await step.run(`lookup-user-${userId}`, async () => {
          const { data, error } = await svc.auth.admin.getUserById(userId)
          if (error || !data?.user?.email) {
            return null
          }
          return {
            email: data.user.email,
            name:
              (data.user.user_metadata?.full_name as string | undefined) ??
              null,
          }
        })
        if (!userResp) continue

        const grouped = items.length > GROUP_THRESHOLD

        await step.run(`send-digest-${key}`, async () => {
          await sendNotificationDigestEmail({
            toEmail: userResp.email,
            toName: userResp.name,
            branding: {
              logoUrl: branding.logoUrl,
              brandColor: branding.primaryColor,
              businessName: branding.appName,
            },
            items: items.map((i) => ({
              category: cat,
              title: i.title,
              body: i.body,
              linkUrl: i.link_url ?? undefined,
              createdAt: i.created_at,
            })),
            groupedByCategory: grouped,
          })
        })

        // Mark items as sent — merge with existing metadata so we don't
        // clobber dedupe_key or other extras. We patch one row at a time to
        // preserve each row's existing metadata.
        const sentAt = new Date().toISOString()
        await step.run(`mark-sent-${key}`, async () => {
          for (const item of items) {
            const merged = {
              ...(item.metadata ?? {}),
              email_sent_at: sentAt,
            }
            const { error } = await svc
              .from('notifications')
              .update({ metadata: merged })
              .eq('id', item.id)
            if (error) {
              console.warn(
                '[notification-email-digest] mark-sent failed for',
                item.id,
                error.message,
              )
            }
          }
        })

        totalSent += items.length
      } catch (e) {
        console.warn(
          '[notification-email-digest] group failed:',
          key,
          e instanceof Error ? e.message : String(e),
        )
      }
    }

    return { sent: totalSent, groups: groups.size }
  },
)
