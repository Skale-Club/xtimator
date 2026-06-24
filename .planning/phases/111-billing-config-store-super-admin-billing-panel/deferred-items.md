# Deferred Items — Phase 111

Out-of-scope discoveries logged during execution (NOT fixed — unrelated to the touched files).

## Pre-existing project-wide `tsc --noEmit` errors (test files only)

Discovered during the Plan 02 final full-project type-check. None are in any of the 5
files this plan touched; all pre-exist on `main` and are in unrelated test files. Vitest
(separate transform) runs them green — these are tsc-target/typing nits, not runtime bugs.

- `tests/unit/ai/refine-shared-prompt.test.ts:49` — TS1501 regex flag needs es2018+ target
- `tests/unit/estimate/observability.test.ts:38,58,66` — TS1501 regex flag needs es2018+ target
- `tests/unit/estimate/step-runner.test.ts:50` — TS2322 StepRunner mock generic mismatch
- `tests/unit/inngest/generate-estimate-job.test.ts:150` — TS2348 Mock not callable

Recommendation: a small tsconfig `lib`/`target` bump (or `as` casts in those mocks) in a
dedicated test-hygiene task. Left untouched here to respect the plan scope boundary.
