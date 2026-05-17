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
