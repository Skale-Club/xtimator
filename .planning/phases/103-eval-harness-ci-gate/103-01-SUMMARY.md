---
phase: 103-eval-harness-ci-gate
plan: 01
subsystem: testing
tags: [vitest, test-isolation, forks-pool, dynamic-import, testTimeout, langgraph, mock]

# Dependency graph
requires:
  - phase: 102-resilience-hardening
    provides: the WhatsApp batch-reporting / replay-safe-TTL graph state that the affected tests exercise
provides:
  - "Deterministic-GREEN full unit suite: `npx vitest run` passes 3x consecutively (1712 passed | 2 skipped | 33 todo; 248 files), independent of file scheduling"
  - "Root-caused the long-standing full-suite flakiness as import LATENCY under forked-worker contention (NOT a mock-state leak) and fixed it at the test-authoring level"
  - "Repaired 7 deterministic stale pre-existing test failures (Class A) left by the v4.0 multi-tenancy + later route/feature evolution"
affects: [103-02-eval-harness, 103-03-ci-gate]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-file `vi.setConfig({ testTimeout, hookTimeout })` for tests that load heavy LangGraph/AI/Inngest module trees via runtime dynamic import — keeps them deterministic under worker contention without any global config change"
    - "Class-A stale-test repair pattern: mock `@/lib/queries/active-company` (cookies-backed) in route tests; relax exact-equality result assertions to objectContaining when the action gains additive success fields"

key-files:
  created:
    - .planning/phases/103-eval-harness-ci-gate/103-01-SUMMARY.md
  modified:
    - tests/unit/api/generate-estimate-dispatch.test.ts
    - tests/unit/api/generate-estimate-name-patch.test.ts
    - tests/unit/api/generate-estimate-quota.test.ts
    - tests/unit/api/jobs-status.test.ts
    - tests/unit/billing/stripe-webhook.test.ts
    - tests/unit/capture/capture-attempt-lineage.test.ts
    - tests/unit/components/onboarding-survey.test.tsx
    - tests/unit/components/theme-toggle.test.tsx
    - tests/unit/landing-actions.test.ts
    - tests/unit/phase83-server-action-sweep.test.ts
    - tests/unit/estimate/{channel-adapter,step-runner,multimodal-ingest,never-throw,refine-node,vagueness,totals-authority,generate-refine-equivalence,auto-refine-isolation}.test.ts
    - tests/unit/whatsapp/{never-reply-regression,batch-reporting,replay-safe-ttl,confirm,intent-router}.test.ts
    - tests/unit/services/generate-estimate.test.ts
    - tests/unit/inngest/generate-estimate-job.test.ts

key-decisions:
  - "The full-suite flakiness is import LATENCY under vitest forks-pool worker contention, NOT cross-file mock-state leakage — proven empirically (testTimeout=10000 → cohort green 3x with zero count corruption)"
  - "Fixed via per-file vi.setConfig timeout (test-authoring level) on the heavy-runtime-import files — NOT a vitest.config global flag, NOT clearMocks/mockReset/restoreMocks, NOT sharding/--no-file-parallelism, no skip/delete"
  - "phase83 staff.ts `.eq('user_id', claims.sub)` is a LEGITIMATE company_members owner-role check (the documented membership exception), not a tenant-isolation product bug — refined the static guard, did not touch production source"

patterns-established:
  - "Heavy-import test files declare a per-file vi.setConfig timeout near the top; the rest of the suite keeps the 5s default"

requirements-completed: []

# Metrics
duration: ~50min
completed: 2026-06-21
---

# Phase 103 Plan 01: Test-Harness Isolation Remediation Summary

**Made `npx vitest run` deterministic-GREEN 3x consecutively by repairing 7 stale pre-existing tests (Class A) and root-causing the full-suite flakiness as import-latency-under-worker-contention (Class B), fixed with per-file `vi.setConfig` timeouts on the heavy LangGraph/AI/Inngest-loading tests — zero production-source, config, or skip changes.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-06-21
- **Tasks:** 2 (Class A repair, Class B isolation) — committed as 3 logical commits
- **Files modified:** 26 test files (+ this SUMMARY)

## The Determinism Gate (the wave exit criterion) — PASS

`npx vitest run` run THREE times back-to-back, all GREEN, identical:

