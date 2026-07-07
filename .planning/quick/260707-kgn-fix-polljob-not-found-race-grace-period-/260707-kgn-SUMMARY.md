---
phase: quick-260707-kgn
plan: 01
subsystem: reliability
tags: [capture, inngest, react-hooks, jobs, testing]

# Dependency graph
requires:
  - phase: quick-260707-hhp (Plan 02)
    provides: "raceEstimateOutcomeAgainstJob fast-failure race helper (pollJob vs pollEstimateOutcome) used by the audio + photos capture paths"
provides:
  - "hooks/use-job-status.ts: NOT_FOUND_GRACE_MS (20s) grace window — a not_found body within the window keeps polling instead of resolving terminal, in both pollJob and useJobStatus"
  - "components/capture/capture-recorder.tsx: raceEstimateOutcomeAgainstJob's not_found/config_unavailable job-race results are now advisory-only — never fast-fail the UI, never win the race; only a real 'failed' run does"
  - "tests/unit/hooks/poll-job-not-found-grace.test.ts: regression coverage for the exact production race (not_found → run appears → success)"
affects: [any future pollJob/useJobStatus consumer relying on not_found timing; capture-recorder retry/fast-failure UX]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Grace-windowed terminal state: a wire state that CAN mean 'not created yet' (not_found, because Inngest creates the run after accepting the event) is treated as non-terminal for a bounded window, then terminal past it — same shape as the existing processing branch, just time-boxed."
    - "Advisory race branch: within a Promise.race between a DB-truth poll and a fast-failure signal poll, a signal result that isn't actually informative (advisory state) is re-mapped to 'keep waiting on the DB truth' rather than allowed to win the race — avoids inventing a never-resolving sentinel or a second Promise.race."

key-files:
  created:
    - tests/unit/hooks/poll-job-not-found-grace.test.ts
  modified:
    - hooks/use-job-status.ts
    - components/capture/capture-recorder.tsx
    - tests/unit/hooks/use-job-status.test.ts

key-decisions:
  - "Chose 'inspect the race winner, then re-await the outcome promise' over a never-resolving sentinel promise for the advisory-state restructure — zero new timers, zero new abort plumbing; reuses the exact `await outcomePromise` pattern already used for the 'completed' progress-only branch."
  - "Fixed tests/unit/hooks/use-job-status.test.ts's pre-existing 'resolves a not_found result without throwing' test (broke immediately — real 5s test timeout — because it lacked fake timers once not_found stopped being instantly terminal). In scope per Rule 1: directly caused by this plan's Task 1 change, not a pre-existing unrelated flake."
requirements-completed: [QUICK-kgn-01]

# Metrics
duration: ~20min
completed: 2026-07-07
---

# Phase quick-260707-kgn: not_found grace window + advisory job race Summary

**Fixed a production false-failure ("We could not find this job — please retry.") caused by the client observing `not_found` from `/api/jobs/[jobId]` before Inngest had created the run (2-5s creation lag): `pollJob`/`useJobStatus` now grace-period a `not_found` body for 20s before treating it as terminal, and `capture-recorder`'s fast-failure job race now treats `not_found`/`config_unavailable` as advisory-only (logged, never fast-failed) — only a job Inngest itself reports as `failed` still fast-fails, with the DB outcome poll remaining the single source of truth.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-07
- **Tasks:** 3/3 completed
- **Files modified:** 4 (1 created, 3 modified)

## Accomplishments

