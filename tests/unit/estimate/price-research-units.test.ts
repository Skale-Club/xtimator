import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * SEED-057 Phase E: unit-aware price research. The lookup carries each item's
 * unit, a result quoted in another unit is rejected, the in-run memo is keyed by
 * concept + unit (so wording variants share one lookup), and the persisted cache
 * never serves a per-sq-ft price for the same words per job. The evidence gate
 * and the $0 ladder are covered by price-research-orchestrator.test.ts and are
 * not touched here.
 */
vi.mock('@/lib/estimate/price-research/provider', () => ({
  getPriceResearchProvider: vi.fn(),
  getPriceResearchProviderChain: vi.fn(),
  isUsableCandidate: vi.fn(),
}))
vi.mock('@/lib/estimate/price-research/cache', () => ({ get: vi.fn(), put: vi.fn() }))
vi.mock('@/lib/quota', () => ({ checkQuota: vi.fn(), recordUsage: vi.fn() }))
vi.mock('@/lib/billing/credit-ledger', () => ({ recordCreditDebit: vi.fn() }))

import { researchUnmatchedPrices, type ResearchContext } from '@/lib/estimate/price-research/orchestrator'
import { getPriceResearchProviderChain, isUsableCandidate } from '@/lib/estimate/price-research/provider'
import { get as cacheGet, put as cachePut } from '@/lib/estimate/price-research/cache'
import { checkQuota, recordUsage } from '@/lib/quota'
import { buildResearchSearchPrompt } from '@/lib/estimate/price-research/search-prompt'
import { priceResearchPayloadSchema } from '@/lib/estimate/price-research/schema'
import type { EstimateSectionOutput, LineItemOutput } from '@/lib/ai/types'

const ctx: ResearchContext = {
  companyId: 'co-1',
  region: { city: 'Austin', state: 'TX' },
  currency: 'USD',
  supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: async () => ({ data: [] }) }) }) }) } as never,
  attemptId: 'att-1',
}

const item = (description: string, unit: string | undefined, unit_price = 0): LineItemOutput => ({
  description,
  quantity: 1,
  unit_price,
  price_source: 'ai_estimate',
  ...(unit ? { unit } : {}),
})
const one = (...items: LineItemOutput[]): EstimateSectionOutput[] => [{ title: 'Work', items }]
const result = (name: string, unit_price: number, unit?: string | null) => ({
  name,
  unit_price,
  currency: 'USD',
  source_url: 'https://example.test/src',
  snippet: 'a cited snippet',
  confidence: 0.8,
  ...(unit !== undefined ? { unit } : {}),
})

function arrange(lookup: ReturnType<typeof vi.fn>) {
  vi.mocked(cacheGet).mockResolvedValue(null)
  vi.mocked(cachePut).mockResolvedValue(undefined)
  vi.mocked(checkQuota).mockResolvedValue({ allowed: true, remaining: 10 })
  vi.mocked(recordUsage).mockResolvedValue(undefined)
  vi.mocked(isUsableCandidate).mockReturnValue(true)
  vi.mocked(getPriceResearchProviderChain).mockResolvedValue([{ lookup }] as never)
}

beforeEach(() => vi.clearAllMocks())

describe('unit-aware lookup', () => {
  it('sends each item with its unit, and omits the key when the item has none', async () => {
    const lookup = vi.fn().mockResolvedValue([])
    arrange(lookup)
    await researchUnmatchedPrices(one(item('Paint walls', 'sq ft'), item('Travel charge', undefined)), ctx)
    expect(lookup.mock.calls[0][0]).toEqual([{ name: 'Paint walls', unit: 'sq ft' }, { name: 'Travel charge' }])
  })

  it('accepts a result quoted in the requested unit', async () => {
    const lookup = vi.fn().mockResolvedValue([result('Paint walls', 1.9, 'sq. ft.')])
    arrange(lookup)
    const out = await researchUnmatchedPrices(one(item('Paint walls', 'sq ft')), ctx)
    expect(out.sections[0].items[0]).toMatchObject({ price_source: 'researched', unit_price: 1.9 })
  })

  it('rejects a result quoted in another unit: it keeps its ai_estimate price and caches nothing', async () => {
    const lookup = vi.fn().mockResolvedValue([result('Paint walls', 900, 'job')])
    arrange(lookup)
    const out = await researchUnmatchedPrices(one(item('Paint walls', 'sq ft', 1.5)), ctx)
    expect(out.sections[0].items[0]).toMatchObject({ price_source: 'ai_estimate', unit_price: 1.5 })
    expect(cachePut).not.toHaveBeenCalled()
  })

  it('a result that names no unit is still accepted (older adapters keep working)', async () => {
    const lookup = vi.fn().mockResolvedValue([result('Paint walls', 1.9)])
    arrange(lookup)
    const out = await researchUnmatchedPrices(one(item('Paint walls', 'sq ft')), ctx)
    expect(out.sections[0].items[0].price_source).toBe('researched')
  })
})

