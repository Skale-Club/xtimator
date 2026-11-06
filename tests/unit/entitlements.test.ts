// tests/unit/entitlements.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// getEntitlementsForTier dynamically imports billing-config; mock getBillingConfig
// so every test is hermetic (never touches the real platform_integrations row)
// and can control the config a tier resolves against. DEFAULT_BILLING_CONFIG stays
// real (importActual) so the price_research suite below sees the true defaults.
const getBillingConfigMock = vi.fn()
vi.mock('@/lib/billing/billing-config', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/billing/billing-config')>()
  return { ...actual, getBillingConfig: () => getBillingConfigMock() }
})

import { getEntitlements, tiers, type TierName } from '@/lib/entitlements'
import { getEntitlementsForTier } from '@/lib/entitlements-server'
import { DEFAULT_BILLING_CONFIG, type BillingConfig } from '@/lib/billing/billing-config'

// Deep-clone the default config so per-test overrides never leak between tests.
function cloneConfig(): BillingConfig {
  return JSON.parse(JSON.stringify(DEFAULT_BILLING_CONFIG)) as BillingConfig
}

beforeEach(() => {
  getBillingConfigMock.mockResolvedValue(DEFAULT_BILLING_CONFIG)
})

describe('entitlements', () => {
  // SEED-055: every account has every feature from day one; plans differ only
  // by credits. The monthly estimate cap is null everywhere; the per-day count
  // is a generous anti-abuse ceiling, equal on free and pro.
  it('no tier has a monthly estimate cap (credits are the meter)', () => {
    for (const name of ['free', 'pro', 'business'] as TierName[]) {
      expect(tiers[name].maxEstimatesPerMonth).toBeNull()
    }
    expect(tiers.free.maxEstimatesPerDay).toBe(tiers.pro.maxEstimatesPerDay)
  })

  it('free carries the Pro values for every feature limit', () => {
    for (const key of [
      'maxPhotosPerEstimate',
      'maxAudioMinutesPerEstimate',
      'maxPriceResearchPerMonth',
      'priceBookEnabled',
      'whatsappEnabled',
      'pdfEnabled',
    ] as const) {
      expect(tiers.free[key], key).toBe(tiers.pro[key])
    }
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
    expect(serialized.pro.maxEstimatesPerDay).toBe(30)
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

  it('documents the per-tier research allowance: free = pro = 1000 / business null', () => {
    expect(tiers.free.maxPriceResearchPerMonth).toBe(1000)
    expect(tiers.pro.maxPriceResearchPerMonth).toBe(1000)
    expect(tiers.business.maxPriceResearchPerMonth).toBeNull()
  })

  it('getEntitlements resolves the research allowance (free 1000, business null)', () => {
    expect(getEntitlements('free').maxPriceResearchPerMonth).toBe(1000)
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

  // SEED-055: chat is for everyone - the `chatEnabled` flag no longer exists.
  it('chatEnabled is gone from every tier', () => {
    for (const name of ['free', 'pro', 'business'] as TierName[]) {
      expect('chatEnabled' in tiers[name]).toBe(false)
    }
  })

  // Billing v2: the 14-day trial tier is RETIRED — the free tier IS the trial
  // via the one-time signup credit grant. A legacy/stray 'trial' string in the
  // DB must resolve to free entitlements through the unknown-tier fallback.
  it("resolves a legacy 'trial' string to free entitlements (fallback)", () => {
    expect(getEntitlements('trial')).toEqual(tiers.free)
  })
})

// ---------------------------------------------------------------------------
// Phase 112: getEntitlementsForTier — the SERVER-SIDE authority. Reads
// billing_config.tiers[tier].entitlements (runtime-editable, no deploy) merged
// OVER the static default, so config wins per field and omitted fields fall back.
// ---------------------------------------------------------------------------
describe('getEntitlementsForTier (config-sourced, server-side authority)', () => {
  it('returns the static default when the config mirrors it (no overrides)', async () => {
    // beforeEach sets DEFAULT_BILLING_CONFIG, whose entitlements mirror the static tiers.
    await expect(getEntitlementsForTier('pro')).resolves.toEqual(tiers.pro)
    await expect(getEntitlementsForTier('free')).resolves.toEqual(tiers.free)
  })

  it('config-set values WIN per field over the static default', async () => {
    const cfg = cloneConfig()
    cfg.tiers.pro.entitlements.maxPhotosPerEstimate = 99
    cfg.tiers.pro.entitlements.maxEstimatesPerMonth = null
    getBillingConfigMock.mockResolvedValue(cfg)

    const ent = await getEntitlementsForTier('pro')
    expect(ent.maxPhotosPerEstimate).toBe(99)
    expect(ent.maxEstimatesPerMonth).toBeNull()
    // Untouched fields still resolve from the (config = static) default.
    expect(ent.maxAudioMinutesPerEstimate).toBe(tiers.pro.maxAudioMinutesPerEstimate)
  })

  it('falls back to the static default for fields the config entitlements OMIT', async () => {
    const cfg = cloneConfig()
    // A partial entitlements object (only one field) — the rest must fall through.
    ;(cfg.tiers.business as { entitlements: unknown }).entitlements = {
      maxPhotosPerEstimate: 5,
    }
    getBillingConfigMock.mockResolvedValue(cfg)

    const ent = await getEntitlementsForTier('business')
    expect(ent.maxPhotosPerEstimate).toBe(5) // config override
    // Every omitted field resolves from static business.
    expect(ent.customDomainEnabled).toBe(tiers.business.customDomainEnabled)
    expect(ent.maxEstimatesPerDay).toBe(tiers.business.maxEstimatesPerDay)
    expect(ent.maxPriceResearchPerMonth).toBe(tiers.business.maxPriceResearchPerMonth)
  })

  it('monthlyCreditGrant falls through to the static default when the config value mirrors it', async () => {
    const cfg = cloneConfig()
    cfg.tiers.pro.entitlements.maxPhotosPerEstimate = 42
    getBillingConfigMock.mockResolvedValue(cfg)
    const ent = await getEntitlementsForTier('pro')
    expect(ent.monthlyCreditGrant).toBe(tiers.pro.monthlyCreditGrant)
  })

  // CREDITFIX-04 (audit finding #5, current milestone): monthlyCreditGrant
  // used to be re-overridden with the STATIC fallback after the config
  // spread, so a super-admin editing the tier's grant in the billing panel
  // (billing_config.tiers[tier].monthlyCreditGrant) never showed up here.
  // monthlyCreditGrant lives on TierBilling, not inside the nested
  // `entitlements` sub-object, so it must be pulled in from the tier config
  // directly (not assumed to ride along with `...configured`).
  it('CONFIG WINS: an admin-edited monthlyCreditGrant flows through, not the static default', async () => {
    const cfg = cloneConfig()
    cfg.tiers.pro.monthlyCreditGrant = 9999
    getBillingConfigMock.mockResolvedValue(cfg)

    const ent = await getEntitlementsForTier('pro')
    expect(ent.monthlyCreditGrant).toBe(9999)
    expect(ent.monthlyCreditGrant).not.toBe(tiers.pro.monthlyCreditGrant)
  })

  it('CONFIG WINS: works independently per tier (business edit does not affect pro)', async () => {
    const cfg = cloneConfig()
    cfg.tiers.business.monthlyCreditGrant = 20000
    getBillingConfigMock.mockResolvedValue(cfg)

    expect((await getEntitlementsForTier('business')).monthlyCreditGrant).toBe(20000)
    expect((await getEntitlementsForTier('pro')).monthlyCreditGrant).toBe(tiers.pro.monthlyCreditGrant)
  })

  it('resolves an unknown tier to static free entitlements', async () => {
    await expect(getEntitlementsForTier('enterprise')).resolves.toEqual(tiers.free)
    await expect(getEntitlementsForTier('trial')).resolves.toEqual(tiers.free)
  })

  it('degrades to the static default when getBillingConfig throws', async () => {
    getBillingConfigMock.mockRejectedValue(new Error('service client unavailable'))
    await expect(getEntitlementsForTier('business')).resolves.toEqual(tiers.business)
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

  it('free company at the allowance (1000 prior) -> { allowed: false, remaining: 0 }', async () => {
    const { checkQuota } = await import('@/lib/quota')
    const supabase = makeResearchSupabase({ tier: 'free', priorCount: 1000 })
    const result = await checkQuota(supabase, 'company-1', 'price_research')
    expect(result.allowed).toBe(false)
    expect(result.remaining).toBe(0)
  })

  it('free company with 0 prior -> { allowed: true, remaining: 1000 }', async () => {
    const { checkQuota } = await import('@/lib/quota')
    const supabase = makeResearchSupabase({ tier: 'free', priorCount: 0 })
    const result = await checkQuota(supabase, 'company-1', 'price_research')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(1000)
  })

  it('business company (null limit) -> { allowed: true, remaining: null }', async () => {
    const { checkQuota } = await import('@/lib/quota')
    const supabase = makeResearchSupabase({ tier: 'business', priorCount: 9999 })
    const result = await checkQuota(supabase, 'company-1', 'price_research')
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBeNull()
  })
})
