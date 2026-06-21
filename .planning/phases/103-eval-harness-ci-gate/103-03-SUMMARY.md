---
phase: 103-eval-harness-ci-gate
plan: 03
subsystem: ci
tags: [github-actions, ci-gate, regression-gate, tsconfig, vitest, eval-harness, secret-free, determinism]

# Dependency graph
requires:
  - phase: 103-01
    provides: "deterministic-GREEN full unit suite (npx vitest run 3x identical green) — the precondition that makes a CI gate non-flaky and meaningful"
  - phase: 103-02
    provides: "vitest `include` extended with tests/eval/**/*.test.ts (the load-bearing fix) + the FULL-GRAPH eval harness — so `vitest run tests/eval` collects Test Files >= 1 and the gate has teeth"
provides:
  - ".github/workflows/test.yml — secret-free CI regression gate: scoped tsc + unit/eval suite run TWICE on push(main,dev)/PR; fails the build on any metric/schema/behavior regression"
  - "tsconfig.ci.json — app/lib/components/hooks-scoped typecheck (extends base tsconfig, excludes tests/**); `tsc --noEmit -p tsconfig.ci.json` is GREEN where full tsc is red on 9 pre-existing test-file errors"
  - ".nvmrc (node 24) — local/CI node parity"
  - "package.json test:eval script (vitest run tests/eval) for fast local iteration"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scoped CI typecheck (Option A / Pitfall 7): tsconfig.ci.json extends the base config and narrows `include` to shipped runtime source (app/lib/components/hooks + instrumentation/sentry entrypoints), excluding tests/** — keeps the tsc gate GREEN and meaningful without dragging in 9 pre-existing test-file-only errors"
    - "Determinism gate as a permanent CI step: the unit/eval suite runs twice back-to-back in the same job so a re-emergent cross-file isolation leak (the Wave-1 bug class) fails CI"
    - "Secret-free test gate: integration tests (live Supabase) excluded by scoping the vitest paths to `tests/unit tests/eval`; the eval harness mocks all providers so zero AI/Supabase keys are needed"

key-files:
  created:
    - tsconfig.ci.json
    - .nvmrc
    - .github/workflows/test.yml
    - .planning/phases/103-eval-harness-ci-gate/103-03-SUMMARY.md
  modified:
    - package.json

key-decisions:
  - "tsc gate = Option A (scoped tsconfig.ci.json), NOT Option B (es2018 bump + 4 stub fixes). The 9 pre-existing tsc errors are ALL in tests/**, 0 in app/lib; scoping to shipped source makes the gate GREEN today and minimal. Global tsconfig.json is byte-untouched (git diff empty). Test files remain typechecked by vitest collection + the full suite, just not gated on the pre-existing errors (Pitfall 7)."
  - "CI gate EXCLUDES tests/integration by scoping the vitest paths to `tests/unit tests/eval` (Pitfall 6 / research Open Question #2). Integration tests need a live Supabase → including them would require secrets and break the secret-free gate. Path-scoping is the simplest exclusion; no Supabase/AI secrets are referenced anywhere in the workflow."
  - "The suite runs TWICE in the job (determinism gate) — the Wave-1 invariant made permanent. A single green run is insufficient given the historical flakiness; the second identical pass is the standing proof the isolation fix held."
  - "tsconfig.ci.json `include` covers app/lib/components/hooks + the root instrumentation/sentry entrypoints (the shipped runtime surface). Build/test-tooling root files (next.config.ts, playwright.config.ts, vitest.config.ts) are deliberately NOT in the gate — they are not shipped runtime code, and the gate verified GREEN with this set."
  - "Node pinned to 24 in BOTH .nvmrc and the workflow node-version so `nvm use` locally and CI agree (no works-on-my-machine drift)."

patterns-established:
  - "Scoped-typecheck CI gate + double-run determinism step + secret-free path-scoped vitest — the reusable shape for a test-only GitHub Actions gate that does NOT touch the GHCR/Coolify deploy path"

requirements-completed: [EVAL-04]

# Metrics
duration: ~5min
completed: 2026-06-21
---

# Phase 103 Plan 03: CI Regression Gate (EVAL-04) Summary

**Added the EVAL-04 CI regression gate: a secret-free `.github/workflows/test.yml` that runs a scoped typecheck (`tsconfig.ci.json`, app/lib/components/hooks only — GREEN where full `tsc` is red on 9 pre-existing test-file errors) plus the unit/eval suite TWICE (determinism gate) on push to main/dev and on every PR, failing the build on any metric/schema/behavior regression. Plus a `.nvmrc` node-24 pin and a `test:eval` script. The gate uses mocked providers and excludes `tests/integration`, so it needs ZERO AI/Supabase keys; it is a TEST gate only and touches no deploy path (build-deploy.yml byte-untouched). Completes Phase 103 and the v4.5 milestone.**

## Performance

- **Duration:** ~5 min
- **Completed:** 2026-06-21
- **Tasks:** 2 (atomic commits)
- **Files:** 3 created + 1 modified

## Precondition confirmed (gate not hollow)

103-02-SUMMARY confirms the load-bearing `vitest.config.ts` `include` fix landed (`tests/eval/**/*.test.ts`). Verified live here before wiring CI:
- `npm run test:eval` → **Test Files 2 passed / 20 tests** (NOT a silent zero-test pass).
- `npx vitest run tests/eval` → **Test Files 2 passed**.

If this had reported Test Files 0, the plan instructed STOP — it did not; the gate has teeth.

## tsconfig.ci.json — the final include set

```
extends: ./tsconfig.json
include: app/**/*.{ts,tsx}, lib/**/*.{ts,tsx}, components/**/*.{ts,tsx}, hooks/**/*.{ts,tsx},
         instrumentation.ts, instrumentation-client.ts, sentry.edge.config.ts,
         sentry.server.config.ts, next-env.d.ts, .next/types/**/*.ts
