import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

/**
 * XTM-D-20261121-feature-switches, rules 4 and 5: switching online payments off
 * (platform switch, tenant switch, or the global stop) only blocks NEW invoices
 * and connecting. Cleaning up what already exists must keep working:
 *
 *   - voidInvoice   (owner voids an open invoice)
 *   - disconnect    (owner disconnects Stripe)
 *
 * Neither may read the switches. The resolver and platform-state modules are
 * mocked to THROW, and the companies rows below carry every switch OFF with the
 * global stop closed, so any gate would fail the test.
 *
 * (issueInvoice refusals live in tests/unit/actions/invoice.test.ts; the
 * webhook in webhook-not-gated.test.ts; public payloads in
 * tests/unit/share/public-link-states.test.tsx.)
 */

const gateReads = vi.fn()
vi.mock('@/lib/features/company-features', () => ({
  COMPANY_FEATURE_COLUMNS: 'x',
  resolveCompanyFeatures: (...a: unknown[]) => {
    gateReads('resolveCompanyFeatures', ...a)
    throw new Error('cleanup paths must not resolve the feature switches')
  },
  resolveDigitalSignature: (...a: unknown[]) => {
    gateReads('resolveDigitalSignature', ...a)
    throw new Error('cleanup paths must not resolve the feature switches')
  },
}))
vi.mock('@/lib/features/platform-feature-state', () => ({
  getPlatformFeatureState: (...a: unknown[]) => {
    gateReads('getPlatformFeatureState', ...a)
    throw new Error('cleanup paths must not read the platform state')
  },
}))
vi.mock('@/lib/billing/connect-readiness', () => ({
  checkConnectReadiness: (...args: unknown[]) => {
    gateReads('checkConnectReadiness', ...args)
    return Promise.resolve({ ready: true, missing: [] })
  },
}))

vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: vi.fn().mockResolvedValue({ connectPaymentsOpen: false }),
}))

const assertWritable = vi.fn()
const assertCompanyWritable = vi.fn()
const demoGuardResponse = vi.fn()
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: (...a: unknown[]) => assertWritable(...a),
  assertCompanyWritable: (...a: unknown[]) => assertCompanyWritable(...a),
  demoGuardResponse: (...a: unknown[]) => demoGuardResponse(...a),
}))
vi.mock('@/lib/billing/access-guard', () => ({ billingEditDenied: vi.fn().mockResolvedValue(null) }))
const getAuthContext = vi.fn()
vi.mock('@/lib/auth/context', () => ({ getAuthContext: (...a: unknown[]) => getAuthContext(...a) }))
const requireCompanyOwner = vi.fn()
vi.mock('@/lib/auth/require-company-role', () => ({
  requireCompanyOwner: (...a: unknown[]) => requireCompanyOwner(...a),
}))
vi.mock('@/lib/ratelimit', () => ({ rateLimit: vi.fn().mockResolvedValue({ allowed: true }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/queries/auth', () => ({ getAuthClaims: vi.fn().mockResolvedValue({ sub: 'u_1' }) }))
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: vi.fn().mockResolvedValue('co_1') }))
vi.mock('@/lib/platform-config', () => ({ getIntegrationKey: vi.fn().mockResolvedValue(null) }))
vi.mock('@/lib/billing/connect-oauth', () => ({ deauthorize: vi.fn() }))

const voidInvoiceStripe = vi.fn()
vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn().mockResolvedValue({
    invoices: { voidInvoice: (...a: unknown[]) => voidInvoiceStripe(...a), retrieve: vi.fn() },
  }),
}))

const ID = '3b241101-e2bb-4255-8caf-4136c566a962'
const SWITCHED_OFF_COMPANY = {
  id: 'co_1',
  stripe_account_id: 'acct_company_1',
  stripe_connect_status: 'active',
  online_payments_allowed: false,
  online_payments_enabled: false,
  digital_signature_allowed: false,
  digital_signature_enabled: false,
}

