import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { inngest } from '@/lib/inngest/client'
import { type EventType, EVENT_CATEGORIES } from './event-types'
import { resolveChannels } from './preferences'
import { resolveOwnerPhone } from './owner-phone'
import { getApprovedTemplateForEvent } from './whatsapp-registry'

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
  channels?: {
    inApp?: boolean
    email?: boolean
    whatsapp?: boolean
    sms?: boolean
  }
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
      whatsapp: params.channels?.whatsapp ?? resolved.whatsapp,
      sms: params.channels?.sms ?? resolved.sms,
    }

    if (
      !channels.inApp &&
      !channels.email &&
      !channels.whatsapp &&
      !channels.sms
    ) {
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

    // WhatsApp + SMS — paid/proactive owner channels (NOTIF-03/04/07).
    //
    // Both gate on a phone-on-file: resolve the per-user owner_phone ONCE and skip
    // both channels when there is no number. The per-channel consent gate (incl.
    // the TCPA requirement that an `sms_opt_in_at` timestamp — not the toggle alone
    // — is recorded before any SMS) already lives in `resolveChannels`, so here we
    // trust the resolved `channels.whatsapp` / `channels.sms` decision and only add
    // the phone gate + the registry/template lookup.
    //
    // Each branch dispatches async via Inngest on the notification/channel.send
    // family (`notification/whatsapp.send` + `notification/sms.send`, both handled
    // by `notificationChannelSend`) and is wrapped in its OWN try/catch that logs +
    // swallows — a throwing WhatsApp/SMS
    // send must NEVER block the in-app insert (which already ran) or the other
    // channel (Research Pitfall 4 / NOTIF-07).
    if ((channels.whatsapp || channels.sms) && params.userId) {
      const phone = await resolveOwnerPhone(params.companyId, params.userId)
      if (phone) {
        if (channels.whatsapp) {
          try {
            // DB-backed resolver (Phase 104.3): an admin-approved row in
            // `whatsapp_notification_templates` wins; otherwise it falls back to
            // the static registry map. Its own internal try/catch already degrades
            // to the static map, but keep this branch's try/catch so any unexpected
            // rejection still never breaks the in-app insert (Research Pitfall 4).
            const tpl = await getApprovedTemplateForEvent(params.eventType)
            if (tpl) {
              await inngest.send({
                name: 'notification/whatsapp.send',
                data: {
                  channel: 'whatsapp',
                  to: phone,
                  userId: params.userId,
                  companyId: params.companyId,
                  eventType: params.eventType,
                  templateName: tpl.templateName,
                  languageCode: tpl.languageCode,
                  variables: tpl.variables({
                    title: params.title,
                    body: params.body,
                  }),
                },
              })
            }
          } catch (e) {
            console.warn(
              '[notifications.dispatch] whatsapp dispatch failed:',
              e instanceof Error ? e.message : String(e),
            )
          }
        }

        if (channels.sms) {
          try {
            await inngest.send({
              name: 'notification/sms.send',
              data: {
                channel: 'sms',
                to: phone,
                userId: params.userId,
                companyId: params.companyId,
                eventType: params.eventType,
                body: `${params.title}: ${params.body}`,
              },
            })
          } catch (e) {
            console.warn(
              '[notifications.dispatch] sms dispatch failed:',
              e instanceof Error ? e.message : String(e),
            )
          }
        }
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
