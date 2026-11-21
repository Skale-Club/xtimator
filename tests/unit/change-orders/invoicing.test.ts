import { describe, it, expect } from 'vitest'
import {
  hasLiveDepositInvoice,
  invoiceAmountCents,
  planInvoice,
  summarizeInvoicing,
  type InvoicingInput,
} from '@/lib/change-orders/invoicing'

// Contract: estimate $3,486.00 with a $1,000.00 deposit; change orders #1 +$515.00
// (approved), #2 -$100.00 credit (approved).
const base = (over: Partial<InvoicingInput> = {}): InvoicingInput => ({
  estimateTotalCents: 348600,
  depositCents: 100000,
  approvedChangeOrders: [
    { id: 'co1', number: 1, totalCents: 51500 },
    { id: 'co2', number: 2, totalCents: -10000 },
  ],
  liveInvoices: [],
  ...over,
})

describe('summarizeInvoicing', () => {
  it('measures the contract as the estimate plus approved change orders (credits included)', () => {
    const s = summarizeInvoicing(base())
    expect(s.changeOrdersCents).toBe(41500)
    expect(s.contractCents).toBe(390100)
    expect(s.changeOrdersInBalanceCents).toBe(41500)
    expect(s.remainingCents).toBe(390100)
  })

  it('takes a change order billed on its own out of the balance', () => {
    const s = summarizeInvoicing(
      base({ liveInvoices: [{ kind: 'change_order', amount_cents: 51500, change_order_id: 'co1' }] }),
    )
    expect(s.separatelyInvoicedIds).toEqual(['co1'])
    expect(s.changeOrdersInBalanceCents).toBe(-10000)
    expect(s.alreadyInvoicedCents).toBe(51500)
  })
})

describe('invoiceAmountCents', () => {
  it('balance = estimate - deposit + change orders not billed alone', () => {
    expect(invoiceAmountCents(base(), { kind: 'balance' })).toBe(348600 - 100000 + 41500)
    expect(invoiceAmountCents(base(), { kind: 'deposit' })).toBe(100000)
    expect(invoiceAmountCents(base(), { kind: 'full' })).toBe(390100)
  })

  it('without change orders the amounts are exactly the old estimate amounts', () => {
    const plain = base({ approvedChangeOrders: [] })
    expect(invoiceAmountCents(plain, { kind: 'full' })).toBe(348600)
    expect(invoiceAmountCents(plain, { kind: 'balance' })).toBe(248600)
  })
})

describe('planInvoice', () => {
  it('deposit + balance add up to the whole contract', () => {
    const deposit = planInvoice(base(), { kind: 'deposit' })
    const balance = planInvoice(
      base({ liveInvoices: [{ kind: 'deposit', amount_cents: 100000, change_order_id: null }] }),
      { kind: 'balance' },
    )
    expect((deposit.amountCents ?? 0) + (balance.amountCents ?? 0)).toBe(390100)
  })

  it('bills an approved positive change order once, then balance excludes it', () => {
    const co = planInvoice(base(), { kind: 'change_order', changeOrderId: 'co1' })
    expect(co).toEqual({ amountCents: 51500 })
    const live = [
      { kind: 'deposit' as const, amount_cents: 100000, change_order_id: null },
      { kind: 'change_order' as const, amount_cents: 51500, change_order_id: 'co1' },
    ]
    const balance = planInvoice(base({ liveInvoices: live }), { kind: 'balance' })
    expect(balance).toEqual({ amountCents: 348600 - 100000 - 10000 })
    expect(100000 + 51500 + (balance.amountCents ?? 0)).toBe(390100)
    expect(planInvoice(base({ liveInvoices: live }), { kind: 'change_order', changeOrderId: 'co1' }).error).toMatch(
      /already has an invoice/,
    )
  })

  it('refuses a credit, an unapproved change order and a full invoice on top of others', () => {
    expect(planInvoice(base(), { kind: 'change_order', changeOrderId: 'co2' }).error).toMatch(/credit/)
    expect(planInvoice(base(), { kind: 'change_order', changeOrderId: 'nope' }).error).toMatch(/approved/)
    expect(
      planInvoice(base({ liveInvoices: [{ kind: 'deposit', amount_cents: 100000, change_order_id: null }] }), {
        kind: 'full',
      }).error,
    ).toMatch(/already has an invoice issued/)
  })

  it('a change order already carried by the balance cannot be billed again', () => {
    const live = [
      { kind: 'deposit' as const, amount_cents: 100000, change_order_id: null },
      { kind: 'balance' as const, amount_cents: 348600 - 100000 + 41500, change_order_id: null },
    ]
    expect(planInvoice(base({ liveInvoices: live }), { kind: 'change_order', changeOrderId: 'co1' }).error).toMatch(
      /already included in the balance/,
    )
  })

  it('a change order approved after the balance was issued can still be billed on its own', () => {
    // Balance went out before co1 existed: estimate - deposit only.
    const live = [
      { kind: 'deposit' as const, amount_cents: 100000, change_order_id: null },
      { kind: 'balance' as const, amount_cents: 248600, change_order_id: null },
    ]
    const input = base({ approvedChangeOrders: [{ id: 'co1', number: 1, totalCents: 51500 }], liveInvoices: live })
    expect(planInvoice(input, { kind: 'change_order', changeOrderId: 'co1' })).toEqual({ amountCents: 51500 })
  })

  it('never lets live invoices pass the contract total', () => {
    // A credit approved after the full invoice: the contract shrank below what was billed.
    const input = base({
      approvedChangeOrders: [{ id: 'co2', number: 2, totalCents: -10000 }],
      liveInvoices: [{ kind: 'full', amount_cents: 348600, change_order_id: null }],
    })
    expect(summarizeInvoicing(input).remainingCents).toBe(-10000)
    expect(planInvoice(input, { kind: 'balance' }).error).toBeDefined()
  })

  it('reports nothing left when the balance would be zero or negative', () => {
    const input = base({
      depositCents: 348600,
      approvedChangeOrders: [{ id: 'co2', number: 2, totalCents: -10000 }],
      liveInvoices: [{ kind: 'deposit', amount_cents: 348600, change_order_id: null }],
    })
    expect(planInvoice(input, { kind: 'balance' }).error).toBe('Nothing left to invoice.')
  })
})

