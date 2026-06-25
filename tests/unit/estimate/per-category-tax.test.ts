import { describe, it, expect } from 'vitest'
import { computeEstimateTotals, type TaxConfig } from '@/lib/estimate/compute-totals'

// TAX-03: when companies.tax_config IS present the engine computes tax PER-CATEGORY —
// taxAmount = Σ(taxable_base_per_category × rate_category), summed across items, with
// non-taxable items contributing zero. These goldens are HAND-COMPUTED.
//
// Fallback rule (documented, mirrored in compute-totals.ts): for a taxable item, the rate
// is rates[tax_category] when the category resolves to a configured rate; otherwise it
// falls back to config.default_rate, then to the option `taxRate` — so no taxable item
// silently escapes tax. Non-taxable items (taxable === false) contribute zero regardless.
describe('TAX-03: active per-category tax (companies.tax_config present)', () => {
  it('labor-exempt config taxes ONLY the materials base (hand-computed)', () => {
    const taxConfig: TaxConfig = { rates: { labor: 0, materials: 0.08 } }
    const sections = [
      {
        title: 'Work',
        items: [
          { quantity: 1, unit_price: 1000, tax_category: 'labor' as const },
          { quantity: 1, unit_price: 500, tax_category: 'materials' as const },
        ],
      },
    ]

    const r = computeEstimateTotals(sections, { taxRate: 0.08, taxConfig })

    expect(r.subtotal).toBe(1500)   // 1000 + 500
    expect(r.taxAmount).toBe(40)    // labor 1000×0 + materials 500×0.08 = 40
    expect(r.grandTotal).toBe(1540) // 1500 + 40
  })

  it('a non-taxable item contributes ZERO even under a non-zero category rate', () => {
    const taxConfig: TaxConfig = { rates: { materials: 0.08 } }
    const sections = [
      {
        title: 'Work',
        items: [
          // materials item, but flagged not taxable → excluded from EVERY category base
          { quantity: 1, unit_price: 500, tax_category: 'materials' as const, taxable: false },
        ],
      },
    ]

    const r = computeEstimateTotals(sections, { taxRate: 0.08, taxConfig })

    expect(r.subtotal).toBe(500)
    expect(r.taxAmount).toBe(0)     // non-taxable → no base accrues
    expect(r.grandTotal).toBe(500)
  })

  it('a null/undefined tax_category falls back to the documented default_rate (no silent escape)', () => {
    const taxConfig: TaxConfig = { rates: { labor: 0, materials: 0.08 }, default_rate: 0.05 }
    const sections = [
      {
        title: 'Work',
        // No tax_category at all → resolves to config.default_rate (0.05).
        items: [{ quantity: 1, unit_price: 200 }],
      },
    ]

    const r = computeEstimateTotals(sections, { taxRate: 0.07, taxConfig })

    expect(r.subtotal).toBe(200)
    expect(r.taxAmount).toBe(10)    // 200 × default_rate 0.05 = 10 (hand-computed)
    expect(r.grandTotal).toBe(210)
  })

  it('a null tax_category with NO default_rate falls back to the option taxRate', () => {
    const taxConfig: TaxConfig = { rates: { materials: 0.08 } }
    const sections = [
      {
        title: 'Work',
        items: [{ quantity: 1, unit_price: 100 }], // no category, no default_rate
      },
    ]

    const r = computeEstimateTotals(sections, { taxRate: 0.07, taxConfig })

    expect(r.subtotal).toBe(100)
    expect(r.taxAmount).toBe(7)     // 100 × option taxRate 0.07 = 7 (hand-computed)
    expect(r.grandTotal).toBe(107)
  })

  it('sums taxable base PER-CATEGORY across multiple items and sections', () => {
    const taxConfig: TaxConfig = { rates: { labor: 0.02, materials: 0.08 } }
    const sections = [
      {
        title: 'A',
        items: [
          { quantity: 2, unit_price: 100, tax_category: 'labor' as const },    // base 200
          { quantity: 1, unit_price: 300, tax_category: 'materials' as const }, // base 300
        ],
      },
      {
        title: 'B',
        items: [
          { quantity: 1, unit_price: 100, tax_category: 'labor' as const },    // base 100
        ],
      },
    ]

    const r = computeEstimateTotals(sections, { taxRate: 0.05, taxConfig })

    // labor base 300 × 0.02 = 6 ; materials base 300 × 0.08 = 24 ; total tax 30
    expect(r.subtotal).toBe(600)
    expect(r.taxAmount).toBe(30)
    expect(r.grandTotal).toBe(630)
  })
})
