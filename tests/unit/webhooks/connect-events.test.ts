import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { notifyOps } from '@/lib/observability/ops-alert'
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
// Fix 3 / B5-style at-most-once: on a thrown handler error, the route deletes
// the dedup row via .from('processed_stripe_events').delete().eq('event_id', ...).
const dedupDeleteEq = vi.fn()
const dedupDelete = vi.fn().mockImplementation(() => ({ eq: dedupDeleteEq }))

// invoices.update().eq('id', ...).eq('company_id', ...)[.select().single()]
// Fix 2 scopes every invoice write by company_id — a SECOND .eq() call now
// sits between the first .eq('id', ...) and the terminal step. invoiceUpdateEq2
// is a thenable-with-.select attached (mirrors mockEq's .is() trick in
// stripe-webhook.test.ts) so it serves BOTH shapes off the same mock:
//   - handleInvoicePaid:                .eq().eq().select().single()
//   - handleInvoiceStatusChange/Failed: awaited directly after the second .eq()
const invoiceUpdate = vi.fn()
const invoiceUpdateEq = vi.fn()
const invoiceUpdateEq2 = vi.fn()
const invoiceUpdateSelect = vi.fn()
const invoiceUpdateSingle = vi.fn()

// invoices.select().eq().maybeSingle() — charge.refunded's invoice-lookup path
const invoiceSelect = vi.fn()
const invoiceSelectEq = vi.fn()
const invoiceSelectMaybeSingle = vi.fn()

// companies.select().eq().single()  (branding/email lookups)
// companies.select().eq().maybeSingle()  (Fix 2's assertEventOwnsCompany +
//   the account.application.deauthorized/account.updated resolution path)
// companies.update().eq()  (deauthorized/account.updated)
const companySelect = vi.fn()
const companySelectEq = vi.fn()
const companySelectSingle = vi.fn()
const companySelectMaybeSingle = vi.fn()
const companyUpdate = vi.fn()
const companyUpdateEq = vi.fn()
// companies.update().eq(...).neq('stripe_connect_status','disconnected') —
// account.updated (Fix 1) adds a `.neq()` after the `.eq()`. The deauthorized
// path still only calls `.update().eq()` with nothing chained after it, so
// companyUpdateEq's return value must be BOTH directly awaitable (thenable)
// AND carry a `.neq` for the account.updated path — same thenable-with-extra-
// method trick as invoiceUpdateEq2 above.
const companyUpdateEqNeq = vi.fn()

// estimates.select().eq().single()
const estimateSelect = vi.fn()
const estimateSelectEq = vi.fn()
const estimateSelectSingle = vi.fn()

// estimates.update().eq('id', ...).eq('company_id', ...).select().single() —
// checkout.session.completed path (Fix 2: also company-scoped now).
const estimateUpdate = vi.fn()
const estimateUpdateEq = vi.fn()
const estimateUpdateEq2 = vi.fn()
const estimateUpdateSelect = vi.fn()
const estimateUpdateSingle = vi.fn()

// projects.select().eq().single() — checkout.session.completed's project-name lookup
const projectSelect = vi.fn()
const projectSelectEq = vi.fn()
const projectSelectSingle = vi.fn()

