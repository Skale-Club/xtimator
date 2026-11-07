import 'server-only'
import type Stripe from 'stripe'
import { getStripeClient } from '@/lib/billing/stripe-client'
import type { BillingConfigInput } from '@/lib/schemas/admin'
import { STRIPE_PRODUCT_IMAGE_URL } from '@/lib/billing/stripe-product-image'

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
 * BEHAVIOR NOTE: changing a tier's price creates a NEW Stripe Price; the old
 * Price is NOT archived here — existing subscribers keep the price they signed
 * up on until they switch plans (standard Stripe behavior). Only NEW checkouts
 * use the new price.
 *
 * ARCHIVE ORDERING (fix for a pre-existing bug): archiving the superseded
 * Price used to happen inline inside `syncTierPrice`, BEFORE the caller's
 * config upsert. If that upsert then failed, the persisted config still
 * pointed at a Price we had just archived — every subsequent checkout for
 * that tier broke. `syncTierPrice` now only returns the superseded id
 * (`supersededPriceId`) and never mutates it; callers (`saveBillingConfig`)
 * must archive via `archivePrices` ONLY AFTER their own persistence step
 * succeeds.
 */

type Interval = 'month' | 'year'
type PricedTier = 'pro' | 'business'

const TIER_PRODUCT_NAMES: Record<PricedTier, string> = {
  pro: 'Xtimator Pro',
  business: 'Xtimator Business',
}

/** Best-effort: make sure an existing product carries the brand image. Never throws. */
export async function backfillProductImage(
  stripe: Stripe,
  product: { id: string; images?: string[] | null }
): Promise<void> {
  const images = product.images ?? []
  if (images.length === 1 && images[0] === STRIPE_PRODUCT_IMAGE_URL) return
  try {
    await stripe.products.update(product.id, { images: [STRIPE_PRODUCT_IMAGE_URL] })
  } catch (err) {
    console.warn(
      `[stripe-subscription-prices] failed to set image on product ${product.id}:`,
      err instanceof Error ? err.message : err
    )
  }
}

/**
 * Find-or-create the metadata-tagged subscription Product for a tier
 * (metadata.kind === `subscription_${tier}`), reused across every save. A Price
 * requires a backing Product id, so we provision ONE tagged product the first
 * time and reuse it forever — the unit_amount stays config-driven on the Price.
 *
 * `products.search` is eventually consistent (~1 min), so a product created a
 * moment ago may not be found. To avoid creating a duplicate, we FIRST look at
 * the product behind any currently-configured price id of this tier
 * (`existingPriceIds`) and reuse it when its metadata.kind matches.
 */
export async function ensureTierProduct(
  stripe: Stripe,
  tier: PricedTier,
  existingPriceIds: Array<string | null | undefined> = []
): Promise<string> {
  const kind = `subscription_${tier}`

  for (const priceId of existingPriceIds) {
    if (!priceId) continue
    try {
      const price = await stripe.prices.retrieve(priceId, { expand: ['product'] })
      const product = price.product
      if (
        product &&
        typeof product === 'object' &&
        !('deleted' in product && product.deleted) &&
        (product as Stripe.Product).active !== false &&
        (product as Stripe.Product).metadata?.kind === kind
      ) {
        await backfillProductImage(stripe, product as Stripe.Product)
        return product.id
      }
    } catch {
      // Stored price id no longer resolves — try the next source.
    }
  }

  const existing = await stripe.products.search({
    query: `active:'true' AND metadata['kind']:'${kind}'`,
    limit: 1,
  })
  const found = existing.data[0]
  if (found) {
    await backfillProductImage(stripe, found)
    return found.id
  }
  const created = await stripe.products.create({
    name: TIER_PRODUCT_NAMES[tier],
    images: [STRIPE_PRODUCT_IMAGE_URL],
    metadata: { kind },
  })
  return created.id
}

export interface SyncTierPriceResult {
  priceId: string | null
  /** Set when this call created a NEW Price and superseded an old one — the
   *  old id is returned (never archived here) so the caller can archive it
   *  once its own persistence step has succeeded. */
  supersededPriceId: string | null
}

/**
 * Reconcile ONE tier/interval Price to the config dollar amount.
 *   - amountCents <= 0 → { priceId: null, supersededPriceId: null } (free
 *     tier / unpriced): nothing to charge, nothing touched.
 *   - currentPriceId present and still matches (same unit_amount, active, same
 *     recurring interval) → returned unchanged (idempotent — no new Price when
 *     nothing changed, so a no-op save never churns Stripe Prices).
 *   - otherwise → create a new recurring Price and return the OLD id as
 *     `supersededPriceId`. Does NOT archive it — see the ARCHIVE ORDERING note
 *     above; callers must call `archivePrices` after their own save succeeds.
 */
