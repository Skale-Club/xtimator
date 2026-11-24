import 'server-only'
import type Stripe from 'stripe'
import { reserveBillingOperation, claimBillingOperation, saveBillingOperation, releaseBillingOperation, canReplayStripeCreate } from '@/lib/billing/operations'

/** Reuse a company's unresolved Checkout, even across devices or intervals. */
export async function createSubscriptionCheckout(stripe: Stripe, companyId: string, params: Stripe.Checkout.SessionCreateParams): Promise<string> {
  // A missed checkout webhook must not let a second subscription start.
  if (typeof params.customer !== 'string') throw new Error('A billing customer is required')
  for await (const sub of stripe.subscriptions.list({ customer: params.customer, status: 'all', limit: 100 })) {
    if (sub.status !== 'canceled' && sub.status !== 'incomplete_expired') {
      throw new Error('A subscription already exists. Manage it from Plan and billing.')
    }
  }
  const op = await reserveBillingOperation(companyId, 'subscription_checkout', crypto.randomUUID(), params as Record<string, unknown>)
  const token = await claimBillingOperation(op.id)
  if (!token) throw new Error('Your subscription checkout is being prepared. Please try again.')
  try {
    let session: Stripe.Checkout.Session
    if (op.stripe_object_id) session = await stripe.checkout.sessions.retrieve(op.stripe_object_id)
    else {
      if (!canReplayStripeCreate(op.created_at)) throw new Error('The original checkout needs verification. Please contact support.')
      session = await stripe.checkout.sessions.create(op.request as Stripe.Checkout.SessionCreateParams, {
        idempotencyKey: `subscription-checkout:${op.id}`,
      })
      await saveBillingOperation(op.id, token, { stripe_object_id: session.id, status: 'checkout' })
    }
    if (session.status === 'complete') {
      await saveBillingOperation(op.id, token, { status: 'completed' })
      throw new Error('Your subscription is being confirmed. Refresh billing before trying again.')
    }
    if (session.status === 'expired') {
      await saveBillingOperation(op.id, token, { status: 'failed' })
      throw new Error('The checkout expired. Please try again.')
    }
    if (!session.url) throw new Error('Checkout is temporarily unavailable')
    return session.url
  } finally { await releaseBillingOperation(op.id, token) }
}
