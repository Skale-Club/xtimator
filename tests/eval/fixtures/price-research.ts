/**
 * tests/eval/fixtures/price-research.ts
 *
 * RSRC-04 — the golden `(service, region) -> candidates` dataset the deterministic
 * fixture adapter resolves against. The eval-harness injection point's data, built
 * through `fixtureKey` (single source of truth with the adapter).
 *
 * Helper module (NOT a *.test.ts) — never collected as a suite by the vitest
 * `include` glob (scoped to tests/eval/**\/*.test.ts). Synthetic data ONLY: every
 * source_url is an RFC-2606 `*.test` placeholder, no real domains/keys → gitleaks-safe.
 *
 * Cases:
 *  - EVIDENCED "Couch cleaning 8 seats" {Austin, TX} — the ORIGINATING regression
 *    case (this is the line item that generated $0 and tripped the vague gate). With
 *    a real source_url + snippet + positive price it is now USABLE (RSRC readiness;
 *    the full graph regression lands in Phase 108).
 *  - EVIDENCED "Drywall repair" {Austin, TX} — a second usable case.
 *  - UNGROUNDED "Fence painting" {Austin, TX} — a number with NO citation
 *    (source_url null) → a MISS. Proves the evidence gate: a citation-less guess is
 *    never researched, it falls through to ai_estimate in Phase 108.
 */
import type {
  PriceResearchFixtures,
  FixtureCandidate,
} from '@/lib/estimate/price-research/adapters/fixture'
import { fixtureKey } from '@/lib/estimate/price-research/adapters/fixture'

const AUSTIN = { city: 'Austin', state: 'TX' }

const COUCH_CLEANING_8_SEATS: FixtureCandidate = {
  unit_price: 180,
  currency: 'USD',
  source_url: 'https://example.test/austin-upholstery-cleaning',
  snippet:
    'Average upholstery/couch cleaning in Austin, TX runs $150-$220 for an 8-seat sectional.',
}

const DRYWALL_REPAIR: FixtureCandidate = {
  unit_price: 95,
  currency: 'USD',
  source_url: 'https://example.test/austin-drywall-repair',
  snippet:
    'Typical drywall repair in the Austin, TX area averages $80-$120 per patch including materials.',
}

// UNGROUNDED: a plausible number with NO citation. Present in the map but a MISS —
// the evidence gate (isUsableCandidate) rejects it.
const FENCE_PAINTING_UNGROUNDED: FixtureCandidate = {
  unit_price: 140,
  currency: 'USD',
  source_url: null,
  snippet: null,
}

export const PRICE_RESEARCH_FIXTURES: PriceResearchFixtures = {
  [fixtureKey('Couch cleaning 8 seats', AUSTIN)]: COUCH_CLEANING_8_SEATS,
  [fixtureKey('Drywall repair', AUSTIN)]: DRYWALL_REPAIR,
  [fixtureKey('Fence painting', AUSTIN)]: FENCE_PAINTING_UNGROUNDED,
}
