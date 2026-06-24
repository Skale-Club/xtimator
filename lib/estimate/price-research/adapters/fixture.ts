/**
 * lib/estimate/price-research/adapters/fixture.ts
 *
 * The DETERMINISM SEAM (Phase 107 — RSRC-04). A deterministic, network-free
 * `PriceResearchProvider` keyed by the normalized (service name, region) tuple —
 * the eval-harness injection point that mirrors how the AI provider seam is mocked
 * in `tests/eval/mock-providers.ts`. Drives tests/CI with ZERO live network so the
 * v4.5 eval harness + the CI regression gate stay green (Pitfall 9 — a flaky,
 * time- or network-dependent source would silently break the gate).
 *
 * Guarantees:
 *  - PURE: `lookup` reads a synchronous in-memory map. No network, no DB, no clock
 *    drift — same fixtures + same `opts.now` produce byte-identical results.
 *  - EVIDENCE-GATED by data: a fixture entry with a real source_url + snippet is a
 *    usable researched price; an UNGROUNDED entry (source_url null) is a miss; an
 *    ABSENT item is a miss. The gate lives in `isUsableCandidate` (provider.ts) —
 *    this adapter never relaxes it.
 *  - FIXED CLOCK: any time-dependent field reads `opts.now` (the injected clock,
 *    never the wall clock), so a time-sensitive future field cannot introduce
 *    non-determinism.
 *
 * NOT a `*.test.ts` and NOT wired into any production path — a test/eval helper the
 * Phase-108 harness injects. Channel-neutral (ENGINE-01): no channel package.
 */
import type { PriceResearchProvider, PriceResearchResult, Region } from '../provider'
import { normalizeServiceNameKey, normalizeRegion } from '../normalize'

/**
 * A single golden candidate. The key (name, region) lives in the fixtures map, so
 * the candidate only carries the price + evidence. An UNGROUNDED candidate sets
 * `source_url: null` (and typically `snippet: null`) — present in the map but a
 * MISS through the evidence gate.
 */
export interface FixtureCandidate {
  unit_price: number | null
  currency?: string
  source_url: string | null
  snippet: string | null
  confidence?: number | null
}

/**
 * The golden dataset: `fixtureKey(name, region) -> candidate`. Built and read
 * through the SAME `fixtureKey` helper so the dataset and the adapter can never
 * drift on key derivation (single source of truth).
 */
export type PriceResearchFixtures = Record<string, FixtureCandidate>

/**
 * The single key derivation shared by the dataset and the adapter. Collapses the
 * service name via `normalizeServiceNameKey` (REUSING the anchoring normalizer) and
 * the region via `normalizeRegion` ("city|state"), so e.g. "Couch cleaning 8 seats"
 * and "Couch cleaning, 8 seats" map to the SAME entry for {Austin, TX}.
 */
export function fixtureKey(name: string, region: Region): string {
  return `${normalizeServiceNameKey(name)}@@${normalizeRegion(region)}`
}

/**
 * Default fixed clock (ms). Used only if a time-dependent field is ever needed and
 * the caller did not inject `opts.now`. NEVER read the wall clock in this adapter —
 * a fixed clock is what keeps the eval gate deterministic (Pitfall 9).
 */
export const FIXTURE_FIXED_NOW = 1_700_000_000_000

/** A miss for an item with no usable fixture entry (absent or ungrounded). */
function missFor(name: string, currency: string): PriceResearchResult {
  return { name, unit_price: null, currency, source_url: null, snippet: null }
}

/**
 * Build a deterministic PriceResearchProvider over a golden fixtures map.
 *
 * `opts.now` is the injectable fixed clock (ms). It is captured here but, because
 * the current `PriceResearchResult` carries no time field, it is not yet written
 * into a result — its purpose is to GUARANTEE that any future time-dependent field
 * reads the injected clock rather than the wall clock, preserving determinism.
 */
export function makeFixtureProvider(
  fixtures: PriceResearchFixtures,
  opts?: { now?: number }
): PriceResearchProvider {
  // Fixed clock — read from opts, NEVER the wall clock. Reserved for any future
  // time-dependent field so two lookups with the same `now` stay byte-identical.
  const now = opts?.now ?? FIXTURE_FIXED_NOW
  void now

  return {
    async lookup(
      items: { name: string }[],
      region: Region,
      currency: string
    ): Promise<PriceResearchResult[]> {
      return items.map((i) => {
        const c = fixtures[fixtureKey(i.name, region)]
        // Absent OR ungrounded (no source_url) → a miss. The evidence gate
        // (isUsableCandidate) makes a citation-less entry unusable; we surface it
        // here as a clean miss so Phase 108 falls it through to ai_estimate.
        if (!c || c.source_url === null) return missFor(i.name, currency)
        return {
          name: i.name,
          unit_price: c.unit_price,
          currency: c.currency ?? currency,
          source_url: c.source_url,
          snippet: c.snippet,
          confidence: c.confidence ?? null,
        }
      })
    },
  }
}
