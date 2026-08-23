/**
 * Platform application fee in integer cents (FEE-04). Stripe requires the fee to be
 * POSITIVE and STRICTLY LESS than the charge amount. If a checkout pay-route is ever
 * re-introduced (FEE-02), it MUST compute its payment_intent_data.application_fee_amount
 * with THIS helper so the fee math lives in exactly one place.
 *
 * Pure module — NO `import 'server-only'`: it must be unit-testable and importable
 * from anywhere. The fee percentage and minimum are passed in by the caller, which
 * reads them from billing_config at runtime (FEE-03 lives in the action, never here).
 *
 * Returns 0 when no positive fee strictly below the charge is possible (amount <= 0,
 * pct <= 0, or the 1-cent edge where amount - 1 === 0); the caller omits the field
 * entirely in that case (Stripe rejects a $0 application fee — Pitfall 1).
 */
export function computeApplicationFee(
  amountCents: number,
  feePct: number,
  minCents: number,
): number {
  if (amountCents <= 0 || feePct <= 0) return 0
  const raw = Math.round(amountCents * feePct)
  const floored = Math.max(raw, minCents)
  // Policy ceiling: an admin-set minimum fee (minCents) must never let the
  // fee eat more than 10% of the charge — e.g. a $5.00 min fee taking $1.49
  // of a $1.50 invoice. amountCents - 1 remains the hard Stripe-mandated cap
  // (the fee must be strictly less than the charge amount).
  const policyCeilingCents = Math.floor(amountCents * 0.1)
  return Math.max(0, Math.min(floored, policyCeilingCents, amountCents - 1))
}
