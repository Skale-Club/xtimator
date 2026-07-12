import 'server-only'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { getBillingConfig } from '@/lib/billing/billing-config'

/**
 * Data-integrity fix — displayed price must equal charged price.
 *
 * The tier cards are priced from billing_config (admin panel), but Checkout
 * charges the STRIPE_PRICE_* env-var price IDs. Nothing kept the two in sync, so
 * an admin could publish a card price that differs from what Stripe actually
 * bills. This SERVER-ONLY reader resolves the live `unit_amount` for each of the
 * four subscription prices so the page can OVERRIDE the config-derived card price
 * with what Stripe will charge (null slots fall back to config).
 *
 * Never-throw contract: any missing env var, Stripe error, or null unit_amount
 * resolves to a null slot — the caller then keeps the billing_config value.
 * Cached for 5 minutes (mirrors billingConfigCache in lib/billing/billing-config.ts).
 */

export type StripeDisplayPrices = {
  pro: { monthCents: number | null; yearCents: number | null }
  business: { monthCents: number | null; yearCents: number | null }
}

const STRIPE_DISPLAY_PRICES_TTL_MS = 5 * 60 * 1000 // 5 minutes
let stripeDisplayPricesCache: { value: StripeDisplayPrices; fetchedAt: number } | null = null

export function invalidateStripeDisplayPricesCache(): void {
  stripeDisplayPricesCache = null
}

/**
 * Resolve one env-var price ID to its live Stripe unit_amount (integer cents).
 * Unset env var, a Stripe failure, or a null unit_amount (e.g. tiered pricing)
 * all resolve to null so the caller falls back to the config price.
 */
async function resolvePriceCents(
  stripe: Awaited<ReturnType<typeof getStripeClient>> | null,
  priceId: string | undefined
): Promise<number | null> {
  if (!priceId || !stripe) return null
  try {
    const price = await stripe.prices.retrieve(priceId)
    return typeof price.unit_amount === 'number' ? price.unit_amount : null
  } catch (err) {
    console.warn('[stripe-display-prices] price retrieve failed for', priceId, err)
    return null
  }
}

/**
 * Live per-tier subscription prices as Stripe will charge them. All four slots
 * are fetched in parallel; any failure degrades to a null slot rather than
 * throwing. Cached for 5 minutes; flush via {@link invalidateStripeDisplayPricesCache}.
 */
export async function getStripeDisplayPrices(): Promise<StripeDisplayPrices> {
  const now = Date.now()
  if (
    stripeDisplayPricesCache &&
    now - stripeDisplayPricesCache.fetchedAt < STRIPE_DISPLAY_PRICES_TTL_MS
  ) {
    return stripeDisplayPricesCache.value
  }

  const empty: StripeDisplayPrices = {
    pro: { monthCents: null, yearCents: null },
    business: { monthCents: null, yearCents: null },
  }

  let stripe: Awaited<ReturnType<typeof getStripeClient>> | null = null
  try {
    stripe = await getStripeClient()
  } catch (err) {
    // Stripe not configured (e.g. static build) — every slot stays null.
    console.warn('[stripe-display-prices] Stripe client unavailable:', err)
    stripeDisplayPricesCache = { value: empty, fetchedAt: now }
    return empty
  }

  // Prefer the panel-managed Price ids from billing_config (provisioned by
  // saveBillingConfig) over the legacy STRIPE_PRICE_* env vars, so the displayed
  // price tracks whatever checkout will actually charge. A config read failure
  // degrades to the env vars alone (never-throw contract preserved).
  let cfg: Awaited<ReturnType<typeof getBillingConfig>> | null = null
  try {
    cfg = await getBillingConfig()
  } catch (err) {
    console.warn('[stripe-display-prices] billing config unavailable; using env price ids:', err)
  }

  const [proMonth, proYear, businessMonth, businessYear] = await Promise.all([
    resolvePriceCents(stripe, cfg?.tiers.pro.stripePriceIdMonth ?? process.env.STRIPE_PRICE_PRO),
    resolvePriceCents(stripe, cfg?.tiers.pro.stripePriceIdYear ?? process.env.STRIPE_PRICE_PRO_ANNUAL),
    resolvePriceCents(stripe, cfg?.tiers.business.stripePriceIdMonth ?? process.env.STRIPE_PRICE_BUSINESS),
    resolvePriceCents(stripe, cfg?.tiers.business.stripePriceIdYear ?? process.env.STRIPE_PRICE_BUSINESS_ANNUAL),
  ])

  const value: StripeDisplayPrices = {
    pro: { monthCents: proMonth, yearCents: proYear },
    business: { monthCents: businessMonth, yearCents: businessYear },
  }
  stripeDisplayPricesCache = { value, fetchedAt: now }
  return value
}
