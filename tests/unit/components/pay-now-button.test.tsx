import { describe, it, expect } from 'vitest'

/**
 * Wave 0 RED tests for the public-share-page Pay Now button (Plan 70-03).
 *
 * Render matrix — the button shows ONLY when ALL of the following are true:
 *   - `company.stripe_account_id` is non-null (tenant has connected)
 *   - `company.stripe_connect_status === 'active'`
 *   - `estimate.payment_status !== 'paid'`
 *   - `estimate.total_amount_cents > 0`
 *
 * Any failure of these conditions hides the button entirely (no broken UI,
 * no upsell, no "coming soon" — per Phase 70 hard constraint).
 */

const SUT = '@/components/estimate/pay-now-button'

describe('PayNowButton render matrix', () => {
  it('renders the button when connected and unpaid', async () => {
    await expect(import(/* @vite-ignore */ SUT)).rejects.toThrow()
    throw new Error('Not implemented — Phase 70 plan 03')
  })

  it('hides the button when the estimate is already paid', async () => {
    throw new Error('Not implemented — Phase 70 plan 03')
  })

  it('hides the button when the company is not connected to Stripe', async () => {
    throw new Error('Not implemented — Phase 70 plan 03')
  })

  it('hides the button when total_amount_cents is zero', async () => {
    throw new Error('Not implemented — Phase 70 plan 03')
  })
})
