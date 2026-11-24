import {
  EVENT_TEMPLATE_NAMES,
  isApprovedNotificationTemplate,
  isApprovedOwnerUpdateTemplate,
  templateLanguageCode,
  type NotificationTemplateVariant,
  type OwnerTemplateLanguage,
} from '@/lib/notifications/whatsapp-registry'
import { isApprovedWelcomeTemplate } from '@/lib/whatsapp/welcome-template'
import { buildFirstEstimateLink } from '@/lib/whatsapp/welcome-card'

export const WHATSAPP_LAUNCH_LANGUAGES = [
  { key: 'en', label: 'English' },
  { key: 'pt', label: 'Portuguese' },
  { key: 'es', label: 'Spanish' },
] as const

export function getWhatsAppReadiness(config: {
  metaAccessConfigured: boolean
  metaPhoneConfigured: boolean
  metaBusinessConfigured: boolean
  displayNumber: string | null
  welcomeTemplateNames: Record<OwnerTemplateLanguage, string | null>
  templates: (NotificationTemplateVariant & { event_type: string | null })[]
}) {
  const missingSettings = [
    !config.metaAccessConfigured && 'Meta access token',
    !config.metaPhoneConfigured && 'Meta phone number ID',
    !config.metaBusinessConfigured && 'Meta business account ID',
    !buildFirstEstimateLink(config.displayNumber) && 'Public WhatsApp display number',
  ].filter((setting): setting is string => Boolean(setting))

  const locales = WHATSAPP_LAUNCH_LANGUAGES.map(({ key, label }) => {
    const languageCode = templateLanguageCode(key)
    const rows = config.templates.filter((row) => row.language_code === languageCode)
    const welcomeName = config.welcomeTemplateNames[key]
    const welcome = !welcomeName ? 'missing_name' : rows.some((row) =>
      row.template_name === welcomeName && isApprovedWelcomeTemplate(row, key),
    ) ? 'ready' : 'needs_import'

    const approvedEvents = new Set(rows.filter(isApprovedNotificationTemplate).map((row) => row.event_type))
    const missingEvents = Object.entries(EVENT_TEMPLATE_NAMES)
      .filter(([event]) => !approvedEvents.has(event))
      .map(([event, suggestedTemplate]) => ({ event, suggestedTemplate }))
    return {
      label,
      languageCode,
      welcome,
      welcomeName,
      missingEvents,
      ownerUpdateApproved: rows.some(isApprovedOwnerUpdateTemplate),
    }
  })

  return {
    missingSettings,
    locales,
    ready: missingSettings.length === 0 && locales.every((locale) =>
      locale.welcome === 'ready' && locale.missingEvents.length === 0 && locale.ownerUpdateApproved,
    ),
  }
}
