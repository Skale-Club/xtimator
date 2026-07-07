---
phase: quick-260707-o7a
plan: 01
subsystem: capture-ux
tags: [pipeline-events, progress-bar, capture-ui, react, web-speech-removal, i18n]

# Dependency graph
requires:
  - phase: quick-260707-lyq (P4 Waves 1-2)
    provides: "journal-first getAttemptOutcome + pollEstimateOutcome attemptId/onStageProgress plumbing this progress bar is built on"
provides:
  - "lib/estimate/progress-model.ts: pure computeProgress (STEP_SEQUENCES per mode, FALLBACK_MEDIANS_MS, ACTIVE_FILL_CAP=0.95) — segments only complete on journal succeeded events"
  - "getAttemptOutcome pending variant carries completedSteps + activeStepStartedAt; new getStepMedians() server action (live 30-day per-step medians, fallback-merged, never throws)"
  - "pollEstimateOutcome onStageProgress forwards a StageProgress object ({ lastStep, completedSteps, activeStepStartedAt }), no longer a bare lastStep string"
  - "CaptureProcessingOverlay renders a real segmented progress bar + current step label + elapsed seconds when given mode/progress props; stage-only callers (inline-audio-recorder) keep the original render"
  - "capture-recorder.tsx: Web Speech API live caption FULLY removed (types, ref, states, setup/stops, markup, RecorderBody props)"
affects: [any future capture overlay/progress work, any onStageProgress consumer]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Honest progress: segment completion = journal succeeded event; in-segment fill = elapsed/median hard-capped at 0.95 until confirmed — the local 250ms timer only re-computes elapsed, it never advances state"
    - "Live-median telemetry read (getStepMedians): percentile_disc(0.5) semantics computed in JS over a bounded recent window (2000 rows/30 days) because PostgREST can't express grouped percentiles without a DB function — merged over static fallbacks, auth-gated, never throws"

key-files:
  created:
    - lib/estimate/progress-model.ts
    - tests/unit/estimate/progress-model.test.ts
  modified:
    - lib/actions/attempt-outcome.ts
    - lib/estimate/poll-outcome.ts
    - components/capture/capture-processing-overlay.tsx
    - components/capture/capture-recorder.tsx
    - tests/unit/estimate/poll-outcome.test.ts

key-decisions:
  - "Equal-share segment weighting (not median-weighted): median-weighting would shrink save_recording (~2s) to a ~4% sliver next to generate_estimate (~35s), defeating the segmented bar's legibility — the real timing lives in the in-segment fill instead (documented in progress-model.ts)"
  - "New pending fields (completedSteps/activeStepStartedAt) are REQUIRED on the AttemptOutcome pending variant (plan's literal spec) — forced updating poll-outcome.test.ts's three pending mocks in Task 1 (Rule 3, see Deviations) instead of Task 3"
  - "getStepMedians computes percentile_disc(0.5) in JS over the most-recent 2000 succeeded rows (30-day window): the plan names the SQL aggregate but ships no migration, and PostgREST cannot express a grouped percentile without a DB function — identical result for the bounded window"
  - "Medians cache: a requested-flag ref guards the once-per-session fetch (plan: 'client caches in a ref'), but the VALUE is mirrored into state — a bare ref write would never re-render, so the medians prop would not reach the overlay"
  - "activeStep is derived client-side (handleStageProgress): lastStep when it lacks a succeeded event, else null — the pending payload carries lastStep + completedSteps, so no extra server field was needed"
  - "stage === 'done' renders the bar full in the overlay: still honest — 'done' only ever follows a journal-authoritative completed outcome (the confirmation arrived as the terminal poll result rather than a pending tick)"

requirements-completed: [QUICK-o7a-01, QUICK-o7a-02]

# Metrics
duration: ~25min
completed: 2026-07-07
---

# Phase quick-260707-o7a Plan 01: Real journal-driven progress bar + Web Speech caption removal Summary

**The capture processing overlay now shows a segmented progress bar derived exclusively from real pipeline_events journal data (segment completes only on its succeeded event; in-segment fill = elapsed vs live 30-day median, capped at 95% until confirmed) with the current step name + elapsed seconds; the Web Speech API live caption is fully removed from capture-recorder.tsx — Whisper is the only transcription and recording shows waveform + timer + Listening pulse only.**

## Performance

