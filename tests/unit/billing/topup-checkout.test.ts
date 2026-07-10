import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Phase 113 Wave-0 (RED) — top-up checkout route (TOPUP-02 route side).
 *
 * Route under test (lands in Plan 113-02):
 *   app/api/billing/create-topup-session/route.ts  (does NOT exist yet)
 *
 * Mirrors tests/unit/billing/checkout.test.ts: createClient mock +
 * getStripeClient mock returning { checkout: { sessions: { create } } }, plus a
 * demoGuardResponse mock (null = not blocked) and getBillingConfig (topUpPacks).
 *
 * RED driver: the import of the not-yet-created route module fails collection.
 * That module-not-found IS the expected Wave-0 RED state — the import is the
 * contract; 113-02 creates the route to flip it green. The cases below assert
 * the EXACT mode:'payment' inline-price session shape Wave-1 must satisfy.
 *
 * No real secrets — placeholder ids only.
 */

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/billing/stripe-client', () => ({ getStripeClient: vi.fn() }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))
// Read-only demo guard: null = not blocked (mirror create-checkout-session).
vi.mock('@/lib/demo/guard', () => ({ demoGuardResponse: vi.fn().mockResolvedValue(null) }))
// topUpPacks the route reads to build the inline price_data.
vi.mock('@/lib/billing/billing-config', () => ({ getBillingConfig: vi.fn() }))

vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.test')

const { createClient } = await import('@/lib/supabase/server')
const { getStripeClient } = await import('@/lib/billing/stripe-client')
const { getActiveCompanyId } = await import('@/lib/queries/active-company')
const { getBillingConfig } = await import('@/lib/billing/billing-config')
// This import drives RED — the route does not exist yet (113-02 creates it).
const { POST } = await import('@/app/api/billing/create-topup-session/route')

const TOPUP_PACKS = [
  { credits: 1300, priceCents: 2000 },
  { credits: 3500, priceCents: 5000 },
  { credits: 7500, priceCents: 10000 },
]

function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/billing/create-topup-session', {
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
  vi.mocked(getBillingConfig).mockResolvedValue({ topUpPacks: TOPUP_PACKS } as never)
  mockSessionCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/topup' })
  vi.mocked(getStripeClient).mockResolvedValue({
    checkout: { sessions: { create: mockSessionCreate } },
  } as never)
})

describe('POST /api/billing/create-topup-session (TOPUP-02 route)', () => {
  it("returns { url } and creates a mode:'payment' session for a valid packIndex", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock(
        { sub: 'user-1', email: 'u@test.com' },
        { id: 'co_1', stripe_customer_id: null }
      ) as never
    )

    const res = await POST(makeRequest({ packIndex: 1 }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.url).toBe('https://checkout.stripe.com/pay/topup')
    expect(mockSessionCreate).toHaveBeenCalledTimes(1)

    const arg = mockSessionCreate.mock.calls[0][0]
    expect(arg.mode).toBe('payment')
    expect(arg.line_items[0].price_data.unit_amount).toBe(5000)
    expect(arg.line_items[0].price_data.currency).toBe('usd')
    // Inline price_data ONLY — never a pre-created Price id.
    expect(arg.line_items[0]).not.toHaveProperty('price')
    expect(arg.metadata.type).toBe('credit_topup')
    expect(arg.metadata.companyId).toBe('co_1')
    // credits travels as a STRING in metadata (Stripe metadata is string-only).
    expect(arg.metadata.credits).toBe('3500')
  })

  it("creates a session for packIndex: 2 (the $100 pack)", async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock(
        { sub: 'user-1', email: 'u@test.com' },
        { id: 'co_1', stripe_customer_id: null }
      ) as never
    )

    const res = await POST(makeRequest({ packIndex: 2 }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.url).toBe('https://checkout.stripe.com/pay/topup')
    expect(mockSessionCreate).toHaveBeenCalledTimes(1)

    const arg = mockSessionCreate.mock.calls[0][0]
    expect(arg.mode).toBe('payment')
    expect(arg.line_items[0].price_data.unit_amount).toBe(10000)
    expect(arg.line_items[0].price_data.currency).toBe('usd')
    expect(arg.line_items[0]).not.toHaveProperty('price')
    expect(arg.metadata.type).toBe('credit_topup')
    expect(arg.metadata.companyId).toBe('co_1')
    expect(arg.metadata.credits).toBe('7500')
  })

  it('rejects an out-of-range packIndex with 400', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeSupabaseMock(
        { sub: 'user-1', email: 'u@test.com' },
        { id: 'co_1', stripe_customer_id: null }
      ) as never
    )

    const res = await POST(makeRequest({ packIndex: 99 }))

    expect(res.status).toBe(400)
    expect(mockSessionCreate).not.toHaveBeenCalled()
  })

  it('returns 401 when unauthenticated', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabaseMock(null, null) as never)

    const res = await POST(makeRequest({ packIndex: 1 }))

    expect(res.status).toBe(401)
  })
})