const companySelects: string[] = []
const invoiceUpdate = vi.fn()
const companyUpdate = vi.fn()
let invoiceRow: Record<string, unknown>

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: (t: string) => {
      if (t === 'invoices') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: invoiceRow }) }) }) }
      }
      if (t === 'estimates') {
        return { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { project_id: 'p1' } }) }) }) }
      }
      throw new Error(`Unexpected RLS table ${t}`)
    },
  }),
}))
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: (t: string) => {
      if (t === 'invoices') {
        return {
          update: (v: unknown) => {
            invoiceUpdate(v)
            return { eq: () => Promise.resolve({ error: null }) }
          },
          delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
        }
      }
      if (t === 'companies') {
        return {
          select: (cols: string) => {
            companySelects.push(cols)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chain: any = {
              eq: () => chain,
              single: () => Promise.resolve({ data: SWITCHED_OFF_COMPANY }),
              maybeSingle: () => Promise.resolve({ data: SWITCHED_OFF_COMPANY }),
            }
            return chain
          },
          update: (v: unknown) => {
            companyUpdate(v)
            return { eq: () => Promise.resolve({ error: null }) }
          },
        }
      }
      throw new Error(`Unexpected service table ${t}`)
    },
  }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  companySelects.length = 0
  assertWritable.mockResolvedValue(null)
  assertCompanyWritable.mockResolvedValue(null)
  demoGuardResponse.mockResolvedValue(null)
  getAuthContext.mockResolvedValue({ userId: 'u_1', companyId: 'co_1' })
  requireCompanyOwner.mockResolvedValue({ role: 'owner' })
  voidInvoiceStripe.mockResolvedValue({ id: 'in_123', status: 'void' })
  invoiceRow = {
    id: ID,
    company_id: 'co_1',
    estimate_id: 'est_1',
    change_order_id: null,
    status: 'open',
    stripe_invoice_id: 'in_123',
    stripe_account_id: null, // forces the company lookup, the only place a gate could hide
  }
})

describe('voidInvoice with every switch off and the global stop closed', () => {
  it('still voids the open invoice on the company account and records it', async () => {
    const { voidInvoice } = await import('@/lib/actions/invoice-void')
    expect(await voidInvoice(ID)).toEqual({ success: true })
    expect(voidInvoiceStripe).toHaveBeenCalledTimes(1)
    expect(voidInvoiceStripe.mock.calls[0][0]).toBe('in_123')
    expect(voidInvoiceStripe.mock.calls[0][2]).toMatchObject({ stripeAccount: 'acct_company_1' })
    expect(invoiceUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'void' }))
  })

  it('never reads a switch, and asks the company row for the account id only', async () => {
    const { voidInvoice } = await import('@/lib/actions/invoice-void')
    await voidInvoice(ID)
    expect(gateReads).not.toHaveBeenCalled()
    expect(companySelects).toEqual(['stripe_account_id'])
  })

  it('still voids when the invoice row carries its own account (no company read at all)', async () => {
    invoiceRow = { ...invoiceRow, stripe_account_id: 'acct_row_1' }
    const { voidInvoice } = await import('@/lib/actions/invoice-void')
    expect(await voidInvoice(ID)).toEqual({ success: true })
    expect(companySelects).toEqual([])
    expect(voidInvoiceStripe.mock.calls[0][2]).toMatchObject({ stripeAccount: 'acct_row_1' })
  })
})

describe('POST /api/stripe/connect/disconnect with the platform switch off', () => {
  const req = () => new NextRequest('http://localhost/api/stripe/connect/disconnect', { method: 'POST' })

  it('disconnects, clears the account and health columns, and never reads a switch', async () => {
    const { POST } = await import('@/app/api/stripe/connect/disconnect/route')
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(companyUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        stripe_account_id: null,
        stripe_connect_status: 'disconnected',
        stripe_charges_enabled: null,
      }),
    )
    expect(gateReads).not.toHaveBeenCalled()
  })

  it('never writes a switch column while disconnecting', async () => {
    const { POST } = await import('@/app/api/stripe/connect/disconnect/route')
    await POST(req())
    const written = Object.keys(companyUpdate.mock.calls[0][0] as object)
    expect(written.filter((c) => /online_payments_|digital_signature_/.test(c))).toEqual([])
  })
})
