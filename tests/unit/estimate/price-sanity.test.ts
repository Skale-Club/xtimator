import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Phase 4e: price sanity. ALWAYS ON: research currency check, currency/region-aware research
// prompt, area_based book rows with unit_price 0. FLAGGED (ESTIMATOR_PRICE_BANDS, default off):
// 0.33x-3x research band, unit-aware anchoring, playbook price bands, converted ceilings.

vi.mock('@/lib/estimate/price-research/provider', () => ({
  getPriceResearchProvider: vi.fn(),
  getPriceResearchProviderChain: vi.fn(),
  isUsableCandidate: vi.fn(() => true),
}))
vi.mock('@/lib/estimate/price-research/cache', () => ({ get: vi.fn(), put: vi.fn() }))
vi.mock('@/lib/quota', () => ({ checkQuota: vi.fn(), recordUsage: vi.fn() }))
vi.mock('@/lib/billing/credit-ledger', () => ({ recordCreditDebit: vi.fn() }))

import { currencyCompatible, researchUnmatchedPrices } from '@/lib/estimate/price-research/orchestrator'
import { getPriceResearchProviderChain } from '@/lib/estimate/price-research/provider'
import { get as cacheGet, put as cachePut } from '@/lib/estimate/price-research/cache'
import { checkQuota } from '@/lib/quota'
import {
  buildResearchSearchPrompt,
  buildResearchSystemPrompt,
  isUsState,
  usesUsMarketWording,
} from '@/lib/estimate/price-research/search-prompt'
import {
  anchorAndClampSections,
  effectiveBookPrice,
  UNIT_PRICE_CEILING,
  unitPriceCeilingFor,
} from '@/lib/ai/price-anchoring'
import {
  APPROX_UNITS_PER_USD,
  BAND_MAX_RATIO,
  BAND_MIN_RATIO,
  ceilingInCurrency,
  findPlaybookBand,
  isPriceBandsEnabled,
  priceOutsideBand,
  usdToCurrencyApprox,
  withinRatioBand,
} from '@/lib/estimate/pricing/price-bands'
import { markOutOfBandLines } from '@/lib/estimate/pricing/resolve-prices'
import { scoreStructure } from '@/lib/estimate/quality/structure-score'
import { PLAYBOOKS, PLAYBOOK_IDS } from '@/lib/ai/playbooks'
import { SUPPORTED_CURRENCY_CODES } from '@/lib/money/currency'
import type { EstimateSectionOutput, LineItemOutput } from '@/lib/ai/types'

const supabase = {} as never
const ctx = (over: Record<string, unknown> = {}) => ({
  companyId: 'c1',
  region: { city: 'Austin', state: 'TX' },
  currency: 'USD',
  supabase,
  attemptId: 'a1',
  ...over,
})
const line = (over: Partial<LineItemOutput> = {}): LineItemOutput => ({
  description: 'Paint walls',
  quantity: 100,
  unit: 'sq ft',
  unit_price: 2,
  price_source: 'ai_estimate',
  ...over,
})
const secs = (...items: LineItemOutput[]): EstimateSectionOutput[] => [{ title: 'Walls', items }]

function mockProvider(result: Record<string, unknown> | null) {
  const lookup = vi.fn(async (items: Array<{ name: string }>) =>
    result === null
      ? []
      : items.map((i) => ({
          name: i.name,
          unit_price: 2,
          currency: 'USD',
          source_url: 'https://example.com',
          snippet: 's',
          unit: 'sq ft',
          ...result,
        }))
  )
  vi.mocked(getPriceResearchProviderChain).mockResolvedValue([{ lookup }] as never)
  vi.mocked(checkQuota).mockResolvedValue({ allowed: true } as never)
  vi.mocked(cacheGet).mockResolvedValue(null as never)
  return lookup
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllEnvs()
})
afterEach(() => vi.unstubAllEnvs())

describe('research currency check (ALWAYS ON)', () => {
  it('currencyCompatible: missing/blank passes, same passes case-insensitively, different fails', () => {
    expect(currencyCompatible('USD', undefined)).toBe(true)
    expect(currencyCompatible('USD', ' ')).toBe(true)
    expect(currencyCompatible('USD', 'usd')).toBe(true)
    expect(currencyCompatible('BRL', 'USD')).toBe(false)
  })

  it('rejects a result whose currency differs from the estimate currency (item keeps ai_estimate)', async () => {
    mockProvider({ unit_price: 2, currency: 'BRL' })
    const out = await researchUnmatchedPrices(secs(line()), ctx())
    expect(out.sections[0].items[0]).toMatchObject({ price_source: 'ai_estimate', unit_price: 2 })
    expect(cachePut).not.toHaveBeenCalled()
  })

  it('accepts a matching currency (BRL estimate, BRL result)', async () => {
    mockProvider({ unit_price: 11, currency: 'BRL' })
    const out = await researchUnmatchedPrices(secs(line({ unit_price: 10 })), ctx({ currency: 'BRL' }))
    expect(out.sections[0].items[0]).toMatchObject({ price_source: 'researched', unit_price: 11 })
  })
})

