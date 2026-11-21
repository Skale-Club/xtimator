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
  kind: 'deposit' | 'balance' | 'full' | 'change_order'
  /** Set only for kind change_order (delivery 3 of XTM-CONTRACT-CO-01). */
  change_order_id: string | null
  /** The billed change order's number (Change order #N), else null. */
  change_order_number: number | null
  amount_cents: number
  currency_code: string
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible'
  stripe_invoice_id: string | null
  hosted_invoice_url: string | null
  invoice_pdf_url: string | null
  paid_at: string | null
  /** Cumulative amount refunded to the client (mirrors Stripe charge.amount_refunded). Status stays paid. */
  refunded_cents: number
  refunded_at: string | null
  created_at: string
}

/**
 * Returns every issued invoice for an estimate (drafts excluded), newest first. Amounts are the stored
 * snapshot values, returned verbatim.
 */
export async function getInvoicesByEstimateId(
  supabase: SupabaseClient,
  estimateId: string,
): Promise<InvoiceRow[]> {
  const { data } = await supabase
    .from('invoices')
    .select(
      'id, estimate_id, company_id, kind, change_order_id, amount_cents, currency_code, status, stripe_invoice_id, hosted_invoice_url, invoice_pdf_url, paid_at, refunded_cents, refunded_at, created_at, change_order:change_orders(number)',
    )
    .eq('estimate_id', estimateId)
    // A draft row is a reservation made while the Stripe invoice is being
    // created (lib/actions/invoice.ts). It is not an invoice the owner issued.
    .neq('status', 'draft')
    .order('created_at', { ascending: false })

  // A void row that never got a Stripe invoice id is an abandoned reservation
  // (kept only so a late payment can still be matched), not an issued invoice.
  const issued = ((data ?? []) as Array<Record<string, unknown>>).filter(
    (row) => !(row.status === 'void' && !row.stripe_invoice_id),
  )

  return issued.map((row) => {
    const { change_order, ...rest } = row as Record<string, unknown> & { change_order?: unknown }
    const co = (Array.isArray(change_order) ? change_order[0] : change_order) as { number?: number } | null | undefined
    return {
      ...(rest as Omit<InvoiceRow, 'change_order_id' | 'change_order_number'>),
      change_order_id: (rest.change_order_id as string | null | undefined) ?? null,
      change_order_number: co?.number ?? null,
    }
  })
}
