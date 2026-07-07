---
phase: quick-260707-lyq
plan: 02
subsystem: reliability
tags: [pipeline-events, capture-ui, react, retry, polling, inngest]

# Dependency graph
requires:
  - phase: quick-260707-lyq (Plan 01)
    provides: "getAttemptOutcome(attemptId) journal-first read; startRecordingPipeline/transcribeRecording dispatchNonce plumbing"
provides:
  - "pollEstimateOutcome (lib/estimate/poll-outcome.ts) is journal-first: attemptId + onStageProgress opts, new 'failed' EstimateOutcome variant carrying the server's real step + reason"
  - "capture-recorder.tsx: all three dispatch-and-watch paths (audio/text/photos) read the journal via attemptId; stage progression comes from onStageProgress (journal lastStep), not a separate recordings/transcript/analyze-job poll"
  - "Real Retry: dispatchNonceRef + fresh requestId per retry click across ALL input types (previously audio-only); attemptId lineage + previousEstimateIdRef baseline preserved across retries"
  - "hooks/use-job-status.ts NOT_FOUND_GRACE_MS widened 20s -> 60s (second production run-creation lag observed)"
affects: [any future capture-recorder.tsx work touching stage progression, retry, or failure surfaces]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Journal-first client poll: read the server's pipeline_events journal FIRST each tick (getAttemptOutcome), fall through to a DB-truth fallback query only on pending/unauthorized — kills the ghost-estimate and stale-project-status races that a plain DB-truth poll is vulnerable to"
    - "skipReport escape hatch on a client telemetry helper (failAt) — when a failure's origin is already server-recorded (the journal), the client-side best-effort reporter must not re-report it under a synthetic code"
    - "Retry widened from a single-modality special case (audio only, gated on `audioBlob ? ... : undefined`) to a uniform `hasAnyInput` gate routing to whichever path (runPipeline/handleGenerate) matches the retained input state"

key-files:
  created: []
  modified:
    - lib/estimate/poll-outcome.ts
    - components/capture/capture-recorder.tsx
    - hooks/use-job-status.ts
    - tests/unit/estimate/poll-outcome.test.ts
    - tests/unit/hooks/poll-job-not-found-grace.test.ts

key-decisions:
  - "pollEstimateOutcome's recordingId/onTranscriptReady mechanism was REMOVED (not deprecated-in-place) in Task 1, ahead of Task 2 rewiring capture-recorder.tsx's call sites in the very next commit — this left a single, transient, self-resolving tsc error (an old call site referencing the removed opt) between the Task 1 and Task 2 commits. Chosen over leaving dead code in poll-outcome.ts (which Task 2's file scope doesn't touch) because the plan explicitly finalizes poll-outcome.ts in Task 1 only; verified clean again immediately after Task 2's commit."
  - "Retry widened to cover text/photos paths, not just audio. The plan's own Task 2e text ('Text/photos: fresh requestId alone already yields new event ids... verify and document') only makes sense if Retry is reachable for those paths — previously `onRetry` was hard-gated on `audioBlob ? ... : undefined`, so CaptureFailure never rendered a Retry button for text/photo failures at all. Replaced the gate with `hasAnyInput` and a single shared `handleRetry` that routes to `runPipeline(audioBlob)` when an audioBlob exists, else `handleGenerate()` (which re-evaluates the same existing text/audio/photos branch logic unchanged)."
  - "onStageProgress carries only `lastStep` (no `lastStatus`), matching Task 1's literal signature — the simplified map (save_recording->transcribing, transcribe/analyze->generating) fires on ANY journal row for that step (started or succeeded), not just succeeded. Chosen because Task 2's own parenthetical instruction gives this exact simplified mapping, and it's a strictly-earlier (never later) stage transition than a succeeded-only gate would give, which is the intended UX (advance stage as soon as there's forward journal evidence)."
  - "The journal 'unauthorized' state and the fallback's 'pending' state are NOT distinguished by the caller — both silently fall through to the DB-truth fallback query every tick. Matches the plan's explicit instruction ('unauthorized -> treat as pending') and getAttemptOutcome's own module doc (Wave 1): unauthorized is a scoping edge, never a user-facing failure."

requirements-completed: [QUICK-lyq-04]

# Metrics
duration: ~50min
completed: 2026-07-07
---

# Phase quick-260707-lyq Plan 02: Journal-first client outcomes + real Retry Summary

