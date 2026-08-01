import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Security-hardening S2 (audit finding b1 — sign vs decline race).
 *
 * respondToEstimate's pre-check (`if (est.client_response) return {...}`) can
 * go stale between its own SELECT and its UPDATE — a concurrent sign request
 * (app/api/estimates/[id]/sign/route.ts's sign_estimate_atomic RPC) can flip
 * client_response in that exact window. The fix makes the UPDATE itself the
 * check-and-set via `.is('client_response', null)`, detecting a lost race
 * through the row count `.select('id')` returns: zero rows means someone else
 * responded first, and respondToEstimate must return the same
 * already-responded error instead of proceeding to the
 * project/activity/notify side effects.
 *
 * Mocking style mirrors tests/unit/actions/estimate-photo-lock-guard.test.ts:
 * a single configurable fromImpl dispatched by table name.
 */

vi.mock('@/lib/demo/guard', () => ({
  assertWritable: vi.fn().mockResolvedValue(null),
  assertCompanyWritable: vi.fn().mockResolvedValue(null),
}))

const mockNotify = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/estimate/notify-response', () => ({
  notifyEstimateResponse: (...args: unknown[]) => mockNotify(...args),
}))

const fromImpl = vi.fn()
vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => ({ from: (t: string) => fromImpl(t) }),
}))

const ESTIMATE_ROW = {
  id: 'est_1',
  project_id: 'proj_1',
  company_id: 'co_1',
  client_response: null,
  estimate_number: 'EST-100',
  client_name: 'Alice',
}

let conditionalUpdateResult: { data: unknown; error: unknown }
let projectUpdateCalled = false
let activityInsertCalled = false

function configureSupabase() {
  projectUpdateCalled = false
  activityInsertCalled = false

  fromImpl.mockImplementation((table: string) => {
    if (table === 'estimates') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: ESTIMATE_ROW, error: null }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              select: vi.fn().mockResolvedValue(conditionalUpdateResult),
            }),
          }),
        }),
      }
    }
    if (table === 'projects') {
      return {
        update: vi.fn().mockImplementation(() => {
          projectUpdateCalled = true
          return { eq: vi.fn().mockResolvedValue({ error: null }) }
        }),
      }
    }
    if (table === 'estimate_activity') {
      return {
        insert: vi.fn().mockImplementation(() => {
          activityInsertCalled = true
          return Promise.resolve({ error: null })
        }),
      }
    }
    throw new Error(`Unexpected table: ${table}`)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  conditionalUpdateResult = { data: [{ id: 'est_1' }], error: null }
  configureSupabase()
})

describe('respondToEstimate — conditional-atomic update closes the sign-vs-decline race', () => {
  it('the conditional update claims the row (one row returned) -> proceeds to project/activity/notify + success', async () => {
    const { respondToEstimate } = await import('@/app/estimate/[token]/actions')

    const result = await respondToEstimate('tok_1', 'declined')

    expect(result).toEqual({ success: true })
    expect(projectUpdateCalled).toBe(true)
    expect(activityInsertCalled).toBe(true)
    expect(mockNotify).toHaveBeenCalledOnce()
    expect(mockNotify).toHaveBeenCalledWith(ESTIMATE_ROW, 'declined')
  })

  it('the conditional update claims ZERO rows (a concurrent sign already accepted it) -> already-responded error, no side effects', async () => {
    conditionalUpdateResult = { data: [], error: null }
    const { respondToEstimate } = await import('@/app/estimate/[token]/actions')

    const result = await respondToEstimate('tok_1', 'declined')

    expect(result).toEqual({
      success: false,
      error: 'This estimate has already been responded to',
    })
    expect(projectUpdateCalled).toBe(false)
    expect(activityInsertCalled).toBe(false)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('the conditional update returns null data (defensive) -> treated the same as zero rows', async () => {
    conditionalUpdateResult = { data: null, error: null }
    const { respondToEstimate } = await import('@/app/estimate/[token]/actions')

    const result = await respondToEstimate('tok_1', 'accepted')

    expect(result.success).toBe(false)
    expect(projectUpdateCalled).toBe(false)
    expect(mockNotify).not.toHaveBeenCalled()
  })

  it('a supabase error on the conditional update -> already-responded error, no side effects (fail closed)', async () => {
    conditionalUpdateResult = { data: null, error: { message: 'db error' } }
    const { respondToEstimate } = await import('@/app/estimate/[token]/actions')

    const result = await respondToEstimate('tok_1', 'accepted')

    expect(result.success).toBe(false)
    expect(projectUpdateCalled).toBe(false)
    expect(mockNotify).not.toHaveBeenCalled()
  })
})
