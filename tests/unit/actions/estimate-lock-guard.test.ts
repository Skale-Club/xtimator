import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * TRUST-02/03 (Phase 164 Plan 02) — saveEstimate's freeze-on-send/sign guard
 * + estimate_updated activity emission, and the presentation-settings
 * lock-exempt carve-out (savePresentationSettings).
 *
 * Phase 165 Plan 01 update: the lock guard (sent_at OR client_response OR an
 * existing estimate_signatures row) now runs INSIDE the save_estimate_atomic
 * RPC's transaction rather than via a separate pre-UPDATE SELECT + signature
 * lookup in this action. The RPC raises a distinct SQLSTATE ('P0001') for a
 * locked estimate, which saveEstimate maps to { error: 'estimate_locked' }.
 * This file now drives the lock scenarios by configuring the mocked rpc()'s
 * response instead of a pre-UPDATE SELECT payload.
 *
 * savePresentationSettings is UNTOUCHED by Phase 165 (it doesn't call the
 * RPC — lock-exempt by design, see lib/actions/estimate.ts) — its tests
 * below keep mocking `.from('estimates').update(...)` directly.
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
let estimatesUpdated = false
let activityInsertPayload: Record<string, unknown> | null = null

// Configurable per-test: what save_estimate_atomic's mocked rpc() call returns.
let rpcError: { code: string; message: string } | null = null
let rpcData: Record<string, unknown> | null = {
  updated_at: '2026-07-17T12:00:00.000Z',
  project_total: 1000,
  project_id: 'proj_1',
  previous_total: 1000,
  id_map: {},
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: { getClaims: vi.fn().mockResolvedValue({ data: { claims: { sub: 'u_1' } } }) },
    from: (t: string) => fromImpl(t),
    rpc: (...args: unknown[]) => rpcImpl(...args),
  }),
}))

function configureSupabase() {
  estimatesUpdated = false
  activityInsertPayload = null

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
              data: { id: 'co_1', currency_code: 'usd', default_tax_rate: 0 },
              error: null,
            }),
          }),
        }),
      }
    }

    // savePresentationSettings-only path (lock-exempt; untouched by 165-01).
    if (table === 'estimates') {
      return {
        update: vi.fn().mockImplementation(() => {
          estimatesUpdated = true
          return {
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue({
                data: [{ id: 'est_1', updated_at: '2026-07-17T12:00:00.000Z' }],
                error: null,
              }),
            }),
          }
        }),
      }
    }

    if (table === 'estimate_activity') {
      return {
        insert: vi.fn().mockImplementation((payload: Record<string, unknown>) => {
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
    project_total: 1000,
    project_id: 'proj_1',
    previous_total: 1000,
    id_map: {},
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
    tax_rate: 0,
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

describe('TRUST-02: saveEstimate freeze-on-send/sign guard (now enforced inside the RPC)', () => {
  it('rejects a save when the RPC raises the locked SQLSTATE (P0001) — zero direct writes', async () => {
    rpcError = { code: 'P0001', message: 'estimate_locked' }
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(baseInput() as never)

    expect(result.error).toBe('estimate_locked')
    expect(rpcImpl).toHaveBeenCalledTimes(1)
    // saveEstimate itself never falls back to a direct table write on lock.
    expect(estimatesUpdated).toBe(false)
  })

  it('a draft (RPC succeeds) saves normally and emits an estimate_updated activity row', async () => {
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(baseInput() as never)

    expect(result.error).toBeUndefined()
    expect(rpcImpl).toHaveBeenCalledTimes(1)

    // Fire-and-forget: flush microtasks so the un-awaited activity insert lands.
    await new Promise((r) => setTimeout(r, 0))
    expect(activityInsertPayload).not.toBeNull()
    expect(activityInsertPayload!.event_type).toBe('estimate_updated')
    expect(activityInsertPayload!.estimate_id).toBe('est_1')
    expect(activityInsertPayload!.project_id).toBe('proj_1')
  })

  it('a not_current RPC error (P0003) maps to { error: "estimate_not_current" }', async () => {
    rpcError = { code: 'P0003', message: 'estimate_not_current' }
    const { saveEstimate } = await import('@/lib/actions/estimate')

    const result = await saveEstimate(baseInput() as never)

    expect(result.error).toBe('estimate_not_current')
  })
})

describe('TRUST-02: savePresentationSettings is lock-exempt (untouched by 165-01 — no RPC call)', () => {
  it('updates presentation_settings directly via .from(estimates).update, never calling the RPC', async () => {
    const { savePresentationSettings } = await import('@/lib/actions/estimate')

    const result = await savePresentationSettings('est_1', { sections: { summary: false } })

    expect(result.error).toBeUndefined()
    expect(estimatesUpdated).toBe(true)
    expect(rpcImpl).not.toHaveBeenCalled()
  })

  it('updates presentation_settings even in a scenario where saveEstimate would be locked (proves the two paths are independent)', async () => {
    rpcError = { code: 'P0001', message: 'estimate_locked' }
    const { savePresentationSettings } = await import('@/lib/actions/estimate')

    const result = await savePresentationSettings('est_1', { discount: { enabled: false } })

    expect(result.error).toBeUndefined()
    expect(estimatesUpdated).toBe(true)
    expect(rpcImpl).not.toHaveBeenCalled()
  })
})
