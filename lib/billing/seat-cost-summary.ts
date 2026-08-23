import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { getBillingConfig, type BillingTier } from '@/lib/billing/billing-config'
import { computeBillableSeats, computeSeatChargeCents } from '@/lib/billing/seat-billing'

/**
 * Phase 140 — seat-cost transparency (SEAT-08).
 *
 * The server-side summary builder behind the Settings → Team seat-cost line. It
 * reads getBillingConfig() (the ONE configurable home for the seat price + the
 * per-tier includedSeats) + the company's tier, then REUSES the pure
 * computeBillableSeats/computeSeatChargeCents from seat-billing.ts — the SAME
 * math the Phase-139 sync uses — so the disclosed monthly cost can never diverge
 * from what would actually be charged. NOTHING is hardcoded here: every number
 * comes from `cfg`.
 *
 * `import 'server-only'`: this reads getBillingConfig + the service client, so it
 * is server-only exactly like seat-billing's server-side half.
 *
 * Scope fence: DISPLAY ONLY. No Stripe write, no billing mutation, no config
 * write — Phase 139 owns the seat-quantity sync. This builder just discloses.
 */

export type SeatCostSummary = {
  activeSeats: number
  includedSeats: number
  billableSeats: number
  perSeatCents: number
  monthlyCents: number
  enforcementEnabled: boolean
}

/** Stripe subscription recurring interval — 'month' or 'year'. */
export type SeatBillingInterval = 'month' | 'year'

/**
 * Build the seat-cost summary for `companyId` given its live `activeMembers`
 * count (the roster member rows). Reuses the pure seat functions over the
 * resolved config — never inline arithmetic, never a hardcoded seat number.
 *
 * The included-seat count comes from the company's tier; an unknown/null tier
 * falls back to the free tier's includedSeats (same null-safe posture as the
 * Phase-139 sync — never throw on a bad tier). enforcementEnabled passes through so the
 * UI can show a truthful "not yet billed" note while enforcement is off.
 *
 * `interval` — the company's ACTUAL subscription billing interval. The
 * Phase-139 sync charges `seatPriceAnnualCents` on an annual subscription and
 * `seatPriceCents` on a monthly one (see lib/billing/seat-billing.ts); this
 * builder must quote the SAME unit amount or the disclosed cost diverges from
 * what's actually charged. There is no persisted interval column on
 * `companies` today, so the caller is responsible for supplying it (e.g. from
 * a Stripe subscription read) — this defaults to 'month' when omitted, which
 * silently under-discloses for an annual subscriber, so callers that know the
 * company is on an annual plan MUST pass `interval: 'year'` explicitly.
 */
export async function buildSeatCostSummary(
  companyId: string,
  activeMembers: number,
  interval: SeatBillingInterval = 'month',
): Promise<SeatCostSummary> {
  const cfg = await getBillingConfig()

  const { data: companyRow } = await requireServiceClient()
    .from('companies')
    .select('tier')
    .eq('id', companyId)
    .single()
  const tier = ((companyRow as { tier?: string | null } | null)?.tier ?? 'free') as BillingTier

  // null-safe fallback — mirror seat-billing.ts (never throw on a bad tier).
  const includedSeats = cfg.tiers[tier]?.includedSeats ?? cfg.tiers.free.includedSeats

  // Match the unit amount to the interval actually charged. NOTE: `??` would
  // NOT fall back here — seatPriceAnnualCents is a non-nullable `number`
  // defaulting to 0 (unpriced placeholder), and `0 ?? x` evaluates to 0. Use
  // an explicit "> 0" check instead, same pitfall seat-billing.ts guards against.
  const perSeatCents =
    interval === 'year' && cfg.seatPriceAnnualCents > 0
      ? cfg.seatPriceAnnualCents
      : cfg.seatPriceCents

  // REUSE the pure math — do NOT re-implement the seat arithmetic.
  const billableSeats = computeBillableSeats(activeMembers, includedSeats)
  const monthlyCents = computeSeatChargeCents(billableSeats, perSeatCents)

  return {
    activeSeats: activeMembers,
    includedSeats,
    billableSeats,
    perSeatCents,
    monthlyCents,
    enforcementEnabled: cfg.enforcementEnabled,
  }
}