**capture-recorder.tsx's outcome/stage loop is now journal-first end-to-end: `pollEstimateOutcome` reads `getAttemptOutcome` before any DB-truth fallback, surfacing a real server failure reason in ~1 tick (was up to 6 minutes) and eliminating the ghost-estimate + stale-status races; Retry is now a genuine re-run (fresh requestId/dispatchNonce) across all three input types, not just audio.**

## Performance

- **Duration:** ~50 min (includes two full `npx vitest run` passes, ~10 min each, for flakiness confirmation)
- **Completed:** 2026-07-07
- **Tasks:** 3/3 completed
- **Files modified:** 5 (0 created, 5 modified)

## Accomplishments

- **`pollEstimateOutcome` is journal-first** (`lib/estimate/poll-outcome.ts`): gained `attemptId`/`onStageProgress` opts. When `attemptId` is present, every tick calls `getAttemptOutcome(attemptId)` FIRST — `completed`/`needs_details`/`failed` are journal-authoritative and end the poll immediately; a new `{ state: 'failed'; step; reason }` `EstimateOutcome` variant carries the server's REAL `error_message`. `pending` fires `onStageProgress(lastStep)` and falls through to the existing estimates/projects DB-truth fallback (kept as belt-and-braces for a journal-read hiccup) — except the fallback's own `awaiting_details` branch is now SKIPPED under `attemptId`, closing the production stale-status false positive (a leftover `projects.status='awaiting_details'` from a PRIOR attempt could otherwise fire instantly on a brand-new, still-pending retry). `unauthorized` is treated as `pending`. The now-redundant `recordingId`/`onTranscriptReady` transcript-poll mechanism was removed outright (superseded by `onStageProgress`).
- **capture-recorder.tsx is journal-driven**: all three dispatch-and-watch paths (audio via `runPipeline`, text and photos via `handleGenerate`) now pass `attemptId` + `onStageProgress` to `pollEstimateOutcome`. The old `raceEstimateOutcomeAgainstJob` helper (a `pollJob` fast-failure race against the transcribe/analyze job) and the now-dead `reasonForJobState` helper were deleted entirely — the journal surfaces a real failure within ~1 tick, making that race redundant. `handleEstimateOutcome` gained a `failed` branch: `failAt(stepToStageKey(outcome.step), outcome.reason, { skipReport: true })` — maps the journal's `step` back to the UI's `StageKey` and shows the server's real message, with client-side telemetry reporting suppressed (the journal already recorded it server-side).
- **Real Retry, widened to every input type**: `dispatchNonceRef` (new) is bumped and `requestIdRef` is nulled (then re-minted via `ensureAttempt()`) on every Retry click, while `attemptIdRef` (lineage) and `previousEstimateIdRef` (completion baseline) are deliberately left untouched. Both failure-card `onRetry` call sites now route through one shared `handleRetry` gated on `hasAnyInput` (previously hard-gated on `audioBlob`, so text/photo failures never even showed a Retry button) — `runPipeline(audioBlob)` when an audio take exists, else `handleGenerate()` for text/photos.
- **`NOT_FOUND_GRACE_MS`**: `hooks/use-job-status.ts` widened 20s -> 60s per a SECOND production run-creation lag (2026-07-07 19:45 UTC: Inngest run not visible until ~30s after event acceptance, deep inside the old 20s window).
- **Stale-comment cleanup**: the REC-03/REC-04 lineage comment block was rewritten (requestId is no longer reused on Retry — it and dispatchNonce are re-minted so a Retry is a genuine re-run), and `tests/unit/hooks/poll-job-not-found-grace.test.ts`'s doc comment updated to match the new 60s value (the fake-timer assertions themselves needed no change).

## Task Commits

Each task was committed atomically:

1. **Task 1: Journal-first pollEstimateOutcome** - `50aee6eb` (feat)
2. **Task 2: capture-recorder journal-driven stages + real Retry** - `f220f257` (feat)
3. **Task 3: Tests + full suite** - `0e276823` (test)

_No plan-metadata commit — per this execution's constraints, STATE.md/ROADMAP.md/REQUIREMENTS.md are NOT updated and PLAN files are NOT staged; this SUMMARY is the only doc artifact for this plan._

## Files Created/Modified

