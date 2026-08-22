import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 116 Plan 02 — the CALIB-02 charge-on gate WIRING proof.
 *
 * `saveBillingConfig` is the SINGLE write path for `enforcementEnabled`. The gate
 * (added in Task 2) runs the REAL `validateMarginInvariant` against the incoming
 * config when `enforcementEnabled: true` and REJECTS the save (ok:false, NO upsert)
 * when the margin invariant fails. This test imports the REAL validator (it is
 * pure, no I/O) so it proves the ACTUAL gate logic, not a stub — THIS is the proof
 * the validator gates the enforcement decision (CALIB-02).
 *
 * Three groups:
 *   - REJECT a failing flip: DEFAULT_BILLING_CONFIG (pro/business FAIL the invariant)
 *     + enforcementEnabled:true → ok:false, upsert NOT called, lastUpsertPayload null.
 *   - ALLOW a passing flip: a calibrated PASSING config + enforcementEnabled:true →
 *     ok:true, upsert called once, metadata.enforcementEnabled === true.
 *   - NEVER gate an OFF save: the FAILING defaults but enforcementEnabled:false →
 *     ok:true, upsert called once (illustrative numbers are always saveable while OFF).
 *
 * Mock setup copied verbatim from billing-config-save.test.ts. NOTE: @/lib/billing/
 * calibration is deliberately NOT mocked — the real (pure) validator runs.
 */

// ---- mocks -----------------------------------------------------------------
const requireAdminMock = vi.fn(async () => ({ userId: 'admin-1', email: 'a@x.com' }))
vi.mock('@/lib/auth/admin-context', () => ({
  requireAdmin: () => requireAdminMock(),
}))

const upsertMock = vi.fn(async (): Promise<{ error: { message: string } | null }> => ({
  error: null,
}))

let lastUpsertPayload:
  | {
      provider?: string
      ciphertext?: unknown
      iv?: unknown
      auth_tag?: unknown
      metadata?: Record<string, unknown>
    }
  | null = null

// Chainable Supabase stub: svc.from(t).upsert(p, opts)
const fromMock = vi.fn((_table: string) => ({
  upsert: (
    payload: {
      provider?: string
      ciphertext?: unknown
      iv?: unknown
      auth_tag?: unknown
      metadata?: Record<string, unknown>
    },
    _opts?: { onConflict?: string }
  ) => {
    lastUpsertPayload = payload
    return upsertMock()
  },
}))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: fromMock }),
}))

vi.mock('@/lib/platform-config', () => ({
  invalidatePlatformConfig: vi.fn(),
}))

// v4.18: saveBillingConfig provisions Stripe Prices via syncAllTierPrices before
// the upsert. Mock it to echo back the config's EXISTING ids (a no-op sync) so
// NO real Stripe client is constructed while exercising the charge-on gate.
vi.mock('@/lib/billing/stripe-subscription-prices', () => ({
  syncAllTierPrices: vi.fn(async (cfg: { tiers: Record<string, { stripePriceIdMonth?: string | null; stripePriceIdYear?: string | null }> }) => ({
    pro: { month: cfg.tiers.pro.stripePriceIdMonth ?? null, year: cfg.tiers.pro.stripePriceIdYear ?? null },
    business: { month: cfg.tiers.business.stripePriceIdMonth ?? null, year: cfg.tiers.business.stripePriceIdYear ?? null },
  })),
}))

vi.mock('@/lib/billing/stripe-display-prices', () => ({
  invalidateStripeDisplayPricesCache: vi.fn(),
}))

