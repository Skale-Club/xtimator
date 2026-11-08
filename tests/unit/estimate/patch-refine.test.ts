import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { EstimateSectionOutput } from '@/lib/ai/types'

// Phase 4d: auto-refine as a section patch (ESTIMATOR_PATCH_REFINE, default off), plus the
// always-on fix that a worse regenerate keeps the first draft.

const generateMock = vi.fn()
vi.mock('@/lib/services/generate-estimate', () => ({ generateEstimateForProject: (...a: unknown[]) => generateMock(...a) }))
vi.mock('@/lib/observability/generation-phase', () => ({ reportGeneratePhase: vi.fn() }))
vi.mock('@/lib/estimate/quality/revert', () => ({ revertVagueEstimate: vi.fn() }))

const refineMock = vi.fn()
vi.mock('@/lib/estimate/graph/nodes/refine', () => ({ makeRefineNode: () => (s: unknown) => refineMock(s) }))

type Call = { table: string; op: string; payload?: unknown; filters: Array<[string, string, unknown]> }
const calls: Call[] = []
const assessTotals: number[] = []

// The draft the patch node loads from the database.
const draftRow = {
  summary: '',
  notes: null,
  timeline: null,
  payment_terms: null,
  warranty_terms: null,
  sections: [
    {
      title: 'Main work',
      sort_order: 0,
      items: [
        { description: 'Build deck', quantity: 1, unit: null, unit_price: 2400, price_source: 'ai_estimate', sort_order: 0, basis: null },
        { description: 'Misc', quantity: 1, unit: null, unit_price: 300, price_source: 'ai_estimate', sort_order: 1, basis: null },
      ],
    },
  ],
}

function builder(table: string) {
  const call: Call = { table, op: 'select', filters: [] }
  const b: Record<string, unknown> = {}
  b.select = vi.fn(() => b)
  b.delete = vi.fn(() => {
    call.op = 'delete'
    calls.push(call)
    return b
  })
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
  b.single = vi.fn(async () => {
    if (table === 'estimates') {
      const total = assessTotals.length > 0 ? assessTotals.shift()! : 1234
      return { data: { id: 'e1', total, sections: total > 0 ? [{ items: [{ id: 'i1' }] }] : [] }, error: null }
    }
    if (table === 'companies') return { data: { industry: null }, error: null }
    return { data: null, error: null }
  })
  b.maybeSingle = vi.fn(async () => {
    if (table === 'estimates') {
      // The patch node's draft load carries the section tree; recover-draft reads id + total.
      return { data: call.filters.length > 0 && wantsTree ? draftRow : { id: 'e1', total: 1234 }, error: null }
    }
    if (table === 'projects') return { data: { status: 'estimate_ready', project_type: null }, error: null }
    return { data: null, error: null }
  })
  b.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(resolve)
  const origSelect = b.select as (...a: unknown[]) => unknown
  b.select = vi.fn((cols?: unknown) => {
    wantsTree = typeof cols === 'string' && cols.includes('estimate_sections')
    return origSelect(cols)
  })
  return b
}
let wantsTree = false
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: () => ({ from: (t: string) => builder(t) }) }))

import { buildEstimateGraph } from '@/lib/estimate/graph'
import type { ChannelAdapter } from '@/lib/estimate/graph/types'
import {
  buildPatchInstruction,
  decidePatch,
  evaluatePatch,
  isPatchRefineEnabled,
  mergePatch,
} from '@/lib/estimate/graph/patch-refine'
import { checkVagueAfterAssessEdge } from '@/lib/estimate/graph/nodes/decide'
import { scoreStructure } from '@/lib/estimate/quality/structure-score'
import { PLAYBOOKS } from '@/lib/ai/playbooks'
import type { EstimateStateType } from '@/lib/estimate/graph/state'

const state = (over: Partial<EstimateStateType>): EstimateStateType =>
  ({ companyId: 'c', projectId: 'p', channel: 'web', ...over }) as EstimateStateType

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
  structure: { score: 30, band: 'refine', hints: ['Give "Build deck" a unit.', 'Write a 2-4 sentence summary of the work.'] },
  openQuestions: [],
}

const goodRefined = {
  summary: 'Build a 12x16 pressure-treated deck at the back of the house, including footings and cleanup.',
  sections: [
    {
      title: 'Main work',
      items: [
        { description: 'Build deck', quantity: 192, unit: 'sq ft', unit_price: 12.5, price_source: 'ai_estimate', basis: '12x16 stated' },
        { description: 'Misc', quantity: 1, unit: 'job', unit_price: 300, price_source: 'ai_estimate', basis: 'allowance' },
        { description: 'Debris cleanup and haul-away', quantity: 1, unit: 'job', unit_price: 150, price_source: 'ai_estimate', basis: 'standard' },
        { description: 'Footings', quantity: 6, unit: 'each', unit_price: 90, price_source: 'ai_estimate', basis: '6 posts' },
      ],
    },
  ],
}

