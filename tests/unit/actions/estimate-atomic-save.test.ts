import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Phase 165 Plan 01 (SAVE-01/02) — saveEstimate now persists everything
 * through ONE supabase.rpc('save_estimate_atomic', ...) call. This is the
 * dedicated test for that RPC-calling contract:
 *   - happy path: the RPC succeeds, saveEstimate returns
 *     { data: { total, updated_at, id_map } } sourced from the RPC result
 *     (not a separate SELECT).
 *   - error mapping: the RPC's distinct SQLSTATEs (P0001 locked, P0002
 *     conflict, P0003 not_current, anything else -> generic) are mapped on
 *     error.code (not message) to the action's typed return contracts.
 *   - the estimate_updated activity insert fires ONLY on a successful RPC
 *     call, never when the RPC raises.
 *   - exactly ONE rpc() call per saveEstimate invocation — proving the write
 *     set is genuinely one round-trip, not a sequence.
 */

const getActiveCompanyId = vi.fn()
vi.mock('@/lib/queries/active-company', () => ({
  getActiveCompanyId: (...args: unknown[]) => getActiveCompanyId(...args),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

vi.mock('@/lib/integrations/xphere/dispatch', () => ({
  dispatchXphereSync: vi.fn(),
}))

const fromImpl = vi.fn()
const rpcImpl = vi.fn()
let activityInsertPayload: Record<string, unknown> | null = null
let activityInsertCalled = false

// Configurable per-test.
let rpcError: { code: string; message: string } | null = null
let rpcData: Record<string, unknown> | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u_1' } } }) },
    from: (t: string) => fromImpl(t),
    rpc: (...args: unknown[]) => rpcImpl(...args),
  }),
}))