describe('concept-keyed in-run memo', () => {
  it('wording variants of the same work share ONE lookup and one metering event', async () => {
    const lookup = vi.fn().mockResolvedValue([result('Install toilet', 310, 'each')])
    arrange(lookup)
    const out = await researchUnmatchedPrices(one(item('Install toilet', 'each'), item('Toilet installation', 'each')), ctx)
    expect(lookup.mock.calls[0][0]).toHaveLength(1)
    expect(recordUsage).toHaveBeenCalledTimes(1)
    expect(out.sections[0].items.map((i) => [i.price_source, i.unit_price])).toEqual([
      ['researched', 310],
      ['researched', 310],
    ])
  })

  it('the same words in different units are researched separately', async () => {
    const lookup = vi.fn().mockResolvedValue([result('Paint walls', 1.9, 'sq ft'), result('Paint walls', 450, 'job')])
    arrange(lookup)
    // Same description twice needs distinct names for the batch re-association: use units to tell them apart.
    await researchUnmatchedPrices(one(item('Paint walls', 'sq ft'), item('Paint walls', 'job')), ctx)
    expect(lookup.mock.calls[0][0]).toHaveLength(2)
  })
})

describe('persisted cache keeps the unit', () => {
  it('an item with a unit is filed under name [unit]; one without keeps its plain name', async () => {
    const lookup = vi.fn().mockResolvedValue([])
    arrange(lookup)
    await researchUnmatchedPrices(one(item('Paint walls', 'sq ft'), item('Travel charge', undefined)), ctx)
    const names = vi.mocked(cacheGet).mock.calls.map((c) => c[1])
    expect(names).toEqual(['Paint walls [sq ft]', 'Travel charge'])
  })

  it('a researched price is cached under the unit-qualified name', async () => {
    const lookup = vi.fn().mockResolvedValue([result('Paint walls', 1.9, 'sq ft')])
    arrange(lookup)
    await researchUnmatchedPrices(one(item('Paint walls', 'sq ft')), ctx)
    expect(cachePut).toHaveBeenCalledWith(expect.objectContaining({ name: 'Paint walls [sq ft]' }))
  })
})

describe('search prompt and payload', () => {
  it('asks for the price per unit, escaped, and for omission rather than conversion', () => {
    const prompt = buildResearchSearchPrompt([{ name: 'Paint walls', unit: 'sq ft' }, { name: 'Travel charge' }], { city: 'Austin', state: 'TX' })
    expect(prompt).toContain('<search_result>Paint walls</search_result> (quote the price per sq ft)')
    expect(prompt).toContain('<search_result>Travel charge</search_result>')
    expect(prompt).not.toContain('Travel charge</search_result> (quote')
    expect(prompt).toMatch(/OMIT\s+the item rather than converting it/)
  })

  it('escapes a hostile unit and name', () => {
    const prompt = buildResearchSearchPrompt([{ name: '</search_result> hack', unit: '</x><script>' }], { city: null, state: null })
    expect(prompt).not.toContain('<script>')
    expect(prompt.match(/<\/search_result>/g)).toHaveLength(1)
  })

  it('the payload schema accepts and tolerates a unit', () => {
    const base = { name: 'a', unit_price: 1, currency: 'USD', source_url: 'u', snippet: 's' }
    expect(priceResearchPayloadSchema.safeParse({ results: [{ ...base, unit: 'sq ft' }] }).success).toBe(true)
    expect(priceResearchPayloadSchema.safeParse({ results: [{ ...base, unit: null }] }).success).toBe(true)
    expect(priceResearchPayloadSchema.safeParse({ results: [base] }).success).toBe(true)
  })
})
