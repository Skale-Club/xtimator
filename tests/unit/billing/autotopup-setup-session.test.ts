import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Phase 153 Plan 03 (CREDITUI-07) — auto-top-up payment-method-capture route.
 *
 * Route under test: app/api/billing/create-autotopup-setup-session/route.ts
 *
 * Mirrors tests/unit/billing/topup-checkout.test.ts's exact mock structure
 * (createClient mock + getStripeClient mock + demoGuardResponse mock), but
 * asserts the mode:'setup' shape (no line_items, metadata.type ===
 * 'autotopup_setup') instead of the mode:'payment' inline-price shape.
 */

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/billing/stripe-client', () => ({ getStripeClient: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))
vi.mock('@/lib/demo/guard', () => ({ demoGuardResponse: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/auth/require-company-role', () => ({ requireCompanyOwner: vi.fn() }))
vi.mock('@/lib/billing/stripe-customer', () => ({ ensureStripeCustomer: vi.fn() }))
// FIX 3 — rate limit mock. Default allowed:true so every existing test keeps
// reaching Stripe; the dedicated 429 test below overrides it per-case.
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn() }))

// NEXT_PUBLIC_APP_URL is intentionally left unstubbed — the route now builds
// success_url/cancel_url via getCanonicalBaseUrl() (lib/utils/site-url.ts),
// which falls through to the hardcoded https://xtimator.com fallback when no
// APP_ORIGIN/NEXT_PUBLIC_SITE_URL/NEXT_PUBLIC_APP_URL is set.

const { createClient } = await import('@/lib/supabase/server')
const { getStripeClient } = await import('@/lib/billing/stripe-client')
const { getActiveCompanyId } = await import('@/lib/queries/active-company')
const { demoGuardResponse } = await import('@/lib/demo/guard')
const { requireCompanyOwner } = await import('@/lib/auth/require-company-role')
const { ensureStripeCustomer } = await import('@/lib/billing/stripe-customer')
const { rateLimit } = await import('@/lib/ratelimit')
const { POST } = await import('@/app/api/billing/create-autotopup-setup-session/route')

function makeRequest() {
  return new NextRequest('http://localhost/api/billing/create-autotopup-setup-session', {
    method: 'POST',
  })
}

function makeSupabaseMock(
  claimsResult: { sub: string; email: string } | null,
  companyData: { id: string; stripe_customer_id: string | null } | null
) {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: { claims: claimsResult } }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: companyData, error: null }),
    }),
  }
}

const mockSessionCreate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getActiveCompanyId).mockResolvedValue('co_1')
  mockSessionCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/autotopup-setup' })
  vi.mocked(getStripeClient).mockResolvedValue({
    checkout: { sessions: { create: mockSessionCreate } },
  } as never)
  vi.mocked(demoGuardResponse).mockResolvedValue(null)
  vi.mocked(requireCompanyOwner).mockResolvedValue({
    userId: 'user-1',
    companyId: 'co_1',
    role: 'owner',
  } as never)
  vi.mocked(ensureStripeCustomer).mockResolvedValue('cus_ensured')
  vi.mocked(rateLimit).mockResolvedValue({ allowed: true, count: 1, max: 20 })
})

describe('POST /api/billing/create-autotopup-setup-session (CREDITUI-07)', () => {
  it("creates a mode:'setup' Checkout Session scoped to the caller's own company", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock(
        { sub: 'user-1', email: 'u@test.com' },
        { id: 'co_1', stripe_customer_id: 'cus_1' }
      ) as never
    )

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.url).toBe('https://checkout.stripe.com/pay/autotopup-setup')
    expect(mockSessionCreate).toHaveBeenCalledTimes(1)

    const arg = mockSessionCreate.mock.calls[0][0]
    expect(arg.mode).toBe('setup')
    expect(arg.metadata.type).toBe('autotopup_setup')
    expect(arg.metadata.companyId).toBe('co_1')
    // success_url resolves via getCanonicalBaseUrl() — real https origin,
    // billing settings page (FIX-3).
    expect(arg.success_url).toMatch(/^https:\/\//)
    expect(arg.success_url).toContain('/settings/billing')
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock(null, null) as never)

    const res = await POST(makeRequest())

    expect(res.status).toBe(401)
    expect(mockSessionCreate).not.toHaveBeenCalled()
  })

  it('returns a demo-blocked response when the caller is the demo session', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock(
        { sub: 'user-1', email: 'demo@test.com' },
        { id: 'co_1', stripe_customer_id: null }
      ) as never
    )
    vi.mocked(demoGuardResponse).mockResolvedValue(
      new Response(JSON.stringify({ error: 'demo_readonly' }), { status: 403 }) as never
    )

    const res = await POST(makeRequest())

    expect(res.status).toBe(403)
    expect(mockSessionCreate).not.toHaveBeenCalled()
  })

  it('includes no line_items (a setup session has none)', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock(
        { sub: 'user-1', email: 'u@test.com' },
        { id: 'co_1', stripe_customer_id: null }
      ) as never
    )

    await POST(makeRequest())

    const arg = mockSessionCreate.mock.calls[0][0]
    expect(arg.line_items).toBeUndefined()
  })

  it('returns 429 and never calls Stripe when the rate limit is exceeded (FIX 3)', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock(
        { sub: 'user-1', email: 'u@test.com' },
        { id: 'co_1', stripe_customer_id: null }
      ) as never
    )
    vi.mocked(rateLimit).mockResolvedValue({ allowed: false, count: 11, max: 10, retryAfter: 42 })

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(429)
    expect(body.code).toBe('rate_limit:billing_session')
    expect(res.headers.get('Retry-After')).toBe('42')
    expect(mockSessionCreate).not.toHaveBeenCalled()
    expect(ensureStripeCustomer).not.toHaveBeenCalled()
    expect(rateLimit).toHaveBeenCalledWith('billingSessionPerHour', 'co_1')
  })
})
