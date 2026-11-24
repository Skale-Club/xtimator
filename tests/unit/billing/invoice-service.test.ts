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
const invoicesFinalize = vi.fn().mockResolvedValue({ id: 'in_123', status: 'open' })
const invoicesRetrieve = vi.fn()
const invoicesSearch = vi.fn()
const invoicesLines = vi.fn()

vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn().mockResolvedValue({
    customers: { create: customersCreate },
    invoiceItems: { create: invoiceItemsCreate },
    invoices: { create: invoicesCreate, sendInvoice: invoicesSendInvoice, finalizeInvoice: invoicesFinalize, retrieve: invoicesRetrieve, search: invoicesSearch, listLineItems: invoicesLines },
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

/**
 * Fix 2 (double-charge guard): the Invoice must be created BEFORE the
 * InvoiceItem, with `pending_invoice_items_behavior: 'exclude'`, and the
 * InvoiceItem must carry `invoice: <id>` so it can never be swept into a
 * DIFFERENT invoice by a later retry. `sendInvoice` must also carry its own
 * idempotencyKey (it previously had none).
 */
describe('Fix 2: invoice-before-item ordering (double-charge guard)', () => {
  it('creates the Invoice before the InvoiceItem', async () => {
    const callOrder: string[] = []
    invoicesCreate.mockImplementationOnce(async () => {
      callOrder.push('invoices.create')
      return { id: 'in_123' }
    })
    invoiceItemsCreate.mockImplementationOnce(async () => {
      callOrder.push('invoiceItems.create')
      return { id: 'ii_123' }
    })

    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    await createConnectInvoice(baseOpts())

    expect(callOrder).toEqual(['invoices.create', 'invoiceItems.create'])
  })

  it('creates the Invoice with pending_invoice_items_behavior: exclude', async () => {
    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    await createConnectInvoice(baseOpts())

    const invoiceBody = invoicesCreate.mock.calls[0][0]
    expect(invoiceBody.pending_invoice_items_behavior).toBe('exclude')
  })

  it('attaches the InvoiceItem to the just-created invoice via `invoice: <id>`', async () => {
    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    await createConnectInvoice(baseOpts())

    const itemBody = invoiceItemsCreate.mock.calls[0][0]
    expect(itemBody.invoice).toBe('in_123') // invoicesCreate mock resolves { id: 'in_123' }
  })

  it('passes a stable idempotencyKey on sendInvoice (previously had none)', async () => {
    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    await createConnectInvoice(baseOpts())

    expect(invoicesSendInvoice).toHaveBeenCalledTimes(1)
    const sendOpts = invoicesSendInvoice.mock.calls[0][2]
    expect(typeof sendOpts.idempotencyKey).toBe('string')
    expect(sendOpts.idempotencyKey.length).toBeGreaterThan(0)
    expect(sendOpts.stripeAccount).toBe('acct_abc123')
  })
})


describe('recovering an existing connected invoice without a replacement', () => {
  const remote = (status: string) => ({ id: 'in_original', customer: 'cus_original', status,
    hosted_invoice_url: 'https://invoice.stripe.com/original', invoice_pdf: null })
  it('persists the remote id before a lost send response and resumes the same open invoice', async () => {
    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    const onProgress = vi.fn()
    invoicesSendInvoice.mockRejectedValueOnce(new Error('Response lost'))
    await expect(createConnectInvoice(baseOpts({ onProgress }))).rejects.toThrow('Response lost')
    expect(onProgress).toHaveBeenCalledWith({ stripeInvoiceId: 'in_123', stripeCustomerId: 'cus_new_123' })
    invoicesRetrieve.mockResolvedValue(remote('open'))
    expect(await createConnectInvoice(baseOpts({ existingInvoiceId: 'in_original' }))).toMatchObject({
      stripeInvoiceId: 'in_original', hostedInvoiceUrl: 'https://invoice.stripe.com/original' })
    expect(invoicesCreate).toHaveBeenCalledTimes(1)
    expect(invoiceItemsCreate).toHaveBeenCalledTimes(1)
    expect(invoicesSendInvoice).toHaveBeenCalledTimes(1)
  })
  it('never creates a replacement when an old unknown invoice cannot be found', async () => {
    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    invoicesSearch.mockResolvedValue({ data: [] })
    await expect(createConnectInvoice(baseOpts({ createdAt: new Date(Date.now() - 25 * 3600_000).toISOString() }))).rejects.toThrow('verification')
    expect(invoicesCreate).not.toHaveBeenCalled(); expect(customersCreate).not.toHaveBeenCalled()
  })
  it('recovers a lost create older than Stripe idempotency retention using read-only metadata search', async () => {
    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    invoicesSearch.mockResolvedValue({ data: [remote('paid')] })
    invoicesRetrieve.mockResolvedValue(remote('paid'))
    expect(await createConnectInvoice(baseOpts({ createdAt: new Date(Date.now() - 25 * 3600_000).toISOString() }))).toMatchObject({ stripeInvoiceId: 'in_original', status: 'paid' })
    expect(invoicesSearch).toHaveBeenCalledWith(expect.objectContaining({ query: expect.stringContaining('inv_row_1') }), { stripeAccount: 'acct_abc123' })
    expect(invoicesCreate).not.toHaveBeenCalled(); expect(invoiceItemsCreate).not.toHaveBeenCalled()
  })
  it('does not append an invoice line again after its idempotency key could have expired', async () => {
    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    invoicesRetrieve.mockResolvedValue(remote('draft'))
    invoicesLines.mockReturnValue({ async *[Symbol.asyncIterator]() { yield { amount: 30000, metadata: { invoice_row_id: 'inv_row_1' } } } })
    await createConnectInvoice(baseOpts({ existingInvoiceId: 'in_original', createdAt: new Date(Date.now() - 25 * 3600_000).toISOString() }))
    expect(invoiceItemsCreate).not.toHaveBeenCalled(); expect(invoicesCreate).not.toHaveBeenCalled()
    expect(invoicesFinalize).toHaveBeenCalledWith('in_original', { auto_advance: false }, expect.objectContaining({ stripeAccount: 'acct_abc123' }))
  })
  it('returns remote terminal state for durable local reconciliation without reopening it', async () => {
    const { createConnectInvoice } = await import('@/lib/billing/invoice-service')
    invoicesRetrieve.mockResolvedValue(remote('void'))
    expect(await createConnectInvoice(baseOpts({ existingInvoiceId: 'in_original' }))).toMatchObject({ status: 'void' })
    expect(invoiceItemsCreate).not.toHaveBeenCalled(); expect(invoicesSendInvoice).not.toHaveBeenCalled()
  })
})
