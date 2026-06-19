import { describe, it, expect, vi } from 'vitest'

/**
 * INVOICE-06 (RED until Wave 1): getInvoicesByEstimateId reads issued invoices
 * back for an estimate. The returned amount MUST be the stored snapshot
 * (invoices.amount_cents), never re-derived from any estimate total — editing
 * the estimate after issue does not mutate the issued invoice (D-07).
 *
 * Target module @/lib/queries/invoice does not exist yet, so the late
 * await import() throws and the test fails loudly (Nyquist gate).
 */

describe('INVOICE-06: getInvoicesByEstimateId (frozen snapshot read-back)', () => {
  it('returns the stored amount_cents, not a re-derived estimate total', async () => {
    const order = vi.fn().mockResolvedValue({
      data: [
        {
          id: 'inv_row_1',
          estimate_id: 'est_1',
          company_id: 'co_1',
          kind: 'deposit',
          amount_cents: 3000,
          currency_code: 'usd',
          status: 'open',
          hosted_invoice_url: 'https://invoice.stripe.com/i/test_hosted',
          invoice_pdf_url: 'https://invoice.stripe.com/i/test_pdf',
        },
      ],
      error: null,
    })
    const eq = vi.fn().mockReturnValue({ order })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const supabase = { from } as never

    const { getInvoicesByEstimateId } = await import('@/lib/queries/invoice')
    const rows = await getInvoicesByEstimateId(supabase, 'est_1')

    expect(from).toHaveBeenCalledWith('invoices')
    expect(eq).toHaveBeenCalledWith('estimate_id', 'est_1')
    expect(rows).toHaveLength(1)
    // INVOICE-06: amount is the stored snapshot value, verbatim.
    expect(rows[0].amount_cents).toBe(3000)
  })
})