function resetSupabaseMocks() {
  dedupInsert.mockReset()
  dedupDeleteEq.mockReset()
  invoiceUpdate.mockReset()
  invoiceUpdateEq.mockReset()
  invoiceUpdateEq2.mockReset()
  invoiceUpdateSelect.mockReset()
  invoiceUpdateSingle.mockReset()
  invoiceSelect.mockReset()
  invoiceSelectEq.mockReset()
  invoiceSelectMaybeSingle.mockReset()
  companySelect.mockReset()
  companySelectEq.mockReset()
  companySelectSingle.mockReset()
  companySelectMaybeSingle.mockReset()
  companyUpdate.mockReset()
  companyUpdateEq.mockReset()
  companyUpdateEqNeq.mockReset()
  estimateSelect.mockReset()
  estimateSelectEq.mockReset()
  estimateSelectSingle.mockReset()
  estimateUpdate.mockReset()
  estimateUpdateEq.mockReset()
  estimateUpdateEq2.mockReset()
  estimateUpdateSelect.mockReset()
  estimateUpdateSingle.mockReset()
  projectSelect.mockReset()
  projectSelectEq.mockReset()
  projectSelectSingle.mockReset()

  // Default: dedup insert succeeds (not a duplicate)
  dedupInsert.mockResolvedValue({ error: null })
  dedupDeleteEq.mockResolvedValue({ error: null })

  // invoices.update().eq('id',...).eq('company_id',...)[.select().single()]
  invoiceUpdate.mockReturnValue({ eq: invoiceUpdateEq })
  invoiceUpdateEq.mockReturnValue({ eq: invoiceUpdateEq2 })
  invoiceUpdateEq2.mockImplementation(() => {
    const result: Promise<{ error: null }> & { select?: typeof invoiceUpdateSelect } =
      Promise.resolve({ error: null })
    result.select = invoiceUpdateSelect
    return result
  })
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

  // companies.select().eq().{single,maybeSingle}() — same .eq() serves both
  // the branding lookup (.single()) and Fix 2's ownership check / the
  // account-resolution path (.maybeSingle()). stripe_account_id defaults to
  // the fixtures' event.account ('acct_test_123') so the happy path's
  // assertEventOwnsCompany check passes without every existing test needing
  // to know about it.
  companySelect.mockReturnValue({ eq: companySelectEq })
  companySelectEq.mockReturnValue({
    single: companySelectSingle,
    maybeSingle: companySelectMaybeSingle,
  })
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
  companySelectMaybeSingle.mockResolvedValue({
    data: { id: 'co_fixture_1', stripe_account_id: 'acct_test_123' },
    error: null,
  })

  // companies.update().eq()  — used for deauthorized
  companyUpdate.mockReturnValue({ eq: companyUpdateEq })
  companyUpdateEq.mockImplementation(() => {
    // account.updated scopes with `.in('stripe_connect_status', [...])` (a
    // 'pending' onboarding row must not be flipped to 'restricted', and .neq
    // would also skip NULL rows); deauthorized awaits the .eq() directly.
    const result: Promise<{ error: null }> & {
      neq?: typeof companyUpdateEqNeq
      in?: typeof companyUpdateEqNeq
    } = Promise.resolve({ error: null })
    result.neq = companyUpdateEqNeq
    result.in = companyUpdateEqNeq
    return result
  })
  companyUpdateEqNeq.mockResolvedValue({ error: null })

  // estimates.select().eq().single()
  estimateSelect.mockReturnValue({ eq: estimateSelectEq })
  estimateSelectEq.mockReturnValue({ single: estimateSelectSingle })
  estimateSelectSingle.mockResolvedValue({
    data: { share_token: 'tok_x', project_id: 'pr_x', public_slug_token: null },
    error: null,
  })

  // estimates.update().eq('id',...).eq('company_id',...).select().single() —
  // checkout.session.completed path (Fix 2: company-scoped).
  estimateUpdate.mockReturnValue({ eq: estimateUpdateEq })
  estimateUpdateEq.mockReturnValue({ eq: estimateUpdateEq2 })
  estimateUpdateEq2.mockReturnValue({ select: estimateUpdateSelect })
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
        return { insert: dedupInsert, delete: dedupDelete }
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
    expect(invoiceUpdateEq2).toHaveBeenCalledWith('company_id', 'co_fixture_1')

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

  it('flags and uses Stripe amount_paid when it differs from the invoices.amount_cents snapshot', async () => {
    const event = makeConnectInvoiceEvent('invoice.paid', { amount_paid: 25000 })
    mockConstructEvent.mockReturnValue(event)
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    // The immutable snapshot write itself is untouched — no amount_cents field
    // in the DB update (status/paid_at/hosted_invoice_url/invoice_pdf_url only).
    expect(invoiceUpdate).toHaveBeenCalledTimes(1)
    const updatePayload = invoiceUpdate.mock.calls[0][0]
    expect(updatePayload).not.toHaveProperty('amount_cents')

    expect(notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'invoice_amount_mismatch',
        severity: 'error',
        dedupeKey: event.id,
      })
    )
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('amount_paid'),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything(),
      expect.anything()
    )

    // The ACTUAL Stripe amount (25000), not the snapshot (30000), flows into
    // the payment-received notification/emails.
    expect(sendPaymentReceivedEmail).toHaveBeenCalledTimes(1)
    const ctx = sendPaymentReceivedEmail.mock.calls[0][0] as { amountCents: number }
    expect(ctx.amountCents).toBe(25000)

    warnSpy.mockRestore()
  })

  it('does not flag a mismatch when Stripe amount_paid matches the invoices.amount_cents snapshot', async () => {
    // Default fixture amount_paid is 30000, matching the snapshot amount_cents.
    const event = makeConnectInvoiceEvent('invoice.paid')
    mockConstructEvent.mockReturnValue(event)

    await POST(makeRequest())

    expect(notifyOps).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'invoice_amount_mismatch' })
    )
    const ctx = sendPaymentReceivedEmail.mock.calls[0][0] as { amountCents: number }
    expect(ctx.amountCents).toBe(30000)
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

