// lib/billing/stripe-price-map.ts
// Maps a Stripe subscription-item price id (or Price object) back to the
// internal tier.
// Used by the customer.subscription.updated webhook arm so a plan change made
// through the Customer Portal reflects in companies.tier, and by
// create-checkout-session/route.ts to decide "already on this plan".

import type Stripe from 'stripe'
import { getBillingConfig } from '@/lib/billing/billing-config'

export type ResolvedTier = 'pro' | 'business'

/**
 * Price metadata.kind values stamped by stripe-subscription-prices.ts's
 * syncTierPrice at creation time (`subscription_${tier}`). This tag SURVIVES
 * archival: when an admin changes a tier's price, syncTierPrice mints a NEW
 * Stripe Price and archives the old one, but the old Price id (and its
 * metadata) still exists at Stripe — a subscriber who hasn't yet moved off it
 * keeps resolving to their real tier via this tag instead of falling to null
 * forever the moment the id list below goes stale.
 */
const KIND_TO_TIER: Record<string, ResolvedTier> = {
  subscription_pro: 'pro',
  subscription_business: 'business',
}

function tierFromMetadata(
  metadata: Record<string, string> | null | undefined
): ResolvedTier | null {
  const kind = metadata?.kind
  return kind ? KIND_TO_TIER[kind] ?? null : null
}

/**
 * Resolves the internal tier for a Stripe Price, preferring the metadata.kind
 * tag (survives archival — see KIND_TO_TIER above) and falling back to
 * matching the CURRENT billing_config/env price ids (fast path; also the only
 * option for a Price provisioned outside stripe-subscription-prices.ts, which
 * predates the metadata tag).
 *
 * Accepts either:
 *   - an already-expanded Stripe.Price-shaped object ({ id, metadata }) — the
 *     common case, since Stripe always nests the full Price on a subscription
 *     item, so most callers never need a network round-trip; OR
 *   - a bare price id string, in which case a `stripe` client may be supplied
 *     to retrieve the Price once (only when the fast-path id list doesn't
 *     already resolve it) to check its metadata too.
 *
 * Async because it reads billing_config. A config read failure degrades to
 * the env vars alone. Returns null for a genuinely unknown/absent price — the
 * caller leaves the existing tier untouched on null (portal flows can carry
 * non-tier price changes).
 */
export async function resolveTierFromPriceId(
  price: string | Pick<Stripe.Price, 'id' | 'metadata'> | null | undefined,
  stripe?: Stripe
): Promise<ResolvedTier | null> {
  if (!price) return null

  const priceId = typeof price === 'string' ? price : price.id
  let metadata: Record<string, string> | null | undefined =
    typeof price === 'string' ? null : (price.metadata as Record<string, string> | null | undefined)

  // Metadata-tag fast path — checked FIRST so an archived-but-still-referenced
  // Price resolves correctly even if the id list below is stale.
  const byMetadata = tierFromMetadata(metadata)
  if (byMetadata) return byMetadata

  // No metadata on hand (a bare id was passed) and a client was supplied —
  // retrieve the Price once to check its metadata too, expanding only when
  // the caller didn't already hand us the full object.
  if (!metadata && typeof price === 'string' && stripe) {
    try {
      const retrieved = await stripe.prices.retrieve(priceId)
      metadata = retrieved.metadata as Record<string, string> | null | undefined
      const resolved = tierFromMetadata(metadata)
      if (resolved) return resolved
    } catch {
      // Price no longer resolves at Stripe — fall through to the id fast path.
    }
  }

  let cfg: Awaited<ReturnType<typeof getBillingConfig>> | null = null
  try {
    cfg = await getBillingConfig()
  } catch {
    cfg = null
  }

  const proPrices = [
    cfg?.tiers.pro.stripePriceIdMonth,
    cfg?.tiers.pro.stripePriceIdYear,
    process.env.STRIPE_PRICE_PRO,
    process.env.STRIPE_PRICE_PRO_ANNUAL,
  ]
  const businessPrices = [
    cfg?.tiers.business.stripePriceIdMonth,
    cfg?.tiers.business.stripePriceIdYear,
    process.env.STRIPE_PRICE_BUSINESS,
    process.env.STRIPE_PRICE_BUSINESS_ANNUAL,
  ]

  if (proPrices.includes(priceId)) return 'pro'
  if (businessPrices.includes(priceId)) return 'business'
  return null
}
