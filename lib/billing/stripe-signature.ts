import 'server-only'
import Stripe from 'stripe'

/** Signature verification needs no API key, database lookup or network call. */
export function verifyStripeSignature(rawBody: string, signature: string): Stripe.Event | null {
  for (const secret of [process.env.STRIPE_WEBHOOK_SECRET, process.env.STRIPE_CONNECT_WEBHOOK_SECRET]) {
    if (!secret) continue
    try { return Stripe.webhooks.constructEvent(rawBody, signature, secret) } catch { /* try the other endpoint secret */ }
  }
  return null
}
