import 'server-only'
import { requireServiceClient } from '@/lib/supabase/service'
import { createConnectInvoice } from '@/lib/billing/invoice-service'

type IssueRequest = Parameters<typeof createConnectInvoice>[0]
export type InvoiceReservation = {
  id: string; company_id: string; estimate_id: string; created_at: string
  stripe_account_id: string; stripe_invoice_id: string | null
  stripe_issue_request: IssueRequest | null
}

export async function reserveConnectInvoice(row: Record<string, unknown>, depositCents: number, totalCents: number): Promise<InvoiceReservation> {
  const { data, error } = await requireServiceClient().rpc('reserve_connect_invoice', {
    p_row: row, p_deposit_cents: depositCents, p_expected_total_cents: totalCents,
  })
  if (error || !data?.id) throw new Error('The contract invoicing changed. Refresh and try again.')
  return data as InvoiceReservation
}

/** Retain the row on EVERY uncertain outcome; the same snapshot is resumed. */
export async function issueReservedInvoice(row: InvoiceReservation) {
  if (!row.stripe_issue_request) throw new Error('This invoice needs support verification before it can be replaced.')
  const svc = requireServiceClient()
  const result = await createConnectInvoice({ ...row.stripe_issue_request,
    existingInvoiceId: row.stripe_invoice_id,
    createdAt: row.created_at,
    onProgress: async (progress) => {
      const { error } = await svc.from('invoices').update({
        stripe_invoice_id: progress.stripeInvoiceId, stripe_customer_id: progress.stripeCustomerId,
      }).eq('id', row.id).eq('company_id', row.company_id)
      if (error) throw new Error('Could not save invoice progress; the reservation was retained')
    },
  })
  const { error } = await svc.from('invoices').update({
    status: ['paid', 'void', 'uncollectible'].includes(result.status) ? result.status : 'open',
    stripe_invoice_id: result.stripeInvoiceId, stripe_customer_id: result.stripeCustomerId,
    hosted_invoice_url: result.hostedInvoiceUrl, invoice_pdf_url: result.invoicePdfUrl,
    updated_at: new Date().toISOString(),
  }).eq('id', row.id).eq('company_id', row.company_id).eq('status', 'draft')
  // Do not overwrite a paid/void webhook that arrived while Stripe responded.
  if (error) throw new Error('The invoice exists in Stripe. Its status is being recovered; do not issue another.')
  if (result.status === 'void' || result.status === 'uncollectible') throw new Error('The original invoice is closed. Refresh before issuing a replacement.')
  return { hostedInvoiceUrl: result.hostedInvoiceUrl, invoicePdfUrl: result.invoicePdfUrl }
}
