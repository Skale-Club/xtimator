import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'
import { getStripeClient } from '@/lib/billing/stripe-client'
import { processVerifiedStripeEvent } from '@/lib/billing/stripe-event-processing'
import { resumeCreditPurchase } from '@/lib/billing/credit-purchase'
import { issueReservedInvoice, type InvoiceReservation } from '@/lib/billing/invoice-reservation'
import type { BillingOperation } from '@/lib/billing/operations'
import { assertCompanyWritable } from '@/lib/demo/guard'
import { notifyOps } from '@/lib/observability/ops-alert'

/** Bounded recovery from process death or transient storage/provider failures. */
export async function recoverPayments() {
  const db = requireServiceClient()
  const stripe = await getStripeClient()
  const before = new Date(Date.now() - 60_000).toISOString()
  const now = new Date().toISOString()
  const { data: events, error: eventError } = await db.from('processed_stripe_events')
    .select('event_id, stripe_account_id').neq('status', 'completed')
    .lt('updated_at', before).or(`lease_until.is.null,lease_until.lt.${now}`).order('updated_at').limit(20)
  if (eventError) throw new Error('Cannot read Stripe recovery inbox')
  let recovered = 0
  let failures = 0
  for (const row of events ?? []) {
    try {
      // The Event is retrieved from Stripe using our secret key, never from a
      // stored unsigned request. Connected events use their originating account.
      const event = await stripe.events.retrieve(row.event_id, {}, row.stripe_account_id ? { stripeAccount: row.stripe_account_id } : {})
      if (!(await processVerifiedStripeEvent(event, stripe)).ok) failures++
      else recovered++
    } catch { failures++ }
  }
  const { data: purchases, error: purchaseError } = await db.from('billing_operations').select('*')
    .eq('kind', 'credit_purchase').in('status', ['pending', 'checkout'])
    .lt('updated_at', before).or(`lease_until.is.null,lease_until.lt.${now}`).order('updated_at').limit(20)
  if (purchaseError) throw new Error('Cannot read pending purchases')
  for (const row of purchases ?? []) {
    if (await assertCompanyWritable(row.company_id)) continue
    try {
      // Recovery never initiates a fresh off-session charge. An unknown create
      // is resolved by its server-set metadata; if absent it remains pending.
      if (!row.stripe_object_id || row.status === 'pending') {
        const customer = row.request?.customerId
        if (typeof customer !== 'string') { failures++; continue }
        // A Checkout response can also be lost after creation. Find it by
        // the immutable server operation id before considering its original PI.
        for await (const session of stripe.checkout.sessions.list({ customer, created: { gte: Math.floor(Date.parse(row.created_at) / 1000) - 60 }, limit: 100 })) {
          if (session.metadata?.operationId === row.id) {
            const { error } = await db.from('billing_operations').update({ stripe_object_id: session.id, status: 'checkout' }).eq('id', row.id).neq('status', 'completed')
            if (error) throw new Error('Cannot persist recovered Checkout')
            row.stripe_object_id = session.id
            row.status = 'checkout'
            break
          }
        }
        if (!row.stripe_object_id) for await (const pi of stripe.paymentIntents.list({ customer, created: { gte: Math.floor(Date.parse(row.created_at) / 1000) - 60 }, limit: 100 })) {
          if (pi.metadata.operationId === row.id) {
            const { error } = await db.from('billing_operations').update({ stripe_object_id: pi.id }).eq('id', row.id).is('stripe_object_id', null)
            if (error) throw new Error('Cannot persist recovered payment')
            row.stripe_object_id = pi.id
            break
          }
        }
      }
      if (!row.stripe_object_id) { failures++; continue }
      if ((await resumeCreditPurchase(stripe, row as BillingOperation, { recoveryOnly: true })).mode === 'charged') recovered++
    } catch { failures++ }
  }
  const { data: drafts, error: draftError } = await db.from('invoices')
    .select('id, company_id, estimate_id, created_at, stripe_account_id, stripe_invoice_id, stripe_issue_request')
    .eq('status', 'draft').lt('created_at', before).order('created_at').limit(10)
  if (draftError) throw new Error('Cannot read invoice reservations')
  for (const row of drafts ?? []) {
    if (await assertCompanyWritable(row.company_id)) continue
    try {
      // Issuing a reserved, explicitly authorized invoice is replay-safe. Old
      // unresolved creates use read-only Stripe search rather than new creates.
      await issueReservedInvoice(row as InvoiceReservation)
      recovered++
    } catch { failures++ }
  }
  if (failures) await notifyOps({ kind: 'payment_recovery_pending', severity: 'error',
    title: 'Payments still need recovery', message: `${failures} attempts remain pending; ${recovered} recovered.`,
    dedupeKey: `payment-recovery:${new Date().toISOString().slice(0, 13)}` })
  return { recovered, failures }
}

export const paymentRecoveryJob = inngest.createFunction({
  id: 'payment-recovery', triggers: [{ cron: '*/5 * * * *' }],
  concurrency: { limit: 1 }, retries: 3,
}, async ({ step }) => step.run('recover-authorized-payments', recoverPayments))
