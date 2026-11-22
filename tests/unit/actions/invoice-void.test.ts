import { describe, it, expect, vi, beforeEach } from 'vitest'

const assertWritable = vi.fn()
const assertCompanyWritable = vi.fn()
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: (...a: unknown[]) => assertWritable(...a),
  assertCompanyWritable: (...a: unknown[]) => assertCompanyWritable(...a),
}))
const billingEditDenied = vi.fn()
vi.mock('@/lib/billing/access-guard', () => ({
  billingEditDenied: (...a: unknown[]) => billingEditDenied(...a),
}))
const getAuthContext = vi.fn()
vi.mock('@/lib/auth/context', () => ({ getAuthContext: (...a: unknown[]) => getAuthContext(...a) }))
const requireCompanyOwner = vi.fn()
vi.mock('@/lib/auth/require-company-role', () => ({
  requireCompanyOwner: (...a: unknown[]) => requireCompanyOwner(...a),
}))
const rateLimit = vi.fn()
vi.mock('@/lib/ratelimit', () => ({ rateLimit: (...a: unknown[]) => rateLimit(...a) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const voidInvoiceStripe = vi.fn()
const retrieveInvoice = vi.fn()
const getStripeClient = vi.fn()
vi.mock('@/lib/billing/stripe-client', () => ({ getStripeClient: (...a: unknown[]) => getStripeClient(...a) }))

const rlsInvoice = vi.fn()
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: (t: string) => {
      if (t === 'invoices') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => rlsInvoice() }) }) }
      }
      if (t === 'estimates') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { project_id: 'proj_1' } }) }) }),
        }
      }
      throw new Error(`Unexpected RLS table ${t}`)
    },
  }),
}))

const svcUpdate = vi.fn()
const svcUpdateEq = vi.fn()
const svcDelete = vi.fn()
const svcDeleteEq = vi.fn()
const svcCompany = vi.fn()
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: (t: string) => {
      if (t === 'invoices') {
        return {
          update: (v: unknown) => {
            svcUpdate(v)
            return { eq: (...a: unknown[]) => svcUpdateEq(...a) }
          },
          delete: () => {
            svcDelete()
            return { eq: (...a: unknown[]) => svcDeleteEq(...a) }
          },
        }
      }
      if (t === 'companies') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => svcCompany() }) }) }
      }
      throw new Error(`Unexpected service table ${t}`)
    },
  }),
}))

const ID = '3b241101-e2bb-4255-8caf-4136c566a962'
const row = (over: Record<string, unknown> = {}) => ({
  data: {
    id: ID,
    company_id: 'co_1',
    estimate_id: 'est_1',
    change_order_id: null,
    status: 'open',
    stripe_invoice_id: 'in_123',
    stripe_account_id: 'acct_row_1',
    ...over,
  },
})

async function run(id: string = ID) {
  const { voidInvoice } = await import('@/lib/actions/invoice-void')
  return voidInvoice(id)
}

beforeEach(() => {
  vi.clearAllMocks()
  assertWritable.mockResolvedValue(null)
  assertCompanyWritable.mockResolvedValue(null)
  billingEditDenied.mockResolvedValue(null)
  getAuthContext.mockResolvedValue({ userId: 'u_1', companyId: 'co_1' })
  requireCompanyOwner.mockResolvedValue({ role: 'owner' })
  rateLimit.mockResolvedValue({ allowed: true })
  rlsInvoice.mockResolvedValue(row())
  svcUpdateEq.mockResolvedValue({ error: null })
  svcDeleteEq.mockResolvedValue({ error: null })
  svcCompany.mockResolvedValue({ data: { stripe_account_id: 'acct_company_1' } })
  voidInvoiceStripe.mockResolvedValue({ id: 'in_123', status: 'void' })
  getStripeClient.mockResolvedValue({ invoices: { voidInvoice: voidInvoiceStripe, retrieve: retrieveInvoice } })
})

