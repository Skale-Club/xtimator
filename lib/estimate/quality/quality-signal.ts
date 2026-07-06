import * as Sentry from '@sentry/nextjs'
import type { TotalsDiscrepancy } from '@/lib/estimate/totals'

/**
 * lib/estimate/quality/quality-signal.ts
 *
 * WI-1 (HARDEN-OBS-01) — make estimate-quality signals OBSERVABLE in production.
 *
 * A 100-estimate / 10-tenant batch surfaced two silent blind spots:
 *   1. 3/100 estimates had a >20% (max 45.3%) server-vs-AI correction visible ONLY in
 *      console.info('[totals_discrepancy]', …) — no alert, no aggregation.
 *   2. A 97% research evidence-gate rejection rate with no attempted-vs-usable telemetry:
 *      a degraded provider is undetectable.
 *
 * This module is ADDITIVE and does NOT touch any computed total. It is two pieces:
 *   - a PURE `buildEstimateQualitySignal(input, thresholds)` derivation (env-free, testable);
 *   - a NEVER-THROW `reportEstimateQuality(discrepancy, signal, ctx)` side-effecter that
 *     ALWAYS emits the byte-identical `console.info('[totals_discrepancy]', discrepancy)`
 *     line (tests/eval + ops depend on it) and, on an anomaly, raises a Sentry warning.
 *
 * The Sentry reporter mirrors `captureBackgroundError` (lib/observability/capture.ts):
 * the whole body is wrapped in try/catch so a broken Sentry call can never break generation.
 */

/** Optional attempted-vs-usable research telemetry surfaced by the orchestrator. */
export interface ResearchTelemetry {
  candidates: number
  cacheHits: number
  providerUsable: number
  missed: number
}

/**
 * The consolidated per-estimate quality signal. Carries the raw discrepancy fields plus
 * two derived booleans (`discrepancyExceedsThreshold`, `researchHitRateLow`) that drive
 * the anomaly alert. `research` is optional — absent research means "no data ⇒ no alarm".
 */
export interface EstimateQualitySignal {
  delta: number
  delta_pct: number | null
  anchored_count: number
  clamped_count: number
  moved_by_guardrails: boolean
  research?: ResearchTelemetry
  flagged_unpriced: number
  discrepancyExceedsThreshold: boolean
  researchHitRateLow: boolean
}

/** Thresholds passed IN to keep `buildEstimateQualitySignal` pure (env is read at the boundary). */
export interface QualityThresholds {
  /** Absolute |delta_pct| at or above which the discrepancy is anomalous (default 15). */
  discrepancyWarnPct: number
  /** Minimum research candidate count before a low hit-rate can alarm (no small-sample noise). */
  researchMinCandidates: number
  /** providerUsable/candidates ratio below which the research hit-rate is "low". */
  researchLowHitRate: number
}

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  discrepancyWarnPct: 15,
  researchMinCandidates: 5,
  researchLowHitRate: 0.2,
}

/**
 * PURE quality-signal derivation. Reads NO env (thresholds are a parameter) so it is
 * trivially testable and cannot change behaviour by environment.
 *
 * Derivation rules:
 *   - discrepancyExceedsThreshold = delta_pct != null && |delta_pct| >= discrepancyWarnPct.
 *     A null delta_pct (aiGrand === 0, divide-by-zero-guarded upstream) NEVER flags.
 *   - researchHitRateLow = research present && candidates >= researchMinCandidates &&
 *     (providerUsable / candidates) < researchLowHitRate. Absent research or a below-min
 *     candidate count NEVER flags (no small-sample false alarms).
 *   - moved_by_guardrails is carried straight through (already computed upstream).
 */
export function buildEstimateQualitySignal(
  input: {
    discrepancy: TotalsDiscrepancy
    flaggedUnpriced: number
    research?: ResearchTelemetry
  },
  thresholds: QualityThresholds
): EstimateQualitySignal {
  const { discrepancy, flaggedUnpriced, research } = input

  const discrepancyExceedsThreshold =
    discrepancy.delta_pct != null &&
    Math.abs(discrepancy.delta_pct) >= thresholds.discrepancyWarnPct

  const researchHitRateLow =
    research != null &&
    research.candidates >= thresholds.researchMinCandidates &&
    research.providerUsable / research.candidates < thresholds.researchLowHitRate

  return {
    delta: discrepancy.delta,
    delta_pct: discrepancy.delta_pct,
    anchored_count: discrepancy.anchored_count,
    clamped_count: discrepancy.clamped_count,
    moved_by_guardrails: discrepancy.moved_by_guardrails,
    research,
    flagged_unpriced: flaggedUnpriced,
    discrepancyExceedsThreshold,
    researchHitRateLow,
  }
}

/**
 * Thin env read at the call boundary — the ONLY env access in this module. Reads
 * `ESTIMATE_DISCREPANCY_WARN_PCT` (finite && >0 ⇒ use it, else default 15); the other two
 * thresholds stay at their defaults. Keeping the read here (not in the pure fn) preserves
 * testability and the "thresholds passed in" constraint.
 */
export function resolveQualityThresholds(): QualityThresholds {
  const raw = Number(process.env.ESTIMATE_DISCREPANCY_WARN_PCT)
  const discrepancyWarnPct =
    Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_QUALITY_THRESHOLDS.discrepancyWarnPct
  return { ...DEFAULT_QUALITY_THRESHOLDS, discrepancyWarnPct }
}

/**
 * Bucket delta_pct into a LOW-CARDINALITY tag value so the Sentry tag never explodes
 * cardinality (a raw percentage would be unbounded). null (aiGrand 0) → 'na'.
 */
function bucketDeltaPct(pct: number | null): string {
  if (pct == null) return 'na'
  const abs = Math.abs(pct)
  if (abs < 15) return '<15'
  if (abs < 30) return '15-30'
  if (abs < 50) return '30-50'
  return '>50'
}

/**
 * NEVER-THROW side-effecter. Mirrors `captureBackgroundError`: the whole body is wrapped
 * in try/catch so a reporting failure can never break estimate generation.
 *
 *   (a) ALWAYS emit the byte-identical `console.info('[totals_discrepancy]', discrepancy)`
 *       line FIRST (same tag string, same object) — tests/eval + ops depend on it.
 *   (b) THEN, on an anomaly (discrepancyExceedsThreshold || researchHitRateLow), raise a
 *       Sentry warning with low-cardinality tags and the full signal in `extra`.
 *
 * The outer catch swallows everything — reporting must never crash generation.
 */
export function reportEstimateQuality(
  discrepancy: TotalsDiscrepancy,
  signal: EstimateQualitySignal,
  ctx: { companyId: string; estimateId?: string | null }
): void {
  try {
    // (a) Byte-identical structured log — SAME tag, SAME object as the original
    // generate-estimate.ts line. Emitted FIRST so a later Sentry failure cannot skip it.
    console.info('[totals_discrepancy]', discrepancy)

    // (b) Anomaly → Sentry warning (in addition to the log above, never a replacement).
    if (signal.discrepancyExceedsThreshold || signal.researchHitRateLow) {
      Sentry.captureMessage('[estimate-quality] discrepancy/research anomaly', {
        level: 'warning',
        tags: {
          company_id: ctx.companyId,
          estimate_id: ctx.estimateId ?? 'unknown',
          delta_pct_bucket: bucketDeltaPct(signal.delta_pct),
        },
        extra: { ...signal },
      })
    }
  } catch {
    // Reporting must never crash generation (mirror captureBackgroundError).
  }
}
