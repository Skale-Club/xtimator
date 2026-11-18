import { beforeEach, describe, expect, it, vi } from 'vitest'

// SEED-057 D: a poorly structured (but not vague) draft takes ONE targeted
// refine pass and the first draft is kept; 50-69 is delivered; the $0 path is
// untouched; needs-details prefers the estimator's own open questions.

const revertMock = vi.fn()
const from = vi.fn()
const snapshot = vi.fn()
const snapshotQuery = { eq: vi.fn().mockReturnThis(), maybeSingle: snapshot }
vi.mock('@/lib/estimate/quality/revert', () => ({ revertVagueEstimate: (...a: unknown[]) => revertMock(...a) }))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: () => ({ from }) }))
vi.mock('@/lib/observability/generation-phase', () => ({ reportGeneratePhase: vi.fn() }))

import { checkVagueAfterAssessEdge } from '@/lib/estimate/graph/nodes/decide'
import { autoRefineNode } from '@/lib/estimate/graph/nodes/auto-refine'
import type { EstimateStateType } from '@/lib/estimate/graph/state'

const state = (over: Partial<EstimateStateType>): EstimateStateType =>
  ({ companyId: 'c', projectId: 'p', channel: 'web', ...over }) as EstimateStateType

describe('assess routing with the structure band', () => {
  it.each([
    [{ isVague: false, structureBand: 'ok' as const }, 'finalize'],
    [{ isVague: false, structureBand: 'review' as const }, 'finalize'],
    [{ isVague: false, structureBand: undefined }, 'finalize'],
    [{ isVague: false, structureBand: 'refine' as const }, 'autoRefine'],
    [{ isVague: false, structureBand: 'refine' as const, refineAttempts: 1 }, 'finalize'],
    [{ isVague: true, structureBand: 'ok' as const }, 'autoRefine'],
    [{ isVague: true, refineAttempts: 1 }, 'finalize'],
  ])('%j -> %s', (over, expected) => {
    expect(checkVagueAfterAssessEdge(state(over))).toBe(expected)
  })
})

describe('autoRefineNode', () => {
  beforeEach(() => {
    revertMock.mockReset()
    snapshot.mockReset().mockResolvedValue({ data: { status: 'estimate_ready', project_type: null }, error: null })
    snapshotQuery.eq.mockClear()
    from.mockReset().mockReturnValue({ select: () => snapshotQuery })
  })

  it('a poorly structured draft is KEPT and the hint lists the specific findings', async () => {
    const out = await autoRefineNode(
      state({
        isVague: false,
        estimateId: 'e1',
        structureBand: 'refine',
        structureHints: ['Add the missing line: cleanup line.', 'Give "Paint walls" a unit from: each, hour.'],
        prompts: ['original prompt'],
      }),
    )
    expect(revertMock).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('projects')
    expect(snapshotQuery.eq.mock.calls).toEqual([['id', 'p'], ['company_id', 'c']])
    expect(out.previousEstimateId).toBe('e1')
    expect(out.previousProjectStatus).toBe('estimate_ready')
    expect(out.previousProjectType).toBeNull()
    expect(out.refineAttempts).toBe(1)
    expect(out.estimateId).toBeUndefined()
    expect(out.structureBand).toBeUndefined()
    expect(out.structureHints).toBeUndefined()
    // Trusted guidance, NOT appended to the untrusted prompts.
    expect(out.prompts).toBeUndefined()
    const hint = (out.qualityHints ?? []).join(' ')
    expect(hint).toContain('cleanup line')
    expect(hint).toContain('Give "Paint walls" a unit')
    expect(hint).not.toMatch(/more detailed/i)
  })

  it('without findings it falls back to the generic hint', async () => {
    const out = await autoRefineNode(state({ isVague: false, structureBand: 'refine', structureHints: [] }))
    expect(out.qualityHints![0]).toMatch(/too vague or incomplete/)
  })

  it('does not retry or discard the current draft when its project snapshot fails', async () => {
    snapshot.mockResolvedValueOnce({ data: null, error: { message: 'project snapshot failed' } })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const out = await autoRefineNode(state({ isVague: false, estimateId: 'e1', structureBand: 'refine' }))

      expect(out).toEqual({ failure: { reason: 'generation_failed' } })
      expect(revertMock).not.toHaveBeenCalled()
    } finally {
      log.mockRestore()
    }
  })

  it('the $0 path still reverts the estimate and uses the generic hint', async () => {
    revertMock.mockResolvedValue(undefined)
    const out = await autoRefineNode(state({ isVague: true, estimateId: 'e1' }))
    expect(revertMock).toHaveBeenCalledOnce()
    expect(out.qualityHints![0]).toMatch(/too vague or incomplete/)
    expect(out.structureBand).toBeUndefined()
  })
})
