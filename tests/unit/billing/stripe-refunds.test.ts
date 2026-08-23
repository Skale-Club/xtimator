import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * STRIPE-REFUND-01 — refund/dispute reversal + checkout-arm reorder.
 *
 * Covers the NEW platform-webhook arms (charge.refunded, charge.dispute.created,
 * charge.dispute.closed) and the reordered checkout.session.completed
 * supersede-cancel (Fix 4a). Mirrors tests/unit/billing/stripe-webhook.test.ts's
 * mocking shape (class-based Stripe mock, requireServiceClient per-table from()
 * switch, beforeEach defaults) and adds the RPC mock the credit clawback needs.
 *
 * No real secrets — placeholder ids only.
 */

// ------------------------------------------------------------------
// Stripe client mock
// ------------------------------------------------------------------
const mockConstructEvent = vi.fn()
const mockPaymentIntentsRetrieve = vi.fn()
const mockChargesRetrieve = vi.fn()
const mockSubscriptionsRetrieve = vi.fn()
const mockSubscriptionsCancel = vi.fn()

vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn().mockResolvedValue({
    webhooks: { constructEvent: mockConstructEvent },
    paymentIntents: { retrieve: mockPaymentIntentsRetrieve },
    charges: { retrieve: mockChargesRetrieve },
    subscriptions: { retrieve: mockSubscriptionsRetrieve, cancel: mockSubscriptionsCancel },
  }),
  readPeriodEnd: (sub: { items?: { data?: Array<{ current_period_end?: number; metadata?: { kind?: string } }> } } | null | undefined) => {
    const items = sub?.items?.data ?? []
    const planItem = items.find((it) => it?.metadata?.kind !== 'seat') ?? items[0]
    const periodEnd = planItem?.current_period_end
    return typeof periodEnd === 'number' && Number.isFinite(periodEnd)
      ? new Date(periodEnd * 1000).toISOString()
      : null
  },
  SEAT_ITEM_METADATA_KIND: 'seat',
}))

// ------------------------------------------------------------------
// Supabase service client mock — per-table from() switch, PLUS a top-level
// .rpc() (the credit clawback calls apply_credit_ledger_entry directly, not
// through .from()).
// ------------------------------------------------------------------
const mockInsert = vi.fn()
const mockUpdate = vi.fn()
const mockEq = vi.fn()
const mockIs = vi.fn()
const mockSelect = vi.fn()
const mockMaybeSingle = vi.fn()
const mockResolutionMaybeSingle = vi.fn()
const mockRpc = vi.fn()
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
    rpc: (...args: unknown[]) => mockRpc(...args),
  }),
}))

vi.mock('@/lib/observability/ops-alert', () => ({
  notifyOps: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/affiliates/accrual', () => ({
  accrueCommissionForInvoice: vi.fn().mockResolvedValue(undefined),
  reverseCommissionForInvoice: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/lib/integrations/xphere/dispatch', () => ({ dispatchXphereSync: vi.fn() }))

vi.mock('@/lib/billing/credit-ledger', () => ({
  grantCredits: vi.fn().mockResolvedValue({ applied: true }),
  monthGrantKey: (companyId: string) => `grant:${companyId}:2026-08`,
}))

vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: vi.fn().mockResolvedValue({ tiers: { pro: { monthlyCreditGrant: 0 }, business: { monthlyCreditGrant: 0 } } }),
}))

vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')

const { notifyOps } = await import('@/lib/observability/ops-alert')
const { reverseCommissionForInvoice } = await import('@/lib/affiliates/accrual')
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
  mockInsert.mockResolvedValue({ error: null })
  mockDedupDeleteEq.mockResolvedValue({ error: null })
  mockIs.mockResolvedValue({ error: null })
  mockEq.mockImplementation(() => {
    const result: Promise<{ error: null }> & { is?: typeof mockIs } =
      Promise.resolve({ error: null })
    result.is = mockIs
    return result
  })
  mockUpdate.mockReturnValue({ eq: mockEq })
  mockMaybeSingle.mockResolvedValue({ data: null })
  // The signed-event company-resolution guard selects 'id' before idempotency
  // or handler effects (mirrors stripe-webhook.test.ts).
  mockResolutionMaybeSingle.mockResolvedValue({ data: { id: 'company-1' }, error: null })
  mockSelect.mockImplementation((columns: string) => ({
    eq: vi.fn().mockReturnValue({
      maybeSingle: columns === 'id' ? mockResolutionMaybeSingle : mockMaybeSingle,
    }),
  }))
  mockRpc.mockResolvedValue({ data: [{ balance_after: 100, applied: true }], error: null })
  mockSubscriptionsCancel.mockResolvedValue({})
})