describe('research 0.33x-3x band (FLAGGED)', () => {
  it('constants equal the company-history band', async () => {
    vi.doMock('server-only', () => ({}))
    const hist = await import('@/lib/estimate/pricing/company-history')
    expect(BAND_MIN_RATIO).toBe(hist.HISTORY_MIN_RATIO)
    expect(BAND_MAX_RATIO).toBe(hist.HISTORY_MAX_RATIO)
  })

  it('withinRatioBand edges', () => {
    expect(withinRatioBand(10, 3.3)).toBe(true)
    expect(withinRatioBand(10, 30)).toBe(true)
    expect(withinRatioBand(10, 3.29)).toBe(false)
    expect(withinRatioBand(10, 30.01)).toBe(false)
    expect(withinRatioBand(0, 5)).toBe(true) // no model price to compare with
    expect(withinRatioBand(10, 0)).toBe(false)
  })

  it('OFF (default): a 20x researched price is accepted exactly as today', async () => {
    mockProvider({ unit_price: 40 })
    const out = await researchUnmatchedPrices(secs(line({ unit_price: 2 })), ctx())
    expect(out.sections[0].items[0]).toMatchObject({ price_source: 'researched', unit_price: 40 })
  })

  it('ON: a 20x researched price is rejected, a 2x one is accepted', async () => {
    vi.stubEnv('ESTIMATOR_PRICE_BANDS', '1')
    mockProvider({ unit_price: 40 })
    const rejected = await researchUnmatchedPrices(secs(line({ unit_price: 2 })), ctx())
    expect(rejected.sections[0].items[0]).toMatchObject({ price_source: 'ai_estimate', unit_price: 2 })

    mockProvider({ unit_price: 4 })
    const ok = await researchUnmatchedPrices(secs(line({ unit_price: 2 })), ctx())
    expect(ok.sections[0].items[0]).toMatchObject({ price_source: 'researched', unit_price: 4 })
  })

  it('ON: a model price of $0 has nothing to compare with, so the researched price is taken', async () => {
    vi.stubEnv('ESTIMATOR_PRICE_BANDS', '1')
    mockProvider({ unit_price: 40 })
    const out = await researchUnmatchedPrices(secs(line({ unit_price: 0 })), ctx())
    expect(out.sections[0].items[0]).toMatchObject({ price_source: 'researched', unit_price: 40 })
  })

  it('ON: an out-of-band CACHED price is rejected without calling the provider; OFF it is used', async () => {
    const lookup = mockProvider({ unit_price: 2 })
    vi.mocked(cacheGet).mockResolvedValue({ unit_price: 40, source: 'x' } as never)
    const off = await researchUnmatchedPrices(secs(line({ unit_price: 2 })), ctx())
    expect(off.sections[0].items[0]).toMatchObject({ price_source: 'researched', unit_price: 40 })

    vi.stubEnv('ESTIMATOR_PRICE_BANDS', '1')
    const on = await researchUnmatchedPrices(secs(line({ unit_price: 2 })), ctx())
    expect(on.sections[0].items[0]).toMatchObject({ price_source: 'ai_estimate', unit_price: 2 })
    expect(lookup).not.toHaveBeenCalled()
  })
})

