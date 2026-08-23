import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock modules before importing the route
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn(),
  // WP-L extra fix (1) — the real constant, so the seat-item-skip test below
  // actually exercises the fix instead of silently degrading to items[0].
  SEAT_ITEM_METADATA_KIND: 'seat',
}))
// Config price ids null → the route falls back to the STRIPE_PRICE_* env vars,
// which is the path these cases assert. (Prefer-config-over-env is proven where
// ids are non-null; here we lock the env fallback.)
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: vi.fn().mockResolvedValue({
    tiers: {
      pro: { stripePriceIdMonth: null, stripePriceIdYear: null },
      business: { stripePriceIdMonth: null, stripePriceIdYear: null },
    },
  }),
}))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))
vi.mock('@/lib/demo/guard', () => ({ demoGuardResponse: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/auth/require-company-role', () => ({ requireCompanyOwner: vi.fn() }))
vi.mock('@/lib/billing/stripe-customer', () => ({ ensureStripeCustomer: vi.fn() }))
// FIX 3 — rate limit mock. Default allowed:true so every existing test keeps
// reaching Stripe; the dedicated 429 test below overrides it per-case.
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }))

// Set required env vars
vi.stubEnv('STRIPE_PRICE_PRO', 'price_pro_test')
vi.stubEnv('STRIPE_PRICE_BUSINESS', 'price_biz_test')
// NEXT_PUBLIC_APP_URL is intentionally left unstubbed here — the route now
// builds redirect URLs via getCanonicalBaseUrl() (lib/utils/site-url.ts),
// which falls through APP_ORIGIN / NEXT_PUBLIC_SITE_URL / NEXT_PUBLIC_APP_URL
// to the hardcoded https://xtimator.com production fallback when none are
// set — exercised for real below (no mock needed).

const { createClient } = await import('@/lib/supabase/server')
const { getStripeClient } = await import('@/lib/billing/stripe-client')
const { getActiveCompanyId } = await import('@/lib/queries/active-company')
const { demoGuardResponse } = await import('@/lib/demo/guard')
const { requireCompanyOwner } = await import('@/lib/auth/require-company-role')
const { ensureStripeCustomer } = await import('@/lib/billing/stripe-customer')
const { rateLimit } = await import('@/lib/ratelimit')
const { POST } = await import('@/app/api/billing/create-checkout-session/route')

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/billing/create-checkout-session', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeSupabaseMock(
  claimsResult: { sub: string; email: string } | null,
  companyData:
    | { id: string; stripe_customer_id: string | null; stripe_subscription_id?: string | null }
    | null
) {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: claimsResult },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: companyData,
        error: null,
      }),
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(demoGuardResponse).mockResolvedValue(null)
  vi.mocked(getActiveCompanyId).mockResolvedValue('company-1')
  vi.mocked(requireCompanyOwner).mockResolvedValue({
    userId: 'user-1',
    companyId: 'company-1',
    role: 'owner',
  } as never)
  vi.mocked(ensureStripeCustomer).mockResolvedValue('cus_ensured')
  vi.mocked(rateLimit).mockResolvedValue({ allowed: true, count: 1, max: 20 })
})