// ==================================================================
// FIX 1 — charge.refunded: credit clawback for a top-up/auto-topup charge
// ==================================================================
describe('POST /api/webhooks/stripe — charge.refunded (topup clawback)', () => {
  it('claws back the granted credits via a NEGATIVE apply_credit_ledger_entry delta, keyed on refund:{chargeId}', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_refund_topup',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_topup1',
          customer: 'cus_1',
          invoice: null,
          payment_intent: {
            id: 'pi_1',
            metadata: { type: 'credit_topup', companyId: 'company-1', credits: '500' },
          },
        },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(mockRpc).toHaveBeenCalledWith(
      'apply_credit_ledger_entry',
      expect.objectContaining({
        p_company_id: 'company-1',
        p_delta_credits: -500,
        p_reason: 'adjust',
        p_ref_id: 'ch_topup1',
        p_idempotency_key: 'refund:ch_topup1',
      })
    )
  })

  it('claws back an auto_topup charge the same way', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_refund_autotopup',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_auto1',
          customer: 'cus_1',
          invoice: null,
          payment_intent: {
            id: 'pi_2',
            metadata: { type: 'auto_topup', companyId: 'company-1', credits: '200' },
          },
        },
      },
    })

    await POST(makeRequest())

    expect(mockRpc).toHaveBeenCalledWith(
      'apply_credit_ledger_entry',
      expect.objectContaining({ p_delta_credits: -200, p_idempotency_key: 'refund:ch_auto1' })
    )
  })

  it('resolves the PaymentIntent metadata via a live retrieve when charge.payment_intent is a bare id', async () => {
    mockPaymentIntentsRetrieve.mockResolvedValue({
      metadata: { type: 'credit_topup', companyId: 'company-1', credits: '900' },
    })
    mockConstructEvent.mockReturnValue({
      id: 'evt_refund_bareid',
      type: 'charge.refunded',
      data: {
        object: { id: 'ch_bareid', customer: 'cus_1', invoice: null, payment_intent: 'pi_bareid' },
      },
    })

    await POST(makeRequest())

    expect(mockPaymentIntentsRetrieve).toHaveBeenCalledWith('pi_bareid')
    expect(mockRpc).toHaveBeenCalledWith(
      'apply_credit_ledger_entry',
      expect.objectContaining({ p_delta_credits: -900 })
    )
  })

  it('a second delivery for the SAME charge (different event id) reuses the SAME refund idempotency key — the RPC (not this route) is the no-op authority', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_refund_dup_1',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_dup',
          customer: 'cus_1',
          invoice: null,
          payment_intent: { id: 'pi_3', metadata: { type: 'credit_topup', companyId: 'company-1', credits: '300' } },
        },
      },
    })
    await POST(makeRequest())

    // Second delivery: a DIFFERENT event id (a genuine Stripe redelivery uses
    // a fresh id) so the outer processed_stripe_events dedup does not itself
    // short-circuit this call — the assertion is that the REFUND key is what
    // protects against a double clawback, not the event-id dedup.
    mockConstructEvent.mockReturnValue({
      id: 'evt_refund_dup_2',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_dup',
          customer: 'cus_1',
          invoice: null,
          payment_intent: { id: 'pi_3', metadata: { type: 'credit_topup', companyId: 'company-1', credits: '300' } },
        },
      },
    })
    // Simulate apply_credit_ledger_entry's OWN idempotency catching the
    // redelivery — same contract as grantCredits' applied:false.
    mockRpc.mockResolvedValue({ data: [{ balance_after: 100, applied: false }], error: null })

    const res2 = await POST(makeRequest())

    expect(res2.status).toBe(200)
    expect(mockRpc).toHaveBeenLastCalledWith(
      'apply_credit_ledger_entry',
      expect.objectContaining({ p_idempotency_key: 'refund:ch_dup' })
    )
  })

  it('a companies RPC error throws so the route clears the dedup row and returns 500', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'db down' } })
    mockConstructEvent.mockReturnValue({
      id: 'evt_refund_dberr',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_dberr',
          customer: 'cus_1',
          invoice: null,
          payment_intent: { id: 'pi_4', metadata: { type: 'credit_topup', companyId: 'company-1', credits: '100' } },
        },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(mockDedupDelete).toHaveBeenCalled()
    expect(mockDedupDeleteEq).toHaveBeenCalledWith('event_id', 'evt_refund_dberr')
  })
})

