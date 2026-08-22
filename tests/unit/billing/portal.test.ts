import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/billing/stripe-client', () => ({ getStripeClient: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))
vi.mock('@/lib/auth/require-company-role', () => ({ requireCompanyOwner: vi.fn() }))

// NEXT_PUBLIC_APP_URL is intentionally left unstubbed — the route now builds
// return_url via getCanonicalBaseUrl() (lib/utils/site-url.ts), which falls
// through to the hardcoded https://xtimator.com fallback when no
// APP_ORIGIN/NEXT_PUBLIC_SITE_URL/NEXT_PUBLIC_APP_URL is set.

const { createClient } = await import('@/lib/supabase/server')
const { getStripeClient } = await import('@/lib/billing/stripe-client')
const { getActiveCompanyId } = await import('@/lib/queries/active-company')
const { requireCompanyOwner } = await import('@/lib/auth/require-company-role')
const { POST } = await import('@/app/api/billing/create-portal-session/route')

function makeRequest() {
  return new NextRequest('http://localhost/api/billing/create-portal-session', {
    method: 'POST',
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
      maybeSingle: vi.fn().mockResolvedValue({
        data: companyData,
        error: null,
      }),
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getActiveCompanyId).mockResolvedValue('company-1')
  vi.mocked(requireCompanyOwner).mockResolvedValue({
    userId: 'user-1',
    companyId: 'company-1',
    role: 'owner',
  } as never)
})

describe('POST /api/billing/create-portal-session', () => {
  it('returns { url } for company with stripe_customer_id', async () => {
    const mockSupabase = makeSupabaseMock(
      { sub: 'user-1', email: 'u@test.com' },
      { id: 'company-1', stripe_customer_id: 'cus_test123' }
    )
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    const mockStripe = {
      billingPortal: {
        sessions: {
          create: vi.fn().mockResolvedValue({ url: 'https://billing.stripe.com/p/test' }),
        },
      },
    }
    vi.mocked(getStripeClient).mockResolvedValue(mockStripe as never)

    const res = await POST(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.url).toBe('https://billing.stripe.com/p/test')
    expect(mockStripe.billingPortal.sessions.create).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_test123' })
    )
    // return_url resolves via getCanonicalBaseUrl() — real https origin,
    // billing settings page (FIX-3).
    const call = mockStripe.billingPortal.sessions.create.mock.calls[0][0]
    expect(call.return_url).toMatch(/^https:\/\//)
    expect(call.return_url).toContain('/settings/billing')
  })

  it('returns 400 when company has no stripe_customer_id', async () => {
    const mockSupabase = makeSupabaseMock(
      { sub: 'user-1', email: 'u@test.com' },
      { id: 'company-1', stripe_customer_id: null }
    )
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    const res = await POST(makeRequest())
    expect(res.status).toBe(400)
  })

  it('returns 401 for unauthenticated requests', async () => {
    const mockSupabase = makeSupabaseMock(null, null)
    vi.mocked(createClient).mockResolvedValue(mockSupabase as never)

    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
  })
})
