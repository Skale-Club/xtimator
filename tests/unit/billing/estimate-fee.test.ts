import { describe, it, expect } from 'vitest'

/**
 * Phase 114-01 (FEE-04) — computeApplicationFee pure helper.
 *
 * The platform application fee in integer cents. Stripe requires the fee to be
 * POSITIVE and STRICTLY LESS than the charge amount, so the helper:
 *   - returns 0 for a non-positive amount or a non-positive percentage (caller omits)
 *   - rounds amount × pct to the nearest cent
 *   - floors at minCents
 *   - CAPS the floored fee at a policy ceiling of 10% of the charge — audit
 *     fix (FEE-04 follow-up): an admin-set minCents floor must never be able
 *     to eat a disproportionate share of a small invoice (e.g. a $5.00 min
 *     fee taking $1.49 of a $1.50 charge)
 *   - clamps strictly below the charge (amountCents - 1) so Stripe never rejects it
 *   - therefore returns 0 at the 1-cent edge (amount - 1 === 0), where no positive
 *     fee strictly below the charge can exist — the caller omits the field
 *
 * Pure module: NO `import 'server-only'`, no billing_config read (pct/min are
 * passed in by the caller — FEE-03 lives in the action). The pure fn accepts
 * any feePct the caller passes (no [0, 0.1] bound here) — that bound lives in
 * lib/schemas/admin.ts (estimateFeePct.max(0.1)) as the actual input guard;
 * a few tests below intentionally pass an out-of-policy pct to exercise the
 * 10% ceiling as defense-in-depth.
 */

import { computeApplicationFee } from '@/lib/billing/estimate-fee'

describe('FEE-04: computeApplicationFee', () => {
  it('computes 1% of $100.00 = 100 cents', () => {
    expect(computeApplicationFee(10000, 0.01, 1)).toBe(100)
  })

  it('computes 1% of $50.00 = 50 cents', () => {
    expect(computeApplicationFee(5000, 0.01, 1)).toBe(50)
  })

  it('rounds to the min when round(amount × pct) already meets it', () => {
    // round(50 × 0.01) = round(0.5) = 1, already >= min 1 → stays 1
    expect(computeApplicationFee(50, 0.01, 1)).toBe(1)
  })

  it('floors at minCents, then caps at the 10% policy ceiling when the floor exceeds it', () => {
    // round(20 × 0.01) = round(0.2) = 0 → floored to min 5 → but 5/20 = 25%
    // exceeds the 10% ceiling (floor(20 × 0.1) = 2), so capped to 2.
    expect(computeApplicationFee(20, 0.01, 5)).toBe(2)
  })

  it('the 10% policy ceiling binds well below the amount-1 hard cap (audit fix)', () => {
    // A $0.50 min fee on a $2.00 charge (200 cents) is 25% — well above the
    // 10% ceiling (floor(200 × 0.1) = 20) but far short of the amount-1 hard
    // cap (199). The ceiling is the binding constraint here, not the hard cap.
    expect(computeApplicationFee(200, 0.01, 50)).toBe(20)
  })

  it('audit fix: a $5.00 min fee cannot eat most of a $1.50 charge', () => {
    // A tiny pct (so the fn doesn't early-return 0) with minCents=500 on a
    // 150-cent charge would previously return 149 (99.3% of the charge). The
    // 10% ceiling now caps it to floor(150 × 0.1) = 15.
    expect(computeApplicationFee(150, 0.001, 500)).toBe(15)
  })

  it('clamps strictly below the charge amount at the smallest amounts (hard cap still holds)', () => {
    // round(3 × 0.5) = round(1.5) = 2; min 5 → floored to 5; 10% ceiling of
    // 3 cents is floor(0.3) = 0, so the result is 0 (no positive fee fits).
    expect(computeApplicationFee(3, 0.5, 5)).toBe(0)
  })

  it('a purely percentage-based fee within the 10% ceiling is unaffected by the cap', () => {
    // No minCents floor involved — pct alone stays under the ceiling.
    expect(computeApplicationFee(10000, 0.05, 0)).toBe(500)
  })

  it('returns 0 at the 1-cent edge (no positive fee strictly below the charge)', () => {
    // clamp to amount - 1 = 0 → fee omitted by the caller
    expect(computeApplicationFee(1, 0.01, 1)).toBe(0)
  })

  it('returns 0 for a zero amount', () => {
    expect(computeApplicationFee(0, 0.01, 1)).toBe(0)
  })

  it('returns 0 for a negative amount', () => {
    expect(computeApplicationFee(-100, 0.01, 1)).toBe(0)
  })

  it('returns 0 for a zero percentage', () => {
    expect(computeApplicationFee(10000, 0, 1)).toBe(0)
  })

  it('always returns an integer number of cents (never a fraction)', () => {
    const fee = computeApplicationFee(12345, 0.013, 1)
    expect(Number.isInteger(fee)).toBe(true)
  })
})
