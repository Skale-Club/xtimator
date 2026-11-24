import { describe, expect, it } from 'vitest'
import { getWhatsAppReadiness } from '@/lib/whatsapp/readiness'
import { EVENT_TEMPLATE_NAMES } from '@/lib/notifications/whatsapp-registry'

const mappedTemplate = {
  event_type: 'estimate.accepted',
  template_name: 'owner_estimate_update',
  language_code: 'en_US',
  status: 'approved',
  meta_template_id: 'meta-estimate',
  variables_schema: ['Title', 'Details'],
  quick_reply_count: 0,
}

const base = {
  metaAccessConfigured: true,
  metaPhoneConfigured: true,
  metaBusinessConfigured: true,
  displayNumber: '+15551234567',
  welcomeTemplateNames: { en: 'owner_welcome_start', pt: 'owner_welcome_start', es: 'owner_welcome_start' },
}

describe('WhatsApp activation', () => {
  it('identifies missing settings and per-locale bindings without accepting another locale', () => {
    const readiness = getWhatsAppReadiness({
      ...base,
      displayNumber: null,
      templates: [mappedTemplate],
    })
    expect(readiness.ready).toBe(false)
    expect(readiness.missingSettings).toEqual(['Public WhatsApp display number'])
    const [english, portuguese] = readiness.locales
    expect(english.welcome).toBe('needs_import')
    expect(english.missingEvents.map((item) => item.event)).not.toContain('estimate.accepted')
    expect(portuguese.missingEvents.map((item) => item.event)).toContain('estimate.accepted')
  })

  it('reports complete configuration when all three locales have compatible approved rows', () => {
    const templates = ['en_US', 'pt_BR', 'es'].flatMap((language_code) => [
      ...Object.entries(EVENT_TEMPLATE_NAMES).map(([event_type, template_name]) => ({
        ...mappedTemplate, language_code, event_type, template_name,
      })),
      { ...mappedTemplate, language_code, event_type: null, template_name: 'owner_update', variables_schema: ['Summary'] },
      { ...mappedTemplate, language_code, event_type: null, template_name: 'owner_welcome_start', variables_schema: [], quick_reply_count: 1 },
    ])
    expect(getWhatsAppReadiness({ ...base, templates }).ready).toBe(true)
  })
})
