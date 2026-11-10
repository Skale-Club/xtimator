/**
 * Phase 3b: the FIRST WhatsApp message, sent by us right after onboarding as an
 * approved Meta template with a reply call to action (a quick-reply button).
 * The owner's reply opens the 24h window and triggers the free-form welcome
 * sequence (send-welcome.ts).
 *
 * Sent only when ALL hold:
 *   - the user gave WhatsApp consent (notification_preferences.whatsapp_opt_in_at)
 *   - the user has an ACTIVE authorized sender in the company (verified phone linked)
 *   - a template name is configured for the company language (admin config)
 *   - that template is approved (when tracked in whatsapp_notification_templates;
 *     a template not tracked there is trusted as configured)
 *
 * Idempotent: whatsapp_authorized_senders.welcome_template_sent_at is claimed
 * atomically, so only one template is ever sent per sender even though both
 * onboarding completion and the consent action call this. If the send fails the
 * claim is released so the other trigger (or a retry) can try again.
 *
 * A platform cost: purpose 'welcome', never billed. Best-effort, never throws.
 * Tables are RLS deny-all: service-role client only.
 */
import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { getUserPreferences } from '@/lib/notifications/preferences'
import { getWhatsAppWelcomeConfig } from '@/lib/platform-config'
import { sendWhatsAppTemplate } from '@/lib/whatsapp/client'
import { resolveWelcomeLanguage } from '@/lib/whatsapp/send-welcome'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

export type WelcomeTemplateResult =
  | 'sent'
  | 'no_consent'
  | 'no_sender'
  | 'already_sent'
  | 'no_template_configured'
  | 'template_not_approved'
  | 'send_failed'
  | 'error'

/** Meta language code used when the template is not tracked in the registry table. */
const DEFAULT_META_LANGUAGE: Record<EstimateLanguage, string> = {
  pt: 'pt_BR',
  en: 'en_US',
  es: 'es',
}

export async function sendWelcomeTemplate(
  userId: string,
  companyId: string
): Promise<WelcomeTemplateResult> {
  try {
    if (!userId || !companyId) return 'error'
    const svc = requireServiceClient()

    const prefs = await getUserPreferences(userId)
    if (!prefs?.whatsapp_opt_in_at) return 'no_consent'

    const { data: sender } = await svc
      .from('whatsapp_authorized_senders')
      .select('id, phone_e164, welcome_template_sent_at')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (!sender) return 'no_sender'
    if (sender.welcome_template_sent_at) return 'already_sent'

    const language = await resolveWelcomeLanguage(svc, companyId)
    const config = await getWhatsAppWelcomeConfig()
    const templateName = config.templateNames[language]
    if (!templateName) {
      console.info('[WhatsApp] welcome template skipped: none configured', { language })
      return 'no_template_configured'
    }

    // Approval gate: when the template is tracked in the registry, one row must be approved.
    let languageCode = DEFAULT_META_LANGUAGE[language]
    const { data: rows } = await svc
      .from('whatsapp_notification_templates')
      .select('language_code, status')
      .eq('template_name', templateName)
    const tracked = (rows ?? []) as Array<{ language_code: string; status: string }>
    if (tracked.length > 0) {
      const approved = tracked.find((r) => r.status === 'approved')
      if (!approved) {
        console.info('[WhatsApp] welcome template skipped: not approved', { templateName })
        return 'template_not_approved'
      }
      languageCode = approved.language_code
    }

    // Atomic claim: only the caller that flips NULL -> now() sends.
    const { data: claimed, error: claimErr } = await svc
      .from('whatsapp_authorized_senders')
      .update({ welcome_template_sent_at: new Date().toISOString() })
      .eq('id', sender.id)
      .is('welcome_template_sent_at', null)
      .select('id')
    if (claimErr || !Array.isArray(claimed) || claimed.length === 0) return 'already_sent'

    try {
      await sendWhatsAppTemplate(
        sender.phone_e164 as string,
        { name: templateName, languageCode },
        { companyId, purpose: 'welcome', billable: false }
      )
      return 'sent'
    } catch (err) {
      console.warn('[WhatsApp] welcome template send failed', err instanceof Error ? err.message : err)
      // Release the claim so a retry (consent or another completion call) can send.
      await svc
        .from('whatsapp_authorized_senders')
        .update({ welcome_template_sent_at: null })
        .eq('id', sender.id)
      return 'send_failed'
    }
  } catch (err) {
    console.warn('[WhatsApp] sendWelcomeTemplate failed', err instanceof Error ? err.message : err)
    return 'error'
  }
}

/**
 * Consent-side trigger: consent can arrive after the company (and its sender link)
 * already exist. Finds the user's active sender companies and tries each; the
 * per-sender claim keeps it to one template per user. Never throws.
 */
export async function sendWelcomeTemplateForUser(userId: string): Promise<void> {
  try {
    const svc = requireServiceClient()
    const { data } = await svc
      .from('whatsapp_authorized_senders')
      .select('company_id')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(5)
    for (const row of (data ?? []) as Array<{ company_id: string }>) {
      await sendWelcomeTemplate(userId, row.company_id)
    }
  } catch (err) {
    console.warn('[WhatsApp] sendWelcomeTemplateForUser failed', err instanceof Error ? err.message : err)
  }
}
