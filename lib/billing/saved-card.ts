import 'server-only'
import type Stripe from 'stripe'

/**
 * Credits plan 2026-11-20: the card a Pro company already pays its
 * subscription with, so a top-up (one click, or auto top-up) charges it
 * without a second card entry.
 *
 * Order: the customer's invoice default (set by the auto top-up setup flow),
 * then the subscription's default (set by subscription Checkout), then the
 * customer's first saved card. Never throws: any Stripe error means "no saved
 * card", and the caller falls back to Checkout.
 */
export type SavedCard = { id: string; brand: string; last4: string }

type PmLike = { id?: string; card?: { brand?: string | null; last4?: string | null } | null } | string | null | undefined

function toCard(pm: PmLike): SavedCard | null {
  if (!pm || typeof pm === 'string') return null
  if (!pm.id || !pm.card?.last4) return null
  const brand = pm.card.brand ?? 'card'
  return { id: pm.id, brand: brand.charAt(0).toUpperCase() + brand.slice(1), last4: pm.card.last4 }
}

export async function resolveSavedCard(
  stripe: Stripe,
  customerId: string | null | undefined,
  subscriptionId: string | null | undefined
): Promise<SavedCard | null> {
  if (!customerId) return null
  try {
    const customer = (await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    })) as unknown as { deleted?: boolean; invoice_settings?: { default_payment_method?: PmLike } }
    if (customer.deleted) return null
    const fromCustomer = toCard(customer.invoice_settings?.default_payment_method)
    if (fromCustomer) return fromCustomer

    if (subscriptionId) {
      const sub = (await stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['default_payment_method'],
      })) as unknown as { default_payment_method?: PmLike }
      const fromSub = toCard(sub.default_payment_method)
      if (fromSub) return fromSub
    }

    const list = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 })
    return toCard(list.data[0] as unknown as PmLike)
  } catch (err) {
    console.warn('[billing] resolveSavedCard failed:', err instanceof Error ? err.message : err)
    return null
  }
}

/** "Visa •••• 4242" */
export function savedCardLabel(card: SavedCard | null): string | null {
  return card ? `${card.brand} •••• ${card.last4}` : null
}
