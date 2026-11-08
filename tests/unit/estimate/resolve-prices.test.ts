import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { EstimateSectionOutput, LineItemOutput } from '@/lib/ai/types'

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })

const mockResearch = vi.fn()
const mockLoadHistory = vi.fn()

vi.mock('@/lib/estimate/price-research/orchestrator', () => ({
  researchUnmatchedPrices: (...a: unknown[]) => mockResearch(...a),
}))
vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))
vi.mock('@/lib/estimate/pricing/company-history', async (orig) => {
  const actual = await orig<typeof import('@/lib/estimate/pricing/company-history')>()
  return { ...actual, loadCompanyHistory: (...a: unknown[]) => mockLoadHistory(...a) }
})

import { resolveLinePrices } from '@/lib/estimate/pricing/resolve-prices'
import { buildHistoryIndex } from '@/lib/estimate/pricing/company-history'
import { priceConcept } from '@/lib/estimate/pricing/concept-key'

const line = (over: Partial<LineItemOutput>): LineItemOutput => ({
  description: 'Paint walls',
  quantity: 100,
  unit: 'sq ft',
  unit_price: 1.5,
  price_source: 'ai_estimate',
  ...over,
})
const secs = (...items: LineItemOutput[]): EstimateSectionOutput[] => [{ title: 'Walls', items }]

const baseOpts = {
  companyId: 'c1',
  currencyCode: 'USD',
  priceBookItems: [] as Array<{ name: string; unit_price: number }>,
  region: { city: 'Austin', state: 'TX' },
  supabase: {} as never,
}

function historyFor(description: string, unit: string, price: number) {
  const c = priceConcept(description, unit)
  return buildHistoryIndex([1, 2, 3].map((d) => ({ concept_key: c.key, unit: c.unit, unit_price: price, observed_at: `2026-10-0${d}T00:00:00Z` })))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoadHistory.mockResolvedValue(new Map())
  mockResearch.mockImplementation(async (sections: EstimateSectionOutput[]) => ({
    sections,
    flaggedUnpriced: 0,
    telemetry: { candidates: 0, cacheHits: 0, providerUsable: 0, missed: 0 },
  }))
})

describe('resolveLinePrices precedence', () => {
  it('demotes server-only labels claimed by the model, then price book re-tags a real match', async () => {
    const out = await resolveLinePrices(
      secs(
        line({ description: 'Paint walls', unit_price: 9, price_source: 'price_book' }),
        line({ description: 'Hauling', unit_price: 50, price_source: 'researched' })
      ),
      { ...baseOpts, priceBookItems: [{ name: 'Paint walls', unit_price: 2 }] }
    )
    const [walls, hauling] = out.sections[0].items
    expect(walls).toMatchObject({ unit_price: 2, price_source: 'price_book' })
    expect(hauling.price_source).toBe('ai_estimate')
    expect(out.anchoredCount).toBe(1)
    // research only saw the demoted line
    const seen = mockResearch.mock.calls[0][0] as EstimateSectionOutput[]
    expect(seen[0].items.filter((i) => i.price_source === 'ai_estimate').map((i) => i.description)).toEqual(['Hauling'])
  })

  it('company history re-prices ai_estimate lines but never a price_book line', async () => {
    mockLoadHistory.mockResolvedValue(historyFor('Paint walls', 'sq ft', 2))
    const out = await resolveLinePrices(
      secs(line({ description: 'Paint walls' })),
      baseOpts
    )
    expect(out.sections[0].items[0]).toMatchObject({ unit_price: 2, price_source: 'company_history' })
    expect(out.historyAppliedCount).toBe(1)

    const book = await resolveLinePrices(secs(line({ description: 'Paint walls' })), {
      ...baseOpts,
      priceBookItems: [{ name: 'Paint walls', unit_price: 1.75 }],
    })
    expect(book.sections[0].items[0]).toMatchObject({ unit_price: 1.75, price_source: 'price_book' })
    expect(book.historyAppliedCount).toBe(0)
  })

  it('returns research results, telemetry and flagged count, and narrates progress', async () => {
    mockResearch.mockImplementation(async (sections: EstimateSectionOutput[]) => ({
      sections: [{ ...sections[0], items: [{ ...sections[0].items[0], unit_price: 7, price_source: 'researched' }] }],
      flaggedUnpriced: 2,
      telemetry: { candidates: 1, cacheHits: 0, providerUsable: 1, missed: 0 },
    }))
    const progress: unknown[] = []
    const out = await resolveLinePrices(secs(line({})), { ...baseOpts, onProgress: (p) => progress.push(p) })
    expect(out.sections[0].items[0]).toMatchObject({ unit_price: 7, price_source: 'researched' })
    expect(out.flaggedUnpriced).toBe(2)
    expect(out.researchTelemetry).toEqual({ candidates: 1, cacheHits: 0, providerUsable: 1, missed: 0 })
    expect(progress).toEqual([
      { candidates: 1, itemCount: 1, sectionCount: 1 },
      { candidates: 1, researched: 1, itemCount: 1, sectionCount: 1 },
    ])
  })

  it('collapses exact duplicates only when totalCeiling is supplied', async () => {
    const dup = secs(line({}), line({}))
    const skipped = await resolveLinePrices(dup, baseOpts)
    expect(skipped.sections[0].items).toHaveLength(2)
    const deduped = await resolveLinePrices(dup, { ...baseOpts, totalCeiling: 2_000_000 })
    expect(deduped.sections[0].items).toHaveLength(1)
    expect(deduped.consistencyFlags).toEqual([{ kind: 'duplicate_collapsed', description: 'Paint walls', count: 2 }])
  })
})

describe('resolveLinePrices never throws', () => {
  it('a research failure degrades to the pre-research sections', async () => {
    mockResearch.mockRejectedValue(new Error('provider down'))
    const out = await resolveLinePrices(secs(line({})), { ...baseOpts, priceBookItems: [{ name: 'Paint walls', unit_price: 2 }] })
    expect(out.sections[0].items[0]).toMatchObject({ unit_price: 2, price_source: 'price_book' })
    expect(out.researchTelemetry).toBeUndefined()
    expect(out.flaggedUnpriced).toBe(0)
  })

  it('a failing history load degrades to the unmodified input', async () => {
    mockLoadHistory.mockRejectedValue(new Error('db down'))
    const out = await resolveLinePrices(secs(line({})), baseOpts)
    expect(out.sections[0].items[0]).toMatchObject({ unit_price: 1.5, price_source: 'ai_estimate' })
  })
})