const run = (a: ChannelAdapter, opts?: Parameters<typeof buildEstimateGraph>[1]) =>
  buildEstimateGraph(a, opts).invoke({ companyId: 'co', projectId: 'pr', channel: 'web', prompts: ['p'] } as never)

beforeEach(() => {
  generateMock.mockReset()
  refineMock.mockReset()
  calls.length = 0
  assessTotals.length = 0
  wantsTree = false
  vi.unstubAllEnvs()
})
afterEach(() => vi.unstubAllEnvs())

describe('isPatchRefineEnabled', () => {
  it('is OFF by default and for junk values', () => {
    expect(isPatchRefineEnabled({})).toBe(false)
    expect(isPatchRefineEnabled({ ESTIMATOR_PATCH_REFINE: '0' })).toBe(false)
    expect(isPatchRefineEnabled({ ESTIMATOR_PATCH_REFINE: 'nope' })).toBe(false)
  })
  it.each(['1', 'true', 'ON', ' yes '])('accepts %s', (v) => {
    expect(isPatchRefineEnabled({ ESTIMATOR_PATCH_REFINE: v })).toBe(true)
  })
})

describe('buildPatchInstruction', () => {
  it('lists the findings and orders the model to change ONLY what they point at', () => {
    const out = buildPatchInstruction(['Add the missing line: cleanup line.', '  ', 'Give "Misc" a unit.'])
    expect(out).toContain('- Add the missing line: cleanup line.')
    expect(out).toContain('- Give "Misc" a unit.')
    expect(out).toMatch(/Fix ONLY these problems/)
    expect(out).toMatch(/EXACTLY as given/)
  })
})

describe('mergePatch / decidePatch / evaluatePatch', () => {
  const draft = {
    summary: 'A decent summary of the work that is long enough.',
    sections: [
      {
        title: 'Main work',
        purpose: 'The deck',
        items: [
          { description: 'Build deck', quantity: 1, unit_price: 2400, price_source: 'company_history' as const, basis: 'owner' },
          { description: 'Misc', quantity: 1, unit_price: 300, price_source: 'ai_estimate' as const },
        ],
      },
    ],
  }

  it('untouched lines stay the draft object byte for byte; a changed line is rebuilt; a new line is added', () => {
    const refined = {
      summary: 'ignored because the draft summary is fine',
      sections: [
        {
          title: 'Main work',
          items: [
            { ...draft.sections[0].items[0] },
            { description: 'Misc', quantity: 1, unit: 'job', unit_price: 350, price_source: 'ai_estimate' as const },
            { description: 'Cleanup', quantity: 1, unit: 'job', unit_price: 100, price_source: 'ai_estimate' as const },
          ],
        },
      ],
    }
    const { estimate, changedLines, addedLines, removedLines } = mergePatch(draft, refined)
    const items = estimate.sections[0].items
    expect(items[0]).toBe(draft.sections[0].items[0]) // identity: price_source company_history survives
    expect(items[1]).toMatchObject({ description: 'Misc', unit_price: 350, unit: 'job' })
    expect(items[2]).toMatchObject({ description: 'Cleanup', unit_price: 100 })
    expect(estimate.sections[0].purpose).toBe('The deck')
    expect(estimate.summary).toBe(draft.summary)
    expect([changedLines, addedLines, removedLines]).toEqual([1, 1, 0])
  })

  it('takes the refined summary only when the draft has none worth keeping', () => {
    const { estimate } = mergePatch({ ...draft, summary: '' }, { ...draft, summary: 'A real summary of the deck job.' })
    expect(estimate.summary).toBe('A real summary of the deck job.')
  })

  it('accepts only a strictly higher score with a priced total', () => {
    const low = { score: 40, band: 'refine' as const, findings: [] }
    const high = { score: 60, band: 'review' as const, findings: [] }
    expect(decidePatch(low, high, 100)).toMatchObject({ accept: true, reason: 'improved' })
    expect(decidePatch(low, low, 100)).toMatchObject({ accept: false, reason: 'not_improved' })
    expect(decidePatch(high, low, 100)).toMatchObject({ accept: false, reason: 'not_improved' })
    expect(decidePatch(low, high, 0)).toMatchObject({ accept: false, reason: 'zero_total' })
  })

  it('evaluatePatch scores both drafts with the same context', () => {
    const thin = { summary: '', sections: [{ title: 'Main work', items: [
      { description: 'Build deck', quantity: 1, unit_price: 2400, price_source: 'ai_estimate' as const },
      { description: 'Misc', quantity: 1, unit_price: 300, price_source: 'ai_estimate' as const },
    ] }] }
    const ev = evaluatePatch(thin, goodRefined as never, { playbook: PLAYBOOKS.general, language: 'en' })
    expect(ev.after.score).toBeGreaterThan(ev.before.score)
    expect(ev.decision.accept).toBe(true)
    // the same call, scored directly
    expect(ev.before.score).toBe(scoreStructure({ summary: '', sections: thin.sections, playbook: PLAYBOOKS.general, language: 'en' }).score)
  })
})

