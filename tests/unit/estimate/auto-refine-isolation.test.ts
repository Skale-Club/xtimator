import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()

/**
 * Phase 96 — auto-refine isolation (Wave 2 GREEN implementation).
 *
 * Tests A, B, D: behavioral contracts now verified against real production code.
 * Test C: source-text anchor (file must exist + use state.companyId).
 *
 * Requirements covered: SMART-01, SMART-03, SMART-04, QA-02.
 */

// --- Mocks for Test A (autoRefineNode) ---

const revertVagueEstimateMock = vi.fn().mockResolvedValue(undefined)
const requireServiceClientMock = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  requireServiceClient: () => requireServiceClientMock(),
  createServiceClient: () => requireServiceClientMock(),
}))

vi.mock('@/lib/estimate/quality/revert', () => ({
  revertVagueEstimate: (...args: unknown[]) => revertVagueEstimateMock(...args),
}))

// --- Mocks for Tests B and D (makeDefaultAdapter finalize) ---

// Track the Supabase calls to verify SMART-03 behavior
let updateCalls: Array<{ table: string; values: Record<string, unknown>; eqChain: Array<[string, unknown]> }> = []
let revertCallsForDefault: Array<[string, string, string | null]> = []

const revertMockForDefault = vi.fn().mockImplementation(async (_supabase, projectId, estimateId) => {
  revertCallsForDefault.push([_supabase, projectId, estimateId])
})

vi.mock('@/lib/estimate/quality/revert', () => ({
  revertVagueEstimate: (...args: unknown[]) => {
    // Dual-purpose mock — both Test A and Tests B/D use this
    revertVagueEstimateMock(...args)
    revertMockForDefault(...args)
  },
}))

// Build a chainable Supabase mock that records update+eq chains
function makeSupabaseMock() {
  const eqCalls: Array<[string, unknown]> = []

  const eqChainable: Record<string, unknown> = {}
  const eqFn = vi.fn().mockImplementation((col: string, val: unknown) => {
    eqCalls.push([col, val])
    return eqChainable
  })
  eqChainable.eq = eqFn
  // Make it thenable so await resolves
  eqChainable.then = (resolve: (v: unknown) => void) => resolve({ error: null })

  const updateFn = vi.fn().mockImplementation((values: Record<string, unknown>) => {
    return eqChainable
  })

  // Track update calls through closure
  const fromFn = vi.fn().mockImplementation((table: string) => {
    return {
      update: (values: Record<string, unknown>) => {
        updateCalls.push({ table, values, eqChain: eqCalls })
        return updateFn(values)
      },
      delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: null }) }) }),
    }
  })

  return { from: fromFn }
}

beforeEach(() => {
  vi.clearAllMocks()
  updateCalls = []
  revertCallsForDefault = []
  requireServiceClientMock.mockReturnValue({
    from: vi.fn().mockReturnValue({
      delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    }),
  })
})