```
RUN 1:  Tests  1712 passed | 2 skipped | 33 todo (1747)   Test Files  248 passed | 3 skipped (251)
RUN 2:  Tests  1712 passed | 2 skipped | 33 todo (1747)   Test Files  248 passed | 3 skipped (251)
RUN 3:  Tests  1712 passed | 2 skipped | 33 todo (1747)   Test Files  248 passed | 3 skipped (251)
```

Baseline before this plan: 34 tests / 20 files failed, flaky (20–21 files run-to-run).

## Accomplishments

- **Class A — 7 deterministic stale tests repaired** (each failed ALONE on a clean tree):
  - `generate-estimate` route tests (dispatch, name-patch, quota) + `capture-attempt-lineage`: route now derives the company via `getActiveCompanyId()` (cookies-backed); the tests never mocked `@/lib/queries/active-company`, so the route threw "cookies() outside request scope" → 500 instead of 202. Added the standard `vi.mock('@/lib/queries/active-company')` stub.
  - `stripe-webhook`: `customer.subscription.deleted` now does a `select('id')` pre-lookup; extended the companies mock with a `select().eq().maybeSingle()` chain.
  - `onboarding-survey`: `useSurveyState` persists/restores its draft via `localStorage`; tests leaked `stepIndex` across cases. Added `localStorage.clear()` + `cleanup()` teardown.
  - `theme-toggle`: stale expectation — the dropdown `ThemeToggle` is light↔dark only (`Icon = current==='light' ? Sun : Moon`), so `'system'` shows Moon, not Monitor (Monitor lives in the RadioGroup variant). Corrected the assertion.
  - `jobs-status`: route added an `isDevMode()` branch (reads `INNGEST_DEV`, which `.env.local` sets to `1`); forced non-dev in `beforeEach` so the cloud-URL + config_unavailable assertions test the branch they describe.
  - `landing-actions`: `saveLandingContent` success now also returns `stepImageUrls`/`featureImageUrls`; relaxed the four exact-equality result assertions to `objectContaining({ ok: true })` (kept all payload assertions).
  - `phase83-server-action-sweep`: the legacy-pattern guard's regex flagged `staff.ts`'s LEGITIMATE `company_members` owner-role check — refined the guard to strip the documented membership pattern before grepping. **Surfaced and verified this is NOT a product bug.**

- **Class B — full-suite flakiness root-caused and fixed.** The flakiness was NOT a mock-state leak (the working hypothesis in 103-RESEARCH). It is **import LATENCY under forked-worker contention**: vitest 4's default `pool: 'forks'` co-schedules many files; the first runtime load of the heavy LangGraph / AI-provider / Inngest module trees (loaded via dynamic `import`, several via the Wave-0 `import(/* @vite-ignore */ spec)` scaffold) can exceed the 5s default `testTimeout`. A timed-out `graph.invoke()` then leaves a pending async that fires a module-scope spy AFTER the next test starts → the spurious "called 2 times" / "expected 2 to be 1" count cascade in the whatsapp files.

## Approach per class

**Class A:** stale-mock / stale-expectation repairs, file-by-file, each verified to pass ALONE first. No production source touched.

**Class B:** a per-file `vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })` on exactly the heavy-runtime-import test files. This is **test-authoring level** — explicitly NOT a `vitest.config.ts` global flag, NOT `clearMocks`/`mockReset`/`restoreMocks` (research proved those make it worse), NOT sharding / `--no-file-parallelism`, and no test was skipped or deleted (`git diff vitest.config.ts` is empty).

**Why NOT the planned `afterEach(resetModules)` discipline:** I tried it first. It made the `@vite-ignore` dynamic-import victims (`channel-adapter`, `step-runner`, `generate-refine-equivalence`) **worse** — `resetModules` mid-flight deadlocked the runtime dynamic import → 5s timeouts that then spread (exactly the "blanket resetModules spread failures" warning in the diagnosis). The decisive experiment: at `testTimeout=10000` the entire `estimate+inngest+services+whatsapp` cohort is green 3x with zero count corruption — proving the issue is latency, not leakage. A leak would have survived a timeout bump; it did not.

## Task Commits

1. **Class A (first batch):** `eb0a4cd` — `test(103-01): repair stale pre-existing test failures (Class A)` (7 files: 3 route + capture-lineage active-company mock, stripe-webhook select chain, onboarding-survey localStorage teardown, theme-toggle expectation)
2. **Class A (addendum):** `b8b0020` — `test(103-01): repair more stale pre-existing test failures (Class A)` (jobs-status INNGEST_DEV, landing-actions objectContaining, phase83 guard refinement)
3. **Class B:** `6b7fffc` — `test(103-01): fix cross-file flakiness via per-file timeout on heavy-import tests (Class B)` (17 files: per-file vi.setConfig timeouts)

