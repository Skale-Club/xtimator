import 'server-only'
import type Stripe from 'stripe'
import { STRIPE_PRODUCT_IMAGE_URL } from '@/lib/billing/stripe-product-image'
import { ensureStripeCustomer } from '@/lib/billing/stripe-customer'
import { getCanonicalBaseUrl } from '@/lib/utils/site-url'
import type { TopUpPack } from '@/lib/billing/billing-config'
import type { BillingCurrency } from '@/lib/billing/billing-currency'

/**
 * One-time credit top-up Checkout Session (mode 'payment', inline price_data
 * from billing_config - never a price from the request). Shared by
 * create-topup-session (the plain Buy) and buy-credits (the one-click path's
 * fallback when there is no saved card or the bank wants a confirmation).
 * The grant happens in the checkout.session.completed webhook arm keyed on
 * metadata.type='credit_topup'.
 */
export async function createTopupCheckoutSession(input: {
  stripe: Stripe
  companyId: string
  packIndex: number
  pack: TopUpPack
  priceCents: number
  currency: BillingCurrency
  /** Same-site path to come back to (default the billing page). */
  returnTo?: string | null
  idempotencyKey: string
}): Promise<Stripe.Checkout.Session> {
  const { stripe, companyId, pack, priceCents, currency } = input
  const base = getCanonicalBaseUrl()
  const back = safeReturnPath(input.returnTo)
  const join = back.includes('?') ? '&' : '?'
  const metadata = { type: 'credit_topup', companyId, credits: String(pack.credits) }

  return stripe.checkout.sessions.create(
    {
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: priceCents,
            product_data: { name: `${pack.credits} Xtimator credits`, images: [STRIPE_PRODUCT_IMAGE_URL] },
          },
        },
      ],
      customer: await ensureStripeCustomer(stripe, companyId),
      success_url: `${base}${back}${join}topup=1`,
      cancel_url: `${base}${back}${join}topup=cancelled`,
      metadata,
      // Stripe does NOT copy Session metadata onto the PaymentIntent; the
      // charge.refunded clawback reads the PI, so it carries the same keys.
      payment_intent_data: { metadata },
    },
    { idempotencyKey: input.idempotencyKey }
  )
}

/** Only same-site absolute paths; anything else goes back to the billing page. */
export function safeReturnPath(value: string | null | undefined): string {
  if (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\')) {
    return value.split('#')[0] || '/settings/billing'
  }
  return '/settings/billing'
}
