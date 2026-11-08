import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest } from 'next/server'

/**
 * Phase 113 Wave-0 (RED) — credit-grant arm of the PLATFORM Stripe webhook.
 *
 * Implementation under test (lands in Plan 113-02):
 *   - app/api/webhooks/stripe/route.ts (handlePlatformEvent)
 *       invoice.paid           → grantCredits(tiers[tier].monthlyCreditGrant) [TOPUP-01]
 *       checkout.session.completed + metadata.type='credit_topup' → grantCredits(topup) [TOPUP-02]
 *   - lib/billing/credit-ledger.ts  grantCredits (MOCKED here — the contract)
 *   - lib/billing/billing-config.ts getBillingConfig (MOCKED here — tier grant numbers)
 *
 * These tests are RED on purpose: route.ts does not yet call grantCredits. They
 * flip GREEN when 113-02 lands the grant arm. The mock setup mirrors
 * tests/unit/billing/stripe-webhook.test.ts (class-based Stripe mock,
 * requireServiceClient per-table from() switch, beforeEach defaults) and ADDS
 * the two new module mocks that webhook test does not have yet.
 *
 * No real secrets — placeholder ids only (whsec_test, sub_test, evt_*, cs_top).
 */

// ------------------------------------------------------------------
// Stripe client mock (class-style: constructEvent + subscriptions.retrieve)
// ------------------------------------------------------------------
const mockConstructEvent = vi.fn()
const mockSubscriptionsRetrieve = vi.fn()

vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn().mockResolvedValue({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: mockSubscriptionsRetrieve },
  }),
  SEAT_ITEM_METADATA_KIND: 'seat',
  // Mirror of the real resolvePendingCancelAt (cancel_at wins; legacy
  // cancel_at_period_end falls back to the plan item's period end).
  resolvePendingCancelAt: (sub: { cancel_at?: number | null; cancel_at_period_end?: boolean; items?: { data?: Array<{ current_period_end?: number; metadata?: { kind?: string } }> } }) => {
    if (typeof sub.cancel_at === 'number' && Number.isFinite(sub.cancel_at)) {
      return new Date(sub.cancel_at * 1000).toISOString()
    }
    if (sub.cancel_at_period_end === true) {
      const items = sub.items?.data ?? []
      const planItem = items.find((it) => it?.metadata?.kind !== 'seat') ?? items[0]
      const pe = planItem?.current_period_end
      return typeof pe === 'number' && Number.isFinite(pe) ? new Date(pe * 1000).toISOString() : null
    }
    return null
  },
  // Fix 1: route.ts now imports readPeriodEnd from this module — mirror the
  // real implementation (find the PLAN item, read its current_period_end)
  // rather than leaving it undefined, which would throw on every call site.
  readPeriodEnd: (sub: { items?: { data?: Array<{ current_period_end?: number; metadata?: { kind?: string } }> } } | null | undefined) => {
    const items = sub?.items?.data ?? []
    const planItem = items.find((it) => it?.metadata?.kind !== 'seat') ?? items[0]
    const periodEnd = planItem?.current_period_end
    return typeof periodEnd === 'number' && Number.isFinite(periodEnd)
      ? new Date(periodEnd * 1000).toISOString()
      : null
  },
}))

// ------------------------------------------------------------------
// Supabase service client mock — per-table from() switch.
//   processed_stripe_events → { insert }          (dedup gate)
//   companies               → { insert, update, select }
// ------------------------------------------------------------------
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockEq = vi.fn()
// stripe_customer_id backfill (persistStripeCustomerId) chains
// .update(...).eq('id', companyId).is('stripe_customer_id', null) — attach
// .is onto the Promise mockEq returns so both the chained and directly-awaited
// call shapes work off the same mock (mirrors stripe-webhook.test.ts).
const mockIs = vi.fn()
const mockSelect = vi.fn()
// companies select-by-stripe_subscription_id resolution (invoice.paid grant)
const mockCompanyMaybeSingle = vi.fn()
// B5/Fix-3 at-most-once: on a thrown handler error, the route deletes the
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

