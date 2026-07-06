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
vi.mock('@/lib/demo/guard', () => ({ demoGuardResponse: vi.fn().mockResolvedValue(null) }))

vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.test')

const { createClient } = await import('@/lib/supabase/server')
const { getStripeClient } = await import('@/lib/billing/stripe-client')
const { demoGuardResponse } = await import('@/lib/demo/guard')
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
      single: vi.fn().mockResolvedValue({ data: companyData, error: null }),
    }),
  }
}

const mockSessionCreate = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockSessionCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/autotopup-setup' })
  vi.mocked(getStripeClient).mockResolvedValue({
    checkout: { sessions: { create: mockSessionCreate } },
  } as never)
  vi.mocked(demoGuardResponse).mockResolvedValue(null)
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
})
