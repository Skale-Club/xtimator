import { describe, it, expect } from 'vitest'
import { formatEstimateForWhatsApp, type FormatterEstimate } from '@/lib/whatsapp/formatter'
import {
  buildItemsBreakdown,
  buildMessageBreakdown,
  buildTermsBreakdown,
} from '@/lib/utils/estimate-template'
import { termsTextBlocks } from '@/lib/estimate/document/terms-text'
import {
  resolvePresentationSettings,
  type PresentationSettings,
} from '@/lib/estimate/presentation-settings'
import type { EstimateWithSections } from '@/lib/queries/estimate'

// SEED-056 Phase E: the WhatsApp message and the plain-text template carry the
// payment / timeline / warranty / notes blocks when -- and only when -- the
// estimate's own section toggles say so.

const ESTIMATE: FormatterEstimate = {
  summary: 'Kitchen',
  total: 1000,
  subtotal: 1000,
  tax_rate: 0,
  tax_amount: 0,
  payment_terms: '50% upfront',
  timeline: '2 weeks',
  warranty_terms: '1 year on labor',
  notes: 'Access via the alley',
  sections: [
    {
      title: 'Labor',
      subtotal: 1000,
      items: [{ description: 'Demo', quantity: 1, unit: null, unit_price: 1000, total: 1000 }],
    },
  ],
}

describe('termsTextBlocks', () => {
  it('emits payment, timeline, warranty, notes in the PDF order with document labels', () => {
    expect(termsTextBlocks(ESTIMATE, resolvePresentationSettings(null))).toEqual([
      'Payment Terms:\n50% upfront',
      'Timeline:\n2 weeks',
      'Warranty:\n1 year on labor',
      'Notes:\nAccess via the alley',
    ])
  })

  it('skips blocks that are hidden or empty', () => {
    const resolved = resolvePresentationSettings({ sections: { timeline: false, notes: false } })
    expect(termsTextBlocks({ ...ESTIMATE, warranty_terms: '   ' }, resolved)).toEqual([
      'Payment Terms:\n50% upfront',
    ])
  })

  it('uses the estimate language for the labels', () => {
    const out = termsTextBlocks({ ...ESTIMATE, language: 'pt' }, resolvePresentationSettings(null))
    expect(out[0]).toBe('Condições de Pagamento:\n50% upfront')
  })
})

describe('WhatsApp formatted text', () => {
  it('appends the visible terms blocks after the total, before the closing', () => {
    const text = formatEstimateForWhatsApp(ESTIMATE, null, null)
    const total = text.indexOf('Total:')
    const payment = text.indexOf('Payment Terms:\n50% upfront')
    const notes = text.indexOf('Notes:\nAccess via the alley')
    const closing = text.indexOf('Let me know if you have any questions')
    expect(total).toBeGreaterThan(-1)
    expect(payment).toBeGreaterThan(total)
    expect(notes).toBeGreaterThan(payment)
    expect(closing).toBeGreaterThan(notes)
  })

  it('a hidden block is not sent', () => {
    const settings: PresentationSettings = { sections: { payment_terms: false, timeline: false } }
    const text = formatEstimateForWhatsApp(ESTIMATE, null, null, null, null, settings)
    expect(text).not.toContain('50% upfront')
    expect(text).not.toContain('2 weeks')
    expect(text).toContain('1 year on labor')
  })

  it('a block with no text is not sent even when visible', () => {
    const text = formatEstimateForWhatsApp({ ...ESTIMATE, notes: null }, null, null)
    expect(text).not.toContain('Notes:')
  })

  it('materialised new-estimate defaults (everything off) send no terms', () => {
    const settings: PresentationSettings = {
      sections: {
        summary: false,
        sections: true,
        payment_terms: false,
        timeline: false,
        warranty_terms: false,
        notes: false,
        photos: true,
        estimate_terms: false,
        valid_until: false,
      },
    }
    const text = formatEstimateForWhatsApp(ESTIMATE, null, null, null, null, settings)
    expect(text).not.toContain('Payment Terms:')
    expect(text).not.toContain('Warranty:')
  })
})

