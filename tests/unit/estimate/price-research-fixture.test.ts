/**
 * Unit tests for the deterministic price-research FIXTURE adapter (RSRC-04).
 *
 * Proves the determinism seam contract: evidenced -> usable, ungrounded -> miss,
 * absent -> miss, normalization collapse, fixed clock, and ZERO network (a fetch
 * spy must never be called). No DB, no secrets, synthetic fixtures only.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  makeFixtureProvider,
  fixtureKey,
  type PriceResearchFixtures,
} from '@/lib/estimate/price-research/adapters/fixture'
import { isUsableCandidate } from '@/lib/estimate/price-research/provider'

const AUSTIN = { city: 'Austin', state: 'TX' }

const FIXTURES: PriceResearchFixtures = {
  [fixtureKey('Couch cleaning 8 seats', AUSTIN)]: {
    unit_price: 180,
    currency: 'USD',
    source_url: 'https://example.test/austin-upholstery-cleaning',
    snippet: 'Austin, TX upholstery cleaning averages $150-$220 for an 8-seat sectional.',
  },
  // UNGROUNDED: a number with no citation.
  [fixtureKey('Fence painting', AUSTIN)]: {
    unit_price: 140,
    currency: 'USD',
    source_url: null,
    snippet: null,
  },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('makeFixtureProvider — deterministic price-research adapter', () => {
  it('evidenced item -> usable (source_url + snippet + positive price)', async () => {
    const provider = makeFixtureProvider(FIXTURES)
    const [r] = await provider.lookup(
      [{ name: 'Couch cleaning 8 seats' }],
      AUSTIN,
      'USD'
    )
    expect(r.unit_price).toBe(180)
    expect(r.source_url).toBeTruthy()
    expect(r.snippet).toBeTruthy()
    expect(isUsableCandidate(r)).toBe(true)
  })

  it('ungrounded item (no source_url) -> miss', async () => {
    const provider = makeFixtureProvider(FIXTURES)
    const [r] = await provider.lookup([{ name: 'Fence painting' }], AUSTIN, 'USD')
    expect(r.source_url).toBeNull()
    expect(isUsableCandidate(r)).toBe(false)
  })

  it('absent item -> miss', async () => {
    const provider = makeFixtureProvider(FIXTURES)
    const [r] = await provider.lookup([{ name: 'Roof inspection' }], AUSTIN, 'USD')
    expect(r.unit_price).toBeNull()
    expect(isUsableCandidate(r)).toBe(false)
  })

  it('normalization collapse: punctuation/case variants resolve to the SAME entry', async () => {
    const provider = makeFixtureProvider(FIXTURES)
    // normalizeNameForMatch strips commas + lowercases + collapses whitespace, so
    // these all reduce to "couch cleaning 8 seats".
    const [a] = await provider.lookup([{ name: 'Couch cleaning 8 seats' }], AUSTIN, 'USD')
    const [b] = await provider.lookup([{ name: 'Couch cleaning, 8 seats' }], AUSTIN, 'USD')
    const [c] = await provider.lookup(
      [{ name: '  COUCH   cleaning 8 seats ' }],
      { city: 'austin', state: 'tx' },
      'USD'
    )
    expect(a.unit_price).toBe(180)
    expect(b.unit_price).toBe(180)
    expect(c.unit_price).toBe(180)
  })

  it('fixed clock: two lookups with the same opts.now are byte-identical', async () => {
    const provider = makeFixtureProvider(FIXTURES, { now: 1_700_000_000_000 })
    const first = await provider.lookup([{ name: 'Couch cleaning 8 seats' }], AUSTIN, 'USD')
    const second = await provider.lookup([{ name: 'Couch cleaning 8 seats' }], AUSTIN, 'USD')
    expect(first).toEqual(second)
  })

  it('zero network: global fetch is never called during lookup', async () => {
    const fetchSpy = vi.fn(() => {
      throw new Error('fixture adapter must never fetch')
    })
    vi.stubGlobal('fetch', fetchSpy)
    const provider = makeFixtureProvider(FIXTURES)
    await provider.lookup(
      [{ name: 'Couch cleaning 8 seats' }, { name: 'Fence painting' }, { name: 'Absent' }],
      AUSTIN,
      'USD'
    )
    expect(fetchSpy).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })

  it('batched: returns one result per requested item, in order', async () => {
    const provider = makeFixtureProvider(FIXTURES)
    const results = await provider.lookup(
      [{ name: 'Couch cleaning 8 seats' }, { name: 'Fence painting' }],
      AUSTIN,
      'USD'
    )
    expect(results).toHaveLength(2)
    expect(results[0].name).toBe('Couch cleaning 8 seats')
    expect(results[1].name).toBe('Fence painting')
  })
})
