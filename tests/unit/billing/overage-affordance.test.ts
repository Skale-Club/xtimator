import { describe, it, expect } from 'vitest'

/**
 * Phase 113 Wave-0 (RED) — over-balance affordance (TOPUP-03).
 *
 * Pure helper under test (lands in Plan 113-03):
 *   lib/billing/overage-affordance.ts  (does NOT exist yet)
 *
 *   buildOverageAffordance(check: { allowed: boolean; balance: number; shortfall: number })
 *     → { topUpUrl: string; upgradeUrl: string } | null
 *
 * Contract:
 *   - shortfall > 0  → an affordance (topUpUrl + upgradeUrl) so the user can
 *     buy credits or upgrade — INFORMATIONAL, never a hard block.
 *   - shortfall === 0 → null (no affordance needed).
 *
 * This is the unit-level proof that TOPUP-03 is a PATH, not a block: even with
 * allowed:true (enforcement off), a shortfall still yields an affordance. The
 * checkCredits gate (lib/billing/credit-ledger.ts) keeps allowed:true while
 * enforcementEnabled is false — the affordance rides on `shortfall`, not on a
 * denial.
 *
 * RED driver: the import of the not-yet-created module fails collection. That
 * module-not-found IS the expected Wave-0 RED state — 113-03 creates the helper
 * to flip it green.
 */

// This import drives RED — the module does not exist yet (113-03 creates it).
const { buildOverageAffordance } = await import('@/lib/billing/overage-affordance')

describe('buildOverageAffordance (TOPUP-03)', () => {
  it('when shortfall > 0, returns an affordance with topUpUrl and upgradeUrl', () => {
    const result = buildOverageAffordance({ allowed: true, balance: 0, shortfall: 500 })

    expect(result).toEqual({
      topUpUrl: '/settings/billing?topup=1',
      upgradeUrl: '/settings/billing',
    })
  })

  it('when shortfall === 0, returns null (no affordance)', () => {
    const result = buildOverageAffordance({ allowed: true, balance: 9000, shortfall: 0 })

    expect(result).toBeNull()
  })

  it('enforcement-off: allowed stays true even with a shortfall (informational path, no hard block)', () => {
    // allowed:true + shortfall>0 still yields an affordance — proving TOPUP-03 is
    // a path, not a block. The helper keys on shortfall, independent of `allowed`.
    const result = buildOverageAffordance({ allowed: true, balance: 0, shortfall: 1 })

    expect(result).not.toBeNull()
    expect(result?.topUpUrl).toBe('/settings/billing?topup=1')
  })
})