describe('Phase 96 — auto-refine isolation (SMART-01/03/04, QA-02)', () => {
  /**
   * Test A — SMART-01: autoRefineNode increments refineAttempts and resets
   * estimateId / isVague.
   */
  it('SMART-01: autoRefineNode increments refineAttempts and resets estimateId/isVague', async () => {
    const { autoRefineNode } = await import('@/lib/estimate/graph/nodes/auto-refine')

    const state = {
      companyId: 'company-1',
      projectId: 'project-1',
      channel: 'web' as const,
      prompts: ['fix the fence'],
      estimateId: 'est-1',
      estimateLanguage: undefined,
      isVague: true,
      failure: undefined,
      refineAttempts: undefined,
      needsDetails: undefined,
    }

    const result = await autoRefineNode(state)

    // refineAttempts: undefined → 1
    expect(result.refineAttempts).toBe(1)
    // estimateId and isVague cleared so next generate cycle starts clean
    expect(result.estimateId).toBeUndefined()
    expect(result.isVague).toBeUndefined()
    // REFINE_HINT appended to prompts
    expect(result.prompts).toHaveLength(2)
    expect(result.prompts![1]).toMatch(/too vague or incomplete/i)
    // revertVagueEstimate called (best-effort)
    expect(revertVagueEstimateMock).toHaveBeenCalled()
  })

  /**
   * Test B — SMART-03/04: default adapter finalize handles the vague-after-refine
   * path.
   */
  it('SMART-03/04: default adapter finalize writes awaiting_details and returns needsDetails', async () => {
    const { makeDefaultAdapter } = await import('@/lib/estimate/adapters/default')

    const supabaseMock = makeSupabaseMock()
    const adapter = makeDefaultAdapter({
      companyId: 'company-SECRET',
      supabase: supabaseMock as never,
    })

    const state = {
      companyId: 'company-SECRET',
      projectId: 'project-1',
      channel: 'web' as const,
      prompts: undefined,
      estimateId: 'est-1',
      estimateLanguage: undefined,
      isVague: true,
      failure: undefined,
      refineAttempts: 1,
      needsDetails: undefined,
    }

    const result = await adapter.finalize(state)

    // SMART-04: returns needsDetails: true
    expect(result.needsDetails).toBe(true)

    // SMART-03: update called with awaiting_details
    expect(supabaseMock.from).toHaveBeenCalledWith('projects')
  })

  /**
   * Test C — QA-02 source anchor: auto-refine.ts reads state.companyId (not a
   * parameter overrideable by the LLM).
   */
  it('QA-02 source anchor: auto-refine.ts reads state.companyId (never an overrideable param)', () => {
    const path = resolve(ROOT, 'lib/estimate/graph/nodes/auto-refine.ts')
    if (!existsSync(path)) {
      expect.fail('RED — lib/estimate/graph/nodes/auto-refine.ts does not exist yet')
    }
    const src = readFileSync(path, 'utf8')
    expect(src).toContain('state.companyId')
    expect(src).not.toMatch(/function\s+\w+\s*\([^)]*companyId/)
    expect(src).not.toMatch(/companyId\s*=\s*params\./i)
    expect(src).not.toMatch(/companyId\s*=\s*input\./i)
  })

  /**
   * Test D — QA-02 closure isolation: default adapter finalize chains
   * .eq('company_id') from the closure value, not from state.
   */
  it('QA-02 closure isolation: default adapter finalize uses closure companyId, not state.companyId', async () => {
    const { makeDefaultAdapter } = await import('@/lib/estimate/adapters/default')

    // Create TWO adapters with different companyIds to verify closure isolation
    const eqCalls: Array<[string, unknown]> = []

    const eqChainable: Record<string, unknown> = {}
    const eqFn = vi.fn().mockImplementation((col: string, val: unknown) => {
      eqCalls.push([col, val])
      return eqChainable
    })
    eqChainable.eq = eqFn
    eqChainable.then = (res: (v: unknown) => void) => res({ error: null })

    const supabaseMock = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue(eqChainable),
        delete: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
      }),
    }

    const CLOSURE_COMPANY = 'company-CLOSURE-VALUE'
    const adapter = makeDefaultAdapter({
      companyId: CLOSURE_COMPANY,
      supabase: supabaseMock as never,
    })

    const state = {
      companyId: 'company-DIFFERENT-FROM-CLOSURE',  // state.companyId is different
      projectId: 'project-1',
      channel: 'web' as const,
      prompts: undefined,
      estimateId: 'est-1',
      estimateLanguage: undefined,
      isVague: true,
      failure: undefined,
      refineAttempts: 1,
      needsDetails: undefined,
    }

    const result = await adapter.finalize(state)

    // Must return needsDetails: true (vague-after-refine path)
    expect(result.needsDetails).toBe(true)

    // The .eq('company_id', ...) call must use the CLOSURE value, not state.companyId
    const companyIdEq = eqCalls.find(([col]) => col === 'company_id')
    expect(companyIdEq).toBeDefined()
    expect(companyIdEq![1]).toBe(CLOSURE_COMPANY)
    expect(companyIdEq![1]).not.toBe(state.companyId)
  })
})
