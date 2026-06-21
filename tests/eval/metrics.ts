/**
 * tests/eval/metrics.ts
 *
 * EVAL-03 — quality-metrics suite. REUSES the production quality primitives so
 * "regression" means the SAME thing in tests and prod:
 *   - schema validity  → lib/ai/schema.ts estimateOutputSchema (GUARD-01)
 *   - vagueness verdict → lib/estimate/quality/vagueness.ts isVagueEstimate (Phase 96)
 *
 * Lives in tests/ (NOT lib/) so production code can NEVER import it — it must
 * stay out of the generation hot path (Pitfall 8). It still reuses the prod
 * primitives, which is what makes the metrics authoritative.
 *
 * Helper module (NOT a *.test.ts) — never collected as a suite.
 */
import { estimateOutputSchema } from '@/lib/ai/schema'
import { isVagueEstimate } from '@/lib/estimate/quality/vagueness'

export interface MetricResult {
  schemaValid: boolean
  lineItemCount: number
  grandTotal: number
  isVague: boolean
}

/**
 * Schema-validity metric: the AUTHORITATIVE gate — the SAME zod schema the
 * GUARD-01 boundary uses (`normalizeOutput` wraps this `.safeParse`). Asserting
 * it against the raw fixture JSON catches a fixture that drifts AND documents the
 * provider contract.
 */
export function scoreProviderResponse(raw: Record<string, unknown>): {
  schemaValid: boolean
} {
  return { schemaValid: estimateOutputSchema.safeParse(raw).success }
}

/**
 * Persisted-estimate metric: line-item count + server grand total + vagueness.
 * `total` and the item rows are the POST-guardrail authoritative values (server
 * recalculation, anchoring/totals math), so a regression in those shows up here.
 * `isVague` reuses the production assess-node gate verbatim.
 */
export function scorePersistedEstimate(est: {
  total: number | null
  sections: Array<{ items?: unknown[] | null }> | null
}): MetricResult {
  const lineItemCount = (est.sections ?? []).reduce(
    (n, s) => n + (s.items?.length ?? 0),
    0
  )
  return {
    schemaValid: true, // n/a here; the provider-response variant covers schema
    lineItemCount,
    grandTotal: est.total ?? 0,
    isVague: isVagueEstimate(est as never),
  }
}
