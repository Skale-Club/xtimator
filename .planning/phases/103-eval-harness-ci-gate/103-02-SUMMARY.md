---
phase: 103-eval-harness-ci-gate
plan: 02
subsystem: testing
tags: [vitest, eval-harness, golden-fixtures, mocked-providers, quality-metrics, langgraph, full-graph]

# Dependency graph
requires:
  - phase: 103-01
    provides: "deterministic-GREEN full unit suite (npx vitest run 3x green) + the per-file vi.setConfig timeout pattern for heavy-runtime-import test files"
  - phase: 100-output-guardrails
    provides: "estimateOutputSchema (GUARD-01) + anchoring/totals math the harness exercises through the real service"
  - phase: 96-intelligence-parity
    provides: "isVagueEstimate + the auto-refine cap=1 loop the vague case exercises"
provides:
  - "vitest `include` now covers tests/eval/**/*.test.ts (scoped to *.test.ts) — `vitest run tests/eval` reports Test Files >= 1 instead of a silent empty-pass; the EVAL-02/03/04 gate now has teeth"
  - "6 typed golden fixtures (audio/photo/text/mixed/vague/schema-drift), no network, gitleaks-safe"
  - "FULL-GRAPH eval harness: the real buildEstimateGraph + generateEstimateForProject + Phase-100 normalize/schema/anchoring/totals + isVagueEstimate run against deterministic mocked providers; per-case + aggregate threshold assertions"
  - "tests/eval/metrics.ts reuses estimateOutputSchema + isVagueEstimate (test/prod parity, lives in tests/ not lib/)"
