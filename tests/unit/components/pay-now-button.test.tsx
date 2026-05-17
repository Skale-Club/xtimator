import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { PayNowButton } from '@/components/estimate/pay-now-button'

/**
 * Plan 70-03 — PayNowButton render matrix (GREEN).
 *
 * The button shows ONLY when ALL of the following are true:
 *   - company.stripe_account_id is non-null
 *   - company.stripe_connect_status === 'active'
 *   - estimate.payment_status !== 'paid'
 *   - estimate.total_amount_cents > 0
 *
 * Any failure of these conditions hides the button entirely (returns null).
 * Phase 70 hard constraint: zero new UI for non-connected tenants.
 */

const visibleProps = {
  token: 'tok_test',
  totalAmountCents: 50000,
  stripeAccountId: 'acct_test_1',
  stripeConnectStatus: 'active',
  paymentStatus: 'unpaid',
}

describe('PayNowButton render matrix', () => {
  it('renders the button when connected and unpaid', () => {
    const { container, getByRole } = render(<PayNowButton {...visibleProps} />)
    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    expect(form?.getAttribute('action')).toBe('/api/estimate/tok_test/pay')
    expect(form?.getAttribute('method')?.toLowerCase()).toBe('post')
    const btn = getByRole('button', { name: /pay \$500\.00/i })
    expect(btn).toBeTruthy()
  })

  it('hides the button when the estimate is already paid', () => {
    const { container } = render(
      <PayNowButton {...visibleProps} paymentStatus="paid" />
    )
    expect(container.firstChild).toBeNull()
  })

  it('hides the button when the company is not connected to Stripe', () => {
    const { container } = render(
      <PayNowButton {...visibleProps} stripeAccountId={null} stripeConnectStatus={null} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('hides the button when total_amount_cents is zero', () => {
    const { container } = render(
      <PayNowButton {...visibleProps} totalAmountCents={0} />
    )
    expect(container.firstChild).toBeNull()
  })
})
