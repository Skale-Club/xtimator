import { beforeEach, describe, expect, it, vi } from 'vitest'

// SEED-057 D: a failing TARGETED refine pass must deliver the first draft, not fail the job
// and not leave the project without a current estimate.

const generateMock = vi.fn()
vi.mock('@/lib/services/generate-estimate', () => ({ generateEstimateForProject: (...a: unknown[]) => generateMock(...a) }))
vi.mock('@/lib/observability/generation-phase', () => ({ reportGeneratePhase: vi.fn() }))
vi.mock('@/lib/estimate/quality/revert', () => ({ revertVagueEstimate: vi.fn() }))

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, string, unknown]> }
const calls: Call[] = []

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] }
  const b: Record<string, unknown> = {}
  const chain = () => b
  b.select = vi.fn(chain)
  b.update = vi.fn((payload: unknown) => {
    call.op = 'update'
    call.payload = payload
    calls.push(call)
    return b
  })
  for (const f of ['eq', 'neq']) {
    b[f] = vi.fn((col: string, val: unknown) => {
      call.filters.push([f, col, val])
      return b
    })
  }
  const row =
    table === 'estimates'
      ? { id: 'e1', total: 1234, sections: [{ items: [{ id: 'i1' }] }] }
      : null
  b.single = vi.fn(async () => ({ data: row, error: null }))
  b.maybeSingle = vi.fn(async () => ({ data: row, error: null }))
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve)
  return b
}
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: () => ({ from: (t: string) => builder(t) }) }))

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
    calls.length = 0
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

    const updates = calls.filter((c) => c.table === 'estimates' && c.op === 'update')
    // Every OTHER version of the project stops being current (a half-written newer one included)...
    const demote = updates.find((u) => (u.payload as { is_current: boolean }).is_current === false)!
    expect(demote.filters).toEqual(expect.arrayContaining([['eq', 'project_id', 'pr'], ['neq', 'id', 'e1']]))
    // ...and the first draft is current again, scoped to the trusted company.
    const restore = updates.find((u) => (u.payload as { is_current: boolean }).is_current === true)!
    expect(restore.filters).toEqual(expect.arrayContaining([['eq', 'id', 'e1'], ['eq', 'company_id', 'co']]))
    // The project is back to estimate_ready with the draft's total.
    const project = calls.find((c) => c.table === 'projects' && c.op === 'update')!
    expect(project.payload).toEqual({ status: 'estimate_ready', total: 1234 })
  })

  it('a first-pass failure (no draft to fall back to) still goes to onError', async () => {
    generateMock.mockRejectedValueOnce(new Error('provider down'))
    const { a, finalize, onError } = adapter()
    await expect(run(a)).rejects.toThrow('onError reached')
    expect(onError).toHaveBeenCalledOnce()
    expect(finalize).not.toHaveBeenCalled()
    expect(calls.filter((c) => c.op === 'update')).toHaveLength(0)
  })
})
