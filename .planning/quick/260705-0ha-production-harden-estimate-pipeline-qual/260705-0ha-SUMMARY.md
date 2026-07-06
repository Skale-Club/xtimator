---
phase: quick-260705-0ha
plan: 01
subsystem: estimate-engine
tags: [observability, sentry, price-research, compute-totals, hardening]
requires:
  - lib/estimate/totals.ts (TotalsDiscrepancy type)
  - lib/observability/capture.ts (never-throw Sentry discipline)
  - '@sentry/nextjs (already wired)'
provides:
  - EstimateQualitySignal type + pure buildEstimateQualitySignal + never-throw reportEstimateQuality
  - ResearchOutcome.telemetry (optional attempted-vs-usable research counters)
  - defensive tax-rate coercion + balanceDue floor in computeEstimateTotals
affects:
  - lib/services/generate-estimate.ts (quality-signal wiring, replaces bare console.info block)
tech-stack:
  added: []
  patterns:
    - never-throw side-effecter wrapped in try/catch (mirrors captureBackgroundError)
    - pure derivation + thin env boundary (thresholds passed in, not read in the pure fn)
    - low-cardinality Sentry tag bucketing (delta_pct_bucket)
    - additive optional field on a returned outcome (byte-safe for existing callers)
    - Math.max(0, …) / Number.isFinite(…) ? … : 0 no-op guards
key-files:
  created:
    - lib/estimate/quality/quality-signal.ts
    - tests/unit/estimate/quality-signal.test.ts
    - tests/unit/estimate/compute-totals-guards.test.ts
  modified:
    - lib/estimate/price-research/orchestrator.ts
    - lib/services/generate-estimate.ts
    - lib/estimate/compute-totals.ts
    - tests/unit/estimate/deposit-totals.test.ts
decisions:
  - "reportEstimateQuality call deferred to after persistence (option ii) so the Sentry tag carries the real estimate_id — no test asserts console.info ordering and the eval harness does not read the tag string"
  - "skipped the optional negative depositValue/discountValue coercion (WI-2 sub-step 3) per the plan's prefer-to-skip-if-unsure guidance; the two required guards are the deliverable"
metrics:
  duration: ~11m
  completed: 2026-07-05
  tasks: 2
  files: 7
requirements:
  - HARDEN-OBS-01
  - HARDEN-GUARD-01
---

# Phase quick-260705-0ha Plan 01: Production-Harden Estimate Pipeline Summary

Made estimate-quality signals (server-vs-AI discrepancy, guardrail moves, price-research
attempted-vs-usable telemetry, flagged-unpriced count) OBSERVABLE via a new pure
quality-signal module + a never-throw Sentry reporter, and hardened `computeEstimateTotals`
against a malformed tax rate and an over-total deposit — all strictly byte-identity-preserving.

## What Was Built

### WI-1 — Estimate-quality observability (HARDEN-OBS-01)

- **New `lib/estimate/quality/quality-signal.ts`** (pure + never-throw):
  - `EstimateQualitySignal` / `QualityThresholds` / `ResearchTelemetry` types.
  - PURE `buildEstimateQualitySignal(input, thresholds)` deriving `discrepancyExceedsThreshold`
    (`delta_pct != null && |delta_pct| >= discrepancyWarnPct`; a null delta_pct never flags) and
    `researchHitRateLow` (`candidates >= researchMinCandidates && providerUsable/candidates <
    researchLowHitRate`; absent research or below-min-sample never flags). Reads NO env.
  - `DEFAULT_QUALITY_THRESHOLDS = { 15, 5, 0.2 }` and a thin `resolveQualityThresholds()` that
    reads only `ESTIMATE_DISCREPANCY_WARN_PCT` (finite && >0 ⇒ use it, else default 15).
  - NEVER-THROW `reportEstimateQuality(discrepancy, signal, ctx)`: whole body wrapped in
    try/catch (mirrors `captureBackgroundError`). ALWAYS emits the byte-identical
    `console.info('[totals_discrepancy]', discrepancy)` line FIRST; then, on an anomaly, calls
    `Sentry.captureMessage(..., { level: 'warning', tags: { company_id, estimate_id,
    delta_pct_bucket }, extra: { ...signal } })`. `delta_pct_bucket` (na / <15 / 15-30 / 30-50 /
    >50) keeps the tag low-cardinality.
- **`lib/estimate/price-research/orchestrator.ts`**: added OPTIONAL `ResearchOutcome.telemetry`
  populated from counters — `candidates` (true pre-cap demand), `cacheHits` (free cache re-tags),
  `providerUsable` (evidence-gated memo/provider re-tags), `missed` (floored at 0). Returned on the
  main success path and the no-candidates short-circuit; omitted on the two never-throw catch
  returns (it is optional). All 18 orchestrator tests stay green.
