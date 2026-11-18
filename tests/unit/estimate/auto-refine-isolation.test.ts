import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

// Loads the real graph tree at runtime via dynamic import; under vitest's reused
// forked worker the import can exceed the 5s default (import latency under
// contention, not a mock leak). Per-file timeout keeps it deterministic.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })
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

// Build a chainable Supabase mock that records update+eq chains
function makeSupabaseMock() {
  const projectFilters = vi.fn().mockReturnThis()
  const updateProject = vi.fn(() => ({
    eq: projectFilters,
    then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
  }))
  const companyFilters = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null }) })
  const fromFn = vi.fn().mockImplementation((table: string) => {
    // Finalize reads recordings, photos and company industry for needs-details.
    if (table === 'recordings' || table === 'photos') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [] }),
          }),
        }),
      }
    }
    if (table === 'companies') {
      return { select: () => ({ eq: companyFilters }) }
    }
    if (table === 'projects') return { update: updateProject }
    throw new Error(`Unexpected table ${table}`)
  })

  return { client: { from: fromFn }, updateProject, projectFilters, companyFilters }
}

beforeEach(() => {
  vi.clearAllMocks()
  requireServiceClientMock.mockReturnValue({})
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
      createdByUserId: undefined,
      estimateLanguage: undefined,
      isVague: true,
      failure: undefined,
      refineAttempts: undefined,
      needsDetails: undefined,
    }

    const result = await autoRefineNode(state as never)

    // refineAttempts: undefined → 1
    expect(result.refineAttempts).toBe(1)
    // estimateId and isVague cleared so next generate cycle starts clean
    expect(result.estimateId).toBeUndefined()
    expect(result.isVague).toBeUndefined()
    // The retry note is trusted guidance (qualityHints), not an extra untrusted prompt
    expect(result.prompts).toBeUndefined()
    expect(result.qualityHints![0]).toMatch(/too vague or incomplete/i)
    expect(result.qualityHints![0]).not.toMatch(/previous/i)
    expect(revertVagueEstimateMock).toHaveBeenCalledExactlyOnceWith(
      requireServiceClientMock.mock.results[0].value, 'project-1', 'est-1', 'company-1',
    )
  })

  /**
   * Test B — SMART-03/04: default adapter finalize handles the vague-after-refine
   * path.
   */
  it('SMART-03/04: finalizing calls the atomic discard with awaiting_details and returns needsDetails', async () => {
    const { makeDefaultAdapter } = await import('@/lib/estimate/adapters/default')

    const supabaseMock = makeSupabaseMock()
    const adapter = makeDefaultAdapter({
      companyId: 'company-SECRET',
      supabase: supabaseMock.client as never,
    })

    const state = {
      companyId: 'company-SECRET',
      projectId: 'project-1',
      channel: 'web' as const,
      prompts: undefined,
      estimateId: 'est-1',
      createdByUserId: undefined,
      estimateLanguage: undefined,
      isVague: true,
      failure: undefined,
      refineAttempts: 1,
      needsDetails: undefined,
      openQuestions: ['Which walls need painting?'],
    }

    const result = await adapter.finalize(state as never)

    // SMART-04: returns needsDetails: true
    expect(result.needsDetails).toBe(true)

    expect(revertVagueEstimateMock).toHaveBeenCalledExactlyOnceWith(
      supabaseMock.client, 'project-1', 'est-1', 'company-SECRET', 'awaiting_details',
    )
    expect(supabaseMock.updateProject).toHaveBeenCalledExactlyOnceWith({
      needs_details: expect.objectContaining({ questions: ['Which walls need painting?'] }),
    })
  })

  /**
   * AUTO_REFINE_MAX_ATTEMPTS=0: no auto-refine ever ran (refineAttempts 0/undefined),
   * yet a final vague outcome must still revert the $0 estimate and ask for details.
   */
  it.each([0, undefined])(
    'finalize treats a final-vague outcome as needsDetails even when refineAttempts is %s',
    async (refineAttempts) => {
      const { makeDefaultAdapter } = await import('@/lib/estimate/adapters/default')
      const adapter = makeDefaultAdapter({
        companyId: 'company-1',
        supabase: makeSupabaseMock().client as never,
      })
      const result = await adapter.finalize({
        companyId: 'company-1',
        projectId: 'project-1',
        channel: 'web' as const,
        estimateId: 'est-1',
        isVague: true,
        refineAttempts,
        openQuestions: ['Which walls need painting?'],
      } as never)
      expect(result.needsDetails).toBe(true)
      expect(result.estimateId).toBeUndefined()
    },
  )

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

    const supabaseMock = makeSupabaseMock()

    const CLOSURE_COMPANY = 'company-CLOSURE-VALUE'
    const adapter = makeDefaultAdapter({
      companyId: CLOSURE_COMPANY,
      supabase: supabaseMock.client as never,
    })

    const state = {
      companyId: 'company-DIFFERENT-FROM-CLOSURE',  // state.companyId is different
      projectId: 'project-1',
      channel: 'web' as const,
      prompts: undefined,
      estimateId: 'est-1',
      createdByUserId: undefined,
      estimateLanguage: undefined,
      isVague: true,
      failure: undefined,
      refineAttempts: 1,
      needsDetails: undefined,
      openQuestions: ['Which walls need painting?'],
    }

    const result = await adapter.finalize(state as never)

    // Must return needsDetails: true (vague-after-refine path)
    expect(result.needsDetails).toBe(true)

    expect(revertVagueEstimateMock).toHaveBeenCalledExactlyOnceWith(
      supabaseMock.client, state.projectId, state.estimateId, CLOSURE_COMPANY, 'awaiting_details',
    )
    expect(supabaseMock.companyFilters).toHaveBeenCalledExactlyOnceWith('id', CLOSURE_COMPANY)
    expect(supabaseMock.projectFilters.mock.calls).toEqual([
      ['id', state.projectId], ['company_id', CLOSURE_COMPANY],
    ])
  })
})
