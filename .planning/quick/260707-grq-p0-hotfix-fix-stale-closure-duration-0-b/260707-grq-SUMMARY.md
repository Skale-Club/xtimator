---
phase: quick-260707-grq
plan: 01
subsystem: capture
tags: [react-hooks, stale-closure, pipeline-events, observability, inngest, p0-hotfix]

# Dependency graph
requires:
  - lib/observability/pipeline-events.ts::recordPipelineEvent (Phase 92 — best-effort, never-throw)
  - components/projects/inline-audio-recorder.tsx (reference pattern: elapsedMsRef, lines 140-175)
provides:
  - "MIN_RECORDING_MS + finalizeDurationSeconds() pure helpers (exported from capture-recorder.tsx)"
  - "elapsedMsRef / runPipelineRef mirrors that eliminate the recorder.onstop stale-closure class of bugs"
  - "reportClientPipelineFailure server action for client-leg pipeline telemetry"
  - "Failed pipeline_events row on every early-return in createRecording/createTextRecording/transcribeRecording"
affects: [capture, observability, admin-events]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wall-clock elapsed mirrored into a ref (elapsedMsRef) instead of read from React state inside an async callback bound at a different point in time"
    - "recorder.onstop calls the latest closure via a ref (runPipelineRef) kept in sync by a useEffect, instead of the closure captured when onstop was assigned"
    - "Plain-function pipeline helpers (failAt) that read reactive component state must either be wrapped in useCallback or read that state via refs, or React Compiler's exhaustive-deps flags every caller that never previously needed to track it"

key-files:
  created:
    - tests/unit/capture/capture-duration.test.ts
    - tests/unit/actions/recording-early-return-events.test.ts
  modified:
    - components/capture/capture-recorder.tsx
    - lib/actions/recording.ts

key-decisions:
  - "Converted failAt from a plain function to useCallback(dep: [projectId]) + added audioBlobRef/uploadedPhotosRef mirrors — the plan's literal code (plain function reading audioBlob/uploadedPhotos state) introduced 6 new eslint/react-compiler problems across triggerEstimateGeneration/runPipeline/handleGenerate; fixed to keep eslint output identical to baseline (5 problems, all pre-existing)"
  - "transcribeRecording mints its own eventAttemptId fallback (randomUUID()) since no attemptId param default existed there, matching the plan's spec"
  - "inngest.send + recordJobOwnership now wrapped in try/catch — a dispatch throw degrades to a friendly retryable error instead of an unhandled 500 that previously hung the client UI on 'transcribing' forever"

patterns-established:
  - "Ref-mirror pattern for reactive component state consumed by non-useCallback pipeline helpers (failAt) — avoids widening useCallback dependency arrays / breaking React Compiler memoization"

requirements-completed: [QUICK-grq-01, QUICK-grq-02, QUICK-grq-03]

# Metrics
duration: 7min
completed: 2026-07-07
---

# Quick 260707-grq: P0 Hotfix — Stale-Closure Duration=0 + Invisible Pipeline Failures — Summary

**Fixed the production-breaking stale-closure bug (recorder.onstop always sent duration=0, killed by the B10 server validation added in c3385be7) plus added client pre-flight hardening and full server-side pipeline-event observability so no early-return is invisible in /admin/events anymore.**

## Performance

- **Duration:** ~7 min (commit span 12:16–12:23 local)
- **Tasks:** 3 completed
- **Files modified:** 2 (components/capture/capture-recorder.tsx, lib/actions/recording.ts)
- **Files created:** 2 (new test files)

## Accomplishments

