/**
 * lib/knowledge/adapters/fixture.ts
 *
 * The KMOD-04 DETERMINISM SEAM. A deterministic, network-free KnowledgeProvider
 * keyed by the normalized question — the CI/eval injection point that mirrors the
 * price-research fixture (lib/estimate/price-research/adapters/fixture.ts). Drives
 * tests/CI with ZERO live network so the regression gate stays green (Pitfall 3 —
 * a flaky, network-dependent provider would silently break the gate).
 *
 * Guarantees:
 *  - PURE: retrieve reads a synchronous in-memory keyed map; embed returns a
 *    fixed stub vector. Same fixtures + same question produce byte-identical
 *    results — no network, no DB, no clock drift.
 *  - FIXED CLOCK: any time-dependent field reads `opts.now` (the injected clock,
 *    never the wall clock), so a future time-sensitive field cannot introduce
 *    non-determinism.
 *
 * NOT a `*.test.ts` and NOT wired into any production path — a CI/eval helper.
 * Channel-neutral (ENGINE-01): imports no channel package.
 */
import type { KnowledgeProvider, Passage, RetrieveCtx } from '../provider'

/** A keyed golden corpus: normalized-question -> the passages it should retrieve. */
export type KnowledgeFixtures = Record<string, Passage[]>

/** Fixed clock (ms) — reserved for any future time-dependent field; NEVER the wall clock. */
export const FIXTURE_FIXED_NOW = 1_700_000_000_000

/**
 * The single key derivation shared by the corpus and the lookup (case- and
 * whitespace-insensitive), so a fixture authored as "How do I…" matches a query
 * "how do I…". Built and read through this same helper — they can never drift.
 */
function normalizeQuestionKey(question: string): string {
  return question.trim().toLowerCase()
}

/**
 * Build a deterministic, network-free KnowledgeProvider over a golden corpus.
 * PURE: retrieve reads a synchronous keyed map; embed returns a fixed stub vector.
 * The KMOD-04 determinism seam — drives CI/eval with ZERO live network (Pitfall 3).
 * NOT a *.test.ts and NOT wired to production. Channel-neutral (ENGINE-01).
 *
 * `opts.now` is the injectable fixed clock (ms). It is captured here but, because
 * the current Passage carries no time field, it is not yet written into a result —
 * its purpose is to GUARANTEE that any future time-dependent field reads the
 * injected clock rather than the wall clock, preserving determinism.
 */
export function makeFixtureKnowledgeProvider(
  fixtures: KnowledgeFixtures,
  opts?: { now?: number }
): KnowledgeProvider {
  // Fixed clock — read from opts, NEVER the wall clock. Reserved for any future
  // time-dependent field so two lookups with the same `now` stay byte-identical.
  const now = opts?.now ?? FIXTURE_FIXED_NOW
  void now

  // Normalize corpus keys through the SAME helper the query uses, so the dataset
  // and the lookup can never drift on key derivation (single source of truth).
  const normalized: KnowledgeFixtures = {}
  for (const [q, passages] of Object.entries(fixtures)) {
    normalized[normalizeQuestionKey(q)] = passages
  }

  return {
    async embed(_text: string): Promise<number[]> {
      // Deterministic stub vector — retrieve uses the keyed map, not this vector.
      return new Array(1536).fill(0)
    },
    async retrieve(question: string, ctx: RetrieveCtx): Promise<Passage[]> {
      const hits = normalized[normalizeQuestionKey(question)] ?? []
      return hits.slice(0, ctx.k ?? 5)
    },
  }
}
