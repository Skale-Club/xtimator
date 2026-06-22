---
phase: 103-eval-harness-ci-gate
verified: 2026-06-21T20:05:00Z
status: passed
score: 5/5 must-haves verified
re_verification: null
gaps: []
human_verification:
  - test: "Open a throwaway PR that breaks a metric (flip an `expected` threshold in tests/eval/fixtures/cases.ts) and confirm the GitHub Actions 'Test' check goes red"
    expected: "The Test workflow fails the build on the regression"
    why_human: "Requires the workflow to be on the default branch / a live PR; cannot be exercised from a local executor. Deferred, non-blocking UAT per 103-VALIDATION."
---

# Phase 103: Eval Harness + CI Gate Verification Report

**Phase Goal:** Prove the hardened, unified estimate engine stays good — golden multimodal fixtures + deterministic mocked providers + a quality-metrics suite + a CI gate that fails on regression, predicated on first fixing the flaky cross-file test-isolation leak. EVAL-01..04 + the test-isolation remediation prerequisite.
**Verified:** 2026-06-21T20:05:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Prereq: full `npx vitest run` is deterministic-green with stable counts, with NO production source changed by this phase | ✓ VERIFIED | Ran the full suite 3× back-to-back, all GREEN and IDENTICAL: `Test Files 250 passed \| 3 skipped (253)` / `Tests 1732 passed \| 2 skipped \| 33 todo (1767)`. `git diff --name-only` over the 7 actual phase-103 commits (eb0a4cd2, b8b0020e, 6b7fffc7, efc32d1f, 3b9a0bcd, b0a6df1f, 61b1cd3e) touches ZERO files in lib/app/components/hooks. (The 3 production files in the commit-range window — app/globals.css, sidebar.tsx, settings-layout-client.tsx — belong to an unrelated interleaved `fix(ui)` commit c05cc34e, not any 103 plan.) |
| 2 | EVAL-01: 6 typed golden multimodal fixtures, deterministic, no network | ✓ VERIFIED | tests/eval/fixtures/{types,cases}.ts exist; CASES has exactly 6 entries with the 6 canonical ids (audio-deck-rebuild, photo-roof-repair, text-fence-paint, mixed-kitchen-reno, vague-do-some-work, schema-drift-guard) covering 3 modalities + mixed + vague + schema-drift. Synthetic data only; load.test.ts asserts `CASES.toHaveLength(6)`. |
| 3 | EVAL-02: deterministic mocked providers drive the REAL engine; generateEstimateForProject NOT mocked | ✓ VERIFIED | harness.test.ts mocks `@/lib/ai/provider-with-fallback` (getAIProviderWithFallback) + `@/lib/ai/openrouter-client` (transcribeAudioOR/analyzePhotoOR) + supabase service + next/cache. `grep -c "vi.mock.*generateEstimateForProject"` = 0 (NOT mocked). The runner composes the REAL `buildEstimateGraph(makeDefaultAdapter(...))` and invokes it per case — full-graph path. |
| 4 | EVAL-03: quality-metrics suite reuses isVagueEstimate + estimateOutputSchema + total>0 + min item count; lives in tests/ not lib/ | ✓ VERIFIED | tests/eval/metrics.ts imports `estimateOutputSchema` from @/lib/ai/schema and `isVagueEstimate` from @/lib/estimate/quality/vagueness; scores schemaValid, lineItemCount, grandTotal, isVague. File is under tests/eval/, NOT lib/ (no lib/eval dir). |
| 5 | EVAL-04: scoped tsc green + secret-free CI gate (excludes integration, runs scoped tsc + vitest twice, no deploy/next-build/GHCR), .nvmrc node 24, test:eval script | ✓ VERIFIED | `npx tsc --noEmit -p tsconfig.ci.json` exits 0 (GREEN). .github/workflows/test.yml: triggers push[main,dev]+PR+dispatch, runs `tsc -p tsconfig.ci.json` + `vitest run tests/unit tests/eval` TWICE (determinism gate), no secret refs, no deploy/docker/ghcr/coolify run steps, build-deploy.yml untouched. .nvmrc = `24`. package.json has `"test:eval": "vitest run tests/eval"`. |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `tests/eval/fixtures/types.ts` | EvalCase interface | ✓ VERIFIED | `export interface EvalCase` with id/modality/inputs/providerResponse/expected. |
| `tests/eval/fixtures/cases.ts` | 6 golden cases | ✓ VERIFIED | `export const CASES: EvalCase[]` — 6 entries, correct ids + thresholds. |
| `tests/eval/metrics.ts` | reuse prod primitives, in tests/ | ✓ VERIFIED | imports estimateOutputSchema + isVagueEstimate; scoreProviderResponse + scorePersistedEstimate. |
| `tests/eval/mock-providers.ts` | provider-seam mocks | ✓ VERIFIED | makeMockProvider (AIProvider) + mockTranscribeAudioOR/mockAnalyzePhotoOR, keyed by active case. |
| `tests/eval/harness.test.ts` | full-graph per-case + aggregate | ✓ VERIFIED | 396 lines; full-graph runner, describe.each per case, schema metric for all 6, aggregate fails on any regression. |
| `tests/eval/fixtures/load.test.ts` | fixture/metrics unit guards | ✓ VERIFIED | asserts 6 cases, unique ids, schema teeth, metric math. |
| `vitest.config.ts` | include extended w/ tests/eval | ✓ VERIFIED | `'tests/eval/**/*.test.ts'` added; 4 pre-existing entries intact. |
| `tsconfig.ci.json` | app/lib-scoped, excludes tests | ✓ VERIFIED | extends ./tsconfig.json; include app/lib/components/hooks+entrypoints; exclude tests/**. tsc -p exits 0. |
| `.nvmrc` | node 24 | ✓ VERIFIED | single line `24`. |
| `.github/workflows/test.yml` | secret-free CI gate | ✓ VERIFIED | scoped tsc + vitest×2, integration excluded, no deploy/secrets. |
| `package.json` | test:eval script | ✓ VERIFIED | `"test:eval": "vitest run tests/eval"`. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| vitest.config.ts include | tests/eval/*.test.ts | `tests/eval/**/*.test.ts` glob | ✓ WIRED | `vitest run tests/eval` → Test Files 2 passed / 20 tests (NOT a silent zero-test pass). |
| harness.test.ts | provider-with-fallback + openrouter-client | vi.mock at PROVIDER seam, NOT generateEstimateForProject | ✓ WIRED | both vi.mock present; generateEstimateForProject mock count = 0. |
| metrics.ts | schema.ts + vagueness.ts | direct import of estimateOutputSchema + isVagueEstimate | ✓ WIRED | both imports present; both exports exist in lib/. |
| test.yml | tsconfig.ci.json + suite | scoped tsc + vitest run tests/unit tests/eval ×2 | ✓ WIRED | tsc step present; suite run twice (grep count = 2). |
| test.yml | no live services | mocked providers + integration excluded | ✓ WIRED | no secret refs; no `run:` step targets tests/integration. |

### Data-Flow Trace (Level 4)

Eval harness produces no user-visible rendered data (it is a test suite). Data flows through the REAL graph: provider mock → generateEstimateForProject → normalize/schema/anchoring/totals → supabase capture → assess(isVagueEstimate) → scorePersistedEstimate. The capture-based supabase mock serves the assess node's nested re-read from actually-persisted shape, so isVagueEstimate runs on real persisted data. ✓ FLOWING (verified by the green per-case + aggregate assertions running the real engine).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Full suite deterministic-green ×3 | `npx vitest run` (×3) | 250 files / 1732 passed, identical all 3 | ✓ PASS |
| Eval suite collects (gate has teeth) | `npx vitest run tests/eval` | Test Files 2 / 20 tests passed | ✓ PASS |
| Scoped CI typecheck green | `npx tsc --noEmit -p tsconfig.ci.json` | exit 0 | ✓ PASS |
| Red-PR fails CI | open PR breaking a metric | not run locally | ? SKIP (human — needs live PR) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- | --- |
| EVAL-01 | 103-02 | Golden-fixture dataset for audio/photo/text, no live AI | ✓ SATISFIED | 6 typed fixtures, deterministic, no network (truth 2). REQUIREMENTS.md marks [x] / Complete. |
| EVAL-02 | 103-02 | Deterministic mocked providers; full engine runs in tests | ✓ SATISFIED | provider-seam mocks drive real graph; generateEstimateForProject real (truth 3). [x] / Complete. |
| EVAL-03 | 103-02 | Quality-metrics suite (total, item count, vagueness, zod) w/ thresholds | ✓ SATISFIED | metrics.ts reuses prod primitives; per-case + aggregate assertions (truth 4). [x] / Complete. |
| EVAL-04 | 103-03 | CI regression gate fails build on metric/schema regression | ✓ SATISFIED | secret-free test.yml, scoped tsc + suite ×2 (truth 5). [x] / Complete. |

No orphaned requirements: all four EVAL-* appear in plan frontmatter (EVAL-01/02/03 in 103-02, EVAL-04 in 103-03) and in REQUIREMENTS.md traceability mapped to Phase 103.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none) | — | — | — | No stubs, TODOs, placeholders, or hollow returns in the eval/CI scaffolding. The "empty book" `data: []` and `sections: []` (vague case) are intentional fixture/mock data, not stubs. |

### Human Verification Required

1. **Red-PR CI confirmation** — Open a throwaway PR that breaks a metric (flip an `expected` threshold in `tests/eval/fixtures/cases.ts`) and confirm the GitHub Actions "Test" check goes red.
   - Expected: The Test workflow fails the build on the regression.
   - Why human: Requires the workflow on the default branch / a live PR; cannot be exercised from a local executor. Deferred, non-blocking UAT per 103-VALIDATION and noted in 103-03-SUMMARY.

### Gaps Summary

No gaps. All 5 must-haves verified against the actual codebase:
- The isolation prerequisite is real: the full suite is deterministic-green across 3 consecutive identical runs, and NO production source was changed by any of the 7 phase-103 commits (the fix is test-only per-file `vi.setConfig` timeouts + Class-A stale-test repairs).
- EVAL-01..03 (the eval harness) are substantive and wired: 6 typed golden fixtures drive the REAL full graph through deterministic provider-seam mocks (generateEstimateForProject NOT mocked), scored by a metrics module that reuses the production estimateOutputSchema + isVagueEstimate primitives and lives in tests/ not lib/. The vitest include fix makes the suite genuinely collect (2 files / 20 tests).
- EVAL-04 (the CI gate) is real and secret-free: scoped tsconfig.ci.json is GREEN, test.yml runs scoped tsc + the unit/eval suite twice on push/PR with no deploy step, no secrets, integration excluded, .nvmrc pins node 24, and test:eval is wired.

The single open item is a deferred, non-blocking manual UAT (confirm a red PR turns the Actions check red), which by nature cannot be exercised from a local executor. It does not block phase goal achievement.

---

_Verified: 2026-06-21T20:05:00Z_
_Verifier: Claude (gsd-verifier)_