- **Root cause fixed:** `recorder.onstop` now calls `runPipelineRef.current(blob)` — a ref mirror kept in sync via `useEffect(() => { runPipelineRef.current = runPipeline }, [runPipeline])` — instead of the `runPipeline` closure captured when `onstop` was bound at recording start (where `elapsedMs` state was still 0).
- **Duration source fixed:** `createRecording` now receives `finalizeDurationSeconds(elapsedMsRef.current)` — a wall-clock ref updated on every `tick()` and snapshotted again in `stopRecording()` right before `.stop()` — instead of the stale `elapsedMs` closure variable. `finalizeDurationSeconds` clamps to a minimum of 1s as belt-and-braces so the server's B10 validation (`durationSeconds > 0`) can never reject a legitimate take again.
- **Client-side hardening (pre-flight):** `runPipeline` now rejects `blob.size === 0 || elapsedMsRef.current < MIN_RECORDING_MS` (1000ms) immediately with a toast and resets to idle — no upload attempted, no server round-trip.
- **Client-leg telemetry:** `failAt` now fires a best-effort `reportClientPipelineFailure` (new authed server action) so a failure that only ever surfaced in the browser is now a `client_reported` row in `pipeline_events`.
- **Server observability:** every early-return in `createRecording` (auth/validation_path/validation_duration), `createTextRecording` (auth), and `transcribeRecording` (auth/not_found/no_audio/dispatch_failed) now writes a failed `pipeline_events` row with a distinguishing `errorCode` before returning. `validation_duration` is today's exact production-killer path and now has a regression test.
- **Dispatch hardening:** `transcribeRecording`'s `inngest.send` + `recordJobOwnership` call is now wrapped in try/catch — a dispatch outage degrades to `{ error: 'Transcription service is temporarily unavailable...' }` instead of an unhandled 500 that hung the client on "transcribing" forever.

## Task Commits

1. **Task 1: Client fixes in capture-recorder.tsx — duration ref, onstop ref, pre-flight, failAt telemetry** - `0b4eab96` (fix)
2. **Task 2: Server observability in lib/actions/recording.ts — events on every early-return + reportClientPipelineFailure** - `cd9d1289` (fix)
3. **Task 3: Tests — duration helper + early-return event coverage** - `9c9cb19b` (test)

_No separate plan-metadata commit — per this quick task's constraints, ROADMAP.md is not updated and this SUMMARY.md is committed by the calling workflow, not by this executor._

## Files Created/Modified

- `components/capture/capture-recorder.tsx` — `MIN_RECORDING_MS`/`finalizeDurationSeconds()` exported helpers; `elapsedMsRef`, `runPipelineRef`, `audioBlobRef`, `uploadedPhotosRef` mirrors; pre-flight validation in `runPipeline`; `failAt` memoized + telemetry call; `reportClientPipelineFailure` import
- `lib/actions/recording.ts` — failed `pipeline_events` writes on every early-return in `createRecording`/`createTextRecording`/`transcribeRecording`; `inngest.send` wrapped in try/catch; new `reportClientPipelineFailure` server action
- `tests/unit/capture/capture-duration.test.ts` (new) — pure-helper coverage for `finalizeDurationSeconds` + `MIN_RECORDING_MS`
- `tests/unit/actions/recording-early-return-events.test.ts` (new) — `createRecording` auth/validation_path/validation_duration early-return pipeline-event coverage, plus a happy-path assertion that no failed event fires on success

## Decisions Made

