import { describe, it, expect } from 'vitest'
import { paymentsEnabled } from '@/lib/billing/payments-enabled'

/**
 * PAYGATE-01 — `paymentsEnabled(company)` is the SINGLE source of truth for
 * whether forward-looking payment UI may render for a company. It is true ONLY
 * when the company has a Connect account id AND its connect status is 'active';
 * every other state (pending, disconnected, null account, null status) is false.
 *
 * The predicate is pure (no DB read, no `server-only`) so it is unit-testable
 * and its boolean result can be threaded to a client surface as a prop.
 */
describe('PAYGATE-01: paymentsEnabled predicate', () => {
  it('is true when account id is present and status is active', () => {
    expect(
      paymentsEnabled({ stripe_account_id: 'acct_1', stripe_connect_status: 'active' })
    ).toBe(true)
  })

  it('is false when status is disconnected', () => {
    expect(
      paymentsEnabled({ stripe_account_id: 'acct_1', stripe_connect_status: 'disconnected' })
    ).toBe(false)
  })

  it('is false when status is pending', () => {
    expect(
      paymentsEnabled({ stripe_account_id: 'acct_1', stripe_connect_status: 'pending' })
    ).toBe(false)
  })

  it('is false when account id is null even if status is active', () => {
    expect(
      paymentsEnabled({ stripe_account_id: null, stripe_connect_status: 'active' })
    ).toBe(false)
  })

  it('is false when both account id and status are null (never connected)', () => {
    expect(
      paymentsEnabled({ stripe_account_id: null, stripe_connect_status: null })
    ).toBe(false)
  })
})
