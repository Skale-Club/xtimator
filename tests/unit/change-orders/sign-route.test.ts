import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeSupabase, filterOf, type Call, type Result } from './fake-supabase'
import { canonicalJsonStringify } from '@/lib/change-orders/snapshot'
import { createHash } from 'node:crypto'
import { buildChangeOrderSnapshot, hashChangeOrderSnapshot } from '@/lib/change-orders/snapshot'

/**
 * Public change order sign route contract (app/api/change-orders/[id]/sign):
 * validation, token lookup, demo guard, online-approval check, content-version
 * check with NO retry, SQLSTATE mapping and the owner notification.
 */

const mockDemoGuard = vi.fn()
const mockRateLimit = vi.fn()
const mockNotify = vi.fn()
const mockHeaders = vi.fn()
const IDENTITY = {
  company: { name: 'Company', owner_name: null, phone: null, email: null, website: null, address: null, city: null, state: null, zip: null },
  project: { name: 'Project', project_type: null }, client: null, preparedBy: null, language: 'en' as const,
}
const CONTRACT = { before: 1000, after: 1106.25, revision: 'contract-revision' }
const PARENT = { id: 'est-1', company_id: 'comp-1', project_id: 'proj-1', estimate_number: 'SK-1045', responded_at: '2026-11-01T00:00:00Z' }
vi.mock('@/lib/estimate/signing-identity', () => ({ loadSigningIdentity: async () => IDENTITY }))
vi.mock('@/lib/change-orders/load', async (original) => ({
  ...await original<typeof import('@/lib/change-orders/load')>(), loadChangeOrderSigningContract: async () => CONTRACT,
}))
vi.mock('@/lib/estimates/signing-result', () => ({
  committedSigningResult: async (_client: unknown, _kind: unknown, _id: unknown, _company: unknown, alreadySigned = false) =>
    ({ ok: true, ...(alreadySigned ? { alreadySigned: true } : {}) }),
}))

vi.mock('next/headers', () => ({ headers: () => mockHeaders() }))
vi.mock('@/lib/demo/guard', () => ({ demoGuardResponse: (...a: unknown[]) => mockDemoGuard(...a) }))
vi.mock('@/lib/ratelimit', () => ({ rateLimit: (...a: unknown[]) => mockRateLimit(...a) }))
vi.mock('@/lib/change-orders/notify', () => ({ notifyChangeOrderResponse: (...a: unknown[]) => mockNotify(...a) }))

let fake: ReturnType<typeof makeFakeSupabase>
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: () => fake.client }))

import { POST } from '@/app/api/change-orders/[id]/sign/route'

const PAGE_VERSION = '2026-11-17T10:00:00.000Z'
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const PARAMS = { params: Promise.resolve({ id: 'co-1' }) }

function req(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/change-orders/co-1/sign', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      token: 'tok-1',
      signerName: 'Bob Client',
      signatureData: TINY_PNG,
      contentVersion: PAGE_VERSION,
      contentFingerprint: hashChangeOrderSnapshot(buildChangeOrderSnapshot(CO_ROW, ITEMS, {
        identity: IDENTITY, contract: CONTRACT, estimate: { number: PARENT.estimate_number, acceptedAt: PARENT.responded_at },
      })),
      ...body,
    }),
  })
}

const CO_ROW = {
  id: 'co-1',
  company_id: 'comp-1',
  project_id: 'proj-1',
  estimate_id: 'est-1',
  number: 2,
  title: 'Garage painting',
  reason: null,
  extra_days: 3,
  tax_rate: 6.25,
  subtotal: 100,
  tax_amount: 6.25,
  total: 106.25,
  currency_code: 'USD',
  share_token: 'tok-1',
  client_response: null as string | null,
  updated_at: PAGE_VERSION,
}
const ITEMS = [
  { id: 'i2', description: 'B', quantity: 1, unit: null, unit_price: 50, total: 50, taxable: true, sort_order: 1 },
  { id: 'i1', description: 'A', quantity: 1, unit: null, unit_price: 50, total: 50, taxable: true, sort_order: 0 },
]
const RPC_OK = {
  project_id: 'proj-1',
  company_id: 'comp-1',
  estimate_number: 'SK-1045',
  client_name: 'Bob',
  number: 2,
  title: 'Garage painting',
}

