import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeSupabase, filterOf, type Call, type Result } from './fake-supabase'

/**
 * Owner-side change order actions (lib/actions/change-order.ts): auth / demo /
 * billing guards, SQLSTATE mapping, lock rules and contract-total bookkeeping.
 * Supabase is a recording fake (see fake-supabase.ts).
 */

const getActiveCompanyId = vi.fn()
vi.mock('@/lib/queries/active-company', () => ({ getActiveCompanyId: (...a: unknown[]) => getActiveCompanyId(...a) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
const billingEditDenied = vi.fn()
vi.mock('@/lib/billing/access-guard', () => ({ billingEditDenied: (...a: unknown[]) => billingEditDenied(...a) }))
const assertWritable = vi.fn()
const assertCompanyWritable = vi.fn()
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: (...a: unknown[]) => assertWritable(...a),
  assertCompanyWritable: (...a: unknown[]) => assertCompanyWritable(...a),
}))

let handler: (c: Call) => Result | undefined
let rpcHandler: (name: string, args: Record<string, unknown>) => Result
let fake: ReturnType<typeof makeFakeSupabase>
let claims: { sub: string } | null

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(async () => ({
    ...fake.client,
    auth: { getClaims: () => Promise.resolve({ data: { claims } }) },
  })),
}))

function setup(h: (c: Call) => Result | undefined, r?: (name: string, args: Record<string, unknown>) => Result) {
  handler = h
  rpcHandler = r ?? (() => ({ data: null, error: null }))
  fake = makeFakeSupabase(
    (c) => handler(c),
    (n, a) => rpcHandler(n, a),
  )
}

async function actions() {
  return await import('@/lib/actions/change-order')
}

const ROW = {
  id: 'co-1',
  project_id: 'proj-1',
  estimate_id: 'est-1',
  number: 1,
  total: 250,
  status: 'draft',
  sent_at: null as string | null,
  client_response: null as string | null,
  responded_at: null as string | null,
  updated_at: '2026-11-17T10:00:00.000000+00:00',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  claims = { sub: 'user-1' }
  getActiveCompanyId.mockResolvedValue('co_1')
  assertWritable.mockResolvedValue(null)
  assertCompanyWritable.mockResolvedValue(null)
  billingEditDenied.mockResolvedValue(null)
  setup(() => undefined)
})

describe('guards (every write action)', () => {
  const writers: Array<[string, (m: typeof import('@/lib/actions/change-order')) => Promise<unknown>]> = [
    ['createChangeOrder', (m) => m.createChangeOrder('est-1')],
    ['saveChangeOrder', (m) => m.saveChangeOrder({ id: 'co-1', title: 't', reason: null, extra_days: null, items: [] })],
    ['deleteChangeOrder', (m) => m.deleteChangeOrder('co-1')],
    ['markChangeOrderShared', (m) => m.markChangeOrderShared('co-1')],
    ['recordChangeOrderResponse', (m) => m.recordChangeOrderResponse('co-1', 'accepted')],
  ]

  it.each(writers)('%s: refuses without a session', async (_n, run) => {
    claims = null
    expect(await run(await actions())).toEqual({ error: 'Not authenticated' })
    expect(fake.calls).toHaveLength(0)
    expect(fake.rpcCalls).toHaveLength(0)
  })

  it.each(writers)('%s: refuses the demo principal before touching data', async (_n, run) => {
    assertWritable.mockResolvedValue({ error: 'demo_readonly' })
    expect(await run(await actions())).toEqual({ error: 'demo_readonly' })
    expect(fake.calls).toHaveLength(0)
    expect(fake.rpcCalls).toHaveLength(0)
  })

  it.each(writers)('%s: refuses a demo company', async (_n, run) => {
    assertCompanyWritable.mockResolvedValue({ error: 'demo_readonly' })
    expect(await run(await actions())).toEqual({ error: 'demo_readonly' })
    expect(fake.rpcCalls).toHaveLength(0)
  })

  it.each(writers)('%s: refuses a paywalled company', async (_n, run) => {
    billingEditDenied.mockResolvedValue({ error: 'paywalled', code: 'paywalled' })
    expect(await run(await actions())).toEqual({ error: 'paywalled' })
    expect(fake.rpcCalls).toHaveLength(0)
  })

  it.each(writers)('%s: refuses when there is no active company', async (_n, run) => {
    getActiveCompanyId.mockResolvedValue(null)
    expect(await run(await actions())).toEqual({ error: 'No company found' })
  })
})

