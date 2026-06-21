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
    expect(result).toMatch(/Hello Johnson/)
  })

  it('uses generic greeting when clientName is null', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, null)
    expect(result).toMatch(/^Hello,/)
  })

  it('includes company name in the intro line', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, 'Acme Builders')
    expect(result).toMatch(/Thank you for reaching out to Acme Builders/)
  })

  it('renders section titles in bracket format', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, null)
    expect(result).toMatch(/\[Labor\]/)
    expect(result).toMatch(/\[Materials\]/)
  })

  it('renders items with x-quantity format', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, null)
    expect(result).toMatch(/- Demo x 1:/)
    expect(result).toMatch(/Install cabinets/)
  })

  it('shows unit price in parentheses for qty > 1 items', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, null)
    expect(result).toMatch(/Install cabinets x 2 \(\$500\.00 each\)/)
  })

  it('shows subtotal and tax when tax_rate > 0', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, null)
    expect(result).toMatch(/Subtotal:/)
    expect(result).toMatch(/Tax \(10%\):/)
  })

  it('omits subtotal and tax lines when tax_rate is 0 and no discount', () => {
    const noTax: FormatterEstimate = { ...BASE_ESTIMATE, tax_rate: 0, tax_amount: 0 }
    const result = formatEstimateForWhatsApp(noTax, null, null)
    expect(result).not.toMatch(/Subtotal:/)
    expect(result).not.toMatch(/Tax/)
  })

  it('renders discount line when discount_amount > 0', () => {
    const withDiscount: FormatterEstimate = {
      ...BASE_ESTIMATE,
      tax_rate: 0,
      tax_amount: 0,
      discount_type: 'percentage',
      discount_value: 10,
      discount_amount: 250,
      total: 2250,
    }
    const result = formatEstimateForWhatsApp(withDiscount, null, null)
    expect(result).toMatch(/Discount \(10%\): -\$250\.00/)
  })

  it('renders grand total with "Total Estimate:" label', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, null)
    expect(result).toMatch(/Total Estimate: \$2,750\.00/)
  })

  it('includes friendly closing message', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, null)
    expect(result).toMatch(/Let me know if you have any questions/)
  })

  it('appends responsible name and website in sign-off when provided', () => {
    const result = formatEstimateForWhatsApp(
      BASE_ESTIMATE,
      'Alice',
      'Acme Builders',
      'Bob Smith',
      'www.acmebuilders.com',
    )
    expect(result).toMatch(/Best regards,/)
    expect(result).toMatch(/Bob Smith/)
    expect(result).toMatch(/www\.acmebuilders\.com/)
  })

  it('omits responsible and website lines when not provided', () => {
    const result = formatEstimateForWhatsApp(BASE_ESTIMATE, null, null)
    expect(result).toMatch(/Best regards,/)
    // no extra lines after sign-off when responsible/website are omitted
    const lines = result.split('\n')
    const regardsIdx = lines.findIndex((l) => l === 'Best regards,')
    expect(lines[regardsIdx + 1]).toBeUndefined()
  })
})
