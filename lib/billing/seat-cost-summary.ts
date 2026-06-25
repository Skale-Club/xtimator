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

/**
 * Build the seat-cost summary for `companyId` given its live `activeMembers`
 * count (the roster member rows). Reuses the pure seat functions over the
 * resolved config — never inline arithmetic, never a hardcoded seat number.
 *
 * The included-seat count comes from the company's tier; an unknown/null tier
 * falls back to the free tier's includedSeats (same null-safe posture as the
 * Phase-139 sync — never throw on a bad tier). enforcementEnabled passes through so the
 * UI can show a truthful "not yet billed" note while enforcement is off.
 */
export async function buildSeatCostSummary(
  companyId: string,
  activeMembers: number,
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

  // REUSE the pure math — do NOT re-implement the seat arithmetic.
  const billableSeats = computeBillableSeats(activeMembers, includedSeats)
  const monthlyCents = computeSeatChargeCents(billableSeats, cfg.seatPriceCents)

  return {
    activeSeats: activeMembers,
    includedSeats,
    billableSeats,
    perSeatCents: cfg.seatPriceCents,
    monthlyCents,
    enforcementEnabled: cfg.enforcementEnabled,
  }
}
