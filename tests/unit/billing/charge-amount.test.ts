import { describe, it, expect } from 'vitest'
import { resolveChargeAmount } from '@/lib/billing/charge-amount'
import { computeApplicationFee } from '@/lib/billing/estimate-fee'

/**
 * DEP-02 — charge-amount + 1%-on-charged-amount fee goldens.
 *
 * All goldens HAND-COMPUTED in USD (2-decimal → toMinorUnits multiplies by 100).
 * Each case ALSO asserts the platform application fee composed by the caller via
 * the EXISTING computeApplicationFee at 1% (feePct 0.01) — proving the contract:
 * the fee lands on the AMOUNT ACTUALLY CHARGED (the deposit when configured, else
 * the grandTotal). The min floor is kept below the expected fee so it never
 * overrides the percentage.
 */
describe('resolveChargeAmount (DEP-02)', () => {
  const FEE_PCT = 0.01 // 1%

  it('deposit_type "percent": charges the deposit; fee is 1% of the deposit', () => {
    // total $1000 → 100000 cents; 25% deposit → round(100000 × 25/100) = 25000 cents ($250)
    const { chargeAmountCents } = resolveChargeAmount(
      { total: 1000, deposit_type: 'percent', deposit_value: 25 },
      'USD',
    )
    expect(chargeAmountCents).toBe(25000)
    // fee = round(25000 × 0.01) = 250 cents ($2.50); min 0 so the floor doesn't override
    expect(computeApplicationFee(chargeAmountCents, FEE_PCT, 0)).toBe(250)
  })

  it('deposit_type "amount": charges the fixed deposit; fee is 1% of it', () => {
    // total $1000 → 100000 cents; fixed $400 deposit → 40000 cents
    const { chargeAmountCents } = resolveChargeAmount(
      { total: 1000, deposit_type: 'amount', deposit_value: 400 },
      'USD',
    )
    expect(chargeAmountCents).toBe(40000)
    // fee = round(40000 × 0.01) = 400 cents
    expect(computeApplicationFee(chargeAmountCents, FEE_PCT, 0)).toBe(400)
  })

  it('deposit_type "none": charges the full grandTotal; fee is 1% of the grandTotal', () => {
    // total $1000 → 100000 cents; no deposit → charge the full total
    const { chargeAmountCents } = resolveChargeAmount(
      { total: 1000, deposit_type: 'none', deposit_value: null },
      'USD',
    )
    expect(chargeAmountCents).toBe(100000)
    // fee = round(100000 × 0.01) = 1000 cents (1% of the FULL grandTotal — the charged amount)
    expect(computeApplicationFee(chargeAmountCents, FEE_PCT, 0)).toBe(1000)
  })

  it('null deposit_type: treated as no deposit → charges the full grandTotal', () => {
    const { chargeAmountCents } = resolveChargeAmount(
      { total: 1000, deposit_type: null, deposit_value: null },
      'USD',
    )
    expect(chargeAmountCents).toBe(100000)
  })

  it('deposit amount exceeding the total is clamped to the total (never charge more)', () => {
    // total $1000 → 100000 cents; fixed $1500 deposit → clamped to 100000 cents
    const { chargeAmountCents } = resolveChargeAmount(
      { total: 1000, deposit_type: 'amount', deposit_value: 1500 },
      'USD',
    )
    expect(chargeAmountCents).toBe(100000)
    expect(computeApplicationFee(chargeAmountCents, FEE_PCT, 0)).toBe(1000)
  })

  it('null total → 0 charge', () => {
    const { chargeAmountCents } = resolveChargeAmount(
      { total: null, deposit_type: 'percent', deposit_value: 25 },
      'USD',
    )
    expect(chargeAmountCents).toBe(0)
  })
})
