---
phase: 91-recording-pipeline-reliability
plan: 01
subsystem: api
tags: [inngest, next-app-router, polling, discriminated-union, i18n, react-hook, vitest]

# Dependency graph
requires:
  - phase: 67-inngest-background-ai-jobs
    provides: GET /api/jobs/[jobId] proxy, pollJob/useJobStatus polling layer, CaptureFailure component
provides:
  - "JobStatusContract discriminated-state contract on GET /api/jobs/[jobId] (always HTTP 200 for known states)"
  - "Typed JobResult / JobStatusState exports from hooks/use-job-status.ts (pollJob never throws on non-200)"
  - "Discriminated UseJobStatusState ({ state, output, reason }) replacing the synthetic { status: 'Failed', error: 'Status 503' }"
  - "i18n-wrapped CaptureFailure buttons (t('Retry') / t('Edit manually'))"
affects: [91-02-attempt-lineage, capture-recorder, text-describe, photos-input, use-ai-input-submit]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Graceful discriminated-state API contract: every known condition is a 200 JSON state, non-200 reserved for the auth gate only"
    - "pickRun() chooses the most-recent Inngest run by timestamp instead of blind data[0] (RESEARCH Pitfall 2)"
    - "pollJob resolves a typed discriminant and only throws on an aborted signal (no throw on non-200)"

key-files:
  created:
    - tests/unit/hooks/use-job-status.test.ts
    - tests/unit/components/capture-failure.test.tsx
  modified:
    - app/api/jobs/[jobId]/route.ts
    - hooks/use-job-status.ts
    - components/capture/capture-failure.tsx
    - tests/unit/api/jobs-status.test.ts
    - components/projects/photos-input.tsx
    - components/projects/text-describe.tsx

key-decisions:
  - "config_unavailable covers BOTH missing signing key AND a thrown fetch (dev server unreachable) — dev-server-down maps to config_unavailable, not failed"
  - "safeFailureReason() returns a trimmed (<=200 char) plain string only when run.output is itself a plain string, else the literal 'Estimate generation failed' — never a stack/raw body"
  - "Bridge JobResult through `as unknown as GenerateEstimateResponse` in photos-input/text-describe with a Phase 91-02 marker; full rewire deferred to Plan 02 Task 4 (per plan verification note)"

patterns-established:
  - "Discriminated-state contract: shared JobStatusContract (route) mirrored by JobResult/JobStatusState (hook) so the client has exactly one code path and never throws on non-200"
  - "i18n at the call site: t('literal') inline so the extractor picks up keys; count text kept outside t()"

requirements-completed: [REC-01, REC-02, REC-05]

# Metrics
duration: 7min
completed: 2026-05-29
---

# Phase 91 Plan 01: Graceful Job-Status Contract Summary

**Eliminated the opaque 503 from GET /api/jobs/[jobId] by introducing a discriminated `state` contract (processing | completed | failed | config_unavailable | not_found) always returned as HTTP 200, with a polling layer that resolves a typed JobResult without throwing and an i18n failure UI.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-29T04:18:47Z
- **Completed:** 2026-05-29T04:25:50Z
- **Tasks:** 3
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments
- `GET /api/jobs/[jobId]` now returns HTTP 200 with a discriminated `JobStatusContract` for every known condition; the 503/502/404 branches are folded into `config_unavailable` / `failed` / `not_found`. The 401 auth gate is preserved.
- `pollJob` resolves a typed `JobResult` discriminant and never throws on non-200 (only on an aborted signal); the `Status check failed: <code>` throw is gone. `JobResult` + `JobStatusState` are exported for Plan 02 callers.
- `useJobStatus` exposes a discriminated `UseJobStatusState` ({ state, output, reason }); it never sets the synthetic `{ status: 'Failed', error: 'Status 503' }`.
- `CaptureFailure` renders the friendly reason and wraps the Retry / Edit-manually labels in `t()`.
- 21/21 tests green across the three suites; full `tsc --noEmit` clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: RED test scaffolds** - `e8e6bc0` (test)
2. **Task 2: Graceful discriminated-state endpoint** - `dc32856` (feat)
3. **Task 3: pollJob/useJobStatus contract interpretation + i18n failure UI** - `7347dc3` (feat)

_Note: this plan ran TDD with the RED scaffold as one commit covering all three suites, then GREEN per task._

