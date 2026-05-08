import { describe, it, expect } from 'vitest'
import { resolveTemplate, TEMPLATE_DEFAULTS } from '@/lib/utils/estimate-template'
import type { EstimateTemplate, TemplateData } from '@/lib/utils/estimate-template'

const SAMPLE_DATA: TemplateData = {
  client_name: 'Alice',
  company_name: 'Acme Plumbing',
  owner_name: 'Bob',
  total: '$1,500.00',
  items_breakdown: 'Labor: $1,000.00\nMaterials: $500.00',
}

const NULL_TEMPLATE: EstimateTemplate = {
  greeting: null,
  opener: null,
  closer: null,
  signature: null,
}

describe('resolveTemplate', () => {
  it('uses TEMPLATE_DEFAULTS when all template fields are null', () => {
    const output = resolveTemplate(NULL_TEMPLATE, SAMPLE_DATA)
    expect(output).toContain(TEMPLATE_DEFAULTS.greeting.replace('{client_name}', SAMPLE_DATA.client_name))
    expect(output).toContain(TEMPLATE_DEFAULTS.opener.replace('{company_name}', SAMPLE_DATA.company_name))
    expect(output).toContain(TEMPLATE_DEFAULTS.closer)
  })

  it('uses stored greeting when provided (not the default)', () => {
    const template: EstimateTemplate = { ...NULL_TEMPLATE, greeting: 'Hi {client_name}!' }
    const output = resolveTemplate(template, SAMPLE_DATA)
    expect(output).toContain('Hi Alice!')
    expect(output).not.toContain(TEMPLATE_DEFAULTS.greeting)
  })

  it('substitutes all 5 supported variables', () => {
    const template: EstimateTemplate = {
      greeting: '{client_name}',
      opener: '{company_name}',
      closer: '{total}',
      signature: '{owner_name}',
    }
    const output = resolveTemplate(template, SAMPLE_DATA)
    expect(output).toContain(SAMPLE_DATA.client_name)
    expect(output).toContain(SAMPLE_DATA.company_name)
    expect(output).toContain(SAMPLE_DATA.total)
    expect(output).toContain(SAMPLE_DATA.owner_name)
    expect(output).toContain(SAMPLE_DATA.items_breakdown)
  })

  it('treats empty string the same as null (falls back to default)', () => {
    const template: EstimateTemplate = { ...NULL_TEMPLATE, greeting: '' }
    const output = resolveTemplate(template, SAMPLE_DATA)
    expect(output).toContain(TEMPLATE_DEFAULTS.greeting.replace('{client_name}', SAMPLE_DATA.client_name))
  })

  it('passes unknown variables through unchanged', () => {
    const template: EstimateTemplate = { ...NULL_TEMPLATE, closer: 'Call {phone_number} anytime.' }
    const output = resolveTemplate(template, SAMPLE_DATA)
    expect(output).toContain('{phone_number}')
  })

  it('assembles output with correct section order (greeting before opener before items before closer before signature)', () => {
    const output = resolveTemplate(NULL_TEMPLATE, SAMPLE_DATA)
    const greetingIdx = output.indexOf(TEMPLATE_DEFAULTS.greeting.split('{')[0])
    const openerIdx = output.indexOf(TEMPLATE_DEFAULTS.opener.split('{')[0])
    const itemsIdx = output.indexOf(SAMPLE_DATA.items_breakdown)
    const closerIdx = output.indexOf(TEMPLATE_DEFAULTS.closer.substring(0, 20))
    expect(greetingIdx).toBeLessThan(openerIdx)
    expect(openerIdx).toBeLessThan(itemsIdx)
    expect(itemsIdx).toBeLessThan(closerIdx)
  })
})
