import { describe, it, expect } from 'vitest'
import { makeConnectEvent } from '@/tests/fixtures/stripe-connect'

/**
 * Wave 0 RED tests for the connected-account branch of the existing Stripe
 * webhook handler (`app/api/webhooks/stripe/route.ts`). Plan 70-04 will:
 *   1. Detect `event.account` and dispatch to `handleConnectEvent`.
 *   2. On `checkout.session.completed`, mark the estimate paid and populate
 *      `stripe_checkout_session_id`, `stripe_payment_intent_id`, `paid_at`,
 *      `payment_amount_cents`.
 *   3. Insert into `processed_stripe_events` for idempotency — duplicate
 *      delivery (same `event.id`) is a no-op.
 *   4. On `account.application.deauthorized`, clear `stripe_account_id` on the
 *      matching company.
 */

const SUT = '@/lib/billing/connect-webhook'

describe('stripe connect webhook events', () => {
  it('routes events with event.account to the Connect handler', async () => {
    // Sanity check: fixture sets the discriminator field that branching keys on.
    const event = makeConnectEvent('checkout.session.completed')
    expect(event.account).toBe('acct_test_123')

    // Plan 70-04 will export `handleConnectEvent`. Until then this module
    // does not exist.
    await expect(import(/* @vite-ignore */ SUT)).rejects.toThrow()
    throw new Error('Not implemented — Phase 70 plan 04')
  })

  it('marks the estimate paid and populates the 4 payment columns', async () => {
    throw new Error('Not implemented — Phase 70 plan 04')
  })

  it('skips duplicate events via processed_stripe_events ON CONFLICT', async () => {
    throw new Error('Not implemented — Phase 70 plan 04')
  })

  it('clears stripe_account_id on account.application.deauthorized', async () => {
    throw new Error('Not implemented — Phase 70 plan 04')
  })
})