- **failAt memoization deviation (Rule 1 — auto-fix bug/lint regression):** the plan's literal `failAt` code (a plain function reading `audioBlob`/`uploadedPhotos` state directly) is exactly correct behaviorally, but it caused React Compiler's `react-hooks/exhaustive-deps` + `react-hooks/preserve-manual-memoization` rules to flag `failAt` as a newly-reactive value in every `useCallback` that calls it (`triggerEstimateGeneration`, `runPipeline`, `handleGenerate`), taking the file from 5 baseline eslint problems to 11. Fixed by (a) mirroring `audioBlob`/`uploadedPhotos` into refs (`audioBlobRef`/`uploadedPhotosRef`, following the existing `photoItemsRef` precedent) so `failAt` no longer closes over reactive state, and (b) wrapping `failAt` itself in `useCallback(..., [projectId])` and adding `failAt` to the three callers' dependency arrays. Result: eslint output is byte-for-byte identical to baseline (same 5 problems, same lines, all pre-existing `t()`/react-compiler warnings). No behavior change — `audioBlobRef`/`uploadedPhotosRef` always mirror the latest state via `useEffect`, same as `elapsedMsRef`/`photoItemsRef` already do elsewhere in this file.
- Everything else executed exactly as specified in the plan's `<interfaces>` block (exact code shapes, error codes, field names).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Lint regression from a behaviorally-correct plan snippet] failAt memoization**
- **Found during:** Task 1 (`npx eslint components/capture/capture-recorder.tsx` after applying the plan's literal `failAt` code)
- **Issue:** `failAt` newly closing over `audioBlob`/`uploadedPhotos` state made React Compiler treat it as a reactive value, causing 3 "Compilation Skipped: Existing memoization could not be preserved" errors + 3 "missing dependency: 'failAt'" warnings in `triggerEstimateGeneration`, `runPipeline`, and `handleGenerate` — none of which existed at baseline.
- **Fix:** Added `audioBlobRef`/`uploadedPhotosRef` ref mirrors (updated via `useEffect`); converted `failAt` to `useCallback(..., [projectId])`; added `failAt` to the three callers' dependency arrays.
- **Files modified:** `components/capture/capture-recorder.tsx` (same file, same commit)
- **Verification:** `npx eslint components/capture/capture-recorder.tsx` after the fix reports the identical 5 problems (2 errors, 3 warnings) as a `git stash`-based baseline run on the unmodified file.
- **Committed in:** `0b4eab96` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 — lint regression, not a functional bug)
**Impact on plan:** No scope creep, no behavior change from what the plan specified — purely a memoization/lint-cleanliness fix required by this task's own done-criteria ("eslint: no NEW problems vs baseline").

## Issues Encountered

None beyond the deviation above. `npx tsc --noEmit` showed one transient error after Task 1 alone (`Module has no exported member 'reportClientPipelineFailure'`) — expected, since Task 2 (which adds that export) had not yet landed; resolved immediately once Task 2 was committed, confirmed via a before/after diff of the full `tsc` output showing that line was the *only* difference.

## User Setup Required

None — no external service configuration required. This is a pure code fix; the DB schema (`pipeline_events` CHECK constraints from migration `20260529000001`) was not touched.

## Next Phase Readiness

- The New Xtimate popup audio path now sends real durations — the B10 server validation can no longer kill a legitimate recording. **Manual post-deploy verification still recommended** (not run in this session, no dev server/browser available): record a normal take → estimate generates; check `/admin/events` shows the attempt; record a <1s take → instant friendly toast, no upload.
- Every pipeline failure (client-leg or server early-return) now writes to `pipeline_events` — `/admin/events` should no longer show gaps for the auth/validation/dispatch failure classes covered here.
- A dispatch (`inngest.send`) outage now degrades to a friendly retryable error instead of a hung UI.

## Known Stubs

None. All changes wire to real data paths — no hardcoded/mocked values introduced.

## Self-Check: PASSED

Verified all touched/created source files, the SUMMARY.md itself, and all three per-task commit hashes exist:

- FOUND: components/capture/capture-recorder.tsx
- FOUND: lib/actions/recording.ts
- FOUND: tests/unit/capture/capture-duration.test.ts
- FOUND: tests/unit/actions/recording-early-return-events.test.ts
- FOUND: .planning/quick/260707-grq-p0-hotfix-fix-stale-closure-duration-0-b/260707-grq-SUMMARY.md
- FOUND commit: 0b4eab96
- FOUND commit: cd9d1289
- FOUND commit: 9c9cb19b

---
*Phase: quick-260707-grq*
*Completed: 2026-07-07*