- `lib/estimate/poll-outcome.ts` - `pollEstimateOutcome` gained `attemptId`/`onStageProgress`; new `failed` `EstimateOutcome` variant; fallback's `awaiting_details` branch skipped under `attemptId`; removed `recordingId`/`onTranscriptReady`
- `components/capture/capture-recorder.tsx` - all 3 paths wired to journal-first polling; `raceEstimateOutcomeAgainstJob` + `reasonForJobState` removed; `failAt` gained `skipReport`; new `stepToStageKey`/`handleStageProgress`/`handleRetry` helpers; `dispatchNonceRef` added; both `onRetry` sites widened to `hasAnyInput`
- `hooks/use-job-status.ts` - `NOT_FOUND_GRACE_MS` 20_000 -> 60_000 + updated rationale comment
- `tests/unit/estimate/poll-outcome.test.ts` - 8 new `pollEstimateOutcome` tests (journal completed/needs_details/failed/pending-fallback/unauthorized/onStageProgress/stale-status regression/backward-compat); existing `evaluateOutcomeTick` suite unchanged
- `tests/unit/hooks/poll-job-not-found-grace.test.ts` - doc comment updated for the 60s grace value (assertions unchanged — already grace-value-agnostic via fake timers)

## Decisions Made

See `key-decisions` in frontmatter above: (1) Task 1 fully removes the transcript-poll mechanism rather than leaving it dead, accepting one transient inter-commit tsc error resolved by Task 2; (2) Retry widened to text/photos, not just audio, per the plan's own text; (3) `onStageProgress` fires on any journal row for a step (started or succeeded), not succeeded-only; (4) `unauthorized` and `pending` are handled identically (silent fallthrough).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, self-resolving] Task 1 alone introduced one transient tsc error, resolved by Task 2**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** Removing `recordingId`/`onTranscriptReady` from `pollEstimateOutcome`'s opts in Task 1 broke the OLD call site inside `raceEstimateOutcomeAgainstJob` (still present in `capture-recorder.tsx` at that point, since Task 2 hadn't run yet) — `TS2353: Object literal may only specify known properties, and 'recordingId' does not exist...`.
- **Fix:** No separate fix needed — Task 2 (executed immediately after, same session) deletes `raceEstimateOutcomeAgainstJob` entirely and rewires all call sites to the new `attemptId`/`onStageProgress` shape. Verified `npx tsc --noEmit` back to the exact 22-error baseline (zero diff) immediately after Task 2's commit.
- **Files modified:** `lib/estimate/poll-outcome.ts` (Task 1), `components/capture/capture-recorder.tsx` (Task 2)
- **Verification:** `diff` against the pre-change tsc baseline showed 0 lines after Task 2 (was +1 line after Task 1 alone).
- **Committed in:** `50aee6eb` (Task 1, transient), resolved by `f220f257` (Task 2)

**2. [Rule 2 - Missing functionality] Retry was audio-only before this plan; widened to text/photos**
- **Found during:** Task 2 (2e)
- **Issue:** Both `onRetry` call sites were hard-gated `audioBlob ? () => {...} : undefined` — a text-only or photos-only failure never even rendered a Retry button (`CaptureFailure` renders nothing when `onRetry` is `undefined`). The plan's own Task 2e text discusses verifying text/photos retry event-id behavior, which is moot if Retry is unreachable for those paths.
- **Fix:** Replaced the audio-only gate with `hasAnyInput ? handleRetry : undefined` at both call sites; `handleRetry` routes to `runPipeline(audioBlob)` when an audio take exists, else `handleGenerate()` (re-evaluating the SAME existing branch logic, unchanged).
- **Files modified:** `components/capture/capture-recorder.tsx`
- **Verification:** `grep -n "dispatchNonceRef"` gate passes; `npx tsc --noEmit` / `npx eslint` at baseline; manual code trace confirms `handleGenerate`'s branch selection is deterministic and unaffected by the retry path.
- **Committed in:** `f220f257` (Task 2 commit)

**3. [Rule 1 - Bug, doc staleness] `tests/unit/hooks/poll-job-not-found-grace.test.ts`'s doc comment referenced the old "(20s)" value**
- **Found during:** Task 3 (grep sweep for stale `20_000`/`20s` mentions after Task 2's `NOT_FOUND_GRACE_MS` change)
- **Issue:** The comment still said "grace-periods a `not_found` body for NOT_FOUND_GRACE_MS (20s)" after the constant became 60s — a direct, necessary consequence of Task 2a's change, in a file outside this plan's declared `<files>` scope for any single task but requiring only a comment fix (the fake-timer assertions themselves use `vi.runAllTimersAsync()`, not a hardcoded ms value, so they needed no code change).
- **Fix:** Updated the comment to state the 60s value + rationale, and noted the assertions are grace-value-agnostic.
- **Files modified:** `tests/unit/hooks/poll-job-not-found-grace.test.ts`
- **Verification:** `npx vitest run tests/unit/hooks/` — 253/253 pass (unchanged); `npx eslint` clean.
- **Committed in:** `0e276823` (Task 3 commit)

---

**Total deviations:** 3 (1 self-resolving transient bug across 2 commits, 1 missing-functionality widening, 1 doc-staleness fix)
**Impact on plan:** All directly caused by (or a necessary consequence of) this plan's own required changes. No scope creep — no unrelated files touched, no architectural changes, no user-facing behavior beyond what the plan already specified or implied.

## Issues Encountered

- **Full-suite flakiness, unrelated to this plan.** The first full `npx vitest run` reported 5 failed test files: `tests/unit/cleanup-route-auth.test.ts`, `tests/unit/company-action.test.ts`, `tests/unit/mcp-route-contract.test.ts`, `tests/unit/ai/empty-output-guards.test.ts`, and the already-documented pre-existing `tests/unit/components/landing-page.test.tsx` flake (baseline: "1 pre-existing landing-page flake"). Investigation: (1) none of the 4 non-landing-page files import `lib/estimate/poll-outcome.ts`, `components/capture/capture-recorder.tsx`, `hooks/use-job-status.ts`, or `lib/actions/attempt-outcome.ts` — confirmed via grep, zero hits; (2) all 4 failed with `Error: Test timed out in Nms` (5000-15000ms defaults), not an assertion mismatch; (3) `cleanup-route-auth.test.ts` re-run completely alone (not batched) still timed out, consistent with this dev machine's generally slow cold-import/transform time under vitest (the full run's own summary line showed `import 561.19s` cumulative — very high) rather than anything code-related; (4) `ai/empty-output-guards.test.ts` passed cleanly on a smaller re-run. A SECOND full `npx vitest run` was started to test the flakiness hypothesis directly: it reproduced a **DIFFERENT** set of unrelated timeouts (`tests/unit/whatsapp/never-reply-regression.test.ts`, `tests/unit/auth-actions.test.ts`, `tests/unit/price-book/price-book-item-dialog.test.tsx`) before this summary was written (the run was still in progress but had already diverged from the first run's failure set) — this is strong evidence of environment-driven non-determinism (parallel worker resource contention on this machine) rather than a deterministic regression from this plan's 5 changed files. Final tally used for the "vs baseline" comparison: **first full run — Test Files: 5 failed | 436 passed | 1 skipped (442); Tests: 5 failed | 3168 passed | 2 skipped | 17 todo (3192)**, vs. the documented baseline of "3148 pass / 1 pre-existing landing-page flake."
- The **targeted** suite for everything this plan actually touches is unambiguous: `npx vitest run tests/unit/estimate/ tests/unit/hooks/` — **253/253 passed**, 36/36 test files.
- `npx tsc --noEmit` and `npx eslint` on every touched file matched the pre-change baseline EXACTLY after every task's final state: 22 pre-existing tsc errors (identical diff), 6 pre-existing eslint problems across `capture-recorder.tsx` (2 React Compiler memoization-skip errors + 2 exhaustive-deps warnings, pre-existing and unrelated to this plan's edits) and `use-job-status.ts` (1 pre-existing set-state-in-effect error).

## Known Stubs

None — this plan is pure client-side wiring of an already-shipped server action (Wave 1); no new UI surface with unwired data.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- P4 (core bulletproofing, journal-first) is now complete client-to-server: Wave 1 (server journal read + real Retry dispatch + credit gates) + Wave 2 (client consumes the journal, real Retry UI, real failure reasons) together close the three production gaps this quick task was scoped for (ghost-estimate navigation, no-op Retry, silent 6-minute failure surfacing).
- Any future capture-recorder.tsx work should be aware: `pollJob` (hooks/use-job-status.ts) is no longer imported by capture-recorder.tsx at all — it remains in use by OTHER components (untouched here) with its own `NOT_FOUND_GRACE_MS`/backoff conventions.
- No DB migration required — this plan is pure application-code (no schema changes).

## Self-Check: PASSED

All modified files verified present and containing the expected changes (`grep -n "getAttemptOutcome" lib/estimate/poll-outcome.ts`, `grep -n "dispatchNonceRef" components/capture/capture-recorder.tsx`, `grep -n "60_000" hooks/use-job-status.ts` all matched; `raceEstimateOutcomeAgainstJob` fully absent from `capture-recorder.tsx`). All 3 task commit hashes (`50aee6eb`, `f220f257`, `0e276823`) verified present in `git log --oneline`.

---
*Phase: quick-260707-lyq*
*Completed: 2026-07-07*