describe('stripe connect webhook — account.updated (CONNECT-HEALTH-01, Fix 1)', () => {
  // No dedicated fixture builder exists for account.updated — build a minimal
  // Stripe.Account-shaped envelope inline (same pattern as
  // makeConnectChargeRefundedEvent below).
  function makeConnectAccountUpdatedEvent(
    accountOverrides: Record<string, unknown> = {}
  ) {
    return {
      id: `evt_${Math.random().toString(36).slice(2)}`,
      object: 'event',
      type: 'account.updated',
      account: 'acct_test_123',
      api_version: '2026-04-22.dahlia',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: 'acct_test_123',
          object: 'account',
          charges_enabled: true,
          email: 'owner@business.test',
          settings: { dashboard: { display_name: 'Test Business Display' } },
          business_profile: { name: 'Test Business' },
          requirements: { disabled_reason: null },
          ...accountOverrides,
        },
      },
      livemode: false,
      pending_webhooks: 0,
      request: { id: null, idempotency_key: null },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any
  }

  it('writes charges_enabled=true + status=active, matched on the VERIFIED event.account (never the payload account.id)', async () => {
    // The payload's own `id` is deliberately different from event.account —
    // proves the WHERE clause uses event.account, mirroring handleAccountDeauthorized.
    const event = makeConnectAccountUpdatedEvent({ id: 'acct_SPOOFED_PAYLOAD_ID' })
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(companyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_charges_enabled: true,
        stripe_connect_status: 'active',
        stripe_connect_disabled_reason: null,
      })
    )
    expect(companyUpdateEq).toHaveBeenCalledWith('stripe_account_id', 'acct_test_123')
  })

  it('writes stripe_connect_status=restricted + the disabled_reason when charges_enabled is false', async () => {
    const event = makeConnectAccountUpdatedEvent({
      charges_enabled: false,
      requirements: { disabled_reason: 'requirements.past_due' },
    })
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(companyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_charges_enabled: false,
        stripe_connect_status: 'restricted',
        stripe_connect_disabled_reason: 'requirements.past_due',
      })
    )
  })

  it('scopes the write to already-connected rows so it can neither resurrect a disconnected company nor disturb a pending onboarding', async () => {
    const event = makeConnectAccountUpdatedEvent()
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    // `.in([...])` rather than `.neq('disconnected')`: a mid-onboarding
    // 'pending' row must not be flipped to 'restricted', and PostgREST's .neq
    // would additionally skip rows whose status is NULL.
    expect(companyUpdateEqNeq).toHaveBeenCalledWith('stripe_connect_status', [
      'active',
      'restricted',
    ])
  })

  it('still syncs display_name/email alongside the health fields', async () => {
    const event = makeConnectAccountUpdatedEvent()
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())
    expect(res.status).toBe(200)

    expect(companyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_account_email: 'owner@business.test',
        stripe_account_display_name: 'Test Business Display',
      })
    )
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
    expect(invoiceUpdateEq2).toHaveBeenCalledWith('company_id', 'co_fixture_1')

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
    expect(invoiceUpdateEq2).toHaveBeenCalledWith('company_id', 'co_fixture_1')

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
    expect(invoiceUpdateEq2).toHaveBeenCalledWith('company_id', 'co_fixture_1')

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

