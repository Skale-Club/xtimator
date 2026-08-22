import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * WP2 owner-gate contract test.
 *
 * Every billing-surface route/action must call requireCompanyOwner(companyId)
 * and deny (403 JSON for routes, { error } for actions) BEFORE ever touching
 * Stripe, when the caller is a company member/admin (not the owner). This
 * test does not care HOW each route gets there — it only asserts the gate
 * exists on every listed surface and that denial always precedes any Stripe
 * SDK call or service-client write.
 *
 * Mirrors tests/unit/billing/checkout.test.ts's mocking style.
 */

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))
vi.mock('@/lib/auth/require-company-role', () => ({ requireCompanyOwner: vi.fn() }))
vi.mock('@/lib/demo/guard', () => ({
  demoGuardResponse: vi.fn().mockResolvedValue(null),
  assertWritable: vi.fn().mockResolvedValue(null),
}))
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: vi.fn().mockResolvedValue({
    tiers: {
      pro: { stripePriceIdMonth: 'price_pro', stripePriceIdYear: 'price_pro_year' },
      business: { stripePriceIdMonth: 'price_biz', stripePriceIdYear: 'price_biz_year' },
    },
    topUpPacks: [{ credits: 1000, priceCents: 2000 }],
    autoTopupEnabled: true,
  }),
}))
vi.mock('@/lib/billing/stripe-customer', () => ({ ensureStripeCustomer: vi.fn() }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const stripeCheckoutCreate = vi.fn()
const stripePortalCreate = vi.fn()
const stripeSubscriptionsRetrieve = vi.fn()
const stripeCustomersRetrieve = vi.fn()

vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn().mockResolvedValue({
    checkout: {
      sessions: { create: (...args: unknown[]) => stripeCheckoutCreate(...args) },
    },
    billingPortal: {
      sessions: { create: (...args: unknown[]) => stripePortalCreate(...args) },
    },
    subscriptions: {
      retrieve: (...args: unknown[]) => stripeSubscriptionsRetrieve(...args),
    },
    customers: {
      retrieve: (...args: unknown[]) => stripeCustomersRetrieve(...args),
    },
  }),
}))

const { getActiveCompanyId } = await import('@/lib/queries/active-company')
const { requireCompanyOwner } = await import('@/lib/auth/require-company-role')
const { createClient } = await import('@/lib/supabase/server')
const { requireServiceClient } = await import('@/lib/supabase/service')
const { ensureStripeCustomer } = await import('@/lib/billing/stripe-customer')

const { POST: checkoutPOST } = await import(
  '@/app/api/billing/create-checkout-session/route'
)
const { POST: topupPOST } = await import(
  '@/app/api/billing/create-topup-session/route'
)
const { POST: portalPOST } = await import(
  '@/app/api/billing/create-portal-session/route'
)
const { POST: autotopupSetupPOST } = await import(
  '@/app/api/billing/create-autotopup-setup-session/route'
)
const { saveAutoTopupSettings, disableAutoTopup } = await import(
  '@/lib/actions/auto-topup'
)

const OWNER_REQUIRED_MESSAGE = 'Only the company owner can manage billing.'

function makeSupabaseMock() {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: 'member-user', email: 'member@test.com' } },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: 'company-1',
          stripe_customer_id: 'cus_1',
          stripe_subscription_id: null,
        },
        error: null,
      }),
    }),
  }
}

function makeRequest(url: string, body?: object) {
  return new NextRequest(`http://localhost${url}`, {
    method: 'POST',
    ...(body
      ? { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }
      : {}),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
  vi.mocked(getActiveCompanyId).mockResolvedValue('company-1')
  // The caller is an authenticated MEMBER of the company, not its owner —
  // requireCompanyOwner denies every case in this file.
  vi.mocked(requireCompanyOwner).mockRejectedValue(
    new Error('forbidden: caller is not the company owner')
  )
  vi.mocked(requireServiceClient).mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: { stripe_customer_id: 'cus_1' } }),
      update: vi.fn().mockReturnThis(),
    }),
  } as never)
})

describe('WP2 billing owner gate — routes deny non-owners before touching Stripe', () => {
  it('POST /api/billing/create-checkout-session returns 403 and never calls Stripe', async () => {
    const res = await checkoutPOST(
      makeRequest('/api/billing/create-checkout-session', { plan: 'pro' })
    )
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe(OWNER_REQUIRED_MESSAGE)
    expect(stripeCheckoutCreate).not.toHaveBeenCalled()
    expect(stripePortalCreate).not.toHaveBeenCalled()
    expect(stripeSubscriptionsRetrieve).not.toHaveBeenCalled()
    expect(ensureStripeCustomer).not.toHaveBeenCalled()
  })

  it('POST /api/billing/create-topup-session returns 403 and never calls Stripe', async () => {
    const res = await topupPOST(
      makeRequest('/api/billing/create-topup-session', { packIndex: 0 })
    )
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe(OWNER_REQUIRED_MESSAGE)
    expect(stripeCheckoutCreate).not.toHaveBeenCalled()
    expect(ensureStripeCustomer).not.toHaveBeenCalled()
  })

  it('POST /api/billing/create-portal-session returns 403 and never calls Stripe', async () => {
    const res = await portalPOST(makeRequest('/api/billing/create-portal-session'))
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe(OWNER_REQUIRED_MESSAGE)
    expect(stripePortalCreate).not.toHaveBeenCalled()
  })

  it('POST /api/billing/create-autotopup-setup-session returns 403 and never calls Stripe', async () => {
    const res = await autotopupSetupPOST(
      makeRequest('/api/billing/create-autotopup-setup-session')
    )
    const body = await res.json()

    expect(res.status).toBe(403)
    expect(body.error).toBe(OWNER_REQUIRED_MESSAGE)
    expect(stripeCheckoutCreate).not.toHaveBeenCalled()
    expect(ensureStripeCustomer).not.toHaveBeenCalled()
  })

  it('saveAutoTopupSettings returns an error and never touches Stripe or the service client', async () => {
    const result = await saveAutoTopupSettings({ thresholdCredits: 200, packIndex: 0 })

    expect(result).toEqual({ error: OWNER_REQUIRED_MESSAGE })
    expect(stripeCustomersRetrieve).not.toHaveBeenCalled()
    expect(requireServiceClient).not.toHaveBeenCalled()
  })

  it('disableAutoTopup returns an error and never touches Stripe or the service client', async () => {
    const result = await disableAutoTopup()

    expect(result).toEqual({ error: OWNER_REQUIRED_MESSAGE })
    expect(requireServiceClient).not.toHaveBeenCalled()
  })
})
