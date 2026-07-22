import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { inngest } from '@/lib/inngest/client'
import { type EventType, EVENT_CATEGORIES } from './event-types'
import { resolveChannels } from './preferences'
import { resolveOwnerPhone } from './owner-phone'
import { getApprovedTemplateForEvent } from './whatsapp-registry'
import type { CopyContext } from './copy'
import { resolveNotificationCopy } from './template-resolver'
import { buildFullCopyContext } from './copy-context'

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
  /**
   * Phase 172 (TMPL-06) — optional DB-template resolution seam. Omitted by
   * every call site today (zero behavior change). When provided, notify()
   * resolves the 'in_app' copy via `resolveNotificationCopy()` and uses the
   * resolved title/body for the in_app insert + the downstream email/sms/
   * whatsapp payloads. Per-channel divergence is Phase 174's job.
   */
  copyContext?: CopyContext
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

    // Phase 172 (TMPL-06) — optional DB-template resolution seam. Only runs
    // when a caller opts in via `copyContext`; every existing call site
    // (none pass it yet) skips this block entirely and stays byte-identical.
    // `resolveNotificationCopy` is already internally never-throwing (its
    // own try/catch falls back to `buildNotificationCopy`) — this outer
    // try/catch is defense-in-depth only (mirrors the existing double-guard
    // style already used for the WhatsApp branch's
    // `getApprovedTemplateForEvent` call below), so it should never actually
    // trigger in practice (Research Pitfall 4).
    let resolvedTitle = params.title
    let resolvedBody = params.body
    // Phase 174 (TNT-01) — enrich a caller-supplied (possibly sparse) copyContext
    // with the SAME defaults `copy.ts`'s `buildNotificationCopy` uses, ONCE, before
    // any resolution call. Closes the sparse-ctx-renders-blank regression risk
    // (172-03-SUMMARY.md carry-forward a) now that this seam is load-bearing.
    const fullCopyContext = params.copyContext
      ? buildFullCopyContext(params.eventType, params.copyContext)
      : undefined
    if (fullCopyContext) {
      try {
        const copy = await resolveNotificationCopy(
          'tenant',
          params.eventType,
          'in_app',
          fullCopyContext,
        )
        resolvedTitle = copy.title
        resolvedBody = copy.body
      } catch (e) {
        console.warn(
          '[notifications.dispatch] copyContext resolution failed, using caller-supplied title/body:',
          e instanceof Error ? e.message : String(e),
        )
        // resolvedTitle/resolvedBody already default to params.title/params.body — no-op fallback.
      }
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
      // Phase 174 (TNT-01) — a DISTINCT email-channel copy resolution, stashed
      // as metadata.email_copy for Plan 174-02's already-shipped digest consumer
      // (EmailCopyMetadata contract: subject plain-text, body pre-escaped html).
      // Scoped inside this block because the notifications row insert (which
      // carries the metadata) only happens here — a pre-existing coupling this
      // plan does not restructure.
      let emailCopy: { subject: string; body: string } | null = null
      if (fullCopyContext && channels.email && params.userId) {
        try {
          // .title is TEXT-mode (subject) after the template-resolver FLAG-3
          // fix; .body is HTML-mode.
          const resolved = await resolveNotificationCopy(
            'tenant',
            params.eventType,
            'email',
            fullCopyContext,
          )
          emailCopy = { subject: resolved.title, body: resolved.body }
        } catch (e) {
          console.warn(
            '[notifications.dispatch] email copy resolution failed, metadata.email_copy omitted:',
            e instanceof Error ? e.message : String(e),
          )
          // emailCopy stays null — Plan 174-02's digest consumer falls back per its own contract.
        }
      }

      const { data, error } = await svc
        .from('notifications')
        .insert({
          company_id: params.companyId,
          user_id: params.userId ?? null,
          event_type: params.eventType,
          title: resolvedTitle,
          body: resolvedBody,
          link_url: params.linkUrl ?? null,
          resource_type: params.resourceType ?? null,
          resource_id: params.resourceId ?? null,
          metadata: {
            ...(params.metadata ?? {}),
            ...(emailCopy ? { email_copy: emailCopy } : {}),
          },
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
            title: resolvedTitle,
            body: resolvedBody,
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
                    title: resolvedTitle,
                    body: resolvedBody,
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
            // Phase 174 (TNT-01) — a DISTINCT sms-channel copy resolution
            // (text mode); falls back to today's exact `${title}: ${body}`
            // format on any miss/error/omitted copyContext.
            let smsBody = `${resolvedTitle}: ${resolvedBody}`
            if (fullCopyContext) {
              try {
                const smsCopy = await resolveNotificationCopy(
                  'tenant',
                  params.eventType,
                  'sms',
                  fullCopyContext,
                )
                smsBody = `${smsCopy.title}: ${smsCopy.body}`
              } catch (e) {
                // keep the default smsBody — defense-in-depth, never throws.
              }
            }
            await inngest.send({
              name: 'notification/sms.send',
              data: {
                channel: 'sms',
                to: phone,
                userId: params.userId,
                companyId: params.companyId,
                eventType: params.eventType,
                body: smsBody,
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
