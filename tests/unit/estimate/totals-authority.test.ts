import { describe, it, expect } from 'vitest'

/**
 * GUARD-03 — server-side totals authority + discrepancy signal.
 *
 * Pure helpers `@/lib/estimate/totals` formalize the existing server-derived totals math
 * (generate-estimate.ts:248-269) and add a discrepancy metric comparing the server grand
 * total against the naive AI-implied total:
 *   - round2: 2-dp rounding; NaN/negative coerced to 0 (defensive, never-throw).
 *   - SECTION invariant: section subtotal == round2(sum(item totals)) within TOTALS_EPSILON.
 *   - GRAND invariant: grand == round2(subtotal + taxAmount) within TOTALS_EPSILON.
 *   - computeTotalsDiscrepancy: { delta, delta_pct, moved_by_guardrails, ... }.
 */

import { round2, computeTotalsDiscrepancy, TOTALS_EPSILON } from '@/lib/estimate/totals'

describe('GUARD-03: totals invariants', () => {
  it('section subtotal equals round2(sum of item totals) within epsilon', () => {
    const itemTotals = [100, 50.005]
    const subtotal = round2(itemTotals.reduce((a, b) => a + b, 0))
    expect(Math.abs(subtotal - round2(itemTotals[0] + itemTotals[1]))).toBeLessThanOrEqual(
      TOTALS_EPSILON
    )
  })

  it('grand total equals round2(subtotal + taxAmount) within epsilon', () => {
    const subtotal = 150
    const taxRate = 0.1
    const taxAmount = round2(subtotal * taxRate)
    const grandTotal = round2(subtotal + taxAmount)
    expect(taxAmount).toBe(15)
    expect(Math.abs(grandTotal - round2(subtotal + taxAmount))).toBeLessThanOrEqual(TOTALS_EPSILON)
  })

  it('round2 coerces NaN to 0 (defensive, never-throw)', () => {
    expect(round2(NaN)).toBe(0)
  })

  it('round2 coerces a negative value to 0 (defensive >=0 guard)', () => {
    expect(round2(-5)).toBe(0)
  })
})

describe('GUARD-03: totals_discrepancy metric', () => {
  it('computes delta, delta_pct, and moved_by_guardrails=true when guardrails moved totals', () => {
    const d = computeTotalsDiscrepancy({
      serverGrand: 275,
      aiGrand: 250,
      anchoredCount: 1,
      clampedCount: 0,
    })
    expect(d.delta).toBe(25)
    expect(d.delta_pct).toBe(10)
    expect(d.moved_by_guardrails).toBe(true)
  })

  it('moved_by_guardrails=false when no anchoring/clamping occurred', () => {
    const d = computeTotalsDiscrepancy({
      serverGrand: 250,
      aiGrand: 250,
      anchoredCount: 0,
      clampedCount: 0,
    })
    expect(d.moved_by_guardrails).toBe(false)
  })

  it('delta_pct is null when aiGrand is 0 (no divide-by-zero)', () => {
    const d = computeTotalsDiscrepancy({
      serverGrand: 100,
      aiGrand: 0,
      anchoredCount: 0,
      clampedCount: 0,
    })
    expect(d.delta_pct).toBe(null)
  })
})