- **Duration:** ~25 min (including a restart after a transient API/network termination on the first launch — zero work had landed, re-executed from Task 1)
- **Completed:** 2026-07-07
- **Tasks:** 3/3 completed
- **Files modified:** 7 (2 created, 5 modified)

## Accomplishments

- **`lib/estimate/progress-model.ts` (new, pure):** `computeProgress({ mode, completedSteps, activeStep, activeStepElapsedMs, medians })` → `{ fraction, segments[] }`. `STEP_SEQUENCES` per mode (audio: save_recording→transcribe→generate_estimate; photos: save_recording→analyze→generate_estimate; text: save_recording→generate_estimate), `FALLBACK_MEDIANS_MS` from production measurements (2s/8s/12s/35s), `ACTIVE_FILL_CAP = 0.95`. Equal-share segments; done→1 only via journal succeeded, active→min(elapsed/median, 0.95), pending→0. No Date.now() inside; out-of-sequence steps ignored; degenerate medians and negative elapsed clamped.
- **`lib/actions/attempt-outcome.ts`:** the pending `AttemptOutcome` variant now carries `completedSteps` (first succeeded occurrence per step, journal order) and `activeStepStartedAt` (created_at of the latest started row whose step has no succeeded row) — additive, other variants untouched; `created_at` added to the journal select. New `getStepMedians()` server action: auth-gated like `getAttemptOutcome`, company-agnostic (durations only), last-30-days `succeeded` rows with `duration_ms`, per-step `percentile_disc(0.5)` merged over the static fallbacks, returns fallbacks on ANY failure, called once per capture session.
- **`lib/estimate/poll-outcome.ts`:** `onStageProgress` now receives an exported `StageProgress` object `{ lastStep, completedSteps, activeStepStartedAt }` (was a bare `lastStep` string).
- **`components/capture/capture-processing-overlay.tsx`:** additive props `{ mode, completedSteps, activeStep, activeStepStartedAt, medians }` — when `mode` is present, renders the segmented bar (per-segment `data-state` + width from `computeProgress`), current step label via inline `t()` literals ('Saving' / 'Transcribing' / 'Analyzing photos' / 'Generating estimate') and elapsed seconds (e.g. "· 18s"). A local 250ms timer re-computes elapsed only — the bar's STATE comes from the journal and the active fill waits capped at 95% of its segment until the succeeded event lands. Stage-only callers (`inline-audio-recorder.tsx` passes just `stage="saving"`) keep the original TowerLoader + label render unchanged.
- **`components/capture/capture-recorder.tsx`:** `attemptProgress` state fed by the reshaped `handleStageProgress` (also derives `activeStep` = lastStep-without-succeeded); progress reset on every dispatch/retry and on the awaiting_details reset; `getStepMedians` fetched once per session (requested-flag ref + state mirror); popup overlay receives `mode={activeMode}` + full progress props. **Web Speech API removal is total:** `SpeechRecognitionInstance`/`SpeechRecognitionCtor` types, `speechRecognitionRef`, `liveTranscript`/`interimTranscript` states, the recognition setup block in `startRecording`, both `.stop()` calls (stopRecording + unmount cleanup), the live-transcript overlay markup, and the `liveTranscript`/`interimTranscript` RecorderBody props — `grep -E "SpeechRecognition|liveTranscript|interimTranscript"` on the file returns nothing. The recording overlay keeps waveform + timer + `t('Listening...')` pulse; the estimate-language selector and everything else is untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Progress model + live medians** - `7023be84` (feat)
2. **Task 2: Real progress overlay + Web Speech removal** - `09dfc979` (feat)
3. **Task 3: Progress model coverage** - `c99ea622` (test)

_No plan-metadata commit — per this execution's constraints, STATE.md/ROADMAP.md are NOT updated and PLAN files are NOT staged; this SUMMARY is the only doc artifact for this plan._

## Files Created/Modified

- `lib/estimate/progress-model.ts` (new) - pure progress computation, fully unit-tested
- `lib/actions/attempt-outcome.ts` - pending variant + `getStepMedians()`
- `lib/estimate/poll-outcome.ts` - `StageProgress` payload through `onStageProgress`
- `components/capture/capture-processing-overlay.tsx` - segmented real progress UI (additive props)
- `components/capture/capture-recorder.tsx` - progress state/medians wiring + total Web Speech removal
- `tests/unit/estimate/progress-model.test.ts` (new) - 12 tests
- `tests/unit/estimate/poll-outcome.test.ts` - pending mocks + onStageProgress payload assertion updated

