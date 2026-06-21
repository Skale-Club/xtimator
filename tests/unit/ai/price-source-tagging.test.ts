import { describe, expect, it } from 'vitest'
import { normalizeOutput } from '@/lib/ai/normalize'

/**
 * price_source tagging — defensive normalization.
 *
 * Plan 100-01 migrates `normalizeOutput` to a discriminated `NormalizeResult`
 * (`{ ok: true; value } | { ok: false; error }`) backed by `estimateOutputSchema.safeParse`.
 * The D-15 price_source coercion moves into the schema (preprocess), so the three
 * behaviors below are now asserted via `result.ok` + `result.value...`.
 *
 * RED until 100-01 lands the new return shape: today `normalizeOutput` returns the
 * EstimateOutput directly, so `result.ok`/`result.value` are undefined.
 */
describe('price_source tagging — defensive normalization (NormalizeResult shape)', () => {
  it('matched item carries price_source price_book', () => {
    const result = normalizeOutput({
      suggested_project_name: 'Test',
      summary: 'Test',
      sections: [{ title: 'Labor', items: [{ description: 'Demo', quantity: 1, unit_price: 500, price_source: 'price_book' }] }],
    })
    expect(result.ok).toBe(true)
    expect(result.ok && result.value.sections[0].items[0].price_source).toBe('price_book')
  })

  it('unmatched item carries price_source ai_estimate', () => {
    const result = normalizeOutput({
      suggested_project_name: 'Test',
      summary: 'Test',
      sections: [{ title: 'Labor', items: [{ description: 'Demo', quantity: 1, unit_price: 500, price_source: 'ai_estimate' }] }],
    })
    expect(result.ok).toBe(true)
    expect(result.ok && result.value.sections[0].items[0].price_source).toBe('ai_estimate')
  })

  it('defensive fallback: undefined price_source becomes ai_estimate', () => {
    const result = normalizeOutput({
      suggested_project_name: 'Test',
      summary: 'Test',
      sections: [{ title: 'Labor', items: [{ description: 'Demo', quantity: 1, unit_price: 500 }] }],
    })
    expect(result.ok).toBe(true)
    expect(result.ok && result.value.sections[0].items[0].price_source).toBe('ai_estimate')
  })
})