// ------------------------------------------------------------------
// NEW mocks the existing webhook test does not have — the Phase-113 contract.
// ------------------------------------------------------------------
// The credit-ledger writers are mocked (the contract): grantCredits (top-ups),
// grantMonthlyLot (SEED-055 Phase C subscription-cycle lot) and closeMonthlyLots
// (cancellation). The window / key math has its own tests
// (credit-window.test.ts, credit-grant-no-double.test.ts).
vi.mock('@/lib/billing/credit-ledger', () => ({
  grantCredits: vi.fn(),
  grantMonthlyLot: vi.fn(),
  closeMonthlyLots: vi.fn(),
}))
vi.mock('@/lib/billing/billing-config', () => ({ getBillingConfig: vi.fn() }))

// Xphere CRM sync is fire-and-forget — stub so the grant path never hits it.
vi.mock('@/lib/integrations/xphere/dispatch', () => ({ dispatchXphereSync: vi.fn() }))

// Affiliate commission accrual — mocked so the SHOULD-FIX-3 fallback test can
// assert it fires for the resolvedCompanyId-mapped company. The real function
// never throws (see lib/affiliates/accrual.ts's own doc comment) so leaving it
// unmocked elsewhere in this file is also safe; mocking it here just makes the
// assertion possible.
vi.mock('@/lib/affiliates/accrual', () => ({ accrueCommissionForInvoice: vi.fn() }))

vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')

const { grantCredits, grantMonthlyLot, closeMonthlyLots } = await import('@/lib/billing/credit-ledger')
const { getBillingConfig } = await import('@/lib/billing/billing-config')
const { accrueCommissionForInvoice } = await import('@/lib/affiliates/accrual')
const { POST } = await import('@/app/api/webhooks/stripe/route')

// DEFAULT_BILLING_CONFIG-shaped tier grants (mirrors lib/billing/billing-config.ts).
const TEST_CONFIG = {
  tiers: {
    free: { monthlyCreditGrant: 0 },
    trial: { monthlyCreditGrant: 2000 },
    pro: { monthlyCreditGrant: 9000 },
    business: { monthlyCreditGrant: 30000 },
  },
}

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
  // mockConstructEvent returns the event object handed to makeRequest body —
  // for these tests we set the return value per-case directly.
  // Default: dedup insert succeeds (not a redelivery).
  mockInsert.mockResolvedValue({ error: null })
  mockDedupDeleteEq.mockResolvedValue({ error: null })
  mockIs.mockResolvedValue({ error: null, data: null })
  mockEq.mockImplementation(() => {
    const result: Promise<{ error: null; data: null }> & { is?: typeof mockIs } =
      Promise.resolve({ error: null, data: null })
    result.is = mockIs
    return result
  })
  mockUpdate.mockReturnValue({ eq: mockEq })
  // companies select('id, tier').eq('stripe_subscription_id', ...).maybeSingle()
  mockCompanyMaybeSingle.mockResolvedValue({ data: { id: 'co_1', tier: 'pro' } })
  mockSelect.mockReturnValue({
    eq: vi.fn().mockReturnValue({ maybeSingle: mockCompanyMaybeSingle }),
  })
  // subscription retrieve → current_period_end (existing tier_renews_at path).
  // Fix 1: current_period_end lives on the PLAN subscription item, not the
  // Subscription itself (API version 2026-04-22.dahlia) — see readPeriodEnd.
  mockSubscriptionsRetrieve.mockResolvedValue({
    items: { data: [{ current_period_end: 1900000000, price: {}, metadata: {} }] },
  })
  // getBillingConfig resolves the DEFAULT_BILLING_CONFIG-shaped tier grants.
  vi.mocked(getBillingConfig).mockResolvedValue(TEST_CONFIG as never)
})

