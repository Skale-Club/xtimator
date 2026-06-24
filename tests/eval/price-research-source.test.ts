/**
 * tests/eval/price-research-source.test.ts
 *
 * RSRC-04 — the GATED eval source-contract test. Collected by the eval `include`
 * glob (tests/eval/**\/*.test.ts, added in Phase 103-02), it drives the real
 * port-shaped fixture adapter deterministically under a FIXED CLOCK with a
 * LIVE-NETWORK TRIPWIRE: global fetch is stubbed to throw, so the source path
 * making ANY live call would fail the suite. This is the injection point the
 * Phase-108 harness will use (mirroring how the AI provider seam is mocked in
 * tests/eval/mock-providers.ts) — it guarantees the v4.5 eval harness + CI gate
 * stay green with ZERO live network (Pitfall 9 — non-determinism breaks the gate).
 *
 * Pure, fast, deterministic: no DB, no graph, no secrets. The full graph
 * regression for the originating "Couch cleaning 8 seats" case lands in Phase 108.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { makeFixtureProvider } from '@/lib/estimate/price-research/adapters/fixture'
import { PRICE_RESEARCH_FIXTURES } from './fixtures/price-research'
import { isUsableCandidate } from '@/lib/estimate/price-research/provider'

const AUSTIN = { city: 'Austin', state: 'TX' }
// Fixed clock — pins any time-dependent field so results never drift.
const provider = makeFixtureProvider(PRICE_RESEARCH_FIXTURES, { now: 1_700_000_000_000 })

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('EVAL source: fixture-driven price research is deterministic + network-free', () => {
  it('makes ZERO live network calls (fetch tripwire never fires)', async () => {
    // The tripwire: any fetch from the source path throws "NO LIVE NETWORK IN EVAL".
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        throw new Error('NO LIVE NETWORK IN EVAL')
      })
    )
    const results = await provider.lookup(
      [{ name: 'Couch cleaning 8 seats' }, { name: 'Fence painting' }, { name: 'Absent service' }],
      AUSTIN,
      'USD'
    )
    expect(results).toHaveLength(3)
  })

  it('the originating "Couch cleaning 8 seats" case is now researchable (usable)', async () => {
    const [r] = await provider.lookup([{ name: 'Couch cleaning 8 seats' }], AUSTIN, 'USD')
    expect(isUsableCandidate(r)).toBe(true)
    expect(r.unit_price).toBeGreaterThan(0)
    expect(r.source_url).toBeTruthy()
  })

  it('the UNGROUNDED case is a miss (evidence gate holds through the seam)', async () => {
    const [r] = await provider.lookup([{ name: 'Fence painting' }], AUSTIN, 'USD')
    expect(isUsableCandidate(r)).toBe(false)
  })

  it('an absent service is a miss, NOT a throw', async () => {
    const [r] = await provider.lookup([{ name: 'Underwater basket weaving' }], AUSTIN, 'USD')
    expect(isUsableCandidate(r)).toBe(false)
  })

  it('determinism: the same lookup twice yields deep-equal results (fixed clock)', async () => {
    const first = await provider.lookup([{ name: 'Couch cleaning 8 seats' }], AUSTIN, 'USD')
    const second = await provider.lookup([{ name: 'Couch cleaning 8 seats' }], AUSTIN, 'USD')
    expect(first).toEqual(second)
  })
})