## Decisions Made

See `key-decisions` in frontmatter: equal-share weighting (legibility over median-weighting), required pending fields (plan-literal, forcing the Task 1 mock update), JS-side percentile over a bounded window (no migration shipped), ref-guard + state-mirror for the medians cache, client-side activeStep derivation, and the honest stage='done' full-bar render.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] poll-outcome.test.ts pending mocks updated in Task 1 (ahead of Task 3's designated test window)**
- **Found during:** Task 1 verification (`npx tsc --noEmit`)
- **Issue:** Making `completedSteps`/`activeStepStartedAt` REQUIRED on the pending variant (the plan's literal 1b spec) broke the three existing `mockResolvedValue({ state: 'pending', ... })` sites in `tests/unit/estimate/poll-outcome.test.ts` at type-check time — Task 1's own verify gate (tsc zero-diff vs the 22-error baseline) could not pass otherwise. Task 3 is the plan's designated place for test updates, but that would have left Tasks 1-2 failing their tsc gates.
- **Fix:** Added the two new fields to the three pending mocks in the Task 1 commit. The onStageProgress ASSERTION change (the actual Task 2 signature break, runtime-only) was left for Task 3 as planned.
- **Files modified:** `tests/unit/estimate/poll-outcome.test.ts`
- **Verification:** tsc zero-diff vs baseline after Task 1; suites green after Task 3.
- **Commit:** `7023be84`

**Total deviations:** 1 (a scope-timing shift of plan-anticipated test updates, forced by the per-task tsc gate). No architectural changes, no unrelated files touched.

## Issues Encountered

- **Transient inter-commit test redness (expected, self-resolving):** between Task 2 (`09dfc979`, onStageProgress payload change) and Task 3 (`c99ea622`, assertion update), one poll-outcome test assertion was stale at runtime — tsc/eslint gates were clean throughout, and Task 3's verify (`npx vitest run tests/unit/estimate/ tests/unit/capture/` → **38 files, 267/267 passed**) closed it in the very next commit. Mirrors the documented lyq precedent for cross-task signature changes.
- **First launch of this executor died to a transient API/network error (SSL hostname mismatch) before any change landed** — confirmed zero progress via git log/tree and re-executed the plan from the beginning on branch tip `0d9e6173` (the interleaved mv1 commits touched none of this plan's files).

## Verification Results

- `npx tsc --noEmit`: **zero diff vs the 22-error pre-existing baseline** after every task.
- `npx eslint` on all touched files: **exactly the baseline 5 problems** in capture-recorder.tsx (2 pre-existing React Compiler memoization-skip errors + 3 pre-existing 't' exhaustive-deps warnings, line numbers shifted only); all other touched files clean.
- Grep gates: `SpeechRecognition|liveTranscript|interimTranscript` → **zero hits** in capture-recorder.tsx; `computeProgress|progress-model` present in capture-processing-overlay.tsx.
- Targeted suites: `tests/unit/estimate/ tests/unit/capture/` → **267/267 passed (38 files)**, including the 12 new progress-model tests.
- Post-deploy manual check (user): record → bar advances segment-by-segment matching /admin/events timestamps; no live caption anywhere.

## Known Stubs

None — the bar is fully wired to real journal data end-to-end (server payload → poll → recorder state → overlay), and the medians path has a real fallback, not a placeholder.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Any future `onStageProgress` consumer must accept the `StageProgress` object (exported from `lib/estimate/poll-outcome.ts`).
- If a `pipeline_events` grouped-percentile DB function (RPC) ever ships, `getStepMedians` can swap its JS aggregation for a single SQL call without changing its contract.
- `CaptureProcessingOverlay`'s progress props are additive — `inline-audio-recorder.tsx` (stage-only) needs no change; wiring it to the real bar later only requires passing the same props capture-recorder now passes.

## Self-Check: PASSED

- Files: `lib/estimate/progress-model.ts`, `tests/unit/estimate/progress-model.test.ts` exist; all 5 modified files contain the expected changes (grep-verified: `getStepMedians` in attempt-outcome.ts, `StageProgress` in poll-outcome.ts, `computeProgress` in the overlay, zero Web Speech hits in capture-recorder.tsx).
- Commits: `7023be84`, `09dfc979`, `c99ea622` all present in `git log`.

---
*Phase: quick-260707-o7a*
*Completed: 2026-07-07*
