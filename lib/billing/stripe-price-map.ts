// lib/billing/stripe-price-map.ts
// Maps a Stripe subscription-item price id back to the internal tier.
// Used by the customer.subscription.updated webhook arm so a plan change made
// through the Customer Portal reflects in companies.tier.

import { getBillingConfig } from '@/lib/billing/billing-config'

export type ResolvedTier = 'pro' | 'business'

/**
 * Resolves the internal tier for a Stripe price id, recognizing BOTH the
 * panel-managed Price ids stored in billing_config
 * (tiers[t].stripePriceIdMonth/Year, provisioned by saveBillingConfig) AND the
 * legacy STRIPE_PRICE_* env vars (kept as a fallback so nothing regresses):
 *   pro month/year      -> 'pro'
 *   business month/year -> 'business'
 *
 * Async because it reads billing_config. A config read failure degrades to the
 * env vars alone. Returns null for an unknown/absent price id — the caller
 * leaves the existing tier untouched on null (portal flows can carry non-tier
 * price changes).
 */
export async function resolveTierFromPriceId(
  priceId: string | null | undefined
): Promise<ResolvedTier | null> {
  if (!priceId) return null

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
