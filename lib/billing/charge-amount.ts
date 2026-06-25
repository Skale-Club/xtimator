import { toMinorUnits } from '@/lib/money/currency'

export interface ChargeEstimateInput {
  total: number | null
  deposit_type: 'none' | 'percent' | 'amount' | null
  deposit_value: number | null
}

/**
 * DEP-02 — the amount the Stripe payment link / invoice charges, in integer minor units.
 * The deposit is what gets charged when one is configured; otherwise the full grandTotal.
 * The 1% platform application fee is computed by the caller ON THIS AMOUNT (the amount
 * actually charged) via lib/billing/estimate-fee.computeApplicationFee — the fee math stays
 * in exactly one place. A deposit exceeding the total is clamped to the total (never charge
 * more than the grandTotal). Server-side authority: the deposit was computed deterministically
 * by compute-totals (Plan 132-01); this only resolves it to cents.
 *
 * Pure module — NO `import 'server-only'`, no DB — so it is unit-testable and importable
 * from anywhere (mirrors estimate-fee.ts's posture).
 */
export function resolveChargeAmount(
  estimate: ChargeEstimateInput,
  currencyCode: string,
): { chargeAmountCents: number } {
  const total = estimate.total ?? 0
  const totalCents = toMinorUnits(total, currencyCode)
  if (estimate.deposit_type === 'percent') {
    const pct = estimate.deposit_value ?? 0
    const cents = Math.min(Math.round((totalCents * pct) / 100), totalCents)
    return { chargeAmountCents: Math.max(cents, 0) }
  }
  if (estimate.deposit_type === 'amount') {
    const depositCents = toMinorUnits(estimate.deposit_value ?? 0, currencyCode)
    return { chargeAmountCents: Math.max(Math.min(depositCents, totalCents), 0) }
  }
  // 'none' / null → charge the full grandTotal
  return { chargeAmountCents: totalCents }
}
