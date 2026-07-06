---
phase: quick-260705-0ha
verified: 2026-07-05T00:55:00Z
status: passed
score: 6/6 must-haves verified
re_verification: null
gaps: []
human_verification:
  - test: "Trigger a real generation whose server-vs-AI grand diverges >15% (or a degraded price-research provider run) in a Sentry-wired environment"
    expected: "A level:'warning' Sentry event '[estimate-quality] discrepancy/research anomaly' appears with tags company_id / estimate_id / delta_pct_bucket and the full signal in extra, alongside the preserved console.info('[totals_discrepancy]', …) line"
    why_human: "Requires a live Sentry sink + a real generation run; the reporter and its trigger are unit-verified but the end-to-end delivery to the Sentry dashboard cannot be asserted programmatically here"
---

# Phase quick-260705-0ha: Production-Harden Estimate Pipeline Verification Report

**Phase Goal:** (WI-1) estimate-quality observability — a >15% server-vs-AI discrepancy OR a low price-research hit-rate raises a Sentry warning in addition to the preserved console.info line, with optional ResearchOutcome telemetry threaded through; (WI-2) compute-totals defensive guards — negative/non-finite tax rate coerced to 0, balanceDue floored at 0 — all byte-identity-preserving.
**Verified:** 2026-07-05T00:55:00Z
**Status:** passed
**Re-verification:** No — initial verification (no prior VERIFICATION.md existed)

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | A discrepancy >15% (or low research hit-rate) raises a Sentry warning in prod, not just a console line | ✓ VERIFIED | `quality-signal.ts:158-168` — `Sentry.captureMessage(..., { level: 'warning', tags: {...}, extra: {...} })` fires only inside `if (signal.discrepancyExceedsThreshold || signal.researchHitRateLow)`. Threshold derivation `|delta_pct| >= 15` (`:88-90`); hit-rate `providerUsable/candidates < 0.2` with min-sample floor (`:92-95`). Test coverage: `quality-signal.test.ts:211-240` |
| 2 | The `console.info('[totals_discrepancy]', discrepancy)` line still fires with the SAME object shape | ✓ VERIFIED | `quality-signal.ts:155` emits `console.info('[totals_discrepancy]', discrepancy)` — same tag, same `TotalsDiscrepancy` object. Diff `66798702` shows the original bare line was REMOVED from `generate-estimate.ts:389` and the SAME `discrepancy` object is passed through (`qualityDiscrepancy = discrepancy` @ `generate-estimate.ts:407`). Emitted FIRST inside the try so a Sentry failure cannot skip it. Test: `quality-signal.test.ts:202-209, 262` asserts `toHaveBeenCalledWith('[totals_discrepancy]', disc)` |
| 3 | Price-research orchestrator surfaces attempted-vs-usable telemetry without breaking any caller | ✓ VERIFIED | `orchestrator.ts:94` — `telemetry?` is OPTIONAL on `ResearchOutcome`. Counters `cacheHits` (`:221`), `providerUsable` (`:240, :357`, `!retag.has(m)` guards double-count), `candidates` (true pre-cap demand `:399`), `missed` floored (`:402`). Returned on main success (`:404`) + no-candidates short-circuit (`:174`); OMITTED on never-throw catch (`:408`) — optional keeps 18 orchestrator tests byte-safe |
| 4 | A negative or non-finite tax rate computes 0 tax instead of a negative tax | ✓ VERIFIED | `compute-totals.ts:94` `safeTaxRate = Number.isFinite(taxRate) && taxRate >= 0 ? taxRate : 0`, used in flat path (`:141`) and per-category final fallback (`:169`). Per-category resolved rate also coerced via `safeRate` (`:172, :178`). Tests: `compute-totals-guards.test.ts:12-52` (negative/NaN/Infinity flat + negative category rate + negative default_rate) |
| 5 | A deposit exceeding the grand total yields balanceDue 0 in the engine, never a negative | ✓ VERIFIED | `compute-totals.ts:199` `const balanceDue = Math.max(0, Math.round((grandTotal - deposit) * 100) / 100)`. Test: `compute-totals-guards.test.ts:54-64` (deposit 1500 on grandTotal 1100 → balanceDue 0). Updated golden: `deposit-totals.test.ts` Test 4 (-400 → 0) |
| 6 | Every currently-passing estimate-engine test remains byte-identical (guards are no-ops on valid inputs) | ✓ VERIFIED | Guards are pure conditionals: valid finite `>=0` rate ⇒ `safeTaxRate === taxRate` (no-op); valid deposit `<= grandTotal` ⇒ `Math.max(0, …)` no-op. Legitimate `labor: 0` rate passes (`0 >= 0` true). Byte-identical regression: `compute-totals-guards.test.ts:78-86`. Only diff to a prior test is `deposit-totals.test.ts` Test 4 (2 lines, confirmed via `git show 11453928`); Tests 1-3 unchanged |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/estimate/quality/quality-signal.ts` | pure `buildEstimateQualitySignal` + never-throw `reportEstimateQuality`, min 60 lines | ✓ VERIFIED | 173 lines. Exports `EstimateQualitySignal`, `QualityThresholds`, `ResearchTelemetry`, `DEFAULT_QUALITY_THRESHOLDS`, pure `buildEstimateQualitySignal` (env-free), `resolveQualityThresholds` (only env read), never-throw `reportEstimateQuality` (whole body in try/catch, `:152-171`) |
| `lib/estimate/price-research/orchestrator.ts` | `ResearchOutcome.telemetry` (optional) populated from counters; contains "telemetry" | ✓ VERIFIED | `telemetry?` field `:94`; populated `:398-404`; 6 occurrences of `telemetry`. Optional → additive, no caller broken |
| `lib/services/generate-estimate.ts` | `reportEstimateQuality` wiring replacing the bare console.info block; contains "reportEstimateQuality" | ✓ VERIFIED | Imports all 3 helpers (`:18-21`); captures `researchTelemetry` (`:336`); builds signal (`:410-413`); calls `reportEstimateQuality` after persistence with real `estimateId` (`:512-515`). Bare `console.info` block removed |
| `lib/estimate/compute-totals.ts` | defensive tax-rate coercion + balanceDue floor; contains "Number.isFinite" | ✓ VERIFIED | `Number.isFinite` guards at `:94` (safeTaxRate) and `:172` (safeRate); `Math.max(0, …)` balanceDue floor `:199` |
| `tests/unit/estimate/quality-signal.test.ts` | threshold/hit-rate/guardrail/never-throw coverage; contains "reportEstimateQuality" | ✓ VERIFIED | 264 lines, 20 cases: boundaries 14.9/15/15.1/-20/null, hit-rate low + min-sample floor + absent + healthy, moved_by_guardrails, env resolve, never-throw + always-console.info (self-declared `@sentry/nextjs` mock) |
| `tests/unit/estimate/compute-totals-guards.test.ts` | negative-tax→0, deposit>total→0, byte-identical regression; contains "computeEstimateTotals" | ✓ VERIFIED | 87 lines, 7 cases covering all `<behavior>` specs including the no-op regression proof |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `generate-estimate.ts` | `quality-signal.ts` | `buildEstimateQualitySignal` + `reportEstimateQuality` replacing the bare console.info block | ✓ WIRED | Imported (`:18-21`), built (`:410`), called (`:512`); original bare line removed (diff `66798702`) |
| `quality-signal.ts` | `@sentry/nextjs` | `Sentry.captureMessage` on anomaly, wrapped in try/catch | ✓ WIRED | `import * as Sentry` (`:1`); `captureMessage` (`:159`) inside the anomaly branch, whole body in try/catch (`:152-171`) |
| `generate-estimate.ts` | `orchestrator.ts` | `research.telemetry` threaded into the quality signal (graceful fallback if absent) | ✓ WIRED | `researchTelemetry = research.telemetry` (`:336`); passed to `buildEstimateQualitySignal({ research: researchTelemetry })` (`:411`); `undefined` on research-failure catch (`:337-340`) → "no data ⇒ no alarm" |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `quality-signal.ts` (`researchHitRateLow`) | `research.providerUsable / research.candidates` | Orchestrator live counters (`cacheHits++`, `providerUsable++` on real re-tags; `candidates.length` true demand) → `research.telemetry` → `researchTelemetry` var → signal input | ✓ FLOWING | Counters are computed from the actual re-tag loop, not hardcoded; disjoint cache/miss sets + `!retag.has(m)` guard prevent double-count. No static `[]`/`{}` fallback in the flow |
| `quality-signal.ts` (`discrepancyExceedsThreshold`) | `discrepancy.delta_pct` | `computeTotalsDiscrepancy({ serverGrand, aiGrand, anchoredCount, clampedCount })` (`generate-estimate.ts:401`) | ✓ FLOWING | Fed by the live server recalculation + AI-implied grand; same object emitted to console.info |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Full gate (tsc + tests) | (pre-confirmed by requester) | tsc `--noEmit` clean; estimate + generate-estimate + eval = 272 passed; full suite 2806 passed (1 pre-existing unrelated billing flake) | ✓ PASS |

Note: per requester instruction, tests were not re-run — the gate was independently confirmed. Verification focused on whether the CODE fulfills the must-haves' intent.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| HARDEN-OBS-01 | 260705-0ha-PLAN | Estimate-quality observability (Sentry warning on discrepancy/low-hit-rate + preserved console.info + optional telemetry) | ✓ SATISFIED | Truths 1-3, all WI-1 artifacts + key links verified |
| HARDEN-GUARD-01 | 260705-0ha-PLAN | compute-totals defensive guards (negative/non-finite tax → 0, balanceDue floored at 0), byte-identity-preserving | ✓ SATISFIED | Truths 4-6, both WI-2 artifacts verified |

Note: HARDEN-OBS-01 / HARDEN-GUARD-01 are quick-task-scoped requirement IDs declared in the PLAN frontmatter; they are not (and are not expected to be) in `.planning/REQUIREMENTS.md`. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None | — | No TODO/FIXME/placeholder, no unwired empty returns, no hollow props. The `catch {}` blocks in `reportEstimateQuality` and the orchestrator are the INTENDED never-throw discipline (mirrors `captureBackgroundError`), not stubs. `telemetry` omitted on catch paths is intentional (field is optional). |

### Human Verification Required

**1. Live Sentry anomaly delivery**

- **Test:** Trigger a real generation whose server-vs-AI grand diverges >15% (or run a degraded price-research provider) in a Sentry-wired environment.
- **Expected:** A `level:'warning'` Sentry event `[estimate-quality] discrepancy/research anomaly` appears with tags `company_id` / `estimate_id` / `delta_pct_bucket` and the full signal in `extra`, alongside the preserved `console.info('[totals_discrepancy]', …)` line.
- **Why human:** Requires a live Sentry sink + a real generation run. The reporter, its trigger condition, and never-throw behavior are all unit-verified; only the end-to-end dashboard delivery is beyond programmatic reach.

This item does not block goal achievement — the code path is fully verified; only the external-service delivery needs an eyeball.

### Gaps Summary

No gaps. All six observable truths are VERIFIED against the actual code (not merely against SUMMARY claims):

- **WI-1** — The `console.info('[totals_discrepancy]', discrepancy)` line was migrated byte-identically into `reportEstimateQuality` (verified the original bare line was removed from `generate-estimate.ts` and the SAME object flows through). The Sentry warning fires only on `discrepancyExceedsThreshold || researchHitRateLow` at `level:'warning'`, wrapped in a whole-body try/catch (never-throw). `ResearchOutcome.telemetry` is optional and populated from genuine orchestrator counters, threaded into the signal with a graceful `undefined` fallback on research failure.
- **WI-2** — The tax-rate coercion (`safeTaxRate` in both the flat path and the per-category final fallback; `safeRate` for the resolved per-category rate) and the `Math.max(0, …)` balanceDue floor are strict no-ops on valid input; the legitimate `labor: 0` rate still passes (`0 >= 0`). Only the single `deposit-totals.test.ts` Test 4 assertion changed (-400 → 0), confirmed via `git show` — no other estimate-engine test contract was altered.

Constraints all honored: no `components/workspace/send/*` files touched, no DB migration, no persistence-loop change, no secrets. The 7 files touched match the plan's `files_modified` exactly.

---

_Verified: 2026-07-05T00:55:00Z_
_Verifier: Claude (gsd-verifier)_
