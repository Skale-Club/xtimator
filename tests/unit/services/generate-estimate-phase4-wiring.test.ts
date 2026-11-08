import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { EstimateOutput } from '@/lib/ai/types'
import { makeServiceMock } from './generate-harness'

// Phase 4 integration points through the REAL service path: price-book pricing fields reach
// anchoring (always on), and playbook / currency / ceiling reach their consumers.
vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const generateEstimateMock = vi.fn()
const researchMock = vi.fn()
const resolveSpy = vi.fn()
const scoreSpy = vi.fn()
const ceilingSpy = vi.fn()

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
vi.mock('@/lib/estimate/pricing/resolve-prices', async (orig) => {
  const actual = await orig<typeof import('@/lib/estimate/pricing/resolve-prices')>()
  return {
    ...actual,
    resolveLinePrices: (...a: Parameters<typeof actual.resolveLinePrices>) => {
      resolveSpy(...a)
      return actual.resolveLinePrices(...a)
    },
  }
})
vi.mock('@/lib/estimate/quality/structure-score', async (orig) => {
  const actual = await orig<typeof import('@/lib/estimate/quality/structure-score')>()
  return {
    ...actual,
    scoreStructure: (...a: Parameters<typeof actual.scoreStructure>) => {
      scoreSpy(...a)
      return actual.scoreStructure(...a)
    },
  }
})
vi.mock('@/lib/estimate/pricing/price-bands', async (orig) => {
  const actual = await orig<typeof import('@/lib/estimate/pricing/price-bands')>()
  return {
    ...actual,
    ceilingInCurrency: (...a: Parameters<typeof actual.ceilingInCurrency>) => {
      ceilingSpy(...a)
      return actual.ceilingInCurrency(...a)
    },
  }
})

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
      items: [{ description: 'Paint walls', quantity: 100, unit: 'sq ft', unit_price: 1.5, price_source: 'ai_estimate' }],
    },
  ],
}

function arrange(mockOpts: Parameters<typeof makeServiceMock>[0] = {}) {
  generateEstimateMock.mockResolvedValue(OUTPUT)
  researchMock.mockImplementation(async (sections: unknown) => ({ sections, flaggedUnpriced: 0 }))
  vi.mocked(getAIProviderWithFallback).mockResolvedValue({
    generateEstimate: generateEstimateMock,
    refineEstimate: vi.fn(),
  } as never)
  vi.mocked(getProjectRecordings).mockResolvedValue([{ id: 'r', transcript: 'Repaint the bedroom walls.' } as never])
  vi.mocked(getProjectPhotos).mockResolvedValue([])
  const mock = makeServiceMock(mockOpts)
  vi.mocked(requireServiceClient).mockReturnValue({ from: mock.from } as never)
  return mock
}

const areaBasedRow = {
  id: 'pb1',
  company_id: 'company-1',
  currency_code: 'USD',
  folder_id: null,
  name: 'Paint walls',
  unit: 'sq ft',
  unit_price: 0,
  pricing_type: 'area_based',
  price_per_unit: 2,
  minimum_price: null,
  base_price: null,
  area_sizes: null,
  price_book_folders: null,
}

describe('generateEstimateForProject - Phase 4 wiring', () => {
  beforeEach(() => vi.resetAllMocks())
  afterEach(() => vi.unstubAllEnvs())

  it('an area_based row priced 0 does not anchor a $0 line (always on, flags off)', async () => {
    const mock = arrange({ priceBook: [areaBasedRow] })
    await generateEstimateForProject('company-1', 'project-1')

    const item = mock.itemInserts[0][0]
    expect(item.unit_price).not.toBe(0)
    expect(item.unit_price).toBe(2) // price_per_unit
    expect(item.price_source).toBe('price_book')
    // The extra fields reached resolveLinePrices.
    const book = resolveSpy.mock.calls[0][1].priceBookItems
    expect(book[0]).toMatchObject({ unit: 'sq ft', pricing_type: 'area_based', price_per_unit: 2 })
  })

  it('an area_based row with no usable price does not anchor at all: the model price stands', async () => {
    const mock = arrange({ priceBook: [{ ...areaBasedRow, price_per_unit: null, minimum_price: null }] })
    await generateEstimateForProject('company-1', 'project-1')
    expect(mock.itemInserts[0][0].unit_price).toBe(1.5)
    expect(mock.itemInserts[0][0].price_source).toBe('ai_estimate')
  })

  it('the playbook and the currency reach their consumers; the ceiling is converted once', async () => {
    vi.stubEnv('ESTIMATOR_PRICE_BANDS', 'on')
    arrange({ company: { currency_code: 'EUR' }, priceBook: [] })
    await generateEstimateForProject('company-1', 'project-1')

    const opts = resolveSpy.mock.calls[0][1]
    expect(opts.playbook).toBeTruthy()
    expect(opts.playbook.id ?? opts.playbook.trade ?? opts.playbook.name).toBeDefined()
    // The raw USD ceiling goes to resolveLinePrices (it converts internally)...
    expect(opts.totalCeiling).toBe(2_000_000)
    // ...and the currency reaches the structure score.
    expect(scoreSpy.mock.calls[0][0].currencyCode).toBe('EUR')
    // ceilingInCurrency: the service's own call plus resolveLinePrices' internal one, both with
    // the RAW USD figure. Nobody ever feeds it an already converted value.
    expect(ceilingSpy.mock.calls.length).toBe(2)
    for (const call of ceilingSpy.mock.calls) {
      expect(call[0]).toBe(2_000_000)
      expect(call[1]).toBe('EUR')
    }
  })

  it('flags off: a EUR estimate keeps the unconverted ceiling', async () => {
    arrange({ company: { currency_code: 'EUR' } })
    await generateEstimateForProject('company-1', 'project-1')
    expect(resolveSpy.mock.calls[0][1].totalCeiling).toBe(2_000_000)
    // ceilingInCurrency is a no-op with the flag off: every call returns its input.
    const { ceilingInCurrency } = await vi.importActual<typeof import('@/lib/estimate/pricing/price-bands')>(
      '@/lib/estimate/pricing/price-bands'
    )
    expect(ceilingInCurrency(2_000_000, 'EUR')).toBe(2_000_000)
  })
})