// ==================================================================
// FIX 1 — charge.refunded: subscription-invoice charge reverses commission,
// never touches tier
// ==================================================================
describe('POST /api/webhooks/stripe — charge.refunded (subscription invoice)', () => {
  it('reverses the affiliate commission for the invoice and does NOT touch companies.tier', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_refund_invoice',
      type: 'charge.refunded',
      data: {
        object: {
          id: 'ch_invoice1',
          customer: 'cus_1',
          invoice: 'in_test1',
          payment_intent: null,
        },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(reverseCommissionForInvoice).toHaveBeenCalledWith({ invoiceId: 'in_test1', reason: 'refund' })
    // No credit clawback for a non-topup charge.
    expect(mockRpc).not.toHaveBeenCalled()
    // No companies.update at all — tier is untouched (Stripe's own subscription
    // lifecycle events are the sole source of truth for tier changes).
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})

// ==================================================================
// FIX 1 — charge.dispute.created / charge.dispute.closed
// ==================================================================
describe('POST /api/webhooks/stripe — charge.dispute.created', () => {
  it('reverses the commission for the disputed charge\'s invoice and alerts ops', async () => {
    mockChargesRetrieve.mockResolvedValue({ id: 'ch_2', invoice: 'in_2' })
    mockConstructEvent.mockReturnValue({
      id: 'evt_dispute_created',
      type: 'charge.dispute.created',
      data: {
        object: { id: 'dp_1', charge: 'ch_2', amount: 5000 },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(mockChargesRetrieve).toHaveBeenCalledWith('ch_2')
    expect(reverseCommissionForInvoice).toHaveBeenCalledWith({ invoiceId: 'in_2', reason: 'dispute' })
    expect(notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'payment_disputed',
        severity: 'error',
        dedupeKey: 'payment_disputed:evt_dispute_created',
      })
    )
  })

  it('still alerts ops (and returns 200) even when no company can be resolved for the dispute', async () => {
    mockResolutionMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockChargesRetrieve.mockResolvedValue({ id: 'ch_3', invoice: null })
    mockConstructEvent.mockReturnValue({
      id: 'evt_dispute_unresolved',
      type: 'charge.dispute.created',
      data: { object: { id: 'dp_2', charge: 'ch_3' } },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'payment_disputed', dedupeKey: 'payment_disputed:evt_dispute_unresolved' })
    )
  })
})

describe('POST /api/webhooks/stripe — charge.dispute.closed', () => {
  it('logs only — no commission reversal, no ops alert, still 200', async () => {
    mockConstructEvent.mockReturnValue({
      id: 'evt_dispute_closed',
      type: 'charge.dispute.closed',
      data: { object: { id: 'dp_3', charge: 'ch_4', status: 'won' } },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(reverseCommissionForInvoice).not.toHaveBeenCalled()
    expect(notifyOps).not.toHaveBeenCalled()
  })
})

// ==================================================================
// Fix 4a — checkout.session.completed: write the new mapping BEFORE
// cancelling the superseded subscription (reordered from the prior
// cancel-then-write sequence).
// ==================================================================
describe('POST /api/webhooks/stripe — checkout.session.completed supersede reorder (Fix 4a)', () => {
  it('calls companies.update (the new mapping write) BEFORE stripe.subscriptions.cancel (the old subscription cleanup)', async () => {
    // Pre-lookup returns an existing (different) subscription on the company.
    mockMaybeSingle.mockResolvedValueOnce({ data: { stripe_subscription_id: 'sub_old' } })
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ current_period_end: 1800000000, price: {}, metadata: {} }] },
      status: 'active',
    })

    mockConstructEvent.mockReturnValue({
      id: 'evt_checkout_reorder',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_reorder',
          mode: 'subscription',
          customer: 'cus_reorder',
          subscription: 'sub_new',
          metadata: { companyId: 'company-reorder', plan: 'pro' },
        },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    // Both happened...
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_subscription_id: 'sub_new', tier: 'pro' })
    )
    expect(mockSubscriptionsCancel).toHaveBeenCalledWith('sub_old')
    // ...but the mapping write is issued (synchronously, before the update's
    // own .eq() promise resolves) strictly BEFORE the cancel call, which only
    // runs after that write has succeeded.
    const updateOrder = mockUpdate.mock.invocationCallOrder[0]
    const cancelOrder = mockSubscriptionsCancel.mock.invocationCallOrder[0]
    expect(updateOrder).toBeLessThan(cancelOrder)
  })

  it('a cancel failure (old sub already gone) does not block the response — mapping already landed', async () => {
    mockMaybeSingle.mockResolvedValueOnce({ data: { stripe_subscription_id: 'sub_old_gone' } })
    mockSubscriptionsRetrieve.mockResolvedValue({
      items: { data: [{ current_period_end: 1800000000, price: {}, metadata: {} }] },
      status: 'active',
    })
    mockSubscriptionsCancel.mockRejectedValue(new Error('No such subscription'))

    mockConstructEvent.mockReturnValue({
      id: 'evt_checkout_cancel_fails',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_cancel_fails',
          mode: 'subscription',
          customer: 'cus_cancel_fails',
          subscription: 'sub_new_2',
          metadata: { companyId: 'company-cancel-fails', plan: 'pro' },
        },
      },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ stripe_subscription_id: 'sub_new_2' })
    )
  })
})

