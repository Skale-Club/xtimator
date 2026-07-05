import { describe, it, expect } from 'vitest'
import { computeEstimateTotals } from '@/lib/estimate/compute-totals'

// DEP-01 (server math): the LOCKED deposit sequence, computed AFTER grandTotal —
//   deposit = (deposit_type==='percent' ? round2(grandTotal × deposit_value/100)
//            : deposit_type==='amount'  ? round2(deposit_value)
//            : 0)
//   balanceDue = round2(grandTotal − deposit)
// deposit_type absent / 'none' / null → deposit 0 → balanceDue = grandTotal (byte-identical retrocompat).
// The pure math is a faithful subtraction (NO clamp here — out-of-range guarding is a Phase-133
// editor concern). Every golden below is HAND-COMPUTED.
describe('DEP-01: deposit + balance_due (LOCKED sequence after grandTotal)', () => {
  // A simple section so grandTotal is trivially hand-verifiable:
  //   line_net = 1×1000 = 1000 → subtotal 1000 ; taxAmount 1000×0.1 = 100 ; grandTotal 1100.
  const sections = [{ title: 'A', items: [{ quantity: 1, unit_price: 1000 }] }]

  it('Test 1 — PERCENT: deposit = round2(grandTotal × pct/100); balanceDue = grandTotal − deposit', () => {
    const r = computeEstimateTotals(sections, {
      taxRate: 0.1,
      depositType: 'percent',
      depositValue: 25,
    })

    expect(r.grandTotal).toBe(1100)
    expect(r.deposit).toBe(275) // round2(1100 × 25/100)
    expect(r.balanceDue).toBe(825) // round2(1100 − 275)
  })

  it('Test 2 — AMOUNT: deposit = deposit_value; balanceDue = grandTotal − deposit_value', () => {
    const r = computeEstimateTotals(sections, {
      taxRate: 0.1,
      depositType: 'amount',
      depositValue: 400,
    })

    expect(r.grandTotal).toBe(1100)
    expect(r.deposit).toBe(400)
    expect(r.balanceDue).toBe(700) // round2(1100 − 400)
  })

  it('Test 3 — NONE / omitted: deposit 0, balanceDue = grandTotal, totals byte-identical', () => {
    const r = computeEstimateTotals(sections, { taxRate: 0.1 })

    expect(r.deposit).toBe(0)
    expect(r.balanceDue).toBe(1100) // === grandTotal
    // Byte-identical retrocompat: deposit scaffold collapses to today's numbers.
    expect(r.subtotal).toBe(1000)
    expect(r.taxAmount).toBe(100)
    expect(r.grandTotal).toBe(1100)
  })

  it('Test 4 — AMOUNT > grandTotal: balanceDue floored at 0 (deposit exceeding total → balanceDue 0)', () => {
    const r = computeEstimateTotals(sections, {
      taxRate: 0.1,
      depositType: 'amount',
      depositValue: 1500,
    })

    expect(r.grandTotal).toBe(1100)
    expect(r.deposit).toBe(1500)
    expect(r.balanceDue).toBe(0) // floored at 0 (deposit exceeding total → balanceDue 0)
  })
})
