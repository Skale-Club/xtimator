import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import {
  makeConnectEvent,
  makeConnectInvoiceEvent,
} from '@/tests/fixtures/stripe-connect'

/**
 * Connected-account branch of the Stripe webhook handler — Phase 94 (INVOICE-05).
 *
 * Implementation under test:
 *   - app/api/webhooks/stripe/route.ts (top-level branch on event.account)
 *   - lib/billing/connect-webhook.ts   (handleConnectEvent — switch on type)
 *   - lib/email/payment-emails.ts      (2 Resend helpers, never throw)
 *
 * Primary coverage is the Connect `invoice.paid` path (D-20/D-21): a real
 * Stripe Invoice issued on the connected account is paid, we match our
 * `invoices` row by `metadata.invoice_id`, mark it paid, and reuse the
 * payment-received + receipt emails + the payment.received notification.
 *
 * The PLATFORM `invoice.paid` (subscription renewals) lives in
 * handlePlatformEvent and is covered by tests/unit/billing/stripe-webhook.ts —
 * it never reaches handleConnectEvent because it carries no event.account.
 *
 * The cases below verify:
 *   1. invoice.paid (event.account present) → Connect handler marks invoices paid
 *   2. Duplicate event id → processed_stripe_events ON CONFLICT → no side effects
 *   3. invoice.paid missing metadata.invoice_id → safe no-op
 *   4. account.application.deauthorized clears stripe_account_id (unchanged path)
 */

// ------------------------------------------------------------------
// Mocks: Stripe client + Supabase service client + email helpers
// ------------------------------------------------------------------

const mockConstructEvent = vi.fn()

vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn().mockResolvedValue({
    webhooks: { constructEvent: mockConstructEvent },
    subscriptions: { retrieve: vi.fn() },
  }),
}))

// Phase 175 (PLAT-01) test-safety: connect-webhook.ts now imports notifyOps,
// which carries a dedupeKey and would otherwise attempt a real Upstash SETNX
// round-trip (getRedis() is unmocked in this file). No new assertions here —
// see tests/unit/notifications/event-sources.test.ts for the wiring coverage.
vi.mock('@/lib/observability/ops-alert', () => ({
  notifyOps: vi.fn().mockResolvedValue(undefined),
}))

// Per-table Supabase mock. Each `.from(table)` returns its own chainable shape.
const dedupInsert = vi.fn()

// invoices.update().eq().select().single()
const invoiceUpdate = vi.fn()
const invoiceUpdateEq = vi.fn()
const invoiceUpdateSelect = vi.fn()
const invoiceUpdateSingle = vi.fn()

// invoices.select().eq().maybeSingle() — charge.refunded's invoice-lookup path
const invoiceSelect = vi.fn()
const invoiceSelectEq = vi.fn()
const invoiceSelectMaybeSingle = vi.fn()

// companies.select().eq().single()  +  companies.update().eq()
const companySelect = vi.fn()
const companySelectEq = vi.fn()
const companySelectSingle = vi.fn()
const companyUpdate = vi.fn()
const companyUpdateEq = vi.fn()

// estimates.select().eq().single()
const estimateSelect = vi.fn()
const estimateSelectEq = vi.fn()
const estimateSelectSingle = vi.fn()

// estimates.update().eq().select().single() — checkout.session.completed path
const estimateUpdate = vi.fn()
const estimateUpdateEq = vi.fn()
const estimateUpdateSelect = vi.fn()
const estimateUpdateSingle = vi.fn()

// projects.select().eq().single() — checkout.session.completed's project-name lookup
const projectSelect = vi.fn()
const projectSelectEq = vi.fn()
const projectSelectSingle = vi.fn()

