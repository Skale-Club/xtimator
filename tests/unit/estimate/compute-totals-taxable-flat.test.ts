import { describe, it, expect } from 'vitest'
import { computeEstimateTotals } from '@/lib/estimate/compute-totals'

/**
 * SAVE-07 server half (audit B8 corollary) — the flat tax path (taxConfig
 * absent/null, the default for a company with no per-category tax rule) now
 * honors per-line `taxable`. Previously (audit finding): "the taxable=false
 * toggle is currently a no-op in the flat path (server also ignores it —
 * compute-totals.ts:142)". DELIBERATE BEHAVIOR CHANGE, guarded by two
 * invariants:
 *   1. An all-taxable estimate (taxable absent/true on every line — the
 *      overwhelming default) is BYTE-IDENTICAL to the pre-165 flat formula.
 *   2. A taxable=false line now reduces flat tax by exactly that line's
 *      total × rate (when no global discount is in play).
 */
describe('SAVE-07: flat-path taxable (compute-totals, taxConfig absent)', () => {
  it('all-taxable (no taxable field set) stays BYTE-IDENTICAL to the pre-165 flat formula', () => {
    const sections = [
      {
        title: 'General',
        items: [
          { quantity: 10, unit_price: 100 }, // 1000
          { quantity: 1, unit_price: 500 }, // 500
        ],
      },
    ]
    const r = computeEstimateTotals(sections, { taxRate: 0.0875 })

    expect(r.subtotal).toBe(1500)
    // Pre-165 formula: (subtotal - 0) * 0.0875 = 131.25
    expect(r.taxAmount).toBe(131.25)
    expect(r.grandTotal).toBe(1631.25)
  })

  it('all-taxable EXPLICIT (taxable: true on every line) is also byte-identical', () => {
    const sections = [
      {
        title: 'General',
        items: [
          { quantity: 10, unit_price: 100, taxable: true },
          { quantity: 1, unit_price: 500, taxable: true },
        ],
      },
    ]
    const r = computeEstimateTotals(sections, { taxRate: 0.0875 })

    expect(r.subtotal).toBe(1500)
    expect(r.taxAmount).toBe(131.25)
    expect(r.grandTotal).toBe(1631.25)
  })

  it('a taxable=false line contributes ZERO to the flat taxable base (no global discount)', () => {
    const sections = [
      {
        title: 'General',
        items: [
          { quantity: 10, unit_price: 100 }, // 1000, taxable (default true)
          { quantity: 1, unit_price: 500, taxable: false }, // 500, EXCLUDED from taxable base
        ],
      },
    ]
    const r = computeEstimateTotals(sections, { taxRate: 0.0875 })

    expect(r.subtotal).toBe(1500) // subtotal still includes the non-taxable line
    // Only the 1000 taxable base is taxed: 1000 * 0.0875 = 87.5 (NOT 131.25).
    expect(r.taxAmount).toBe(87.5)
    expect(r.grandTotal).toBe(1587.5)
  })

  it('a taxable=false line reduces flat tax by exactly that line total × rate', () => {
    const allTaxable = computeEstimateTotals(
      [{ title: 'A', items: [{ quantity: 10, unit_price: 100 }, { quantity: 1, unit_price: 500 }] }],
      { taxRate: 0.0875 }
    )
    const oneNonTaxable = computeEstimateTotals(
      [
        {
          title: 'A',
          items: [
            { quantity: 10, unit_price: 100 },
            { quantity: 1, unit_price: 500, taxable: false },
          ],
        },
      ],
      { taxRate: 0.0875 }
    )

    const expectedDelta = Math.round(500 * 0.0875 * 100) / 100 // the excluded line's total × rate
    expect(Math.round((allTaxable.taxAmount - oneNonTaxable.taxAmount) * 100) / 100).toBe(
      expectedDelta
    )
  })

  it('ALL lines taxable=false → flat tax is zero regardless of rate', () => {
    const sections = [
      {
        title: 'General',
        items: [
          { quantity: 10, unit_price: 100, taxable: false },
          { quantity: 1, unit_price: 500, taxable: false },
        ],
      },
    ]
    const r = computeEstimateTotals(sections, { taxRate: 0.0875 })

    expect(r.subtotal).toBe(1500)
    expect(r.taxAmount).toBe(0)
    expect(r.grandTotal).toBe(1500)
  })

  it('global discount prorates onto the taxable base only (taxable=false line excluded from proration)', () => {
    const sections = [
      {
        title: 'General',
        items: [
          { quantity: 10, unit_price: 100 }, // 1000 taxable
          { quantity: 1, unit_price: 500, taxable: false }, // 500 non-taxable
        ],
      },
    ]
    const r = computeEstimateTotals(sections, {
      taxRate: 0.1,
      discountType: 'amount',
      discountValue: 150,
    })

    // taxableSubtotal = 1000, overall subtotal = 1500.
    // proratedDisc = 150 * (1000/1500) = 100.
    // taxAmount = (1000 - 100) * 0.1 = 90.
    expect(r.subtotal).toBe(1500)
    expect(r.taxAmount).toBe(90)
    // discountAmount (disc_global) is unaffected by the taxable proration — still the full 150.
    expect(r.discountAmount).toBe(150)
  })
})