describe('balance after a live deposit bills what remains', () => {
  const noCo = (over: Partial<InvoicingInput> = {}) => base({ approvedChangeOrders: [], ...over })

  it('a 30% deposit followed by a 50% balance request still bills the remaining 70%', () => {
    // Deposit invoice issued at 30% of $1,000.00; the balance form later asks for a 50% split.
    const input = noCo({
      estimateTotalCents: 100000,
      depositCents: 50000,
      liveInvoices: [{ kind: 'deposit', amount_cents: 30000, change_order_id: null }],
    })
    expect(invoiceAmountCents(input, { kind: 'balance' })).toBe(70000)
    expect(planInvoice(input, { kind: 'balance' })).toEqual({ amountCents: 70000 })
  })

  it('with no live deposit the balance is computed as before', () => {
    const input = noCo({ estimateTotalCents: 100000, depositCents: 30000 })
    expect(hasLiveDepositInvoice(input)).toBe(false)
    expect(invoiceAmountCents(input, { kind: 'balance' })).toBe(70000)
  })

  it('a void deposit (not in liveInvoices) does not count', () => {
    const input = noCo({ estimateTotalCents: 100000, depositCents: 30000, liveInvoices: [] })
    expect(hasLiveDepositInvoice(input)).toBe(false)
  })

  it('subtracts change orders billed alone and keeps the one-balance-per-estimate guard', () => {
    const live = [
      { kind: 'deposit' as const, amount_cents: 20000, change_order_id: null },
      { kind: 'change_order' as const, amount_cents: 51500, change_order_id: 'co1' },
    ]
    const input = base({
      estimateTotalCents: 100000,
      depositCents: 99999,
      approvedChangeOrders: [{ id: 'co1', number: 1, totalCents: 51500 }],
      liveInvoices: live,
    })
    expect(planInvoice(input, { kind: 'balance' })).toEqual({ amountCents: 100000 + 51500 - 20000 - 51500 })
    const withBalance = { ...input, liveInvoices: [...live, { kind: 'balance' as const, amount_cents: 80000, change_order_id: null }] }
    expect(planInvoice(withBalance, { kind: 'balance' }).error).toMatch(/balance invoice has already been issued/)
  })

  it('never bills above the contract', () => {
    const input = noCo({
      estimateTotalCents: 100000,
      depositCents: 30000,
      liveInvoices: [{ kind: 'deposit', amount_cents: 100000, change_order_id: null }],
    })
    expect(planInvoice(input, { kind: 'balance' }).error).toBe('Nothing left to invoice.')
  })
})