function resetSupabaseMocks() {
  dedupInsert.mockReset()
  invoiceUpdate.mockReset()
  invoiceUpdateEq.mockReset()
  invoiceUpdateSelect.mockReset()
  invoiceUpdateSingle.mockReset()
  invoiceSelect.mockReset()
  invoiceSelectEq.mockReset()
  invoiceSelectMaybeSingle.mockReset()
  companySelect.mockReset()
  companySelectEq.mockReset()
  companySelectSingle.mockReset()
  companyUpdate.mockReset()
  companyUpdateEq.mockReset()
  estimateSelect.mockReset()
  estimateSelectEq.mockReset()
  estimateSelectSingle.mockReset()
  estimateUpdate.mockReset()
  estimateUpdateEq.mockReset()
  estimateUpdateSelect.mockReset()
  estimateUpdateSingle.mockReset()
  projectSelect.mockReset()
  projectSelectEq.mockReset()
  projectSelectSingle.mockReset()

  // Default: dedup insert succeeds (not a duplicate)
  dedupInsert.mockResolvedValue({ error: null })

  // invoices.update().eq().select().single() → returns the snapshot row
  invoiceUpdate.mockReturnValue({ eq: invoiceUpdateEq })
  invoiceUpdateEq.mockReturnValue({ select: invoiceUpdateSelect })
  invoiceUpdateSelect.mockReturnValue({ single: invoiceUpdateSingle })
  invoiceUpdateSingle.mockResolvedValue({
    data: {
      id: 'inv_row_fixture_1',
      company_id: 'co_fixture_1',
      estimate_id: 'est_fixture_1',
      amount_cents: 30000,
      currency_code: 'usd',
      project_name: 'Bathroom remodel',
    },
    error: null,
  })

  // invoices.select().eq().maybeSingle() — charge.refunded's invoice-lookup path
  invoiceSelect.mockReturnValue({ eq: invoiceSelectEq })
  invoiceSelectEq.mockReturnValue({ maybeSingle: invoiceSelectMaybeSingle })
  invoiceSelectMaybeSingle.mockResolvedValue({
    data: {
      id: 'inv_row_fixture_1',
      company_id: 'co_fixture_1',
      project_name: 'Bathroom remodel',
      currency_code: 'usd',
    },
    error: null,
  })

  // companies.select().eq().single()
  companySelect.mockReturnValue({ eq: companySelectEq })
  companySelectEq.mockReturnValue({ single: companySelectSingle })
  companySelectSingle.mockResolvedValue({
    data: {
      email: 'owner@business.test',
      name: 'Test Business',
      stripe_account_display_name: 'Test Business Display',
      user_id: 'user_fixture_1',
      slug: 'acme-co',
    },
    error: null,
  })

  // companies.update().eq()  — used for deauthorized
  companyUpdate.mockReturnValue({ eq: companyUpdateEq })
  companyUpdateEq.mockResolvedValue({ error: null })

  // estimates.select().eq().single()
  estimateSelect.mockReturnValue({ eq: estimateSelectEq })
  estimateSelectEq.mockReturnValue({ single: estimateSelectSingle })
  estimateSelectSingle.mockResolvedValue({
    data: { share_token: 'tok_x', project_id: 'pr_x', public_slug_token: null },
    error: null,
  })

  // estimates.update().eq().select().single() — checkout.session.completed path
  estimateUpdate.mockReturnValue({ eq: estimateUpdateEq })
  estimateUpdateEq.mockReturnValue({ select: estimateUpdateSelect })
  estimateUpdateSelect.mockReturnValue({ single: estimateUpdateSingle })
  estimateUpdateSingle.mockResolvedValue({
    data: {
      id: 'est_fixture_1',
      company_id: 'co_fixture_1',
      project_id: 'proj_fixture_1',
      share_token: 'tok_x',
      public_slug_token: 'friendlytoken1',
      currency_code: 'usd',
    },
    error: null,
  })

  // projects.select().eq().single()
  projectSelect.mockReturnValue({ eq: projectSelectEq })
  projectSelectEq.mockReturnValue({ single: projectSelectSingle })
  projectSelectSingle.mockResolvedValue({ data: { name: 'Bathroom remodel' }, error: null })
}

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn().mockReturnValue({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'processed_stripe_events') {
        return { insert: dedupInsert }
      }
      if (table === 'invoices') {
        return { update: invoiceUpdate, select: invoiceSelect }
      }
      if (table === 'companies') {
        return { select: companySelect, update: companyUpdate }
      }
      if (table === 'estimates') {
        return { select: estimateSelect, update: estimateUpdate }
      }
      if (table === 'projects') {
        return { select: projectSelect }
      }
      throw new Error(`Unexpected table: ${table}`)
    }),
  }),
}))

