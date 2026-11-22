import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { makeConnectInvoiceEvent } from '@/tests/fixtures/stripe-connect'

/**
 * XTM-D-20261121-feature-switches, rule 2: the Stripe webhook NEVER gates on the
 * feature switches. Money that arrives is always recorded, whatever the platform
 * switch, the tenant switch or the global stop say at that moment (an owner can
 * switch payments off while an invoice is still open and payable).
 *
 * Behavior: a connected-account `invoice.paid` marks the invoice paid for every
 * switched-off company state. The resolver and platform-state modules are mocked
 * to THROW, so any read of the switches fails the request, and every select
 * column list is recorded and checked for the switch columns.
 */

const resolverCalls = vi.fn()
vi.mock('@/lib/features/company-features', () => ({
  COMPANY_FEATURE_COLUMNS: 'online_payments_allowed',
  resolveCompanyFeatures: (...a: unknown[]) => {
    resolverCalls('resolveCompanyFeatures', ...a)
    throw new Error('the webhook must not resolve the feature switches')
  },
  resolveDigitalSignature: (...a: unknown[]) => {
    resolverCalls('resolveDigitalSignature', ...a)
    throw new Error('the webhook must not resolve the feature switches')
  },
}))
vi.mock('@/lib/features/platform-feature-state', () => ({
  getPlatformFeatureState: (...a: unknown[]) => {
    resolverCalls('getPlatformFeatureState', ...a)
    throw new Error('the webhook must not read the platform state')
  },
}))
// The global stop is CLOSED for every case below.
vi.mock('@/lib/billing/billing-config', () => ({
  getBillingConfig: vi.fn().mockResolvedValue({ connectPaymentsOpen: false }),
}))

const mockConstructEvent = vi.fn()
vi.mock('@/lib/billing/stripe-client', () => ({
  getStripeClient: vi.fn().mockResolvedValue({
    webhooks: { constructEvent: (...a: unknown[]) => mockConstructEvent(...a) },
    subscriptions: { retrieve: vi.fn() },
  }),
}))
vi.mock('@/lib/observability/ops-alert', () => ({ notifyOps: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/notifications/dispatch', () => ({ notify: vi.fn().mockResolvedValue({ ok: true }) }))
vi.mock('@/lib/email/payment-emails', () => ({
  sendPaymentReceivedEmail: vi.fn().mockResolvedValue(undefined),
  sendPaymentReceiptEmail: vi.fn().mockResolvedValue(undefined),
}))

const selectedColumns: Array<[string, string]> = []
const invoiceUpdate = vi.fn()
let companyRow: Record<string, unknown>

function invoiceChain() {
  // update().eq().eq().select().maybeSingle()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    eq: () => chain,
    select: () => ({
      single: () => Promise.resolve({ data: invoiceRow, error: null }),
      maybeSingle: () => Promise.resolve({ data: invoiceRow, error: null }),
    }),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve({ error: null }).then(res, rej),
  }
  return chain
}
const invoiceRow = {
  id: 'inv_row_fixture_1',
  company_id: 'co_fixture_1',
  estimate_id: 'est_fixture_1',
  amount_cents: 30000,
  currency_code: 'usd',
  project_name: 'Bathroom remodel',
}

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({
    from: (table: string) => {
      if (table === 'processed_stripe_events') {
        return { insert: () => Promise.resolve({ error: null }), delete: () => ({ eq: () => Promise.resolve({ error: null }) }) }
      }
      if (table === 'invoices') {
        return {
          update: (payload: unknown) => {
            invoiceUpdate(payload)
            return invoiceChain()
          },
          select: (cols: string) => {
            selectedColumns.push([table, cols])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chain: any = { eq: () => chain, maybeSingle: () => Promise.resolve({ data: invoiceRow, error: null }) }
            return chain
          },
        }
      }
      if (table === 'companies') {
        return {
          select: (cols: string) => {
            selectedColumns.push([table, cols])
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const chain: any = {
              eq: () => chain,
              single: () => Promise.resolve({ data: companyRow, error: null }),
              maybeSingle: () => Promise.resolve({ data: companyRow, error: null }),
            }
            return chain
          },
        }
      }
      if (table === 'estimates' || table === 'projects' || table === 'change_orders') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const chain: any = {
          select: (cols: string) => {
            selectedColumns.push([table, cols])
            return chain
          },
          eq: () => chain,
          single: () => Promise.resolve({ data: { share_token: 'tok_x', project_id: 'pr_x', public_slug_token: null, name: 'Bathroom remodel' }, error: null }),
          maybeSingle: () => Promise.resolve({ data: null, error: null }),
        }
        return chain
      }
      throw new Error(`Unexpected table: ${table}`)
    },
  }),
}))