function setup(over: { co?: unknown; company?: unknown; items?: unknown; rpc?: Result } = {}) {
  fake = makeFakeSupabase(
    (c: Call) => {
      if (c.table === 'change_orders') return { data: over.co === undefined ? CO_ROW : over.co }
      if (c.table === 'companies') return { data: over.company === undefined ? { digital_signature_allowed: true, digital_signature_enabled: true } : over.company }
      if (c.table === 'change_order_items') return over.items === undefined ? { data: ITEMS } : (over.items as Result)
      if (c.table === 'estimates') return { data: PARENT }
    },
    () => over.rpc ?? { data: RPC_OK },
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockHeaders.mockResolvedValue(new Headers({ 'x-forwarded-for': '203.0.113.9', 'user-agent': 'vitest' }))
  mockRateLimit.mockResolvedValue({ allowed: true })
  mockDemoGuard.mockResolvedValue(null)
  mockNotify.mockResolvedValue(undefined)
  setup()
})

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>
}

describe('sign route: happy path', () => {
  it('signs, snapshots the sorted items with a reproducible sha256, notifies the owner and answers {ok:true}', async () => {
    const res = await POST(req({ signerEmail: ' bob@example.com ' }), PARAMS)
    expect(res.status).toBe(200)
    expect(await json(res)).toEqual({ ok: true })

    expect(fake.rpcCalls).toHaveLength(1)
    const { name, args } = fake.rpcCalls[0]
    expect(name).toBe('sign_change_order_atomic')
    expect(args).toMatchObject({
      p_change_order_id: 'co-1',
      p_share_token: 'tok-1',
      p_expected_updated_at: PAGE_VERSION,
      p_signer_name: 'Bob Client',
      p_signer_email: 'bob@example.com',
      p_ip_address: '203.0.113.9',
      p_user_agent: 'vitest',
      p_signed_total: 106.25,
    })
    const snapshot = args.p_signed_content as { items: Array<{ id: string }>; total: number }
    expect(snapshot.items.map((i) => i.id)).toEqual(['i1', 'i2'])
    expect(snapshot.total).toBe(106.25)
    expect(args.p_snapshot_sha256).toBe(createHash('sha256').update(canonicalJsonStringify(snapshot)).digest('hex'))

    expect(mockNotify).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'co-1', number: 2, estimate_number: 'SK-1045', client_name: 'Bob' }),
      'accepted',
    )
  })

  it('a failing notification never fails the signature', async () => {
    mockNotify.mockRejectedValue(new Error('boom'))
    expect((await POST(req({}), PARAMS)).status).toBe(200)
  })

  it('looks the change order up by id AND share token', async () => {
    await POST(req({}), PARAMS)
    const lookup = fake.calls.find((c) => c.table === 'change_orders')!
    expect(filterOf(lookup, 'id')).toBe('co-1')
    expect(filterOf(lookup, 'share_token')).toBe('tok-1')
  })
})

describe('sign route: request validation (before any DB read)', () => {
  it('429 when rate limited', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, retryAfter: 30 })
    const res = await POST(req({}), PARAMS)
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBe('30')
    expect(fake.calls).toHaveLength(0)
  })

  it.each([
    ['missing token', { token: '' }, 'Token required'],
    ['blank name', { signerName: '   ' }, 'Signer name must be between 1 and 200 characters'],
    ['long name', { signerName: 'x'.repeat(201) }, 'Signer name must be between 1 and 200 characters'],
    ['bad email', { signerEmail: 'nope' }, 'Invalid signer email'],
    ['non-PNG signature url', { signatureData: 'https://evil.example/x.png' }, 'Signature must be a PNG image data URL'],
    ['not base64', { signatureData: 'data:image/png;base64,@@@' }, 'Invalid signature data encoding'],
    ['not a png', { signatureData: 'data:image/png;base64,AAAAAAAA' }, 'Signature data is not a valid PNG image'],
  ])('400 on %s', async (_n, body, message) => {
    const res = await POST(req(body), PARAMS)
    expect(res.status).toBe(400)
    expect((await json(res)).error).toBe(message)
    expect(fake.calls).toHaveLength(0)
  })

  it('400 on an unparseable body', async () => {
    const res = await POST(new Request('http://localhost/x', { method: 'POST', body: '{' }), PARAMS)
    expect(res.status).toBe(400)
  })
})

