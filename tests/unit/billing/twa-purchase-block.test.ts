import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const cookieStore = new Map<string, string>()
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (n: string) => (cookieStore.has(n) ? { value: cookieStore.get(n) } : undefined) }),
}))

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/billing/stripe-client', () => ({ getStripeClient: vi.fn(), SEAT_ITEM_METADATA_KIND: 'seat' }))
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: vi.fn().mockResolvedValue({
    tiers: { pro: { stripePriceIdMonth: null, stripePriceIdYear: null } },
    topUpPacks: [],
  }),
}))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))
vi.mock('@/lib/demo/guard', () => ({ demoGuardResponse: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/auth/require-company-role', () => ({ requireCompanyOwner: vi.fn() }))
vi.mock('@/lib/billing/stripe-customer', () => ({ ensureStripeCustomer: vi.fn() }))
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }))

const { createClient } = await import('@/lib/supabase/server')
const { getActiveCompanyId } = await import('@/lib/queries/active-company')
const { requireCompanyOwner } = await import('@/lib/auth/require-company-role')
const { rateLimit } = await import('@/lib/ratelimit')
const { getStripeClient } = await import('@/lib/billing/stripe-client')

const ROUTES = [
  'create-checkout-session',
  'create-topup-session',
  'create-autotopup-setup-session',
  'create-portal-session',
] as const

function req(route: string, body: object = { plan: 'pro' }) {
  return new NextRequest(`http://localhost/api/billing/${route}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function supabaseMock(signedIn = true) {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: signedIn ? { sub: 'user-1', email: 'u@test.com' } : null },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'company-1', stripe_customer_id: null, stripe_subscription_id: null },
        error: null,
      }),
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  cookieStore.clear()
  vi.mocked(getActiveCompanyId).mockResolvedValue('company-1')
  vi.mocked(requireCompanyOwner).mockResolvedValue({ userId: 'user-1', companyId: 'company-1', role: 'owner' } as never)
  vi.mocked(rateLimit).mockResolvedValue({ allowed: true, count: 1, max: 20 })
})

describe.each(ROUTES)('POST /api/billing/%s inside the Android TWA', (route) => {
  it('returns 403 twa_purchase_blocked and never reaches Stripe', async () => {
    cookieStore.set('xt_twa', '1')
    vi.mocked(createClient).mockResolvedValue(supabaseMock() as never)
    const { POST } = await import(`@/app/api/billing/${route}/route`)
    const res = await POST(req(route))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({
      error: 'Purchases are not available in the Android app.',
      code: 'twa_purchase_blocked',
    })
    expect(getStripeClient).not.toHaveBeenCalled()
  })

  it('still answers 401 first for an anonymous TWA request', async () => {
    cookieStore.set('xt_twa', '1')
    vi.mocked(createClient).mockResolvedValue(supabaseMock(false) as never)
    const { POST } = await import(`@/app/api/billing/${route}/route`)
    const res = await POST(req(route))
    expect(res.status).toBe(401)
  })

  it('does not return the TWA block without the cookie', async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseMock() as never)
    vi.mocked(getStripeClient).mockRejectedValue(new Error('stop here'))
    const { POST } = await import(`@/app/api/billing/${route}/route`)
    const res = await POST(req(route)).catch(() => null)
    if (res) {
      const body = await res.clone().json().catch(() => ({}))
      expect(body.code).not.toBe('twa_purchase_blocked')
    }
  })
})

describe('create-checkout-session plan lock and config errors', () => {
  it('rejects plan: business with 400 Invalid plan', async () => {
    vi.mocked(createClient).mockResolvedValue(supabaseMock() as never)
    const { POST } = await import('@/app/api/billing/create-checkout-session/route')
    const res = await POST(req('create-checkout-session', { plan: 'business' }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ error: 'Invalid plan' })
    expect(getStripeClient).not.toHaveBeenCalled()
  })

  it('returns 503 billing_not_configured without leaking env var names when no price resolves', async () => {
    vi.stubEnv('STRIPE_PRICE_PRO', '')
    vi.stubEnv('STRIPE_PRICE_PRO_ANNUAL', '')
    vi.mocked(createClient).mockResolvedValue(supabaseMock() as never)
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { POST } = await import('@/app/api/billing/create-checkout-session/route')
    const res = await POST(req('create-checkout-session', { plan: 'pro' }))
    const body = await res.json()
    expect(res.status).toBe(503)
    expect(body).toEqual({
      error: 'Subscriptions are not available yet. Please try again later.',
      code: 'billing_not_configured',
    })
    expect(JSON.stringify(body)).not.toMatch(/STRIPE_PRICE|env var/)
    expect(errSpy).toHaveBeenCalled()
    errSpy.mockRestore()
    vi.unstubAllEnvs()
  })
})
