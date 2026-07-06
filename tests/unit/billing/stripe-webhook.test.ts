import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Stripe mock: class-based so constructors work (Phase 08 pattern)
const mockConstructEvent = vi.fn()
const mockSubscriptionsRetrieve = vi.fn()
// Phase 153 Plan 03 (CREDITUI-07): autotopup_setup arm mocks.
const mockSetupIntentRetrieve = vi.fn()
const mockCustomersUpdate = vi.fn()

vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn().mockResolvedValue({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
    setupIntents: { retrieve: mockSetupIntentRetrieve },
    customers: { update: mockCustomersUpdate },
  }),
}))

const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockInsert = vi.fn()
// customer.subscription.deleted now resolves the company BEFORE clearing the
// subscription id via svc.from('companies').select('id').eq(...).maybeSingle().
// Provide the select chain so the handler doesn't throw "select is not a function".
const mockMaybeSingle = vi.fn()
const mockSelect = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn().mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'processed_stripe_events') {
        return { insert: mockInsert }
      }
      return { insert: mockInsert, update: mockUpdate, select: mockSelect }
    }),
  }),
}))

vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')

const { POST } = await import('@/app/api/webhooks/stripe/route')

function makeRequest(body = '{}') {
  return new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body,
    headers: {
      'stripe-signature': 'sig_test',
      'Content-Type': 'application/json',
    },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: dedup insert succeeds (no duplicate)
  mockInsert.mockResolvedValue({ error: null })
  // Default: update chain returns eq which resolves cleanly
  mockEq.mockResolvedValue({ error: null })
  mockUpdate.mockReturnValue({ eq: mockEq })
  // Default: select('id').eq(...).maybeSingle() resolves to no matching company
  // (the deleted-subscription pre-lookup); keeps the handler off the CRM path.
  mockMaybeSingle.mockResolvedValue({ data: null })
  mockSelect.mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }) })
  // Phase 153 Plan 03 defaults.
  mockSetupIntentRetrieve.mockResolvedValue({ payment_method: 'pm_test' })
  mockCustomersUpdate.mockResolvedValue({})
})

describe('POST /api/webhooks/stripe — signature verification (STRIPE-02)', () => {
  it('rejects requests with invalid signature — returns 400', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('No signatures found')
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(400)
  })

  it('accepts requests with valid Stripe signature', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_ok',
      type: 'unknown_event',
      data: { object: {} },
    })
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
  })
})

describe('POST /api/webhooks/stripe — checkout.session.completed (STRIPE-02)', () => {
  it('updates companies.tier, stripe_customer_id, stripe_subscription_id, clears tier_trial_ends_at', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_checkout',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test',
          mode: 'subscription',
          customer: 'cus_123',
          subscription: 'sub_456',
          metadata: { companyId: 'company-abc', plan: 'pro' },
        },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'pro',
        stripe_customer_id: 'cus_123',
        stripe_subscription_id: 'sub_456',
        tier_trial_ends_at: null,
      })
    )
  })

  it('sets tier=business from session.metadata.plan', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_checkout_biz',
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          customer: 'cus_biz',
          subscription: 'sub_biz',
          metadata: { companyId: 'company-biz', plan: 'business' },
        },
      },
    })

    await POST(makeRequest())

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ tier: 'business' })
    )
  })
})

describe('POST /api/webhooks/stripe — checkout.session.completed autotopup_setup (CREDITUI-07)', () => {
  it('retrieves the SetupIntent and sets the customer default_payment_method', async () => {
    mockSetupIntentRetrieve.mockResolvedValue({ payment_method: 'pm_new_default' })

    mockConstructEvent.mockReturnValue({
      id: 'evt_autotopup_setup',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_setup_test',
          mode: 'setup',
          customer: 'cus_autotopup',
          setup_intent: 'seti_test',
          metadata: { type: 'autotopup_setup', companyId: 'company-autotopup' },
        },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(mockSetupIntentRetrieve).toHaveBeenCalledWith('seti_test')
    expect(mockCustomersUpdate).toHaveBeenCalledWith('cus_autotopup', {
      invoice_settings: { default_payment_method: 'pm_new_default' },
    })
  })

  it('does NOT fall through to the subscription-mode companies.update call (Pitfall 1 regression guard)', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_autotopup_setup_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_setup_test_2',
          mode: 'setup',
          customer: 'cus_autotopup_2',
          setup_intent: 'seti_test_2',
          metadata: { type: 'autotopup_setup', companyId: 'company-autotopup-2' },
        },
      },
    })

    await POST(makeRequest())

    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('POST /api/webhooks/stripe — invoice.paid (STRIPE-02)', () => {
  it('updates tier_renews_at from subscription.current_period_end', async () => {
    const periodEnd = 1800000000 // unix timestamp
    mockSubscriptionsRetrieve.mockResolvedValue({ current_period_end: periodEnd })

    mockConstructEvent.mockReturnValue({
      id: 'evt_invoice_paid',
      type: 'invoice.paid',
      data: {
        object: { id: 'in_test', subscription: 'sub_456' },
      },
    })

    await POST(makeRequest())

    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_456')
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tier_renews_at: new Date(periodEnd * 1000).toISOString(),
      })
    )
  })
})

describe('POST /api/webhooks/stripe — invoice.payment_failed (STRIPE-02)', () => {
  it('returns 200 without calling companies.update (Stripe dunning handles retries)', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_payment_failed',
      type: 'invoice.payment_failed',
      data: { object: { id: 'in_failed' } },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

describe('POST /api/webhooks/stripe — customer.subscription.deleted (STRIPE-02)', () => {
  it('sets tier=free, clears stripe_subscription_id and tier_renews_at', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_sub_deleted',
      type: 'customer.subscription.deleted',
      data: { object: { id: 'sub_456' } },
    })

    await POST(makeRequest())

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'free',
        stripe_subscription_id: null,
        tier_renews_at: null,
      })
    )
    expect(mockUpdate.mock.calls[0][0]).toHaveProperty('tier_cancelled_at')
  })
})

describe('POST /api/webhooks/stripe — idempotency (STRIPE-04)', () => {
  it('returns 200 without re-processing when event_id already exists', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_duplicate',
      type: 'checkout.session.completed',
      data: {
        object: {
          mode: 'subscription',
          customer: 'cus_dup',
          subscription: 'sub_dup',
          metadata: { companyId: 'company-dup', plan: 'pro' },
        },
      },
    })

    // First call inserts successfully
    mockInsert.mockResolvedValueOnce({ error: null })
    await POST(makeRequest())
    const firstCallUpdateCount = mockUpdate.mock.calls.length

    // Second call — duplicate event_id
    mockInsert.mockResolvedValueOnce({ error: { code: '23505', message: 'duplicate key' } })
    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    // No additional update calls made for the duplicate
    expect(mockUpdate.mock.calls.length).toBe(firstCallUpdateCount)
  })
})
