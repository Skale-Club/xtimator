import { describe, it, expect } from 'vitest'

/**
 * SEED-054 — commission arithmetic (pure module, integer cents in/out).
 *
 * These are the numbers that decide how much money leaves the platform, so the
 * edges matter more than the happy path: a rate above 1.0, a zero-rate override
 * that must NOT fall back to the default, and the window/hold boundaries.
 */

import {
  commissionPayableAt,
  commissionWindowEnd,
  computeCommissionCents,
  isWithinCommissionWindow,
  meetsPayoutThreshold,
  resolveCommissionPct,
} from '@/lib/affiliates/commission'

describe('computeCommissionCents', () => {
  it('computes 20% of a $29.00 Pro invoice', () => {
    expect(computeCommissionCents(2900, 0.2)).toBe(580)
  })

  it('computes 20% of a $99.00 Business invoice', () => {
    expect(computeCommissionCents(9900, 0.2)).toBe(1980)
  })

  it('rounds to the nearest cent', () => {
    // 9900 × 0.155 = 1534.5 → 1535 (this product IS representable above .5)
    expect(computeCommissionCents(9900, 0.155)).toBe(1535)
  })

  it('rounds the IEEE-754 product, not the exact decimal, at a half cent', () => {
    // Documented, deliberate: 2900 × 0.175 is 507.4999999999999 in float, so it
    // rounds DOWN to 507 where exact decimal arithmetic would give 508. Same
    // Math.round-on-a-float-product approach as computeApplicationFee
    // (lib/billing/estimate-fee.ts) — consistency across the two money paths is
    // worth more than a sub-cent correction, and the error is bounded at 1 cent
    // on a single invoice. Revisit only if commissions ever move to a
    // decimal type end-to-end.
    expect(computeCommissionCents(2900, 0.175)).toBe(507)
  })

  it('returns 0 for a non-positive base (a $0 invoice earns nothing)', () => {
    expect(computeCommissionCents(0, 0.2)).toBe(0)
    expect(computeCommissionCents(-100, 0.2)).toBe(0)
  })

  it('returns 0 for a zero or negative rate', () => {
    expect(computeCommissionCents(2900, 0)).toBe(0)
    expect(computeCommissionCents(2900, -0.2)).toBe(0)
  })

  it('clamps to the base so a misconfigured rate cannot overpay', () => {
    expect(computeCommissionCents(2900, 1.5)).toBe(2900)
  })

  it('pays the full amount at exactly 100%', () => {
    expect(computeCommissionCents(2900, 1)).toBe(2900)
  })
})

describe('resolveCommissionPct', () => {
  it('uses the platform default when there is no override', () => {
    expect(resolveCommissionPct(null, 0.2)).toBe(0.2)
    expect(resolveCommissionPct(undefined, 0.2)).toBe(0.2)
  })

  it('prefers a negotiated override', () => {
    expect(resolveCommissionPct(0.35, 0.2)).toBe(0.35)
  })

  it('honours an INTENTIONAL 0% override instead of falling back', () => {
    // The regression this guards: `override || defaultPct` would silently pay
    // 20% to an affiliate deliberately parked at 0%.
    expect(resolveCommissionPct(0, 0.2)).toBe(0)
  })
})

describe('commissionWindowEnd', () => {
  it('adds the configured months', () => {
    const start = new Date('2026-01-15T00:00:00.000Z')
    expect(commissionWindowEnd(start, 12)?.toISOString()).toBe('2027-01-15T00:00:00.000Z')
  })

  it('normalizes month-end overflow rather than producing an invalid date', () => {
    const start = new Date('2026-01-31T00:00:00.000Z')
    const end = commissionWindowEnd(start, 1)!
    expect(Number.isNaN(end.getTime())).toBe(false)
    // Jan 31 + 1 month overflows February; erring long favours the affiliate.
    expect(end.getTime()).toBeGreaterThan(start.getTime())
  })

  it('returns null for a duration of 0 — the lifetime configuration', () => {
    expect(commissionWindowEnd(new Date('2026-01-15T00:00:00.000Z'), 0)).toBeNull()
  })

  it('does not mutate the input date', () => {
    const start = new Date('2026-01-15T00:00:00.000Z')
    commissionWindowEnd(start, 12)
    expect(start.toISOString()).toBe('2026-01-15T00:00:00.000Z')
  })
})

describe('isWithinCommissionWindow', () => {
  const end = new Date('2027-01-15T00:00:00.000Z')

  it('earns on an invoice inside the window', () => {
    expect(isWithinCommissionWindow(new Date('2026-08-01T00:00:00.000Z'), end)).toBe(true)
  })

  it('includes the exact boundary millisecond', () => {
    expect(isWithinCommissionWindow(new Date(end.getTime()), end)).toBe(true)
  })

  it('stops one millisecond past the boundary', () => {
    expect(isWithinCommissionWindow(new Date(end.getTime() + 1), end)).toBe(false)
  })

  it('always earns when the window is null (lifetime)', () => {
    expect(isWithinCommissionWindow(new Date('2099-01-01T00:00:00.000Z'), null)).toBe(true)
  })
})

describe('commissionPayableAt', () => {
  const accrued = new Date('2026-08-05T00:00:00.000Z')

  it('adds the hold window in days', () => {
    expect(commissionPayableAt(accrued, 30).toISOString()).toBe('2026-09-04T00:00:00.000Z')
  })

  it('treats a zero hold as payable immediately', () => {
    expect(commissionPayableAt(accrued, 0).getTime()).toBe(accrued.getTime())
  })

  it('never moves the date backwards on a negative hold', () => {
    expect(commissionPayableAt(accrued, -10).getTime()).toBe(accrued.getTime())
  })
})

describe('meetsPayoutThreshold', () => {
  it('pays out at exactly the threshold', () => {
    expect(meetsPayoutThreshold(5000, 5000)).toBe(true)
  })

  it('rolls a sub-threshold balance forward', () => {
    expect(meetsPayoutThreshold(4999, 5000)).toBe(false)
  })

  it('never pays out a zero balance, even with a zero threshold', () => {
    expect(meetsPayoutThreshold(0, 0)).toBe(false)
  })
})
