import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Phase 143 Plan 01 — annual billing interval for create-checkout-session (ANN-03).
 *
 * Tests that:
 *   - billingInterval: 'year' routes to STRIPE_PRICE_PRO_ANNUAL / STRIPE_PRICE_BUSINESS_ANNUAL
 *   - Missing annual env var → 500 with env-var name in error message
 *   - billingInterval: 'month' (explicit) and absent (default) → monthly Price IDs
 *   - billing_interval is stored in both metadata and subscription_data.metadata
 *
 * Mocking pattern: follows tests/unit/billing/checkout.test.ts (vi.mock +
 * vi.stubEnv, top-level await import after mocks are registered).
 */

// ------------------------------------------------------------------
// Stripe client mock
// ------------------------------------------------------------------
const mockSessionsCreate = vi.fn()

vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn().mockResolvedValue({
    checkout: {
      sessions: {
        create: mockSessionsCreate,
      },
    },
  }),
}))

// Config price ids null → the route falls back to the STRIPE_PRICE_* env vars,
// the annual/monthly routing these cases assert.
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: vi.fn().mockResolvedValue({
    tiers: {
      pro: { stripePriceIdMonth: null, stripePriceIdYear: null },
      business: { stripePriceIdMonth: null, stripePriceIdYear: null },
    },
  }),
}))

// ------------------------------------------------------------------
// Supabase server client mock — returns authenticated user + company
// ------------------------------------------------------------------
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))

// Active-company resolver mock — returns the caller's company id.
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn() }))

// ------------------------------------------------------------------
// Demo guard mock — not blocked (returns null)
// ------------------------------------------------------------------
vi.mock('@/lib/demo/guard', () => ({
  demoGuardResponse: vi.fn().mockResolvedValue(null),
}))

// Stub required monthly env vars (always present)
vi.stubEnv('STRIPE_PRICE_PRO', 'price_test_pro')
vi.stubEnv('STRIPE_PRICE_BUSINESS', 'price_test_business')
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.test')

const { createClient } = await import('@/lib/supabase/server')
const { getActiveCompanyId } = await import('@/lib/queries/active-company')
const { POST } = await import('@/app/api/billing/create-checkout-session/route')

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function makeRequest(body: object) {
  return new NextRequest('http://localhost/api/billing/create-checkout-session', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

function makeSupabaseMock() {
  return {
    auth: {
      getClaims: vi.fn().mockResolvedValue({
        data: { claims: { sub: 'user-1', email: 'u@test.com' } },
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'co-1', stripe_customer_id: null, stripe_subscription_id: null },
        error: null,
      }),
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getActiveCompanyId).mockResolvedValue('co-1')
  vi.mocked(createClient).mockResolvedValue(makeSupabaseMock() as never)
  mockSessionsCreate.mockResolvedValue({ url: 'https://checkout.stripe.com/pay/test' })
  // Annual env vars are set per-test (or absent to test the 500 path)
  process.env.STRIPE_PRICE_PRO_ANNUAL = 'price_test_pro_annual'
  process.env.STRIPE_PRICE_BUSINESS_ANNUAL = 'price_test_business_annual'
})

afterEach(() => {
  delete process.env.STRIPE_PRICE_PRO_ANNUAL
  delete process.env.STRIPE_PRICE_BUSINESS_ANNUAL
})

// ==================================================================
// Annual interval — price ID routing
// ==================================================================
describe('annual billing interval', () => {
  it('billingInterval: year + plan: pro → uses STRIPE_PRICE_PRO_ANNUAL in line_items', async () => {
    const res = await POST(makeRequest({ plan: 'pro', billingInterval: 'year' }))
    expect(res.status).toBe(200)

    const call = mockSessionsCreate.mock.calls[0][0]
    expect(call.line_items[0].price).toBe('price_test_pro_annual')
  })

  it('billingInterval: year + plan: pro → billing_interval: year in metadata', async () => {
    await POST(makeRequest({ plan: 'pro', billingInterval: 'year' }))

    const call = mockSessionsCreate.mock.calls[0][0]
    expect(call.metadata).toEqual(
      expect.objectContaining({ billing_interval: 'year', plan: 'pro', companyId: 'co-1' })
    )
  })

  it('billingInterval: year + plan: business → uses STRIPE_PRICE_BUSINESS_ANNUAL', async () => {
    const res = await POST(makeRequest({ plan: 'business', billingInterval: 'year' }))
    expect(res.status).toBe(200)

    const call = mockSessionsCreate.mock.calls[0][0]
    expect(call.line_items[0].price).toBe('price_test_business_annual')
  })

  it('billingInterval: year with annual env unset → 500 with STRIPE_PRICE_PRO_ANNUAL in error', async () => {
    delete process.env.STRIPE_PRICE_PRO_ANNUAL
    delete process.env.STRIPE_PRICE_BUSINESS_ANNUAL

    const res = await POST(makeRequest({ plan: 'pro', billingInterval: 'year' }))
    const body = await res.json() as { error: string }

    expect(res.status).toBe(500)
    expect(body.error).toContain('STRIPE_PRICE_PRO_ANNUAL')
  })
})

// ==================================================================
// Monthly interval — retrocompat (byte-identical price path)
// ==================================================================
describe('monthly billing interval', () => {
  it('billingInterval: month → uses STRIPE_PRICE_PRO (monthly)', async () => {
    const res = await POST(makeRequest({ plan: 'pro', billingInterval: 'month' }))
    expect(res.status).toBe(200)

    const call = mockSessionsCreate.mock.calls[0][0]
    expect(call.line_items[0].price).toBe('price_test_pro')
  })

  it('billingInterval: month → billing_interval: month in metadata', async () => {
    await POST(makeRequest({ plan: 'pro', billingInterval: 'month' }))

    const call = mockSessionsCreate.mock.calls[0][0]
    expect(call.metadata).toEqual(
      expect.objectContaining({ billing_interval: 'month' })
    )
  })

  it('no billingInterval field → defaults to month (same as explicit month)', async () => {
    const res = await POST(makeRequest({ plan: 'pro' }))
    expect(res.status).toBe(200)

    const call = mockSessionsCreate.mock.calls[0][0]
    expect(call.line_items[0].price).toBe('price_test_pro')
    expect(call.metadata).toEqual(
      expect.objectContaining({ billing_interval: 'month' })
    )
  })
})

// ==================================================================
// billing_interval present in subscription_data.metadata for all cases
// ==================================================================
describe('subscription_data.metadata carries billing_interval', () => {
  it('annual checkout stores billing_interval: year in subscription_data.metadata', async () => {
    await POST(makeRequest({ plan: 'pro', billingInterval: 'year' }))

    const call = mockSessionsCreate.mock.calls[0][0]
    expect(call.subscription_data.metadata).toEqual(
      expect.objectContaining({ billing_interval: 'year', companyId: 'co-1', plan: 'pro' })
    )
  })

  it('monthly checkout stores billing_interval: month in subscription_data.metadata', async () => {
    await POST(makeRequest({ plan: 'pro', billingInterval: 'month' }))

    const call = mockSessionsCreate.mock.calls[0][0]
    expect(call.subscription_data.metadata).toEqual(
      expect.objectContaining({ billing_interval: 'month' })
    )
  })
})