// ==================================================================
// TOPUP-01 — invoice.paid grants the per-tier monthly credit grant
// ==================================================================
describe('TOPUP-01 — invoice.paid monthly credit grant (SEED-055 Phase C)', () => {
  // current_period_end of the beforeEach subscription fixture (the PLAN item).
  const PERIOD_END_MS = 1900000000 * 1000

  function invoiceEvent(id: string, billingReason: string | undefined, extra: Record<string, unknown> = {}) {
    return {
      id,
      type: 'invoice.paid',
      data: {
        object: {
          id: `in_${id}`,
          subscription: 'sub_test',
          ...(billingReason ? { billing_reason: billingReason } : {}),
          ...extra,
        },
      },
    }
  }

  it.each(['subscription_create', 'subscription_cycle'])(
    'billing_reason=%s grants the tier monthly lot via grantMonthlyLot(periodEnd = subscription period end)',
    async (reason) => {
      mockConstructEvent.mockReturnValue(invoiceEvent('evt_1', reason))

      const res = await POST(makeRequest())

      expect(res.status).toBe(200)
      expect(grantMonthlyLot).toHaveBeenCalledTimes(1)
      expect(grantMonthlyLot).toHaveBeenCalledWith({
        companyId: 'co_1',
        credits: 9000,
        periodEnd: new Date(PERIOD_END_MS),
        refId: 'in_evt_1',
      })
      // The legacy calendar-month grantCredits path is gone.
      expect(grantCredits).not.toHaveBeenCalled()
    }
  )

  it.each(['subscription_update', 'manual', 'subscription_threshold', 'upcoming'])(
    'billing_reason=%s does NOT grant (not a new paid month)',
    async (reason) => {
      mockConstructEvent.mockReturnValue(invoiceEvent('evt_x', reason))

      const res = await POST(makeRequest())

      expect(res.status).toBe(200)
      expect(grantMonthlyLot).not.toHaveBeenCalled()
      // ...but the rest of the arm still runs: tier_renews_at is written.
      expect(mockUpdate).toHaveBeenCalledWith({ tier_renews_at: expect.any(String) })
    }
  )

  it('a missing billing_reason does NOT grant', async () => {
    mockConstructEvent.mockReturnValue(invoiceEvent('evt_nr', undefined))
    await POST(makeRequest())
    expect(grantMonthlyLot).not.toHaveBeenCalled()
  })

  it('does not grant when the subscription retrieve produced no period end', async () => {
    mockSubscriptionsRetrieve.mockResolvedValue({ items: { data: [] } })
    mockConstructEvent.mockReturnValue(invoiceEvent('evt_np', 'subscription_cycle'))
    await POST(makeRequest())
    expect(grantMonthlyLot).not.toHaveBeenCalled()
  })

  it('passes 0 credits for a free-tier company (grantMonthlyLot no-ops on <=0; assert the call shape)', async () => {
    mockCompanyMaybeSingle.mockResolvedValue({ data: { id: 'co_1', tier: 'free' } })
    mockConstructEvent.mockReturnValue(invoiceEvent('evt_free', 'subscription_create'))

    await POST(makeRequest())

    expect(grantMonthlyLot).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'co_1', credits: 0 })
    )
  })

  it('a grant failure never turns the already-applied tier_renews_at write into a 500', async () => {
    vi.mocked(grantMonthlyLot).mockRejectedValueOnce(new Error('rpc down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockConstructEvent.mockReturnValue(invoiceEvent('evt_fail', 'subscription_cycle'))

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    warn.mockRestore()
  })

  it('redelivered invoice.paid is a no-op (processed_stripe_events 23505 short-circuits before grant)', async () => {
    // The dedup insert reports a duplicate — the handler must return 200 and never grant.
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    mockConstructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'invoice.paid',
      data: { object: { id: 'in_test', subscription: 'sub_test' } },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(grantCredits).not.toHaveBeenCalled()
    expect(grantMonthlyLot).not.toHaveBeenCalled()
  })

  // SHOULD-FIX 3 — event-ordering race: the stripe_subscription_id mapping is
  // NOT yet on the companies row (checkout.session.completed hasn't landed),
  // so the primary bySub lookup misses. The event still resolves via
  // resolvedCompanyId (here: invoice.parent.subscription_details.metadata.companyId
  // — the same signed-metadata path resolvePlatformEventCompanyId reads). The
  // fallback must update the company BY ID, grant with the shared company-month
  // key, and accrue the affiliate commission — none of those three may be
  // silently dropped just because the fast-path mapping isn't written yet.
  it('falls back to resolvedCompanyId when bySub misses: updates the company by id, grants the monthly lot, and accrues commission', async () => {
    mockCompanyMaybeSingle
      .mockResolvedValueOnce({ data: null }) // bySub (stripe_subscription_id lookup) misses
      .mockResolvedValueOnce({ data: { id: 'co_1', tier: 'pro' } }) // byId (resolvedCompanyId fallback) hits

    mockConstructEvent.mockReturnValue({
      id: 'evt_invoice_fallback',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_fallback',
          billing_reason: 'subscription_create',
          subscription: 'sub_fallback',
          customer: 'cus_fallback',
          amount_paid: 5000,
          currency: 'usd',
          parent: {
            type: 'subscription_details',
            subscription_details: {
              subscription: 'sub_fallback',
              metadata: { companyId: 'co_1' },
            },
          },
        },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    // Updated BY ID (not by stripe_subscription_id — that column is exactly
    // what's missing in this race).
    expect(mockUpdate).toHaveBeenCalledWith({ tier_renews_at: expect.any(String) })
    // Mapping backfill so future events for this subscription hit the fast path.
    expect(mockUpdate).toHaveBeenCalledWith({ stripe_subscription_id: 'sub_fallback' })
    expect(mockUpdate).toHaveBeenCalledWith({ stripe_customer_id: 'cus_fallback' })
    expect(mockIs).toHaveBeenCalledWith('stripe_subscription_id', null)
    expect(mockIs).toHaveBeenCalledWith('stripe_customer_id', null)
    // Grant — the window key is shared with checkout.session.completed and the
    // daily cron (see credit-grant-no-double.test.ts).
    expect(grantMonthlyLot).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'co_1',
        credits: 9000,
        periodEnd: new Date(1900000000 * 1000),
        refId: 'in_fallback',
      })
    )
    // Commission accrual.
    expect(accrueCommissionForInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'co_1',
        invoiceId: 'in_fallback',
        amountPaidCents: 5000,
        currency: 'usd',
      })
    )
  })
})

