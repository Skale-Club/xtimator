import 'server-only'
import Stripe from 'stripe'
import { getIntegrationKey } from '@/lib/platform-config'

/**
 * Returns a Stripe client initialized per-request using the DB-stored secret key.
 * Per-request initialization is the established project pattern (STATE.md ADMIN-06).
 * Never call new Stripe() at module level — the key is not available at import time.
 */
export async function getStripeClient(): Promise<Stripe> {
  const key = await getIntegrationKey('stripe')
  if (!key) {
    throw new Error('[Stripe] Secret key not configured. Add via /admin/integrations.')
  }
  return new Stripe(key, { apiVersion: '2026-04-22.dahlia' })
}

/** Stable metadata tag that identifies the per-seat subscription item AND its
 * backing product, so the seat sync is repeatable across calls (we find OUR
 * item/product rather than guessing by index). */
export const SEAT_ITEM_METADATA_KIND = 'seat'

/**
 * Find-or-create the metadata-tagged seat Product (auto-provisioned, reused
 * across syncs). Subscription-item `price_data` requires a `product` ID (unlike
 * Checkout's inline `product_data`), so we provision ONE tagged product the
 * first time and reuse it forever — there is still NO hardcoded pre-created
 * Price ID, and the unit_amount stays config-driven on every sync.
 */
async function ensureSeatProduct(stripe: Stripe): Promise<string> {
  const existing = await stripe.products.search({
    query: `active:'true' AND metadata['kind']:'${SEAT_ITEM_METADATA_KIND}'`,
    limit: 1,
  })
  const found = existing.data[0]
  if (found) return found.id
  const created = await stripe.products.create({
    name: 'Xtimator additional seat',
    metadata: { kind: SEAT_ITEM_METADATA_KIND },
  })
  return created.id
}

/**
 * Phase 139 (SEAT-07) — the THIN, mockable Stripe SDK boundary for the
 * subscription seat item. Side-effect only: it does NOT decide the quantity
 * (syncSeatBilling owns that pure decision) — it just reconciles the live
 * subscription's seat item to the desired { quantity, unitAmount }.
 *
 * The seat item's price is DRIVEN FROM billing_config.seatPriceCents via INLINE
 * `price_data.unit_amount` (NO pre-created hardcoded Price ID — the product is a
 * metadata-tagged, auto-provisioned-and-reused product). The seat item is
 * identified by a stable metadata tag (metadata.kind === 'seat') so the sync is
 * repeatable:
 *   - found  → update its quantity + price (new inline price_data) in place
 *   - absent → create it on the subscription with the inline price + metadata tag
 *
 * Unit tests mock this function entirely; it is the only place that touches the
 * Stripe SDK for seats.
 */
export async function syncSubscriptionSeatItem(
  stripe: Stripe,
  subscriptionId: string,
  desired: { quantity: number; unitAmount: number; annualUnitAmount?: number }
): Promise<void> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const items = subscription.items?.data ?? []
  const seatItem = items.find((it) => it.metadata?.kind === SEAT_ITEM_METADATA_KIND)

  // Read the subscription's billing interval so the seat item's recurring period
  // matches the subscription (annual subs get a yearly seat item, not monthly).
  const subscriptionInterval = (
    (subscription.items?.data?.[0]?.plan?.interval) ?? 'month'
  ) as 'month' | 'year'

  // For annual subscriptions, prefer the caller-supplied annualUnitAmount when
  // provided; fall back to unitAmount if annualUnitAmount is absent/null.
  const resolvedUnitAmount =
    subscriptionInterval === 'year' && desired.annualUnitAmount != null
      ? desired.annualUnitAmount
      : desired.unitAmount

  const productId = await ensureSeatProduct(stripe)

  // Inline price_data so the unit_amount is config-driven — never a hardcoded
  // pre-created Price ID. currency matches the subscription's existing currency
  // to avoid a multi-currency Stripe error. recurring.interval mirrors the
  // subscription so we don't mix monthly seat items on an annual subscription.
  const priceData: Stripe.SubscriptionItemCreateParams.PriceData = {
    currency: subscription.currency ?? 'usd',
    product: productId,
    unit_amount: resolvedUnitAmount,
    recurring: { interval: subscriptionInterval },
  }

  if (seatItem) {
    await stripe.subscriptionItems.update(seatItem.id, {
      quantity: desired.quantity,
      price_data: priceData,
    })
    return
  }

  await stripe.subscriptionItems.create({
    subscription: subscriptionId,
    quantity: desired.quantity,
    price_data: priceData,
    metadata: { kind: SEAT_ITEM_METADATA_KIND },
  })
}

/**
 * THIN, mockable Stripe SDK boundary that removes the subscription's
 * metadata-tagged seat item, if one exists. Used when the caller has decided
 * the company should no longer be charged for seats (billable seats dropped
 * to 0, or the configured seat price resolved to <= 0) — this function does
 * NOT make that decision, it only performs the removal, mirroring
 * syncSubscriptionSeatItem's contract (retrieve the live subscription, find
 * OUR item by the stable metadata tag, act on it).
 *
 * `proration_behavior: 'create_prorations'` credits the customer for the
 * unused remainder of the current period, same as a normal quantity/price
 * change would. No-op (no SDK write) when no seat item is present.
 */
export async function removeSubscriptionSeatItem(
  stripe: Stripe,
  subscriptionId: string
): Promise<void> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId)
  const items = subscription.items?.data ?? []
  const seatItem = items.find((it) => it.metadata?.kind === SEAT_ITEM_METADATA_KIND)
  if (!seatItem) return

  await stripe.subscriptionItems.del(seatItem.id, {
    proration_behavior: 'create_prorations',
  })
}
