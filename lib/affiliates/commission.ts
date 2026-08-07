/**
 * SEED-054 — commission arithmetic. PURE module (no `server-only`, no DB, no
 * Stripe): every value it needs is passed in, so the accrual path's decisions
 * are unit-testable without a database or a webhook fixture.
 *
 * Mirrors lib/billing/estimate-fee.ts's shape: integer cents in, integer cents
 * out, no floats crossing the boundary.
 */

/**
 * Commission in integer cents for one paid invoice.
 *
 *   - a non-positive base or a non-positive rate yields 0 (nothing to accrue)
 *   - `basePct × baseAmountCents` is rounded to the nearest cent
 *   - the result is CLAMPED to the base: a misconfigured rate above 1.0 must
 *     never pay an affiliate more than the customer paid. (The DB CHECK also
 *     caps the stored rate at 1, so this is defence in depth, not the only
 *     guard.)
 *
 * Callers pass the ALREADY-RESOLVED rate — the per-affiliate override if set,
 * otherwise `billing_config.affiliate.commissionPct`. Resolution itself lives in
 * {@link resolveCommissionPct} so both live in one testable place.
 */
export function computeCommissionCents(
  baseAmountCents: number,
  pct: number
): number {
  if (!(baseAmountCents > 0)) return 0
  if (!(pct > 0)) return 0
  const raw = Math.round(baseAmountCents * pct)
  return Math.min(raw, baseAmountCents)
}

/**
 * The rate to snapshot on a commission row: the affiliate's negotiated override
 * when present, else the platform default. `null` override means "no special
 * deal" — NOT "zero" — so the `?? ` fallthrough is deliberate and must not be
 * written as `override || defaultPct` (an intentional 0% override, used to park
 * a suspended affiliate at no cost, would silently revert to the default).
 */
export function resolveCommissionPct(
  overridePct: number | null | undefined,
  defaultPct: number
): number {
  return overridePct ?? defaultPct
}

/**
 * End of a referral's earning window, computed ONCE at attribution time and
 * frozen on the row. Adding months (rather than days) keeps the window aligned
 * with subscription anniversaries.
 *
 * `durationMonths <= 0` means "no window" → the returned date is `null`, which
 * {@link isWithinCommissionWindow} treats as unlimited (the lifetime-commission
 * configuration).
 */
export function commissionWindowEnd(
  attributedAt: Date,
  durationMonths: number
): Date | null {
  if (!(durationMonths > 0)) return null
  const end = new Date(attributedAt.getTime())
  // setUTCMonth normalizes overflow for us: Jan 31 + 1 month → Mar 3 rather
  // than an invalid date. Slightly generous at month boundaries, which is the
  // right direction to err for the affiliate.
  end.setUTCMonth(end.getUTCMonth() + durationMonths)
  return end
}

/**
 * True when an invoice paid at `paidAt` still falls inside the referral's
 * window. A `null` end date is the lifetime configuration (always inside).
 * The boundary is INCLUSIVE — an invoice landing exactly on the last
 * millisecond still earns.
 */
export function isWithinCommissionWindow(
  paidAt: Date,
  windowEndsAt: Date | null
): boolean {
  if (windowEndsAt === null) return true
  return paidAt.getTime() <= windowEndsAt.getTime()
}

/**
 * When an accrued commission becomes eligible for transfer: accrual time plus
 * the refund/chargeback hold. Until then the commission sits at `pending`, so a
 * refund is a DB state change (`reversed`) rather than a clawback from an
 * individual's bank account.
 *
 * `holdDays <= 0` means payable immediately — supported, but a deliberate
 * choice the super-admin has to make.
 */
export function commissionPayableAt(accruedAt: Date, holdDays: number): Date {
  const days = holdDays > 0 ? holdDays : 0
  return new Date(accruedAt.getTime() + days * 24 * 60 * 60 * 1000)
}

/**
 * Whether a batch of payable commissions clears the minimum transfer threshold.
 * Below it, the balance rolls forward — Stripe charges per transfer, so paying
 * out $0.80 costs more than it moves.
 */
export function meetsPayoutThreshold(
  payableCents: number,
  minPayoutCents: number
): boolean {
  return payableCents > 0 && payableCents >= minPayoutCents
}