function configureSupabase() {
  activityInsertPayload = null
  activityInsertCalled = false

  rpcImpl.mockImplementation(() => {
    if (rpcError) return Promise.resolve({ data: null, error: rpcError })
    return Promise.resolve({ data: rpcData, error: null })
  })

  fromImpl.mockImplementation((table: string) => {
    if (table === 'companies') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { id: 'co_1', currency_code: 'usd', default_tax_rate: 0.0875 },
              error: null,
            }),
          }),
        }),
      }
    }

    if (table === 'estimate_activity') {
      return {
        insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
          activityInsertCalled = true
          activityInsertPayload = payload
          return Promise.resolve({ error: null })
        }),
      }
    }

    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getActiveCompanyId.mockResolvedValue('co_1')
  rpcError = null
  rpcData = {
    updated_at: '2026-07-17T12:00:00.000Z',
    project_total: 1087.5,
    project_id: 'proj_1',
    previous_total: 1000,
    id_map: { 'temp-sec-1': 'sec_real_1', 'temp-item-1': 'item_real_1' },
  }
  configureSupabase()
})

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    id: 'est_1',
    summary: null,
    notes: null,
    timeline: null,
    payment_terms: null,
    warranty_terms: null,
    discount_type: null,
    discount_value: 0,
    tax_rate: 0.0875,
    estimate_date: null,
    estimate_number: null,
    sections: [
      {
        id: 'temp-sec-1',
        title: 'General',
        sort_order: 0,
        items: [
          {
            id: 'temp-item-1',
            description: 'Labor',
            quantity: 10,
            unit: 'hr',
            unit_price: 100,
            sort_order: 0,
            price_source: null,
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('SAVE-01: saveEstimate calls save_estimate_atomic exactly once (atomic happy path)', () => {
  it('returns { data: { total, updated_at, id_map } } sourced from the RPC result', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(baseInput() as never)

    expect(result).not.toHaveProperty('error')
    expect(result.data?.total).toBe(1087.5) // 10 * 100 = 1000 subtotal; 1000 * 0.0875 = 87.5 tax
    expect(result.data?.updated_at).toBe('2026-07-17T12:00:00.000Z')
    expect(result.data?.id_map).toEqual({
      'temp-sec-1': 'sec_real_1',
      'temp-item-1': 'item_real_1',
    })
  })

  it('calls supabase.rpc exactly once with the correct function name', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    await saveEstimate(baseInput() as never)

    expect(rpcImpl).toHaveBeenCalledTimes(1)
    expect(rpcImpl.mock.calls[0][0]).toBe('save_estimate_atomic')
  })

  it('passes p_estimate_id/p_company_id/p_header/p_sections in the rpc call', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    await saveEstimate(baseInput() as never)

    const args = rpcImpl.mock.calls[0][1] as Record<string, unknown>
    expect(args.p_estimate_id).toBe('est_1')
    expect(args.p_company_id).toBe('co_1')
    expect(args).toHaveProperty('p_header')
    expect(args).toHaveProperty('p_sections')
  })
})

describe('SAVE-01: error mapping on distinct SQLSTATEs (error.code, not message)', () => {
  it('P0001 -> { error: "estimate_locked" }', async () => {
    rpcError = { code: 'P0001', message: 'estimate_locked' }
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(baseInput() as never)

    expect(result.error).toBe('estimate_locked')
    expect('conflict' in result).toBe(false)
  })

  it('P0002 -> { error: <conflict copy>, conflict: true }', async () => {
    rpcError = { code: 'P0002', message: 'estimate_conflict' }
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(baseInput() as never)

    expect(result.error).toContain('changed elsewhere')
    expect('conflict' in result && result.conflict).toBe(true)
  })

  it('P0003 -> { error: "estimate_not_current" }', async () => {
    rpcError = { code: 'P0003', message: 'estimate_not_current' }
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(baseInput() as never)

    expect(result.error).toBe('estimate_not_current')
  })

  it('P0004 (not_found) -> generic { error: "Failed to save estimate" }', async () => {
    rpcError = { code: 'P0004', message: 'estimate_not_found' }
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(baseInput() as never)

    expect(result.error).toBe('Failed to save estimate')
  })

  it('an unrecognized error.code also maps to the generic failure (never leaks a raw SQL message)', async () => {
    rpcError = { code: '23505', message: 'unique_violation on some_constraint' }
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(baseInput() as never)

    expect(result.error).toBe('Failed to save estimate')
  })
})

describe('SAVE-01/TRUST-03: estimate_updated activity fires on success only', () => {
  it('a successful save fires the fire-and-forget estimate_updated activity insert', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    await saveEstimate(baseInput() as never)
    await new Promise((r) => setTimeout(r, 0)) // flush the un-awaited insert

    expect(activityInsertCalled).toBe(true)
    expect(activityInsertPayload?.event_type).toBe('estimate_updated')
    expect(activityInsertPayload?.project_id).toBe('proj_1')
    expect(activityInsertPayload).toHaveProperty('metadata')
  })

  it('a locked/conflicted/failed RPC call never fires the activity insert', async () => {
    rpcError = { code: 'P0001', message: 'estimate_locked' }
    const { saveEstimate } = await import('@/lib/actions/estimate')

    await saveEstimate(baseInput() as never)
    await new Promise((r) => setTimeout(r, 0))

    expect(activityInsertCalled).toBe(false)
  })

  it('total_delta in the activity metadata uses the RPC-returned previous_total (not a separate SELECT)', async () => {
    rpcData = {
      updated_at: '2026-07-17T12:00:00.000Z',
      project_total: 1087.5,
      project_id: 'proj_1',
      previous_total: 900,
      id_map: {},
    }
    const { saveEstimate } = await import('@/lib/actions/estimate')

    await saveEstimate(baseInput() as never)
    await new Promise((r) => setTimeout(r, 0))

    const metadata = activityInsertPayload?.metadata as { total_delta: number }
    expect(metadata.total_delta).toBe(Math.round((1087.5 - 900) * 100) / 100)
  })
})
