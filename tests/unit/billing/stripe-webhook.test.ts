import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { notifyOps } from '@/lib/observability/ops-alert'

// Stripe mock: class-based so constructors work (Phase 08 pattern)
const mockConstructEvent = vi.fn()
const mockSubscriptionsRetrieve = vi.fn()
// Cancel-superseded-subscription safety net (checkout.session.completed arm).
const mockSubscriptionsCancel = vi.fn()
// Phase 153 Plan 03 (CREDITUI-07): autotopup_setup arm mocks.
const mockSetupIntentRetrieve = vi.fn()
const mockCustomersUpdate = vi.fn()

vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn().mockResolvedValue({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockSubscriptionsRetrieve, cancel: mockSubscriptionsCancel },
    setupIntents: { retrieve: mockSetupIntentRetrieve },
    customers: { update: mockCustomersUpdate },
  }),
}))

const mockUpdate = vi.fn()
const mockEq = vi.fn()
// stripe_customer_id backfill (persistStripeCustomerId) chains
// .update(...).eq('id', companyId).is('stripe_customer_id', null) — a
// SECOND filter after .eq(), unlike every other .update().eq() call site in
// the route, which is awaited directly. Attaching `.is` onto the Promise
// mockEq returns lets BOTH styles work off the same mock: awaited directly
// it resolves normally, and `.is(...)` is still callable on it.
const mockIs = vi.fn()
const mockInsert = vi.fn()
// customer.subscription.deleted now resolves the company BEFORE clearing the
// subscription id via svc.from('companies').select('id').eq(...).maybeSingle().
// Provide the select chain so the handler doesn't throw "select is not a function".
const mockMaybeSingle = vi.fn()
const mockSelect = vi.fn()
const mockResolutionMaybeSingle = vi.fn()
// B5 (at-most-once fix): on a thrown handler error, the route deletes the
// dedup row via .from('processed_stripe_events').delete().eq('event_id', ...).
const mockDedupDeleteEq = vi.fn()
const mockDedupDelete = vi.fn().mockImplementation(() => ({ eq: mockDedupDeleteEq }))

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn().mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'processed_stripe_events') {
        return { insert: mockInsert, delete: mockDedupDelete }
      }
      return { insert: mockInsert, update: mockUpdate, select: mockSelect }
    }),
  }),
}))

// Phase 175 (PLAT-01) test-safety: route.ts now imports notifyOps, which
// carries a dedupeKey and would otherwise attempt a real Upstash SETNX
// round-trip (this file's @/lib/supabase/service mock is module-wide and its
// Redis is unmocked).
vi.mock('@/lib/observability/ops-alert', () => ({
  notifyOps: vi.fn().mockResolvedValue(undefined),
}))

vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
// Price env vars for resolveTierFromPriceId (customer.subscription.updated arm).
vi.stubEnv('STRIPE_PRICE_PRO', 'price_pro_test')
vi.stubEnv('STRIPE_PRICE_PRO_ANNUAL', 'price_pro_annual_test')
vi.stubEnv('STRIPE_PRICE_BUSINESS', 'price_biz_test')
vi.stubEnv('STRIPE_PRICE_BUSINESS_ANNUAL', 'price_biz_annual_test')

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
  // Default: update chain returns eq which resolves cleanly — and also
  // exposes .is() for the persistStripeCustomerId chain (see mockIs above).
  mockIs.mockResolvedValue({ error: null })
  mockEq.mockImplementation(() => {
    const result: Promise<{ error: null }> & { is?: typeof mockIs } =
      Promise.resolve({ error: null })
    result.is = mockIs
    return result
  })
  mockUpdate.mockReturnValue({ eq: mockEq })
  // Default: select('id').eq(...).maybeSingle() resolves to no matching company
  // (the deleted-subscription pre-lookup); keeps the handler off the CRM path.
  mockMaybeSingle.mockResolvedValue({ data: null })
  // Phase 180: the signed-event company guard performs a read-only mapping
  // with select('id') before idempotency or handler effects.
  mockResolutionMaybeSingle.mockResolvedValue({
    data: { id: 'company-mapped' },
    error: null,
  })
  mockSelect.mockImplementation((columns: string) => ({
    eq: vi.fn().mockReturnValue({
      maybeSingle:
        columns === 'id' ? mockResolutionMaybeSingle : mockMaybeSingle,
    }),
  }))
  // Phase 153 Plan 03 defaults.
  mockSetupIntentRetrieve.mockResolvedValue({ payment_method: 'pm_test' })
  mockCustomersUpdate.mockResolvedValue({})
  mockDedupDeleteEq.mockResolvedValue({ error: null })
  mockSubscriptionsCancel.mockResolvedValue({})
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
  it('updates companies.tier, stripe_customer_id, stripe_subscription_id, clears tier_trial_ends_at AND tier_cancelled_at', async () => {
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
        // Re-subscribe after a lapse must clear the stale pending-cancel marker,
        // or page.tsx renders "plan ends on <past date>" for an active payer.
        tier_cancelled_at: null,
      })
    )
    // Phase 175 (PLAT-01): platform revenue event — DISTINCT from
    // tenant_payment_received (Stripe Connect, a customer paying a tenant).
    expect(notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'subscription_payment_received',
        dedupeKey: 'subscription_payment_received:evt_checkout',
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

    // The only companies.update call in this arm is the stripe_customer_id
    // backfill (persistStripeCustomerId) — the subscription-mode update
    // (tier, stripe_subscription_id, tier_trial_ends_at, ...) must never fire.
    expect(mockUpdate).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith({ stripe_customer_id: 'cus_autotopup_2' })
    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ stripe_subscription_id: expect.anything() })
    )
  })
})

