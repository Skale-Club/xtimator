import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Phase 94 (INVOICE-06) — Invoice read-back.
 *
 * Reads issued invoices for an estimate. The returned `amount_cents` is the
 * stored snapshot taken at issue time — NEVER re-derived from the (now mutable)
 * estimate total. Editing the estimate after an invoice is issued must not
 * change the issued invoice's amount (D-07).
 */
export interface InvoiceRow {
  id: string
  estimate_id: string
  company_id: string
  kind: 'deposit' | 'balance' | 'full'
  amount_cents: number
  currency_code: string
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  stripe_invoice_id: string | null
  hosted_invoice_url: string | null
  invoice_pdf_url: string | null
  paid_at: string | null
  created_at: string
}

/**
 * Returns every invoice for an estimate, newest first. Amounts are the stored
 * snapshot values, returned verbatim.
 */
export async function getInvoicesByEstimateId(
  supabase: SupabaseClient,
  estimateId: string,
): Promise<InvoiceRow[]> {
  const { data } = await supabase
    .from('invoices')
    .select(
      'id, estimate_id, company_id, kind, amount_cents, currency_code, status, stripe_invoice_id, hosted_invoice_url, invoice_pdf_url, paid_at, created_at',
    )
    .eq('estimate_id', estimateId)
    .order('created_at', { ascending: false })

  return (data ?? []) as InvoiceRow[]
}
