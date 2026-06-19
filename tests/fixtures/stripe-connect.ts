import type Stripe from 'stripe'

/**
 * Build a minimal `Stripe.Checkout.Session` shape suitable for Connect tests.
 * Defaults represent a "paid" Checkout session on a connected account, with
 * `metadata.estimate_id` + `metadata.company_id` populated (mirrors what the
 * payment route in Plan 70-03 will set).
 */
export function makeConnectCheckoutSession(
  overrides: Partial<Stripe.Checkout.Session> = {}
): Stripe.Checkout.Session {
  return {
    id: 'cs_test_connect_123',
    object: 'checkout.session',
    amount_total: 50000,
    currency: 'usd',
    payment_intent: 'pi_test_connect_123',
    payment_status: 'paid',
    status: 'complete',
    mode: 'payment',
    metadata: { estimate_id: 'est_fixture_1', company_id: 'co_fixture_1' },
    ...overrides,
  } as unknown as Stripe.Checkout.Session
}

/**
 * Build a minimal `Stripe.Event` that mimics a connected-account event.
 * The presence of `event.account` is what the webhook handler will branch on
 * (see Plan 70-04). The wrapped object defaults to a Checkout Session; pass
 * `sessionOverrides` to vary it per test.
 */
export function makeConnectEvent(
  type: string,
  sessionOverrides: Partial<Stripe.Checkout.Session> = {}
): Stripe.Event & { account: string } {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    object: 'event',
    type,
    account: 'acct_test_123',
    api_version: '2026-04-22.dahlia',
    created: Math.floor(Date.now() / 1000),
    data: { object: makeConnectCheckoutSession(sessionOverrides) },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  } as unknown as Stripe.Event & { account: string }
}

/**
 * Build a minimal paid `Stripe.Invoice` shape for Phase 94 Connect tests.
 * Defaults represent a paid invoice on a connected account, with
 * `metadata.invoice_id` + `metadata.company_id` populated (mirrors what
 * `createConnectInvoice` in Plan 94-02 will set so the `invoice.paid` webhook
 * can route the event back to the `invoices` row by `metadata.invoice_id`).
 */
export function makeConnectInvoice(
  overrides: Partial<Stripe.Invoice> = {}
): Stripe.Invoice {
  return {
    id: 'in_test_connect_123',
    object: 'invoice',
    status: 'paid',
    hosted_invoice_url: 'https://invoice.stripe.com/i/test_hosted',
    invoice_pdf: 'https://invoice.stripe.com/i/test_pdf',
    metadata: { invoice_id: 'inv_row_fixture_1', company_id: 'co_fixture_1' },
    currency: 'usd',
    amount_paid: 30000,
    ...overrides,
  } as unknown as Stripe.Invoice
}

/**
 * Build a connected-account `invoice.paid` event (default type) wrapping a paid
 * invoice. Same envelope shape as `makeConnectEvent` (account present + pinned
 * api_version) but `data.object` is a `Stripe.Invoice`. The Plan 94-05 webhook
 * rewrite imports this to drive the `invoice.paid` Connect-branch tests.
 */
export function makeConnectInvoiceEvent(
  type = 'invoice.paid',
  invoiceOverrides: Partial<Stripe.Invoice> = {}
): Stripe.Event & { account: string } {
  return {
    id: `evt_${Math.random().toString(36).slice(2)}`,
    object: 'event',
    type,
    account: 'acct_test_123',
    api_version: '2026-04-22.dahlia',
    created: Math.floor(Date.now() / 1000),
    data: { object: makeConnectInvoice(invoiceOverrides) },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
  } as unknown as Stripe.Event & { account: string }
}