describe('stripe connect webhook — Fix 2: event/company account ownership (security)', () => {
  it('drops a cross-account invoice.paid event (acct_attacker emitting an event that resolves to acct_victim\'s company) with 200 and makes NO write', async () => {
    // The resolved company (co_fixture_1) actually belongs to acct_victim —
    // but the signed event claims to come from acct_attacker. Without the
    // ownership check, acct_attacker could mark ANY invoice paid just by
    // crafting metadata.invoice_id pointing at another tenant's row.
    companySelectMaybeSingle.mockResolvedValue({
      data: { id: 'co_fixture_1', stripe_account_id: 'acct_victim' },
      error: null,
    })
    const event = { ...makeConnectInvoiceEvent('invoice.paid'), account: 'acct_attacker' }
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(invoiceUpdate).not.toHaveBeenCalled()
    expect(sendPaymentReceivedEmail).not.toHaveBeenCalled()
    expect(sendPaymentReceiptEmail).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
    expect(notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'stripe_connect_account_mismatch',
        severity: 'error',
        dedupeKey: event.id,
      })
    )
  })

  it('drops a cross-account checkout.session.completed event the same way (estimates write also protected)', async () => {
    companySelectMaybeSingle.mockResolvedValue({
      data: { id: 'co_fixture_1', stripe_account_id: 'acct_victim' },
      error: null,
    })
    const event = { ...makeConnectEvent('checkout.session.completed'), account: 'acct_attacker' }
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(estimateUpdate).not.toHaveBeenCalled()
    expect(sendPaymentReceivedEmail).not.toHaveBeenCalled()
    expect(notifyOps).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'stripe_connect_account_mismatch' })
    )
  })

  it('the happy path (event.account matches the resolved company.stripe_account_id) still processes and writes normally', async () => {
    companySelectMaybeSingle.mockResolvedValue({
      data: { id: 'co_fixture_1', stripe_account_id: 'acct_victim' },
      error: null,
    })
    const event = { ...makeConnectInvoiceEvent('invoice.paid'), account: 'acct_victim' }
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(invoiceUpdate).toHaveBeenCalledTimes(1)
    expect(notifyOps).not.toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'stripe_connect_account_mismatch' })
    )
  })
})

describe("stripe connect webhook — Fix 3: DB errors on the event's purpose throw (500 + dedup row cleared)", () => {
  it('invoice.paid: a DB error marking the invoice paid returns 500, clears the dedup row, and fires no emails/notification', async () => {
    invoiceUpdateSingle.mockResolvedValueOnce({ data: null, error: { message: 'db down' } })
    const event = makeConnectInvoiceEvent('invoice.paid')
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(dedupDelete).toHaveBeenCalled()
    expect(dedupDeleteEq).toHaveBeenCalledWith('event_id', event.id)
    expect(sendPaymentReceivedEmail).not.toHaveBeenCalled()
    expect(sendPaymentReceiptEmail).not.toHaveBeenCalled()
    expect(notify).not.toHaveBeenCalled()
  })

  it('invoice.voided: a DB error marking the invoice void returns 500 and clears the dedup row', async () => {
    invoiceUpdateEq2.mockResolvedValueOnce({ error: { message: 'db down' } })
    const event = makeConnectInvoiceEvent('invoice.voided')
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(dedupDelete).toHaveBeenCalled()
    expect(dedupDeleteEq).toHaveBeenCalledWith('event_id', event.id)
  })

  it('invoice.marked_uncollectible: a DB error returns 500 and clears the dedup row', async () => {
    invoiceUpdateEq2.mockResolvedValueOnce({ error: { message: 'db down' } })
    const event = makeConnectInvoiceEvent('invoice.marked_uncollectible')
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())

    expect(res.status).toBe(500)
    expect(dedupDelete).toHaveBeenCalled()
  })

  it('invoice.payment_failed stays best-effort — a DB error still returns 200 and does NOT clear the dedup row', async () => {
    invoiceUpdateEq2.mockResolvedValueOnce({ error: { message: 'db down' } })
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const event = makeConnectInvoiceEvent('invoice.payment_failed')
    mockConstructEvent.mockReturnValue(event)

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(dedupDelete).not.toHaveBeenCalled()

    errSpy.mockRestore()
  })
})
