import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Phase 108 — RPRICE-01 / RPRICE-03 / RPRICE-04 / RFALL-01: the price-research
 * orchestrator `researchUnmatchedPrices(sections, ctx)`.
 *
 * The orchestrator composes the Phase-106 cache + Phase-107 provider + the 108-01
 * quota. Everything below it (cache.get/put, getPriceResearchProvider, checkQuota,
 * recordUsage) is mocked — no real network, no real DB, no secrets.
 *
 * Tests 1-3 lock the CONTRACT (Task 1): signature, never-throws, no-candidate
 * short-circuit + the flaggedUnpriced count. Tests 4-10 (Task 2) lock the full
 * cache→quota-gated provider→evidence-gate→metering→never-$0 flow.
 */

// ---- Mocks (declared before importing the module under test) ----
vi.mock('@/lib/estimate/price-research/provider', () => ({
  getPriceResearchProvider: vi.fn(),
  isUsableCandidate: vi.fn(),
}))
vi.mock('@/lib/estimate/price-research/cache', () => ({
  get: vi.fn(),
  put: vi.fn(),
}))
vi.mock('@/lib/quota', () => ({
  checkQuota: vi.fn(),
  recordUsage: vi.fn(),
}))

import { researchUnmatchedPrices, type ResearchContext } from '@/lib/estimate/price-research/orchestrator'
import { getPriceResearchProvider, isUsableCandidate } from '@/lib/estimate/price-research/provider'
import { get as cacheGet, put as cachePut } from '@/lib/estimate/price-research/cache'
import { checkQuota, recordUsage } from '@/lib/quota'
import type { EstimateSectionOutput, LineItemOutput } from '@/lib/ai/types'

// A minimal stand-in for the service-role client — the orchestrator only PASSES it
// through to the (mocked) checkQuota/recordUsage, so it never touches real methods.
const supabase = {} as never

function ctx(overrides: Partial<ResearchContext> = {}): ResearchContext {
  return {
    companyId: 'company-1',
    region: { city: 'Austin', state: 'TX' },
    currency: 'USD',
    supabase,
    attemptId: 'attempt-1',
    ...overrides,
  }
}

function item(partial: Partial<LineItemOutput> & { price_source: LineItemOutput['price_source'] }): LineItemOutput {
  return {
    description: partial.description ?? 'Some service',
    quantity: partial.quantity ?? 1,
    unit_price: partial.unit_price ?? 0,
    price_source: partial.price_source,
    ...(partial.unit ? { unit: partial.unit } : {}),
  }
}

function section(title: string, items: LineItemOutput[]): EstimateSectionOutput {
  return { title, items }
}

beforeEach(() => {
  vi.clearAllMocks()
})
afterEach(() => {
  vi.clearAllMocks()
})

describe('researchUnmatchedPrices — contract (Task 1)', () => {
  it('Test 1 (contract): returns { sections, flaggedUnpriced } and short-circuits when there are no ai_estimate candidates', async () => {
    const sections = [
      section('Labor', [item({ description: 'Crew day', unit_price: 500, price_source: 'price_book' })]),
    ]

    const out = await researchUnmatchedPrices(sections, ctx())

    expect(out).toHaveProperty('sections')
    expect(out).toHaveProperty('flaggedUnpriced')
    expect(typeof out.flaggedUnpriced).toBe('number')
    // No candidates → byte-identical sections; provider never resolved.
    expect(out.sections).toBe(sections)
    expect(getPriceResearchProvider).not.toHaveBeenCalled()
    expect(cacheGet).not.toHaveBeenCalled()
    // A price_book item at $500 is priced → not flagged.
    expect(out.flaggedUnpriced).toBe(0)
  })

  it('Test 2 (never-throws): a rejecting provider lookup yields the input sections unchanged + a flagged count, never a throw', async () => {
    // An ai_estimate $0 candidate makes the provider path reachable (Task 2 wires it);
    // even if every dependency throws, the call must resolve to the input sections.
    vi.mocked(cacheGet).mockRejectedValue(new Error('cache exploded'))
    vi.mocked(checkQuota).mockRejectedValue(new Error('quota exploded'))
    vi.mocked(getPriceResearchProvider).mockRejectedValue(new Error('provider exploded'))

    const sections = [
      section('Misc', [item({ description: 'Couch cleaning 8 seats', unit_price: 0, price_source: 'ai_estimate' })]),
    ]

    const out = await researchUnmatchedPrices(sections, ctx())

    // No throw → resolved value present.
    expect(out.sections).toEqual(sections)
    // The $0 ai_estimate item is flagged (never silently $0).
    expect(out.flaggedUnpriced).toBe(1)
  })

  it('Test 3 (no candidates): only price_book + owner-edited(null) items → byte-identical, provider never called', async () => {
    const ownerEdited = { description: 'Manual line', quantity: 1, unit_price: 300, price_source: null } as unknown as LineItemOutput
    const sections = [
      section('Mixed', [
        item({ description: 'Book item', unit_price: 200, price_source: 'price_book' }),
        ownerEdited,
      ]),
    ]

    const out = await researchUnmatchedPrices(sections, ctx())

    expect(out.sections).toBe(sections)
    expect(getPriceResearchProvider).not.toHaveBeenCalled()
    expect(cacheGet).not.toHaveBeenCalled()
    expect(isUsableCandidate).not.toHaveBeenCalled()
    expect(cachePut).not.toHaveBeenCalled()
    expect(recordUsage).not.toHaveBeenCalled()
    expect(out.flaggedUnpriced).toBe(0)
  })
})
