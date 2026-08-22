import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * lib/billing/stripe-customer.ts — ensureStripeCustomer.
 *
 * Covers the two failure modes a validator flagged:
 *   1. A transient DB read error must throw (never silently treated as "no
 *      row", which would create a brand-new — and orphaned — Stripe Customer
 *      for a company that may already have one).
 *   2. Losing the create/persist race to a concurrent caller must return the
 *      id that actually got persisted AND best-effort delete the Customer
 *      this call just created at Stripe, so no orphan Customer is left.
 */

vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))

const { requireServiceClient } = await import('@/lib/supabase/service')
const { ensureStripeCustomer } = await import('@/lib/billing/stripe-customer')

const selectMaybeSingle = vi.fn()
const updateEq2 = vi.fn()
const updateEq1 = vi.fn(() => ({ is: updateEq2 }))
const updateFn = vi.fn(() => ({ eq: updateEq1 }))

function makeServiceClientMock() {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: selectMaybeSingle,
        }),
      }),
      update: updateFn,
    }),
  }
}

const stripeCustomersCreate = vi.fn()
const stripeCustomersDel = vi.fn()
const stripe = {
  customers: {
    create: stripeCustomersCreate,
    del: stripeCustomersDel,
  },
} as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireServiceClient).mockReturnValue(makeServiceClientMock() as never)
  updateEq2.mockResolvedValue({ data: null, error: null })
})

describe('ensureStripeCustomer', () => {
  it('returns the existing stripe_customer_id without calling Stripe', async () => {
    selectMaybeSingle.mockResolvedValueOnce({
      data: { stripe_customer_id: 'cus_existing', name: 'Acme', email: 'a@acme.test' },
      error: null,
    })

    const result = await ensureStripeCustomer(stripe, 'company-1')

    expect(result).toBe('cus_existing')
    expect(stripeCustomersCreate).not.toHaveBeenCalled()
  })

  it('throws when the initial company read errors, and never calls Stripe', async () => {
    selectMaybeSingle.mockResolvedValueOnce({
      data: null,
      error: { message: 'connection reset' },
    })

    await expect(ensureStripeCustomer(stripe, 'company-1')).rejects.toThrow(
      /connection reset/
    )
    expect(stripeCustomersCreate).not.toHaveBeenCalled()
  })

  it('throws when the post-create re-read errors', async () => {
    selectMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null }) // initial read: no row/no customer yet
      .mockResolvedValueOnce({ data: null, error: { message: 'timeout' } }) // re-read fails

    stripeCustomersCreate.mockResolvedValue({ id: 'cus_created' })

    await expect(ensureStripeCustomer(stripe, 'company-1')).rejects.toThrow(/timeout/)
    expect(stripeCustomersCreate).toHaveBeenCalledOnce()
  })

  it('creates a customer when none exists and persists + returns its id (no race)', async () => {
    selectMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { stripe_customer_id: 'cus_created' }, error: null })

    stripeCustomersCreate.mockResolvedValue({ id: 'cus_created' })

    const result = await ensureStripeCustomer(stripe, 'company-1')

    expect(result).toBe('cus_created')
    expect(stripeCustomersCreate).toHaveBeenCalledOnce()
    expect(stripeCustomersDel).not.toHaveBeenCalled()
  })

  it('when a concurrent caller wins the race, returns the stored id and deletes the orphan it created', async () => {
    selectMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null }) // initial read: no customer yet
      .mockResolvedValueOnce({ data: { stripe_customer_id: 'cus_other_winner' }, error: null }) // re-read: someone else's write won

    stripeCustomersCreate.mockResolvedValue({ id: 'cus_created' })
    stripeCustomersDel.mockResolvedValue({ deleted: true })

    const result = await ensureStripeCustomer(stripe, 'company-1')

    expect(result).toBe('cus_other_winner')
    expect(stripeCustomersCreate).toHaveBeenCalledOnce()
    expect(stripeCustomersDel).toHaveBeenCalledWith('cus_created')
  })

  it('swallows a failure to delete the orphaned customer and still returns the stored id', async () => {
    selectMaybeSingle
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: { stripe_customer_id: 'cus_other_winner' }, error: null })

    stripeCustomersCreate.mockResolvedValue({ id: 'cus_created' })
    stripeCustomersDel.mockRejectedValue(new Error('Stripe unavailable'))

    const result = await ensureStripeCustomer(stripe, 'company-1')

    expect(result).toBe('cus_other_winner')
    expect(stripeCustomersDel).toHaveBeenCalledWith('cus_created')
  })
})
