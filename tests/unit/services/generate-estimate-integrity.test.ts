import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EstimateOutput } from '@/lib/ai/types'
import { makeServiceMock } from './generate-harness'

// Service-level guarantees: server-only price labels, atomic current-version swap,
// research metering attempt id, and phase input type.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const generateEstimateMock = vi.fn()
const researchMock = vi.fn()
const phaseMock = vi.fn()

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => null,
  requireServiceClient: vi.fn(),
}))
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

/** Wraps the harness client so staged-row cleanup filters are recorded. */
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
  const cleanupFilters = vi.fn().mockReturnThis()
  const deleteEstimate = vi.fn(() => ({
    eq: cleanupFilters,
    is: cleanupFilters,
    then: (resolve: (value: { error: null }) => unknown) => Promise.resolve({ error: null }).then(resolve),
  }))
  const from = (table: string) => {
    const t = mock.from(table)
    if (table !== 'estimates') return t
    return { ...t, delete: deleteEstimate }
  }
  vi.mocked(requireServiceClient).mockReturnValue({ from, rpc: mock.rpc } as never)
  return { ...mock, deleteEstimate, cleanupFilters }
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

  it('activates the staged version together with its project metadata', async () => {
    const mock = arrange()
    await generateEstimateForProject('company-1', 'project-1')

    expect(mock.estimateInserts[0].is_current).toBe(false)
    expect(mock.rpc).toHaveBeenCalledOnce()
    expect(mock.rpc).toHaveBeenCalledWith('activate_estimate_version', expect.objectContaining({
      p_company_id: 'company-1',
      p_project_id: 'project-1',
      p_estimate_id: 'estimate-1',
      p_project_update: expect.objectContaining({ total: 200, status: 'estimate_ready' }),
    }))
    expect(mock.cleanupFilters).not.toHaveBeenCalledWith('id', 'estimate-1')
  })

  it('a failed items insert deletes the new row, keeps the previous version current and rethrows', async () => {
    const mock = arrange({ itemInsertErrors: [{ code: 'XX000', message: 'boom' }] })
    await expect(generateEstimateForProject('company-1', 'project-1')).rejects.toThrow('Failed to save estimate items')

    expect(mock.cleanupFilters).toHaveBeenCalledWith('id', 'estimate-1')
    expect(mock.cleanupFilters).toHaveBeenCalledWith('company_id', 'company-1')
    expect(mock.cleanupFilters).toHaveBeenCalledWith('project_id', 'project-1')
    expect(mock.cleanupFilters).toHaveBeenCalledWith('is_current', false)
    expect(mock.rpc).not.toHaveBeenCalled()
  })
})
