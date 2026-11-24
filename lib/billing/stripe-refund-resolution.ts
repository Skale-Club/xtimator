import 'server-only'
import type Stripe from 'stripe'

/** Basil+ removed Charge.invoice. Invoice Payments is the authoritative link. */
export async function resolveChargeInvoiceId(charge: Stripe.Charge, stripe: Stripe, account?: string): Promise<string | null> {
  const legacy = (charge as Stripe.Charge & { invoice?: string | { id: string } | null }).invoice
  if (legacy) return typeof legacy === 'string' ? legacy : legacy.id
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  if (!pi) return null
  const ids = new Set<string>()
  let after: string | undefined
  do {
    const page = await stripe.invoicePayments.list({
      payment: { type: 'payment_intent', payment_intent: pi }, limit: 100,
      ...(after ? { starting_after: after } : {}),
    }, account ? { stripeAccount: account } : {})
    for (const payment of page.data) ids.add(typeof payment.invoice === 'string' ? payment.invoice : payment.invoice.id)
    after = page.has_more ? page.data.at(-1)?.id : undefined
  } while (after)
  // Our issued invoices use one PaymentIntent each. Never guess an allocation
  // if an externally modified account applies the same payment to many invoices.
  if (ids.size > 1) throw new Error('Refund needs review: payment belongs to multiple invoices')
  return [...ids][0] ?? null
}

/** Read current successful refunds, not an optional/partial webhook expansion. */
export async function successfulRefundedCents(charge: Stripe.Charge, stripe: Stripe, account?: string, refundIds?: string[]): Promise<number> {
  let total = 0
  let after: string | undefined
  do {
    const page = await stripe.refunds.list({ charge: charge.id, limit: 100,
      ...(after ? { starting_after: after } : {}) }, account ? { stripeAccount: account } : {})
    total += page.data.filter(r => r.status === 'succeeded').reduce((sum, r) => sum + r.amount, 0)
    refundIds?.push(...page.data.filter(r => r.status === 'succeeded').map(r => r.id))
    after = page.has_more ? page.data.at(-1)?.id : undefined
  } while (after)
  return total
}

/** An invoice can have multiple partial payments, each with its own charge. */
export async function successfulInvoiceRefundedCents(invoiceId: string, stripe: Stripe, account: string): Promise<number> {
  const charges = new Set<string>()
  for await (const payment of stripe.invoicePayments.list({ invoice: invoiceId, limit: 100 }, { stripeAccount: account })) {
    if (payment.payment.type === 'charge') {
      const charge = payment.payment.charge
      if (charge) charges.add(typeof charge === 'string' ? charge : charge.id)
    } else if (payment.payment.type === 'payment_intent') {
      const piId = payment.payment.payment_intent
      if (!piId) continue
      const pi = typeof piId === 'string'
        ? await stripe.paymentIntents.retrieve(piId, {}, { stripeAccount: account }) : piId
      if (pi.latest_charge) charges.add(typeof pi.latest_charge === 'string' ? pi.latest_charge : pi.latest_charge.id)
    }
  }
  let total = 0
  for (const id of charges) total += await successfulRefundedCents({ id } as Stripe.Charge, stripe, account)
  return total
}
