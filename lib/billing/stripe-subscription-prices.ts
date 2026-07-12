import 'server-only'
import type Stripe from 'stripe'
import { getStripeClient } from '@/lib/billing/stripe-client'
import type { BillingConfigInput } from '@/lib/schemas/admin'

/**
 * Panel-managed subscription Prices (v4.18) — the admin types a dollar amount in
 * the billing-config form and SAVING provisions/refreshes a real Stripe Price,
 * storing its id in billing_config.tiers[t].stripePriceIdMonth/Year. Checkout then
 * charges that id. NO Stripe dashboard, NO env vars, NO deploy.
 *
 * Mirrors the ensureSeatProduct/syncSubscriptionSeatItem precedent in
 * lib/billing/stripe-client.ts: ONE metadata-tagged Product per tier, found and
 * reused across saves; the Price carries the config-driven unit_amount.
 *
 * BEHAVIOR NOTE: changing a tier's price creates a NEW Stripe Price and archives
 * the old one — existing subscribers keep the price they signed up on until they
 * switch plans (standard Stripe behavior). Only NEW checkouts use the new price.
 */

type Interval = 'month' | 'year'
type PricedTier = 'pro' | 'business'

const TIER_PRODUCT_NAMES: Record<PricedTier, string> = {
  pro: 'Xtimator Pro',
  business: 'Xtimator Business',
}

/**
 * Find-or-create the metadata-tagged subscription Product for a tier
 * (metadata.kind === `subscription_${tier}`), reused across every save. A Price
 * requires a backing Product id, so we provision ONE tagged product the first
 * time and reuse it forever — the unit_amount stays config-driven on the Price.
 */
export async function ensureTierProduct(stripe: Stripe, tier: PricedTier): Promise<string> {
  const kind = `subscription_${tier}`
  const existing = await stripe.products.search({
    query: `active:'true' AND metadata['kind']:'${kind}'`,
    limit: 1,
  })
  const found = existing.data[0]
  if (found) return found.id
  const created = await stripe.products.create({
    name: TIER_PRODUCT_NAMES[tier],
    metadata: { kind },
  })
  return created.id
}

/**
 * Reconcile ONE tier/interval Price to the config dollar amount.
 *   - amountCents <= 0 → null (free tier / unpriced): nothing to charge.
 *   - currentPriceId present and still matches (same unit_amount, active, same
 *     recurring interval) → returned unchanged (idempotent — no new Price when
 *     nothing changed, so a no-op save never churns Stripe Prices).
 *   - otherwise → create a new recurring Price and best-effort archive the old
 *     one (a failed archive never throws — the new id is still returned).
 */
export async function syncTierPrice(
  stripe: Stripe,
  tier: PricedTier,
  interval: Interval,
  amountCents: number,
  currentPriceId: string | null
): Promise<string | null> {
  if (amountCents <= 0) return null

  if (currentPriceId) {
    try {
      const existing = await stripe.prices.retrieve(currentPriceId)
      if (
        existing.active &&
        existing.unit_amount === amountCents &&
        existing.recurring?.interval === interval
      ) {
        return currentPriceId
      }
    } catch {
      // Stored id no longer resolves at Stripe — fall through and create a fresh Price.
    }
  }

  const product = await ensureTierProduct(stripe, tier)
  const created = await stripe.prices.create({
    currency: 'usd',
    unit_amount: amountCents,
    recurring: { interval },
    product,
    metadata: { kind: `subscription_${tier}`, term: interval },
  })

  if (currentPriceId && currentPriceId !== created.id) {
    try {
      await stripe.prices.update(currentPriceId, { active: false })
    } catch {
      // Never throw for a bad archive — the new Price is live regardless.
    }
  }

  return created.id
}

export type TierPriceIdMap = {
  pro: { month: string | null; year: string | null }
  business: { month: string | null; year: string | null }
}

/**
 * Refresh all four subscription Prices (pro/business × month/year) from the
 * config dollar amounts, returning the updated id map to merge back into the
 * persisted JSON. A missing Stripe key (getStripeClient throws) is a NO-OP: the
 * EXISTING ids are returned unchanged and a warning is logged — saving the
 * config must NEVER fail because Stripe is unconfigured.
 */
export async function syncAllTierPrices(cfg: BillingConfigInput): Promise<TierPriceIdMap> {
  const existing: TierPriceIdMap = {
    pro: {
      month: cfg.tiers.pro.stripePriceIdMonth,
      year: cfg.tiers.pro.stripePriceIdYear,
    },
    business: {
      month: cfg.tiers.business.stripePriceIdMonth,
      year: cfg.tiers.business.stripePriceIdYear,
    },
  }

  let stripe: Stripe
  try {
    stripe = await getStripeClient()
  } catch (err) {
    console.warn(
      '[stripe-subscription-prices] Stripe unconfigured — keeping existing price ids:',
      err instanceof Error ? err.message : err
    )
    return existing
  }

  const tiers: PricedTier[] = ['pro', 'business']
  const result: TierPriceIdMap = {
    pro: { month: null, year: null },
    business: { month: null, year: null },
  }
  for (const tier of tiers) {
    result[tier].month = await syncTierPrice(
      stripe,
      tier,
      'month',
      cfg.tiers[tier].subscriptionPriceCents,
      existing[tier].month
    )
    result[tier].year = await syncTierPrice(
      stripe,
      tier,
      'year',
      cfg.tiers[tier].subscriptionPriceAnnualCents,
      existing[tier].year
    )
  }
  return result
}
