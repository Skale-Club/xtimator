import type { EventType } from './event-types'

/**
 * Phase 104 (NOTIF-03) — Event → WhatsApp template registry.
 *
 * A small EXPLICIT map of the high-signal owner-notification events we want to
 * deliver over WhatsApp, each pointing at a pre-approved Meta template name +
 * language + a `variables` projector that turns the notify payload into the
 * ordered `{{n}}` body parameters `sendWhatsAppTemplate` expects.
 *
 * Static entries document the suggested names for Meta authoring. Runtime
 * delivery resolves approved variants bound to the exact event in the registry.
 */

export interface NotificationTemplate {
  templateName: string
  languageCode: string
  /** Projects the notify payload into ordered `{{n}}` body variables. */
  variables: (payload: { title: string; body: string }) => string[]
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
export const EVENT_TEMPLATE_NAMES = {
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
} satisfies Partial<Record<EventType, string>>

export function getTemplateForEvent(
  eventType: EventType,
  language: OwnerTemplateLanguage = 'en',
): NotificationTemplate | null {
  const templateName = (EVENT_TEMPLATE_NAMES as Partial<Record<EventType, string>>)[eventType]
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

export type NotificationTemplateVariant = {
  template_name: string
  language_code: string
  meta_template_id: string | null
  status: string
  variables_schema: unknown
  quick_reply_count?: number
}

export function isApprovedNotificationTemplate(row: NotificationTemplateVariant): boolean {
  return row.status === 'approved' &&
    Boolean(row.meta_template_id) &&
    Array.isArray(row.variables_schema) &&
    row.variables_schema.length === 2 &&
    (row.quick_reply_count ?? 0) === 0
}

export function isApprovedOwnerUpdateTemplate(row: NotificationTemplateVariant): boolean {
  return row.template_name === OWNER_UPDATE &&
    row.status === 'approved' &&
    Boolean(row.meta_template_id) &&
    Array.isArray(row.variables_schema) &&
    row.variables_schema.length === 1 &&
    (row.quick_reply_count ?? 0) === 0
}

/** Resolve the unbound template used by business-initiated estimate session reminders. */
export async function getApprovedOwnerUpdateTemplate(
  payload: { title: string; body: string },
  language: OwnerTemplateLanguage,
): Promise<ReturnType<typeof getOwnerUpdateTemplate> | null> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const svc = createServiceClient()
    if (!svc) return null
    const template = getOwnerUpdateTemplate(payload, language)
    const { data, error } = await svc
      .from('whatsapp_notification_templates')
      .select('template_name, language_code, meta_template_id, status, variables_schema, quick_reply_count')
      .eq('template_name', template.name)
      .eq('language_code', template.languageCode)
      .eq('status', 'approved')
    if (error) throw error
    return data?.some(isApprovedOwnerUpdateTemplate) ? template : null
  } catch (err) {
    console.warn('[whatsapp-registry] approved owner update template lookup failed:', err)
    return null
  }
}

/** Resolve an approved exact event in the owner's locale, with English as a fallback. */
export async function getApprovedTemplateForEvent(
  eventType: EventType,
  language: OwnerTemplateLanguage = 'en',
): Promise<NotificationTemplate | null> {
  try {
    // Lazy import to keep this module free of a service-client dependency for the
    // sync path (and to avoid pulling server-only deps into static analysis).
    const { createServiceClient } = await import('@/lib/supabase/service')
    const svc = createServiceClient()
    if (!svc) return null

    const wanted = templateLanguageCode(language)
    const { data, error } = await svc
      .from('whatsapp_notification_templates')
      .select('template_name, language_code, meta_template_id, status, variables_schema, quick_reply_count')
      .eq('event_type', eventType)
      .eq('status', 'approved')
      .in('language_code', wanted === 'en_US' ? [wanted] : [wanted, 'en_US'])
      .order('updated_at', { ascending: false })
    if (error) throw error
    const approved = (data ?? []).filter(isApprovedNotificationTemplate)
    const row = approved.find((variant) => variant.language_code === wanted)
      ?? approved.find((variant) => variant.language_code === 'en_US')
    if (row?.template_name) {
      return {
        templateName: row.template_name,
        languageCode: row.language_code,
        variables: titleBodyVars,
        expectedVariableCount: 2,
      }
    }
  } catch (err) {
    console.warn('[whatsapp-registry] approved template lookup failed:', err)
  }
  return null
}