describe('createChangeOrder', () => {
  it('creates through the RPC, scoped to the active company, and logs activity', async () => {
    setup(
      (c) => {
        if (c.table === 'estimates') return { data: { id: 'est-1', project_id: 'proj-1' } }
      },
      () => ({ data: { id: 'co-9', number: 3 } }),
    )
    const { createChangeOrder } = await actions()
    expect(await createChangeOrder('est-1')).toEqual({ data: { id: 'co-9', number: 3 } })
    expect(fake.rpcCalls).toEqual([{ name: 'create_change_order', args: { p_estimate_id: 'est-1' } }])
    const est = fake.calls.find((c) => c.table === 'estimates')!
    expect(filterOf(est, 'company_id')).toBe('co_1')
    const activity = fake.calls.find((c) => c.table === 'estimate_activity')!
    expect(activity.payload).toMatchObject({ event_type: 'change_order_created', estimate_id: 'est-1' })
  })

  it('maps P0014 to contract_not_accepted and P0016 / other errors sensibly', async () => {
    setup(
      (c) => (c.table === 'estimates' ? { data: { id: 'est-1', project_id: 'proj-1' } } : undefined),
      () => ({ error: { code: 'P0014' } }),
    )
    const { createChangeOrder } = await actions()
    expect(await createChangeOrder('est-1')).toEqual({ error: 'contract_not_accepted' })
    rpcHandler = () => ({ error: { code: 'P0016' } })
    expect(await createChangeOrder('est-1')).toEqual({ error: 'Estimate not found' })
    rpcHandler = () => ({ error: { code: 'XX000' } })
    expect(await createChangeOrder('est-1')).toEqual({ error: 'Failed to create change order' })
  })

  it('refuses an estimate that is not in the active company', async () => {
    setup(() => ({ data: null }))
    const { createChangeOrder } = await actions()
    expect(await createChangeOrder('est-x')).toEqual({ error: 'Estimate not found' })
    expect(fake.rpcCalls).toHaveLength(0)
  })
})

describe('saveChangeOrder', () => {
  const input = {
    id: 'co-1',
    expectedUpdatedAt: '2026-11-17T10:00:00.000000+00:00',
    title: 'Garage painting',
    reason: 'Client request',
    extra_days: 2,
    items: [{ description: 'Paint', quantity: 2, unit: 'ea', unit_price: -5, taxable: true, sort_order: 0 }],
  }

  it('validates the shape before any write', async () => {
    const { saveChangeOrder } = await actions()
    const bad = await saveChangeOrder({ ...input, items: [{ ...input.items[0], quantity: Number.NaN }] })
    expect(bad.error).toMatch(/^Invalid change order data/)
    const bad2 = await saveChangeOrder({ ...input, extra_days: 1.5 })
    expect(bad2.error).toMatch(/^Invalid change order data/)
    expect(fake.rpcCalls).toHaveLength(0)
  })

  it('sends the header, items, company and expected version to the atomic RPC and returns server totals', async () => {
    rpcHandler = () => ({
      data: { updated_at: '2026-11-17T10:05:00.000000+00:00', subtotal: -10, tax_amount: -0.63, total: -10.63 },
    })
    const { saveChangeOrder } = await actions()
    const r = await saveChangeOrder(input)
    expect(r).toEqual({
      data: { updated_at: '2026-11-17T10:05:00.000000+00:00', subtotal: -10, tax_amount: -0.63, total: -10.63 },
    })
    expect(fake.rpcCalls[0].name).toBe('save_change_order_atomic')
    expect(fake.rpcCalls[0].args).toMatchObject({
      p_change_order_id: 'co-1',
      p_company_id: 'co_1',
      p_expected_updated_at: '2026-11-17T10:00:00.000000+00:00',
      p_header: { title: 'Garage painting', reason: 'Client request', extra_days: 2 },
    })
    expect((fake.rpcCalls[0].args.p_items as unknown[]).length).toBe(1)
  })

  it('omits the version check when expectedUpdatedAt is absent ("keep my changes")', async () => {
    rpcHandler = () => ({ data: { updated_at: 'x', subtotal: 0, tax_amount: 0, total: 0 } })
    const { saveChangeOrder } = await actions()
    await saveChangeOrder({ ...input, expectedUpdatedAt: undefined })
    expect(fake.rpcCalls[0].args.p_expected_updated_at).toBeNull()
  })

  it('maps P0011 locked, P0012 conflict, P0013 not found and anything else', async () => {
    const { saveChangeOrder } = await actions()
    rpcHandler = () => ({ error: { code: 'P0011' } })
    expect(await saveChangeOrder(input)).toEqual({ error: 'change_order_locked' })
    rpcHandler = () => ({ error: { code: 'P0012' } })
    const conflict = await saveChangeOrder(input)
    expect(conflict).toMatchObject({ conflict: true, error: expect.stringMatching(/changed elsewhere/) })
    rpcHandler = () => ({ error: { code: 'P0013' } })
    expect(await saveChangeOrder(input)).toEqual({ error: 'Change order not found' })
    rpcHandler = () => ({ error: { code: 'XX000' } })
    expect(await saveChangeOrder(input)).toEqual({ error: 'Failed to save change order' })
  })
})

