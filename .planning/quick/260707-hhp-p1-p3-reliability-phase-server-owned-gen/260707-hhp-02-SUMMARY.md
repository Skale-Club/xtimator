---
phase: quick-260707-hhp
plan: 02
subsystem: reliability
tags: [capture, inngest, supabase, react-hooks, abortcontroller, testing]

# Dependency graph
requires:
  - phase: quick-260707-hhp (Plan 01)
    provides: "startRecordingPipeline, createTextRecording autoGenerateEstimate chain, analyze-photos autoGenerateEstimate chain"
provides:
  - "lib/estimate/poll-outcome.ts: evaluateOutcomeTick (pure), getCurrentEstimateId, pollEstimateOutcome (abortable DB outcome watcher)"
  - "components/capture/capture-recorder.tsx: all three input paths (audio/text/photos) rewired to dispatch-once-then-watch-the-DB"
  - "raceEstimateOutcomeAgainstJob: shared fast-failure race helper (pollJob vs pollEstimateOutcome) used by the audio + photos paths"
affects: [quick-260707-hhp-p3 (manual mobile E2E verification, admin/events dashboard confirmation)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Dispatch-and-watch: one server round trip starts the chain; the client only polls the DATABASE for the outcome (never a job queue) — the browser becomes disposable past the dispatch call"
    - "Fast-failure race: Promise.race between the DB outcome poll and the existing job-status poll, where the job poll's 'completed' is progress information only (not a race winner) and only its failure states short-circuit the wait; the loser's underlying loop is aborted via a child AbortController derived from the caller's signal"
    - "previousEstimateId baseline (captured once per attempt via getCurrentEstimateId, reused verbatim on Retry) distinguishes a genuinely NEW current estimate from a pre-existing one (edit-mode reruns)"

key-files:
  created:
    - lib/estimate/poll-outcome.ts
    - tests/unit/estimate/poll-outcome.test.ts
    - .planning/quick/260707-hhp-p1-p3-reliability-phase-server-owned-gen/deferred-items.md
  modified:
    - components/capture/capture-recorder.tsx

key-decisions:
  - "isAbortSignal() checks both DOMException-named 'AbortError' AND pollJob's actual thrown shape (plain Error with message 'Aborted', not name 'AbortError' — a read-only pre-existing quirk in hooks/use-job-status.ts) so an unmount during the fast-failure race is always a silent return, never a failAt."
  - "Dropped the client-side transcript state entirely — the dispatch-and-watch model never reads the transcript text back (onTranscriptReady is a parameterless stage-progression signal per the plan's Task 1 interface). The legacy fullscreen /capture route's CaptureStepper no longer shows a transcript preview panel."
  - "The audio path's client-visible stage sequence collapses from saving/transcribing/analyzing/generating to saving/transcribing/generating (no client-side 'analyzing' step remains, since the generate-estimate dispatch is now a server-side chain step, not a second client round trip). This is cosmetic-only in the legacy fullscreen route's segmented CaptureStepper (STAGES_BY_MODE.audio still lists 'analyzing', which now flashes to 'done' the instant 'generating' starts) — the popup route's CaptureProcessingOverlay has no stage list and is unaffected."
requirements-completed: [QUICK-hhp-03]

# Metrics
duration: ~25min
completed: 2026-07-07
---

# Phase quick-260707-hhp Plan 02: Client dispatch-and-watch rewire Summary

**Rewired all three New Xtimate capture paths (audio/text/photos) from client-orchestrated multi-round-trip pipelines to dispatch-once-then-watch-the-database, using a new abortable `pollEstimateOutcome` DB watcher and a `Promise.race`-based fast-failure signal against the existing job poller — closing the popup, locking the phone, or losing connectivity mid-generation can no longer orphan an estimate.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-07
- **Tasks:** 3/3 completed
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- **`lib/estimate/poll-outcome.ts`** — `evaluateOutcomeTick` (pure decision core: a current estimate id that differs from the pre-dispatch baseline is `completed`; `awaiting_details` project status with no new estimate is `awaiting_details`; otherwise `null`), `getCurrentEstimateId` (single-row baseline read), and `pollEstimateOutcome` (abortable loop — 2.5s interval, 6min default timeout, abort-aware sleep that rejects with a real `DOMException('Aborted', 'AbortError')`, individual query errors swallowed per-tick).
- **Audio path (`runPipeline`)** — upload (unchanged) → ONE `startRecordingPipeline` call (Plan 01) → watch via `pollEstimateOutcome`, racing `pollJob(transcribeJobId)` ONLY as a fast-failure signal through the new `raceEstimateOutcomeAgainstJob` helper. A completed transcribe job is treated as progress (flips the stage to `generating` via `onJobCompleted`... actually via `onTranscriptReady`), never as the race winner — only the DB outcome poll can declare completion. All P0-hotfix behavior (`elapsedMsRef`, `runPipelineRef`, pre-flight, `failAt` telemetry) and attempt-lineage semantics (`ensureAttempt`, `recordingIdRef` reuse on Retry, stable `requestId`) are preserved byte-for-byte.
- **Text path (`handleGenerate`)** — ONE `createTextRecording(..., { autoGenerateEstimate: true, requestId, estimateLanguage })` call, then `pollEstimateOutcome` directly (no job to race — the dispatch either succeeded or returned `{ error }`). `triggerEstimateGeneration` and its direct `/api/generate-estimate` fetch + poll + DB reads are deleted entirely (no other callers existed).
- **Photos path (`handleGenerate`)** — `/api/analyze-photos` gains `autoGenerateEstimate: true, estimateLanguage` in its POST body; races `pollJob(analyzeJobId)` identically to the audio path (fast-failure only; a completed analyze job just flips the stage to `generating`). The second `/api/generate-estimate` fetch + poll + DB read is deleted entirely.
- **`previousEstimateIdRef`** — a single ref (sentinel `undefined` = "not yet captured this attempt", distinct from a real `null` = "no current estimate exists") captured once via `getCurrentEstimateId` before the first dispatch of an attempt, reused (never re-read) on Retry, and reset alongside the attempt lineage on an `awaiting_details` outcome.
- **Zero direct `/api/generate-estimate` fetches remain** in `capture-recorder.tsx` (`grep -c` returns 0); all three paths call `pollEstimateOutcome` (directly, or via the race helper).
- **`tests/unit/estimate/poll-outcome.test.ts`** — 7 cases covering `evaluateOutcomeTick`'s full truth table, including the two subtle ones explicitly required by the plan: a current-id-equals-previous-id tick returning `null` (not a false completion from a stale estimate), and an `awaiting_details` status correctly winning even when a stale current estimate id is still present.

## Task Commits

Each task was committed atomically:

1. **Task 1: pollEstimateOutcome — abortable DB outcome watcher** - `90650983` (feat)
2. **Task 2: Rewire the three capture paths to dispatch-and-watch** - `7628d963` (feat)
3. **Task 3: Tests + manual E2E checklist** - `62be264f` (test)

_No plan-metadata commit yet — pending this SUMMARY (STATE.md/ROADMAP.md updates intentionally skipped per this quick task's constraints)._

## Files Created/Modified

- `lib/estimate/poll-outcome.ts` - New: `EstimateOutcome` type, `evaluateOutcomeTick`, `getCurrentEstimateId`, `pollEstimateOutcome`
- `components/capture/capture-recorder.tsx` - Audio/text/photos paths rewired to dispatch-and-watch; new module-level `isAbortSignal`/`raceEstimateOutcomeAgainstJob` helpers; new `previousEstimateIdRef`/`captureOutcomeBaseline`/`handleEstimateOutcome`; `triggerEstimateGeneration` and the dead `transcript` client state deleted
- `tests/unit/estimate/poll-outcome.test.ts` - New: 7-case `evaluateOutcomeTick` truth table
- `.planning/quick/260707-hhp-p1-p3-reliability-phase-server-owned-gen/deferred-items.md` - New: logs the one unrelated pre-existing test flake found during the full-suite run (see Issues Encountered)

## Decisions Made

- **`isAbortSignal()` dual-shape check**: `hooks/use-job-status.ts` (read-only per constraints) rethrows a signal-abort as a plain `Error('Aborted')` (name `'Error'`, not a `DOMException` named `'AbortError'`) — its internal catch block re-throws a fresh `Error` rather than preserving the caught exception's name. Since the new fast-failure race awaits both `pollJob` and `pollEstimateOutcome` (which correctly throws a real `AbortError`-named `DOMException`), the outer catch checks both `err.name === 'AbortError'` and `err.message === 'Aborted'` so an unmount during the race is always a silent return, never a `failAt` — satisfying the plan's explicit constraint without touching the read-only file.
- **Dropped the `transcript` client state** entirely rather than leaving it dead: the dispatch-and-watch model never reads transcript text back client-side (`onTranscriptReady` is parameterless per the plan's Task 1 interface, used only to flip the stage to `generating`). Removed the now-unused `useState` and the `transcript={transcript}` prop passed to the legacy fullscreen route's `CaptureStepper` (its transcript-preview panel is optional/conditional, so this is a graceful no-render, not a broken prop).
- **Audio path's client-visible stage sequence collapses** from `saving → transcribing → analyzing → generating` to `saving → transcribing → generating` (the `generating` dispatch is now a server-side Inngest chain step, not a second client round trip). Confirmed this is cosmetic-only: the popup route's `CaptureProcessingOverlay` (the primary "New Xtimate" UI) renders a label per current stage with no stage list, so it degrades gracefully; only the legacy fullscreen `/capture` route's segmented `CaptureStepper` shows the "Analyzing" row flash to "done" the instant "Generating" starts (its `STAGES_BY_MODE.audio` array — in `capture-stepper.tsx`, not modified by this plan — still lists all four stages). Left as-is since `capture-stepper.tsx` was not in this plan's `files_modified` scope and the popup flow (the actual must-have) is unaffected.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `isAbortSignal()` dual-shape abort detection**
- **Found during:** Task 2 (audio + photos path rewire)
- **Issue:** The plan's constraint requires "AbortError must remain a silent return (unmount), never a failAt" for the new `Promise.race`. Tracing `pollJob`'s actual abort-rethrow (`hooks/use-job-status.ts`, read-only) showed it throws a plain `Error('Aborted')`, not a `DOMException` named `'AbortError'` — a naive `err.name === 'AbortError'` check (as used elsewhere pre-existing in this same file, unrelated to this task) would silently fail to detect an abort originating from the `pollJob` side of the race, showing a spurious `failAt` on unmount.
- **Fix:** Added a local `isAbortSignal(err)` helper checking both `err.name === 'AbortError'` (covers `pollEstimateOutcome`'s correctly-shaped `DOMException`) and `err.message === 'Aborted'` (covers `pollJob`'s shape) — used in all three rewritten catch blocks (audio, text, photos).
- **Files modified:** `components/capture/capture-recorder.tsx`
- **Verification:** Code inspection of `pollJob`'s catch/rethrow path; `tsc`/`eslint` clean; the full unit suite still passes with no new failures.
- **Committed in:** `7628d963` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug-prevention, Rule 1).
**Impact on plan:** Necessary for correctness — without it, the plan's explicit "AbortError must remain silent" constraint would not reliably hold given `pollJob`'s actual (read-only, pre-existing) throw shape. No scope creep — no other files touched to achieve this.

## Issues Encountered

- **Full `npx vitest run`: 438 test files passed | 1 failed | 1 skipped (440); 3148 tests passed | 1 failed | 2 skipped | 17 todo (3168).** The one failure — `tests/unit/components/landing-page.test.tsx` (`findByRole('heading', { name: /sign i.../ })` timeout) — is unrelated to this plan (never touches `capture-recorder.tsx` or `lib/estimate/poll-outcome.ts`) and passes cleanly 5/5 when run in isolation (`npx vitest run tests/unit/components/landing-page.test.tsx`), confirming a pre-existing test-order/cleanup flake rather than a regression. Corroborating evidence: `npx tsc --noEmit` already reports a pre-existing type error in that same file (`Cannot find name 'afterEach'` — a missing import) on this branch, unrelated to my changes. Logged to `deferred-items.md` per the scope boundary rule; not fixed.
- **`npx tsc --noEmit` (whole project)**: reports ~20 pre-existing errors across unrelated test files (billing calibration/seat-billing, chat route, whatsapp handlers, estimate markup-totals/step-runner/observability, inngest generate-estimate-job, observability env-check, and the same landing-page.test.tsx `afterEach` error noted above). Confirmed identical (same file/line set) both before Task 1's changes (`git stash` verification) and after all three tasks — none reference `lib/estimate/poll-outcome.ts`, `tests/unit/estimate/poll-outcome.test.ts`, or `components/capture/capture-recorder.tsx`. Zero new tsc problems from this plan.
- **`npx eslint components/capture/capture-recorder.tsx`**: 2 errors + 3 warnings (React Compiler "Existing memoization could not be preserved" on `tick`/`startRecording`, plus `exhaustive-deps` warnings for a missing `t` dependency). Verified byte-identical (same messages, same relative code, just shifted line numbers post-edit) via `git stash` against the pre-Task-2 file — 100% pre-existing per the plan's own note ("capture-recorder.tsx has known pre-existing react-compiler warnings"). Zero new eslint problems.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness (P3 — manual mobile E2E verification)

The reliability chain (Plan 01 server-side + Plan 02 client-side) is code-complete. The following **manual** checklist (executed by the user, post-deploy — not automatable, per this plan's Task 3c) verifies the end-to-end promise that the browser is no longer a single point of failure:

1. **iPhone Safari/PWA**: record ~10s → watch the processing overlay → estimate appears in the popup.
2. **Record ~10s → LOCK THE PHONE immediately after stopping** → wait 60s → unlock → open the project: the estimate is already there (the server finished the chain without the client present).
3. **Record and CLOSE the popup mid-"transcribing"** → the estimate still lands in the project (dispatch already happened server-side before the popup closed).
4. **Type a text description → Generate → close the tab** → reopen the project: the estimate is present.
5. **`/admin/events`**: completed attempts show `succeeded` (v2 terminal-status view from Plan 01's not-yet-applied migration — confirm it was applied); any genuinely stalled attempt flips to `failed` with `errorCode: watchdog_timeout` within ~25 minutes, and the operator receives the Telegram alert (Plan 01's `pipelineWatchdogJob` cron).

Blockers/concerns for P3:
- Plan 01's `pipeline_attempts_terminal_status_v2` migration was created but explicitly **not applied** (per Plan 01's constraints — the orchestrator applies it via Supabase MCP after review). Step 5 above depends on it; until applied, `/admin/events` list-page statuses use the old (buggy) precedence.
- The `deferred-items.md` flaky test (`landing-page.test.tsx`) is unrelated to this reliability work and can be cleaned up independently.

## Self-Check: PASSED

All created files verified present (`lib/estimate/poll-outcome.ts`, `tests/unit/estimate/poll-outcome.test.ts`, `.planning/quick/260707-hhp-p1-p3-reliability-phase-server-owned-gen/deferred-items.md`); `components/capture/capture-recorder.tsx` modification verified; all 3 task commit hashes (`90650983`, `7628d963`, `62be264f`) verified in `git log`.

---
*Phase: quick-260707-hhp*
*Completed: 2026-07-07*
