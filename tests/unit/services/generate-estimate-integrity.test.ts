import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EstimateOutput } from '@/lib/ai/types'
import { makeServiceMock } from './generate-harness'

// Service-level guarantees: server-only price labels, atomic current-version swap,
// research metering attempt id, and phase input type.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const generateEstimateMock = vi.fn()
const researchMock = vi.fn()
const phaseMock = vi.fn()

vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('@/lib/queries/recording', () => ({ getProjectRecordings: vi.fn() }))
vi.mock('@/lib/queries/photo', () => ({ getProjectPhotos: vi.fn() }))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  unstable_cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}))
vi.mock('@/lib/ai', () => ({ getAIProvider: vi.fn() }))
vi.mock('@/lib/ai/provider-with-fallback', () => ({ getAIProviderWithFallback: vi.fn() }))
vi.mock('@/lib/estimate/public-url', () => ({ generatePublicSlugToken: vi.fn().mockReturnValue('tok') }))
vi.mock('@/lib/knowledge/retrieve', () => ({ retrieve: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/estimate/price-research/orchestrator', () => ({
  researchUnmatchedPrices: (...a: unknown[]) => researchMock(...a),
}))
vi.mock('@/lib/observability/generation-phase', () => ({
  reportGeneratePhase: (...a: unknown[]) => phaseMock(...a),
}))

import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { requireServiceClient } from '@/lib/supabase/service'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { getAIProviderWithFallback } from '@/lib/ai/provider-with-fallback'

const OUTPUT: EstimateOutput = {
  suggested_project_name: 'Bedroom',
  suggested_client_name: null,
  summary: 'Repaint the bedroom walls.',
  sections: [
    {
      title: 'Work',
      items: [
        { description: 'Paint walls', quantity: 100, unit: 'sqft', unit_price: 1.5, price_source: 'price_book' },
        { description: 'Paint trim', quantity: 10, unit: 'each', unit_price: 5, price_source: 'researched' },
      ],
    },
  ],
}

type Call = { op: 'update' | 'delete'; row?: unknown; filters: Array<[string, string, unknown]> }

/** Wraps the harness client so every estimates update/delete is recorded in order. */
function arrange(mockOpts: Parameters<typeof makeServiceMock>[0] = {}) {
  generateEstimateMock.mockResolvedValue(OUTPUT)
  researchMock.mockImplementation(async (sections: unknown) => ({ sections, flaggedUnpriced: 0 }))
  vi.mocked(getAIProviderWithFallback).mockResolvedValue({
    generateEstimate: generateEstimateMock,
    refineEstimate: vi.fn(),
  } as never)
  vi.mocked(getProjectRecordings).mockResolvedValue([{ id: 'r', transcript: 'Repaint the walls.' } as never])
  vi.mocked(getProjectPhotos).mockResolvedValue([])
  const mock = makeServiceMock(mockOpts)
  const calls: Call[] = []
  const record = (op: Call['op'], row?: unknown) => {
    const call: Call = { op, row, filters: [] }
    calls.push(call)
    const chain: Record<string, unknown> = {}
    for (const f of ['eq', 'neq', 'is']) {
      chain[f] = (...args: unknown[]) => {
        call.filters.push([f, String(args[0]), args[1]])
        return chain
      }
    }
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve)
    return chain
  }
  const from = (table: string) => {
    const t = mock.from(table)
    if (table !== 'estimates') return t
    return { ...t, update: (row: unknown) => record('update', row), delete: () => record('delete') }
  }
  vi.mocked(requireServiceClient).mockReturnValue({ from } as never)
  return { ...mock, calls }
}

describe('generateEstimateForProject - integrity', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('demotes a model-claimed price_book / researched with no book match to ai_estimate, and it reaches research', async () => {
    const mock = arrange()
    await generateEstimateForProject('company-1', 'project-1')

    const sent = (researchMock.mock.calls[0][0] as EstimateOutput['sections'])[0].items
    expect(sent.map((i) => i.price_source)).toEqual(['ai_estimate', 'ai_estimate'])
    expect(mock.itemInserts[0].map((i) => i.price_source)).toEqual(['ai_estimate', 'ai_estimate'])
  })

  it('passes the attempt id to price research for metering', async () => {
    arrange()
    await generateEstimateForProject('company-1', 'project-1', { costContext: { attemptId: 'attempt-9' } })
    expect(researchMock.mock.calls[0][1]).toMatchObject({ projectId: 'project-1', attemptId: 'attempt-9' })
  })

  it('stamps journal phase rows with the attempt input type', async () => {
    arrange()
    await generateEstimateForProject('company-1', 'project-1', {
      costContext: { attemptId: 'attempt-9', inputType: 'recording' },
    })
    expect(phaseMock).toHaveBeenCalled()
    expect(phaseMock.mock.calls.every((c) => c[0].inputType === 'recording')).toBe(true)
  })

  it('happy path: inserts non-current, then demotes others and promotes the new row last', async () => {
    const mock = arrange()
    await generateEstimateForProject('company-1', 'project-1')

    expect(mock.estimateInserts[0].is_current).toBe(false)
    const updates = mock.calls.filter((c) => c.op === 'update')
    expect(updates).toHaveLength(2)
    expect(updates[0].row).toEqual({ is_current: false })
    expect(updates[0].filters).toEqual([
      ['eq', 'project_id', 'project-1'],
      ['neq', 'id', 'estimate-1'],
    ])
    expect(updates[1].row).toEqual({ is_current: true })
    expect(updates[1].filters).toEqual([['eq', 'id', 'estimate-1']])
    expect(mock.calls.some((c) => c.op === 'delete' && c.filters.some(([, k]) => k === 'id'))).toBe(false)
  })

  it('a failed items insert deletes the new row, keeps the previous version current and rethrows', async () => {
    const mock = arrange({ itemInsertErrors: [{ code: 'XX000', message: 'boom' }] })
    await expect(generateEstimateForProject('company-1', 'project-1')).rejects.toThrow('Failed to save estimate items')

    const del = mock.calls.filter((c) => c.op === 'delete' && c.filters.some(([, k]) => k === 'id'))
    expect(del).toHaveLength(1)
    expect(del[0].filters).toEqual([['eq', 'id', 'estimate-1']])
    // No current-pointer change ever happened: the previous version stays current.
    expect(mock.calls.filter((c) => c.op === 'update')).toHaveLength(0)
  })
})
