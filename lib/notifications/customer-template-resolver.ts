import { buildCustomerCopy, type CustomerCopyContext, type CustomerCopy, type CustomerEventType } from './customer-copy'
import { renderTemplate, type TemplateVars } from './template-engine'

/**
 * lib/notifications/customer-template-resolver.ts
 *
 * Phase 177 plan 05 (CUST-02) — DB-first, customer-copy.ts-fallback resolver
 * for END-CUSTOMER (client-facing) notification content. Mirrors
 * `lib/notifications/template-resolver.ts`'s `resolveNotificationCopy`
 * almost line-for-line, but scoped to `notification_templates` rows with
 * `scope = 'customer'` and the small `CustomerEventType` union — deliberately
 * kept as a SEPARATE module (not a widened `resolveNotificationCopy`)
 * because `buildNotificationCopy`/`EventType` are switch-exhaustive against
 * a different, unrelated (tenant) union; touching them to accept a wider
 * type would risk Phase 172/174 regressions for zero benefit.
 *
 * Contract: this function NEVER throws and NEVER returns a blank body —
 * every miss/corruption degrades to `buildCustomerCopy(eventType, channel,
 * ctx)`, itself defensive-default and never blank. No `title` field here
 * (unlike the tenant resolver) — customer channels are email/sms only, no
 * in_app surface to title.
 *
 * Only subject/body columns are selected — never the jsonb `variables`
 * catalog column — so there is no JSON.parse in this hot path.
 */

interface CustomerTemplateRow {
  subject: string | null
  body: string | null
}

export async function resolveCustomerCopy(
  eventType: CustomerEventType,
  channel: 'email' | 'sms',
  ctx: CustomerCopyContext,
): Promise<CustomerCopy> {
  try {
    // Lazy import to keep this module free of a service-client dependency for
    // static analysis (and to avoid pulling server-only deps in unnecessarily).
    const { createServiceClient } = await import('@/lib/supabase/service')
    const svc = createServiceClient()
    if (!svc) return buildCustomerCopy(eventType, channel, ctx)

    const { data } = await svc
      .from('notification_templates')
      .select('subject, body')
      .eq('scope', 'customer')
      .eq('event_type', eventType)
      .eq('channel', channel)
      .eq('is_active', true)
      .maybeSingle()

    const row = data as CustomerTemplateRow | null
    if (!row || !row.body) return buildCustomerCopy(eventType, channel, ctx)

    const mode = channel === 'email' ? 'html' : 'text'
    const vars = ctx as unknown as TemplateVars

    const renderedBody = renderTemplate(row.body, vars, mode).trim()
    // Corrupt/empty-after-substitution template must never reach delivery.
    if (!renderedBody) return buildCustomerCopy(eventType, channel, ctx)

    // Subject (email only) is NEVER an HTML-rendering context (email subject
    // header) — always render in 'text' mode regardless of channel, same
    // discipline as the tenant resolver's title/subject handling.
    const renderedSubject = row.subject ? renderTemplate(row.subject, vars, 'text').trim() : ''

    if (channel === 'email') {
      return {
        subject: renderedSubject || buildCustomerCopy(eventType, channel, ctx).subject,
        body: renderedBody,
      }
    }

    return { body: renderedBody }
  } catch (err) {
    console.warn(
      '[customer-template-resolver] resolveCustomerCopy fell back to buildCustomerCopy:',
      err instanceof Error ? err.message : String(err),
    )
    return buildCustomerCopy(eventType, channel, ctx)
  }
}