describe('research prompt wording (ALWAYS ON)', () => {
  const items = [{ name: 'Paint walls', unit: 'sq ft' }]

  it('USD + a US state (or no currency given, or no region) keeps the US wording byte for byte', () => {
    const base = buildResearchSearchPrompt(items, { city: 'Austin', state: 'TX' })
    expect(base).toContain('You are a US market pricing researcher.')
    expect(base).toContain('AVERAGE US market unit price for that service in Austin, TX.')
    expect(buildResearchSearchPrompt(items, { city: 'Austin', state: 'TX' }, 'USD')).toBe(base)
    expect(buildResearchSearchPrompt(items, { city: 'Austin', state: 'Texas' }, 'usd')).toContain('US market')
    expect(buildResearchSearchPrompt(items, { city: null, state: null }, 'USD')).toContain('US market')
  })

  it('a BRL estimate asks for Brazilian prices in BRL, not US ones', () => {
    const out = buildResearchSearchPrompt(items, { city: 'Sao Paulo', state: 'SP' }, 'BRL')
    expect(out).toContain('Brazilian market')
    expect(out).toContain('quoted in BRL')
    expect(out).toContain('Sao Paulo, SP')
    expect(out).not.toContain('US market')
    expect(out).toContain('<search_result>Paint walls</search_result>')
  })

  it('USD with a non-US region is not described as the US market', () => {
    const out = buildResearchSearchPrompt(items, { city: 'Lisbon', state: 'Lisboa' }, 'USD')
    expect(out).not.toContain('US market pricing researcher')
  })

  it('helpers and system prompt', () => {
    expect(isUsState('tx')).toBe(true)
    expect(isUsState('New York')).toBe(true)
    expect(isUsState('SP')).toBe(false)
    expect(usesUsMarketWording(undefined, 'SP')).toBe(false) // unknown currency + non-US state
    expect(usesUsMarketWording(undefined, 'TX')).toBe(true)
    expect(buildResearchSystemPrompt('USD', 'TX')).toContain('average US market unit price')
    expect(buildResearchSystemPrompt('BRL', 'SP')).toContain('in BRL')
    expect(buildResearchSystemPrompt('BRL', 'SP')).not.toContain('US market')
  })
})

describe('price book rows with unit_price 0 (ALWAYS ON)', () => {
  const book = (over: Record<string, unknown>) => [{ name: 'Paint walls', unit_price: 0, ...over }]

  it('effectiveBookPrice: fixed/untyped rows keep today (even $0); area_based fall through', () => {
    expect(effectiveBookPrice({ name: 'a', unit_price: 0 })).toBe(0)
    expect(effectiveBookPrice({ name: 'a', unit_price: 0, pricing_type: 'fixed' })).toBe(0)
    expect(effectiveBookPrice({ name: 'a', unit_price: 9, pricing_type: 'area_based', price_per_unit: 2 })).toBe(9)
    expect(effectiveBookPrice({ name: 'a', unit_price: 0, pricing_type: 'area_based', price_per_unit: 2.5, minimum_price: 100 })).toBe(2.5)
    expect(effectiveBookPrice({ name: 'a', unit_price: 0, pricing_type: 'base_plus_addons', minimum_price: 100 })).toBe(100)
    expect(effectiveBookPrice({ name: 'a', unit_price: 0, pricing_type: 'area_based' })).toBeNull()
    expect(effectiveBookPrice({ name: 'a', unit_price: 0, pricing_type: 'area_based', price_per_unit: null, minimum_price: 0 })).toBeNull()
  })

  it('an area_based $0 row with price_per_unit anchors at price_per_unit', () => {
    const out = anchorAndClampSections(secs(line()), book({ pricing_type: 'area_based', price_per_unit: 3.25 }))
    expect(out.sections[0].items[0]).toMatchObject({ unit_price: 3.25, price_source: 'price_book' })
    expect(out.anchoredCount).toBe(1)
  })

  it('falls back to minimum_price, then does NOT anchor (the line keeps its model price)', () => {
    const min = anchorAndClampSections(secs(line()), book({ pricing_type: 'base_plus_addons', minimum_price: 150 }))
    expect(min.sections[0].items[0]).toMatchObject({ unit_price: 150, price_source: 'price_book' })
    const none = anchorAndClampSections(secs(line({ unit_price: 2 })), book({ pricing_type: 'area_based' }))
    expect(none.sections[0].items[0]).toMatchObject({ unit_price: 2, price_source: 'ai_estimate' })
    expect(none.anchoredCount).toBe(0)
  })

  it('a plain fixed row of $0 still anchors $0, exactly as before', () => {
    const out = anchorAndClampSections(secs(line()), book({ pricing_type: 'fixed' }))
    expect(out.sections[0].items[0]).toMatchObject({ unit_price: 0, price_source: 'price_book' })
    const untyped = anchorAndClampSections(secs(line()), [{ name: 'Paint walls', unit_price: 0 }])
    expect(untyped.sections[0].items[0]).toMatchObject({ unit_price: 0, price_source: 'price_book' })
  })
})

