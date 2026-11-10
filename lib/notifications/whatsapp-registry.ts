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
  /**
   * Phase 174 (TNT-03 / Pitfall 3) — the expected `{{n}}` variable count the
   * approved Meta template requires. Sourced from a DB-approved row's
   * `variables_schema.length` (0 when the column is unconfigured, its own
   * default). Plan 174-04 builds a send-time guard on top of this field that
   * refuses to send when the actual variable count doesn't match.
   *
   * NOTE: this is a structural NO-OP for the 5 static `REGISTRY` fallback
   * entries below — they hardcode `2` to match `titleBodyVars`'s own fixed
   * 2-element output, so the guard never blocks today's existing send
   * behavior for unmigrated/static entries. Real dormancy for those 5 events
   * comes from the opt-in consent gate (lib/notifications/preferences.ts) and
   * Meta's own template-approval gate, not from this field.
   */
  expectedVariableCount: number
}

/** Maps the body `{ title, body }` into the two-variable [title, body] order. */
function titleBodyVars(payload: { title: string; body: string }): string[] {
  return [payload.title, payload.body]
}

/** Owner language -> Meta template language code. One template name carries all translations. */
export type OwnerTemplateLanguage = 'en' | 'pt' | 'es'

export const TEMPLATE_LANGUAGE_CODES: Record<OwnerTemplateLanguage, string> = {
  en: 'en_US',
  pt: 'pt_BR',
  es: 'es',
}

export function templateLanguageCode(language: OwnerTemplateLanguage | null | undefined): string {
  return TEMPLATE_LANGUAGE_CODES[language ?? 'en'] ?? 'en_US'
}

/** Template names (provisional until approved in Meta WhatsApp Manager). See docs/whatsapp/templates.md. */
export const OWNER_ESTIMATE_UPDATE = 'owner_estimate_update'
export const OWNER_BILLING_ALERT = 'owner_billing_alert'
/** Generic re-open template: 1 variable (short summary). Fallback when a free-form owner message hits 131047. */
export const OWNER_UPDATE = 'owner_update'

/** Event -> template name. Variables are always [title, body]. */
const EVENT_TEMPLATE_NAMES: Partial<Record<EventType, string>> = {
  // Estimate lifecycle: owner wants to know the moment a client acts. viewed and
  // expired reuse owner_estimate_update ({{1}} title, {{2}} body) because their
  // copy already fits the two-variable shape.
  'estimate.viewed': OWNER_ESTIMATE_UPDATE,
  'estimate.accepted': OWNER_ESTIMATE_UPDATE,
  'estimate.declined': OWNER_ESTIMATE_UPDATE,
  'estimate.expired': OWNER_ESTIMATE_UPDATE,
  // Billing: money + plan health.
  'payment.received': OWNER_BILLING_ALERT,
  'quota.exhausted': OWNER_BILLING_ALERT,
  'trial.expiring_3d': OWNER_BILLING_ALERT,
}

export function getTemplateForEvent(
  eventType: EventType,
  language: OwnerTemplateLanguage = 'en',
): NotificationTemplate | null {
  const templateName = EVENT_TEMPLATE_NAMES[eventType]
  if (!templateName) return null
  return {
    templateName,
    languageCode: templateLanguageCode(language),
    variables: titleBodyVars,
    expectedVariableCount: 2,
  }
}

/** Collapse a title/body pair into the single short summary the owner_update template takes. */
export function summaryVariable(payload: { title: string; body: string }, maxLen = 200): string {
  const text = [payload.title, payload.body]
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(': ')
  return text.length > maxLen ? `${text.slice(0, maxLen - 1)}…` : text
}

/** Generic re-open template (1 variable). Used when a free-form owner message hits 131047/131049. */
export function getOwnerUpdateTemplate(
  payload: { title: string; body: string },
  language: OwnerTemplateLanguage = 'en',
): { name: string; languageCode: string; bodyVariables: string[] } {
  return {
    name: OWNER_UPDATE,
    languageCode: templateLanguageCode(language),
    bodyVariables: [summaryVariable(payload)],
  }
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
  language: OwnerTemplateLanguage = 'en',
): Promise<NotificationTemplate | null> {
  try {
    // Lazy import to keep this module free of a service-client dependency for the
    // sync path (and to avoid pulling server-only deps into static analysis).
    const { createServiceClient } = await import('@/lib/supabase/service')
    const svc = createServiceClient()
    if (!svc) return getTemplateForEvent(eventType, language)

    // Prefer the approved row in the owner's language; otherwise any approved row.
    const base = () =>
      svc
        .from('whatsapp_notification_templates')
        .select('template_name, language_code, variables_schema')
        .eq('event_type', eventType)
        .eq('status', 'approved')
        .order('updated_at', { ascending: false })
        .limit(1)
    const wanted = templateLanguageCode(language)
    const localized = await base().eq('language_code', wanted).maybeSingle()
    const { data } = localized.data ? localized : await base().maybeSingle()

    if (data?.template_name) {
      return {
        templateName: data.template_name as string,
        languageCode: (data.language_code as string) ?? 'en_US',
        variables: titleBodyVars,
        // Defensive: variables_schema defaults to '[]'::jsonb in the DB, but
        // guard against null/non-array values regardless — never throw here.
        expectedVariableCount: Array.isArray(data.variables_schema)
          ? data.variables_schema.length
          : 0,
      }
    }
  } catch (err) {
    console.warn('[whatsapp-registry] getApprovedTemplateForEvent fell back to static map:', err)
  }
  return getTemplateForEvent(eventType, language)
}