// ==================================================================
// TOPUP-02 (webhook arm) — checkout.session.completed top-up grant
// ==================================================================
describe('TOPUP-02 — checkout.session.completed credit_topup arm', () => {
  it("metadata.type='credit_topup' + payment_status='paid' grants a topup (credits parsed STRING→number)", async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_2',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_top',
          mode: 'payment',
          payment_status: 'paid',
          metadata: { type: 'credit_topup', companyId: 'co_1', credits: '5000' },
        },
      },
    })

    await POST(makeRequest())

    expect(grantCredits).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(grantCredits).mock.calls[0][0]
    expect(arg).toEqual(
      expect.objectContaining({
        companyId: 'co_1',
        credits: 5000,
        reason: 'topup',
        source: 'topup',
        idempotencyKey: 'evt_2',
      })
    )
    // credits must be the NUMBER 5000, not the string '5000'.
    expect(arg.credits).toBe(5000)
    expect(typeof arg.credits).toBe('number')
    // SEED-055 Phase C: top-up lots expire 3 months after purchase (the mocked
    // config carries no topupExpiryMonths -> default 3).
    expect(arg.expiresAt).toEqual(expect.any(String))
    const months = (new Date(arg.expiresAt as string).getTime() - Date.now()) / (86_400_000 * 30.4)
    expect(months).toBeGreaterThan(2.8)
    expect(months).toBeLessThan(3.2)
  })

  it("top-up arm runs BEFORE the subscription guard (mode:'payment' still grants)", async () => {
    // Proves the credit_topup arm is not blocked by the `session.mode !== 'subscription'`
    // early-break at route.ts:113 (the arm must fire for mode:'payment').
    mockConstructEvent.mockReturnValue({
      id: 'evt_top_payment',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_top2',
          mode: 'payment',
          payment_status: 'paid',
          metadata: { type: 'credit_topup', companyId: 'co_1', credits: '1000' },
        },
      },
    })

    await POST(makeRequest())

    expect(grantCredits).toHaveBeenCalledTimes(1)
    expect(grantCredits).toHaveBeenCalledWith(
      expect.objectContaining({ credits: 1000, reason: 'topup', source: 'topup' })
    )
  })

  it('a normal subscription checkout.session.completed grants the monthly lot for the retrieved period (same window key as invoice.paid)', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_sub',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_sub',
          mode: 'subscription',
          customer: 'cus_1',
          subscription: 'sub_test',
          metadata: { companyId: 'co_1', plan: 'pro' },
        },
      },
    })

    await POST(makeRequest())

    expect(grantMonthlyLot).toHaveBeenCalledTimes(1)
    expect(grantMonthlyLot).toHaveBeenCalledWith({
      companyId: 'co_1',
      credits: 9000,
      periodEnd: new Date(1900000000 * 1000),
      refId: 'cs_sub',
    })
    expect(grantCredits).not.toHaveBeenCalled()
  })

  it('checkout.session.completed does not grant when the subscription is not active/trialing yet', async () => {
    mockSubscriptionsRetrieve.mockResolvedValue({
      status: 'incomplete',
      items: { data: [{ current_period_end: 1900000000, price: {}, metadata: {} }] },
    })
    mockConstructEvent.mockReturnValue({
      id: 'evt_inc',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_inc',
          mode: 'subscription',
          customer: 'cus_1',
          subscription: 'sub_test',
          metadata: { companyId: 'co_1', plan: 'pro' },
        },
      },
    })

    await POST(makeRequest())

    expect(grantMonthlyLot).not.toHaveBeenCalled()
  })

  it('checkout.session.completed does not grant when the subscription retrieve failed (no period end)', async () => {
    mockSubscriptionsRetrieve.mockRejectedValue(new Error('stripe down'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    mockConstructEvent.mockReturnValue({
      id: 'evt_nr2',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_nr2',
          mode: 'subscription',
          customer: 'cus_1',
          subscription: 'sub_test',
          metadata: { companyId: 'co_1', plan: 'pro' },
        },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(grantMonthlyLot).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

// ==================================================================
// stripe_customer_id backfill — top-up sessions can be the FIRST Stripe
// touchpoint for a company that has never subscribed.
// ==================================================================
describe('credit_topup — stripe_customer_id backfill', () => {
  it('persists stripe_customer_id WHERE stripe_customer_id IS NULL when the session carries a customer id', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_topup_customerid',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_top3',
          mode: 'payment',
          payment_status: 'paid',
          customer: 'cus_topup_new',
          metadata: { type: 'credit_topup', companyId: 'co_1', credits: '2000' },
        },
      },
    })

    await POST(makeRequest())

    expect(mockUpdate).toHaveBeenCalledWith({ stripe_customer_id: 'cus_topup_new' })
    expect(mockIs).toHaveBeenCalledWith('stripe_customer_id', null)
  })
})

