import { describe, it, expect } from 'vitest'
import { computeEstimateTotals } from '@/lib/estimate/compute-totals'

// ENG-02: an estimate with NO new fields (taxable true, discount 0, deposit none, no tax_config)
// must yield BYTE-IDENTICAL subtotal/taxAmount/grandTotal vs the pre-v4.11 flat-rate engine.
// These golden numbers are the STANDING retrocompat guard for the whole v4.11 milestone —
// Phases 130-134 must keep this green (no number drift on already-generated estimates).
describe('ENG-02: retrocompat happy path (flat rate, no new fields)', () => {
  const sections = [
    { title: 'A', items: [ { quantity: 1, unit_price: 500 }, { quantity: 2, unit_price: 125.5 } ] },
    { title: 'B', items: [ { quantity: 3, unit_price: 33.33 } ] },
  ]
  const taxRate = 0.1

  it('produces byte-identical golden subtotal / taxAmount / grandTotal', () => {
    const r = computeEstimateTotals(sections, { taxRate })
    expect(r.subtotal).toBe(850.99)     // 500 + 251 + 99.99
    expect(r.taxAmount).toBe(85.1)
    expect(r.grandTotal).toBe(936.09)
  })

  it('item.total and section.subtotal match the flat per-item math', () => {
    const r = computeEstimateTotals(sections, { taxRate })
    expect(r.sections[0].items[0].total).toBe(500)
    expect(r.sections[0].items[1].total).toBe(251)
    expect(r.sections[0].subtotal).toBe(751)
    expect(r.sections[1].items[0].total).toBe(99.99)
    expect(r.sections[1].subtotal).toBe(99.99)
  })

  it('line discount default (0) leaves the line total unchanged (scaffold collapses to today)', () => {
    const withZeroDiscount = computeEstimateTotals(
      [{ title: 'A', items: [ { quantity: 2, unit_price: 100, discount: 0 } ] }],
      { taxRate: 0 }
    )
    expect(withZeroDiscount.sections[0].items[0].total).toBe(200)
    expect(withZeroDiscount.subtotal).toBe(200)
    expect(withZeroDiscount.taxAmount).toBe(0)
    expect(withZeroDiscount.grandTotal).toBe(200)
  })

  it('taxable/tax_config absent → flat subtotal × taxRate (retrocompat branch)', () => {
    const r = computeEstimateTotals(
      [{ title: 'A', items: [ { quantity: 1, unit_price: 1000, taxable: true } ] }],
      { taxRate: 0.08 }
    )
    expect(r.subtotal).toBe(1000)
    expect(r.taxAmount).toBe(80)
    expect(r.grandTotal).toBe(1080)
  })
})
