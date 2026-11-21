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

const billingEditDenied = vi.fn()
vi.mock('@/lib/billing/access-guard', () => ({
  billingEditDenied: (...args: unknown[]) => billingEditDenied(...args),
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

// Platform-wide global stop (billing_config.connectPaymentsOpen). Defaults open.
const getPlatformFeatureState = vi.fn()
vi.mock('@/lib/features/platform-feature-state', () => ({
  getPlatformFeatureState: (...args: unknown[]) => getPlatformFeatureState(...args),
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

// Overlap guard (Fix 2) + customer-reuse both read `.from('invoices').select(...)`
// via the same RLS-scoped client mocked below. A single generic thenable chain
// (chainable on eq/not/order/limit, awaitable directly) serves both call
// shapes — the configured `data` array is shared, which is harmless for these
// tests: the overlap guard reads only `status`/`amount_cents`, customer reuse
// reads only `stripe_customer_id`, and each ignores fields it doesn't need.
const invoicesSelectResult: { data: Array<Record<string, unknown>>; error: null } = {
  data: [],
  error: null,
}
function invoicesSelectChain() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    eq: () => chain,
    not: () => chain,
    order: () => chain,
    limit: () => chain,
    then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve(invoicesSelectResult).then(resolve, reject),
  }
  return chain
}

const ON = { id: 'co_1', online_payments_allowed: true, online_payments_enabled: true }

function configureSupabase(opts: {
  estimate?: Record<string, unknown> | null
  company?: Record<string, unknown> | null
  existingInvoices?: Array<Record<string, unknown>>
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
    online_payments_allowed: true,
    online_payments_enabled: true,
    stripe_account_id: 'acct_abc123',
    stripe_connect_status: 'active',
  }

  invoicesInsertSingle.mockResolvedValue({
    data: { id: 'inv_row_1', hosted_invoice_url: 'https://h', invoice_pdf_url: 'https://p' },
    error: null,
  })
  invoicesInsertSelect.mockReturnValue({ single: invoicesInsertSingle })
  invoicesInsert.mockReturnValue({ select: invoicesInsertSelect })
  invoicesSelectResult.data = opts.existingInvoices ?? []

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
      return {
        insert: invoicesInsert,
        select: vi.fn().mockImplementation(() => invoicesSelectChain()),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  assertWritable.mockResolvedValue(null)
  assertCompanyWritable.mockResolvedValue(null)
  billingEditDenied.mockResolvedValue(null)
  getAuthContext.mockResolvedValue({ userId: 'u_1', companyId: 'co_1' })
  requireCompanyOwner.mockResolvedValue({ userId: 'u_1', companyId: 'co_1', role: 'owner' })
  getBillingConfig.mockResolvedValue({ estimateFeePct: 0.01, estimateFeeMinCents: 1 })
  getPlatformFeatureState.mockResolvedValue({ connectPaymentsOpen: true })
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

  it('refuses a paywalled company and never calls Stripe (read-only app)', async () => {
    billingEditDenied.mockResolvedValue({ error: 'Your free credits are used up.', code: 'paywalled' })
    configureSupabase({})
    const { generateInvoice } = await import('@/lib/actions/invoice')

    const result = await generateInvoice('est_1', { kind: 'full' })
    expect(result).toEqual({ error: 'Your free credits are used up.' })
    expect(billingEditDenied).toHaveBeenCalledWith('co_1')
    expect(createConnectInvoice).not.toHaveBeenCalled()
  })

  it('refuses when stripe_account_id is null', async () => {
    configureSupabase({ company: { ...ON, stripe_account_id: null, stripe_connect_status: 'active' } })
    const { generateInvoice } = await import('@/lib/actions/invoice')

    const result = await generateInvoice('est_1', { kind: 'full' })
    expect(result).toHaveProperty('error')
    expect(createConnectInvoice).not.toHaveBeenCalled()
  })

  it('refuses when stripe_connect_status is not active', async () => {
    configureSupabase({ company: { ...ON, stripe_account_id: 'acct_abc123', stripe_connect_status: 'pending' } })
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

/**
 * CONNECT-HEALTH-01 (Fix 1): a distinct, actionable message when the account
 * is connected + previously active but Stripe has since disabled charges on
 * it — as opposed to "never connected" (the generic message covered above).
 */
describe('CONNECT-HEALTH-01: restricted Connect account blocks invoicing', () => {
  it('refuses with a distinct message when stripe_charges_enabled is false, and never calls Stripe', async () => {
    configureSupabase({
      company: {
        ...ON,
        stripe_account_id: 'acct_abc123',
        stripe_connect_status: 'restricted',
        stripe_charges_enabled: false,
      },
    })
    const { generateInvoice } = await import('@/lib/actions/invoice')

    const result = await generateInvoice('est_1', { kind: 'full' })
    expect(result).toEqual({
      error:
        'Stripe has paused payments on your connected account. Finish verification in Stripe, then try again.',
    })
    expect(createConnectInvoice).not.toHaveBeenCalled()
  })
})

/**
 * Feature switches: platform switch, tenant switch and global stop all gate
 * the issue path before any Stripe call.
 */
describe('feature switches gate invoicing', () => {
  const linked = { stripe_account_id: 'acct_abc123', stripe_connect_status: 'active', stripe_charges_enabled: true }

  it('refuses when the platform switch is off and never calls Stripe', async () => {
    configureSupabase({ company: { ...ON, ...linked, online_payments_allowed: false } })
    const { generateInvoice } = await import('@/lib/actions/invoice')
    expect(await generateInvoice('est_1', { kind: 'full' })).toEqual({
      error: 'Online payments are not available for this account.',
    })
    expect(createConnectInvoice).not.toHaveBeenCalled()
    expect(invoicesInsert).not.toHaveBeenCalled()
  })

  it('refuses with the same message when the global stop is closed', async () => {
    getPlatformFeatureState.mockResolvedValue({ connectPaymentsOpen: false })
    configureSupabase({ company: { ...ON, ...linked } })
    const { generateInvoice } = await import('@/lib/actions/invoice')
    expect(await generateInvoice('est_1', { kind: 'full' })).toEqual({
      error: 'Online payments are not available for this account.',
    })
    expect(createConnectInvoice).not.toHaveBeenCalled()
  })

  it('refuses when the tenant switch is off and never calls Stripe', async () => {
    configureSupabase({ company: { ...ON, ...linked, online_payments_enabled: false } })
    const { generateInvoice } = await import('@/lib/actions/invoice')
    expect(await generateInvoice('est_1', { kind: 'full' })).toEqual({
      error: 'Turn on online payments in Settings → Client actions before issuing invoices.',
    })
    expect(createConnectInvoice).not.toHaveBeenCalled()
  })

  it('refuses a restricted account with the verification message', async () => {
    configureSupabase({ company: { ...ON, ...linked, stripe_charges_enabled: false } })
    const { generateInvoice } = await import('@/lib/actions/invoice')
    expect(await generateInvoice('est_1', { kind: 'full' })).toEqual({
      error: 'Stripe has paused payments on your connected account. Finish verification in Stripe, then try again.',
    })
    expect(createConnectInvoice).not.toHaveBeenCalled()
  })

  it('refuses a switched-on company with no Stripe account and points to Client actions', async () => {
    configureSupabase({ company: { ...ON, stripe_account_id: null, stripe_connect_status: null } })
    const { generateInvoice } = await import('@/lib/actions/invoice')
    expect(await generateInvoice('est_1', { kind: 'full' })).toEqual({
      error: 'Connect a Stripe account in Settings → Client actions before issuing invoices.',
    })
    expect(createConnectInvoice).not.toHaveBeenCalled()
  })
})

/**
 * Fix 2: an estimate can otherwise be invoiced beyond its total, and a retry
 * can double-charge. These cases verify the overlap guard runs before any
 * Stripe call and rejects both failure modes.
 */
describe('Fix 2: overlap guard — cannot invoice beyond the estimate total', () => {
  it('rejects a deposit/balance invoice whose sum with existing invoices would exceed the total', async () => {
    // total 1000 usd => 100000 cents; configured deposit 200 usd => 20000
    // cents deposit / 80000 cents balance. An existing open invoice already
    // covers 90000 cents, so issuing the 80000-cent balance would push the
    // running total to 170000 > 100000.
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
      existingInvoices: [{ status: 'open', amount_cents: 90000 }],
    })
    const { generateInvoice } = await import('@/lib/actions/invoice')

    const result = await generateInvoice('est_1', { kind: 'balance', depositPct: 20 })
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toContain('already fully invoiced')
    expect(createConnectInvoice).not.toHaveBeenCalled()
  })

  it('rejects a `full` invoice outright when any non-void invoice already exists, before any Stripe call', async () => {
    configureSupabase({
      existingInvoices: [{ status: 'open', amount_cents: 100 }],
    })
    const { generateInvoice } = await import('@/lib/actions/invoice')

    const result = await generateInvoice('est_1', { kind: 'full' })
    expect(result).toHaveProperty('error')
    expect((result as { error: string }).error).toMatch(/already has an invoice issued/)
    expect(createConnectInvoice).not.toHaveBeenCalled()
  })

  it('allows a full invoice when only void/uncollectible invoices exist for the estimate', async () => {
    // The real query filters status NOT IN (void, uncollectible) server-side;
    // this test exercises the guard logic with an empty active set (as the
    // filtered query would return), proving the happy path still proceeds.
    configureSupabase({ existingInvoices: [] })
    const { generateInvoice } = await import('@/lib/actions/invoice')

    const result = await generateInvoice('est_1', { kind: 'full' })
    expect(result).toHaveProperty('data')
    expect(createConnectInvoice).toHaveBeenCalledTimes(1)
  })

  it('allows a deposit + balance sequence that sums exactly to the total', async () => {
    // total 1000 usd => 100000 cents; deposit 200 usd => 20000 cents already
    // invoiced; balance (80000 cents) sums exactly to 100000 — must NOT be rejected.
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
      existingInvoices: [{ status: 'open', amount_cents: 20000 }],
    })
    const { generateInvoice } = await import('@/lib/actions/invoice')

    const result = await generateInvoice('est_1', { kind: 'balance', depositPct: 20 })
    expect(result).toHaveProperty('data')
    expect(createConnectInvoice).toHaveBeenCalledTimes(1)
    expect(createConnectInvoice.mock.calls[0][0]).toEqual(
      expect.objectContaining({ amountCents: 80000 })
    )
  })
})

// ---------------------------------------------------------------------------
// Delivery 3 of XTM-CONTRACT-CO-01: change order invoicing. The contract is the
// accepted estimate plus approved change orders (lib/change-orders/invoicing.ts).
// ---------------------------------------------------------------------------
const acceptedEstimate = {
  id: 'est_1',
  company_id: 'co_1',
  project_id: 'proj_1',
  currency_code: 'usd',
  total: 1000,
  deposit_type: 'none',
  deposit_value: null,
  is_current: true,
  client_response: 'accepted',
  estimate_number: 'SK-1045',
  estimate_seq: 45,
  version: 1,
  project: { name: 'Bathroom remodel', client: { name: 'Jane Doe', email: 'jane@example.com' } },
}

function withChangeOrders(opts: {
  approved: Array<{ id: string; number: number; total: number }>
  lookup?: { id: string; company_id: string; estimate_id: string } | null
}) {
  const base = fromImpl.getMockImplementation() as (t: string) => unknown
  fromImpl.mockImplementation((table: string) => {
    if (table !== 'change_orders') return base(table)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chain: any = {
      select: () => chain,
      eq: () => chain,
      order: () => chain,
      maybeSingle: () => Promise.resolve({ data: opts.lookup ?? null, error: null }),
      then: (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: opts.approved, error: null }).then(resolve, reject),
    }
    return chain
  })
}

describe('XTM-CONTRACT-CO-01 delivery 3: contract-aware invoices', () => {
  it('full invoice of an accepted estimate bills the whole contract (credits included)', async () => {
    configureSupabase({ estimate: acceptedEstimate })
    withChangeOrders({
      approved: [
        { id: 'c1', number: 1, total: 250 },
        { id: 'c2', number: 2, total: -50 },
      ],
    })
    const { generateInvoice } = await import('@/lib/actions/invoice')

    const result = await generateInvoice('est_1', { kind: 'full' })
    expect(result).toHaveProperty('data')
    expect(createConnectInvoice).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 120000 }))
    expect(invoicesInsert).toHaveBeenCalledWith(expect.objectContaining({ kind: 'full', change_order_id: null }))
  })

  it('balance carries the change orders not billed on their own', async () => {
    configureSupabase({
      estimate: acceptedEstimate,
      existingInvoices: [
        { status: 'paid', amount_cents: 30000, kind: 'deposit', change_order_id: null },
        { status: 'open', amount_cents: 25000, kind: 'change_order', change_order_id: 'c1' },
      ],
    })
    withChangeOrders({
      approved: [
        { id: 'c1', number: 1, total: 250 },
        { id: 'c2', number: 2, total: -50 },
      ],
    })
    const { generateInvoice } = await import('@/lib/actions/invoice')

    const result = await generateInvoice('est_1', { kind: 'balance', depositPct: 30 })
    expect(result).toHaveProperty('data')
    // 1000 - 300 deposit - 50 credit (c1 already billed alone) = 650
    expect(createConnectInvoice).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 65000 }))
  })

  it('invoiceChangeOrder bills the change order alone and links the row to it', async () => {
    configureSupabase({ estimate: acceptedEstimate })
    withChangeOrders({
      approved: [{ id: '11111111-1111-4111-8111-111111111111', number: 2, total: 515 }],
      lookup: { id: '11111111-1111-4111-8111-111111111111', company_id: 'co_1', estimate_id: 'est_1' },
    })
    const { invoiceChangeOrder } = await import('@/lib/actions/invoice')

    const result = await invoiceChangeOrder('11111111-1111-4111-8111-111111111111')
    expect(result).toHaveProperty('data')
    expect(createConnectInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        amountCents: 51500,
        description: 'Bathroom remodel — Change order #2 (SK-1045-CO2)',
      }),
    )
    expect(invoicesInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'change_order',
        change_order_id: '11111111-1111-4111-8111-111111111111',
        amount_cents: 51500,
      }),
    )
  })

  it('invoiceChangeOrder refuses another company, a credit and a bad id before Stripe', async () => {
    const { invoiceChangeOrder } = await import('@/lib/actions/invoice')
    const id = '22222222-2222-4222-8222-222222222222'

    configureSupabase({ estimate: acceptedEstimate })
    withChangeOrders({ approved: [], lookup: { id, company_id: 'other_co', estimate_id: 'est_1' } })
    expect(await invoiceChangeOrder(id)).toEqual({ error: 'Change order not found' })

    configureSupabase({ estimate: acceptedEstimate })
    withChangeOrders({
      approved: [{ id, number: 3, total: -40 }],
      lookup: { id, company_id: 'co_1', estimate_id: 'est_1' },
    })
    expect((await invoiceChangeOrder(id)) as { error: string }).toHaveProperty('error', expect.stringMatching(/credit/))

    expect(await invoiceChangeOrder('not-a-uuid')).toEqual({ error: 'Change order not found' })
    expect(createConnectInvoice).not.toHaveBeenCalled()
  })

  it('change orders of an estimate that is not the accepted contract are ignored', async () => {
    configureSupabase({ estimate: { ...acceptedEstimate, client_response: null } })
    withChangeOrders({ approved: [{ id: 'c1', number: 1, total: 250 }] })
    const { generateInvoice } = await import('@/lib/actions/invoice')

    await generateInvoice('est_1', { kind: 'full' })
    expect(createConnectInvoice).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 100000 }))
  })
})
