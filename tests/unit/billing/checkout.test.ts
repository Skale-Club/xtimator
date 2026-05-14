import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock modules before importing the route
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn(),
}))

// Set required env vars
vi.stubEnv('STRIPE_PRICE_PRO', 'price_pro_test')
vi.stubEnv('STRIPE_PRICE_BUSINESS', 'price_biz_test')
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.test')

const { createClient } = await import('@/lib/supabase/server')
const { getStripeClient } = await import('@/lib/billing/stripe-client')
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
  companyData: { id: string; stripe_customer_id: string | null } | null
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
      single: vi.fn().mockResolvedValue({
        data: companyData,
        error: null,
      }),
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/billing/create-checkout-session', () => {
  it('returns { url } for authenticated company with valid plan', async () => {
    const mockSupabase = makeSupabaseMock(
      { sub: 'user-1', email: 'u@test.com' },
      { id: 'company-1', stripe_customer_id: null }
    )
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    const mockStripe = {
      checkout: {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/pay/test' }),
        },
      },
    }
    vi.mocked(getStripeClient).mockResolvedValue(mockStripe as never)

    const res = await POST(makeRequest({ plan: 'pro' }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.url).toBe('https://checkout.stripe.com/pay/test')
    expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({ companyId: 'company-1', plan: 'pro' }),
      })
    )
  })

  it('returns 401 for unauthenticated requests', async () => {
    const mockSupabase = makeSupabaseMock(null, null)
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    const res = await POST(makeRequest({ plan: 'pro' }))
    expect(res.status).toBe(401)
  })

  it('returns 400 when company is not found', async () => {
    const mockSupabase = makeSupabaseMock(
      { sub: 'user-1', email: 'u@test.com' },
      null
    )
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    const res = await POST(makeRequest({ plan: 'pro' }))
    expect(res.status).toBe(400)
  })
})
