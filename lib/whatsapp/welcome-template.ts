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
 *   - the exact locale is approved in the registry with one quick reply and no
 *     body variables
 *
 * An atomic lease and durable review marker coordinate onboarding and consent
 * triggers. A known rejection can retry. An uncertain provider outcome is
 * reconciled by an admin before any replay.
 *
 * A platform cost: purpose 'welcome', never billed. Best-effort, never throws.
 * Tables are RLS deny-all: service-role client only.
 */
import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { getUserPreferences } from '@/lib/notifications/preferences'
import { getWhatsAppPlatformConfig, getWhatsAppWelcomeConfig } from '@/lib/platform-config'
import { isExplicitWhatsAppSendRejection, sendWhatsAppTemplate } from '@/lib/whatsapp/client'
import { isWhatsAppOutboundBlocked } from '@/lib/whatsapp/outbound-guard'
import { resolveWelcomeLanguage } from '@/lib/whatsapp/send-welcome'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import { templateLanguageCode } from '@/lib/notifications/whatsapp-registry'
import { revalidateWhatsAppSender } from '@/lib/whatsapp/account-registry'

export const WELCOME_QUICK_REPLY_PAYLOAD = 'xtimator_welcome_start'
export type WelcomeTemplateResult =
  | 'sent'
  | 'no_consent'
  | 'no_sender'
  | 'already_sent'
  | 'no_template_configured'
  | 'template_not_approved'
  | 'send_failed'
  | 'needs_review'
  | 'error'

export type WelcomeTemplateVariant = {
  language_code: string
  status: string
  variables_schema: unknown
  quick_reply_count?: number
  meta_template_id: string | null
}

export function isApprovedWelcomeTemplate(
  row: WelcomeTemplateVariant,
  language: EstimateLanguage,
): boolean {
  return Boolean(row.meta_template_id) &&
    row.language_code === templateLanguageCode(language) &&
    row.status === 'approved' &&
    Array.isArray(row.variables_schema) &&
    row.variables_schema.length === 0 &&
    row.quick_reply_count === 1
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

    const { data: sender, error: senderError } = await svc
      .from('whatsapp_authorized_senders')
      .select('id, phone_e164, welcome_template_sent_at, welcome_template_needs_review')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .eq('status', 'active')
      .maybeSingle()
    if (senderError) return 'error'
    if (!sender) return 'no_sender'
    if (sender.welcome_template_sent_at) return 'already_sent'
    if (sender.welcome_template_needs_review) return 'needs_review'

    const language = await resolveWelcomeLanguage(svc, companyId)
    const config = await getWhatsAppWelcomeConfig()
    const templateName = config.templateNames[language]
    if (!templateName) {
      console.info('[WhatsApp] welcome template skipped: none configured', { language })
      return 'no_template_configured'
    }

    const { data: rows, error: registryError } = await svc
      .from('whatsapp_notification_templates')
      .select('language_code, status, variables_schema, quick_reply_count, meta_template_id')
      .eq('template_name', templateName)
    if (registryError) return 'error'
    const approved = (rows ?? []).find((row) => isApprovedWelcomeTemplate(row, language))
    if (!approved) {
      console.info('[WhatsApp] welcome template skipped: missing approved locale variant', { templateName, language })
      return 'template_not_approved'
    }

    const phoneE164 = sender.phone_e164 as string
    if (isWhatsAppOutboundBlocked()) return 'send_failed'
    const platform = await getWhatsAppPlatformConfig()
    if (!platform.accessToken || !platform.phoneNumberId) return 'error'
    if (!await revalidateWhatsAppSender({ companyId, userId, phoneE164 })) return 'no_sender'
    if (!(await getUserPreferences(userId))?.whatsapp_opt_in_at) return 'no_consent'

    const now = new Date()
    const claimUntil = new Date(now.getTime() + 5 * 60_000).toISOString()
    const { data: claimed, error: claimErr } = await svc
      .from('whatsapp_authorized_senders')
      .update({
        welcome_template_claim_until: claimUntil,
        welcome_template_needs_review: true,
      })
      .eq('id', sender.id)
      .eq('status', 'active')
      .eq('phone_e164', phoneE164)
      .eq('user_id', userId)
      .eq('welcome_template_needs_review', false)
      .is('welcome_template_sent_at', null)
      .or(`welcome_template_claim_until.is.null,welcome_template_claim_until.lt.${now.toISOString()}`)
      .select('id')
    if (claimErr) return 'error'
    if (!claimed?.length) return 'already_sent'

    let sentAt: string | null = null
    try {
      const wamid = await sendWhatsAppTemplate(
        phoneE164,
        {
          name: templateName,
          languageCode: approved.language_code,
          quickReplyPayloads: [WELCOME_QUICK_REPLY_PAYLOAD],
        },
        { companyId, purpose: 'welcome', billable: false }
      )
      if (!wamid) return 'needs_review'
      sentAt = new Date().toISOString()
    } catch (err) {
      console.warn('[WhatsApp] welcome template send failed', { companyId, error: err instanceof Error ? err.name : 'unknown' })
      if (!isExplicitWhatsAppSendRejection(err)) return 'needs_review'
    }

    try {
      const { data: settled, error } = await svc
        .from('whatsapp_authorized_senders')
        .update({
          welcome_template_claim_until: null,
          welcome_template_needs_review: false,
          ...(sentAt ? { welcome_template_sent_at: sentAt } : {}),
        })
        .eq('id', sender.id)
        .eq('welcome_template_claim_until', claimUntil)
        .select('id')
      if (error || !settled?.length) return 'needs_review'
    } catch {
      return 'needs_review'
    }
    return sentAt ? 'sent' : 'send_failed'
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