describe('assess routing (defaults-off equivalence)', () => {
  const refine = { isVague: false, structureBand: 'refine' as const }
  it('without the flag, or without a hook, a refine band regenerates exactly as before', () => {
    expect(checkVagueAfterAssessEdge(state(refine))).toBe('autoRefine')
    expect(checkVagueAfterAssessEdge(state(refine), { patchAvailable: true })).toBe('autoRefine')
    vi.stubEnv('ESTIMATOR_PATCH_REFINE', '1')
    expect(checkVagueAfterAssessEdge(state(refine))).toBe('autoRefine')
  })
  it('flag on + hook: refine band patches; the $0 case and an exhausted cap do not', () => {
    vi.stubEnv('ESTIMATOR_PATCH_REFINE', '1')
    expect(checkVagueAfterAssessEdge(state(refine), { patchAvailable: true })).toBe('patchRefine')
    expect(checkVagueAfterAssessEdge(state({ isVague: true }), { patchAvailable: true })).toBe('autoRefine')
    expect(checkVagueAfterAssessEdge(state({ ...refine, refineAttempts: 1 }), { patchAvailable: true })).toBe('finalize')
    expect(checkVagueAfterAssessEdge(state({ isVague: false, structureBand: 'review' }), { patchAvailable: true })).toBe('finalize')
  })
})

describe('graph: flag OFF (default)', () => {
  it('regenerates with the hints, never touches the patch path, even if a hook is supplied', async () => {
    const persist = vi.fn()
    generateMock
      .mockResolvedValueOnce(lowDraft)
      .mockResolvedValueOnce({ ...lowDraft, estimateId: 'e2', structure: { score: 80, band: 'ok', hints: [] } })
    const { a, finalize } = adapter()
    const out = await run(a, { persistPatch: persist })
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(generateMock.mock.calls[1][2]).toMatchObject({ qualityHints: lowDraft.structure.hints })
    expect(refineMock).not.toHaveBeenCalled()
    expect(persist).not.toHaveBeenCalled()
    expect(finalize).toHaveBeenCalledOnce()
    expect(out.estimateId).toBe('e2')
  })
})

