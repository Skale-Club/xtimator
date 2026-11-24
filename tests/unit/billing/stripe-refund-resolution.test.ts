import { describe, expect, it, vi } from 'vitest'
import type Stripe from 'stripe'
import { resolveChargeInvoiceId, successfulRefundedCents, successfulInvoiceRefundedCents } from '@/lib/billing/stripe-refund-resolution'

describe('current Stripe refund payloads', () => {
  it('resolves a modern Charge without invoice through Invoice Payments in the originating account', async () => {
    const list = vi.fn().mockResolvedValue({ data: [{ invoice: 'in_1' }], has_more: false })
    const stripe = { invoicePayments: { list } } as unknown as Stripe
    expect(await resolveChargeInvoiceId({ payment_intent: 'pi_1' } as Stripe.Charge, stripe, 'acct_original')).toBe('in_1')
    expect(list).toHaveBeenCalledWith(expect.objectContaining({ payment: { type: 'payment_intent', payment_intent: 'pi_1' } }), { stripeAccount: 'acct_original' })
  })
  it('does not guess an invoice allocation or swallow provider read failures', async () => {
    const list = vi.fn().mockResolvedValue({ data: [{ invoice: 'in_1' }, { invoice: 'in_2' }], has_more: false })
    const stripe = { invoicePayments: { list } } as unknown as Stripe
    await expect(resolveChargeInvoiceId({ payment_intent: 'pi_1' } as Stripe.Charge, stripe)).rejects.toThrow('multiple invoices')
    list.mockRejectedValueOnce(new Error('Stripe unavailable'))
    await expect(resolveChargeInvoiceId({ payment_intent: 'pi_1' } as Stripe.Charge, stripe)).rejects.toThrow('unavailable')
  })
  it('paginates successful refund objects and excludes pending/failed/canceled refunds', async () => {
    const list = vi.fn().mockResolvedValueOnce({ data: [
      { id: 're_1', status: 'succeeded', amount: 100 }, { id: 're_pending', status: 'pending', amount: 900 },
    ], has_more: true }).mockResolvedValueOnce({ data: [
      { id: 're_2', status: 'succeeded', amount: 900 }, { id: 're_failed', status: 'failed', amount: 500 },
    ], has_more: false })
    const successfulIds: string[] = []
    expect(await successfulRefundedCents({ id: 'ch_1' } as Stripe.Charge, { refunds: { list } } as unknown as Stripe, 'acct_original', successfulIds)).toBe(1000)
    expect(successfulIds).toEqual(['re_1', 're_2'])
    expect(list.mock.calls[1]).toEqual([{ charge: 'ch_1', limit: 100, starting_after: 're_pending' }, { stripeAccount: 'acct_original' }])
  })
  it('sums refunds across partial invoice payments and deduplicates their charges', async () => {
    const invoicePayments = { list: vi.fn(() => ({ async *[Symbol.asyncIterator]() {
      yield { payment: { type: 'payment_intent', payment_intent: 'pi_1' } }
      yield { payment: { type: 'charge', charge: 'ch_2' } }
      yield { payment: { type: 'charge', charge: 'ch_2' } }
    } })) }
    const refundList = vi.fn(async ({ charge }: { charge: string }) => ({ data: [{ status: 'succeeded', amount: charge === 'ch_1' ? 100 : 200 }], has_more: false }))
    const stripe = { invoicePayments, paymentIntents: { retrieve: vi.fn(async () => ({ latest_charge: 'ch_1' })) }, refunds: { list: refundList } } as unknown as Stripe
    expect(await successfulInvoiceRefundedCents('in_1', stripe, 'acct_1')).toBe(300)
    expect(refundList).toHaveBeenCalledTimes(2)
  })
})
