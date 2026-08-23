import { describe, it, expect } from 'vitest'
import { computeEstimateTotals, type TaxConfig } from '@/lib/estimate/compute-totals'

// WI-2 (HARDEN-GUARD-01): defensive guards in computeEstimateTotals so the engine never
// emits a NEGATIVE tax (malformed / non-finite tax rate → 0) nor a NEGATIVE balanceDue
// (deposit exceeding the grand total → 0). Every guard is a STRICT NO-OP on valid
// (finite, >=0) input — proven by the byte-identical regression case below. Goldens are
// HAND-COMPUTED.
describe('WI-2: compute-totals defensive guards (tax-rate coercion + balanceDue floor)', () => {
  const sections = [{ title: 'A', items: [{ quantity: 1, unit_price: 1000 }] }]

  it('negative taxRate (flat path) → taxAmount 0, grandTotal === subtotal', () => {
    const r = computeEstimateTotals(sections, { taxRate: -0.1 })

    expect(r.subtotal).toBe(1000)
    expect(r.taxAmount).toBe(0) // coerced: a negative rate never produces negative tax
    expect(r.grandTotal).toBe(1000) // subtotal + 0
  })

  it('NaN taxRate (flat path) → taxAmount 0, grandTotal === subtotal', () => {
    const r = computeEstimateTotals(sections, { taxRate: NaN })

    expect(r.subtotal).toBe(1000)
    expect(r.taxAmount).toBe(0)
    expect(r.grandTotal).toBe(1000)
  })

  it('Infinity taxRate (flat path) → taxAmount 0 (non-finite coerced)', () => {
    const r = computeEstimateTotals(sections, { taxRate: Infinity })

    expect(r.taxAmount).toBe(0)
    expect(r.grandTotal).toBe(1000)
  })

  it('per-category: a negative category rate AND a negative default_rate → that category contributes 0 tax', () => {
    const taxConfig: TaxConfig = { rates: { materials: -0.08 }, default_rate: -0.05 }
    const catSections = [
      {
        title: 'Work',
        items: [
          { quantity: 1, unit_price: 500, tax_category: 'materials' as const }, // rate -0.08 → coerced 0
          { quantity: 1, unit_price: 200 }, // no category → default_rate -0.05 → coerced 0
        ],
      },
    ]

    const r = computeEstimateTotals(catSections, { taxRate: -0.1, taxConfig })

    expect(r.subtotal).toBe(700)
    expect(r.taxAmount).toBe(0) // every resolved rate coerced to 0 → no negative tax
    expect(r.grandTotal).toBe(700)
  })

  it("deposit 'amount' 1500 on grandTotal 1100 → deposit clamped to 1100, balanceDue 0 (BILL-CONSTRAINT-01 FIX 1)", () => {
    const r = computeEstimateTotals(sections, {
      taxRate: 0.1,
      depositType: 'amount',
      depositValue: 1500,
    })

    expect(r.grandTotal).toBe(1100)
    // FIX 1: deposit is now clamped to [0, grandTotal] via resolveChargeAmount
    // (previously 1500 — a bad legacy row could render a negative balance
    // elsewhere even though balanceDue itself was already floored).
    expect(r.deposit).toBe(1100)
    expect(r.balanceDue).toBe(0) // floored — deposit exceeding total → 0, never negative
  })

  it("deposit 'amount' 400 on grandTotal 1100 → balanceDue 700 (valid deposit unchanged)", () => {
    const r = computeEstimateTotals(sections, {
      taxRate: 0.1,
      depositType: 'amount',
      depositValue: 400,
    })

    expect(r.grandTotal).toBe(1100)
    expect(r.deposit).toBe(400)
    expect(r.balanceDue).toBe(700) // valid deposit: the floor is a no-op
  })

  it('pre-launch audit fix: a fixed discount exceeding subtotal+tax floors grandTotal at 0 (never negative)', () => {
    const r = computeEstimateTotals(sections, {
      taxRate: 0.1, // tax 100 -> subtotal+tax = 1100
      discountType: 'amount',
      discountValue: 5000, // wildly exceeds the total
    })

    expect(r.grandTotal).toBe(0) // floored — was previously -3900
    expect(r.balanceDue).toBe(0) // no deposit configured -> balanceDue === grandTotal
  })

  it('BYTE-IDENTICAL regression: valid input is unchanged (guards are no-ops)', () => {
    const r = computeEstimateTotals(sections, { taxRate: 0.1 })

    expect(r.subtotal).toBe(1000)
    expect(r.taxAmount).toBe(100)
    expect(r.grandTotal).toBe(1100)
    expect(r.deposit).toBe(0)
    expect(r.balanceDue).toBe(1100)
  })
})
