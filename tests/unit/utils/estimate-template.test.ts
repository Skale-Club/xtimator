import { describe, it, expect } from 'vitest'
import { resolveTemplate, TEMPLATE_DEFAULTS, buildItemsBreakdown } from '@/lib/utils/estimate-template'
import type { EstimateTemplate, TemplateData } from '@/lib/utils/estimate-template'
import type { EstimateWithSections } from '@/lib/queries/estimate'

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

describe('buildItemsBreakdown', () => {
  const SAMPLE_ESTIMATE: EstimateWithSections = {
    id: 'est-1',
    project_id: 'proj-1',
    company_id: 'co-1',
    version: 1,
    estimate_seq: 1,
    estimate_number: null,
    estimate_date: null,
    is_current: true,
    share_token: 'tok',
    status: 'draft',
    language: 'en',
    summary: null,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    subtotal: 205,
    discount_type: null,
    discount_value: 0,
    discount_amount: 0,
    tax_rate: 0,
    tax_amount: 0,
    total: 205,
    workflow_status: 'draft',
    consolidated_at: null,
    consolidated_by: null,
    sent_at: null,
    viewed_at: null,
    responded_at: null,
    client_response: null,
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
    sections: [
      {
        id: 'sec-1',
        estimate_id: 'est-1',
        company_id: 'co-1',
        title: 'Upholstery Cleaning',
        sort_order: 0,
        subtotal: 120,
        items: [
          {
            id: 'item-1',
            section_id: 'sec-1',
            company_id: 'co-1',
            description: 'King Mattress',
            quantity: 1,
            unit: null,
            unit_price: 120,
            total: 120,
            sort_order: 0,
            price_source: null,
          },
        ],
      },
      {
        id: 'sec-2',
        estimate_id: 'est-1',
        company_id: 'co-1',
        title: 'Carpet Cleaning',
        sort_order: 1,
        subtotal: 85,
        items: [
          {
            id: 'item-2',
            section_id: 'sec-2',
            company_id: 'co-1',
            description: 'Small room',
            quantity: 1,
            unit: null,
            unit_price: 85,
            total: 85,
            sort_order: 0,
            price_source: null,
          },
        ],
      },
    ],
  }

  it('formats section title as [Section Title] on its own line', () => {
    const output = buildItemsBreakdown(SAMPLE_ESTIMATE)
    expect(output).toContain('[Upholstery Cleaning]')
    expect(output).toContain('[Carpet Cleaning]')
  })

  it('formats each item as "description: $price" with colon separator', () => {
    const output = buildItemsBreakdown(SAMPLE_ESTIMATE)
    expect(output).toContain('King Mattress: $120.00')
    expect(output).toContain('Small room: $85.00')
  })

  it('separates section blocks with a blank line', () => {
    const output = buildItemsBreakdown(SAMPLE_ESTIMATE)
    expect(output).toContain('[Upholstery Cleaning]\nKing Mattress: $120.00\n\n[Carpet Cleaning]')
  })

  it('returns empty string for estimate with no sections', () => {
    const empty: EstimateWithSections = { ...SAMPLE_ESTIMATE, sections: [] }
    expect(buildItemsBreakdown(empty)).toBe('')
  })

  it('filters out sections with no items', () => {
    const withEmpty: EstimateWithSections = {
      ...SAMPLE_ESTIMATE,
      sections: [
        { id: 'sec-0', estimate_id: 'est-1', company_id: 'co-1', title: 'Empty Section', sort_order: 0, subtotal: 0, items: [] },
        ...SAMPLE_ESTIMATE.sections,
      ],
    }
    const output = buildItemsBreakdown(withEmpty)
    expect(output).not.toContain('[Empty Section]')
    expect(output).toContain('[Upholstery Cleaning]')
  })
})
