/**
 * GUARD-03 — server-side totals authority + discrepancy signal (pure helpers, Plan 100-02).
 *
 * These formalize (do NOT rewrite) the existing server-derived totals math in
 * lib/services/generate-estimate.ts:248-269. The server number is the single
 * authoritative source; the AI's own arithmetic is never persisted. The discrepancy
 * helper records how far the server total diverged from the naive AI-implied total
 * (and whether guardrails moved it) for observability only.
 */

/**
 * Tolerance for the section/grand totals invariants (2-dp rounding noise).
 */
export const TOTALS_EPSILON = 0.01

/**
 * Round to 2 decimal places, defensively coercing NaN / non-finite / negative
 * values to 0 (never throws). This is the authoritative rounding used for persisted
 * totals — a defensive zero-out keeps the engine never-throw and the persisted
 * numbers finite & >= 0.
 */
export function round2(x: number): number {
  if (!Number.isFinite(x) || x < 0) return 0
  return Math.round(x * 100) / 100
}

/**
 * Defensive finite-positive guard for already-rounded persisted totals: coerce
 * NaN / non-finite / negative to 0, otherwise return the value unchanged. A no-op
 * on the happy path (valid totals must not shift — Pitfall 6).
 */
export function assertFinitePositive(x: number): number {
  return Number.isFinite(x) && x >= 0 ? x : 0
}

export interface TotalsDiscrepancy {
  ai_grand: number
  server_grand: number
  delta: number
  delta_pct: number | null
  anchored_count: number
  clamped_count: number
  moved_by_guardrails: boolean
}

/**
 * Compute the server-vs-AI totals discrepancy. `serverGrand` is the authoritative
 * server recalculation; `aiGrand` is the naive grand the AI's own (pre-anchor)
 * numbers imply. `delta_pct` is null when `aiGrand` is 0 (no divide-by-zero), and
 * `moved_by_guardrails` is true when anchoring or clamping changed any price.
 */
export function computeTotalsDiscrepancy({
  serverGrand,
  aiGrand,
  anchoredCount,
  clampedCount,
}: {
  serverGrand: number
  aiGrand: number
  anchoredCount: number
  clampedCount: number
}): TotalsDiscrepancy {
  const s = assertFinitePositive(serverGrand)
  const a = assertFinitePositive(aiGrand)
  const delta = round2(Math.abs(s - a)) * (s - a < 0 ? -1 : 1)
  return {
    ai_grand: a,
    server_grand: s,
    delta,
    delta_pct: a > 0 ? round2(Math.abs((s - a) / a) * 100) * (s - a < 0 ? -1 : 1) : null,
    anchored_count: anchoredCount,
    clamped_count: clampedCount,
    moved_by_guardrails: anchoredCount > 0 || clampedCount > 0,
  }
}
