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

  it('TAX-03 regression: omitted taxConfig === explicit null === byte-identical flat golden', () => {
    // The new per-category branch (Plan 130-02) must NEVER touch the flat path: with the
    // option omitted AND with taxConfig: null the engine returns the IDENTICAL golden.
    const omitted = computeEstimateTotals(sections, { taxRate })
    const explicitNull = computeEstimateTotals(sections, { taxRate, taxConfig: null })

    // Byte-identical to the standing 850.99 / 85.1 / 936.09 golden, both ways.
    expect(omitted.subtotal).toBe(850.99)
    expect(omitted.taxAmount).toBe(85.1)
    expect(omitted.grandTotal).toBe(936.09)

    expect(explicitNull.subtotal).toBe(omitted.subtotal)
    expect(explicitNull.taxAmount).toBe(omitted.taxAmount)
    expect(explicitNull.grandTotal).toBe(omitted.grandTotal)
    expect(explicitNull.subtotal).toBe(850.99)
    expect(explicitNull.taxAmount).toBe(85.1)
    expect(explicitNull.grandTotal).toBe(936.09)
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