export async function syncTierPrice(
  stripe: Stripe,
  tier: PricedTier,
  interval: Interval,
  amountCents: number,
  currentPriceId: string | null,
  /** Product id (or a lazy, memoized resolver) shared by month+year so ONE
   *  product exists per tier. Omitted → resolved via ensureTierProduct. */
  productRef?: string | (() => Promise<string>)
): Promise<SyncTierPriceResult> {
  if (amountCents <= 0) return { priceId: null, supersededPriceId: null }

  if (currentPriceId) {
    try {
      const existing = await stripe.prices.retrieve(currentPriceId)
      if (
        existing.active &&
        existing.unit_amount === amountCents &&
        existing.recurring?.interval === interval
      ) {
        return { priceId: currentPriceId, supersededPriceId: null }
      }
    } catch {
      // Stored id no longer resolves at Stripe — fall through and create a fresh Price.
    }
  }

  const product =
    typeof productRef === 'string'
      ? productRef
      : productRef
        ? await productRef()
        : await ensureTierProduct(stripe, tier, [currentPriceId])
  const created = await stripe.prices.create({
    currency: 'usd',
    unit_amount: amountCents,
    recurring: { interval },
    product,
    metadata: { kind: `subscription_${tier}`, term: interval },
  })

  const supersededPriceId =
    currentPriceId && currentPriceId !== created.id ? currentPriceId : null

  return { priceId: created.id, supersededPriceId }
}

/**
 * Best-effort archive of superseded Stripe Prices. Callers MUST invoke this
 * only AFTER their own persistence step (e.g. the billing_config upsert) has
 * succeeded — see the ARCHIVE ORDERING note above. Never throws: a Price that
 * fails to archive is logged and skipped, it never blocks or fails the caller.
 */
export async function archivePrices(
  stripe: Stripe,
  priceIds: string[]
): Promise<void> {
  await Promise.all(
    priceIds.map(async (id) => {
      try {
        await stripe.prices.update(id, { active: false })
      } catch (err) {
        console.warn(
          `[stripe-subscription-prices] failed to archive superseded Price ${id}:`,
          err instanceof Error ? err.message : err
        )
      }
    })
  )
}

export type TierPriceIdMap = {
  pro: { month: string | null; year: string | null }
  business: { month: string | null; year: string | null }
}

export type SyncAllTierPricesResult = TierPriceIdMap & {
  /** Old Price ids superseded by a new Price this sync created — not yet
   *  archived. Callers archive them via `archivePrices` after persisting the
   *  new ids (see the ARCHIVE ORDERING note above). */
  supersededPriceIds: string[]
}

/**
 * Refresh all four subscription Prices (pro/business × month/year) from the
 * config dollar amounts, returning the updated id map to merge back into the
 * persisted JSON. A missing Stripe key (getStripeClient throws) is a NO-OP: the
 * EXISTING ids are returned unchanged and a warning is logged — saving the
 * config must NEVER fail because Stripe is unconfigured.
 */
export async function syncAllTierPrices(
  cfg: BillingConfigInput
): Promise<SyncAllTierPricesResult> {
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
    return { ...existing, supersededPriceIds: [] }
  }

  const tiers: PricedTier[] = ['pro', 'business']
  const result: TierPriceIdMap = {
    pro: { month: null, year: null },
    business: { month: null, year: null },
  }
  const supersededPriceIds: string[] = []
  for (const tier of tiers) {
    // Resolve the tier's product ONCE (lazily — only if a Price must be created)
    // and share it between month and year, so search lag can't spawn a duplicate.
    let productPromise: Promise<string> | null = null
    const productRef = () =>
      (productPromise ??= ensureTierProduct(stripe, tier, [
        existing[tier].month,
        existing[tier].year,
      ]))
    const month = await syncTierPrice(
      stripe,
      tier,
      'month',
      cfg.tiers[tier].subscriptionPriceCents,
      existing[tier].month,
      productRef
    )
    result[tier].month = month.priceId
    if (month.supersededPriceId) supersededPriceIds.push(month.supersededPriceId)

    const year = await syncTierPrice(
      stripe,
      tier,
      'year',
      cfg.tiers[tier].subscriptionPriceAnnualCents,
      existing[tier].year,
      productRef
    )
    result[tier].year = year.priceId
    if (year.supersededPriceId) supersededPriceIds.push(year.supersededPriceId)
  }
  return { ...result, supersededPriceIds }
}