describe('POST /api/billing/create-checkout-session', () => {
  it('returns { url } (checkout) for a NEW subscriber (no existing subscription)', async () => {
    const mockSupabase = makeSupabaseMock(
      { sub: 'user-1', email: 'u@test.com' },
      { id: 'company-1', stripe_customer_id: null, stripe_subscription_id: null }
    )
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    const sessionCreate = vi
      .fn()
      .mockResolvedValue({ url: 'https://checkout.stripe.com/pay/test' })
    const mockStripe = {
      checkout: { sessions: { create: sessionCreate } },
      subscriptions: { retrieve: vi.fn(), cancel: vi.fn() },
      billingPortal: { sessions: { create: vi.fn() } },
    }
    vi.mocked(getStripeClient).mockResolvedValue(mockStripe as never)

    const res = await POST(makeRequest({ plan: 'pro' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.url).toBe('https://checkout.stripe.com/pay/test')
    expect(sessionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ companyId: 'company-1', plan: 'pro' }),
      }),
      // Fix 4b — idempotencyKey request option, so a double-click never mints
      // two Checkout Sessions.
      expect.objectContaining({ idempotencyKey: expect.stringContaining('checkout:company-1:pro:') })
    )
    // The success_url passed to Stripe resolves via getCanonicalBaseUrl() —
    // a real https origin pointing at the billing settings page (FIX-3).
    const call = sessionCreate.mock.calls[0][0]
    expect(call.success_url).toMatch(/^https:\/\//)
    expect(call.success_url).toContain('/settings/billing')
    // Never touched the portal for a fresh subscriber.
    expect(mockStripe.billingPortal.sessions.create).not.toHaveBeenCalled()
  })

  it('returns a Customer Portal update URL for an ACTIVE subscriber changing plans', async () => {
    const mockSupabase = makeSupabaseMock(
      { sub: 'user-1', email: 'u@test.com' },
      { id: 'company-1', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_existing' }
    )
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    const sessionCreate = vi.fn()
    const portalCreate = vi
      .fn()
      .mockResolvedValue({ url: 'https://billing.stripe.com/p/upgrade' })
    const mockStripe = {
      checkout: { sessions: { create: sessionCreate } },
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'sub_existing',
          status: 'active',
          items: { data: [{ id: 'si_1', price: { id: 'price_biz_test' } }] },
        }),
        cancel: vi.fn(),
      },
      billingPortal: { sessions: { create: portalCreate } },
    }
    vi.mocked(getStripeClient).mockResolvedValue(mockStripe as never)

    // target plan 'pro' (price_pro_test) differs from current item price (price_biz_test)
    const res = await POST(makeRequest({ plan: 'pro' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.url).toBe('https://billing.stripe.com/p/upgrade')
    // A fresh Checkout must NOT be created — that would double-bill.
    expect(sessionCreate).not.toHaveBeenCalled()
    expect(portalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_1',
        flow_data: expect.objectContaining({ type: 'subscription_update_confirm' }),
      })
    )
  })

  // WP-L extra fix (1) — seat billing adds a SECOND item to the subscription
  // and Stripe does not guarantee list ordering. Put the SEAT item first
  // (index 0) to prove the route selects the PLAN item explicitly rather than
  // blindly trusting items.data[0] — a regression here would swap the seat
  // item's price (dropping the seat charge and leaving two plan items).
  it('selects the PLAN item (not items.data[0]) when the seat item happens to be first', async () => {
    const mockSupabase = makeSupabaseMock(
      { sub: 'user-1', email: 'u@test.com' },
      { id: 'company-1', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_existing' }
    )
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    const sessionCreate = vi.fn()
    const portalCreate = vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/p/upgrade' })
    const mockStripe = {
      checkout: { sessions: { create: sessionCreate } },
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'sub_existing',
          status: 'active',
          items: {
            data: [
              // Seat item FIRST (index 0) — Stripe order is not guaranteed.
              { id: 'si_seat', price: { id: 'price_seat_x' }, metadata: { kind: 'seat' } },
              { id: 'si_plan', price: { id: 'price_biz_test' }, metadata: {} },
            ],
          },
        }),
        cancel: vi.fn(),
      },
      billingPortal: { sessions: { create: portalCreate } },
    }
    vi.mocked(getStripeClient).mockResolvedValue(mockStripe as never)

    const res = await POST(makeRequest({ plan: 'pro' }))

    expect(res.status).toBe(200)
    expect(portalCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        flow_data: expect.objectContaining({
          subscription_update_confirm: expect.objectContaining({
            // The PLAN item's id (si_plan), never the seat item's (si_seat).
            items: [{ id: 'si_plan', price: 'price_pro_test', quantity: 1 }],
          }),
        }),
      })
    )
  })

  it('returns 400 "Already on this plan" when the active sub already has the target price', async () => {
    const mockSupabase = makeSupabaseMock(
      { sub: 'user-1', email: 'u@test.com' },
      { id: 'company-1', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_existing' }
    )
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    const mockStripe = {
      checkout: { sessions: { create: vi.fn() } },
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'sub_existing',
          status: 'active',
          items: { data: [{ id: 'si_1', price: { id: 'price_pro_test' } }] },
        }),
        cancel: vi.fn(),
      },
      billingPortal: { sessions: { create: vi.fn() } },
    }
    vi.mocked(getStripeClient).mockResolvedValue(mockStripe as never)

    const res = await POST(makeRequest({ plan: 'pro' }))
    const body = await res.json()

    expect(res.status).toBe(400)
    expect(body.error).toBe('Already on this plan')
    expect(mockStripe.checkout.sessions.create).not.toHaveBeenCalled()
  })

  it('returns 502 and NEVER creates a fresh Checkout when both portal calls fail for a live subscriber', async () => {
    const mockSupabase = makeSupabaseMock(
      { sub: 'user-1', email: 'u@test.com' },
      { id: 'company-1', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_existing' }
    )
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    const sessionCreate = vi.fn()
    // Portal never configured: both the flow_data call and the plain fallback throw.
    const portalCreate = vi.fn().mockRejectedValue(new Error('No portal configuration found'))
    const mockStripe = {
      checkout: { sessions: { create: sessionCreate } },
      subscriptions: {
        retrieve: vi.fn().mockResolvedValue({
          id: 'sub_existing',
          status: 'active',
          items: { data: [{ id: 'si_1', price: { id: 'price_biz_test' } }] },
        }),
        cancel: vi.fn(),
      },
      billingPortal: { sessions: { create: portalCreate } },
    }
    vi.mocked(getStripeClient).mockResolvedValue(mockStripe as never)

    const res = await POST(makeRequest({ plan: 'pro' }))
    const body = await res.json()

    expect(res.status).toBe(502)
    expect(body.error).toMatch(/portal/i)
    expect(portalCreate).toHaveBeenCalledTimes(2)
    // The double-billing invariant: a live subscription must never gain a sibling.
    expect(sessionCreate).not.toHaveBeenCalled()
  })

  it('falls through to normal Checkout when retrieve fails (deleted subscription)', async () => {
    const mockSupabase = makeSupabaseMock(
      { sub: 'user-1', email: 'u@test.com' },
      { id: 'company-1', stripe_customer_id: 'cus_1', stripe_subscription_id: 'sub_gone' }
    )
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    const sessionCreate = vi
      .fn()
      .mockResolvedValue({ url: 'https://checkout.stripe.com/pay/fresh' })
    const mockStripe = {
      checkout: { sessions: { create: sessionCreate } },
      subscriptions: {
        retrieve: vi.fn().mockRejectedValue(new Error('No such subscription')),
        cancel: vi.fn(),
      },
      billingPortal: { sessions: { create: vi.fn() } },
    }
    vi.mocked(getStripeClient).mockResolvedValue(mockStripe as never)

    const res = await POST(makeRequest({ plan: 'pro' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.url).toBe('https://checkout.stripe.com/pay/fresh')
    expect(sessionCreate).toHaveBeenCalled()
  })

  it('returns 401 for unauthenticated requests', async () => {
    const mockSupabase = makeSupabaseMock(null, null)
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    const res = await POST(makeRequest({ plan: 'pro' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when company is not found', async () => {
    const mockSupabase = makeSupabaseMock({ sub: 'user-1', email: 'u@test.com' }, null)
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)
    vi.mocked(getActiveCompanyId).mockResolvedValue(null)

    const res = await POST(makeRequest({ plan: 'pro' }))
    expect(res.status).toBe(400)
  })

  it('returns 429 and never calls Stripe when the rate limit is exceeded (FIX 3)', async () => {
    const mockSupabase = makeSupabaseMock(
      { sub: 'user-1', email: 'u@test.com' },
      { id: 'company-1', stripe_customer_id: null, stripe_subscription_id: null }
    )
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)
    vi.mocked(rateLimit).mockResolvedValue({ allowed: false, count: 21, max: 20, retryAfter: 20 })

    const sessionCreate = vi.fn()
    const mockStripe = {
      checkout: { sessions: { create: sessionCreate } },
      subscriptions: { retrieve: vi.fn(), cancel: vi.fn() },
      billingPortal: { sessions: { create: vi.fn() } },
    }
    vi.mocked(getStripeClient).mockResolvedValue(mockStripe as never)

    const res = await POST(makeRequest({ plan: 'pro' }))
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.code).toBe('rate_limit:billing_session')
    expect(res.headers.get('Retry-After')).toBe('20')
    expect(sessionCreate).not.toHaveBeenCalled()
    expect(ensureStripeCustomer).not.toHaveBeenCalled()
    expect(rateLimit).toHaveBeenCalledWith('billingSessionPerHour', 'company-1')
  })
})