exclude: node_modules, tests/**, .next/dev/**
```

- `npx tsc --noEmit -p tsconfig.ci.json` → **exit 0 (GREEN)**. The full `npx tsc --noEmit` stays red on the 9 pre-existing errors — ALL in tests/** (regex-flag/es2018, Mock-not-callable, drifted Branding stubs, Xphere `pipeline`), 0 in app/lib — which is exactly WHY the gate is scoped (Pitfall 7).
- `git diff tsconfig.json` is **EMPTY** — global config untouched (Option A, not Option B).
- `tests` appears in `exclude`, NOT `include`.

## .nvmrc

A single line `24`, matching the workflow `node-version: 24` and the local dev node — local/CI parity.

## .github/workflows/test.yml — the exact gate command lines

```yaml
on:
  push:
    branches: [main, dev]
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  unit:                       # runs-on: ubuntu-latest, timeout-minutes: 15
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4   # node-version: 24, cache: npm
      - run: npm ci
      - run: npx tsc --noEmit -p tsconfig.ci.json     # scoped typecheck
      - run: npx vitest run tests/unit tests/eval      # unit+eval, integration EXCLUDED
      - run: npx vitest run tests/unit tests/eval      # determinism gate (2nd pass)
```

## Integration-exclusion approach

The test step targets `tests/unit tests/eval` explicitly (path-scoping) — `tests/integration` is never run, so the gate stays secret-free (Pitfall 6). The only references to `tests/integration`, `deploy`, `docker`, `ghcr`, `coolify` in the file are in explanatory comments documenting what the gate deliberately does NOT do; no `run:` step targets any of them (verified: the four run steps are `npm ci`, scoped tsc, and the vitest suite twice — nothing else).

## Verification (local gate simulation — GREEN)

- `npx tsc --noEmit -p tsconfig.ci.json` → exit 0 (GREEN).
- `npx vitest run tests/unit tests/eval` (the gate's exact command) → **Test Files 241 passed | 3 skipped (244); Tests 1712 passed | 31 todo (1743)** — GREEN, integration excluded.
- Eval portion not hollow: `npx vitest run tests/eval 2>&1 | grep -E "Test Files +[1-9]"` matches (Test Files 2).
- Triggers: `branches: [main, dev]` + `pull_request` + `workflow_dispatch` all present.
- Scoped tsc wired: `tsconfig.ci.json` referenced in a `run:` step.
- Determinism: `grep -c "vitest run tests/unit tests/eval"` = **2**.
- NOT a deploy change: no `run:` step matches `next build|docker|ghcr|coolify|deploy`; `git diff .github/workflows/build-deploy.yml` is **EMPTY**.
- No secrets: no `ANTHROPIC_API_KEY`/`OPENROUTER_API_KEY`/`SUPABASE_SERVICE_ROLE_KEY`/`secrets.` references; gitleaks pre-commit hook reported "no leaks found" on both commits.

## Task Commits

1. **Task 1 (EVAL-04 scaffolding):** `b0a6df1` — `chore(103-03): scoped tsconfig.ci.json + .nvmrc(24) + test:eval script`
2. **Task 2 (EVAL-04 gate):** `61b1cd3` — `feat(103-03): secret-free CI regression gate (EVAL-04)`

## Deviations from Plan

**None.** The plan was executed exactly as written: Option A scoped tsconfig, secret-free integration-excluded workflow, double-run determinism gate, .nvmrc node 24, test:eval script. No deviation rules (1-4) triggered; no auth gates; no architectural decisions needed. The `include` set was confirmed against the actual shipped source dirs (app/lib/components/hooks + instrumentation/sentry entrypoints) and verified GREEN.

## Deferred / Manual UAT (non-blocking, for the phase verifier)

- **MANUAL (per 103-VALIDATION):** open a throwaway PR that breaks a metric (e.g. flip an `expected` threshold) and confirm the GitHub Actions "Test" check goes red. This requires the workflow to be on the default branch / a live PR and is a deferred, non-blocking UAT — it cannot be exercised from a local executor.
- Carry-over from 102-04: human-verify the needs-details recourse banner in staging (unrelated to this plan; tracked in 102-04-SUMMARY.md).

## Untouched (as instructed)

- The two pre-existing non-test working-tree files (`components/landing/hero-section.tsx`, `next-env.d.ts`) — never staged across either commit.
- xphere files — out of scope, untouched.
- `build-deploy.yml` — byte-untouched (git diff empty); deploy stays in GHCR/Coolify.
- Production source — untouched (only new CI/config files + the package.json scripts entry).
- `vitest.config.ts` / `tsconfig.json` — untouched (Option A; the 103-02 include fix is relied upon, not modified).

## Known Stubs

None. No placeholder/empty-data patterns introduced — this plan adds CI config + a typecheck config + a script, all fully wired and verified GREEN locally.

## Phase 103 / v4.5 status

EVAL-04 complete → **Phase 103 is COMPLETE** (3/3 plans: 103-01 isolation remediation, 103-02 eval harness, 103-03 CI gate). Phase 103 is the LAST phase of the **v4.5 Estimate Engine Robustness & Reliability Harness** milestone.

## Self-Check: PASSED

- FOUND: tsconfig.ci.json
- FOUND: .nvmrc
- FOUND: .github/workflows/test.yml
- FOUND: .planning/phases/103-eval-harness-ci-gate/103-03-SUMMARY.md
- FOUND: package.json test:eval script
- FOUND commit `b0a6df1` (Task 1 — tsconfig.ci.json + .nvmrc + test:eval)
- FOUND commit `61b1cd3` (Task 2 — test.yml CI gate)

---
*Phase: 103-eval-harness-ci-gate*
*Completed: 2026-06-21*