describe('deleteChangeOrder', () => {
  it('refuses a shared, answered or signed change order without deleting', async () => {
    const { deleteChangeOrder } = await actions()
    for (const row of [
      { ...ROW, sent_at: '2026-11-17T09:00:00Z' },
      { ...ROW, client_response: 'declined' },
    ]) {
      setup((c) => (c.table === 'change_orders' ? { data: row } : undefined))
      expect(await deleteChangeOrder('co-1')).toEqual({ error: 'change_order_not_deletable' })
      expect(fake.calls.some((c) => c.op === 'delete')).toBe(false)
    }
    setup((c) => {
      if (c.table === 'change_orders') return { data: ROW }
      if (c.table === 'change_order_signatures') return { data: { id: 'sig-1' } }
    })
    expect(await deleteChangeOrder('co-1')).toEqual({ error: 'change_order_not_deletable' })
    expect(fake.calls.some((c) => c.op === 'delete')).toBe(false)
  })

  it('deletes a never-shared draft with the lock rule re-stated in the WHERE', async () => {
    setup((c) => {
      if (c.table === 'change_orders' && c.op === 'select') return { data: ROW }
      if (c.table === 'change_orders' && c.op === 'delete') return { data: [{ id: 'co-1' }] }
    })
    const { deleteChangeOrder } = await actions()
    expect(await deleteChangeOrder('co-1')).toEqual({ data: { id: 'co-1' } })
    const del = fake.calls.find((c) => c.op === 'delete')!
    expect(del.filters).toEqual(
      expect.arrayContaining([
        ['eq', 'company_id', 'co_1'],
        ['is', 'sent_at', null],
        ['is', 'client_response', null],
      ]),
    )
  })

  it('treats a delete that matched nothing (a share landed meanwhile) or P0010 as not deletable', async () => {
    setup((c) => {
      if (c.table === 'change_orders' && c.op === 'select') return { data: ROW }
      if (c.table === 'change_orders' && c.op === 'delete') return { data: [] }
    })
    const { deleteChangeOrder } = await actions()
    expect(await deleteChangeOrder('co-1')).toEqual({ error: 'change_order_not_deletable' })
    setup((c) => {
      if (c.table === 'change_orders' && c.op === 'select') return { data: ROW }
      if (c.table === 'change_orders' && c.op === 'delete') return { error: { code: 'P0010' } }
    })
    expect(await deleteChangeOrder('co-1')).toEqual({ error: 'change_order_not_deletable' })
  })
})

