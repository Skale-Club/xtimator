import { beforeEach, describe, expect, it, vi } from 'vitest'

// SEED-057 D: a failing TARGETED refine pass must deliver the first draft, not fail the job
// and not leave the project without a current estimate.

const generateMock = vi.fn()
const rpc = vi.fn()
const revert = vi.fn()
vi.mock('@/lib/services/generate-estimate', () => ({ generateEstimateForProject: (...a: unknown[]) => generateMock(...a) }))
vi.mock('@/lib/observability/generation-phase', () => ({ reportGeneratePhase: vi.fn() }))
vi.mock('@/lib/estimate/quality/revert', () => ({ revertVagueEstimate: (...a: unknown[]) => revert(...a) }))

// What the assess node reads back for the estimate it is judging, one entry per assess (default: priced).
const assessTotals: number[] = []
const assessFilters: Array<Array<[string, unknown]>> = []
let assessResponse: { data: null; error: { message: string } | null } | undefined
let projectStatus = 'estimate_ready'
let projectType: string | undefined

function builder(table: string) {
  const filters: Array<[string, unknown]> = []
  const query = {
    select() { return this },
    eq(column: string, value: unknown) {
      filters.push([column, value])
      return this
    },
    single: async () => {
      if (table !== 'estimates') throw new Error(`Unexpected table ${table}`)
      assessFilters.push(filters)
      if (assessResponse) return assessResponse
      const total = assessTotals.shift() ?? 1234
      return { data: { total, sections: total > 0 ? [{ items: [{ id: 'i1' }] }] : [] }, error: null }
    },
    maybeSingle: async () => {
      if (table === 'projects') return { data: { status: projectStatus, project_type: projectType }, error: null }
      throw new Error(`Unexpected table ${table}`)
    },
  }
  return query
}
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: () => ({ from: builder, rpc }) }))

import { buildEstimateGraph } from '@/lib/estimate/graph'
import type { ChannelAdapter } from '@/lib/estimate/graph/types'

function adapter() {
  const finalize = vi.fn(async () => ({}))
  const onError = vi.fn(async () => {
    throw new Error('onError reached')
  })
  const a: ChannelAdapter = { channel: 'web', ingest: async () => ({}), finalize, onError }
  return { a, finalize, onError }
}

const lowDraft = {
  estimateId: 'e1',
  version: 1,
  language: 'en',
  structure: { score: 30, band: 'refine', hints: ['Add a cleanup line.'] },
  openQuestions: [],
}
const run = (a: ChannelAdapter) =>
  buildEstimateGraph(a).invoke({ companyId: 'co', projectId: 'pr', channel: 'web', prompts: ['p'] } as never)

describe('failed targeted refine pass', () => {
  beforeEach(() => {
    generateMock.mockReset()
    rpc.mockReset().mockResolvedValue({ data: { estimate_id: 'e1', version: 1 }, error: null })
    revert.mockReset().mockResolvedValue(undefined)
    assessTotals.length = 0
    assessFilters.length = 0
    assessResponse = undefined
    projectStatus = 'estimate_ready'
    projectType = undefined
  })

  it.each([
    ['throws before inserting anything', new Error('provider down')],
    ['throws after inserting a newer version', new Error('Failed to save estimate items')],
  ])('delivers the first draft when the second pass %s', async (_name, error) => {
    generateMock.mockResolvedValueOnce(lowDraft).mockRejectedValueOnce(error)
    const { a, finalize, onError } = adapter()

    const out = await run(a)

    expect(onError).not.toHaveBeenCalled()
    expect(finalize).toHaveBeenCalledOnce()
    expect(out.estimateId).toBe('e1')
    expect(out.isVague).toBe(false)

    expect(rpc).toHaveBeenCalledExactlyOnceWith('activate_estimate_version', expect.objectContaining({
      p_company_id: 'co',
      p_project_id: 'pr',
      p_estimate_id: 'e1',
      p_previous_estimate_id: 'e1',
      p_discard_estimate_id: null,
      p_project_update: { status: 'estimate_ready' },
      p_restore: true,
    }))
  })

  it('a targeted pass that comes back VAGUE falls back to draft one, deleting the vague draft', async () => {
    projectStatus = 'awaiting_details'
    projectType = 'painting'
    generateMock.mockResolvedValueOnce(lowDraft).mockResolvedValueOnce({ ...lowDraft, estimateId: 'e2', structure: { score: 0, band: 'refine', hints: [] } })
    assessTotals.push(1234, 0) // first pass priced, second pass $0
    const { a, finalize, onError } = adapter()

    const out = await run(a)

    expect(onError).not.toHaveBeenCalled()
    expect(finalize).toHaveBeenCalledOnce()
    expect(out.estimateId).toBe('e1')
    expect(out.isVague).toBe(false)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('activate_estimate_version', expect.objectContaining({
      p_company_id: 'co',
      p_project_id: 'pr',
      p_estimate_id: 'e1',
      p_previous_estimate_id: 'e2',
      p_discard_estimate_id: 'e2',
      p_project_update: { status: 'awaiting_details', project_type: 'painting' },
      p_restore: true,
    }))
  })

  it('a first-pass VAGUE estimate still takes the normal retry/needs-details path (no draft to recover)', async () => {
    generateMock.mockResolvedValue({ ...lowDraft, structure: { score: 80, band: 'ok', hints: [] } })
    assessTotals.push(0, 0)
    const { a, finalize } = adapter()
    const out = await run(a)
    expect(finalize).toHaveBeenCalledOnce()
    expect(out.isVague).toBe(true)
    expect(rpc).not.toHaveBeenCalled()
  })

  it('routes a failed restore to onError', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'restore rejected' } })
    generateMock.mockResolvedValueOnce(lowDraft).mockRejectedValueOnce(new Error('provider down'))
    const { a, finalize, onError } = adapter()
    await expect(run(a)).rejects.toThrow('onError reached')
    expect(rpc).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
    expect(finalize).not.toHaveBeenCalled()
  })

  it('a first-pass failure (no draft to fall back to) still goes to onError', async () => {
    generateMock.mockRejectedValueOnce(new Error('provider down'))
    const { a, finalize, onError } = adapter()
    await expect(run(a)).rejects.toThrow('onError reached')
    expect(onError).toHaveBeenCalledOnce()
    expect(finalize).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
  })

  it.each([
    { scenario: 'returns an error', error: { message: 'PostgREST unavailable' } },
    { scenario: 'cannot find the estimate', error: null },
  ])('routes a scoped assessment that $scenario to onError', async ({ error }) => {
    assessResponse = { data: null, error }
    generateMock.mockResolvedValueOnce(lowDraft)
    const { a, finalize, onError } = adapter()

    await expect(run(a)).rejects.toThrow('onError reached')

    expect(assessFilters).toEqual([expect.arrayContaining([
      ['id', 'e1'], ['company_id', 'co'], ['project_id', 'pr'],
    ])])
    expect(generateMock).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
    expect(revert).not.toHaveBeenCalled()
    expect(rpc).not.toHaveBeenCalled()
    expect(finalize).not.toHaveBeenCalled()
  })

  it('routes a failed vague-estimate discard to onError before retrying generation', async () => {
    assessTotals.push(0)
    generateMock.mockResolvedValueOnce(lowDraft)
    revert.mockRejectedValueOnce(new Error('discard rejected'))
    const { a, finalize, onError } = adapter()

    await expect(run(a)).rejects.toThrow('onError reached')

    expect(revert).toHaveBeenCalledOnce()
    expect(generateMock).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledOnce()
    expect(finalize).not.toHaveBeenCalled()
  })
})
