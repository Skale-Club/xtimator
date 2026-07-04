// tests/unit/entitlements.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getEntitlements, tiers, type TierName } from '@/lib/entitlements'

describe('entitlements', () => {
  // Billing v2: the free tier is CREDIT-gated (one-time signup grant → wall).
  // Count caps are null so the credit balance is the single binding limit.
  it('free tier has null count caps (credit balance is the binding limit)', () => {
    expect(tiers.free.maxEstimatesPerMonth).toBeNull()
    expect(tiers.free.maxEstimatesPerDay).toBeNull()
  })

  it('free tier has whatsappEnabled true (WhatsApp available on all plans)', () => {
    expect(tiers.free.whatsappEnabled).toBe(true)
  })

  it('business tier has unlimited monthly estimates (null, not Infinity)', () => {
    expect(tiers.business.maxEstimatesPerMonth).toBeNull()
    expect(tiers.business.maxEstimatesPerMonth).not.toBe(Infinity)
  })

  it('no tier uses Infinity — must be null for JSON safety', () => {
    const tierNames: TierName[] = ['free', 'pro', 'business']
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
    expect(serialized.free.maxEstimatesPerMonth).toBeNull()
    expect(serialized.business.maxEstimatesPerMonth).toBeNull()
    // numeric values survive
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

  // Phase 108 (RMETER-02): maxPriceResearchPerMonth on every tier.
  it('every tier has a numeric or null maxPriceResearchPerMonth', () => {
    const tierNames: TierName[] = ['free', 'pro', 'business']
    for (const name of tierNames) {
      const v = tiers[name].maxPriceResearchPerMonth
      expect(v === null || typeof v === 'number').toBe(true)
      expect(v).not.toBe(Infinity)
    }
  })

  it('documents the per-tier research allowance: free 50 / pro 1000 / business null', () => {
    expect(tiers.free.maxPriceResearchPerMonth).toBe(50)
    expect(tiers.pro.maxPriceResearchPerMonth).toBe(1000)
    expect(tiers.business.maxPriceResearchPerMonth).toBeNull()
  })

  it('getEntitlements resolves the research allowance (free 50, business null)', () => {
    expect(getEntitlements('free').maxPriceResearchPerMonth).toBe(50)
    expect(getEntitlements('business').maxPriceResearchPerMonth).toBeNull()
  })

  // Phase 112 (CREDIT-04): monthlyCreditGrant on every tier, mirroring
  // billing_config.tiers defaults (free 0 / pro 3500 / business 12000 —
  // margin-safe placeholders sized for the CALIB-02 invariant at default markup).
  // Billing v2: free's allowance is the ONE-TIME signupCreditGrant, not monthly.
  it('documents the per-tier monthly credit grant: free 0 / pro 3500 / business 12000', () => {
    expect(tiers.free.monthlyCreditGrant).toBe(0)
    expect(tiers.pro.monthlyCreditGrant).toBe(3500)
    expect(tiers.business.monthlyCreditGrant).toBe(12000)
  })

  it('every tier has a numeric monthlyCreditGrant (never Infinity)', () => {
    const tierNames: TierName[] = ['free', 'pro', 'business']
    for (const name of tierNames) {
      const v = tiers[name].monthlyCreditGrant
      expect(typeof v).toBe('number')
      expect(v).not.toBe(Infinity)
    }
  })

  it('getEntitlements falls back to free grant (0) for an unknown tier', () => {
    expect(getEntitlements('garbage').monthlyCreditGrant).toBe(0)
  })

  // Phase 126 (CHATMETER-02): chatEnabled gates the in-app chat as a Pro/Business
  // feature. free=false (the gate's whole point); pro/business=true.
  it('free tier has chatEnabled false (in-app chat is a Pro/Business feature)', () => {
    expect(tiers.free.chatEnabled).toBe(false)
  })

  it('pro tier has chatEnabled true', () => {
    expect(tiers.pro.chatEnabled).toBe(true)
  })

  it('business tier has chatEnabled true', () => {
    expect(tiers.business.chatEnabled).toBe(true)
  })

  it('getEntitlements resolves chatEnabled (free false, pro true)', () => {
    expect(getEntitlements('free').chatEnabled).toBe(false)
    expect(getEntitlements('pro').chatEnabled).toBe(true)
  })

  it('getEntitlements falls back to free chatEnabled (false) for an unknown tier', () => {
    expect(getEntitlements('garbage').chatEnabled).toBe(false)
  })

  // Billing v2: the 14-day trial tier is RETIRED — the free tier IS the trial
  // via the one-time signup credit grant. A legacy/stray 'trial' string in the
  // DB must resolve to free entitlements through the unknown-tier fallback.
  it("resolves a legacy 'trial' string to free entitlements (fallback)", () => {
    expect(getEntitlements('trial')).toEqual(tiers.free)
  })
})

// ---------------------------------------------------------------------------
// Phase 108 (RMETER-03): checkQuota gates 'price_research' against the allowance.
// ---------------------------------------------------------------------------

// We exercise the REAL getEntitlements here (no mock) so the gating reads the
// actual per-tier numbers above.
function makeResearchSupabase({
  tier = 'free',
  priorCount = 0,
}: { tier?: string; priorCount?: number } = {}) {
  const rows = Array(priorCount).fill({ id: 'x' })

  const fromMock = vi.fn().mockImplementation((table: string) => {
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { tier }, error: null }),
          }),
        }),
      }
    }
    if (table === 'usage_events') {
      // checkQuota price_research chain: .select('id').eq().eq().gte() -> rows
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({ data: rows, error: null }),
            }),
          }),
        }),
      }
    }
    return {}
  })

  return { from: fromMock } as unknown as SupabaseClient
}

describe('checkQuota price_research gating', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('free company at the allowance (50 prior) -> { allowed: false, remaining: 0 }', async () => {
    const { checkQuota } = await import('@/lib/quota')
    const supabase = makeResearchSupabase({ tier: 'free', priorCount: 50 })
    const result = await checkQuota(supabase, 'company-1', 'price_research')
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('free company with 0 prior -> { allowed: true, remaining: 50 }', async () => {
    const { checkQuota } = await import('@/lib/quota')
    const supabase = makeResearchSupabase({ tier: 'free', priorCount: 0 })
    const result = await checkQuota(supabase, 'company-1', 'price_research')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(50)
  })

  it('business company (null limit) -> { allowed: true, remaining: null }', async () => {
    const { checkQuota } = await import('@/lib/quota')
    const supabase = makeResearchSupabase({ tier: 'business', priorCount: 9999 })
    const result = await checkQuota(supabase, 'company-1', 'price_research')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBeNull()
  })
})
