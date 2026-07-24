import { describe, it, expect } from 'vitest'
import { saveEstimateSchema } from '@/lib/schemas/estimate'

/**
 * SAVE-06 (audit B7) — saveEstimateSchema bounds:
 *   - quantity/unit_price/discount/cost/markup_pct reject negatives (previously
 *     finite-only, so a negative value silently passed through to the totals
 *     engine and could invert a line's contribution or hide a surcharge).
 *   - MAX_SECTIONS/MAX_ITEMS_PER_SECTION are realistic bounds (60/200, not the
 *     prior 200/500 = 100k sequential-write DoS shape).
 */

function baseInput(overrides: {
  item?: Record<string, unknown>
  estimate?: Record<string, unknown>
} = {}) {
  return {
    id: 'est_1',
    summary: null,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    discount_type: null,
    discount_value: 0,
    tax_rate: 0.0875,
    estimate_date: null,
    estimate_number: null,
    sections: [
      {
        id: 'sec_1',
        title: 'General',
        sort_order: 0,
        items: [
          {
            id: 'item_1',
            description: 'Labor',
            quantity: 10,
            unit: 'hr',
            unit_price: 100,
            sort_order: 0,
            price_source: null,
            ...(overrides.item ?? {}),
          },
        ],
      },
    ],
    ...(overrides.estimate ?? {}),
  }
}

describe('SAVE-06: saveEstimateSchema rejects negative pricing fields', () => {
  it('accepts the valid baseline (control case)', () => {
    const result = saveEstimateSchema.safeParse(baseInput())
    expect(result.success).toBe(true)
  })

  it('rejects a negative quantity', () => {
    const result = saveEstimateSchema.safeParse(baseInput({ item: { quantity: -1 } }))
    expect(result.success).toBe(false)
  })

  it('rejects a negative unit_price', () => {
    const result = saveEstimateSchema.safeParse(baseInput({ item: { unit_price: -50 } }))
    expect(result.success).toBe(false)
  })

  it('rejects a negative line discount', () => {
    const result = saveEstimateSchema.safeParse(baseInput({ item: { discount: -10 } }))
    expect(result.success).toBe(false)
  })

  it('rejects a negative cost', () => {
    const result = saveEstimateSchema.safeParse(baseInput({ item: { cost: -5 } }))
    expect(result.success).toBe(false)
  })

  it('rejects a negative markup_pct', () => {
    const result = saveEstimateSchema.safeParse(baseInput({ item: { markup_pct: -25 } }))
    expect(result.success).toBe(false)
  })

  it('still accepts zero for quantity/unit_price/discount/cost/markup_pct (0 is not negative)', () => {
    const result = saveEstimateSchema.safeParse(
      baseInput({ item: { quantity: 0, unit_price: 0, discount: 0, cost: 0, markup_pct: 0 } })
    )
    expect(result.success).toBe(true)
  })

  it('does NOT touch discount_value/tax_rate bounds (already .min(0) pre-165, unchanged)', () => {
    const negDiscountValue = saveEstimateSchema.safeParse(
      baseInput({ estimate: { discount_value: -1 } })
    )
    const negTaxRate = saveEstimateSchema.safeParse(baseInput({ estimate: { tax_rate: -0.01 } }))
    expect(negDiscountValue.success).toBe(false)
    expect(negTaxRate.success).toBe(false)
  })
})

describe('SAVE-06: realistic section/item caps (60 sections × 200 items, not 200×500)', () => {
  it('accepts exactly 60 sections', () => {
    const input = baseInput()
    input.sections = Array.from({ length: 60 }, (_, i) => ({
      id: `sec_${i}`,
      title: `Section ${i}`,
      sort_order: i,
      items: [],
    }))
    const result = saveEstimateSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects 61 sections (over the new MAX_SECTIONS cap)', () => {
    const input = baseInput()
    input.sections = Array.from({ length: 61 }, (_, i) => ({
      id: `sec_${i}`,
      title: `Section ${i}`,
      sort_order: i,
      items: [],
    }))
    const result = saveEstimateSchema.safeParse(input)
    expect(result.success).toBe(false)
  })

  it('accepts exactly 200 items in a single section', () => {
    const input = baseInput()
    input.sections = [
      {
        id: 'sec_1',
        title: 'General',
        sort_order: 0,
        items: Array.from({ length: 200 }, (_, i) => ({
          id: `item_${i}`,
          description: 'Line',
          quantity: 1,
          unit: 'ea',
          unit_price: 10,
          sort_order: i,
          price_source: null,
        })),
      },
    ]
    const result = saveEstimateSchema.safeParse(input)
    expect(result.success).toBe(true)
  })

  it('rejects 201 items in a single section (over the new MAX_ITEMS_PER_SECTION cap — no longer 500)', () => {
    const input = baseInput()
    input.sections = [
      {
        id: 'sec_1',
        title: 'General',
        sort_order: 0,
        items: Array.from({ length: 201 }, (_, i) => ({
          id: `item_${i}`,
          description: 'Line',
          quantity: 1,
          unit: 'ea',
          unit_price: 10,
          sort_order: i,
          price_source: null,
        })),
      },
    ]
    const result = saveEstimateSchema.safeParse(input)
    expect(result.success).toBe(false)
  })
})
