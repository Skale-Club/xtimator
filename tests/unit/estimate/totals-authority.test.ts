import { describe, it, expect, beforeAll } from 'vitest'

/**
 * GUARD-03 — server-side totals authority + discrepancy signal (Wave 0 RED).
 *
 * Pure helpers `@/lib/estimate/totals` (land in Plan 100-02) formalize the existing
 * server-derived totals math (generate-estimate.ts:248-269) and add a discrepancy
 * metric comparing the server grand total against the naive AI-implied total:
 *   - round2: 2-dp rounding; NaN/negative coerced to 0 (defensive, never-throw).
 *   - SECTION invariant: section subtotal == round2(sum(item totals)) within TOTALS_EPSILON.
 *   - GRAND invariant: grand == round2(subtotal + taxAmount) within TOTALS_EPSILON.
 *   - computeTotalsDiscrepancy: { delta, delta_pct, moved_by_guardrails, ... }.
 *
 * RED today: `@/lib/estimate/totals` does not exist. The computed-specifier importTarget
 * defeats Vite transform-time import-analysis so the file COLLECTS cleanly and each test
 * fails at RUN time. Mirrors never-throw.test.ts.
 */

// Type-only import for the contract surface. `import type` is erased at compile so it
// never fails collection when the module is absent (RED lives in the runtime importTarget
// in beforeAll below). It also encodes the key-link `from '@/lib/estimate/totals'`.
import type { computeTotalsDiscrepancy as _DiscrepancyFn } from '@/lib/estimate/totals'

const importTarget = (spec: string) => import(/* @vite-ignore */ spec)

type TotalsDiscrepancy = {
  ai_grand: number
  server_grand: number
  delta: number
  delta_pct: number | null
  anchored_count: number
  clamped_count: number
  moved_by_guardrails: boolean
}

let round2: (x: number) => number
let computeTotalsDiscrepancy: (args: {
  serverGrand: number
  aiGrand: number
  anchoredCount: number
  clampedCount: number
}) => TotalsDiscrepancy
let TOTALS_EPSILON: number

beforeAll(async () => {
  const mod = await importTarget('@/lib/estimate/totals')
  round2 = mod.round2
  computeTotalsDiscrepancy = mod.computeTotalsDiscrepancy
  TOTALS_EPSILON = mod.TOTALS_EPSILON
})

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
