/**
 * Phase 139 — seat billing CORE (SEAT-07).
 *
 * Pure seat arithmetic + the server-side `syncSeatBilling(companyId)` that
 * reconciles the Stripe subscription seat-quantity item to the live member
 * count. The math mirrors estimate-fee.ts (PURE module — arithmetic in one
 * place, numbers passed in by the caller, NOTHING hardcoded here). The sync
 * mirrors credit-ledger.ts (enforcementEnabled gating, config read at call
 * time, best-effort never-throw).
 *
 * NO `import 'server-only'` at the top: the two compute helpers must be
 * unit-testable and importable from anywhere. `syncSeatBilling` imports
 * requireServiceClient + getBillingConfig (themselves server-only), so the
 * server boundary is enforced transitively at runtime — same posture as
 * estimate-fee staying pure while its callers are server-only.
 */

/**
 * Billable seats = the members beyond the tier's bundled (included) seats.
 * `max(0, floor(members) - floor(included))` — never negative, always an
 * integer. Non-finite inputs clamp to 0. The included-seat count is read from
 * billing_config by the caller (per-tier includedSeats) — never hardcoded here.
 */
export function computeBillableSeats(activeMembers: number, includedSeats: number): number {
  const m = Number.isFinite(activeMembers) ? Math.floor(activeMembers) : 0
  const inc = Number.isFinite(includedSeats) ? Math.floor(includedSeats) : 0
  return Math.max(0, m - inc)
}

/**
 * Seat charge in integer cents = billableSeats × seatPriceCents. Returns 0 when
 * either input is non-positive (zero billable seats, or the calibration
 * placeholder price of 0). seatPriceCents is read from billing_config by the
 * caller — never hardcoded here.
 */
export function computeSeatChargeCents(billableSeats: number, seatPriceCents: number): number {
  if (billableSeats <= 0 || seatPriceCents <= 0) return 0
  return Math.round(billableSeats * seatPriceCents)
}