// ==================================================================
// checkout.session.async_payment_succeeded — delayed-payment methods (ACH,
// etc.) settle after Checkout completes; reuses the credit_topup grant logic.
// ==================================================================
describe('checkout.session.async_payment_succeeded — delayed-payment top-up grant', () => {
  it('grants credits via the SAME credit_topup logic once the async payment settles', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_async_paid',
      type: 'checkout.session.async_payment_succeeded',
      data: {
        object: {
          id: 'cs_async',
          mode: 'payment',
          metadata: { type: 'credit_topup', companyId: 'co_1', credits: '3000' },
        },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(grantCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'co_1',
        credits: 3000,
        reason: 'topup',
        source: 'topup',
        idempotencyKey: 'evt_async_paid',
        expiresAt: expect.any(String),
      })
    )
  })
})

// ==================================================================
// MIG-01 — parallel-run safety: the credit path is ADDITIVE, never a
// mutation of the count-based quota path (lib/quota.ts).
//
// This static-source guard reads the webhook route file and asserts:
//   - it does NOT introduce count-path gating (no 'maxEstimatesPerMonth')
//   - the only billing-gate addition is the credit grant (grantCredits)
//
// RED-tolerant: the grantCredits half passes only AFTER 113-02 wires it.
// Until then this documents the additive invariant. Flips green alongside 113-02.
// ==================================================================
describe('MIG-01 parallel-run safety', () => {
  it('Phase 113 does not import or modify lib/quota.ts count logic in the webhook route', () => {
    const routePath = resolve(
      process.cwd(),
      'app/api/webhooks/stripe/route.ts'
    )
    const src = readFileSync(routePath, 'utf8')

    // The webhook must NOT add count-path entitlement gating.
    expect(src).not.toContain('maxEstimatesPerMonth')
    // The credit path is the only billing-gate addition (green after 113-02).
    expect(src).toContain('grantCredits')
  })
})