## Enumerated files fixed

**Class A (deterministic, fail alone):** generate-estimate-dispatch, generate-estimate-name-patch, generate-estimate-quota, capture-attempt-lineage (active-company mock), stripe-webhook, onboarding-survey, theme-toggle, jobs-status, landing-actions, phase83-server-action-sweep.

**Class B (per-file timeout for heavy runtime imports):** estimate/{channel-adapter, step-runner, multimodal-ingest, never-throw, refine-node, vagueness, totals-authority, generate-refine-equivalence, auto-refine-isolation}, whatsapp/{never-reply-regression, batch-reporting, replay-safe-ttl, confirm, intent-router}, services/generate-estimate, inngest/generate-estimate-job, capture/capture-attempt-lineage (timeout, in addition to its Class-A mock).

## Decisions Made

- Class B is import latency, not a mock leak (empirically proven) → per-file `vi.setConfig` timeout is the correct, non-masking fix.
- `phase83`/`staff.ts` `.eq('user_id', claims.sub)` is a legitimate `company_members` membership check, not a tenant-isolation bug — guard refined, production source untouched.

## Deviations from Plan

The plan prescribed `afterEach(() => { vi.clearAllMocks(); vi.resetModules() })` discipline as the fix. **This was tried and rejected on evidence** — it deadlocked the `@vite-ignore` dynamic-import victims and spread timeouts (consistent with the diagnosis's own warning that blanket resetModules made things worse). The plan's `must_haves` also asserted the leak was authored at the spy-teardown level; the actual root cause (proven) is import latency under worker contention. The fix still satisfies every hard constraint in the plan's verification block: full suite GREEN 3x, `git diff lib app components` empty (only the pre-existing `hero-section.tsx`, not mine), `git diff vitest.config.ts` empty, no `.skip`/`.only`, no test deleted.

## Issues Encountered

- The `afterEach(resetModules)` recipe (whatsapp source files) fixed the whatsapp dir alone (208 green) but did nothing for the cross-directory cohort and worsened the `@vite-ignore` victims → reverted in favor of the timeout fix.
- A few latency victims surfaced only after the dominant set was fixed (capture-lineage's `buildGenerateEventId` test, auto-refine-isolation, services/generate-estimate, intent-router, confirm) — iterated file-by-file until 3x green.

## Genuine product bug surfaced (not papered over)

`phase83-server-action-sweep` flagged `lib/actions/staff.ts`. On inspection this is a CORRECT `company_members` owner-role authorization check (`.eq('company_id', companyId).eq('user_id', claims.sub)` — the documented membership exception), NOT a legacy tenant-data-by-user scoping bug. No product fix needed; the false-positive guard was refined (test-only).

## Untouched (as instructed)

- Production source: only `components/landing/hero-section.tsx` + `next-env.d.ts` remain modified in the working tree — these are the two pre-existing non-test changes that are NOT mine; left untouched, never staged.
- xphere files: out of scope, untouched.
- `vitest.config.ts`: untouched (empty diff).

## Next Phase Readiness

- The full unit suite is now deterministic-GREEN 3x — Wave 2 (eval harness, 103-02) and Wave 3 (CI gate, 103-03) are unblocked.
- **For 103-02 (eval harness):** the new eval files load the heavy real graph at runtime — they MUST adopt the same per-file `vi.setConfig({ testTimeout: 30_000 })` (Pitfall 5 in 103-RESEARCH, now reframed: the contention is latency, not just mock-isolation).
- **For 103-03 (CI gate):** the determinism step (`npx vitest run` x2–3) is now meaningful; CI runners are typically slower than this dev box, so the 30s per-file timeout headroom is important — keep it.

## Self-Check: PASSED

- FOUND: `.planning/phases/103-eval-harness-ci-gate/103-01-SUMMARY.md`
- FOUND commit `eb0a4cd` (Class A first batch)
- FOUND commit `b8b0020` (Class A addendum)
- FOUND commit `6b7fffc` (Class B)

---
*Phase: 103-eval-harness-ci-gate*
*Completed: 2026-06-21*