const sendPaymentReceivedEmail = vi.fn().mockResolvedValue(undefined)
const sendPaymentReceiptEmail = vi.fn().mockResolvedValue(undefined)

vi.mock('@/lib/email/payment-emails', () => ({
  sendPaymentReceivedEmail: (...args: unknown[]) =>
    sendPaymentReceivedEmail(...args),
  sendPaymentReceiptEmail: (...args: unknown[]) =>
    sendPaymentReceiptEmail(...args),
}))

// Notification dispatch is fire-and-forget (void notify(...)) — stub as no-op
// so the test never touches Inngest/Supabase notification internals.
const notify = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/notifications/dispatch', () => ({
  notify: (...args: unknown[]) => notify(...args),
}))

// PLACEHOLDER secret only — never a real signing secret (CLAUDE.md secret rule).
vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')

// Late import so vi.mock applies before module load.
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
  resetSupabaseMocks()
  sendPaymentReceivedEmail.mockReset().mockResolvedValue(undefined)
  sendPaymentReceiptEmail.mockReset().mockResolvedValue(undefined)
  notify.mockReset().mockResolvedValue({ ok: true })
})

describe('stripe connect webhook — invoice.paid (INVOICE-05)', () => {
  it('routes invoice.paid (event.account present) to the Connect handler and marks the invoices row paid', async () => {
    const event = makeConnectInvoiceEvent('invoice.paid')
    expect(event.account).toBe('acct_test_123') // fixture sanity — discriminator

    mockConstructEvent.mockReturnValue(event)
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    // invoices.update called once with status: 'paid'
    expect(invoiceUpdate).toHaveBeenCalledTimes(1)
    const updatePayload = invoiceUpdate.mock.calls[0][0]
    expect(updatePayload).toMatchObject({ status: 'paid' })
    expect(typeof updatePayload.paid_at).toBe('string') // ISO timestamp
    expect(updatePayload.hosted_invoice_url).toBe(
      'https://invoice.stripe.com/i/test_hosted'
    )
    expect(updatePayload.invoice_pdf_url).toBe(
      'https://invoice.stripe.com/i/test_pdf'
    )

    // matched by our row PK from metadata.invoice_id
    expect(invoiceUpdateEq).toHaveBeenCalledWith('id', 'inv_row_fixture_1')

    // Both email helpers fired exactly once (reused from estimate flow)
    expect(sendPaymentReceivedEmail).toHaveBeenCalledTimes(1)
    expect(sendPaymentReceiptEmail).toHaveBeenCalledTimes(1)

    // Notification repointed to the invoice
    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toMatchObject({
      eventType: 'payment.received',
      resourceType: 'invoice',
      resourceId: 'inv_row_fixture_1',
    })
  })

  it('uses the invoice snapshot amount (30000), not a re-derived estimate total, in the email ctx', async () => {
    const event = makeConnectInvoiceEvent('invoice.paid')
    mockConstructEvent.mockReturnValue(event)

    await POST(makeRequest())

    expect(sendPaymentReceivedEmail).toHaveBeenCalledTimes(1)
    const ctx = sendPaymentReceivedEmail.mock.calls[0][0] as {
      amountCents: number
      currencyCode: string
      projectName: string
    }
    expect(ctx.amountCents).toBe(30000) // stored snapshot (invoices.amount_cents)
    expect(ctx.currencyCode).toBe('usd')
    expect(ctx.projectName).toBe('Bathroom remodel')
  })

  it('skips duplicate invoice.paid via processed_stripe_events ON CONFLICT', async () => {
    // Simulate duplicate insert — Postgres unique violation
    dedupInsert.mockResolvedValueOnce({ error: { code: '23505' } })

    const event = makeConnectInvoiceEvent('invoice.paid')
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Already processed')

    // Critically: NO invoices update, NO emails, NO notification on a dup
    expect(invoiceUpdate).not.toHaveBeenCalled()
    expect(sendPaymentReceivedEmail).not.toHaveBeenCalled()
    expect(sendPaymentReceiptEmail).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('treats invoice.paid missing metadata.invoice_id as a safe no-op', async () => {
    // Invoice with no metadata.invoice_id — handler should warn + return.
    const event = makeConnectInvoiceEvent('invoice.paid', { metadata: {} })
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(invoiceUpdate).not.toHaveBeenCalled()
    expect(sendPaymentReceivedEmail).not.toHaveBeenCalled()
    expect(sendPaymentReceiptEmail).not.toHaveBeenCalled()
  })

  it('does not blow up when the invoices row is missing (update returns no data)', async () => {
    // Row not found (e.g. already-deleted estimate cascade) — handler returns
    // gracefully without firing emails/notifications.
    invoiceUpdateSingle.mockResolvedValueOnce({ data: null, error: null })

    const event = makeConnectInvoiceEvent('invoice.paid')
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(invoiceUpdate).toHaveBeenCalledTimes(1)
    expect(sendPaymentReceivedEmail).not.toHaveBeenCalled()
    expect(sendPaymentReceiptEmail).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('stripe connect webhook — account.application.deauthorized (unchanged)', () => {
  it('clears stripe_account_id on account.application.deauthorized', async () => {
    // The deauthorized handler wraps a Checkout-session envelope by default,
    // but only event.account + event.type matter for this path.
    const event = {
      ...makeConnectEvent('account.application.deauthorized'),
      type: 'account.application.deauthorized',
    }
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(companyUpdate).toHaveBeenCalledWith({
      stripe_account_id: null,
      stripe_connect_status: 'disconnected',
    })
    expect(companyUpdateEq).toHaveBeenCalledWith(
      'stripe_account_id',
      'acct_test_123'
    )

    // No payment-related side effects
    expect(invoiceUpdate).not.toHaveBeenCalled()
    expect(sendPaymentReceivedEmail).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('stripe connect webhook — invoice.voided / invoice.marked_uncollectible', () => {
  it('marks the invoices row void on invoice.voided', async () => {
    const event = makeConnectInvoiceEvent('invoice.voided')
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(invoiceUpdate).toHaveBeenCalledTimes(1)
    const payload = invoiceUpdate.mock.calls[0][0]
    expect(payload).toMatchObject({ status: 'void' })
    expect(typeof payload.updated_at).toBe('string')
    expect(invoiceUpdateEq).toHaveBeenCalledWith('id', 'inv_row_fixture_1')

    // No emails/notifications for this terminal status.
    expect(sendPaymentReceivedEmail).not.toHaveBeenCalled()
    expect(sendPaymentReceiptEmail).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('marks the invoices row uncollectible on invoice.marked_uncollectible', async () => {
    const event = makeConnectInvoiceEvent('invoice.marked_uncollectible')
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(invoiceUpdate).toHaveBeenCalledTimes(1)
    const payload = invoiceUpdate.mock.calls[0][0]
    expect(payload).toMatchObject({ status: 'uncollectible' })
    expect(invoiceUpdateEq).toHaveBeenCalledWith('id', 'inv_row_fixture_1')

    expect(sendPaymentReceivedEmail).not.toHaveBeenCalled()
    expect(sendPaymentReceiptEmail).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('treats invoice.voided missing metadata.invoice_id as a safe no-op', async () => {
    const event = makeConnectInvoiceEvent('invoice.voided', { metadata: {} })
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(invoiceUpdate).not.toHaveBeenCalled()
  })
})

describe('stripe connect webhook — invoice.payment_failed', () => {
  it('leaves invoices.status open (no status key in the update) and logs a warn', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const event = makeConnectInvoiceEvent('invoice.payment_failed')
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(invoiceUpdate).toHaveBeenCalledTimes(1)
    const payload = invoiceUpdate.mock.calls[0][0]
    expect(payload).not.toHaveProperty('status')
    expect(typeof payload.updated_at).toBe('string')
    expect(invoiceUpdateEq).toHaveBeenCalledWith('id', 'inv_row_fixture_1')

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('invoice.payment_failed'),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    )

    // No EventType fits this event — log-only, no notification/email.
    expect(notify).not.toHaveBeenCalled()
    expect(sendPaymentReceivedEmail).not.toHaveBeenCalled()
    expect(sendPaymentReceiptEmail).not.toHaveBeenCalled()

    warnSpy.mockRestore()
  })

  it('treats invoice.payment_failed missing metadata.invoice_id as a safe no-op', async () => {
    const event = makeConnectInvoiceEvent('invoice.payment_failed', { metadata: {} })
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(invoiceUpdate).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('stripe connect webhook — charge.refunded resolving via charge.invoice', () => {
  // Minimal connected-account event wrapping a refunded Charge that carries
  // charge.invoice (the Phase 94+ path) instead of the legacy payment_intent
  // → estimates.stripe_payment_intent_id lookup.
  function makeConnectChargeRefundedEvent(
    overrides: Record<string, unknown> = {}
  ) {
    return {
      id: `evt_${Math.random().toString(36).slice(2)}`,
      object: 'event',
      type: 'charge.refunded',
      account: 'acct_test_123',
      api_version: '2026-04-22.dahlia',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'ch_test_connect_123',
          object: 'charge',
          amount_refunded: 30000,
          refunded: true,
          invoice: 'in_test_connect_123',
          payment_intent: null,
          ...overrides,
        },
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  }

  it('resolves the company + invoice row via charge.invoice and fires payment.refunded', async () => {
    const event = makeConnectChargeRefundedEvent()
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    // Looked up by stripe_invoice_id, not the legacy estimates path.
    expect(invoiceSelectEq).toHaveBeenCalledWith(
      'stripe_invoice_id',
      'in_test_connect_123'
    )
    expect(estimateSelect).not.toHaveBeenCalled()

    expect(notify).toHaveBeenCalledTimes(1)
    expect(notify.mock.calls[0][0]).toMatchObject({
      companyId: 'co_fixture_1',
      eventType: 'payment.refunded',
      resourceType: 'invoice',
      resourceId: 'inv_row_fixture_1',
    })
  })

  it('gracefully no-ops (200, no notify) when charge.invoice does not resolve to a known invoices row', async () => {
    // No row matches this stripe_invoice_id — company resolution (which also
    // goes through the invoice lookup) comes back empty, so the route
    // acknowledges the event without reaching the notification handler.
    invoiceSelectMaybeSingle.mockResolvedValue({ data: null, error: null })

    const event = makeConnectChargeRefundedEvent()
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(notify).not.toHaveBeenCalled()
  })
})

describe('checkout.session.completed — friendly URL (Phase 160, PUBURL-04)', () => {
  it('builds estimateShareUrl via buildEstimatePublicPath (friendly path) when slug + public_slug_token are present', async () => {
    const event = makeConnectEvent('checkout.session.completed')
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(sendPaymentReceivedEmail).toHaveBeenCalledTimes(1)
    const ctx = sendPaymentReceivedEmail.mock.calls[0][0] as { estimateShareUrl: string }
    expect(ctx.estimateShareUrl).toBe(
      'https://xtimator.com/estimate/acme-co/bathroom-remodel-friendlytoken1'
    )
  })
})
