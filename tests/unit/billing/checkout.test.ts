import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock modules before importing the route
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn(),
}))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))
vi.mock('@/lib/demo/guard', () => ({ demoGuardResponse: vi.fn().mockResolvedValue(null) }))

// Set required env vars
vi.stubEnv('STRIPE_PRICE_PRO', 'price_pro_test')
vi.stubEnv('STRIPE_PRICE_BUSINESS', 'price_biz_test')
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.test')

const { createClient } = await import('@/lib/supabase/server')
const { getStripeClient } = await import('@/lib/billing/stripe-client')
const { getActiveCompanyId } = await import('@/lib/queries/active-company')
const { demoGuardResponse } = await import('@/lib/demo/guard')
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
      })
    )
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
})