vi.stubEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test')
const { POST } = await import('@/app/api/webhooks/stripe/route')

const req = () =>
  new NextRequest('http://localhost/api/webhooks/stripe', {
    method: 'POST',
    body: '{}',
    headers: { 'stripe-signature': 'sig_test', 'Content-Type': 'application/json' },
  })

const BASE_COMPANY = {
  id: 'co_fixture_1',
  email: 'owner@business.test',
  name: 'Test Business',
  stripe_account_display_name: 'Test Business Display',
  user_id: 'user_fixture_1',
  slug: 'acme-co',
  stripe_account_id: 'acct_test_123',
  stripe_connect_status: 'active',
}

const SWITCH_STATES: Array<[string, Record<string, unknown>]> = [
  ['online_payments_allowed = false', { online_payments_allowed: false, online_payments_enabled: true }],
  ['online_payments_enabled = false', { online_payments_allowed: true, online_payments_enabled: false }],
  ['both switches off', { online_payments_allowed: false, online_payments_enabled: false }],
  ['switch columns absent', {}],
  ['digital signature switched off too', { online_payments_allowed: false, digital_signature_allowed: false, digital_signature_enabled: false }],
]

beforeEach(() => {
  vi.clearAllMocks()
  selectedColumns.length = 0
})

describe('Connect webhook is never gated on the feature switches (global stop closed in every case)', () => {
  it.each(SWITCH_STATES)('invoice.paid still marks the invoice paid: %s', async (_label, switches) => {
    companyRow = { ...BASE_COMPANY, ...switches }
    mockConstructEvent.mockReturnValue(makeConnectInvoiceEvent('invoice.paid'))

    const res = await POST(req())

    expect(res.status).toBe(200)
    expect(invoiceUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'paid' }))
    expect(resolverCalls).not.toHaveBeenCalled()
  })

  it('invoice.paid after the company disconnected Stripe is not refused by the switches either', async () => {
    // The previous-account proof is the invoice row, not the company switches.
    companyRow = { ...BASE_COMPANY, stripe_account_id: null, stripe_connect_status: 'disconnected', online_payments_allowed: false }
    mockConstructEvent.mockReturnValue(makeConnectInvoiceEvent('invoice.paid'))
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(resolverCalls).not.toHaveBeenCalled()
  })

  it('never selects a switch column from any table while handling the event', async () => {
    companyRow = { ...BASE_COMPANY, online_payments_allowed: false, online_payments_enabled: false }
    mockConstructEvent.mockReturnValue(makeConnectInvoiceEvent('invoice.paid'))
    await POST(req())
    expect(selectedColumns.length).toBeGreaterThan(0)
    for (const [table, cols] of selectedColumns) {
      expect(cols, `${table} select`).not.toMatch(/online_payments_(allowed|enabled)|digital_signature_(allowed|enabled)/)
    }
  })

  it('invoice.voided and charge-driven events are not gated either', async () => {
    companyRow = { ...BASE_COMPANY, online_payments_allowed: false, online_payments_enabled: false }
    mockConstructEvent.mockReturnValue(makeConnectInvoiceEvent('invoice.voided'))
    const res = await POST(req())
    expect(res.status).toBe(200)
    expect(invoiceUpdate).toHaveBeenCalledWith(expect.objectContaining({ status: 'void' }))
    expect(resolverCalls).not.toHaveBeenCalled()
  })
})

describe('static guard: the Stripe webhook sources import no switch module', () => {
  const FILES = ['lib/billing/connect-webhook.ts', 'app/api/webhooks/stripe/route.ts']
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it.each(FILES)('%s does not import company-features or platform-feature-state', (file) => {
    const src = strip(readFileSync(resolve(process.cwd(), file), 'utf8'))
    expect(src).not.toMatch(/features\/company-features/)
    expect(src).not.toMatch(/features\/platform-feature-state/)
  })

  it.each(FILES)('%s does not mention a switch column', (file) => {
    const src = strip(readFileSync(resolve(process.cwd(), file), 'utf8'))
    expect(src).not.toMatch(/online_payments_(allowed|enabled)|digital_signature_(allowed|enabled)|connectPaymentsOpen/)
  })
})
