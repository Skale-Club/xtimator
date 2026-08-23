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
 *   - the platform application fee (FEE-01) rides on the INVOICE object via
 *     `application_fee_amount`, and ONLY when `applicationFeeCents > 0` — Stripe
 *     rejects a 0 fee (Pitfall 1), so a 0 omits the field and yields 100% to the
 *     connected account. The fee is NEVER an InvoiceItem field (Pitfall 2).
 *   - a stable `idempotencyKey` guards every create against double-issue on retry
 *     (Pitfall 5)
 *   - an existing customer id is reused when present (D-14)
 *
 * Fix 2 (double-charge guard): the Invoice is created BEFORE the InvoiceItem,
 * with `pending_invoice_items_behavior: 'exclude'`, and the InvoiceItem is
 * created with `invoice: invoice.id` attached explicitly. The old order (item
 * -> invoice with `pending_invoice_items_behavior: 'include'`) meant an
 * orphaned item left over from a failed prior attempt on the SAME reused
 * customer got silently swept into the next invoice — the customer got billed
 * twice while our `invoices` row recorded only one issue. Creating the invoice
 * first and attaching the item to it by id makes every issue self-contained:
 * nothing floating on the customer can leak into it, and it can never leak
 * into a future one either. `sendInvoice` now also carries its own
 * `idempotencyKey` (it previously had none).
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
  applicationFeeCents: number // FEE-01: platform fee in cents; 0 means omit (Stripe rejects $0)
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

  // 2. Invoice FIRST — draft, manual collection (send_invoice) + days_until_due
  //    + routing metadata. `pending_invoice_items_behavior: 'exclude'` (Fix 2)
  //    means nothing floating on the customer (e.g. an orphaned item from a
  //    prior failed attempt) can get swept into THIS invoice — the InvoiceItem
  //    below is attached to it explicitly by id instead.
  const invoice = await stripe.invoices.create(
    {
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: opts.daysUntilDue,
      pending_invoice_items_behavior: 'exclude',
      metadata: opts.metadata,
      // FEE-01: omit when 0 — Stripe rejects a $0 application fee (Pitfall 1).
      // The { stripeAccount } reqOpt already supplies the Direct-Charge header.
      ...(opts.applicationFeeCents > 0
        ? { application_fee_amount: opts.applicationFeeCents }
        : {}),
    },
    { ...reqOpt, idempotencyKey: `${opts.idempotencyBase}_inv` },
  )

  // 3. InvoiceItem (amount-based; no Price object), attached to the invoice
  //    just created (Fix 2) — never any platform fee field.
  await stripe.invoiceItems.create(
    {
      customer: customerId,
      invoice: invoice.id,
      amount: opts.amountCents,
      currency: opts.currencyCode.toLowerCase(),
      description: opts.description,
    },
    { ...reqOpt, idempotencyKey: `${opts.idempotencyBase}_item` },
  )

  // 4. Send — finalizes AND emails the hosted invoice in one step. The Stripe
  //    SDK signature is sendInvoice(id, params?, options?) so the connected-account
  //    request option ({ stripeAccount }) is the THIRD arg. Now also carries its
  //    own idempotencyKey (Fix 2 — it previously had none).
  const sent = await stripe.invoices.sendInvoice(invoice.id, {}, {
    ...reqOpt,
    idempotencyKey: `${opts.idempotencyBase}_send`,
  })

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