describe('unit-aware anchoring (FLAGGED)', () => {
  const book = [{ name: 'Paint walls', unit_price: 500, unit: 'job' }]

  it('default (no option): a per-job row still anchors a per-sq-ft line, as today', () => {
    const out = anchorAndClampSections(secs(line()), book)
    expect(out.sections[0].items[0]).toMatchObject({ unit_price: 500, price_source: 'price_book' })
  })

  it('compareUnits: a unit mismatch is skipped; a match, a synonym and a missing unit anchor', () => {
    const opts = { compareUnits: true }
    expect(anchorAndClampSections(secs(line()), book, opts).sections[0].items[0]).toMatchObject({ unit_price: 2, price_source: 'ai_estimate' })
    expect(anchorAndClampSections(secs(line({ unit: 'job' })), book, opts).sections[0].items[0].price_source).toBe('price_book')
    expect(anchorAndClampSections(secs(line({ unit: 'lump sum' })), book, opts).sections[0].items[0].price_source).toBe('price_book')
    expect(anchorAndClampSections(secs(line({ unit: undefined })), book, opts).sections[0].items[0].price_source).toBe('price_book')
    expect(anchorAndClampSections(secs(line()), [{ name: 'Paint walls', unit_price: 500 }], opts).sections[0].items[0].price_source).toBe('price_book')
  })
})

describe('ceilings in USD, converted for other currencies (FLAGGED)', () => {
  it('the table covers every supported currency and USD is identity', () => {
    for (const code of SUPPORTED_CURRENCY_CODES) expect(APPROX_UNITS_PER_USD[code]).toBeGreaterThan(0)
    expect(usdToCurrencyApprox(1_000_000, 'USD')).toBe(1_000_000)
    expect(usdToCurrencyApprox(1_000_000, 'XXX')).toBe(1_000_000)
    expect(usdToCurrencyApprox(1_000_000, 'BRL')).toBe(5_500_000)
  })

  it('unit clamp: USD (and no currency) is the raw $1M; BRL is converted; default behavior unchanged', () => {
    expect(unitPriceCeilingFor('USD')).toBe(UNIT_PRICE_CEILING)
    const over = secs(line({ unit_price: 2_000_000 }))
    // today / no options: clamped at the raw ceiling whatever the currency
    expect(anchorAndClampSections(over, []).sections[0].items[0].unit_price).toBe(UNIT_PRICE_CEILING)
    // flag path passes the currency
    expect(anchorAndClampSections(over, [], { currencyCode: 'USD' }).sections[0].items[0].unit_price).toBe(UNIT_PRICE_CEILING)
    const brl = anchorAndClampSections(secs(line({ unit_price: 2_000_000 })), [], { currencyCode: 'BRL' })
    expect(brl.sections[0].items[0].unit_price).toBe(2_000_000) // under 5.5M: legitimate in BRL
    expect(brl.clampedCount).toBe(0)
  })

  it('ceilingInCurrency is a no-op with the flag off, converts with it on', () => {
    expect(ceilingInCurrency(2_000_000, 'BRL', {})).toBe(2_000_000)
    expect(ceilingInCurrency(2_000_000, 'BRL', { ESTIMATOR_PRICE_BANDS: '1' })).toBe(11_000_000)
    expect(ceilingInCurrency(2_000_000, 'USD', { ESTIMATOR_PRICE_BANDS: '1' })).toBe(2_000_000)
  })
})