// ==================================================================
// WP-L extra fix (3) — customer.deleted: clear the dead stripe_customer_id
// mapping and disable auto-top-up, so ensureStripeCustomer re-provisions
// instead of every checkout 500ing and chargeAutoTopup looping on a
// misleading "no payment method on file".
// ==================================================================
describe('POST /api/webhooks/stripe — customer.deleted', () => {
  it('clears stripe_customer_id and disables auto_topup_enabled for the mapped company', async () => {
    mockResolutionMaybeSingle.mockResolvedValue({ data: { id: 'company-deleted-customer' }, error: null })
    mockConstructEvent.mockReturnValue({
      id: 'evt_customer_deleted',
      type: 'customer.deleted',
      data: { object: { id: 'cus_dead', deleted: true } },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(mockUpdate).toHaveBeenCalledWith({ stripe_customer_id: null, auto_topup_enabled: false })
    expect(mockEq).toHaveBeenCalledWith('stripe_customer_id', 'cus_dead')
  })

  it('is a no-op when no company is mapped to the deleted customer', async () => {
    mockResolutionMaybeSingle.mockResolvedValue({ data: null, error: null })
    mockConstructEvent.mockReturnValue({
      id: 'evt_customer_deleted_unmapped',
      type: 'customer.deleted',
      data: { object: { id: 'cus_dead_unmapped', deleted: true } },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('a companies.update DB error throws so the route clears the dedup row and returns 500', async () => {
    mockResolutionMaybeSingle.mockResolvedValue({ data: { id: 'company-deleted-err' }, error: null })
    mockEq.mockResolvedValueOnce({ error: { message: 'db down' } })
    mockConstructEvent.mockReturnValue({
      id: 'evt_customer_deleted_dberr',
      type: 'customer.deleted',
      data: { object: { id: 'cus_dead_err', deleted: true } },
    })

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(mockDedupDelete).toHaveBeenCalled()
    expect(mockDedupDeleteEq).toHaveBeenCalledWith('event_id', 'evt_customer_deleted_dberr')
  })
})
