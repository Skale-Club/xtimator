import { describe, it, expect } from 'vitest'

/**
 * Phase 114-01 (FEE-04) — computeApplicationFee pure helper.
 *
 * The platform application fee in integer cents. Stripe requires the fee to be
 * POSITIVE and STRICTLY LESS than the charge amount, so the helper:
 *   - returns 0 for a non-positive amount or a non-positive percentage (caller omits)
 *   - rounds amount × pct to the nearest cent
 *   - floors at minCents
 *   - clamps strictly below the charge (amountCents - 1) so Stripe never rejects it
 *   - therefore returns 0 at the 1-cent edge (amount - 1 === 0), where no positive
 *     fee strictly below the charge can exist — the caller omits the field
 *
 * Pure module: NO `import 'server-only'`, no billing_config read (pct/min are
 * passed in by the caller — FEE-03 lives in the action).
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

  it('floors at minCents when the rounded fee is below it', () => {
    // round(20 × 0.01) = round(0.2) = 0 → floored to min 5
    expect(computeApplicationFee(20, 0.01, 5)).toBe(5)
  })

  it('clamps strictly below the charge amount', () => {
    // round(3 × 0.5) = round(1.5) = 2; min 5 → 5; clamped to amount - 1 = 2
    expect(computeApplicationFee(3, 0.5, 5)).toBe(2)
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
