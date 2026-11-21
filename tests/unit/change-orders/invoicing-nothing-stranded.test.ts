import { describe, it, expect } from 'vitest'
import {
  planInvoice,
  summarizeInvoicing,
  type InvoicingApprovedChangeOrder,
  type InvoicingInput,
  type InvoicingLiveInvoice,
  type InvoiceKind,
} from '@/lib/change-orders/invoicing'

/**
 * Invoice integrity (unit-test audit): whatever order the owner bills in, and
 * whatever the deposit split is, the live invoices must add up to EXACTLY the
 * contract (estimate + approved change orders, credits included). Nothing may be
 * left unbillable, and nothing may be billed twice.
 */

// Deterministic PRNG so a failure is reproducible.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 0x100000000
  }
}

const live = (kind: InvoiceKind, amount_cents: number, change_order_id: string | null = null): InvoicingLiveInvoice => ({
  kind,
  amount_cents,
  change_order_id,
})

function bill(input: InvoicingInput, kind: 'deposit' | 'balance' | 'full'): InvoicingInput {
  const plan = planInvoice(input, { kind })
  if (plan.error !== undefined) throw new Error(`unexpected refusal for ${kind}: ${plan.error}`)
  return { ...input, liveInvoices: [...input.liveInvoices, live(kind, plan.amountCents)] }
}

describe('deposit then balance leaves nothing unbillable', () => {
  it.each([1, 10, 30, 33, 50, 70, 99])('a %i%% deposit, then the balance, bills the whole contract exactly', (pct) => {
    const total = 1_234_567
    const input: InvoicingInput = {
      estimateTotalCents: total,
      depositCents: Math.round((total * pct) / 100),
      approvedChangeOrders: [],
      liveInvoices: [],
    }
    const afterDeposit = bill(input, 'deposit')
    const afterBalance = bill(afterDeposit, 'balance')
    const s = summarizeInvoicing(afterBalance)
    expect(s.alreadyInvoicedCents).toBe(total)
    expect(s.remainingCents).toBe(0)
    // nothing left, and nothing can be billed again
    for (const kind of ['deposit', 'balance', 'full'] as const) {
      expect(planInvoice(afterBalance, { kind }).error).toBeTruthy()
    }
  })

  it('balance first, then the deposit: same total', () => {
    const input: InvoicingInput = { estimateTotalCents: 100000, depositCents: 30000, approvedChangeOrders: [], liveInvoices: [] }
    const done = bill(bill(input, 'balance'), 'deposit')
    expect(summarizeInvoicing(done).remainingCents).toBe(0)
  })

  it('with a balance requested after a deposit of a DIFFERENT percent than configured, the contract still reconciles', () => {
    // The configured deposit is 50%, but a 30% deposit invoice is live (issued earlier).
    const input: InvoicingInput = {
      estimateTotalCents: 100000,
      depositCents: 50000,
      approvedChangeOrders: [],
      liveInvoices: [live('deposit', 30000)],
    }
    const done = bill(input, 'balance')
    expect(summarizeInvoicing(done).remainingCents).toBe(0)
  })
})

