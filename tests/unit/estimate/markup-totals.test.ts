import { describe, it, expect } from 'vitest'
import { computeEstimateTotals } from '@/lib/estimate/compute-totals'

// MARK-01 (server math): the SERVER derives unit_price = round2(cost × (1 + markup_pct/100))
// when the AI supplied cost + markup_pct AND gave NO explicit positive unit_price. Explicit
// unit_price > 0 WINS. cost/markup absent → unit_price unchanged → BYTE-IDENTICAL. The server
// does the arithmetic; the AI never computes the marked-up price (ENG-01 / GUARD-03). Every
// golden below is HAND-COMPUTED.
describe('MARK-01: server-derived unit_price from cost × (1 + markup_pct/100)', () => {
  it('Test 1 — DERIVE: cost 80 × (1 + 25/100) = 100; line total 2 × 100 = 200', () => {
    const sections = [
      { title: 'A', items: [{ quantity: 2, cost: 80, markup_pct: 25 }] },
    ]
    const r = computeEstimateTotals(sections, { taxRate: 0 })

    // unit_price = round2(80 × 1.25) = 100
    expect(r.sections[0].items[0].unit_price).toBe(100)
    expect(r.sections[0].items[0].total).toBe(200) // 2 × 100
    expect(r.subtotal).toBe(200)
    expect(r.grandTotal).toBe(200)
  })

  it('Test 2 — EXPLICIT WINS: unit_price 500 stays 500 even with cost/markup present', () => {
    const sections = [
      { title: 'A', items: [{ quantity: 1, unit_price: 500, cost: 80, markup_pct: 25 }] },
    ]
    const r = computeEstimateTotals(sections, { taxRate: 0 })

    expect(r.sections[0].items[0].unit_price).toBe(500) // explicit wins
    expect(r.sections[0].items[0].total).toBe(500)
    expect(r.subtotal).toBe(500)
    expect(r.grandTotal).toBe(500)
  })

  it('Test 3 — RETROCOMPAT: no cost/markup → byte-identical 850.99 / 85.1 / 936.09', () => {
    const sections = [
      { title: 'A', items: [{ quantity: 1, unit_price: 500 }, { quantity: 2, unit_price: 125.5 }] },
      { title: 'B', items: [{ quantity: 3, unit_price: 33.33 }] },
    ]
    const r = computeEstimateTotals(sections, { taxRate: 0.1 })

    expect(r.subtotal).toBe(850.99) // 500 + 251 + 99.99
    expect(r.taxAmount).toBe(85.1)
    expect(r.grandTotal).toBe(936.09)
  })
})
