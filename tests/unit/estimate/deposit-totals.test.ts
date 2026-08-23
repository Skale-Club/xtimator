import { describe, it, expect } from 'vitest'
import { computeEstimateTotals } from '@/lib/estimate/compute-totals'
import { resolveChargeAmount } from '@/lib/billing/charge-amount'
import { toMinorUnits } from '@/lib/money/currency'
import { saveEstimateSchema } from '@/lib/schemas/estimate'

// DEP-01 (server math): the LOCKED deposit sequence, computed AFTER grandTotal —
//   deposit = (deposit_type==='percent' ? round2(grandTotal × deposit_value/100)
//            : deposit_type==='amount'  ? round2(deposit_value)
//            : 0)
//   balanceDue = round2(grandTotal − deposit)
// deposit_type absent / 'none' / null → deposit 0 → balanceDue = grandTotal (byte-identical retrocompat).
// The pure math is a faithful subtraction (NO clamp here — out-of-range guarding is a Phase-133
// editor concern). Every golden below is HAND-COMPUTED.
describe('DEP-01: deposit + balance_due (LOCKED sequence after grandTotal)', () => {
  // A simple section so grandTotal is trivially hand-verifiable:
  //   line_net = 1×1000 = 1000 → subtotal 1000 ; taxAmount 1000×0.1 = 100 ; grandTotal 1100.
  const sections = [{ title: 'A', items: [{ quantity: 1, unit_price: 1000 }] }]

  it('Test 1 — PERCENT: deposit = round2(grandTotal × pct/100); balanceDue = grandTotal − deposit', () => {
    const r = computeEstimateTotals(sections, {
      taxRate: 0.1,
      depositType: 'percent',
      depositValue: 25,
    })

    expect(r.grandTotal).toBe(1100)
    expect(r.deposit).toBe(275) // round2(1100 × 25/100)
    expect(r.balanceDue).toBe(825) // round2(1100 − 275)
  })

  it('Test 2 — AMOUNT: deposit = deposit_value; balanceDue = grandTotal − deposit_value', () => {
    const r = computeEstimateTotals(sections, {
      taxRate: 0.1,
      depositType: 'amount',
      depositValue: 400,
    })

    expect(r.grandTotal).toBe(1100)
    expect(r.deposit).toBe(400)
    expect(r.balanceDue).toBe(700) // round2(1100 − 400)
  })

  it('Test 3 — NONE / omitted: deposit 0, balanceDue = grandTotal, totals byte-identical', () => {
    const r = computeEstimateTotals(sections, { taxRate: 0.1 })

    expect(r.deposit).toBe(0)
    expect(r.balanceDue).toBe(1100) // === grandTotal
    // Byte-identical retrocompat: deposit scaffold collapses to today's numbers.
    expect(r.subtotal).toBe(1000)
    expect(r.taxAmount).toBe(100)
    expect(r.grandTotal).toBe(1100)
  })

  it('Test 4 — AMOUNT > grandTotal: deposit clamped to grandTotal, balanceDue floored at 0 (BILL-CONSTRAINT-01 FIX 1)', () => {
    const r = computeEstimateTotals(sections, {
      taxRate: 0.1,
      depositType: 'amount',
      depositValue: 1500,
    })

    expect(r.grandTotal).toBe(1100)
    // FIX 1: the deposit itself is now clamped to [0, grandTotal] (via
    // resolveChargeAmount) — not just balanceDue. A bad legacy row (or a
    // deposit_value that somehow bypassed the schema's own >100/negative
    // rejection) can never render a deposit exceeding the total on any surface.
    expect(r.deposit).toBe(1100)
    expect(r.balanceDue).toBe(0) // floored at 0 (deposit exceeding total → balanceDue 0)
  })
})

// BILL-CONSTRAINT-01 (FIX 1): the deposit clamp is a strict [0, grandTotal]
// bound, proven from both directions — an amount deposit above the total
// clamps down (Test 4 above), and (defensively, since the schema now rejects
// negative deposit_value at the boundary) a negative amount never renders
// negative here either, mirroring the same resolveChargeAmount floor.
describe('BILL-CONSTRAINT-01 FIX 1: deposit clamp is symmetric (never negative, never > grandTotal)', () => {
  const sections = [{ title: 'A', items: [{ quantity: 1, unit_price: 1000 }] }]

  it('a defensively-negative deposit_value (e.g. a pre-constraint legacy row) never renders a negative deposit', () => {
    const r = computeEstimateTotals(sections, {
      taxRate: 0.1,
      depositType: 'amount',
      depositValue: -500,
    })

    expect(r.grandTotal).toBe(1100)
    expect(r.deposit).toBe(0) // floored — never negative
    expect(r.balanceDue).toBe(1100) // === grandTotal, since deposit is 0
  })

  it('a percent deposit_value above 100 (e.g. a pre-constraint legacy row) clamps deposit to grandTotal', () => {
    const r = computeEstimateTotals(sections, {
      taxRate: 0.1,
      depositType: 'percent',
      depositValue: 150,
    })

    expect(r.grandTotal).toBe(1100)
    expect(r.deposit).toBe(1100) // clamped, not 1650
    expect(r.balanceDue).toBe(0)
  })
})

