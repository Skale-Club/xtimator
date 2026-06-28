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

// ---- server-side sync (transitively server-only via its imports) ------------
import { requireServiceClient } from '@/lib/supabase/service'
import { getBillingConfig, type BillingTier } from '@/lib/billing/billing-config'
import {
  getStripeClient,
  syncSubscriptionSeatItem,
  SEAT_ITEM_METADATA_KIND,
} from '@/lib/billing/stripe-client'

/**
 * Reconcile the Stripe subscription seat-quantity item to the company's LIVE
 * member count. Mirrors recordCreditDebit (credit-ledger.ts): config read at
 * call time, gated by enforcementEnabled, best-effort never-throw — a
 * membership action must NEVER fail because Stripe (or the DB) is down.
 *
 * Decision flow (this function is the ONLY place that decides {quantity,
 * unitAmount}; the SDK write is the dumb syncSubscriptionSeatItem boundary):
 *   1. read cfg + the company's tier/subscription + the live active-member count
 *   2. billableSeats = computeBillableSeats(activeMembers, includedSeats)
 *   3. GATE: enforcement OFF → record-only, NO Stripe write (compute happened)
 *   4. RETROCOMPAT short-circuit: zero billable → NO Stripe write in EITHER mode
 *      (single-owner org within includedSeats)
 *   5. no stripe_subscription_id → nothing to sync
 *   6. IDEMPOTENCY: current seat item already at {billableSeats, seatPriceCents}
 *      → no-op; otherwise write via syncSubscriptionSeatItem
 *
 * NO seat number is hardcoded — quantity comes from the computed billable seats,
 * unitAmount from cfg.seatPriceCents.
 */
export async function syncSeatBilling(companyId: string): Promise<void> {
  try {
    const cfg = await getBillingConfig()
    const svc = requireServiceClient()

    // company tier + subscription
    const { data: companyRow } = await svc
      .from('companies')
      .select('tier, stripe_subscription_id')
      .eq('id', companyId)
      .single()
    const company = companyRow as {
      tier?: string | null
      stripe_subscription_id?: string | null
    } | null
    const tier = (company?.tier ?? 'free') as BillingTier
    const subscriptionId = company?.stripe_subscription_id ?? null

    // live active-member count (head:true → no rows fetched, just the count)
    const { count } = await svc
      .from('company_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('company_id', companyId)
    const activeMembers = count ?? 0

    // includedSeats from the resolved tier; fall back to the free tier when the
    // stored tier string is unknown (null-safe — never throw on a bad tier).
    const includedSeats =
      cfg.tiers[tier]?.includedSeats ?? cfg.tiers.free.includedSeats
    const billableSeats = computeBillableSeats(activeMembers, includedSeats)

    // GATE: enforcement OFF → compute-only, no Stripe write (mirror credit-ledger).
    if (!cfg.enforcementEnabled) return
    // RETROCOMPAT: zero billable → no Stripe write in either mode.
    if (billableSeats <= 0) return
    // Nothing to sync without a subscription.
    if (!subscriptionId) return

    const stripe = await getStripeClient()

    // IDEMPOTENCY: if the live seat item already matches the desired quantity +
    // unit_amount, do nothing (no SDK update). We read the current item off the
    // same subscription retrieve the SDK boundary uses.
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const seatItem = (subscription.items?.data ?? []).find(
      (it) => it.metadata?.kind === SEAT_ITEM_METADATA_KIND
    )
    const currentQuantity = seatItem?.quantity ?? null
    const currentUnitAmount = seatItem?.price?.unit_amount ?? null
    if (currentQuantity === billableSeats && currentUnitAmount === cfg.seatPriceCents) {
      return
    }

    await syncSubscriptionSeatItem(stripe, subscriptionId, {
      quantity: billableSeats,
      unitAmount: cfg.seatPriceCents,
      annualUnitAmount: cfg.seatPriceAnnualCents ?? undefined,
    })
  } catch (err) {
    // Best-effort: a seat-sync failure must NEVER break a membership operation.
    console.warn('[syncSeatBilling] swallowed:', err)
  }
}
