import { describe, expect, it } from 'vitest'
import { normalizeOutput } from '@/lib/ai/normalize'

describe('price_source tagging — defensive normalization', () => {
  it('matched item carries price_source price_book', () => {
    const result = normalizeOutput({
      suggested_project_name: 'Test',
      summary: 'Test',
      sections: [{ title: 'Labor', items: [{ description: 'Demo', quantity: 1, unit_price: 500, price_source: 'price_book' }] }],
    })
    expect(result.sections[0].items[0].price_source).toBe('price_book')
  })

  it('unmatched item carries price_source ai_estimate', () => {
    const result = normalizeOutput({
      suggested_project_name: 'Test',
      summary: 'Test',
      sections: [{ title: 'Labor', items: [{ description: 'Demo', quantity: 1, unit_price: 500, price_source: 'ai_estimate' }] }],
    })
    expect(result.sections[0].items[0].price_source).toBe('ai_estimate')
  })

  it('defensive fallback: undefined price_source becomes ai_estimate', () => {
    const result = normalizeOutput({
      suggested_project_name: 'Test',
      summary: 'Test',
      sections: [{ title: 'Labor', items: [{ description: 'Demo', quantity: 1, unit_price: 500 }] }],
    })
    expect(result.sections[0].items[0].price_source).toBe('ai_estimate')
  })
})