// ==================================================================
// SEED-055 Phase C - cancellation closes the live monthly lot
// ==================================================================
describe('SEED-055 Phase C - subscription lifecycle closes the monthly lot', () => {
  beforeEach(() => {
    // Company resolved by stripe_subscription_id for the updated/deleted arms.
    mockCompanyMaybeSingle.mockResolvedValue({ data: { id: 'co_1' } })
  })

  function subEvent(type: string, status: string) {
    return {
      id: `evt_${type}_${status}`,
      type,
      data: {
        object: {
          id: 'sub_test',
          status,
          cancel_at_period_end: false,
          items: { data: [{ current_period_end: 1900000000, price: {}, metadata: {} }] },
        },
      },
    }
  }

  it('customer.subscription.deleted closes the monthly lot after the tier downgrade', async () => {
    mockConstructEvent.mockReturnValue(subEvent('customer.subscription.deleted', 'canceled'))

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({ tier: 'free' }))
    expect(closeMonthlyLots).toHaveBeenCalledTimes(1)
    expect(closeMonthlyLots).toHaveBeenCalledWith('co_1', 'sub_test')
  })

  it.each(['canceled', 'unpaid'])(
    'customer.subscription.updated with status=%s closes the monthly lot',
    async (status) => {
      mockConstructEvent.mockReturnValue(subEvent('customer.subscription.updated', status))

      const res = await POST(makeRequest())

      expect(res.status).toBe(200)
      expect(closeMonthlyLots).toHaveBeenCalledTimes(1)
      expect(closeMonthlyLots).toHaveBeenCalledWith('co_1', 'sub_test')
    }
  )

  it.each(['past_due', 'active', 'trialing', 'incomplete'])(
    'customer.subscription.updated with status=%s keeps the lot (past_due = Stripe dunning)',
    async (status) => {
      mockConstructEvent.mockReturnValue(subEvent('customer.subscription.updated', status))

      const res = await POST(makeRequest())

      expect(res.status).toBe(200)
      expect(closeMonthlyLots).not.toHaveBeenCalled()
    }
  )

  it('does not close anything when no company maps to the subscription', async () => {
    mockCompanyMaybeSingle.mockResolvedValue({ data: null })
    mockConstructEvent.mockReturnValue(subEvent('customer.subscription.deleted', 'canceled'))

    await POST(makeRequest())

    expect(closeMonthlyLots).not.toHaveBeenCalled()
  })

  it('redelivery (processed_stripe_events 23505) never closes or grants twice', async () => {
    mockInsert.mockResolvedValue({ error: { code: '23505', message: 'duplicate key' } })
    mockConstructEvent.mockReturnValue(subEvent('customer.subscription.deleted', 'canceled'))

    await POST(makeRequest())

    expect(closeMonthlyLots).not.toHaveBeenCalled()
    expect(grantMonthlyLot).not.toHaveBeenCalled()
  })
})

// ==================================================================
// SEED-055 Phase C - auto top-up webhook backstop carries the expiry
// ==================================================================
describe('SEED-055 Phase C - payment_intent.succeeded (auto_topup) grants an expiring topup lot', () => {
  it('passes a 3-month expiresAt', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_pi',
      type: 'payment_intent.succeeded',
      data: {
        object: { id: 'pi_1', metadata: { type: 'auto_topup', companyId: 'co_1', credits: '1300' } },
      },
    })

    await POST(makeRequest())

    expect(grantCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'co_1',
        credits: 1300,
        reason: 'topup',
        source: 'topup',
        idempotencyKey: 'autotopup:pi_1',
        expiresAt: expect.any(String),
      })
    )
  })

  it('honours topupExpiryMonths from the billing config', async () => {
    vi.mocked(getBillingConfig).mockResolvedValue({ ...TEST_CONFIG, topupExpiryMonths: 6 } as never)
    mockConstructEvent.mockReturnValue({
      id: 'evt_pi6',
      type: 'payment_intent.succeeded',
      data: {
        object: { id: 'pi_6', metadata: { type: 'auto_topup', companyId: 'co_1', credits: '1300' } },
      },
    })

    await POST(makeRequest())

    const arg = vi.mocked(grantCredits).mock.calls[0][0]
    const months = (new Date(arg.expiresAt as string).getTime() - Date.now()) / (86_400_000 * 30.4)
    expect(months).toBeGreaterThan(5.8)
    expect(months).toBeLessThan(6.2)
  })
})
