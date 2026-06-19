import 'server-only'
import { getStripeClient } from '@/lib/billing/stripe-client'

/**
 * Phase 94 (INVOICE-03) — Stripe Connect invoice creation.
 *
 * Issues a real Stripe Invoice on the company's CONNECTED account via Direct
 * Charges, mirroring the Phase 70 pay-route invariants:
 *   - every connected-account call passes `{ stripeAccount }` as the request
 *     option (the SECOND arg), never in the body
 *   - the InvoiceItem is amount-based (no `price_data` / Price object)
 *   - the Invoice uses `collection_method: 'send_invoice'` + `days_until_due`
 *     so the customer receives a hosted "guia de pagamento" (page + PDF + email
 *     + automatic reminders)
 *   - `metadata.invoice_id` (our invoices-row PK) + `metadata.company_id` route
 *     the `invoice.paid` webhook back to the right row
 *   - the platform application fee is OMITTED everywhere — Stripe rejects a 0
 *     fee, and omitting it yields 100% to the connected account (Pitfall 1)
 *   - a stable `idempotencyKey` guards every create against double-issue on retry
 *     (Pitfall 5)
 *   - an existing customer id is reused when present (D-14)
 */
export async function createConnectInvoice(opts: {
  stripeAccountId: string
  customerEmail: string | null
  customerName: string | null
  existingCustomerId: string | null
  amountCents: number
  currencyCode: string
  description: string
  metadata: { invoice_id: string; company_id: string }
  daysUntilDue: number
  idempotencyBase: string
}): Promise<{
  stripeInvoiceId: string
  stripeCustomerId: string
  hostedInvoiceUrl: string | null
  invoicePdfUrl: string | null
  status: string
  number: string | null
}> {
  const stripe = await getStripeClient()
  const reqOpt = { stripeAccount: opts.stripeAccountId } // Direct Charges (D-11)

  // 1. Customer on the connected account — reuse when possible (D-14).
  const customerId =
    opts.existingCustomerId ??
    (
      await stripe.customers.create(
        { email: opts.customerEmail ?? undefined, name: opts.customerName ?? undefined },
        { ...reqOpt, idempotencyKey: `${opts.idempotencyBase}_cust` },
      )
    ).id

  // 2. InvoiceItem (amount-based; no Price object). NEVER any platform fee field.
  await stripe.invoiceItems.create(
    {
      customer: customerId,
      amount: opts.amountCents,
      currency: opts.currencyCode.toLowerCase(),
      description: opts.description,
    },
    { ...reqOpt, idempotencyKey: `${opts.idempotencyBase}_item` },
  )

  // 3. Invoice — manual collection (send_invoice) + days_until_due + routing metadata.
  const invoice = await stripe.invoices.create(
    {
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: opts.daysUntilDue,
      pending_invoice_items_behavior: 'include',
      metadata: opts.metadata,
    },
    { ...reqOpt, idempotencyKey: `${opts.idempotencyBase}_inv` },
  )

  // 4. Send — finalizes AND emails the hosted invoice in one step.
  const sent = await stripe.invoices.sendInvoice(invoice.id, reqOpt)

  // 5. Read back the hosted URL + PDF (null on a draft; populated once finalized/sent).
  return {
    stripeInvoiceId: sent.id,
    stripeCustomerId: customerId,
    hostedInvoiceUrl: sent.hosted_invoice_url ?? null,
    invoicePdfUrl: sent.invoice_pdf ?? null,
    status: sent.status ?? 'open',
    number: sent.number ?? null,
  }
}