affects: [103-03-ci-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Eval harness mocks ONLY the provider seam (getAIProviderWithFallback) + raw-ingestion seam (transcribeAudioOR/analyzePhotoOR) + supabase service + next/cache — never generateEstimateForProject — so the real engine + guardrails run (Pitfall 3)"
    - "Stateful chainable-Supabase mock with a per-case `capture` object: captures the persisted estimate header (subtotal/total) + section/item inserts, and serves the assess node's nested re-read from the capture so the REAL isVagueEstimate gate runs on actually-persisted shape"
    - "Eval files adopt the 103-01 isolation discipline: per-file vi.setConfig({testTimeout:30_000}) + afterEach clearAllMocks/resetModules + lazy `await import` of the graph inside the per-case runner"

key-files:
  created:
    - tests/eval/fixtures/types.ts
    - tests/eval/fixtures/cases.ts
    - tests/eval/fixtures/load.test.ts
    - tests/eval/metrics.ts
    - tests/eval/mock-providers.ts
    - tests/eval/harness.test.ts
    - .planning/phases/103-eval-harness-ci-gate/103-02-SUMMARY.md
  modified:
    - vitest.config.ts

key-decisions:
  - "HARNESS PATH = FULL-GRAPH (the preferred path, not the research-approved service-only fallback). We compose the real default-adapter graph and invoke it per case, so ingest → generate(generateEstimateForProject) → assess(isVagueEstimate) → finalize/autoRefine topology ALL runs. 103-03's verifier should know: the graph topology + Phase-100 guardrails are genuinely exercised, not bypassed."
  - "Metrics live in tests/eval/metrics.ts (NOT lib/) so production can never import them (Pitfall 8), while still REUSING estimateOutputSchema + isVagueEstimate so 'regression' means the same in tests and prod."
  - "schema-drift-guard is a metrics-UNIT case (asserts estimateOutputSchema.safeParse rejects unit_price:'ten'), NOT driven through the graph — it proves the schema metric has teeth without a full-graph run."
  - "Added afterEach(vi.resetModules()) per the plan's isolation acceptance criterion. SAFE here (unlike 103-01's @vite-ignore victims) because each case's `await import` + graph.invoke fully resolves within the test body, so resetModules never evicts a mid-flight dynamic import. Proven by the 3x full-suite green gate."

patterns-established:
  - "Golden-fixture eval harness: typed CASES[] + reused production metrics + provider-seam mocks driving the real graph, with a capture-based supabase mock for read-back scoring"

requirements-completed: [EVAL-01, EVAL-02, EVAL-03]

# Metrics
duration: ~12min
completed: 2026-06-21
---

# Phase 103 Plan 02: Eval Harness (Golden Fixtures + Mocked Providers + Quality Metrics) Summary

**Built a FULL-GRAPH eval harness: 6 typed golden multimodal fixtures (EVAL-01) drive the REAL canonical estimate graph against deterministic provider-seam mocks (EVAL-02), scored by a metrics module that reuses the production estimateOutputSchema + isVagueEstimate primitives (EVAL-03) — and extended vitest's `include` so the eval suite genuinely runs (Test Files >= 1), the load-bearing fix that gives the CI gate teeth. Full `npx vitest run` stays deterministic-GREEN 3x (250 files / 1732 passed) — the eval files did not reintroduce the leak.**

## Performance

- **Duration:** ~12 min (dominated by the 3x full-suite determinism gate, ~83s/run)
- **Completed:** 2026-06-21
- **Tasks:** 2 (atomic commits)
- **Files:** 6 created + 1 modified (vitest.config.ts)

## The load-bearing include fix (gate teeth)

`vitest.config.ts` `include` previously listed ONLY `tests/unit/**` + `tests/integration/**`. A `vitest run tests/eval` path arg FILTERS against `include` (it does NOT override it), so without an eval entry every eval command silently found "No test files found", exited 0, and ran ZERO tests — which would have defeated EVAL-02/03/04 (a metric regression would never fail CI). Added `'tests/eval/**/*.test.ts'` (scoped to `*.test.ts` so the helper modules `metrics.ts`, `fixtures/types.ts`, `fixtures/cases.ts`, `mock-providers.ts` are NEVER collected as suites). The four pre-existing include entries are untouched.

Proven: `npx vitest run tests/eval/fixtures 2>&1 | grep -E "Test Files +[1-9]"` matches (Test Files 1), and `npx vitest run tests/eval` reports Test Files 2 / 20 tests.

## Which harness path ran (for 103-03's verifier)

**FULL-GRAPH** — the preferred path, NOT the research-approved service-only fallback. Each of cases 1-5 is driven through `buildEstimateGraph(makeDefaultAdapter({ companyId, supabase }))`:

```
START → ingest (no-op) → generate (REAL generateEstimateForProject) → assess (REAL isVagueEstimate) → finalize | autoRefine(cap=1) → END
```

The provider seam (`getAIProviderWithFallback`) + raw-ingestion seam (`transcribeAudioOR`/`analyzePhotoOR`) + supabase service + `next/cache` are the ONLY mocks. `generateEstimateForProject`, the graph topology, the Phase-100 normalize/schema/anchoring/totals math, and the assess vagueness gate ALL run for real. The vague case exercises the auto-refine cap=1 loop (assess → autoRefine → generate → assess → finalize).

## Exact mocked seams

| Mock | Why |
|------|-----|
| `@/lib/ai/provider-with-fallback` → `getAIProviderWithFallback` | returns a deterministic `AIProvider` whose generate/refine resolve to the active fixture's `providerResponse` |
| `@/lib/ai/openrouter-client` → `transcribeAudioOR`/`analyzePhotoOR` | deterministic transcript/description stubs (only for raw-binary ingestion; post-ingestion cases skip them) |
| `@/lib/queries/recording` → `getProjectRecordings` | serves the active case's `inputs.transcripts` as recording rows |
| `@/lib/queries/photo` → `getProjectPhotos` | serves the active case's `inputs.photoDescriptions` as photo rows |
| `@/lib/supabase/service` → `requireServiceClient` | chainable `from()` mock: serves project/company/price_book reads, CAPTURES the persisted estimate header + section/item inserts, serves the assess node's nested re-read from the capture |
| `next/cache` → `revalidatePath` | no-op |

**NOT mocked (Pitfall 3):** `generateEstimateForProject`, the graph, `normalizeOutput`/`estimateOutputSchema`, `anchorAndClampSections`, totals math, `isVagueEstimate`.

## The 6 golden fixtures + thresholds

| id | modality | expected (schemaValid / minLineItems / positiveTotal / isVague) |
|----|----------|------------------|
| `audio-deck-rebuild` | audio | true / 4 / true / false |
| `photo-roof-repair` | photo | true / 3 / true / false |
| `text-fence-paint` | text | true / 2 / true / false |
| `mixed-kitchen-reno` | mixed | true / 6 / true / false |
| `vague-do-some-work` | text | true / 0 / **false** / **true** (provider returns empty sections → $0; exercises vagueness gate + auto-refine cap=1) |
| `schema-drift-guard` | text | **false** / 0 / false / true (metrics-unit: `unit_price:'ten'` → estimateOutputSchema.safeParse rejects) |

Cases 1-5 run through the full graph; case 6 is a schema-metric-only assertion. All synthetic data (gitleaks clean).

## Quality metrics (EVAL-03, reuse not reimplement)

`tests/eval/metrics.ts`:
- `scoreProviderResponse(raw)` → `{ schemaValid: estimateOutputSchema.safeParse(raw).success }` (the SAME GUARD-01 schema)
- `scorePersistedEstimate({ total, sections })` → `{ lineItemCount, grandTotal, isVague: isVagueEstimate(...) }` (the SAME Phase-96 gate)

Per-case assertions: `grandTotal>0 === positiveTotal`, `lineItemCount >= minLineItems`, `isVague === expected.isVague`, plus `scoreProviderResponse(...).schemaValid === expected.schemaValid` for all 6. One aggregate `it` fails (with a summary) if ANY case regresses.

## Verification

- `npx vitest run tests/eval/fixtures` → Test Files 1 / 8 tests GREEN (proves include collects the suite).
- `npx vitest run tests/eval/harness.test.ts` → Test Files 1 / 12 tests GREEN (6 schema + 5 full-graph + 1 aggregate).
- `npx vitest run tests/eval` → Test Files 2 / 20 tests GREEN.
- **Determinism gate (Pitfall 5): `npx vitest run` x3 back-to-back, identical GREEN:**
  ```
  RUN 1:  Test Files 250 passed | 3 skipped (253)   Tests 1732 passed | 2 skipped | 33 todo (1767)
  RUN 2:  Test Files 250 passed | 3 skipped (253)   Tests 1732 passed | 2 skipped | 33 todo (1767)
  RUN 3:  Test Files 250 passed | 3 skipped (253)   Tests 1732 passed | 2 skipped | 33 todo (1767)
  ```
  (103-01 baseline was 248 files / 1712 passed → +2 eval files / +20 eval tests, no contamination.)
- Seam grep: `provider-with-fallback` matches; `vi.mock.*generateEstimateForProject` does NOT match (0).
- Metrics reuse grep: `isVagueEstimate` + `estimateOutputSchema` both match in metrics.ts.
- Isolation grep: `resetModules` + `await import` both match in harness.test.ts.
- gitleaks: clean on all new fixtures (no secrets/PII).

## Task Commits

1. **Task 1 (EVAL-01/03):** `efc32d1` — `test(103-02): extend vitest include for tests/eval + golden fixtures + metrics` (vitest.config.ts include + fixtures/types.ts + fixtures/cases.ts + metrics.ts + fixtures/load.test.ts)
2. **Task 2 (EVAL-02/03):** `3b9a0bc` — `test(103-02): deterministic mocked providers + full-graph eval harness` (mock-providers.ts + harness.test.ts)

## Deviations from Plan

**None material.** The plan offered a research-approved service-only fallback if full-graph wiring blew the time budget; the FULL-GRAPH path was achievable and is what shipped (the preferred path). The `afterEach(vi.resetModules())` from the plan's isolation acceptance criterion was added and is SAFE here (each case's `await import` + invoke fully resolves within the test body, so it never evicts a mid-flight dynamic import — the 103-01 failure mode) — proven by the 3x full-suite green gate.

