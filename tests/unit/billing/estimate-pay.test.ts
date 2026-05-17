import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * Plan 70-03 — Pay Now route tests (GREEN).
 *
 * Critical invariants:
 *   - `stripe.checkout.sessions.create(..., { stripeAccount: acct_xxx })` is
 *     called with the company's `stripe_account_id`.
 *   - `metadata.estimate_id` AND `metadata.company_id` are set so the webhook
 *     in Plan 70-04 can route the resulting `checkout.session.completed` event
 *     back to the estimate row.
 *   - `application_fee_amount` is NOT included in the payload (Stripe rejects
 *     `0`; omission means 100% of the payment goes to the connected account).
 *   - Response is a 303 redirect to the hosted Checkout URL.
 */

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
vi.stubEnv('SUPABASE_SECRET_KEY', 'sb_secret_test_local')

vi.mock('@/lib/queries/share', () => ({
  getEstimateByShareToken: vi.fn(),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(),
}))
vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn(),
}))

const { getEstimateByShareToken } = await import('@/lib/queries/share')
const { requireServiceClient } = await import('@/lib/supabase/service')
const { getStripeClient } = await import('@/lib/billing/stripe-client')
const { POST } = await import('@/app/api/estimate/[token]/pay/route')

function makeRequest(token: string) {
  return new NextRequest(`https://app.test/api/estimate/${token}/pay`, {
    method: 'POST',
  })
}

function defaultShareData() {
  return {
    estimate: {
      id: 'est_1',
      company_id: 'co_1',
      payment_status: 'unpaid',
      total_amount_cents: 50000,
      project: { name: 'Roof repair', project_type: null },
      company: { id: 'co_1' },
    },
    client: null,
  } as never
}

function makeServiceMock(
  company: { id: string; stripe_account_id: string | null; stripe_connect_status: string | null } | null
) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: company, error: null }),
    }),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/estimate/[token]/pay', () => {
  it('creates a checkout session on the connected account', async () => {
    vi.mocked(getEstimateByShareToken).mockResolvedValue(defaultShareData())
    vi.mocked(requireServiceClient).mockReturnValue(
      makeServiceMock({
        id: 'co_1',
        stripe_account_id: 'acct_abc123',
        stripe_connect_status: 'active',
      }) as never
    )
    const create = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
    vi.mocked(getStripeClient).mockResolvedValue({
      checkout: { sessions: { create } },
    } as never)

    const res = await POST(makeRequest('tok_1'), { params: Promise.resolve({ token: 'tok_1' }) })

    expect(res.status).toBe(303)
    expect(create).toHaveBeenCalledTimes(1)
    const opts = create.mock.calls[0][1]
    expect(opts).toEqual(
      expect.objectContaining({ stripeAccount: 'acct_abc123' })
    )
  })

  it('attaches estimate_id and company_id to session metadata', async () => {
    vi.mocked(getEstimateByShareToken).mockResolvedValue(defaultShareData())
    vi.mocked(requireServiceClient).mockReturnValue(
      makeServiceMock({
        id: 'co_1',
        stripe_account_id: 'acct_abc123',
        stripe_connect_status: 'active',
      }) as never
    )
    const create = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
    vi.mocked(getStripeClient).mockResolvedValue({
      checkout: { sessions: { create } },
    } as never)

    await POST(makeRequest('tok_1'), { params: Promise.resolve({ token: 'tok_1' }) })

    const payload = create.mock.calls[0][0]
    expect(payload.metadata).toEqual({ estimate_id: 'est_1', company_id: 'co_1' })
    expect(payload.payment_intent_data.metadata).toEqual({
      estimate_id: 'est_1',
      company_id: 'co_1',
    })
  })

  it('does NOT send application_fee_amount in the create payload', async () => {
    vi.mocked(getEstimateByShareToken).mockResolvedValue(defaultShareData())
    vi.mocked(requireServiceClient).mockReturnValue(
      makeServiceMock({
        id: 'co_1',
        stripe_account_id: 'acct_abc123',
        stripe_connect_status: 'active',
      }) as never
    )
    const create = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
    vi.mocked(getStripeClient).mockResolvedValue({
      checkout: { sessions: { create } },
    } as never)

    await POST(makeRequest('tok_1'), { params: Promise.resolve({ token: 'tok_1' }) })

    const payload = create.mock.calls[0][0]
    // Pitfall 2: application_fee_amount must be OMITTED entirely (Stripe rejects 0).
    expect('application_fee_amount' in payload.payment_intent_data).toBe(false)
  })

  it('returns a 303 redirect to the Checkout session URL', async () => {
    vi.mocked(getEstimateByShareToken).mockResolvedValue(defaultShareData())
    vi.mocked(requireServiceClient).mockReturnValue(
      makeServiceMock({
        id: 'co_1',
        stripe_account_id: 'acct_abc123',
        stripe_connect_status: 'active',
      }) as never
    )
    const create = vi.fn().mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/cs_test_xyz' })
    vi.mocked(getStripeClient).mockResolvedValue({
      checkout: { sessions: { create } },
    } as never)

    const res = await POST(makeRequest('tok_1'), { params: Promise.resolve({ token: 'tok_1' }) })

    expect(res.status).toBe(303)
    expect(res.headers.get('location')).toBe('https://checkout.stripe.com/c/pay/cs_test_xyz')
  })
})
