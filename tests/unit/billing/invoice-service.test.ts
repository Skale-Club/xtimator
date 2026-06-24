import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * INVOICE-03 (RED until Wave 1): createConnectInvoice issues a real Stripe
 * Invoice on the connected account via Direct Charges. The contract mirrors the
 * Phase 70 pay-route invariants (estimate-pay.test.ts):
 *   - every Stripe call passes { stripeAccount } as the SECOND (request-options) arg
 *   - the InvoiceItem is amount-based (no price_data / Price object)
 *   - the Invoice body uses collection_method 'send_invoice' + days_until_due
 *   - metadata carries invoice_id + company_id so the webhook can route by it
 *   - application_fee_amount (FEE-01) is set on the INVOICE object ONLY when
 *     applicationFeeCents > 0 (Stripe rejects a 0 fee — Pitfall 1); it is NEVER
 *     an InvoiceItem field (Pitfall 2)
 *   - every request-options arg carries a stable idempotencyKey (Pitfall 5)
 *   - a stored customer id is reused (customers.create NOT called)
 *
 * Target module @/lib/billing/invoice-service does not exist yet, so the late
 * await import() throws and every case fails loudly (Nyquist gate).
 */

const customersCreate = vi.fn()
const invoiceItemsCreate = vi.fn()
const invoicesCreate = vi.fn()
const invoicesSendInvoice = vi.fn()

vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn().mockResolvedValue({
    customers: { create: customersCreate },
    invoiceItems: { create: invoiceItemsCreate },
    invoices: { create: invoicesCreate, sendInvoice: invoicesSendInvoice },
  }),
}))

function resetStripeMocks() {
  customersCreate.mockReset().mockResolvedValue({ id: 'cus_new_123' })
  invoiceItemsCreate.mockReset().mockResolvedValue({ id: 'ii_123' })
  invoicesCreate.mockReset().mockResolvedValue({ id: 'in_123' })
  invoicesSendInvoice.mockReset().mockResolvedValue({
    id: 'in_123',
    status: 'open',
    hosted_invoice_url: 'https://invoice.stripe.com/i/test_hosted',
    invoice_pdf: 'https://invoice.stripe.com/i/test_pdf',
    number: 'INV-0001',
  })
}

function baseOpts(overrides: Record<string, unknown> = {}) {
  return {
    stripeAccountId: 'acct_abc123',
    customerEmail: 'client@business.test',
    customerName: 'Client Co',
    existingCustomerId: null,
    amountCents: 30000,
    currencyCode: 'usd',
    description: 'Deposit for Bathroom remodel',
    metadata: { invoice_id: 'inv_row_1', company_id: 'co_1' },
    daysUntilDue: 7,
    idempotencyBase: 'inv_est_1_deposit',
    applicationFeeCents: 0,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetStripeMocks()
})

describe('INVOICE-03: createConnectInvoice (Stripe Connect invoice sequence)', () => {
  it('passes { stripeAccount } as the request-options arg on every Stripe call', async () => {
    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    await createConnectInvoice(baseOpts())

    expect(customersCreate.mock.calls[0][1]).toEqual(
      expect.objectContaining({ stripeAccount: 'acct_abc123' })
    )
    expect(invoiceItemsCreate.mock.calls[0][1]).toEqual(
      expect.objectContaining({ stripeAccount: 'acct_abc123' })
    )
    expect(invoicesCreate.mock.calls[0][1]).toEqual(
      expect.objectContaining({ stripeAccount: 'acct_abc123' })
    )
  })

  it('creates an amount-based InvoiceItem (no price_data)', async () => {
    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    await createConnectInvoice(baseOpts())

    const itemBody = invoiceItemsCreate.mock.calls[0][0]
    expect(itemBody.amount).toBe(30000)
    expect('price_data' in itemBody).toBe(false)
    expect('price' in itemBody).toBe(false)
  })

  it('creates the Invoice with send_invoice collection, days_until_due, and routing metadata', async () => {
    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    await createConnectInvoice(baseOpts())

    const invoiceBody = invoicesCreate.mock.calls[0][0]
    expect(invoiceBody.collection_method).toBe('send_invoice')
    expect(invoiceBody.days_until_due).toBe(7)
    expect(invoiceBody.metadata).toEqual(
      expect.objectContaining({ invoice_id: 'inv_row_1', company_id: 'co_1' })
    )
  })

  it('OMITS application_fee_amount when applicationFeeCents is 0 (Pitfall 1)', async () => {
    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    await createConnectInvoice(baseOpts({ applicationFeeCents: 0 }))

    const invoiceBody = invoicesCreate.mock.calls[0][0]
    const itemBody = invoiceItemsCreate.mock.calls[0][0]
    expect('application_fee_amount' in invoiceBody).toBe(false)
    expect('application_fee_amount' in itemBody).toBe(false)
  })

  it('SETS application_fee_amount on the INVOICE (never the item) when applicationFeeCents > 0 (FEE-01)', async () => {
    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    await createConnectInvoice(baseOpts({ applicationFeeCents: 250 }))

    const invoiceBody = invoicesCreate.mock.calls[0][0]
    const itemBody = invoiceItemsCreate.mock.calls[0][0]
    // The fee rides on the Invoice object (Pitfall 2 — never an InvoiceItem field).
    expect(invoiceBody.application_fee_amount).toBe(250)
    expect('application_fee_amount' in itemBody).toBe(false)
  })

  it('passes a stable idempotencyKey on every Stripe request-options arg', async () => {
    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    await createConnectInvoice(baseOpts())

    for (const fn of [customersCreate, invoiceItemsCreate, invoicesCreate]) {
      const opts = fn.mock.calls[0][1]
      expect(typeof opts.idempotencyKey).toBe('string')
      expect(opts.idempotencyKey.length).toBeGreaterThan(0)
    }
  })

  it('reuses an existing customer id (does NOT call customers.create)', async () => {
    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    await createConnectInvoice(baseOpts({ existingCustomerId: 'cus_existing_999' }))

    expect(customersCreate).not.toHaveBeenCalled()
    // The InvoiceItem must be billed to the reused customer.
    expect(invoiceItemsCreate.mock.calls[0][0].customer).toBe('cus_existing_999')
  })

  it('returns the finalized hosted URL + PDF read back from the sent invoice', async () => {
    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    const result = await createConnectInvoice(baseOpts())

    expect(result.hostedInvoiceUrl).toBe('https://invoice.stripe.com/i/test_hosted')
    expect(result.invoicePdfUrl).toBe('https://invoice.stripe.com/i/test_pdf')
  })
})