- **`lib/services/generate-estimate.ts`**: captures `research.telemetry` into a `researchTelemetry`
  var (undefined on research failure → graceful "no alarm"); builds the signal via
  `buildEstimateQualitySignal(..., resolveQualityThresholds())`; and calls `reportEstimateQuality`
  just after `estimateId` is known so the Sentry tag carries the real estimate_id. The
  `console.info('[totals_discrepancy]', discrepancy)` line survives byte-identically (now inside
  `reportEstimateQuality`, same tag + same object).
- **New `tests/unit/estimate/quality-signal.test.ts`** (20 cases): threshold boundaries
  (14.9/15/15.1/-20/null), research low-hit-rate + min-sample floor + absent + healthy,
  moved_by_guardrails carry-through, env resolve, and the never-throw + always-console.info cases
  (with a self-declared `@sentry/nextjs` mock).

### WI-2 — compute-totals defensive guards (HARDEN-GUARD-01)

- **`lib/estimate/compute-totals.ts`**:
  - `safeTaxRate = Number.isFinite(taxRate) && taxRate >= 0 ? taxRate : 0` used in the flat path
    and as the per-category final fallback.
  - Per-category resolved rate coerced via `safeRate` (a negative category rate or negative
    `default_rate` contributes 0).
  - `balanceDue = Math.max(0, Math.round((grandTotal - deposit) * 100) / 100)` — a deposit
    exceeding the grand total now yields 0 in the engine, not a negative.
  - Used the file's existing `Math.round(x * 100) / 100` form throughout (NOT `round2`), per the
    byte-identity discipline in CLAUDE.md.
- **`tests/unit/estimate/deposit-totals.test.ts`** — Test 4 updated (the ONLY intentional test
  change): `balanceDue -400 → 0`, comment reworded to "floored at 0 (deposit exceeding total →
  balanceDue 0)". Tests 1-3 stay byte-identical.
- **New `tests/unit/estimate/compute-totals-guards.test.ts`** (7 cases): negative/NaN/Infinity
  tax rate → 0; negative category rate + negative default_rate → 0; deposit>total → balanceDue 0;
  valid deposit unchanged; and a byte-identical regression case proving the guards are no-ops on
  valid input.

## Deviations from Plan

None — plan executed exactly as written. The two documented judgment calls (defer
`reportEstimateQuality` to after persistence for a real estimate_id tag; skip the optional
negative depositValue/discountValue coercion) were both explicit options the plan offered, chosen
per its own guidance.

## Verification

**Inner loop** — `npx vitest run tests/unit/estimate tests/unit/services/generate-estimate.test.ts tests/eval`:
- 40 files, **272 passed**. All estimate-engine + generate-estimate + eval suites green.

**Full gate**:
- `npx tsc --noEmit -p tsconfig.ci.json`: **clean** (no errors).
- `npx vitest run tests/unit tests/eval`: **2806 passed**, 24 todo, 2 skipped, and **1
  pre-existing parallel-only timeout flake** — `tests/unit/company-action.test.ts` (a
  billing/company file, unrelated to the estimate engine) hit the 5000ms test timeout under
  whole-suite contention. Re-run in isolation it **passes 11/11 in 3.7s**, confirming it is the
  pre-known flake described in the constraints, not a regression from this change.

**Byte-identity invariants (eyeballed in the diff):**
- `console.info('[totals_discrepancy]', discrepancy)` fires with the SAME object (now inside
  `reportEstimateQuality`).
- `ResearchOutcome.telemetry` is optional; no orchestrator test changed (all 18 green).
- compute-totals guards are `Math.max(0, …)` / `Number.isFinite(…) ? … : 0` no-ops on valid input;
  only deposit-totals Test 4 assertion changed (-400 → 0).
- No `components/workspace/send/*` touched; no DB migration; no persistence-loop change.

## Commits

- `66798702` — feat(quick-260705-0ha): estimate-quality observability signal + Sentry anomaly alert
- `11453928` — fix(quick-260705-0ha): compute-totals guards — tax-rate coercion + balanceDue floor

## Known Stubs

None. No new stubs, placeholders, TODO/FIXME, or unwired data paths introduced.

## Self-Check: PASSED

- FOUND: lib/estimate/quality/quality-signal.ts
- FOUND: tests/unit/estimate/quality-signal.test.ts
- FOUND: tests/unit/estimate/compute-totals-guards.test.ts
- FOUND: .planning/quick/260705-0ha-production-harden-estimate-pipeline-qual/260705-0ha-SUMMARY.md
- FOUND commit: 66798702 (WI-1)
- FOUND commit: 11453928 (WI-2)
