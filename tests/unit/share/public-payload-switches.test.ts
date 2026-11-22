// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * XTM-D-20261121-feature-switches, rules 3 and 5, on the ANONYMOUS payloads:
 *
 *   - Rule 5: invoices that were already issued stay in the public payload (and so
 *     visible and payable) whatever the company's payment switches say. Switching
 *     payments off only blocks NEW invoices.
 *   - Rule 3: the payload carries only the final yes/no for signing. The platform
 *     switches and the Stripe account id never reach an anonymous viewer, at any
 *     depth.
 *
 * The fake database projects every row onto the columns the query SELECTs (as
 * PostgREST does), so a column the query does not ask for cannot leak into the
 * result by accident of the fixture, and a column it does ask for would show up.
 */

type Row = Record<string, unknown>
const tables: Record<string, Row[]> = {}
const selects: Array<{ table: string; cols: string }> = []

function project(row: Row, cols: string): Row {
  if (cols.includes('*') || cols.includes('(')) return row
  const out: Row = {}
  for (const c of cols.split(',').map((s) => s.trim()).filter(Boolean)) if (c in row) out[c] = row[c]
  return out
}

function from(table: string) {
  let cols = '*'
  const filters: Array<(r: Row) => boolean> = []
  const run = () =>
    (tables[table] ?? []).filter((r) => filters.every((f) => f(r))).map((r) => project(r, cols))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: (c: string) => {
      cols = c
      selects.push({ table, cols: c })
      return chain
    },
    eq: (col: string, v: unknown) => (filters.push((r) => r[col] === v), chain),
    in: (col: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[col])), chain),
    not: (col: string, _op: string, v: unknown) => (filters.push((r) => r[col] !== v), chain),
    order: () => chain,
    limit: () => chain,
    single: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
    maybeSingle: () => Promise.resolve({ data: run()[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve({ data: run(), error: null }).then(res, rej),
  }
  return chain
}

const client = { from: (t: string) => from(t) }
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: () => client }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('server-only', () => ({}))

import { getEstimateByShareToken, getEstimateByPublicToken } from '@/lib/queries/share'
import { getChangeOrderByShareToken } from '@/lib/change-orders/queries'

const FORBIDDEN_KEY = /^(digital_signature_allowed|online_payments_allowed|online_payments_enabled|stripe_account_id|stripe_connect_status|stripe_charges_enabled|stripe_customer_id|stripe_invoice_id)$/

function forbiddenPaths(value: unknown, path = '$', out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v, i) => forbiddenPaths(v, `${path}[${i}]`, out))
  else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Row)) {
      if (FORBIDDEN_KEY.test(k)) out.push(`${path}.${k}`)
      forbiddenPaths(v, `${path}.${k}`, out)
    }
  }
  return out
}

const COMPANY_ROW = {
  id: 'c1', name: 'Acme', slug: 'acme', owner_name: 'Owner', phone: '5550001111', email: 'a@b.co',
  website: null, address: null, city: null, state: null, zip: null, logo_url: null,
  brand_primary_color: '#2563eb',
  estimate_terms_enabled: false, estimate_terms_text: null, estimate_template_style: 'classic',
  // everything below must never reach the anonymous viewer
  online_payments_allowed: false,
  online_payments_enabled: false,
  digital_signature_allowed: true,
  digital_signature_enabled: true,
  stripe_account_id: 'acct_test_123',
  stripe_connect_status: 'active',
  stripe_charges_enabled: true,
}

const invoice = (over: Row): Row => ({
  id: 'inv',
  estimate_id: 'e1',
  change_order_id: null,
  kind: 'full',
  amount_cents: 100000,
  currency_code: 'USD',
  status: 'open',
  hosted_invoice_url: 'https://invoice.stripe.com/i/test_hosted',
  refunded_cents: 0,
  paid_at: null,
  created_at: '2026-02-01T00:00:00Z',
  stripe_account_id: 'acct_test_123',
  stripe_customer_id: 'cus_test_123',
  stripe_invoice_id: 'in_test_123',
  ...over,
})

