import { afterEach, describe, expect, it, vi } from 'vitest'
import { createServiceClient } from '@/lib/supabase/service'
import { getApprovedTemplateForEvent, getApprovedOwnerUpdateTemplate } from '@/lib/notifications/whatsapp-registry'

vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn() }))
afterEach(() => vi.clearAllMocks())

const approved = (name: string, language: string, words = ['Title', 'Details']) => ({
  template_name: name,
  language_code: language,
  meta_template_id: 'meta-1',
  status: 'approved',
  variables_schema: words,
  quick_reply_count: 0,
})

function service(rows: unknown[], error: unknown = null) {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    order: vi.fn(() => query),
    then: (resolve: (value: { data: unknown[]; error: unknown }) => void) => resolve({ data: rows, error }),
  }
  vi.mocked(createServiceClient).mockReturnValue({ from: () => query } as never)
  return query
}

describe('approved WhatsApp notification resolution', () => {
  it('uses the exact event binding in the owner locale ahead of English', async () => {
    const query = service([approved('english_estimate', 'en_US'), approved('localized_estimate', 'pt_BR')])
    const template = await getApprovedTemplateForEvent('estimate.accepted', 'pt')
    expect(query.eq).toHaveBeenCalledWith('event_type', 'estimate.accepted')
    expect(query.in).toHaveBeenCalledWith('language_code', ['pt_BR', 'en_US'])
    expect(template?.templateName).toBe('localized_estimate')
    expect(template?.variables({ title: 'T', body: 'B' })).toEqual(['T', 'B'])
    expect(template?.expectedVariableCount).toBe(2)
  })

  it('falls back to approved English, skipping paused and incompatible variants', async () => {
    service([
      { ...approved('paused', 'es'), status: 'paused' },
      approved('wrong_count', 'es', []),
      { ...approved('no_meta', 'es'), meta_template_id: null },
      approved('english_estimate', 'en_US'),
    ])
    expect(await getApprovedTemplateForEvent('estimate.viewed', 'es')).toMatchObject({
      templateName: 'english_estimate', languageCode: 'en_US',
    })
  })

  it('never guesses an approved variant from a static template name', async () => {
    service([])
    expect(await getApprovedTemplateForEvent('estimate.declined')).toBeNull()
    service([], { message: 'read failed' })
    expect(await getApprovedTemplateForEvent('estimate.declined')).toBeNull()
  })

  it('validates the exact locale and one summary variable for owner update', async () => {
    const query = service([approved('owner_update', 'pt_BR', ['Summary'])])
    await expect(getApprovedOwnerUpdateTemplate({ title: 'T', body: 'B' }, 'pt')).resolves.toEqual({
      name: 'owner_update', languageCode: 'pt_BR', bodyVariables: ['T: B'],
    })
    expect(query.eq).toHaveBeenCalledWith('language_code', 'pt_BR')
    service([approved('owner_update', 'pt_BR', ['One', 'Two'])])
    await expect(getApprovedOwnerUpdateTemplate({ title: 'T', body: 'B' }, 'pt')).resolves.toBeNull()
  })
})

describe('lib/notifications/whatsapp-registry — static map by owner language', () => {
  it('estimate.viewed and estimate.expired reuse owner_estimate_update (2 variables)', async () => {
    const { getTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    for (const event of ['estimate.viewed', 'estimate.expired'] as const) {
      const tpl = getTemplateForEvent(event)
      expect(tpl?.templateName).toBe('owner_estimate_update')
      expect(tpl?.languageCode).toBe('en_US')
      expect(tpl?.expectedVariableCount).toBe(2)
      expect(tpl?.variables({ title: 'T', body: 'B' })).toEqual(['T', 'B'])
    }
  })

  it('every mapped event resolves a pt_BR and an es variant of the same template name', async () => {
    const { getTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    const mapped = [
      'estimate.viewed',
      'estimate.accepted',
      'estimate.declined',
      'estimate.expired',
      'payment.received',
      'quota.exhausted',
      'trial.expiring_3d',
    ] as const
    for (const event of mapped) {
      const en = getTemplateForEvent(event, 'en')
      const pt = getTemplateForEvent(event, 'pt')
      const es = getTemplateForEvent(event, 'es')
      expect(pt?.languageCode).toBe('pt_BR')
      expect(es?.languageCode).toBe('es')
      expect(pt?.templateName).toBe(en?.templateName)
      expect(es?.templateName).toBe(en?.templateName)
    }
  })

  it('unmapped events still resolve to null in every language', async () => {
    const { getTemplateForEvent } = await import('@/lib/notifications/whatsapp-registry')
    expect(getTemplateForEvent('ai_job.completed', 'pt')).toBeNull()
  })

  it('owner_update is a 1-variable summary template in the owner language', async () => {
    const { getOwnerUpdateTemplate, summaryVariable } = await import('@/lib/notifications/whatsapp-registry')
    const tpl = getOwnerUpdateTemplate({ title: 'Estimate viewed', body: 'Johnson opened it' }, 'pt')
    expect(tpl).toEqual({
      name: 'owner_update',
      languageCode: 'pt_BR',
      bodyVariables: ['Estimate viewed: Johnson opened it'],
    })
    expect(getOwnerUpdateTemplate({ title: 'a', body: 'b' }).languageCode).toBe('en_US')
    expect(summaryVariable({ title: 'x'.repeat(300), body: '' }).length).toBeLessThanOrEqual(200)
  })

})
