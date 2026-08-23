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

/**
 * CREDITFIX-01 (current milestone) — the cycleGrant fed into this pure
 * formula is no longer the STATIC configured monthlyCreditGrant; callers now
 * compute it from getCycleGrantedCredits(companyId) (actual credit_ledger
 * 'grant'/'topup' rows this UTC month), via `cycleGrant = max(grantedThisCycle,
 * balance)`. computeUsagePercent's formula itself is UNCHANGED (still pure,
 * still clamped) — these tests document the two bugs that model fixes,
 * exercised through the same formula with the CORRECTED cycleGrant a caller
 * would now pass in.
 */
describe('computeUsagePercent + the corrected cycleGrant model (CREDITFIX-01)', () => {
  it('Business co: balance 2000, but only 2000 actually granted this cycle (not the static 12000 config default) -> 0% used, not 83%', () => {
    // Old bug: cycleGrant was always the static config amount (12000), so a
    // company that never actually received the full monthly grant this cycle
    // (e.g. mid-migration) rendered "83% used" having used nothing. Fixed:
    // cycleGrant is derived from what credit_ledger actually granted.
    const grantedThisCycle = 2000
    const balance = 2000
    const cycleGrant = Math.max(grantedThisCycle, balance)
    expect(computeUsagePercent({ balance, cycleGrant })).toBe(0)
  })

  it('A mid-cycle top-up raises the denominator instead of clamping to 0% forever', () => {
    // Old bug: cycleGrant was the STATIC config grant only, so any balance a
    // top-up pushed above that static number clamped the percentage to floor
    // 0 permanently, even after most of the top-up was later consumed.
    // Fixed: cycleGrant grows with the actual granted-this-cycle sum
    // (grant + topup), so consuming half the combined pool shows 50%, not 0%.
    const grantedThisCycle = 3500 /* monthly grant */ + 5000 /* mid-cycle topup */
    const balanceAfterHalfConsumed = 4250 // used 4250 of the 8500 combined pool
    const cycleGrant = Math.max(grantedThisCycle, balanceAfterHalfConsumed)
    expect(computeUsagePercent({ balance: balanceAfterHalfConsumed, cycleGrant })).toBe(50)
  })
})
