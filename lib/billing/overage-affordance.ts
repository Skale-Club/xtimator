/**
 * Phase 113 (TOPUP-03) — over-balance affordance (PATH, not a block).
 *
 * A pure mapping from a checkCredits result to a top-up/upgrade affordance.
 * When the company is short on credits (shortfall > 0) it surfaces a top-up +
 * upgrade path so the owner can buy credits or move up a tier — INFORMATIONAL
 * only, never a hard block. shortfall === 0 → null (no affordance needed).
 *
 * The helper keys on `shortfall`, independent of `allowed`: enforcement is OFF
 * this milestone (checkCredits keeps allowed:true while enforcementEnabled is
 * false), so a shortfall still yields an affordance without denying the action.
 *
 * No imports, no side effects — trivially testable and reusable by the
 * Phase-115 balance widget.
 */
export function buildOverageAffordance(check: {
  allowed: boolean
  balance: number
  shortfall: number
}): { topUpUrl: string; upgradeUrl: string } | null {
  if (check.shortfall > 0) {
    return { topUpUrl: '/settings/billing?topup=1', upgradeUrl: '/settings/billing' }
  }
  return null
}
