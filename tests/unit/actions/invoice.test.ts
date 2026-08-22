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

const requireCompanyOwner = vi.fn()
vi.mock('@/lib/auth/require-company-role', () => ({
  requireCompanyOwner: (...args: unknown[]) => requireCompanyOwner(...args),
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

// Financial writes (the `invoices` insert) go through the service-role client
// now that the tenant INSERT/UPDATE RLS policies on `invoices` are gone. It
// shares `fromImpl` with the RLS client mock above — the insert stub is what
// matters, not which client object requested it.
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: vi.fn(() => ({ from: (t: string) => fromImpl(t) })),
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
    project: {
      name: 'Bathroom remodel',
      client: { name: 'Jane Doe', email: 'jane@example.com' },
    },
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
  requireCompanyOwner.mockResolvedValue({ userId: 'u_1', companyId: 'co_1', role: 'owner' })
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

  it('refuses when the project client has no email, before any Stripe call (INVOICE-CUST-01)', async () => {
    configureSupabase({
      estimate: {
        id: 'est_1',
        company_id: 'co_1',
        currency_code: 'usd',
        total: 1000,
        project: { name: 'Bathroom remodel', client: { name: 'Jane Doe', email: null } },
      },
    })
    const { generateInvoice } = await import('@/lib/actions/invoice')

    const result = await generateInvoice('est_1', { kind: 'full' })
    expect(result).toEqual({
      error: "Add an email address to this project's client before issuing an invoice.",
    })
    expect(createConnectInvoice).not.toHaveBeenCalled()
  })

  it('refuses when the estimate has no project/client relation at all', async () => {
    configureSupabase({
      estimate: {
        id: 'est_1',
        company_id: 'co_1',
        currency_code: 'usd',
        total: 1000,
        project: { name: 'Bathroom remodel' },
      },
    })
    const { generateInvoice } = await import('@/lib/actions/invoice')

    const result = await generateInvoice('est_1', { kind: 'full' })
    expect(result).toHaveProperty('error')
    expect(createConnectInvoice).not.toHaveBeenCalled()
  })

  it('passes the client email/name into createConnectInvoice on the happy path', async () => {
    configureSupabase({})
    const { generateInvoice } = await import('@/lib/actions/invoice')

    await generateInvoice('est_1', { kind: 'full' })
    expect(createConnectInvoice.mock.calls[0][0]).toEqual(
      expect.objectContaining({ customerEmail: 'jane@example.com', customerName: 'Jane Doe' })
    )
  })

  it('derives idempotencyBase from the generated invoice row id, not estimateId_kind (INVOICE-IDEMPOTENCY-01)', async () => {
    configureSupabase({})
    const { generateInvoice } = await import('@/lib/actions/invoice')

    await generateInvoice('est_1', { kind: 'full' })
    const call = createConnectInvoice.mock.calls[0][0] as {
      idempotencyBase: string
      metadata: { invoice_id: string }
    }
    expect(call.idempotencyBase).toBe(`inv_${call.metadata.invoice_id}`)
    expect(call.idempotencyBase).not.toBe('inv_est_1_full')
  })

  it('re-issuing the same kind produces a different idempotencyBase each time', async () => {
    configureSupabase({})
    const { generateInvoice } = await import('@/lib/actions/invoice')

    await generateInvoice('est_1', { kind: 'full' })
    const first = (createConnectInvoice.mock.calls[0][0] as { idempotencyBase: string }).idempotencyBase
    await generateInvoice('est_1', { kind: 'full' })
    const second = (createConnectInvoice.mock.calls[1][0] as { idempotencyBase: string }).idempotencyBase
    expect(first).not.toBe(second)
  })

  it('computes balance = total - deposit when the estimate has a configured AMOUNT deposit (ignores depositPct)', async () => {
    // total 1000 usd → 100000 cents; deposit_value 200 usd → 20000 cents; balance 80000.
    configureSupabase({
      estimate: {
        id: 'est_1',
        company_id: 'co_1',
        currency_code: 'usd',
        total: 1000,
        deposit_type: 'amount',
        deposit_value: 200,
        project: {
          name: 'Bathroom remodel',
          client: { name: 'Jane Doe', email: 'jane@example.com' },
        },
      },
    })
    const { generateInvoice } = await import('@/lib/actions/invoice')

    // depositPct is deliberately different from the configured deposit's implied
    // percentage (20%) to prove it is ignored once a deposit is configured.
    await generateInvoice('est_1', { kind: 'balance', depositPct: 30 })
    expect(createConnectInvoice).toHaveBeenCalledTimes(1)
    expect(createConnectInvoice.mock.calls[0][0]).toEqual(
      expect.objectContaining({ amountCents: 80000 })
    )
  })

  it('computes deposit = configured amount when the estimate has a configured deposit', async () => {
    configureSupabase({
      estimate: {
        id: 'est_1',
        company_id: 'co_1',
        currency_code: 'usd',
        total: 1000,
        deposit_type: 'amount',
        deposit_value: 200,
        project: {
          name: 'Bathroom remodel',
          client: { name: 'Jane Doe', email: 'jane@example.com' },
        },
      },
    })
    const { generateInvoice } = await import('@/lib/actions/invoice')

    await generateInvoice('est_1', { kind: 'deposit', depositPct: 30 })
    expect(createConnectInvoice.mock.calls[0][0]).toEqual(
      expect.objectContaining({ amountCents: 20000 })
    )
  })

  it('inserts the invoice row via the service-role client, not the RLS client', async () => {
    configureSupabase({})
    const { generateInvoice } = await import('@/lib/actions/invoice')

    await generateInvoice('est_1', { kind: 'full' })
    const { requireServiceClient } = await import('@/lib/supabase/service')
    expect(requireServiceClient).toHaveBeenCalled()
    expect(invoicesInsert).toHaveBeenCalledTimes(1)
  })

  it('denies when requireCompanyOwner rejects (non-owner) and never calls Stripe', async () => {
    requireCompanyOwner.mockRejectedValue(new Error('forbidden'))
    configureSupabase({})
    const { generateInvoice } = await import('@/lib/actions/invoice')

    const result = await generateInvoice('est_1', { kind: 'full' })
    expect(result).toEqual({ error: 'Only the company owner can issue invoices.' })
    expect(createConnectInvoice).not.toHaveBeenCalled()
    expect(invoicesInsert).not.toHaveBeenCalled()
  })
})