describe('markChangeOrderShared', () => {
  it('first share sets sent_at once, status draft -> sent, only while sent_at is still null', async () => {
    setup((c) => {
      if (c.table === 'change_orders' && c.op === 'select') return { data: ROW }
      if (c.table === 'change_orders' && c.op === 'update') return { data: [{ id: 'co-1', sent_at: '2026-11-17T10:30:00Z' }] }
    })
    const { markChangeOrderShared } = await actions()
    expect(await markChangeOrderShared('co-1')).toEqual({ data: { sent_at: '2026-11-17T10:30:00Z' } })
    const upd = fake.calls.find((c) => c.op === 'update')!
    expect(upd.payload).toMatchObject({ status: 'sent' })
    expect((upd.payload as { sent_at: string }).sent_at).toBeTruthy()
    expect(upd.filters).toEqual(expect.arrayContaining([['is', 'sent_at', null]]))
    expect(fake.calls.find((c) => c.table === 'estimate_activity')!.payload).toMatchObject({
      event_type: 'change_order_sent',
    })
  })

  it('is idempotent: a second share writes nothing, so updated_at (the client version) never moves', async () => {
    setup((c) => (c.table === 'change_orders' ? { data: { ...ROW, status: 'sent', sent_at: '2026-11-17T10:30:00Z' } } : undefined))
    const { markChangeOrderShared } = await actions()
    expect(await markChangeOrderShared('co-1')).toEqual({ data: { sent_at: '2026-11-17T10:30:00Z' } })
    expect(fake.calls.some((c) => c.op === 'update' || c.op === 'insert')).toBe(false)
  })

  it('keeps an answered status when the first share comes after the answer', async () => {
    setup((c) => {
      if (c.table === 'change_orders' && c.op === 'select') return { data: { ...ROW, status: 'accepted' } }
      if (c.table === 'change_orders' && c.op === 'update') return { data: [{ id: 'co-1', sent_at: 'T' }] }
    })
    const { markChangeOrderShared } = await actions()
    await markChangeOrderShared('co-1')
    expect(fake.calls.find((c) => c.op === 'update')!.payload).not.toHaveProperty('status')
  })
})

