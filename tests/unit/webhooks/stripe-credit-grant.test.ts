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
}))

// ------------------------------------------------------------------
// Supabase service client mock — per-table from() switch.
//   processed_stripe_events → { insert }          (dedup gate)
//   companies               → { insert, update, select }
// ------------------------------------------------------------------
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockSelect = vi.fn()
// companies select-by-stripe_subscription_id resolution (invoice.paid grant)
const mockCompanyMaybeSingle = vi.fn()

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

// ------------------------------------------------------------------
// NEW mocks the existing webhook test does not have — the Phase-113 contract.
// ------------------------------------------------------------------
// grantCredits is mocked (the contract); monthGrantKey is kept REAL so the
// invoice.paid grant produces a genuine `grant:{companyId}:{YYYY-MM}` key.
vi.mock('@/lib/billing/credit-ledger', () => ({
  grantCredits: vi.fn(),
  monthGrantKey: (companyId: string, date: Date = new Date()) =>
    `grant:${companyId}:${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
}))
vi.mock('@/lib/billing/billing-config', () => ({ getBillingConfig: vi.fn() }))

// Xphere CRM sync is fire-and-forget — stub so the grant path never hits it.
vi.mock('@/lib/integrations/xphere/dispatch', () => ({ dispatchXphereSync: vi.fn() }))

vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')

const { grantCredits } = await import('@/lib/billing/credit-ledger')
const { getBillingConfig } = await import('@/lib/billing/billing-config')
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
  mockEq.mockResolvedValue({ error: null, data: null })
  mockUpdate.mockReturnValue({ eq: mockEq })
  // companies select('id, tier').eq('stripe_subscription_id', ...).maybeSingle()
  mockCompanyMaybeSingle.mockResolvedValue({ data: { id: 'co_1', tier: 'pro' } })
  mockSelect.mockReturnValue({
    eq: vi.fn().mockReturnValue({ maybeSingle: mockCompanyMaybeSingle }),
  })
  // subscription retrieve → current_period_end (existing tier_renews_at path)
  mockSubscriptionsRetrieve.mockResolvedValue({ current_period_end: 1900000000 })
  // getBillingConfig resolves the DEFAULT_BILLING_CONFIG-shaped tier grants.
  vi.mocked(getBillingConfig).mockResolvedValue(TEST_CONFIG as never)
})

// ==================================================================
// TOPUP-01 — invoice.paid grants the per-tier monthly credit grant
// ==================================================================
describe('TOPUP-01 — invoice.paid monthly credit grant', () => {
  it('grants tiers[tier].monthlyCreditGrant via grantCredits keyed on the company-month key (Phase 142 ANN-02)', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_1',
      type: 'invoice.paid',
      data: { object: { id: 'in_test', subscription: 'sub_test' } },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(grantCredits).toHaveBeenCalledTimes(1)
    // The grant now dedups per company-month (`grant:{companyId}:{YYYY-MM}`),
    // NOT per-event ('evt_1'). The cron shares this exact key.
    expect(grantCredits).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'co_1',
        credits: 9000,
        reason: 'grant',
        idempotencyKey: expect.stringMatching(/^grant:co_1:\d{4}-\d{2}$/),
      })
    )
  })

  it('grants 0 for a free-tier company (grantCredits no-ops on <=0; assert the call shape)', async () => {
    mockCompanyMaybeSingle.mockResolvedValue({ data: { id: 'co_1', tier: 'free' } })
    mockConstructEvent.mockReturnValue({
      id: 'evt_free',
      type: 'invoice.paid',
      data: { object: { id: 'in_free', subscription: 'sub_test' } },
    })

    await POST(makeRequest())

    expect(grantCredits).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'co_1', credits: 0, reason: 'grant' })
    )
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
        idempotencyKey: 'evt_2',
      })
    )
    // credits must be the NUMBER 5000, not the string '5000'.
    expect(arg.credits).toBe(5000)
    expect(typeof arg.credits).toBe('number')
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
      expect.objectContaining({ credits: 1000, reason: 'topup' })
    )
  })

  it('a normal subscription checkout.session.completed does NOT call grantCredits (Pitfall 2 — subs grant via invoice.paid only)', async () => {
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

    expect(grantCredits).not.toHaveBeenCalled()
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