describe('with change orders and credits', () => {
  const COS: InvoicingApprovedChangeOrder[] = [
    { id: 'co1', number: 1, totalCents: 51500 },
    { id: 'co2', number: 2, totalCents: -10000 },
  ]

  it('deposit, one change order alone, then the balance: sums to the contract', () => {
    let input: InvoicingInput = { estimateTotalCents: 348600, depositCents: 100000, approvedChangeOrders: COS, liveInvoices: [] }
    input = bill(input, 'deposit')
    const co = planInvoice(input, { kind: 'change_order', changeOrderId: 'co1' })
    expect(co).toEqual({ amountCents: 51500 })
    input = { ...input, liveInvoices: [...input.liveInvoices, live('change_order', 51500, 'co1')] }
    input = bill(input, 'balance')
    const s = summarizeInvoicing(input)
    expect(s.contractCents).toBe(348600 + 51500 - 10000)
    expect(s.alreadyInvoicedCents).toBe(s.contractCents)
    expect(s.remainingCents).toBe(0)
  })

  it('deposit then balance with an unbilled change order and a credit: the balance carries both', () => {
    let input: InvoicingInput = { estimateTotalCents: 348600, depositCents: 100000, approvedChangeOrders: COS, liveInvoices: [] }
    input = bill(input, 'deposit')
    input = bill(input, 'balance')
    const s = summarizeInvoicing(input)
    expect(s.alreadyInvoicedCents).toBe(348600 + 51500 - 10000)
    expect(s.remainingCents).toBe(0)
    // the change order is carried by the balance: billing it alone would double bill it
    expect(planInvoice(input, { kind: 'change_order', changeOrderId: 'co1' }).error).toMatch(/already included in the balance|fully invoiced/)
  })

  it('a change order approved after the balance is still billable, exactly once', () => {
    let input: InvoicingInput = { estimateTotalCents: 100000, depositCents: 30000, approvedChangeOrders: [], liveInvoices: [] }
    input = bill(bill(input, 'deposit'), 'balance')
    input = { ...input, approvedChangeOrders: [{ id: 'co9', number: 9, totalCents: 25000 }] }
    expect(planInvoice(input, { kind: 'change_order', changeOrderId: 'co9' })).toEqual({ amountCents: 25000 })
    input = { ...input, liveInvoices: [...input.liveInvoices, live('change_order', 25000, 'co9')] }
    expect(summarizeInvoicing(input).remainingCents).toBe(0)
    expect(planInvoice(input, { kind: 'change_order', changeOrderId: 'co9' }).error).toBeTruthy()
  })

  it('randomized orders and splits always reconcile to the contract and never over-bill', () => {
    const rand = rng(20261121)
    for (let n = 0; n < 400; n++) {
      const estimate = 10_000 + Math.floor(rand() * 5_000_000)
      const pct = 1 + Math.floor(rand() * 98)
      const coCount = Math.floor(rand() * 4)
      const cos: InvoicingApprovedChangeOrder[] = Array.from({ length: coCount }, (_, i) => ({
        id: `co${i}`,
        number: i + 1,
        // mostly additions, some credits; credits never exceed the estimate
        totalCents: rand() < 0.3 ? -Math.floor(rand() * estimate * 0.1) - 1 : Math.floor(rand() * estimate * 0.3) + 1,
      }))
      const contract = estimate + cos.reduce((a, c) => a + c.totalCents, 0)
      let input: InvoicingInput = {
        estimateTotalCents: estimate,
        depositCents: Math.round((estimate * pct) / 100),
        approvedChangeOrders: cos,
        liveInvoices: [],
      }
      const label = `n=${n} estimate=${estimate} pct=${pct} cos=${JSON.stringify(cos)}`

      // Optionally bill positive change orders on their own first.
      for (const co of cos) {
        if (co.totalCents > 0 && rand() < 0.5) {
          const plan = planInvoice(input, { kind: 'change_order', changeOrderId: co.id })
          if (plan.error === undefined) {
            input = { ...input, liveInvoices: [...input.liveInvoices, live('change_order', plan.amountCents, co.id)] }
          }
        }
      }
      const order: Array<'deposit' | 'balance'> = rand() < 0.5 ? ['deposit', 'balance'] : ['balance', 'deposit']
      for (const kind of order) {
        const plan = planInvoice(input, { kind })
        if (plan.error !== undefined) continue // a refusal is fine; over-billing is not
        input = { ...input, liveInvoices: [...input.liveInvoices, live(kind, plan.amountCents)] }
        expect(summarizeInvoicing(input).alreadyInvoicedCents, label).toBeLessThanOrEqual(contract)
      }
      const s = summarizeInvoicing(input)
      expect(s.alreadyInvoicedCents, label).toBeLessThanOrEqual(contract)

      // Once a balance invoice exists and the deposit step has been tried in either
      // order, nothing of the contract may be stranded.
      if (input.liveInvoices.some((i) => i.kind === 'balance')) {
        expect(s.remainingCents, `stranded ${label}`).toBe(0)
      }
    }
  })
})
