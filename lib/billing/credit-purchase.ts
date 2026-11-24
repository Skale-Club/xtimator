import 'server-only'
import type Stripe from 'stripe'
import { grantCredits } from '@/lib/billing/credit-ledger'
import { getBillingConfig, type TopUpPack } from '@/lib/billing/billing-config'
import { topupExpiresAt } from '@/lib/billing/credit-window'
import { createTopupCheckoutSession } from '@/lib/billing/topup-checkout'
import type { BillingCurrency } from '@/lib/billing/billing-currency'
import {
  reserveBillingOperation, claimBillingOperation, saveBillingOperation,
  releaseBillingOperation, canReplayStripeCreate, type BillingOperation,
} from '@/lib/billing/operations'

type PurchaseRequest = {
  packIndex: number; pack: TopUpPack; priceCents: number; currency: BillingCurrency
  customerId: string; cardId: string | null; card: { brand: string; last4: string } | null
  returnTo: string | null; useOtherCard: boolean
  purchaseType?: 'auto_topup'
}
export type CreditPurchaseResult =
  | { mode: 'pending'; code: 'payment_pending'; message: string }
  | { mode: 'checkout'; url: string; reason: string }
  | { mode: 'charged'; credits: number; granted: true; card: PurchaseRequest['card']; automatic?: true; amountCents?: number; currency?: BillingCurrency }

export const PAYMENT_PENDING: CreditPurchaseResult = {
  mode: 'pending', code: 'payment_pending',
  message: 'Your payment is being checked. Check its status before starting another payment.',
}
export class PaymentClosedError extends Error {
  readonly code = 'payment_closed'
}
export class CreditDeliveryPendingError extends Error {
  readonly code = 'credit_delivery_pending'
}

/** One company can have only one unresolved purchase, including after reload. */
export async function buyCreditPack(input: {
  stripe: Stripe; companyId: string; requestId: string; request: PurchaseRequest
}): Promise<CreditPurchaseResult> {
  const operation = await reserveBillingOperation(input.companyId, 'credit_purchase', input.requestId, input.request)
  return resumeCreditPurchase(input.stripe, operation)
}

export async function resumeCreditPurchase(stripe: Stripe, operation: BillingOperation, options: { recoveryOnly?: boolean } = {}): Promise<CreditPurchaseResult> {
  const request = operation.request as unknown as PurchaseRequest
  const done = (): CreditPurchaseResult => ({ mode: 'charged', credits: request.pack.credits, granted: true, card: request.card,
    ...(request.purchaseType === 'auto_topup' ? { automatic: true as const, amountCents: request.priceCents, currency: request.currency } : {}) })
  if (operation.status === 'completed') return done()
  if (operation.status === 'failed') throw new PaymentClosedError('This payment has ended. Please try again.')
  const token = await claimBillingOperation(operation.id)
  if (!token) return PAYMENT_PENDING
  try {
    if (operation.status === 'checkout' && operation.stripe_object_id) {
      const session = await stripe.checkout.sessions.retrieve(operation.stripe_object_id)
      if (session.payment_status === 'paid') {
        await deliverPurchasedCredits(operation.company_id, request.pack.credits, `topup:${session.id}`, session.id)
        await saveBillingOperation(operation.id, token, { status: 'completed' })
        return done()
      }
      if (session.status === 'expired') {
        await saveBillingOperation(operation.id, token, { status: 'failed' })
        throw new PaymentClosedError('The payment page expired. Please try again.')
      }
      if (session.status === 'open' && session.url) return { mode: 'checkout', url: session.url, reason: 'pending_checkout' }
      return PAYMENT_PENDING // delayed settlement; never offer a second charge
    }

    const checkout = async (reason: string): Promise<CreditPurchaseResult> => {
      if (request.purchaseType === 'auto_topup') {
        // A definitively canceled automatic attempt ends without opening an
        // interactive payment page. Unknown/processing attempts remain pending.
        await saveBillingOperation(operation.id, token, { status: 'failed' })
        throw new PaymentClosedError('Automatic payment needs a valid saved card.')
      }
      if (options.recoveryOnly) return PAYMENT_PENDING
      if (!canReplayStripeCreate(operation.created_at)) return PAYMENT_PENDING
      const session = await createTopupCheckoutSession({
        stripe, companyId: operation.company_id, packIndex: request.packIndex,
        pack: request.pack, priceCents: request.priceCents, currency: request.currency,
        returnTo: request.returnTo, customerId: request.customerId, operationId: operation.id,
        idempotencyKey: `purchase-checkout:${operation.id}`,
      })
      await saveBillingOperation(operation.id, token, { status: 'checkout', stripe_object_id: session.id })
      if (!session.url) return PAYMENT_PENDING
      return { mode: 'checkout', url: session.url, reason }
    }
    if (!request.cardId || request.useOtherCard) return await checkout(request.useOtherCard ? 'other_card' : 'no_card')

    let pi: Stripe.PaymentIntent
    if (operation.stripe_object_id) {
      pi = await stripe.paymentIntents.retrieve(operation.stripe_object_id)
    } else {
      if (options.recoveryOnly) return PAYMENT_PENDING
      if (!canReplayStripeCreate(operation.created_at)) return PAYMENT_PENDING
      try {
        pi = await stripe.paymentIntents.create({
          amount: request.priceCents, currency: request.currency, customer: request.customerId,
          payment_method: request.cardId, off_session: true, confirm: true,
          description: `${request.pack.credits} Xtimator credits`,
          metadata: { type: request.purchaseType ?? 'direct_topup', companyId: operation.company_id, credits: String(request.pack.credits), operationId: operation.id },
        }, { idempotencyKey: `purchase:${operation.id}` })
      } catch (err) {
        const failure = err as { payment_intent?: Stripe.PaymentIntent | string }
        // A timeout/server error has an unknown outcome. Replaying the SAME
        // operation can recover it; a new Checkout could double-charge.
        if (!failure.payment_intent) return PAYMENT_PENDING
        pi = typeof failure.payment_intent === 'string'
          ? await stripe.paymentIntents.retrieve(failure.payment_intent)
          : failure.payment_intent
      }
      await saveBillingOperation(operation.id, token, { stripe_object_id: pi.id })
    }
    if (pi.status === 'succeeded') {
      await deliverPurchasedCredits(operation.company_id, request.pack.credits, `${request.purchaseType === 'auto_topup' ? 'autotopup' : 'directtopup'}:${pi.id}`, pi.id)
      await saveBillingOperation(operation.id, token, { status: 'completed' })
      return done()
    }
    if (pi.status === 'processing') return PAYMENT_PENDING
    if (pi.status !== 'canceled') {
      // Cancellation MUST succeed before another payment flow is offered.
      const canceled = await stripe.paymentIntents.cancel(pi.id)
      if (canceled.status !== 'canceled') return PAYMENT_PENDING
    }
    return await checkout('authentication_required')
  } finally {
    await releaseBillingOperation(operation.id, token)
  }
}

export async function deliverPurchasedCredits(companyId: string, credits: number, key: string, refId: string): Promise<void> {
  try {
    const cfg = await getBillingConfig()
    await grantCredits({ companyId, credits, reason: 'topup', source: 'topup',
      expiresAt: topupExpiresAt(cfg.topupExpiryMonths), refId, idempotencyKey: key, throwOnError: true })
  } catch (err) {
    throw new CreditDeliveryPendingError(`Payment succeeded; credit delivery is pending: ${err instanceof Error ? err.message : 'storage unavailable'}`)
  }
}
