import type { EventType } from './event-types'
import { buildNotificationCopy, type CopyContext, type NotificationCopy } from './copy'
import { renderTemplate, type TemplateVars } from './template-engine'

/**
 * Phase 172 plan 03 (TMPL-06 / TMPL-07) — DB-first, copy.ts-fallback
 * notification copy resolver.
 *
 * Mirrors `lib/notifications/whatsapp-registry.ts`'s
 * `getApprovedTemplateForEvent()` shape line-for-line: lazy-import
 * `createServiceClient` (keeps this module server-client-free for static
 * analysis, same reasoning as the WhatsApp registry), no client -> fallback,
 * no/inactive row -> fallback, empty-after-render body -> fallback (never
 * send blank content, Pitfall 2), ANY throw -> caught, warned, fallback.
 *
 * Contract: this function NEVER throws and NEVER returns a blank title/body
 * — every miss degrades to `buildNotificationCopy(eventType, ctx)`, which is
 * itself defensive-default and never blank.
 *
 * Only text columns (title, subject, body) are selected — never the jsonb
 * `variables` catalog column — so there is no JSON.parse in this hot path.
 */

export type TemplateScope = 'tenant' | 'customer'
export type TemplateChannel = 'in_app' | 'email' | 'sms'

interface TemplateRow {
  title: string | null
  subject: string | null
  body: string | null
}

export async function resolveNotificationCopy(
  scope: TemplateScope,
  eventType: EventType,
  channel: TemplateChannel,
  ctx: CopyContext,
): Promise<NotificationCopy> {
  try {
    // Lazy import to keep this module free of a service-client dependency for
    // static analysis (and to avoid pulling server-only deps in unnecessarily).
    const { createServiceClient } = await import('@/lib/supabase/service')
    const svc = createServiceClient()
    if (!svc) return buildNotificationCopy(eventType, ctx)

    const { data } = await svc
      .from('notification_templates')
      .select('title, subject, body')
      .eq('scope', scope)
      .eq('event_type', eventType)
      .eq('channel', channel)
      .eq('is_active', true)
      .maybeSingle()

    const row = data as TemplateRow | null
    if (!row || !row.body) return buildNotificationCopy(eventType, ctx)

    const mode = channel === 'email' ? 'html' : 'text'
    const vars = ctx as unknown as TemplateVars

    const renderedBody = renderTemplate(row.body, vars, mode).trim()
    // Corrupt/empty-after-substitution template must never reach delivery.
    if (!renderedBody) return buildNotificationCopy(eventType, ctx)

    const label = channel === 'email' ? row.subject : row.title
    // Title/subject is NEVER an HTML-rendering context (email subject header, in-app
    // title, sms label) — always render in 'text' mode regardless of channel. Phase 174
    // (TNT-01, plan-checker FLAG 3): an email subject rendered in 'html' mode would
    // surface a literal HTML entity (e.g. &amp;) in a recipient's plain-text subject line.
    const renderedTitle = label ? renderTemplate(label, vars, 'text').trim() : ''

    return {
      title: renderedTitle || buildNotificationCopy(eventType, ctx).title,
      body: renderedBody,
    }
  } catch (err) {
    console.warn(
      '[template-resolver] resolveNotificationCopy fell back to buildNotificationCopy:',
      err instanceof Error ? err.message : String(err),
    )
    return buildNotificationCopy(eventType, ctx)
  }
}
