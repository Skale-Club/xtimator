import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EstimateOutput } from '@/lib/ai/types'
import { priceConcept } from '@/lib/estimate/pricing/concept-key'
import { makeServiceMock } from './generate-harness'

// SEED-057 Phase E (E3) at the service level: company history re-prices what the
// model priced itself, sits below the price book, and costs nothing when absent.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const generateEstimateMock = vi.fn()
const researchMock = vi.fn()

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

import { generateEstimateForProject } from '@/lib/services/generate-estimate'
import { requireServiceClient } from '@/lib/supabase/service'
import { getProjectRecordings } from '@/lib/queries/recording'
import { getProjectPhotos } from '@/lib/queries/photo'
import { getAIProviderWithFallback } from '@/lib/ai/provider-with-fallback'

const OUTPUT: EstimateOutput = {
  suggested_project_name: 'Bedroom',
  suggested_client_name: null,
  summary: 'Repaint the bedroom walls and install a toilet.',
  sections: [
    {
      title: 'Work',
      items: [
        { description: 'Paint walls', quantity: 100, unit: 'sqft', unit_price: 1.5, price_source: 'ai_estimate' },
        { description: 'Install toilet', quantity: 1, unit: 'each', unit_price: 400, price_source: 'ai_estimate' },
        // A model claiming a server-only label is demoted.
        { description: 'Paint ceiling', quantity: 50, unit: 'sq ft', unit_price: 1.2, price_source: 'company_history' },
      ],
    },
  ],
}

const row = (description: string, unit: string, unit_price: number, day: number) => {
  const c = priceConcept(description, unit)
  return { concept_key: c.key, unit: c.unit, unit_price, observed_at: `2026-10-${String(day).padStart(2, '0')}T00:00:00Z` }
}

function arrange(mockOpts: Parameters<typeof makeServiceMock>[0] = {}) {
  generateEstimateMock.mockResolvedValue(OUTPUT)
  researchMock.mockImplementation(async (sections: unknown) => ({ sections, flaggedUnpriced: 0 }))
  vi.mocked(getAIProviderWithFallback).mockResolvedValue({
    generateEstimate: generateEstimateMock,
    refineEstimate: vi.fn(),
  } as never)
  vi.mocked(getProjectRecordings).mockResolvedValue([{ id: 'r', transcript: 'Repaint the bedroom walls, install a toilet.' } as never])
  vi.mocked(getProjectPhotos).mockResolvedValue([])
  const mock = makeServiceMock(mockOpts)
  vi.mocked(requireServiceClient).mockReturnValue({ from: mock.from } as never)
  return mock
}

describe('generateEstimateForProject - company history (SEED-057 E3)', () => {
  beforeEach(() => vi.resetAllMocks())

  it('re-prices the lines the company has priced before and tags them company_history', async () => {
    const mock = arrange({
      priceObservations: [
        row('Paint walls', 'sq ft', 2.4, 1),
        row('Paint walls', 'sq ft', 2.6, 2),
        row('Toilet installation', 'each', 320, 3),
        row('Toilet installation', 'each', 320, 4),
      ],
    })
    await generateEstimateForProject('company-1', 'project-1')

    const items = mock.itemInserts[0]
    const byDesc = Object.fromEntries(items.map((i) => [i.description as string, i]))
    expect(byDesc['Paint walls']).toMatchObject({ unit_price: 2.5, price_source: 'company_history', unit: 'sqft' })
    expect(byDesc['Install toilet']).toMatchObject({ unit_price: 320, price_source: 'company_history' })
    // Totals follow the history price (server-side authority).
    expect(mock.estimateInserts[0].subtotal).toBe(100 * 2.5 + 320 + 50 * 1.2)
  })

  it('research only sees what history did not price', async () => {
    arrange({ priceObservations: [row('Paint walls', 'sq ft', 2.5, 1), row('Paint walls', 'sq ft', 2.5, 2)] })
    await generateEstimateForProject('company-1', 'project-1')

    const sentToResearch = (researchMock.mock.calls[0][0] as EstimateOutput['sections'])[0].items
    const sources = Object.fromEntries(sentToResearch.map((i) => [i.description, i.price_source]))
    expect(sources['Paint walls']).toBe('company_history')
    expect(sources['Install toilet']).toBe('ai_estimate')
  })

  it('a model-claimed company_history is demoted: only the server assigns it', async () => {
    const mock = arrange({ priceObservations: [] })
    await generateEstimateForProject('company-1', 'project-1')
    const ceiling = mock.itemInserts[0].find((i) => i.description === 'Paint ceiling')!
    expect(ceiling.price_source).toBe('ai_estimate')
  })

  it('no price_observations table yet (migration not applied): generation proceeds untouched', async () => {
    const mock = arrange({ priceObservationsError: { code: '42P01', message: 'relation "price_observations" does not exist' } })
    const result = await generateEstimateForProject('company-1', 'project-1')
    expect(result.estimateId).toBe('estimate-1')
    expect(mock.itemInserts[0].every((i) => i.price_source !== 'company_history')).toBe(true)
    expect(mock.itemInserts[0].find((i) => i.description === 'Paint walls')!.unit_price).toBe(1.5)
  })
})