describe('graph: flag ON + persistence hook', () => {
  beforeEach(() => vi.stubEnv('ESTIMATOR_PATCH_REFINE', '1'))

  it('without a hook the flag changes nothing: auto-refine regenerates', async () => {
    generateMock
      .mockResolvedValueOnce(lowDraft)
      .mockResolvedValueOnce({ ...lowDraft, estimateId: 'e2', structure: { score: 80, band: 'ok', hints: [] } })
    const { a } = adapter()
    await run(a)
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(refineMock).not.toHaveBeenCalled()
  })

  it('an improving patch is persisted, the generate service runs ONCE and the persisted estimate is delivered', async () => {
    refineMock.mockResolvedValue({ refined: goodRefined })
    const persist = vi.fn(async (_args: unknown) => ({ estimateId: 'e1-patched' }))
    generateMock.mockResolvedValueOnce(lowDraft)
    const { a, finalize, onError } = adapter()

    const out = await run(a, { persistPatch: persist })

    expect(generateMock).toHaveBeenCalledOnce()
    expect(refineMock).toHaveBeenCalledOnce()
    const refineState = refineMock.mock.calls[0][0] as EstimateStateType
    expect(refineState.instruction).toContain('Give "Build deck" a unit.')
    expect(refineState.existingEstimate?.sections[0].items).toHaveLength(2)
    expect(persist).toHaveBeenCalledOnce()
    const args = persist.mock.calls[0][0] as { companyId: string; baseEstimateId: string; patched: { sections: EstimateSectionOutput[] }; structure: { score: number } }
    expect(args).toMatchObject({ companyId: 'co', baseEstimateId: 'e1' })
    expect(args.patched.sections[0].items).toHaveLength(4)
    expect(onError).not.toHaveBeenCalled()
    expect(finalize).toHaveBeenCalledOnce()
    expect(out.estimateId).toBe('e1-patched')
    expect(out.patchOutcome).toBe('accepted')
    expect(out.structureScore).toBe(args.structure.score)
  })

  it('a patch that does not improve the score keeps the first draft and writes nothing', async () => {
    // The refine returns the draft unchanged: same score, so not accepted.
    refineMock.mockResolvedValue({
      refined: { summary: '', sections: [{ title: 'Main work', items: draftRow.sections[0].items.map((i) => ({ ...i, unit: undefined })) }] },
    })
    const persist = vi.fn()
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    generateMock.mockResolvedValueOnce(lowDraft)
    const { a, finalize } = adapter()

    const out = await run(a, { persistPatch: persist })

    expect(refineMock).toHaveBeenCalledOnce()
    expect(info).toHaveBeenCalledWith(expect.stringContaining('kept the first draft'), { outcome: 'not_improved' })
    info.mockRestore()
    expect(persist).not.toHaveBeenCalled()
    expect(generateMock).toHaveBeenCalledOnce()
    expect(finalize).toHaveBeenCalledOnce()
    expect(out.estimateId).toBe('e1')
    expect(out.patchOutcome).toBe('rejected')
    expect(calls.filter((c) => c.op === 'update' || c.op === 'delete')).toHaveLength(0)
  })

  it.each([
    ['the refine call fails', () => refineMock.mockResolvedValue({ failure: { reason: 'provider_unavailable' } }), vi.fn(async () => ({ estimateId: 'x' }))],
    ['the hook returns null', () => refineMock.mockResolvedValue({ refined: goodRefined }), vi.fn(async () => null)],
    ['the hook throws', () => refineMock.mockResolvedValue({ refined: goodRefined }), vi.fn(async () => { throw new Error('db down') })],
  ])('keeps the first draft when %s', async (_n, arrange, persist) => {
    arrange()
    generateMock.mockResolvedValueOnce(lowDraft)
    const { a, finalize, onError } = adapter()
    const out = await run(a, { persistPatch: persist as never })
    expect(onError).not.toHaveBeenCalled()
    expect(finalize).toHaveBeenCalledOnce()
    expect(out.estimateId).toBe('e1')
    expect(out.patchOutcome).toBe('rejected')
  })

  it('the vague ($0) case still regenerates', async () => {
    assessTotals.push(0)
    generateMock
      .mockResolvedValueOnce({ ...lowDraft, structure: { score: 10, band: 'refine', hints: [] } })
      .mockResolvedValueOnce({ ...lowDraft, estimateId: 'e2', structure: { score: 80, band: 'ok', hints: [] } })
    const { a } = adapter()
    await run(a, { persistPatch: vi.fn() })
    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(refineMock).not.toHaveBeenCalled()
  })
})

describe('regenerate that scores WORSE keeps the first draft (always on)', () => {
  it('routes to recoverDraft: the second version is deleted, the first is current again', async () => {
    generateMock
      .mockResolvedValueOnce({ ...lowDraft, structure: { score: 40, band: 'refine', hints: ['x'] } })
      .mockResolvedValueOnce({ ...lowDraft, estimateId: 'e2', structure: { score: 20, band: 'refine', hints: ['y'] } })
    const { a, finalize } = adapter()

    const out = await run(a)

    expect(generateMock).toHaveBeenCalledTimes(2)
    expect(finalize).toHaveBeenCalledOnce()
    expect(out.estimateId).toBe('e1')
    const del = calls.find((c) => c.table === 'estimates' && c.op === 'delete')!
    expect(del.filters).toEqual(expect.arrayContaining([['eq', 'id', 'e2'], ['eq', 'company_id', 'co']]))
    const restore = calls.find((c) => c.table === 'estimates' && c.op === 'update' && (c.payload as { is_current: boolean }).is_current === true)!
    expect(restore.filters).toEqual(expect.arrayContaining([['eq', 'id', 'e1']]))
  })

  it('a better or equal second pass still replaces the first (today)', async () => {
    for (const second of [60, 40]) {
      generateMock.mockReset()
      calls.length = 0
      generateMock
        .mockResolvedValueOnce({ ...lowDraft, structure: { score: 40, band: 'refine', hints: ['x'] } })
        .mockResolvedValueOnce({ ...lowDraft, estimateId: 'e2', structure: { score: second, band: second >= 50 ? 'review' : 'refine', hints: [] } })
      const { a } = adapter()
      const out = await run(a)
      expect(out.estimateId).toBe('e2')
      expect(calls.some((c) => c.op === 'delete')).toBe(false)
    }
  })

  it('without a known first score the old behavior holds', () => {
    expect(
      checkVagueAfterAssessEdge(state({ isVague: false, previousEstimateId: 'e1', structureScore: 10, structureBand: 'refine', refineAttempts: 1 }))
    ).toBe('finalize')
  })
})
