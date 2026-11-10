import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 153 Plan 03 (CREDITUI-07) — tenant-facing auto-top-up settings actions.
 *
 * Module under test: lib/actions/auto-topup.ts
 *
 * Covers the load-bearing server-side guards research Pitfall 2 flags:
 * saveAutoTopupSettings must independently re-verify (never trust the
 * client) that (a) the platform kill switch is on, (b) a payment method
 * actually exists on the Stripe customer, and (c) the pack index / threshold
 * are in range — before ever persisting auto_topup_enabled: true.
 */

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))
vi.mock('@/lib/auth/require-company-role', () => ({ requireCompanyOwner: vi.fn() }))
vi.mock('@/lib/demo/guard', () => ({ assertWritable: vi.fn() }))
vi.mock('@/lib/billing/billing-config', () => ({ getBillingConfig: vi.fn() }))
vi.mock('@/lib/billing/stripe-client', () => ({ getStripeClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockMaybeSingle = vi.fn()
const mockEq = vi.fn()
const mockSelect = vi.fn()
const mockUpdateEq = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn().mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: mockSelect,
      update: mockUpdate,
    }),
  }),
}))

const { createClient } = await import('@/lib/supabase/server')
const { getActiveCompanyId } = await import('@/lib/queries/active-company')
const { requireCompanyOwner } = await import('@/lib/auth/require-company-role')
const { assertWritable } = await import('@/lib/demo/guard')
const { getBillingConfig } = await import('@/lib/billing/billing-config')
const { getStripeClient } = await import('@/lib/billing/stripe-client')
const { saveAutoTopupSettings, disableAutoTopup } = await import('@/lib/actions/auto-topup')

const TOPUP_PACKS = [
  { credits: 1300, priceCents: 2000 },
  { credits: 3500, priceCents: 5000 },
  { credits: 7500, priceCents: 10000 },
]

const mockCustomersRetrieve = vi.fn()

function makeSupabaseMock(claims: { sub: string } | null) {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: { claims } }),
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()

  vi.mocked(createClient).mockResolvedValue(makeSupabaseMock({ sub: 'user-1' }) as never)
  vi.mocked(getActiveCompanyId).mockResolvedValue('company-1')
  vi.mocked(requireCompanyOwner).mockResolvedValue({
    userId: 'user-1',
    companyId: 'company-1',
    role: 'owner',
  } as never)
  vi.mocked(assertWritable).mockResolvedValue(null)
  vi.mocked(getBillingConfig).mockResolvedValue({
    autoTopupEnabled: true,
    topUpPacks: TOPUP_PACKS,
  } as never)

  mockEq.mockReturnValue({ maybeSingle: mockMaybeSingle })
  mockSelect.mockReturnValue({ eq: mockEq })
  mockMaybeSingle.mockResolvedValue({
    data: {
      stripe_customer_id: 'cus_1',
      tier: 'pro',
      stripe_subscription_status: 'active',
      stripe_subscription_id: 'sub_1',
      currency_code: 'USD',
    },
  })

  mockUpdateEq.mockResolvedValue({ error: null })
  mockUpdate.mockReturnValue({ eq: mockUpdateEq })

  mockCustomersRetrieve.mockResolvedValue({
    invoice_settings: { default_payment_method: 'pm_test' },
  })
  vi.mocked(getStripeClient).mockResolvedValue({
    customers: { retrieve: mockCustomersRetrieve },
  } as never)
})

