// lib/billing/stripe-price-map.ts
// Maps a Stripe subscription-item price id back to the internal tier.
// Used by the customer.subscription.updated webhook arm so a plan change made
// through the Customer Portal reflects in companies.tier.

export type ResolvedTier = 'pro' | 'business'

/**
 * Resolves the internal tier for a Stripe price id, reading the four
 * subscription price env vars:
 *   STRIPE_PRICE_PRO / STRIPE_PRICE_PRO_ANNUAL           -> 'pro'
 *   STRIPE_PRICE_BUSINESS / STRIPE_PRICE_BUSINESS_ANNUAL -> 'business'
 *
 * Returns null for an unknown/absent price id — the caller leaves the existing
 * tier untouched on null (portal flows can carry non-tier price changes).
 */
export function resolveTierFromPriceId(
  priceId: string | null | undefined
): ResolvedTier | null {
  if (!priceId) return null

  const proPrices = [process.env.STRIPE_PRICE_PRO, process.env.STRIPE_PRICE_PRO_ANNUAL]
  const businessPrices = [
    process.env.STRIPE_PRICE_BUSINESS,
    process.env.STRIPE_PRICE_BUSINESS_ANNUAL,
  ]

  if (proPrices.includes(priceId)) return 'pro'
  if (businessPrices.includes(priceId)) return 'business'
  return null
}
