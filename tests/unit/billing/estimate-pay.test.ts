import { describe, it, expect } from 'vitest'

/**
 * Wave 0 RED tests for the per-estimate "Pay Now" route
 * (`POST /api/estimate/[token]/pay`) shipped in Plan 70-03.
 *
 * The route loads the estimate by share token, resolves the connected account,
 * creates a Stripe Checkout Session via Direct Charges (using the
 * `stripeAccount` per-request option), and 303-redirects to `session.url`.
 *
 * Critical invariants:
 *   - `stripe.checkout.sessions.create(..., { stripeAccount: acct_xxx })` is
 *     called with the company's `stripe_account_id`.
 *   - `metadata.estimate_id` AND `metadata.company_id` are set so the webhook
 *     in Plan 70-04 can route the resulting `checkout.session.completed` event
 *     back to the estimate row.
 *   - `application_fee_amount` is NOT included in the payload (Stripe rejects
 *     `0`; omission means 100% of the payment goes to the connected account).
 *   - Response is a 303 redirect to the hosted Checkout URL.
 */

// Defer Vite resolution by using a runtime variable in the dynamic import.
const SUT = '@/app/api/estimate/[token]/pay/route'

describe('estimate pay route', () => {
  it('creates a checkout session on the connected account', async () => {
    await expect(import(/* @vite-ignore */ SUT)).rejects.toThrow()
    throw new Error('Not implemented — Phase 70 plan 03')
  })

  it('attaches estimate_id and company_id to session metadata', async () => {
    throw new Error('Not implemented — Phase 70 plan 03')
  })

  it('does NOT send application_fee_amount in the create payload', async () => {
    // Direct charges with no platform fee — Stripe rejects `0`, must be omitted.
    throw new Error('Not implemented — Phase 70 plan 03')
  })

  it('returns a 303 redirect to the Checkout session URL', async () => {
    throw new Error('Not implemented — Phase 70 plan 03')
  })
})