describe('saveAutoTopupSettings (CREDITUI-07)', () => {
  it('rejects when the platform kill switch (billing_config.autoTopupEnabled) is off', async () => {
    vi.mocked(getBillingConfig).mockResolvedValue({
      autoTopupEnabled: false,
      topUpPacks: TOPUP_PACKS,
    } as never)

    const result = await saveAutoTopupSettings({ thresholdCredits: 200, packIndex: 1 })

    expect(result).toHaveProperty('error')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it.each([
    ['free tier', { tier: 'free', stripe_subscription_status: null, stripe_subscription_id: null }],
    ['pro with a canceled subscription', { tier: 'pro', stripe_subscription_status: 'canceled', stripe_subscription_id: 'sub_1' }],
  ])('rejects a non-subscriber server-side and never touches Stripe or the row: %s', async (_label, extra) => {
    mockMaybeSingle.mockResolvedValue({ data: { stripe_customer_id: 'cus_1', currency_code: 'USD', ...extra } })

    const result = await saveAutoTopupSettings({ thresholdCredits: 200, packIndex: 1 })

    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toMatch(/paid plan/i)
    expect(mockCustomersRetrieve).not.toHaveBeenCalled()
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it.each(['pro', 'business'])('allows an active %s subscriber', async (tier) => {
    mockMaybeSingle.mockResolvedValue({
      data: { stripe_customer_id: 'cus_1', tier, stripe_subscription_status: 'active', stripe_subscription_id: 'sub_1', currency_code: 'USD' },
    })

    const result = await saveAutoTopupSettings({ thresholdCredits: 200, packIndex: 1 })

    expect(result).toEqual({ success: true })
  })

  it('snapshots the BRL price for a BRL company when the pack has one', async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { stripe_customer_id: 'cus_1', tier: 'pro', stripe_subscription_status: 'active', stripe_subscription_id: 'sub_1', currency_code: 'BRL' },
    })
    vi.mocked(getBillingConfig).mockResolvedValue({
      autoTopupEnabled: true,
      brlPricingEnabled: true,
      topUpPacks: [{ credits: 1900, priceCents: 2000, priceCentsBrl: 10990 }],
    } as never)

    const result = await saveAutoTopupSettings({ thresholdCredits: 200, packIndex: 0 })

    expect(result).toEqual({ success: true })
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ auto_topup_pack_price_cents: 10990, auto_topup_pack_credits: 1900 })
    )
  })

  it('rejects when the Stripe customer has no default_payment_method, even if the client claims enabled:true (Pitfall 2)', async () => {
    mockCustomersRetrieve.mockResolvedValue({
      invoice_settings: { default_payment_method: null },
    })

    const result = await saveAutoTopupSettings({ thresholdCredits: 200, packIndex: 1 })

    expect(result).toHaveProperty('error')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects an out-of-range packIndex', async () => {
    const result = await saveAutoTopupSettings({ thresholdCredits: 200, packIndex: 99 })

    expect(result).toHaveProperty('error')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('rejects a thresholdCredits that is not a positive integer', async () => {
    const zero = await saveAutoTopupSettings({ thresholdCredits: 0, packIndex: 1 })
    const negative = await saveAutoTopupSettings({ thresholdCredits: -50, packIndex: 1 })
    const nonInteger = await saveAutoTopupSettings({ thresholdCredits: 12.5, packIndex: 1 })

    expect(zero).toHaveProperty('error')
    expect(negative).toHaveProperty('error')
    expect(nonInteger).toHaveProperty('error')
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('persists auto_topup_enabled/threshold/pack when all guards pass (happy path)', async () => {
    const result = await saveAutoTopupSettings({ thresholdCredits: 200, packIndex: 1 })

    expect(result).toEqual({ success: true })
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        auto_topup_enabled: true,
        auto_topup_threshold_credits: 200,
        auto_topup_pack_index: 1,
      })
    )
  })

  it('snapshots the selected pack price + credits so a later config reprice cannot change the charge', async () => {
    const result = await saveAutoTopupSettings({ thresholdCredits: 200, packIndex: 2 })

    expect(result).toEqual({ success: true })
    // TOPUP_PACKS[2] === { credits: 7500, priceCents: 10000 }
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        auto_topup_pack_index: 2,
        auto_topup_pack_price_cents: 10000,
        auto_topup_pack_credits: 7500,
      })
    )
  })

  it('returns the demo-blocked error when called by the shared demo session', async () => {
    vi.mocked(assertWritable).mockResolvedValue({ error: 'This is a read-only demo. Create a free account to make changes.' })

    const result = await saveAutoTopupSettings({ thresholdCredits: 200, packIndex: 1 })

    expect(result).toHaveProperty('error')
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('disableAutoTopup (CREDITUI-07)', () => {
  it('sets auto_topup_enabled: false, leaving threshold/pack_index untouched', async () => {
    const result = await disableAutoTopup()

    expect(result).toEqual({ success: true })
    expect(mockUpdate).toHaveBeenCalledWith({ auto_topup_enabled: false })
  })

  it('returns the demo-blocked error when called by the shared demo session', async () => {
    vi.mocked(assertWritable).mockResolvedValue({ error: 'This is a read-only demo. Create a free account to make changes.' })

    const result = await disableAutoTopup()

    expect(result).toHaveProperty('error')
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
