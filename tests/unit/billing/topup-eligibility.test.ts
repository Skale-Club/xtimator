import { describe, it, expect } from 'vitest'
import { isTopupEligible } from '@/lib/billing/topup-eligibility'

/** SEED-055 Phase C/D2: top-ups are for live Pro/Business subscribers only. */
describe('isTopupEligible', () => {
  it.each(['active', 'trialing', 'past_due'])('pro with live status %s is eligible', (status) => {
    expect(isTopupEligible('pro', status)).toBe(true)
    expect(isTopupEligible('business', status)).toBe(true)
  })

  it.each(['canceled', 'unpaid', 'incomplete', 'incomplete_expired'])(
    'pro with %s is not eligible even with a subscription id',
    (status) => {
      expect(isTopupEligible('pro', status, 'sub_1')).toBe(false)
    }
  )

  it('free / unknown tiers are never eligible', () => {
    expect(isTopupEligible('free', 'active', 'sub_1')).toBe(false)
    expect(isTopupEligible(null, 'active', 'sub_1')).toBe(false)
    expect(isTopupEligible(undefined, null, 'sub_1')).toBe(false)
  })

  it('legacy row: null status counts as live only with a subscription id', () => {
    expect(isTopupEligible('pro', null, 'sub_1')).toBe(true)
    expect(isTopupEligible('business', undefined, 'sub_1')).toBe(true)
    expect(isTopupEligible('pro', null, null)).toBe(false)
    expect(isTopupEligible('pro', null)).toBe(false)
    expect(isTopupEligible('pro', null, '')).toBe(false)
  })

  it('a free tier with a null status and a stale subscription id stays ineligible', () => {
    expect(isTopupEligible('free', null, 'sub_1')).toBe(false)
  })
})
