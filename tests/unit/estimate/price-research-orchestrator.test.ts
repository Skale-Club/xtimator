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

/** A usable (evidenced) provider result builder. */
function usable(name: string, unit_price: number) {
  return {
    name,
    unit_price,
    currency: 'USD',
    source_url: 'https://example.test/source',
    snippet: 'a real cited snippet',
    confidence: 0.8,
  }
}
/** An UNGROUNDED result (no source_url) → isUsableCandidate false. */
function ungrounded(name: string) {
  return { name, unit_price: 120, currency: 'USD', source_url: null, snippet: null, confidence: null }
}

describe('researchUnmatchedPrices — composition (Task 2)', () => {
  it('Test 4 (precedence): only the ai_estimate item is researched; price_book + owner-edited(null) untouched', async () => {
    const ownerEdited = { description: 'Owner line', quantity: 1, unit_price: 99, price_source: null } as unknown as LineItemOutput
    const sections = [
      section('Work', [
        item({ description: 'Book item', unit_price: 200, price_source: 'price_book' }),
        item({ description: 'Drywall repair', unit_price: 50, price_source: 'ai_estimate' }),
        ownerEdited,
      ]),
    ]
    vi.mocked(cacheGet).mockResolvedValue(null) // miss → provider path
    vi.mocked(checkQuota).mockResolvedValue({ allowed: true, remaining: 10 })
    const lookup = vi.fn().mockResolvedValue([usable('Drywall repair', 175)])
    vi.mocked(getPriceResearchProvider).mockResolvedValue({ lookup } as never)
    vi.mocked(isUsableCandidate).mockReturnValue(true)
    vi.mocked(recordUsage).mockResolvedValue(undefined)
    vi.mocked(cachePut).mockResolvedValue(undefined)

    const out = await researchUnmatchedPrices(sections, ctx())

    // provider.lookup received EXACTLY the one ai_estimate item.
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup.mock.calls[0][0]).toEqual([{ name: 'Drywall repair' }])

    const items = out.sections[0].items
    expect(items[0].price_source).toBe('price_book') // untouched
    expect(items[0].unit_price).toBe(200)
    expect(items[1].price_source).toBe('researched') // re-tagged
    expect(items[1].unit_price).toBe(175)
    expect(items[2].price_source).toBe(null) // owner-edited untouched
    expect(items[2].unit_price).toBe(99)
  })

  it('Test 5 (cache HIT): cached datum → re-tag researched; provider + recordUsage NOT called', async () => {
    const sections = [
      section('Work', [item({ description: 'Couch cleaning 8 seats', unit_price: 0, price_source: 'ai_estimate' })]),
    ]
    vi.mocked(cacheGet).mockResolvedValue({
      unit_price: 180,
      currency: 'USD',
      source: 'exa',
      confidence: 0.9,
      expires_at: new Date(Date.now() + 1000).toISOString(),
    })
    const lookup = vi.fn()
    vi.mocked(getPriceResearchProvider).mockResolvedValue({ lookup } as never)

    const out = await researchUnmatchedPrices(sections, ctx())

    expect(out.sections[0].items[0].price_source).toBe('researched')
    expect(out.sections[0].items[0].unit_price).toBe(180)
    expect(getPriceResearchProvider).not.toHaveBeenCalled() // never resolved on a pure hit
    expect(lookup).not.toHaveBeenCalled()
    expect(checkQuota).not.toHaveBeenCalled() // no misses → no quota check
    expect(recordUsage).not.toHaveBeenCalled() // HIT consumes no allowance
    expect(out.flaggedUnpriced).toBe(0)
  })

  it('Test 6 (cache MISS + allowed + evidenced): re-tag researched, cache.put, recordUsage once with the per-attempt key', async () => {
    const sections = [
      section('Work', [item({ description: 'Drywall repair', unit_price: 0, price_source: 'ai_estimate' })]),
    ]
    vi.mocked(cacheGet).mockResolvedValue(null)
    vi.mocked(checkQuota).mockResolvedValue({ allowed: true, remaining: 5 })
    const lookup = vi.fn().mockResolvedValue([usable('Drywall repair', 250)])
    vi.mocked(getPriceResearchProvider).mockResolvedValue({ lookup } as never)
    vi.mocked(isUsableCandidate).mockReturnValue(true)
    vi.mocked(recordUsage).mockResolvedValue(undefined)
    vi.mocked(cachePut).mockResolvedValue(undefined)

    const out = await researchUnmatchedPrices(sections, ctx({ attemptId: 'attempt-XYZ' }))

    expect(out.sections[0].items[0].price_source).toBe('researched')
    expect(out.sections[0].items[0].unit_price).toBe(250)

    expect(cachePut).toHaveBeenCalledTimes(1)
    expect(cachePut).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 'company-1',
        name: 'Drywall repair',
        currency: 'USD',
        datum: expect.objectContaining({ unit_price: 250 }),
      })
    )

    expect(recordUsage).toHaveBeenCalledTimes(1)
    const [, companyArg, eventArg, unitsArg, keyArg] = vi.mocked(recordUsage).mock.calls[0]
    expect(companyArg).toBe('company-1')
    expect(eventArg).toBe('price_researched')
    expect(unitsArg).toBe(1)
    // Key contains the attemptId + normalized name + region.
    expect(keyArg).toContain('attempt-XYZ')
    expect(keyArg).toContain('research:')
    expect(keyArg).toContain('drywall repair')
    expect(keyArg).toContain('austin|tx')
  })

  it('Test 7 (evidence gate): an unevidenced result keeps ai_estimate and does NOT cache.put', async () => {
    const sections = [
      section('Work', [item({ description: 'Fence painting', unit_price: 40, price_source: 'ai_estimate' })]),
    ]
    vi.mocked(cacheGet).mockResolvedValue(null)
    vi.mocked(checkQuota).mockResolvedValue({ allowed: true, remaining: 5 })
    const lookup = vi.fn().mockResolvedValue([ungrounded('Fence painting')])
    vi.mocked(getPriceResearchProvider).mockResolvedValue({ lookup } as never)
    vi.mocked(isUsableCandidate).mockReturnValue(false) // no evidence
    vi.mocked(recordUsage).mockResolvedValue(undefined)

    const out = await researchUnmatchedPrices(sections, ctx())

    expect(out.sections[0].items[0].price_source).toBe('ai_estimate') // KEPT, not researched
    expect(out.sections[0].items[0].unit_price).toBe(40) // model's non-zero guess kept
    expect(cachePut).not.toHaveBeenCalled() // unevidenced → no put
    // The item is non-zero, so it is NOT flagged.
    expect(out.flaggedUnpriced).toBe(0)
  })

  it('Test 8 (over-allowance skip): checkQuota allowed:false → provider NOT called, sections still returned', async () => {
    const sections = [
      section('Work', [item({ description: 'Drywall repair', unit_price: 60, price_source: 'ai_estimate' })]),
    ]
    vi.mocked(cacheGet).mockResolvedValue(null)
    vi.mocked(checkQuota).mockResolvedValue({ allowed: false, remaining: 0 })
    const lookup = vi.fn()
    vi.mocked(getPriceResearchProvider).mockResolvedValue({ lookup } as never)

    const out = await researchUnmatchedPrices(sections, ctx())

    expect(getPriceResearchProvider).not.toHaveBeenCalled()
    expect(lookup).not.toHaveBeenCalled()
    expect(recordUsage).not.toHaveBeenCalled()
    expect(out.sections[0].items[0].price_source).toBe('ai_estimate') // kept
    expect(out.sections[0].items[0].unit_price).toBe(60)
  })

  it('Test 9 (never-$0 / flagged): a $0 ai_estimate item research could not improve is counted in flaggedUnpriced, not dropped', async () => {
    const sections = [
      section('Work', [
        item({ description: 'Mystery task', unit_price: 0, price_source: 'ai_estimate' }),
        item({ description: 'Book item', unit_price: 300, price_source: 'price_book' }),
      ]),
    ]
    vi.mocked(cacheGet).mockResolvedValue(null)
    vi.mocked(checkQuota).mockResolvedValue({ allowed: true, remaining: 5 })
    const lookup = vi.fn().mockResolvedValue([ungrounded('Mystery task')]) // no evidence
    vi.mocked(getPriceResearchProvider).mockResolvedValue({ lookup } as never)
    vi.mocked(isUsableCandidate).mockReturnValue(false)
    vi.mocked(recordUsage).mockResolvedValue(undefined)

    const out = await researchUnmatchedPrices(sections, ctx())

    const items = out.sections[0].items
    expect(items[0].price_source).toBe('ai_estimate') // kept, not dropped
    expect(items[0].unit_price).toBe(0) // not mutated to a fake price
    expect(items[1].price_source).toBe('price_book')
    expect(out.flaggedUnpriced).toBe(1) // the $0 item flagged; the $300 one is not
  })

  it('Test 10 (batched + idempotency-key stable): N misses → ONE lookup; distinct stable keys; rerun yields same keys', async () => {
    const sections = [
      section('Work', [
        item({ description: 'Drywall repair', unit_price: 0, price_source: 'ai_estimate' }),
        item({ description: 'Fence painting', unit_price: 0, price_source: 'ai_estimate' }),
      ]),
    ]
    vi.mocked(cacheGet).mockResolvedValue(null)
    vi.mocked(checkQuota).mockResolvedValue({ allowed: true, remaining: 50 })
    const lookup = vi
      .fn()
      .mockResolvedValue([usable('Drywall repair', 175), usable('Fence painting', 90)])
    vi.mocked(getPriceResearchProvider).mockResolvedValue({ lookup } as never)
    vi.mocked(isUsableCandidate).mockReturnValue(true)
    vi.mocked(recordUsage).mockResolvedValue(undefined)
    vi.mocked(cachePut).mockResolvedValue(undefined)

    await researchUnmatchedPrices(sections, ctx({ attemptId: 'attempt-1' }))

    // EXACTLY ONE batched lookup for both misses.
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(lookup.mock.calls[0][0]).toEqual([{ name: 'Drywall repair' }, { name: 'Fence painting' }])

    // recordUsage once per searched item, with DISTINCT keys.
    expect(recordUsage).toHaveBeenCalledTimes(2)
    const keysRun1 = vi.mocked(recordUsage).mock.calls.map((c) => c[4])
    expect(new Set(keysRun1).size).toBe(2)

    // Re-run with the same attemptId + names → SAME keys (dedup-safe / retry-stable).
    vi.mocked(recordUsage).mockClear()
    await researchUnmatchedPrices(sections, ctx({ attemptId: 'attempt-1' }))
    const keysRun2 = vi.mocked(recordUsage).mock.calls.map((c) => c[4])
    expect(keysRun2).toEqual(keysRun1)
  })
})
