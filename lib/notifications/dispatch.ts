import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { inngest } from '@/lib/inngest/client'
import { type EventType, EVENT_CATEGORIES } from './event-types'
import { resolveChannels } from './preferences'

/**
 * Phase 77 (NOTIF-03) — Single fan-out entry point for the notifications system.
 *
 * Every event source in the codebase calls `notify()`. It:
 *   1. Resolves channels (in_app / email) via user preferences + optional override
 *   2. Checks dedupe (metadata.dedupe_key collision within 24h → no-op)
 *   3. Inserts the in-app `notifications` row (if inApp enabled)
 *   4. Queues an Inngest `notification/email.queued` event (if email enabled)
 *
 * Best-effort by design — mirrors lib/admin/audit-log.ts. A failure to write
 * a notification MUST NOT break the business operation that triggered it.
 * Failures log to console and return { ok: false }.
 *
 * NEVER pass raw secrets through `metadata`. Use safe projections only.
 */

export interface NotifyParams {
  companyId: string
  userId?: string | null
  eventType: EventType
  title: string
  body: string
  linkUrl?: string
  resourceType?: string
  resourceId?: string
  metadata?: Record<string, unknown>
  pinned?: boolean
  expiresAt?: Date | null
  channels?: { inApp?: boolean; email?: boolean }
}

export interface NotifyResult {
  ok: boolean
  notificationId?: string
  skipped?: 'dedupe' | 'channel_disabled' | 'no_op'
}

export async function notify(params: NotifyParams): Promise<NotifyResult> {
  try {
    const resolved = await resolveChannels(
      params.eventType,
      params.userId ?? null,
      params.channels,
    )
    // Defense-in-depth: override params always win over resolveChannels result,
    // so callers (e.g. trial.expired force-email) get deterministic behavior
    // even if `resolveChannels` is stubbed elsewhere.
    const channels = {
      inApp: params.channels?.inApp ?? resolved.inApp,
      email: params.channels?.email ?? resolved.email,
    }

    if (!channels.inApp && !channels.email) {
      return { ok: true, skipped: 'channel_disabled' }
    }

    const svc = requireServiceClient()

    // Idempotency: dedupe_key collision within 24h is a no-op.
    const dedupeKey =
      typeof params.metadata?.dedupe_key === 'string'
        ? (params.metadata.dedupe_key as string)
        : undefined

    if (dedupeKey) {
      const since = new Date(
        Date.now() - 24 * 60 * 60 * 1000,
      ).toISOString()
      const { data: existing } = await svc
        .from('notifications')
        .select('id')
        .eq('company_id', params.companyId)
        .gte('created_at', since)
        .contains('metadata', { dedupe_key: dedupeKey })
        .limit(1)
        .maybeSingle()
      if (existing && (existing as { id?: string }).id) {
        return {
          ok: true,
          notificationId: (existing as { id: string }).id,
          skipped: 'dedupe',
        }
      }
    }

    let notificationId: string | undefined

    if (channels.inApp) {
      const { data, error } = await svc
        .from('notifications')
        .insert({
          company_id: params.companyId,
          user_id: params.userId ?? null,
          event_type: params.eventType,
          title: params.title,
          body: params.body,
          link_url: params.linkUrl ?? null,
          resource_type: params.resourceType ?? null,
          resource_id: params.resourceId ?? null,
          metadata: params.metadata ?? {},
          pinned: params.pinned ?? false,
          expires_at: params.expiresAt
            ? params.expiresAt.toISOString()
            : null,
        })
        .select('id')
        .single()

      if (error || !data) {
        console.warn(
          '[notifications.dispatch] insert failed:',
          error?.message ?? 'no data returned',
        )
        return { ok: false }
      }
      notificationId = (data as { id: string }).id
    }

    if (channels.email && params.userId) {
      try {
        await inngest.send({
          name: 'notification/email.queued',
          data: {
            notificationId: notificationId ?? '',
            userId: params.userId,
            companyId: params.companyId,
            eventType: params.eventType,
            category: EVENT_CATEGORIES[params.eventType],
            title: params.title,
            body: params.body,
            linkUrl: params.linkUrl,
          },
        })
      } catch (e) {
        console.warn(
          '[notifications.dispatch] inngest.send failed:',
          e instanceof Error ? e.message : String(e),
        )
      }
    }

    return { ok: true, notificationId }
  } catch (e) {
    console.warn(
      '[notifications.dispatch] unexpected:',
      e instanceof Error ? e.message : String(e),
    )
    return { ok: false }
  }
}