vi.mock('@/lib/admin/audit-log', () => ({
  logAdminAction: vi.fn(async () => undefined),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

// ---- imports under test (after mocks) --------------------------------------
import { saveBillingConfig } from '@/app/admin/integrations/actions'
import { DEFAULT_BILLING_CONFIG } from '@/lib/billing/billing-config'

// A calibrated config that PASSES validateMarginInvariant on the priced tiers:
//   pro: grant 1000 × 0.01 / 4.5 = $2.22 real cost; price $29 → ratio ~0.077 ≤ 0.30 PASS
//   business: grant 3000 × 0.01 / 4.5 = $6.67 real cost; price $99 → ratio ~0.067 ≤ 0.30 PASS
const PASSING_ON = {
  ...DEFAULT_BILLING_CONFIG,
  enforcementEnabled: true,
  tiers: {
    ...DEFAULT_BILLING_CONFIG.tiers,
    pro: { ...DEFAULT_BILLING_CONFIG.tiers.pro, monthlyCreditGrant: 1000, subscriptionPriceCents: 2900, includedSeats: 1, subscriptionPriceAnnualCents: 29000 },
    business: { ...DEFAULT_BILLING_CONFIG.tiers.business, monthlyCreditGrant: 3000, subscriptionPriceCents: 9900, includedSeats: 1, subscriptionPriceAnnualCents: 99000 },
  },
}

beforeEach(() => {
  requireAdminMock.mockClear()
  requireAdminMock.mockResolvedValue({ userId: 'admin-1', email: 'a@x.com' })
  upsertMock.mockClear()
  upsertMock.mockResolvedValue({ error: null })
  fromMock.mockClear()
  lastUpsertPayload = null
})

describe('charge-on gate — REJECT a failing enforcementEnabled flip (CALIB-02 proof)', () => {
  it('rejects an over-granted config + enforcementEnabled:true with ok:false and NO upsert', async () => {
    // Billing v2: the DEFAULTS are margin-safe (enforcement ships ON), so build
    // a deliberately failing fixture — pro grant 9000 → $20 real cost, 0.69 > 0.30.
    const failing = {
      ...DEFAULT_BILLING_CONFIG,
      enforcementEnabled: true,
      tiers: {
        ...DEFAULT_BILLING_CONFIG.tiers,
        pro: { ...DEFAULT_BILLING_CONFIG.tiers.pro, monthlyCreditGrant: 9000, subscriptionPriceCents: 2900, includedSeats: 1, subscriptionPriceAnnualCents: 29000 },
      },
    }
    const res = await saveBillingConfig(failing)
    expect(res.ok).toBe(false)
    if (!res.ok) {
      // message must mention the failing tier(s)/margin so the operator can fix it.
      expect(res.message).toMatch(/pro|business|margin/i)
    }
    expect(upsertMock).not.toHaveBeenCalled()
    expect(lastUpsertPayload).toBeNull()
  })

  it('rejects the illustrative DEFAULTS by the annual leg (the shipped annual price is still an uncalibrated placeholder — see lib/billing/calibration.ts)', async () => {
    const res = await saveBillingConfig({ ...DEFAULT_BILLING_CONFIG, enforcementEnabled: true })
    expect(res.ok).toBe(false)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('accepts a config whose ANNUAL price also passes the margin invariant with enforcementEnabled:true', async () => {
    // Same grants as PASSING_ON below (monthly leg passes at the default
    // prices) — this proves the annual leg passes too under the default
    // annual prices ($290/$990) once the grant is calibrated down.
    const marginSafeBothLegs = {
      ...DEFAULT_BILLING_CONFIG,
      enforcementEnabled: true,
      tiers: {
        ...DEFAULT_BILLING_CONFIG.tiers,
        pro: { ...DEFAULT_BILLING_CONFIG.tiers.pro, monthlyCreditGrant: 1000 },
        business: { ...DEFAULT_BILLING_CONFIG.tiers.business, monthlyCreditGrant: 3000 },
      },
    }
    const res = await saveBillingConfig(marginSafeBothLegs)
    expect(res.ok).toBe(true)
    expect(upsertMock).toHaveBeenCalledTimes(1)
  })
})

describe('charge-on gate — ALLOW a passing enforcementEnabled flip', () => {
  it('upserts a calibrated PASSING config with enforcementEnabled:true', async () => {
    const res = await saveBillingConfig(PASSING_ON)
    expect(res.ok).toBe(true)
    expect(upsertMock).toHaveBeenCalledTimes(1)
    expect(lastUpsertPayload?.metadata?.enforcementEnabled).toBe(true)
  })
})

describe('charge-on gate — NEVER gate an enforcement-OFF save', () => {
  it('upserts the FAILING defaults when enforcementEnabled:false (illustrative numbers always saveable)', async () => {
    const res = await saveBillingConfig({ ...DEFAULT_BILLING_CONFIG, enforcementEnabled: false })
    expect(res.ok).toBe(true)
    expect(upsertMock).toHaveBeenCalledTimes(1)
    expect(lastUpsertPayload?.metadata?.enforcementEnabled).toBe(false)
  })
})