## Files Created/Modified
- `app/api/jobs/[jobId]/route.ts` - Rewrote GET to the 200 `JobStatusContract`; `pickRun()` + `safeFailureReason()` helpers; exported `JobStatusContract`.
- `hooks/use-job-status.ts` - `pollJob` → `Promise<JobResult>` (no throw on non-200); `useJobStatus` → discriminated `UseJobStatusState`; exported `JobResult` + `JobStatusState`.
- `components/capture/capture-failure.tsx` - `useTranslation()` + `t('Retry')` / `t('Edit manually')`.
- `tests/unit/api/jobs-status.test.ts` - Replaced 503/404/502 cases with 200 discriminated-state assertions; added Failed-run case.
- `tests/unit/hooks/use-job-status.test.ts` - Rewrote for typed `JobResult` pollJob + discriminated hook state.
- `tests/unit/components/capture-failure.test.tsx` - New; asserts i18n t()-wrapped buttons via sentinel + friendly reason render.
- `components/projects/photos-input.tsx`, `components/projects/text-describe.tsx` - Cast `pollJob` result through `unknown` with a Phase 91-02 marker (callers rewired in Plan 02 Task 4).

## Decisions Made
- `config_unavailable` covers both the absent signing key and a thrown `fetch` (dev server unreachable), per RESEARCH Pattern 1.
- The failure `reason` is a safe summary string — a trimmed plain string only when `run.output` is itself a string, otherwise a generic literal — never a stack or raw upstream body (Project security constraint).
- Chose `pickRun()` (most-recent by `ended_at`/`run_started_at`) over blind `data[0]` to avoid the multiple-runs-per-event correctness bug (RESEARCH Pitfall 2).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Bridged JobResult cast in two pollJob consumers to keep tsc green**
- **Found during:** Task 3 (hook rewrite)
- **Issue:** Changing `pollJob` from `Promise<unknown>` to `Promise<JobResult>` broke the direct `as GenerateEstimateResponse` casts in `components/projects/photos-input.tsx:63` and `components/projects/text-describe.tsx:65` (TS2352 — non-overlapping types).
- **Fix:** Changed both to `as unknown as GenerateEstimateResponse` with a `// Phase 91-02 rewires this caller` marker. This preserves existing runtime behavior (the prior cast was already untyped since `pollJob` returned `unknown`); the proper discriminant rewire is owned by Plan 02 Task 4, exactly as the plan's `<verification>` note instructs.
- **Files modified:** components/projects/photos-input.tsx, components/projects/text-describe.tsx
- **Verification:** `npx tsc --noEmit` → 0 errors.
- **Committed in:** `7347dc3` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The auto-fix was anticipated by the plan's verification note and necessary to keep the build green. No scope creep — the casts remain bridges, not the final rewire.

## Issues Encountered
- The pre-existing `tests/unit/hooks/use-job-status.test.ts` asserted the OLD throwing contract. Per Task 1 it was rewritten in full to encode the new typed `JobResult` discriminant rather than patched.

## Known Stubs
None that block this plan's goal. Intentional, plan-scoped deferrals (NOT stubs):
- The state→friendly-message mapping at the capture-recorder call site is owned by **Plan 02 Task 3**; `CaptureFailure` deliberately just renders the already-t()'d reason string passed by the caller.
- `pollJob`'s production consumers (`text-describe`, `photos-input`, `use-ai-input-submit`, `capture-recorder`) read the new discriminant in **Plan 02 Tasks 3 + 4**; the two `unknown`-bridge casts above are the only interim shim.

## User Setup Required
None - no external service configuration required. (For end-to-end UAT, `INNGEST_SIGNING_KEY` and `OPENROUTER_API_KEY` must be set and both `npm run dev` + `npm run dev:inngest` running — deferred to phase UAT.)

## Next Phase Readiness
- `JobResult` and `JobStatusState` are exported cleanly from `hooks/use-job-status.ts` for Plan 02 (Wave 2) to import and narrow on.
- `JobStatusContract` is exported from the route for any server-side mirror.
- Plan 02 Task 3 (capture-recorder rewire + attempt lineage) and Task 4 (consumer rewire) can now consume the discriminant; the two interim `unknown` casts are marked for removal there.

---
*Phase: 91-recording-pipeline-reliability*
*Completed: 2026-05-29*

## Self-Check: PASSED
- All 6 key files verified present on disk.
- All 3 task commits verified in git history (e8e6bc0, dc32856, 7347dc3).
