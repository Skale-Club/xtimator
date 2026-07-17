import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Pre-launch audit fix (B7) — saveEstimate optimistic-concurrency guard.
 *
 * Two tabs/sessions editing the SAME estimate: without this guard, whichever
 * save lands second silently overwrites the first (and DELETES any
 * section/item the first writer added that the second writer's stale payload
 * doesn't know about).
 *
 * Phase 165 Plan 01 update: the compare-and-set now runs INSIDE the
 * save_estimate_atomic RPC's transaction (against the row it locked via
 * SELECT ... FOR UPDATE), not via a `.eq('updated_at', expectedUpdatedAt)`
 * filter on a separate UPDATE call. A stale p_expected_updated_at makes the
 * RPC RAISE the 'P0002' SQLSTATE, which saveEstimate maps to
 * { error, conflict: true } WITHOUT ever reaching the section/item upserts
 * (they live inside the SAME transaction, after the compare-and-set check,
 * so a raised exception rolls back the whole transaction — nothing partial
 * is ever written).
 *
 * This test proves:
 *   - a MATCHING expectedUpdatedAt saves normally and returns the new
 *     updated_at (sourced from the RPC result) for the caller's next baseline.
 *   - a STALE expectedUpdatedAt returns { error, conflict: true }.
 *   - omitting expectedUpdatedAt entirely (back-compat) passes p_expected_updated_at
 *     as null, skipping the RPC's internal check.
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

const SERVER_UPDATED_AT = '2026-07-06T10:00:00.000Z'
const NEW_UPDATED_AT = '2026-07-06T10:05:00.000Z'

const fromImpl = vi.fn()
const rpcImpl = vi.fn()
let lastRpcArgs: Record<string, unknown> | null = null

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u_1' } } }) },
    from: (t: string) => fromImpl(t),
    rpc: (fn: string, args: Record<string, unknown>) => rpcImpl(fn, args),
  }),
}))

function configureSupabase() {
  lastRpcArgs = null

  rpcImpl.mockImplementation((_fn: string, args: Record<string, unknown>) => {
    lastRpcArgs = args
    const expected = args.p_expected_updated_at as string | null

    if (expected != null && expected !== SERVER_UPDATED_AT) {
      // Stale caller — the RPC's internal compare-and-set raises P0002.
      return Promise.resolve({ data: null, error: { code: 'P0002', message: 'estimate_conflict' } })
    }

    return Promise.resolve({
      data: {
        updated_at: NEW_UPDATED_AT,
        project_total: 1000,
        project_id: 'proj_1',
        previous_total: 1000,
        id_map: {},
      },
      error: null,
    })
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
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    }

    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getActiveCompanyId.mockResolvedValue('co_1')
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

describe('B7 / SAVE-01: saveEstimate optimistic-concurrency guard (now enforced inside the RPC)', () => {
  it('matching expectedUpdatedAt saves normally and returns the new updated_at from the RPC result', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(
      baseInput({ expectedUpdatedAt: SERVER_UPDATED_AT }) as never
    )

    expect(result.error).toBeUndefined()
    expect(result.data?.updated_at).toBe(NEW_UPDATED_AT)
    expect(lastRpcArgs?.p_expected_updated_at).toBe(SERVER_UPDATED_AT)
  })

  it('stale expectedUpdatedAt returns a conflict — the RPC call is made exactly once (no retry/partial write)', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(
      baseInput({ expectedUpdatedAt: 'some-stale-timestamp' }) as never
    )

    expect(result.error).toBeDefined()
    expect('conflict' in result && result.conflict).toBe(true)
    expect(rpcImpl).toHaveBeenCalledTimes(1)
  })

  it('omitting expectedUpdatedAt entirely passes p_expected_updated_at as null (back-compat — skips the RPC-internal check)', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const input = baseInput()
    delete (input as { expectedUpdatedAt?: string }).expectedUpdatedAt

    const result = await saveEstimate(input as never)

    expect(result.error).toBeUndefined()
    expect(lastRpcArgs?.p_expected_updated_at).toBeNull()
  })
})