describe('plain-text template breakdown', () => {
  const full = {
    ...ESTIMATE,
    currency_code: 'USD',
    language: 'en',
  } as unknown as EstimateWithSections

  it('buildItemsBreakdown keeps its line-items-only contract', () => {
    expect(buildItemsBreakdown(full)).not.toContain('Payment Terms')
  })

  it('buildTermsBreakdown joins the visible blocks', () => {
    expect(buildTermsBreakdown(full)).toBe(
      'Payment Terms:\n50% upfront\n\nTimeline:\n2 weeks\n\nWarranty:\n1 year on labor\n\nNotes:\nAccess via the alley',
    )
  })

  it('buildMessageBreakdown = line items, then terms', () => {
    const out = buildMessageBreakdown(full)
    expect(out.indexOf('[Labor]')).toBeLessThan(out.indexOf('Payment Terms:'))
  })

  it('with every block hidden it equals the items breakdown (no trailing separator)', () => {
    const resolved = resolvePresentationSettings({
      sections: { payment_terms: false, timeline: false, warranty_terms: false, notes: false },
    })
    expect(buildMessageBreakdown(full, resolved)).toBe(buildItemsBreakdown(full, resolved))
  })

  it('with line items off but terms on, the terms still go out', () => {
    const resolved = resolvePresentationSettings({ sections: { sections: false } })
    expect(buildMessageBreakdown(full, resolved).startsWith('Payment Terms:')).toBe(true)
  })
})

import { WHATSAPP_MAX_BODY_CHARS } from '@/lib/whatsapp/formatter'

describe('WhatsApp body limit (4096 characters)', () => {
  const longTerms = Array.from({ length: 400 }, (_, i) => `Clause number ${i} of the agreement.`).join(' ')

  it('a message under the limit is untouched', () => {
    const text = formatEstimateForWhatsApp(ESTIMATE, null, null)
    expect(text.length).toBeLessThan(WHATSAPP_MAX_BODY_CHARS)
    expect(text).not.toContain('The full terms are on your estimate link.')
  })

  it('over the limit: terms are cut first, line items / totals / sign-off survive, a pointer line is added', () => {
    const text = formatEstimateForWhatsApp({ ...ESTIMATE, payment_terms: longTerms }, 'Johnson', 'Acme', 'Bob', 'acme.com')
    expect(text.length).toBeLessThanOrEqual(WHATSAPP_MAX_BODY_CHARS)
    expect(text).toContain('- Demo x 1:')
    expect(text).toContain('Total:')
    expect(text).toContain('Best regards,')
    expect(text).toContain('Bob')
    expect(text).toContain('acme.com')
    expect(text).toContain('Payment Terms:\nClause number 0')
    expect(text).toContain('…\nThe full terms are on your estimate link.')
    expect(text).not.toContain('Clause number 399')
  })

  it('cuts on a word boundary', () => {
    const text = formatEstimateForWhatsApp({ ...ESTIMATE, payment_terms: longTerms }, null, null)
    const cut = text.slice(0, text.indexOf('…\nThe full terms'))
    expect(cut.endsWith('agreement.') || /\b(of|the|number|Clause|\d+)$/.test(cut)).toBe(true)
  })

  it('the pointer line is localised', () => {
    const text = formatEstimateForWhatsApp({ ...ESTIMATE, language: 'pt', payment_terms: longTerms }, null, null)
    expect(text.length).toBeLessThanOrEqual(WHATSAPP_MAX_BODY_CHARS)
    expect(text).toContain('Os termos completos estão no link do seu orçamento.')
  })

  it('never exceeds the limit even when the line items alone are too long', () => {
    const items = Array.from({ length: 300 }, (_, i) => ({
      description: `Line item ${i} with a rather long description to fill the message`,
      quantity: 1,
      unit: null,
      unit_price: 10,
      total: 10,
    }))
    const text = formatEstimateForWhatsApp(
      { ...ESTIMATE, sections: [{ title: 'Big', subtotal: 3000, items }] },
      null,
      null,
    )
    expect(text.length).toBeLessThanOrEqual(WHATSAPP_MAX_BODY_CHARS)
  })
})
