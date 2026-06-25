import { describe, it, expect } from 'vitest'
import { computeEstimateTotals, type TaxConfig } from '@/lib/estimate/compute-totals'

// DISC-02 (server math): the LOCKED calculation sequence —
//   line_net = round2(qty×unit_price) − line_discount
//   subtotal = Σ line_net
//   disc_global = (discount_type==='amount' ? value : round2(subtotal × pct))
//   prorated_disc(category) = round2(disc_global × (category_taxable_base ÷ taxable_subtotal))
//   taxable_base(category) = Σ(line_net taxable & category) − prorated_disc(category)
//   taxAmount = Σ(taxable_base(category) × rate_category)
//   grandTotal = (subtotal − disc_global) + taxAmount
// Discount-before-tax (US norm). Every golden below is HAND-COMPUTED.
describe('DISC-02: line + global discount (discount-before-tax proration)', () => {
  it('Test A — LINE discount reduces the line net before the per-category tax base', () => {
    const taxConfig: TaxConfig = { rates: { labor: 0, materials: 0.08 } }
    const sections = [
      {
        title: 'Work',
        items: [
          // line_net = 1×1000 − 100 = 900 (labor, rate 0)
          { quantity: 1, unit_price: 1000, tax_category: 'labor' as const, discount: 100 },
          // line_net = 1×500 = 500 (materials, rate 0.08)
          { quantity: 1, unit_price: 500, tax_category: 'materials' as const },
        ],
      },
    ]

    const r = computeEstimateTotals(sections, { taxRate: 0.08, taxConfig })

    expect(r.subtotal).toBe(1400)            // 900 + 500
    expect(r.discountAmount).toBe(0)         // no GLOBAL discount
    expect(r.taxAmount).toBe(40)             // labor 900×0 + materials 500×0.08 = 40
    expect(r.grandTotal).toBe(1440)          // (1400 − 0) + 40
    expect(r.sections[0].items[0].total).toBe(900) // line discount applied to the line
  })

  it('Test B — GLOBAL PERCENT discount prorated across the per-category taxable base', () => {
    const taxConfig: TaxConfig = { rates: { labor: 0, materials: 0.1 } }
    const sections = [
      {
        title: 'Work',
        items: [
          { quantity: 1, unit_price: 1000, tax_category: 'materials' as const }, // base 1000
          { quantity: 1, unit_price: 1000, tax_category: 'labor' as const },      // base 1000
        ],
      },
    ]

    // 10% global discount (whole-number percent)
    const r = computeEstimateTotals(sections, {
      taxRate: 0.1,
      taxConfig,
      discountType: 'percent',
      discountValue: 10,
    })

    expect(r.subtotal).toBe(2000)            // 1000 + 1000
    expect(r.discountAmount).toBe(200)       // round2(2000 × 0.10)
    // materials prorated = round2(200 × 1000/2000) = 100 → base 900 × 0.10 = 90
    // labor prorated = 100 → base 900 × 0 = 0
    expect(r.taxAmount).toBe(90)
    expect(r.grandTotal).toBe(1890)          // (2000 − 200) + 90
  })

  it('Test C — GLOBAL AMOUNT discount prorated before tax (single category)', () => {
    const taxConfig: TaxConfig = { rates: { materials: 0.08 } }
    const sections = [
      {
        title: 'Work',
        items: [
          { quantity: 1, unit_price: 1000, tax_category: 'materials' as const },
          { quantity: 1, unit_price: 500, tax_category: 'materials' as const },
        ],
      },
    ]

    const r = computeEstimateTotals(sections, {
      taxRate: 0.08,
      taxConfig,
      discountType: 'amount',
      discountValue: 300,
    })

    expect(r.subtotal).toBe(1500)            // 1000 + 500
    expect(r.discountAmount).toBe(300)
    // materials base (1500 − 300 prorated) = 1200 × 0.08 = 96
    expect(r.taxAmount).toBe(96)
    expect(r.grandTotal).toBe(1296)          // (1500 − 300) + 96
  })

  it('Test D — RETROCOMPAT: no discount → byte-identical golden + discountAmount 0', () => {
    const sections = [
      { title: 'A', items: [{ quantity: 1, unit_price: 500 }, { quantity: 2, unit_price: 125.5 }] },
      { title: 'B', items: [{ quantity: 3, unit_price: 33.33 }] },
    ]

    const r = computeEstimateTotals(sections, { taxRate: 0.1 })

    expect(r.subtotal).toBe(850.99)
    expect(r.taxAmount).toBe(85.1)
    expect(r.grandTotal).toBe(936.09)
    expect(r.discountAmount).toBe(0)         // new field present, zero on the happy path
  })
})