function seedEstimate(companyOver: Row = {}, invoices: Row[] = []) {
  tables.estimates = [
    { id: 'e1', project_id: 'p1', company_id: 'c1', share_token: 'tok-SECRET', public_slug_token: 'shorttok123', share_expires_at: null, generation_staged: false, total: 1000, currency_code: 'USD', payment_status: 'unpaid', created_by_user_id: null },
  ]
  tables.estimate_sections = []
  tables.estimate_items = []
  tables.estimate_photos = []
  tables.estimate_signatures = []
  tables.projects = [{ id: 'p1', name: 'Kitchen', project_type: null, client: { id: 'cl1', name: 'Pat', email: 'p@x.co', phone: null, address: null, city: null, state: null, zip: null } }]
  tables.companies = [{ ...COMPANY_ROW, ...companyOver }]
  tables.invoices = invoices
}

const OPEN = invoice({ id: 'inv-open', status: 'open' })
const PAID = invoice({ id: 'inv-paid', status: 'paid', kind: 'deposit', paid_at: '2026-02-02T00:00:00Z' })
const DRAFT = invoice({ id: 'inv-draft', status: 'draft', hosted_invoice_url: null })
const VOID = invoice({ id: 'inv-void', status: 'void' })

beforeEach(() => {
  selects.length = 0
  for (const k of Object.keys(tables)) delete tables[k]
})

const PAYMENT_STATES: Array<[string, Row]> = [
  ['platform switch off', { online_payments_allowed: false, online_payments_enabled: true }],
  ['tenant switch off', { online_payments_allowed: true, online_payments_enabled: false }],
  ['both off, Stripe disconnected', { online_payments_allowed: false, online_payments_enabled: false, stripe_account_id: null, stripe_connect_status: 'disconnected' }],
  ['Stripe paused charges', { online_payments_allowed: true, online_payments_enabled: true, stripe_charges_enabled: false, stripe_connect_status: 'restricted' }],
]

describe.each([
  ['getEstimateByShareToken', () => getEstimateByShareToken('tok-SECRET')],
  ['getEstimateByPublicToken', () => getEstimateByPublicToken('shorttok123')],
])('%s', (_name, load) => {
  it.each(PAYMENT_STATES)('still returns open and paid invoices, and only those: %s', async (_label, over) => {
    seedEstimate(over, [OPEN, PAID, DRAFT, VOID])
    const data = await load()
    expect(data).not.toBeNull()
    const invoices = data!.estimate.invoices
    expect(invoices.map((i) => i.id).sort()).toEqual(['inv-open', 'inv-paid'])
    expect(invoices.find((i) => i.id === 'inv-open')).toMatchObject({
      status: 'open',
      hosted_invoice_url: 'https://invoice.stripe.com/i/test_hosted',
      amount_cents: 100000,
    })
  })

  it('selects invoices by estimate and carries only the safe fields', async () => {
    seedEstimate({}, [OPEN])
    const data = await load()
    expect(Object.keys(data!.estimate.invoices[0]).sort()).toEqual(
      ['amount_cents', 'currency_code', 'hosted_invoice_url', 'id', 'kind', 'refunded_cents', 'status'].sort(),
    )
  })

  it('a company with payments switched off and an open invoice in another estimate shows none of it', async () => {
    seedEstimate({}, [{ ...OPEN, estimate_id: 'other' }])
    const data = await load()
    expect(data!.estimate.invoices).toEqual([])
  })

  it('never carries a platform switch, the tenant payments switch, or a Stripe id, at any depth', async () => {
    seedEstimate({ online_payments_allowed: true, online_payments_enabled: true }, [OPEN, PAID])
    const data = await load()
    expect(forbiddenPaths(data)).toEqual([])
    expect(JSON.stringify(data)).not.toMatch(/acct_test_123|cus_test_123|in_test_123/)
  })

  it('exposes the signing switch only as the EFFECTIVE yes/no', async () => {
    const cases: Array<[Row, boolean]> = [
      [{ digital_signature_allowed: true, digital_signature_enabled: true }, true],
      [{ digital_signature_allowed: false, digital_signature_enabled: true }, false],
      [{ digital_signature_allowed: true, digital_signature_enabled: false }, false],
      [{ digital_signature_allowed: false, digital_signature_enabled: false }, false],
    ]
    for (const [over, expected] of cases) {
      seedEstimate(over, [])
      const data = await load()
      expect(data!.estimate.company.digital_signature_enabled).toBe(expected)
      expect(forbiddenPaths(data)).toEqual([])
    }
  })
})

