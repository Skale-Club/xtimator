import { describe, it, expect } from 'vitest'

/**
 * SEED-054 — the affiliate block in billing_config.
 *
 * Two things are load-bearing: the program ships OFF (nothing accrues until the
 * owner opts in), and every knob is runtime-editable rather than hardcoded at a
 * call site (BILLCFG-03). The zod schema is what the super-admin save action
 * validates against, so its bounds are tested alongside the defaults.
 */

import { DEFAULT_BILLING_CONFIG } from '@/lib/billing/billing-config'
import { billingConfigSchema } from '@/lib/schemas/admin'

describe('DEFAULT_BILLING_CONFIG.affiliate', () => {
  it('ships DISABLED — same pattern as autoTopupEnabled', () => {
    expect(DEFAULT_BILLING_CONFIG.affiliate.enabled).toBe(false)
  })

  it('expresses the commission as a fraction, matching estimateFeePct', () => {
    const pct = DEFAULT_BILLING_CONFIG.affiliate.commissionPct
    expect(pct).toBeGreaterThan(0)
    expect(pct).toBeLessThanOrEqual(1)
  })

  it('carries a finite earning window, a hold, and a payout floor', () => {
    const a = DEFAULT_BILLING_CONFIG.affiliate
    expect(a.commissionDurationMonths).toBeGreaterThan(0)
    expect(a.attributionWindowDays).toBeGreaterThan(0)
    expect(a.holdDays).toBeGreaterThan(0)
    expect(a.minPayoutCents).toBeGreaterThan(0)
  })
})

describe('billingConfigSchema — affiliate block', () => {
  const valid = DEFAULT_BILLING_CONFIG

  it('accepts the shipped defaults', () => {
    expect(billingConfigSchema.safeParse(valid).success).toBe(true)
  })

  it('rejects a save that omits the affiliate block, so it can never be wiped', () => {
    const { affiliate: _omitted, ...withoutAffiliate } = valid
    expect(billingConfigSchema.safeParse(withoutAffiliate).success).toBe(false)
  })

  it('rejects a commission rate above 100%', () => {
    const bad = { ...valid, affiliate: { ...valid.affiliate, commissionPct: 1.5 } }
    expect(billingConfigSchema.safeParse(bad).success).toBe(false)
  })

  it('rejects a negative commission rate', () => {
    const bad = { ...valid, affiliate: { ...valid.affiliate, commissionPct: -0.1 } }
    expect(billingConfigSchema.safeParse(bad).success).toBe(false)
  })

  it('allows 0 for the durations, which carry documented meanings', () => {
    const lifetime = {
      ...valid,
      affiliate: {
        ...valid.affiliate,
        commissionDurationMonths: 0,
        attributionWindowDays: 0,
        holdDays: 0,
      },
    }
    expect(billingConfigSchema.safeParse(lifetime).success).toBe(true)
  })

  it('rejects fractional month/day counts', () => {
    const bad = {
      ...valid,
      affiliate: { ...valid.affiliate, commissionDurationMonths: 1.5 },
    }
    expect(billingConfigSchema.safeParse(bad).success).toBe(false)
  })
})
