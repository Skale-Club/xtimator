import { describe, it, expect } from 'vitest'
import { formatEstimateForWhatsApp, type FormatterEstimate } from '@/lib/whatsapp/formatter'

const BASE_ESTIMATE: FormatterEstimate = {
  summary: 'Kitchen cabinet replacement',
  total: 2750,
  subtotal: 2500,
  tax_rate: 0.1,
  tax_amount: 250,
  payment_terms: 'Net 30',
  timeline: '2 weeks',
  sections: [
    {
      title: 'Labor',
      subtotal: 1500,
      items: [
        { description: 'Demo', quantity: 1, unit: null, unit_price: 500, total: 500 },
        { description: 'Install cabinets', quantity: 2, unit: 'day', unit_price: 500, total: 1000 },
      ],
    },
    {
      title: 'Materials',
      subtotal: 1000,
      items: [
        { description: 'Cabinet set', quantity: 1, unit: null, unit_price: 800, total: 800 },
        { description: 'Hardware', quantity: 1, unit: null, unit_price: 200, total: 200 },
      ],
    },
  ],
}

describe('formatEstimateForWhatsApp', () => {
  it('includes client greeting when clientName is provided', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, 'Johnson', 'Acme Builders')
    expect(result).toMatch(/Hi Johnson/)
  })

  it('uses generic greeting when clientName is null', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, null)
    expect(result).toMatch(/^Hi,/)
  })

  it('includes company name in the from line', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, 'Acme Builders')
    expect(result).toMatch(/Acme Builders/)
  })

  it('includes summary when present', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, null)
    expect(result).toMatch(/Kitchen cabinet replacement/)
  })

  it('renders section titles and items', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, null)
    expect(result).toMatch(/\*Labor\*/)
    expect(result).toMatch(/Demo/)
    expect(result).toMatch(/Install cabinets/)
    expect(result).toMatch(/\*Materials\*/)
    expect(result).toMatch(/Cabinet set/)
  })

  it('renders unit in item line when unit is present', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, null)
    expect(result).toMatch(/2 day/)
  })

  it('shows subtotal and tax lines when tax_rate > 0', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, null)
    expect(result).toMatch(/Subtotal/)
    expect(result).toMatch(/Tax \(10%\)/)
  })

  it('omits tax lines when tax_rate is 0', () => {
    const noTax: FormatterEstimate = { ...BASE_ESTIMATE, tax_rate: 0, tax_amount: 0 }
    const result = formatEstimateForWhatsApp(noTax, null, null)
    expect(result).not.toMatch(/Subtotal/)
    expect(result).not.toMatch(/Tax/)
  })

  it('renders grand total in bold', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, null)
    expect(result).toMatch(/\*Total: \$2,750\.00\*/)
  })

  it('includes timeline and payment terms when present', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, null)
    expect(result).toMatch(/Timeline: 2 weeks/)
    expect(result).toMatch(/Payment: Net 30/)
  })

  it('omits timeline and payment_terms lines when null', () => {
    const minimal: FormatterEstimate = {
      ...BASE_ESTIMATE,
      timeline: null,
      payment_terms: null,
    }
    const result = formatEstimateForWhatsApp(minimal, null, null)
    expect(result).not.toMatch(/Timeline:/)
    expect(result).not.toMatch(/Payment:/)
  })
})
