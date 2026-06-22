import type { EventType } from './event-types'

/**
 * Phase 104 (NOTIF-03) — Event → WhatsApp template registry.
 *
 * A small EXPLICIT map of the high-signal owner-notification events we want to
 * deliver over WhatsApp, each pointing at a pre-approved Meta template name +
 * language + a `variables` projector that turns the notify payload into the
 * ordered `{{n}}` body parameters `sendWhatsAppTemplate` expects.
 *
 * Events NOT in this map resolve to `null` → no WhatsApp send (silent no-op in
 * the dispatch branch). Paid/proactive channel: only mapped events ever fire.
 *
 * ⚠️ PROVISIONAL template names — these are the bootstrap seam. Wave 3 (104.3)
 * builds a super-admin panel that drives these event→template mappings from a
 * DB table (`whatsapp_notification_templates`). Until then this static registry
 * is the single source the dispatch reads. Each `templateName` must match a
 * template authored + APPROVED in Meta WhatsApp Manager under Xtimator's WABA.
 *
 * NO secrets — template names + language codes only.
 */

export interface NotificationTemplate {
  templateName: string
  languageCode: string
  /** Projects the notify payload into ordered `{{n}}` body variables. */
  variables: (payload: { title: string; body: string }) => string[]
}

/** Maps the body `{ title, body }` into the two-variable [title, body] order. */
function titleBodyVars(payload: { title: string; body: string }): string[] {
  return [payload.title, payload.body]
}

const REGISTRY: Partial<Record<EventType, NotificationTemplate>> = {
  // Estimate lifecycle — owner wants to know the moment a client acts.
  'estimate.accepted': {
    templateName: 'owner_estimate_update',
    languageCode: 'en_US',
    variables: titleBodyVars,
  },
  'estimate.declined': {
    templateName: 'owner_estimate_update',
    languageCode: 'en_US',
    variables: titleBodyVars,
  },
  // Billing — money + plan health.
  'payment.received': {
    templateName: 'owner_billing_alert',
    languageCode: 'en_US',
    variables: titleBodyVars,
  },
  'quota.exhausted': {
    templateName: 'owner_billing_alert',
    languageCode: 'en_US',
    variables: titleBodyVars,
  },
  'trial.expiring_3d': {
    templateName: 'owner_billing_alert',
    languageCode: 'en_US',
    variables: titleBodyVars,
  },
}

export function getTemplateForEvent(
  eventType: EventType,
): NotificationTemplate | null {
  return REGISTRY[eventType] ?? null
}

/**
 * Wave-3 (104.3) DB-backed resolver: resolve an APPROVED row from
 * `whatsapp_notification_templates` (the super-admin panel registry) for an
 * event, falling back to the static REGISTRY above when no approved DB row
 * matches. Reads via the service client (the table is service-role-only).
 *
 * Seam note: the synchronous `getTemplateForEvent` above remains the source for
 * the existing Wave-2 dispatch path (it must stay sync + side-effect-free for the
 * frozen Wave-2 tests). The dispatch MAY adopt this async variant later once the
 * DB registry is populated + approved; until then this is the forward path that
 * lets approved DB rows drive `getTemplateForEvent` per the plan must-have.
 */
export async function getApprovedTemplateForEvent(
  eventType: EventType,
): Promise<NotificationTemplate | null> {
  try {
    // Lazy import to keep this module free of a service-client dependency for the
    // sync path (and to avoid pulling server-only deps into static analysis).
    const { createServiceClient } = await import('@/lib/supabase/service')
    const svc = createServiceClient()
    if (!svc) return getTemplateForEvent(eventType)

    const { data } = await svc
      .from('whatsapp_notification_templates')
      .select('template_name, language_code')
      .eq('event_type', eventType)
      .eq('status', 'approved')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (data?.template_name) {
      return {
        templateName: data.template_name as string,
        languageCode: (data.language_code as string) ?? 'en_US',
        variables: titleBodyVars,
      }
    }
  } catch (err) {
    console.warn('[whatsapp-registry] getApprovedTemplateForEvent fell back to static map:', err)
  }
  return getTemplateForEvent(eventType)
}