describe('voidInvoice guards (no Stripe call on any refusal)', () => {
  const refused = () => {
    expect(getStripeClient).not.toHaveBeenCalled()
    expect(voidInvoiceStripe).not.toHaveBeenCalled()
    expect(svcUpdate).not.toHaveBeenCalled()
  }

  it('rejects a non-uuid id before anything else', async () => {
    expect(await run('nope')).toEqual({ error: 'Invoice not found' })
    expect(getAuthContext).not.toHaveBeenCalled()
    refused()
  })
  it('rejects an unauthenticated caller', async () => {
    getAuthContext.mockResolvedValue({ error: 'Not authenticated' })
    expect(await run()).toEqual({ error: 'Not authenticated' })
    refused()
  })
  it('rejects a non-owner', async () => {
    requireCompanyOwner.mockRejectedValue(new Error('no'))
    expect(await run()).toEqual({ error: 'Only the company owner can void invoices.' })
    refused()
  })
  it('rejects a demo session', async () => {
    assertWritable.mockResolvedValue({ error: 'demo' })
    expect(await run()).toEqual({ error: 'demo' })
    refused()
  })
  it('rejects a paywalled company', async () => {
    billingEditDenied.mockResolvedValue({ error: 'paywalled' })
    expect(await run()).toEqual({ error: 'paywalled' })
    refused()
  })
  it('rejects another company\'s invoice', async () => {
    rlsInvoice.mockResolvedValue(row({ company_id: 'co_other' }))
    expect(await run()).toEqual({ error: 'Invoice not found' })
    refused()
  })
  it('rejects a missing invoice', async () => {
    rlsInvoice.mockResolvedValue({ data: null })
    expect(await run()).toEqual({ error: 'Invoice not found' })
    refused()
  })
  it('refuses a demo target company', async () => {
    assertCompanyWritable.mockResolvedValue({ error: 'demo target' })
    expect(await run()).toEqual({ error: 'demo target' })
    refused()
  })
  it('refuses a paid invoice', async () => {
    rlsInvoice.mockResolvedValue(row({ status: 'paid' }))
    expect(await run()).toEqual({ error: 'A paid invoice cannot be voided. Refund it in Stripe instead.' })
    refused()
  })
  it('is rate limited per company', async () => {
    rateLimit.mockResolvedValue({ allowed: false })
    expect(await run()).toEqual({ error: 'Too many requests. Please try again later.' })
    expect(rateLimit).toHaveBeenCalledWith('invoiceVoidPerHour', 'co_1')
    refused()
  })
  it('refuses when no connected account is available', async () => {
    rlsInvoice.mockResolvedValue(row({ stripe_account_id: null }))
    svcCompany.mockResolvedValue({ data: { stripe_account_id: null } })
    expect(await run()).toEqual({
      error:
        'This invoice was issued on a Stripe account that is no longer connected. Void it in your Stripe dashboard.',
    })
    refused()
  })
})

describe('voidInvoice behavior', () => {
  it.each(['void', 'uncollectible'])('is idempotent for a %s invoice', async (status) => {
    rlsInvoice.mockResolvedValue(row({ status }))
    expect(await run()).toEqual({ success: true })
    expect(getStripeClient).not.toHaveBeenCalled()
    expect(svcUpdate).not.toHaveBeenCalled()
  })

  it('voids an open invoice on the row\'s own account with an idempotency key, then updates the row', async () => {
    expect(await run()).toEqual({ success: true })
    expect(voidInvoiceStripe).toHaveBeenCalledWith('in_123', {}, {
      stripeAccount: 'acct_row_1',
      idempotencyKey: `void_${ID}`,
    })
    expect(svcCompany).not.toHaveBeenCalled()
    expect(svcUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'void' }))
    expect(svcUpdateEq).toHaveBeenCalledWith('id', ID)
  })

  it('falls back to the company\'s current account when the row has none', async () => {
    rlsInvoice.mockResolvedValue(row({ stripe_account_id: null }))
    expect(await run()).toEqual({ success: true })
    expect(voidInvoiceStripe.mock.calls[0][2]).toMatchObject({ stripeAccount: 'acct_company_1' })
  })

  it('does not require the feature switches (works with payments off)', async () => {
    // Nothing in the action reads the company feature columns: only stripe_account_id when needed.
    expect(await run()).toEqual({ success: true })
  })

  it('treats a Stripe "already voided" error as success', async () => {
    voidInvoiceStripe.mockRejectedValue(Object.assign(new Error('Invoice is already void'), { code: 'x' }))
    expect(await run()).toEqual({ success: true })
    expect(svcUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'void' }))
  })

  it('treats an error as success when Stripe reports the invoice void on re-read', async () => {
    voidInvoiceStripe.mockRejectedValue(new Error('You can only void open invoices'))
    retrieveInvoice.mockResolvedValue({ status: 'void' })
    expect(await run()).toEqual({ success: true })
  })

  it('leaves the row untouched on another Stripe error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    voidInvoiceStripe.mockRejectedValue(new Error('network down'))
    retrieveInvoice.mockResolvedValue({ status: 'open' })
    expect(await run()).toEqual({ error: 'Could not void the invoice. Please try again.' })
    expect(svcUpdate).not.toHaveBeenCalled()
  })

  it('deletes a leftover draft without calling Stripe', async () => {
    rlsInvoice.mockResolvedValue(row({ status: 'draft', stripe_invoice_id: null }))
    expect(await run()).toEqual({ success: true })
    expect(svcDelete).toHaveBeenCalled()
    expect(svcDeleteEq).toHaveBeenCalledWith('id', ID)
    expect(getStripeClient).not.toHaveBeenCalled()
  })
})