## Untouched (as instructed)

- The two pre-existing non-test working-tree files (`components/landing/hero-section.tsx`, `next-env.d.ts`) — never staged.
- xphere files — out of scope, untouched.
- 103-03's files (`.github/workflows/*`, `tsconfig.ci.json`, `package.json`) — untouched.
- Production source — untouched (only `vitest.config.ts` config + `tests/eval/*` new).

## Next Phase Readiness

- **For 103-03 (CI gate):** the include fix means `vitest run tests/eval` (and the full `vitest run`) genuinely runs the eval suite. The CI gate's `test:eval` script + the determinism step (2-3x `vitest run`) are now meaningful. The harness needs ZERO AI/Supabase keys (everything mocked) → the gate stays secret-free. Keep the per-file 30s timeout headroom (CI runners are slower than this dev box).

## Self-Check: PASSED

- FOUND: vitest.config.ts
- FOUND: tests/eval/fixtures/{types,cases,load.test}.ts
- FOUND: tests/eval/{metrics,mock-providers,harness.test}.ts
- FOUND: .planning/phases/103-eval-harness-ci-gate/103-02-SUMMARY.md
- FOUND commit `efc32d1` (Task 1 — fixtures + metrics + include)
- FOUND commit `3b9a0bc` (Task 2 — mock-providers + harness)

---
*Phase: 103-eval-harness-ci-gate*
*Completed: 2026-06-21*