describe('playbook price bands (FLAGGED)', () => {
  it('flag is off by default', () => {
    expect(isPriceBandsEnabled({})).toBe(false)
    expect(isPriceBandsEnabled({ ESTIMATOR_PRICE_BANDS: 'true' })).toBe(true)
  })

  it('all 9 trades ship a clearly marked DRAFT band set', async () => {
    const { readFileSync } = await import('node:fs')
    for (const id of PLAYBOOK_IDS) {
      const bands = PLAYBOOKS[id].priceBands
      expect(bands && bands.length, id).toBeGreaterThan(0)
      for (const b of bands!) {
        expect(b.match.length).toBeGreaterThan(0)
        for (const [, [min, max]] of Object.entries(b.bands)) {
          expect(min).toBeGreaterThan(0)
          expect(max).toBeGreaterThan(min)
        }
      }
      expect(readFileSync(`lib/ai/playbooks/${id}.ts`, 'utf8'), id).toContain('DRAFT — owner review required (plan D7)')
    }
  })

  it('findPlaybookBand matches concept + unit, scales to the currency, ignores unknown units', () => {
    const usd = findPlaybookBand(PLAYBOOKS.painting, 'Paint interior walls', 'sq ft', 'USD')!
    expect(usd).toMatchObject({ unit: 'sq ft', min: 0.5, max: 6 })
    const brl = findPlaybookBand(PLAYBOOKS.painting, 'Paint interior walls', 'sq ft', 'BRL')!
    expect(brl.max).toBe(33)
    expect(findPlaybookBand(PLAYBOOKS.painting, 'Paint interior walls', 'fortnight', 'USD')).toBeNull()
    expect(findPlaybookBand(PLAYBOOKS.painting, 'Paint interior walls', null, 'USD')).toBeNull()
    expect(findPlaybookBand(PLAYBOOKS.painting, 'Zorp', 'sq ft', 'USD')).toBeNull()
    expect(findPlaybookBand({ priceBands: undefined }, 'Paint', 'sq ft', 'USD')).toBeNull()
  })

  it('priceOutsideBand only judges model/researched prices, never book or history, never $0', () => {
    const wall = { description: 'Paint interior walls', unit: 'sq ft' }
    expect(priceOutsideBand(PLAYBOOKS.painting, { ...wall, unit_price: 40, price_source: 'ai_estimate' })).not.toBeNull()
    expect(priceOutsideBand(PLAYBOOKS.painting, { ...wall, unit_price: 40, price_source: 'researched' })).not.toBeNull()
    expect(priceOutsideBand(PLAYBOOKS.painting, { ...wall, unit_price: 40, price_source: 'price_book' })).toBeNull()
    expect(priceOutsideBand(PLAYBOOKS.painting, { ...wall, unit_price: 40, price_source: 'company_history' })).toBeNull()
    expect(priceOutsideBand(PLAYBOOKS.painting, { ...wall, unit_price: 0, price_source: 'ai_estimate' })).toBeNull()
    expect(priceOutsideBand(PLAYBOOKS.painting, { ...wall, unit_price: 2, price_source: 'ai_estimate' })).toBeNull()
    expect(priceOutsideBand(PLAYBOOKS.painting, { ...wall, unit_price: 0.1, price_source: 'ai_estimate' })).not.toBeNull()
  })

  it('markOutOfBandLines sets confidence low and never changes the price', () => {
    const sections = secs(
      line({ description: 'Paint interior walls', unit_price: 40, confidence: 'high' }),
      line({ description: 'Paint interior walls', unit_price: 2, confidence: 'high' }),
    )
    const out = markOutOfBandLines(sections, PLAYBOOKS.painting, 'USD')
    expect(out[0].items[0]).toMatchObject({ unit_price: 40, confidence: 'low', price_source: 'ai_estimate' })
    expect(out[0].items[1]).toMatchObject({ unit_price: 2, confidence: 'high' })
  })

  describe('structure score finding', () => {
    const base = {
      summary: 'Paint the interior walls of the whole house, two coats, with prep.',
      playbook: PLAYBOOKS.painting,
      language: 'en' as const,
      sections: [
        {
          title: 'Walls',
          items: [
            { description: 'Prep and mask', quantity: 1, unit: 'job', unit_price: 200 },
            { description: 'Paint interior walls', quantity: 100, unit: 'sq ft', unit_price: 40 },
            { description: 'Protect floors and furniture', quantity: 1, unit: 'job', unit_price: 100 },
            { description: 'Cleanup and disposal', quantity: 1, unit: 'job', unit_price: 100 },
          ],
        },
      ],
    }

    it('OFF (default): no price_out_of_band finding, identical score', () => {
      const r = scoreStructure(base)
      expect(r.findings.map((f) => f.code)).not.toContain('price_out_of_band')
    })

    it('ON: an out-of-band model price adds a finding (not a price change); a book price does not', () => {
      vi.stubEnv('ESTIMATOR_PRICE_BANDS', '1')
      const off = scoreStructure({ ...base, playbook: { ...PLAYBOOKS.painting, priceBands: undefined } })
      const on = scoreStructure(base)
      const f = on.findings.find((x) => x.code === 'price_out_of_band')!
      expect(f.message).toContain('Paint interior walls')
      expect(f.penalty).toBe(4)
      expect(on.score).toBe(off.score - 4)
      expect(base.sections[0].items[1].unit_price).toBe(40)

      const book = scoreStructure({
        ...base,
        sections: [{ title: 'Walls', items: base.sections[0].items.map((i) => ({ ...i, price_source: 'price_book' })) }],
      })
      expect(book.findings.map((x) => x.code)).not.toContain('price_out_of_band')
    })

    it('ON: bands scale with the currency (25/sq ft is out in USD, in range in BRL)', () => {
      vi.stubEnv('ESTIMATOR_PRICE_BANDS', '1')
      const items = base.sections[0].items.map((i) => (i.unit === 'sq ft' ? { ...i, unit_price: 25 } : i))
      const input = { ...base, sections: [{ title: 'Walls', items }] }
      expect(scoreStructure({ ...input, currencyCode: 'USD' }).findings.map((f) => f.code)).toContain('price_out_of_band')
      expect(scoreStructure({ ...input, currencyCode: 'BRL' }).findings.map((f) => f.code)).not.toContain('price_out_of_band')
    })
  })
})
