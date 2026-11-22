import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeFakeSupabase, filterOf, type Call, type Result } from './fake-supabase'

/**
 * declineChangeOrder (app/change-order/[token]/actions.ts): the client's only
 * public non-signing answer. Mirrors respondToEstimate's decline path.
 */

const assertWritable = vi.fn()
const assertCompanyWritable = vi.fn()
vi.mock('@/lib/demo/guard', () => ({
  assertWritable: (...a: unknown[]) => assertWritable(...a),
  assertCompanyWritable: (...a: unknown[]) => assertCompanyWritable(...a),
}))
const notifyChangeOrderResponse = vi.fn()
vi.mock('@/lib/change-orders/notify', () => ({
  notifyChangeOrderResponse: (...a: unknown[]) => notifyChangeOrderResponse(...a),
}))

const mockRateLimit = vi.fn()
vi.mock('@/lib/ratelimit', () => ({ rateLimit: (...a: unknown[]) => mockRateLimit(...a) }))
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-forwarded-for': '198.51.100.4' }),
  cookies: async () => ({ get: () => undefined, set: () => undefined }),
}))

let fake: ReturnType<typeof makeFakeSupabase>
let handler: (c: Call) => Result | undefined
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: () => fake.client }))

const CO = {
  id: 'co-1',
  project_id: 'proj-1',
  company_id: 'comp-1',
  estimate_id: 'est-1',
  number: 2,
  title: 'Garage',
  total: 300,
  client_response: null as string | null,
}
const PARENT = {
  id: 'est-1',
  is_current: true,
  client_response: 'accepted',
  estimate_number: 'SK-1045',
  estimate_seq: 7,
  version: 1,
  project_id: 'proj-1',
}

function setup(over: { co?: unknown; company?: unknown; parent?: unknown; updated?: unknown[] } = {}) {
  handler = (c) => {
    if (c.table === 'change_orders' && c.op === 'select') return { data: over.co === undefined ? CO : over.co }
    if (c.table === 'companies') return { data: over.company === undefined ? { digital_signature_allowed: true, digital_signature_enabled: true } : over.company }
    if (c.table === 'estimates') return { data: over.parent === undefined ? PARENT : over.parent }
    if (c.table === 'change_orders' && c.op === 'update') return { data: over.updated ?? [{ id: 'co-1' }] }
    if (c.table === 'projects') return { data: { client: { name: 'Bob' } } }
  }
  fake = makeFakeSupabase((c) => handler(c))
}

async function decline(token = 'tok-1') {
  const { declineChangeOrder } = await import('@/app/change-order/[token]/actions')
  return declineChangeOrder(token)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  assertWritable.mockResolvedValue(null)
  assertCompanyWritable.mockResolvedValue(null)
  mockRateLimit.mockResolvedValue({ allowed: true, count: 1, max: 20 })
  setup()
})

describe('declineChangeOrder', () => {
  it('declines with a check-and-set on client_response, logs activity and notifies the owner', async () => {
    expect(await decline()).toEqual({ success: true })
    const upd = fake.calls.find((c) => c.table === 'change_orders' && c.op === 'update')!
    expect(upd.payload).toMatchObject({ client_response: 'declined', status: 'declined' })
    expect(upd.filters).toEqual(expect.arrayContaining([['is', 'client_response', null]]))
    expect(fake.calls.find((c) => c.table === 'estimate_activity')!.payload).toMatchObject({
      event_type: 'change_order_declined',
      estimate_id: 'est-1',
      metadata: { change_order_id: 'co-1', number: 2 },
    })
    expect(notifyChangeOrderResponse).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'co-1', number: 2, estimate_number: 'SK-1045', client_name: 'Bob' }),
      'declined',
    )
    // A decline never touches the project total.
    expect(fake.calls.some((c) => c.table === 'projects' && c.op === 'update')).toBe(false)
  })

  it('looks the change order up by share token only', async () => {
    await decline('tok-9')
    expect(filterOf(fake.calls[0], 'share_token')).toBe('tok-9')
  })

  it('refuses an unknown token', async () => {
    setup({ co: null })
    expect(await decline()).toEqual({ success: false, error: 'Change order not found' })
  })

  it('refuses the demo principal and demo companies before any write', async () => {
    assertWritable.mockResolvedValue({ error: 'demo_readonly' })
    expect(await decline()).toEqual({ success: false, error: 'demo_readonly' })
    assertWritable.mockResolvedValue(null)
    assertCompanyWritable.mockResolvedValue({ error: 'demo_readonly' })
    expect(await decline()).toEqual({ success: false, error: 'demo_readonly' })
    expect(fake.calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('refuses when the company has online approval off', async () => {
    setup({ company: { digital_signature_allowed: true, digital_signature_enabled: false } })
    const r = await decline()
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/not enabled/)
    expect(fake.calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('refuses when the platform switch is off even though the tenant switch is on', async () => {
    setup({ company: { digital_signature_allowed: false, digital_signature_enabled: true } })
    const r = await decline()
    expect(r.success).toBe(false)
    expect(r.error).toMatch(/not enabled/)
    expect(fake.calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('refuses when already answered', async () => {
    setup({ co: { ...CO, client_response: 'accepted' } })
    expect(await decline()).toEqual({ success: false, error: 'This change order has already been responded to' })
    expect(fake.calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('refuses when the parent estimate is no longer the accepted current one', async () => {
    setup({ parent: { ...PARENT, is_current: false } })
    expect(await decline()).toEqual({ success: false, error: 'contract_not_accepted' })
    setup({ parent: { ...PARENT, client_response: null } })
    expect(await decline()).toEqual({ success: false, error: 'contract_not_accepted' })
    expect(fake.calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('loses the race cleanly: a concurrent answer makes the update match nothing, so no activity or notice', async () => {
    setup({ updated: [] })
    expect(await decline()).toEqual({ success: false, error: 'This change order has already been responded to' })
    expect(fake.calls.some((c) => c.table === 'estimate_activity')).toBe(false)
    expect(notifyChangeOrderResponse).not.toHaveBeenCalled()
  })

  it('is rate limited by IP + a token hash before any lookup', async () => {
    await decline('tok-1')
    const [name, key] = mockRateLimit.mock.calls[0]
    expect(name).toBe('publicChangeOrderPerMinute')
    expect(key).toMatch(/^198\.51\.100\.4:[0-9a-f]{16}$/)
    expect(String(key)).not.toContain('tok-1')
  })

  it('refuses with a plain message and touches nothing when rate limited', async () => {
    mockRateLimit.mockResolvedValue({ allowed: false, count: 21, max: 20, retryAfter: 30 })
    expect(await decline()).toEqual({ success: false, error: 'Too many attempts. Try again in a minute.' })
    expect(fake.calls).toHaveLength(0)
  })

  it('refuses a change order that is still a draft (the UI only hides the buttons)', async () => {
    setup({ co: { ...CO, status: 'draft' } })
    expect(await decline()).toEqual({ success: false, error: 'This change order has not been sent yet' })
    expect(fake.calls.some((c) => c.op === 'update')).toBe(false)
  })

  it('declines a sent change order', async () => {
    setup({ co: { ...CO, status: 'sent' } })
    expect(await decline()).toEqual({ success: true })
  })

  it('a failing notification never fails the decline', async () => {
    notifyChangeOrderResponse.mockRejectedValue(new Error('smtp down'))
    expect(await decline()).toEqual({ success: true })
  })
})