describe('sign route: guards', () => {
  it('404 for an unknown id/token pair', async () => {
    setup({ co: null })
    const res = await POST(req({}), PARAMS)
    expect(res.status).toBe(404)
    expect(fake.rpcCalls).toHaveLength(0)
  })

  it('returns the demo guard response and never reaches the RPC', async () => {
    mockDemoGuard.mockResolvedValue(new Response(JSON.stringify({ error: 'demo_readonly' }), { status: 403 }))
    const res = await POST(req({}), PARAMS)
    expect(res.status).toBe(403)
    expect(mockDemoGuard).toHaveBeenCalledWith({ companyId: 'comp-1' })
    expect(fake.rpcCalls).toHaveLength(0)
  })

  it('403 (same response) when the platform switch is off but the tenant switch is on', async () => {
    setup({ company: { digital_signature_allowed: false, digital_signature_enabled: true } })
    const res = await POST(req({}), PARAMS)
    expect(res.status).toBe(403)
    expect((await json(res)).error).toBe('Digital signature not enabled')
    expect(fake.rpcCalls).toHaveLength(0)
  })

  it('403 fails closed when the allowed column is missing from the row', async () => {
    setup({ company: { digital_signature_enabled: true } })
    const res = await POST(req({}), PARAMS)
    expect(res.status).toBe(403)
    expect(fake.rpcCalls).toHaveLength(0)
  })

  it('403 when the company has online approval off', async () => {
    setup({ company: { digital_signature_allowed: true, digital_signature_enabled: false } })
    const res = await POST(req({}), PARAMS)
    expect(res.status).toBe(403)
    expect((await json(res)).error).toBe('Digital signature not enabled')
    expect(fake.rpcCalls).toHaveLength(0)
  })

  it('409 already_responded when the change order was answered', async () => {
    setup({ co: { ...CO_ROW, client_response: 'accepted', updated_at: '2026-11-17T11:00:00.000Z' } })
    const res = await POST(req({}), PARAMS)
    expect(res.status).toBe(409)
    expect(await json(res)).toEqual({ error: 'already_responded' })
    expect(fake.rpcCalls).toHaveLength(0)
  })
})

describe('sign route: content version (no retry)', () => {
  it('409 change_order_updated when the version is missing', async () => {
    const res = await POST(req({ contentVersion: undefined }), PARAMS)
    expect(res.status).toBe(409)
    expect(await json(res)).toEqual({ error: 'change_order_updated' })
    expect(fake.rpcCalls).toHaveLength(0)
  })

  it('409 change_order_updated when the version differs from the live row', async () => {
    const res = await POST(req({ contentVersion: '2026-11-17T09:59:00.000Z' }), PARAMS)
    expect(res.status).toBe(409)
    expect(await json(res)).toEqual({ error: 'change_order_updated' })
    expect(fake.rpcCalls).toHaveLength(0)
  })

  it('accepts the same instant in a different format (microseconds, +00:00)', async () => {
    setup({ co: { ...CO_ROW, updated_at: '2026-11-17T10:00:00.000000+00:00' } })
    const res = await POST(req({}), PARAMS)
    expect(res.status).toBe(200)
  })

  it('a CAS conflict inside the RPC (P0012) is a 409 with exactly ONE RPC call (no retry)', async () => {
    setup({ rpc: { error: { code: 'P0012' } } })
    const res = await POST(req({}), PARAMS)
    expect(res.status).toBe(409)
    expect(await json(res)).toEqual({ error: 'change_order_updated' })
    expect(fake.rpcCalls).toHaveLength(1)
    expect(mockNotify).not.toHaveBeenCalled()
  })
})

describe('sign route: RPC error mapping', () => {
  it.each([
    ['P0013', 404, 'Change order not found'],
    ['P0014', 409, 'contract_not_accepted'],
    ['P0015', 409, 'already_responded'],
    ['XX000', 500, 'Failed to save signature'],
  ])('%s -> %s', async (code, status, error) => {
    setup({ rpc: { error: { code } } })
    const res = await POST(req({}), PARAMS)
    expect(res.status).toBe(status)
    expect((await json(res)).error).toBe(error)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('500 when the items cannot be loaded (fail closed, no signature without evidence)', async () => {
    setup({ items: { data: null, error: { message: 'x' } } })
    const res = await POST(req({}), PARAMS)
    expect(res.status).toBe(500)
    expect(fake.rpcCalls).toHaveLength(0)
  })
})

describe('sign route: draft change orders', () => {
  it('409 for a draft (the UI only hides Accept): no snapshot, no RPC, no notification', async () => {
    setup({ co: { ...CO_ROW, status: 'draft' } })
    const res = await POST(req({}), PARAMS)
    expect(res.status).toBe(409)
    expect((await json(res)).error).toBe('This change order has not been sent yet')
    expect(fake.rpcCalls).toHaveLength(0)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('a sent change order still signs', async () => {
    setup({ co: { ...CO_ROW, status: 'sent' } })
    const res = await POST(req({}), PARAMS)
    expect(res.status).toBe(200)
    expect(fake.rpcCalls).toHaveLength(1)
  })
})