describe('POST /api/webhooks/stripe — invoice.paid (STRIPE-02)', () => {
  it('updates tier_renews_at from subscription.current_period_end', async () => {
    const periodEnd = 1800000000 // unix timestamp
    mockSubscriptionsRetrieve.mockResolvedValue({ current_period_end: periodEnd })
    // bySub (the primary stripe_subscription_id-mapping lookup) hits — this
    // test is the normal (non-fallback) path.
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'company-invoice', tier: 'pro' } })

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
    // Phase 175 (PLAT-01): renewal payment — fired unconditionally on the
    // tier_renews_at update, not gated on the credit-grant lookup below it.
    expect(notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'subscription_payment_received',
        dedupeKey: 'subscription_payment_received:evt_invoice_paid',
      })
    )
  })
})

describe('POST /api/webhooks/stripe — at-most-once fix (B5)', () => {
  it('clears the dedup row and returns 500 when the handler throws, so a retry is NOT treated as already-processed', async () => {
    mockSubscriptionsRetrieve.mockRejectedValueOnce(new Error('transient stripe error'))
    mockConstructEvent.mockReturnValue({
      id: 'evt_invoice_paid_fails',
      type: 'invoice.paid',
      data: {
        object: { id: 'in_test_fail', subscription: 'sub_456' },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(mockDedupDelete).toHaveBeenCalled()
    expect(mockDedupDeleteEq).toHaveBeenCalledWith('event_id', 'evt_invoice_paid_fails')
    // The failure happened before the tier_renews_at update was reached.
    expect(mockUpdate).not.toHaveBeenCalled()
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

describe('POST /api/webhooks/stripe — checkout.session.completed supersede (B)', () => {
  it('cancels a DIFFERENT pre-existing subscription before overwriting the row', async () => {
    // Pre-lookup returns an existing (different) subscription on the company.
    mockMaybeSingle.mockResolvedValueOnce({ data: { stripe_subscription_id: 'sub_old' } })

    mockConstructEvent.mockReturnValue({
      id: 'evt_checkout_supersede',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_supersede',
          mode: 'subscription',
          customer: 'cus_x',
          subscription: 'sub_new',
          metadata: { companyId: 'company-x', plan: 'pro' },
        },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(mockSubscriptionsCancel).toHaveBeenCalledWith('sub_old')
    // Row still overwritten to the new subscription.
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_subscription_id: 'sub_new', tier: 'pro' })
    )
  })

  it('does NOT cancel when the pre-existing subscription is the SAME id', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { stripe_subscription_id: 'sub_same' } })

    mockConstructEvent.mockReturnValue({
      id: 'evt_checkout_same',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_same',
          mode: 'subscription',
          customer: 'cus_x',
          subscription: 'sub_same',
          metadata: { companyId: 'company-x', plan: 'pro' },
        },
      },
    })

    await POST(makeRequest())

    expect(mockSubscriptionsCancel).not.toHaveBeenCalled()
  })
})

describe('POST /api/webhooks/stripe — customer.subscription.updated (B)', () => {
  it('maps the item price to a tier and sets tier_renews_at + clears tier_cancelled_at', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'company-upd' } })
    const periodEnd = 1900000000

    mockConstructEvent.mockReturnValue({
      id: 'evt_sub_updated',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_upd',
          current_period_end: periodEnd,
          cancel_at_period_end: false,
          cancel_at: null,
          items: { data: [{ id: 'si_1', price: { id: 'price_biz_test' } }] },
        },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'business',
        tier_renews_at: new Date(periodEnd * 1000).toISOString(),
        tier_cancelled_at: null,
      })
    )
  })

  it('sets tier_cancelled_at from cancel_at when cancel_at_period_end is true', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'company-upd' } })
    const cancelAt = 1950000000

    mockConstructEvent.mockReturnValue({
      id: 'evt_sub_updated_cancel',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_upd_cancel',
          current_period_end: 1900000000,
          cancel_at_period_end: true,
          cancel_at: cancelAt,
          items: { data: [{ id: 'si_1', price: { id: 'price_pro_test' } }] },
        },
      },
    })

    await POST(makeRequest())

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        tier: 'pro',
        tier_cancelled_at: new Date(cancelAt * 1000).toISOString(),
      })
    )
  })

  it('does NOT overwrite tier when the price id is unknown', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { id: 'company-upd' } })

    mockConstructEvent.mockReturnValue({
      id: 'evt_sub_updated_unknown',
      type: 'customer.subscription.updated',
      data: {
        object: {
          id: 'sub_upd_unknown',
          current_period_end: 1900000000,
          cancel_at_period_end: false,
          cancel_at: null,
          items: { data: [{ id: 'si_1', price: { id: 'price_unknown' } }] },
        },
      },
    })

    await POST(makeRequest())

    const payload = mockUpdate.mock.calls[0][0]
    expect(payload).not.toHaveProperty('tier')
    expect(payload).toHaveProperty('tier_renews_at')
  })
})