describe('recordChangeOrderResponse', () => {
  const OWNED_ESTIMATE = {
    id: 'est-1',
    is_current: true,
    client_response: 'accepted',
    responded_at: '2026-11-01T00:00:00Z',
    total: 1000,
    currency_code: 'USD',
    estimate_number: 'SK-1',
    estimate_seq: 1,
    version: 1,
  }

  function scenario(over: { co?: Record<string, unknown>; signature?: unknown; estimate?: unknown; updated?: unknown[] }) {
    setup((c) => {
      if (c.table === 'change_orders' && c.op === 'select' && c.terminal === 'maybeSingle') return { data: { ...ROW, ...over.co } }
      if (c.table === 'change_order_signatures') return { data: over.signature ?? null }
      if (c.table === 'estimates') return { data: over.estimate === undefined ? OWNED_ESTIMATE : over.estimate }
      if (c.table === 'estimate_signatures') return { data: { signed_total: 900 } }
      if (c.table === 'change_orders' && c.op === 'update') return { data: over.updated ?? [{ id: 'co-1', updated_at: 'NEW' }] }
      if (c.table === 'change_orders' && c.terminal === 'list') {
        return {
          data: [
            { id: 'co-1', number: 1, title: 'a', status: 'accepted', client_response: 'accepted', total: 250, sent_at: null, responded_at: null, view_count: 0 },
          ],
        }
      }
    })
  }

  it('refuses when a signature exists (signed online is evidence)', async () => {
    scenario({ signature: { id: 'sig' } })
    const { recordChangeOrderResponse } = await actions()
    expect(await recordChangeOrderResponse('co-1', null)).toEqual({
      error: 'This change order was signed online and cannot be changed',
    })
    expect(fake.calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('records an approval: status accepted, project total = signed base + approved change orders, activity logged', async () => {
    scenario({})
    const { recordChangeOrderResponse } = await actions()
    const r = await recordChangeOrderResponse('co-1', 'accepted')
    expect(r.data).toMatchObject({ client_response: 'accepted', updated_at: 'NEW' })
    const upd = fake.calls.find((c) => c.table === 'change_orders' && c.op === 'update')!
    expect(upd.payload).toMatchObject({ client_response: 'accepted', status: 'accepted' })
    const proj = fake.calls.find((c) => c.table === 'projects')!
    expect(proj.payload).toEqual({ total: 1150 }) // 900 signed base + 250 approved
    expect(fake.calls.find((c) => c.table === 'estimate_activity')!.payload).toMatchObject({
      event_type: 'change_order_accepted',
      metadata: { source: 'manual' },
    })
  })

  it('refuses to approve when the parent is no longer the accepted current estimate', async () => {
    scenario({ estimate: { is_current: false, client_response: 'accepted' } })
    const { recordChangeOrderResponse } = await actions()
    expect(await recordChangeOrderResponse('co-1', 'accepted')).toEqual({ error: 'contract_not_accepted' })
    expect(fake.calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('clearing a declined answer reopens it (back to sent, or draft when never shared)', async () => {
    scenario({ co: { client_response: 'declined', status: 'declined', sent_at: '2026-11-10T00:00:00Z' } })
    const { recordChangeOrderResponse } = await actions()
    const r = await recordChangeOrderResponse('co-1', null)
    expect(r.data).toMatchObject({ client_response: null, responded_at: null })
    expect(fake.calls.find((c) => c.table === 'change_orders' && c.op === 'update')!.payload).toMatchObject({
      client_response: null,
      status: 'sent',
    })
    scenario({ co: { client_response: 'declined', status: 'declined', sent_at: null } })
    await recordChangeOrderResponse('co-1', null)
    expect(fake.calls.find((c) => c.table === 'change_orders' && c.op === 'update')!.payload).toMatchObject({ status: 'draft' })
  })

  it('is a no-op (success, no write) when the answer is unchanged, and rejects a bad value', async () => {
    scenario({ co: { client_response: 'accepted', responded_at: 'R' } })
    const { recordChangeOrderResponse } = await actions()
    const r = await recordChangeOrderResponse('co-1', 'accepted')
    expect(r.data).toMatchObject({ client_response: 'accepted', responded_at: 'R' })
    expect(fake.calls.some((c) => c.op === 'update')).toBe(false)
    expect(await recordChangeOrderResponse('co-1', 'maybe' as never)).toEqual({ error: 'Invalid response' })
  })
})

describe('read actions', () => {
  it('getChangeOrderAction is scoped to the active company and maps rows', async () => {
    setup((c) => {
      if (c.table === 'change_orders') return { data: { ...ROW, company_id: 'co_1', title: 'T', share_token: 'tok', tax_rate: 6.25, subtotal: 100, tax_amount: 6.25, total: 106.25, currency_code: 'USD', created_at: 'C', view_count: 0 } }
      if (c.table === 'change_order_items') return { data: [{ id: 'i1', description: 'x', quantity: 1, unit_price: 100, total: 100, taxable: true, sort_order: 0 }] }
      if (c.table === 'change_order_signatures') return { data: null }
    })
    const { getChangeOrderAction } = await actions()
    const r = await getChangeOrderAction('co-1')
    expect(r.data).toMatchObject({ id: 'co-1', total: 106.25, hasSignature: false, signature: null })
    expect(r.data!.items).toHaveLength(1)
    expect(filterOf(fake.calls[0], 'company_id')).toBe('co_1')
    expect(assertWritable).not.toHaveBeenCalled()
  })

  it('getChangeOrderAction / getContractSummaryAction: not found, unauthenticated', async () => {
    setup(() => ({ data: null }))
    const { getChangeOrderAction, getContractSummaryAction } = await actions()
    expect(await getChangeOrderAction('nope')).toEqual({ error: 'Change order not found' })
    expect(await getContractSummaryAction('est-x')).toEqual({ data: null })
    claims = null
    expect(await getContractSummaryAction('est-1')).toEqual({ error: 'Not authenticated' })
  })
})
