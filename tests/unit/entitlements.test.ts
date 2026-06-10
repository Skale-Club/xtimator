// tests/unit/entitlements.test.ts
import { describe, it, expect } from 'vitest'
import { getEntitlements, tiers, type TierName } from '@/lib/entitlements'

describe('entitlements', () => {
  it('free tier has correct monthly limit', () => {
    expect(tiers.free.maxEstimatesPerMonth).toBe(10)
  })

  it('free tier has whatsappEnabled true (WhatsApp available on all plans)', () => {
    expect(tiers.free.whatsappEnabled).toBe(true)
  })

  it('trial tier has unlimited monthly estimates (null, not Infinity)', () => {
    expect(tiers.trial.maxEstimatesPerMonth).toBeNull()
    expect(tiers.trial.maxEstimatesPerMonth).not.toBe(Infinity)
  })

  it('business tier has unlimited monthly estimates (null, not Infinity)', () => {
    expect(tiers.business.maxEstimatesPerMonth).toBeNull()
    expect(tiers.business.maxEstimatesPerMonth).not.toBe(Infinity)
  })

  it('no tier uses Infinity — must be null for JSON safety', () => {
    const tierNames: TierName[] = ['free', 'trial', 'pro', 'business']
    for (const name of tierNames) {
      const t = tiers[name]
      expect(t.maxEstimatesPerMonth).not.toBe(Infinity)
      expect(t.maxEstimatesPerDay).not.toBe(Infinity)
    }
  })

  it('tiers are JSON-serializable without data loss', () => {
    expect(() => JSON.stringify(tiers)).not.toThrow()
    const serialized = JSON.parse(JSON.stringify(tiers))
    // null survives round-trip as null
    expect(serialized.trial.maxEstimatesPerMonth).toBeNull()
    expect(serialized.business.maxEstimatesPerMonth).toBeNull()
    // numeric values survive
    expect(serialized.free.maxEstimatesPerMonth).toBe(10)
    expect(serialized.pro.maxEstimatesPerMonth).toBe(200)
  })

  it('getEntitlements returns correct entitlements for known tier', () => {
    const result = getEntitlements('free')
    expect(result).toEqual(tiers.free)
  })

  it('getEntitlements falls back to free for unknown tier string', () => {
    const result = getEntitlements('enterprise')
    expect(result).toEqual(tiers.free)
  })

  it('pro tier has whatsappEnabled true', () => {
    expect(tiers.pro.whatsappEnabled).toBe(true)
  })

  it('business tier has customDomainEnabled true', () => {
    expect(tiers.business.customDomainEnabled).toBe(true)
  })

  it('free tier has customDomainEnabled false', () => {
    expect(tiers.free.customDomainEnabled).toBe(false)
  })
})