describe('getChangeOrderByShareToken', () => {
  function seedChangeOrder(companyOver: Row = {}, invoices: Row[] = []) {
    tables.change_orders = [
      { id: 'co1', company_id: 'c1', project_id: 'p1', estimate_id: 'e1', number: 1, title: 'Garage', reason: null, extra_days: null, status: 'accepted', share_token: 'tok-co1', sent_at: null, viewed_at: null, view_count: 0, responded_at: '2026-02-03T00:00:00Z', client_response: 'accepted', tax_rate: 0, subtotal: 100, tax_amount: 0, total: 100, currency_code: 'USD', created_at: '2026-02-01T00:00:00Z', updated_at: '2026-02-01T00:00:00Z' },
    ]
    tables.change_order_items = []
    tables.change_order_signatures = []
    tables.estimates = [
      { id: 'e1', project_id: 'p1', company_id: 'c1', share_token: 'tok-est', public_slug_token: null, estimate_number: null, estimate_seq: 1, version: 1, responded_at: '2026-01-10T00:00:00Z', language: 'en', is_current: true, client_response: 'accepted', total: 1000, currency_code: 'USD' },
    ]
    tables.estimate_signatures = []
    tables.projects = [{ id: 'p1', name: 'Kitchen', client: { name: 'Pat' } }]
    tables.companies = [{ ...COMPANY_ROW, ...companyOver }]
    tables.invoices = invoices
  }
  const coInvoice = (over: Row) => invoice({ estimate_id: 'e1', change_order_id: 'co1', kind: 'change_order', ...over })

  it.each(PAYMENT_STATES)('still returns the change order invoice (open): %s', async (_label, over) => {
    seedChangeOrder(over, [coInvoice({ id: 'inv-co-open' })])
    const data = await getChangeOrderByShareToken('tok-co1')
    expect(data).not.toBeNull()
    expect(data!.invoice).toMatchObject({
      id: 'inv-co-open',
      status: 'open',
      amount_cents: 100000,
      hosted_invoice_url: 'https://invoice.stripe.com/i/test_hosted',
    })
  })

  it.each(PAYMENT_STATES)('a paid change order invoice wins over a newer open one: %s', async (_label, over) => {
    seedChangeOrder(over, [coInvoice({ id: 'inv-new', created_at: '2026-03-01T00:00:00Z' }), coInvoice({ id: 'inv-paid', status: 'paid', paid_at: '2026-02-04T00:00:00Z' })])
    const data = await getChangeOrderByShareToken('tok-co1')
    expect(data!.invoice).toMatchObject({ id: 'inv-paid', status: 'paid' })
  })

  it('ignores draft and void invoices', async () => {
    seedChangeOrder({}, [coInvoice({ id: 'd', status: 'draft' }), coInvoice({ id: 'v', status: 'void' })])
    expect((await getChangeOrderByShareToken('tok-co1'))!.invoice).toBeNull()
  })

  it('never carries a platform switch, the tenant payments switch, or a Stripe id, at any depth', async () => {
    seedChangeOrder({ online_payments_allowed: true, online_payments_enabled: true }, [coInvoice({ id: 'inv-co-open' })])
    const data = await getChangeOrderByShareToken('tok-co1')
    expect(forbiddenPaths(data)).toEqual([])
    expect(JSON.stringify(data)).not.toMatch(/acct_test_123|cus_test_123|in_test_123/)
  })

  it('exposes the signing switch only as the EFFECTIVE yes/no', async () => {
    const cases: Array<[Row, boolean]> = [
      [{ digital_signature_allowed: true, digital_signature_enabled: true }, true],
      [{ digital_signature_allowed: false, digital_signature_enabled: true }, false],
      [{ digital_signature_allowed: true, digital_signature_enabled: false }, false],
    ]
    for (const [over, expected] of cases) {
      seedChangeOrder(over, [])
      const data = await getChangeOrderByShareToken('tok-co1')
      expect(data!.company.digital_signature_enabled).toBe(expected)
      expect(forbiddenPaths(data)).toEqual([])
    }
  })
})

describe('static guard: the public queries never gate on the payment switches', () => {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  it.each(['lib/queries/share.ts', 'lib/change-orders/queries.ts'])('%s does not select or resolve the payment switches', (file) => {
    const src = strip(readFileSync(resolve(process.cwd(), file), 'utf8'))
    expect(src).not.toMatch(/online_payments_(allowed|enabled)/)
    expect(src).not.toMatch(/resolveCompanyFeatures|platform-feature-state|connectPaymentsOpen|stripe_account_id/)
  })
})