describe('POST /api/webhooks/stripe — event-ordering race fix (resolvePlatformEventCompanyId)', () => {
  beforeEach(() => {
    // Defensive reset: earlier describe blocks in this file queue
    // mockMaybeSingle.mockResolvedValueOnce(...) values (for a DIFFERENT
    // select's columns) that the outer vi.clearAllMocks() (call-history only)
    // does not drain. These tests exercise invoice.paid's grantCompany lookup
    // (columns 'id, tier', routed to mockMaybeSingle) and must not silently
    // inherit a leftover once-value queued by an unrelated earlier test.
    mockMaybeSingle.mockReset()
    mockMaybeSingle.mockResolvedValue({ data: null })
  })

  it('resolves companyId from invoice.parent.subscription_details.metadata.companyId when DB rows are not yet written (checkout.session.completed has not landed) and updates+backfills the company BY ID', async () => {
    // Simulate the race: neither stripe_subscription_id nor stripe_customer_id
    // is on the companies row yet, so the normal DB-mapping (bySub) lookup
    // misses; the SECOND mockMaybeSingle call is invoice.paid's byId fallback
    // lookup (keyed on resolvedCompanyId), which DOES find the row.
    mockResolutionMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null }) // bySub misses
      .mockResolvedValueOnce({ data: { id: 'company-race', tier: 'pro' } }) // byId (fallback) hits
    mockSubscriptionsRetrieve.mockResolvedValue({ current_period_end: 1800000000 })

    mockConstructEvent.mockReturnValue({
      id: 'evt_race',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_race',
          subscription: 'sub_race',
          customer: 'cus_race',
          parent: {
            type: 'subscription_details',
            subscription_details: {
              subscription: 'sub_race',
              metadata: { companyId: 'company-race' },
            },
          },
        },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    // The fallback update targets the company BY ID (not by stripe_subscription_id,
    // which is exactly the column that's missing in this race).
    expect(mockUpdate).toHaveBeenCalledWith({ tier_renews_at: expect.any(String) })
    // Mapping backfill: stripe_subscription_id (WHERE-null guarded via .is()).
    expect(mockUpdate).toHaveBeenCalledWith({ stripe_subscription_id: 'sub_race' })
    // Mapping backfill: stripe_customer_id (WHERE-null guarded via .is()).
    expect(mockUpdate).toHaveBeenCalledWith({ stripe_customer_id: 'cus_race' })
    expect(mockIs).toHaveBeenCalledWith('stripe_subscription_id', null)
    expect(mockIs).toHaveBeenCalledWith('stripe_customer_id', null)
  })

  it('falls back to stripe.subscriptions.retrieve(...).metadata.companyId as a last resort when no metadata path and no DB row matches', async () => {
    mockResolutionMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockMaybeSingle
      .mockResolvedValueOnce({ data: null }) // bySub misses
      .mockResolvedValueOnce({ data: { id: 'company-fallback', tier: 'pro' } }) // byId (fallback) hits
    // First call is resolvePlatformEventCompanyId's last-resort fallback;
    // second is invoice.paid's own current_period_end read.
    mockSubscriptionsRetrieve
      .mockResolvedValueOnce({ metadata: { companyId: 'company-fallback' } })
      .mockResolvedValueOnce({ current_period_end: 1800000000 })

    mockConstructEvent.mockReturnValue({
      id: 'evt_race_2',
      type: 'invoice.paid',
      data: {
        object: { id: 'in_race_2', subscription: 'sub_race_2' },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(mockSubscriptionsRetrieve).toHaveBeenCalledWith('sub_race_2')
    expect(mockUpdate).toHaveBeenCalledWith({ tier_renews_at: expect.any(String) })
    expect(mockUpdate).toHaveBeenCalledWith({ stripe_subscription_id: 'sub_race_2' })
  })

  it('notifies ops and returns 200 (never dropping silently) when the company truly cannot be resolved by any path', async () => {
    mockResolutionMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockSubscriptionsRetrieve.mockResolvedValue({}) // no metadata.companyId anywhere

    mockConstructEvent.mockReturnValue({
      id: 'evt_unresolved',
      type: 'invoice.paid',
      data: {
        object: { id: 'in_unresolved', subscription: 'sub_unresolved' },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'stripe_event_unresolved',
        dedupeKey: 'stripe_event_unresolved:evt_unresolved',
      })
    )
    expect(mockUpdate).not.toHaveBeenCalled()
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
