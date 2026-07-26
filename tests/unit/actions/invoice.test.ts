import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * INVOICE-03 (RED until Wave 1): the generateInvoice server action.
 *   - blocks the demo company before any Stripe call (Pitfall 6)
 *   - refuses when the company has no active Connect account (mirror pay route)
 *   - on the happy path: calls createConnectInvoice, persists an invoices row,
 *     and returns { data: { hostedInvoiceUrl, invoicePdfUrl } }
 *
 * Target module @/lib/actions/invoice does not exist yet, so the late
 * await import() throws and every case fails loudly (Nyquist gate).
 */

const assertWritable = vi.fn()
const assertCompanyWritable = vi.fn()
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: (...args: unknown[]) => assertWritable(...args),
  assertCompanyWritable: (...args: unknown[]) => assertCompanyWritable(...args),
}))

const getAuthContext = vi.fn()
vi.mock('@/lib/auth/context', () => ({
  getAuthContext: (...args: unknown[]) => getAuthContext(...args),
}))

const createConnectInvoice = vi.fn()
vi.mock('@/lib/billing/invoice-service', () => ({
  createConnectInvoice: (...args: unknown[]) => createConnectInvoice(...args),
}))

// FEE-03: the action reads the live fee%/min from billing_config at runtime.
const getBillingConfig = vi.fn()
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: (...args: unknown[]) => getBillingConfig(...args),
}))

// Per-table Supabase mock. estimates/companies selects + invoices insert.
const invoicesInsert = vi.fn()
const invoicesInsertSelect = vi.fn()
const invoicesInsertSingle = vi.fn()
const fromImpl = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({ from: (t: string) => fromImpl(t) }),
}))

function configureSupabase(opts: {
  estimate?: Record<string, unknown> | null
  company?: Record<string, unknown> | null
}) {
  const estimate = opts.estimate ?? {
    id: 'est_1',
    company_id: 'co_1',
    currency_code: 'usd',
    total: 1000,
    project: { name: 'Bathroom remodel' },
  }
  const company = opts.company ?? {
    id: 'co_1',
    stripe_account_id: 'acct_abc123',
    stripe_connect_status: 'active',
  }

  invoicesInsertSingle.mockResolvedValue({
    data: { id: 'inv_row_1', hosted_invoice_url: 'https://h', invoice_pdf_url: 'https://p' },
    error: null,
  })
  invoicesInsertSelect.mockReturnValue({ single: invoicesInsertSingle })
  invoicesInsert.mockReturnValue({ select: invoicesInsertSelect })

  fromImpl.mockImplementation((table: string) => {
    if (table === 'estimates') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: estimate, error: null }),
          }),
        }),
      }
    }
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: company, error: null }),
          }),
        }),
      }
    }
    if (table === 'invoices') {
      return { insert: invoicesInsert }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  assertWritable.mockResolvedValue(null)
  assertCompanyWritable.mockResolvedValue(null)
  getAuthContext.mockResolvedValue({ userId: 'u_1', companyId: 'co_1' })
  getBillingConfig.mockResolvedValue({ estimateFeePct: 0.01, estimateFeeMinCents: 1 })
  createConnectInvoice.mockResolvedValue({
    stripeInvoiceId: 'in_123',
    stripeCustomerId: 'cus_123',
    hostedInvoiceUrl: 'https://invoice.stripe.com/i/test_hosted',
    invoicePdfUrl: 'https://invoice.stripe.com/i/test_pdf',
    status: 'open',
    number: 'INV-0001',
  })
})

describe('INVOICE-03: generateInvoice action', () => {
  it('blocks the demo company and never calls Stripe', async () => {
    assertCompanyWritable.mockResolvedValue({
      error: 'This is a read-only demo. Create a free account to make changes.',
    })
    configureSupabase({})
    const { generateInvoice } = await import('@/lib/actions/invoice')

    const result = await generateInvoice('est_1', { kind: 'full' })
    expect(result).toHaveProperty('error')
    expect(createConnectInvoice).not.toHaveBeenCalled()
  })

  it('refuses when stripe_account_id is null', async () => {
    configureSupabase({ company: { id: 'co_1', stripe_account_id: null, stripe_connect_status: 'active' } })
    const { generateInvoice } = await import('@/lib/actions/invoice')

    const result = await generateInvoice('est_1', { kind: 'full' })
    expect(result).toHaveProperty('error')
    expect(createConnectInvoice).not.toHaveBeenCalled()
  })

  it('refuses when stripe_connect_status is not active', async () => {
    configureSupabase({ company: { id: 'co_1', stripe_account_id: 'acct_abc123', stripe_connect_status: 'pending' } })
    const { generateInvoice } = await import('@/lib/actions/invoice')

    const result = await generateInvoice('est_1', { kind: 'full' })
    expect(result).toHaveProperty('error')
    expect(createConnectInvoice).not.toHaveBeenCalled()
  })

  it('creates the Stripe invoice, persists the row, and returns the URLs', async () => {
    configureSupabase({})
    const { generateInvoice } = await import('@/lib/actions/invoice')

    const result = await generateInvoice('est_1', { kind: 'full' })
    expect(createConnectInvoice).toHaveBeenCalledTimes(1)
    expect(invoicesInsert).toHaveBeenCalledTimes(1)
    expect(result).toHaveProperty('data')
    expect((result as { data: { hostedInvoiceUrl: string; invoicePdfUrl: string } }).data).toEqual(
      expect.objectContaining({
        hostedInvoiceUrl: expect.any(String),
        invoicePdfUrl: expect.any(String),
      })
    )
  })

  it('passes an applicationFeeCents derived from getBillingConfig (FEE-03)', async () => {
    // Default estimate total 1000 (usd) → 100000 cents; 1% → 1000-cent fee.
    configureSupabase({})
    const { generateInvoice } = await import('@/lib/actions/invoice')

    await generateInvoice('est_1', { kind: 'full' })
    expect(getBillingConfig).toHaveBeenCalledTimes(1)
    expect(createConnectInvoice).toHaveBeenCalledTimes(1)
    expect(createConnectInvoice.mock.calls[0][0]).toEqual(
      expect.objectContaining({ applicationFeeCents: 1000 })
    )
  })
})