// BILL-CONSTRAINT-01 (FIX 2): compute-totals now resolves the deposit through
// resolveChargeAmount's cents-space math — the SAME authority the Stripe
// charge amount uses — so the printed deposit and the invoiced charge can
// never disagree by a minor unit. Each case below reproduces a total/percent
// pair where the OLD dollar-space Math.round(grandTotal * pct/100 * 100)/100
// and the cents-space math land on opposite sides of a half-cent tie; asserted
// as a direct parity check against resolveChargeAmount (the single source of
// truth), not a hand-rounded number, so the test is immune to which side of
// the tie either formula happens to land on.
describe('BILL-CONSTRAINT-01 FIX 2: compute-totals deposit is cents-identical to resolveChargeAmount', () => {
  const cases: Array<{ total: number; pct: number }> = [
    { total: 10.03, pct: 50 }, // the exact case from the audit: $10.03 @ 50%
    { total: 0.29, pct: 50 },
    { total: 19.995, pct: 50 },
    { total: 19.995, pct: 33 },
    { total: 100.01, pct: 30 },
  ]

  for (const { total, pct } of cases) {
    it(`total $${total} @ ${pct}% deposit — cents match resolveChargeAmount exactly`, () => {
      // A single line item at quantity 1 with tax off keeps grandTotal === total
      // (modulo the engine's own line-rounding, which is a no-op for these values).
      const sections = [{ title: 'A', items: [{ quantity: 1, unit_price: total }] }]
      const r = computeEstimateTotals(sections, {
        taxRate: 0,
        depositType: 'percent',
        depositValue: pct,
      })

      const { chargeAmountCents } = resolveChargeAmount(
        { total: r.grandTotal, deposit_type: 'percent', deposit_value: pct },
        'USD'
      )

      expect(toMinorUnits(r.deposit, 'USD')).toBe(chargeAmountCents)
    })
  }
})

// BILL-CONSTRAINT-01 (FIX 1): zod rejection of negative / over-100 deposit_value
// at the saveEstimate boundary (lib/schemas/estimate.ts), backing the engine
// clamp above with a hard reject at the API surface.
describe('BILL-CONSTRAINT-01 FIX 1: saveEstimateSchema deposit_value validation', () => {
  function baseInput(overrides: Record<string, unknown> = {}) {
    return {
      id: 'est_1',
      summary: null,
      notes: null,
      timeline: null,
      payment_terms: null,
      warranty_terms: null,
      discount_type: null,
      discount_value: 0,
      tax_rate: 0.0875,
      estimate_date: null,
      estimate_number: null,
      sections: [],
      deposit_type: 'percent',
      deposit_value: 25,
      ...overrides,
    }
  }

  it('accepts a valid percent deposit_value (control case)', () => {
    const result = saveEstimateSchema.safeParse(baseInput())
    expect(result.success).toBe(true)
  })

  it('rejects a negative deposit_value', () => {
    const result = saveEstimateSchema.safeParse(
      baseInput({ deposit_type: 'amount', deposit_value: -500 })
    )
    expect(result.success).toBe(false)
  })

  it('accepts zero deposit_value (0 is not negative)', () => {
    const result = saveEstimateSchema.safeParse(
      baseInput({ deposit_type: 'amount', deposit_value: 0 })
    )
    expect(result.success).toBe(true)
  })

  it('rejects a percent deposit_value above 100', () => {
    const result = saveEstimateSchema.safeParse(
      baseInput({ deposit_type: 'percent', deposit_value: 150 })
    )
    expect(result.success).toBe(false)
  })

  it('accepts exactly 100 for a percent deposit_value (boundary — not rejected)', () => {
    const result = saveEstimateSchema.safeParse(
      baseInput({ deposit_type: 'percent', deposit_value: 100 })
    )
    expect(result.success).toBe(true)
  })

  it('does NOT cap an "amount" deposit_value at 100 — only "percent" is capped', () => {
    const result = saveEstimateSchema.safeParse(
      baseInput({ deposit_type: 'amount', deposit_value: 5000 })
    )
    expect(result.success).toBe(true)
  })
})
