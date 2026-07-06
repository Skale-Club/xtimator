import { describe, it, expect } from 'vitest'
import { computeUsagePercent } from '@/lib/billing/usage-percent'

/**
 * Phase 152 Plan 01 (CREDITUI-03) — computeUsagePercent pure formula.
 *
 * percentUsed = clamp(0, 100, round(100 * (cycleGrant - balance) / cycleGrant)),
 * 0 if cycleGrant <= 0 (divide-by-zero guard, per 152-CONTEXT.md: render 0% used
 * rather than hiding the bar). This is the SOLE source of truth for the tenant
 * usage percentage, shared by the Plans page and the topbar chip.
 */
describe('computeUsagePercent (CREDITUI-03)', () => {
  it('Test 1: nothing used -> 0%', () => {
    expect(computeUsagePercent({ balance: 1000, cycleGrant: 1000 })).toBe(0)
  })

  it('Test 2: fully used -> 100%', () => {
    expect(computeUsagePercent({ balance: 0, cycleGrant: 1000 })).toBe(100)
  })

  it('Test 3: half used -> 50%', () => {
    expect(computeUsagePercent({ balance: 500, cycleGrant: 1000 })).toBe(50)
  })

  it('Test 4: divide-by-zero guard -> 0%', () => {
    expect(computeUsagePercent({ balance: 100, cycleGrant: 0 })).toBe(0)
  })

  it('Test 5: over-spent/race-condition balance clamps to 100%, never negative-balance overflow', () => {
    expect(computeUsagePercent({ balance: -200, cycleGrant: 1000 })).toBe(100)
  })

  it('Test 6: balance above grant (e.g. stacked top-up) clamps to floor 0, never negative', () => {
    expect(computeUsagePercent({ balance: 1200, cycleGrant: 1000 })).toBe(0)
  })
})