- **`hooks/use-job-status.ts`** — added `NOT_FOUND_GRACE_MS = 20_000` and a grace branch in both `pollJob`'s loop and `useJobStatus`'s loop: a `not_found` body within 20s of poll start is treated like `processing` (sleep `POLL_MS`, continue); past the window it falls through to the existing terminal handling (`toJobResult`) unchanged. Wire contract, `toJobResult`, and all exported types untouched.
- **`components/capture/capture-recorder.tsx`** — `raceEstimateOutcomeAgainstJob` restructured so a job-race result of `not_found`/`config_unavailable` can never win the race or produce a user-facing failure: it's logged via `console.warn` and the function falls through to `await outcomePromise` directly (the same pattern already used for the `completed` progress-only branch), re-inspecting the result before the terminal `job-failed`/`outcome` return. Only `state === 'failed'` still fast-fails (`child.abort()` + `job-failed`). `completed` handling (progress signal, outcome poll still owns completion) is unchanged. No new timers or sentinels introduced — the existing `child` `AbortController` (tied to `parentSignal`) is the only abort mechanism, so unmount-during-race still cleans up everything with nothing left pending.
- **`tests/unit/hooks/poll-job-not-found-grace.test.ts`** (new) — 3 cases: (1) `not_found` twice then `completed` within the grace window resolves `completed` (the exact production sequence); (2) `not_found` persisting past the grace window resolves `not_found` (terminal); (3) a real `failed` result is still immediate (single fetch call, no waiting).
- **`tests/unit/hooks/use-job-status.test.ts`** — the pre-existing `not_found` test was directly broken by the new grace-window behavior (it had no fake timers, so it now waited out the 20s window against Vitest's 5s default timeout). Fixed by switching it to fake timers + `vi.runAllTimersAsync()`, matching the file's own B8 test conventions.

## Task Commits

Each task was committed atomically:

1. **Task 1: not_found grace window in pollJob + useJobStatus** - `df8749f9` (fix)
2. **Task 2: job race becomes advisory in capture-recorder** - `4e3b114a` (fix)
3. **Task 3: regression test for the exact production race** - `28502fa5` (test)

_No plan-metadata commit yet — pending this SUMMARY (STATE.md/ROADMAP.md updates intentionally skipped per this quick task's constraints)._

## Files Created/Modified

- `hooks/use-job-status.ts` - `NOT_FOUND_GRACE_MS` constant + grace branch in `pollJob` and `useJobStatus`
- `components/capture/capture-recorder.tsx` - `raceEstimateOutcomeAgainstJob` restructured: advisory-only not_found/config_unavailable handling, updated doc comment
- `tests/unit/hooks/poll-job-not-found-grace.test.ts` - New: 3-case regression suite for the grace window
- `tests/unit/hooks/use-job-status.test.ts` - Fixed the pre-existing not_found test to use fake timers (directly broken by Task 1)

## Decisions Made

- **Re-await over sentinel**: implemented the "advisory result never wins the race" requirement by inspecting the `Promise.race` winner and, if it's an advisory job state, re-mapping `firstSettled` to `{ kind: 'outcome', outcome: await outcomePromise }` — rather than constructing a never-resolving promise tied to the abort signal. Simpler, introduces no new timers/listeners, and reuses the exact code path already proven for the `completed` progress-only case (`pollEstimateOutcome` already has its own 6-minute timeout and aborts cleanly on `child.signal`, confirmed by reading `lib/estimate/poll-outcome.ts` before choosing this approach).
- **In-scope test fix**: `tests/unit/hooks/use-job-status.test.ts`'s `not_found` test started failing (5000ms timeout) the moment Task 1 landed, because it asserted immediate resolution with real timers. This is squarely Rule 1 (bug directly caused by the current task's change, not a pre-existing/unrelated flake) — fixed inline with fake timers rather than deferred.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed a test broken by Task 1's grace-window change**
- **Found during:** Task 1 verification (ran the existing hook test suite as a sanity check beyond the plan's grep/eslint/tsc verify command)
- **Issue:** `tests/unit/hooks/use-job-status.test.ts`'s `'resolves a not_found result without throwing'` test called `pollJob` with real timers and asserted immediate `not_found` resolution — broken by design once `not_found` became grace-windowed (20s), causing a 5000ms Vitest test timeout.
- **Fix:** Switched the test to `vi.useFakeTimers()` + `vi.runAllTimersAsync()` (matching the file's existing B8 fake-timer convention) and renamed it to reflect the new behavior ("... after the grace window elapses").
- **Files modified:** `tests/unit/hooks/use-job-status.test.ts`
- **Verification:** `npx vitest run tests/unit/hooks/use-job-status.test.ts` — 11/11 pass.
- **Committed in:** `28502fa5` (Task 3 commit, alongside the new regression test file)

---

**Total deviations:** 1 auto-fixed (Rule 1, bug directly caused by this plan's own Task 1 change).
**Impact on plan:** Necessary — without it, this plan's own Task 1 change would leave a broken/timing-out test on `dev`. No scope creep: only the one test directly invalidated by the new behavior was touched.

## Issues Encountered

- **Baseline verification (`git stash` not needed — compared before/after directly):** established pre-existing `eslint`/`tsc` baselines before editing: `hooks/use-job-status.ts` + `components/capture/capture-recorder.tsx` together had 6 pre-existing eslint problems (3 errors, 3 warnings — React Compiler "existing memoization could not be preserved" + `exhaustive-deps` `t` warnings + a `set-state-in-effect` error, all pre-existing and unrelated to this fix); `npx tsc --noEmit` had 22 pre-existing errors project-wide, none in either target file. After all 3 tasks: same 6 eslint problems (same messages, shifted line numbers only), same 22 tsc errors, still none in the two modified source files. Zero new problems introduced.
- **Full regression check:** ran `npx vitest run tests/unit/hooks/ tests/unit/estimate/` (36 files, 245 tests) after all three tasks — all green, confirming the capture-recorder/poll-outcome interaction and the wider estimate-outcome test suite are unaffected by the advisory-race restructure.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The exact 18:40 production sequence (not_found → run created 2s later → success) is now covered by both the grace window (root fix, `hooks/use-job-status.ts`) and the advisory race (belt-and-braces, `capture-recorder.tsx`) — either alone would have prevented the false failure; both are in place.
- No blockers. This is a standalone reliability fix; no follow-up plan is required unless further production evidence surfaces a different race shape.

## Self-Check: PASSED

Verified `tests/unit/hooks/poll-job-not-found-grace.test.ts` exists on disk (FOUND); verified all 3 task commit hashes present in `git log --oneline --all` (`df8749f9` FOUND, `4e3b114a` FOUND, `28502fa5` FOUND).

---
*Phase: quick-260707-kgn*
*Completed: 2026-07-07*
