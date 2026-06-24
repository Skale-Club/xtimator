---
phase: 110-real-cost-capture-foundation-measure-only-mode
plan: 03
subsystem: billing
tags: [whisper, stt, cost-capture, measure-only, never-throw, inngest, vitest, tdd]

# Dependency graph
requires:
  - phase: 110-real-cost-capture-foundation-measure-only-mode
    plan: 01
    provides: recordAICost(ev: AICostInput) never-throw helper + ai_cost_events table
provides:
  - "WHISPER_USD_PER_MINUTE env-overridable module const + computeWhisperCostUsd() pure helper (minutes × rate; 0/unknown → null)"
  - "Computed Whisper cost recorded on transcribe success, correlated by attempt_id alone (no usage_event coupling)"
affects: [111-billing-config, 112-credit-ledger, 116-calibration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Computed (not parsed) provider cost: Whisper returns only text, so cost = (duration_seconds / 60) × module-const rate"
    - "Env-overridable rate const (mirrors MAX_RESEARCH_ITEMS_PER_ESTIMATE) — Phase 111 billing_config makes this the fallback"
    - "null vs 0 discipline: 0/unknown/invalid duration → null so calibration excludes it from the mean"
    - "Never-throw cost capture as a fire-and-forget side effect (void recordAICost(...)) after pipeline success"

key-files:
  created:
    - lib/billing/whisper-cost.ts
    - tests/unit/billing/whisper-cost.test.ts
  modified:
    - lib/inngest/functions/transcribe-audio.ts

key-decisions:
  - "Whisper cost is COMPUTED from existing recordings.duration_seconds, never parsed (provider returns no cost)"
  - "WHISPER_USD_PER_MINUTE is a module const this phase (default 0.006, env-overridable); the configurable billing_config rate arrives in Phase 111"
  - "Gemini transcription fallback is hidden inside transcribeAudioOR — the job records provider:'openai' with the computed cost; precise Gemini attribution deferred (never guess a Gemini rate, never record 0)"
  - "Cost capture stands on attempt_id alone — it does NOT depend on (and does NOT create) an audio usage_event; metering is a Phase 112 decision"

patterns-established:
  - "Computed provider cost helper as a pure, fully-tested module (rate const + compute fn), separate from the wiring"

requirements-completed: [COST-02]

# Metrics
duration: 6min
completed: 2026-06-24
---

# Phase 110 Plan 03: Real Cost Capture Foundation + Measure-Only Mode Summary

**Computed Whisper/STT cost — `(recordings.duration_seconds / 60) × WHISPER_USD_PER_MINUTE` recorded on transcribe success via the Plan-01 never-throw `recordAICost()`, correlated by attempt_id alone, with 0/unknown duration → null and no guessed Gemini rate.**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-24T15:09:42Z
- **Completed:** 2026-06-24T15:15:40Z
- **Tasks:** 2
- **Files modified:** 2 created, 1 modified

## Accomplishments
- `lib/billing/whisper-cost.ts` — `WHISPER_USD_PER_MINUTE` env-overridable module const (default 0.006) + pure `computeWhisperCostUsd(durationSeconds)`: `(s / 60) × rate` for `s > 0`, else `null` (0 / null / undefined / negative / NaN → null). No charging arithmetic.
- Wired the computed cost into the transcribe-audio Inngest job: `loadCompanyForRecording` now selects + returns `duration_seconds`; after the terminal-success `recordPipelineEvent`, a `void recordAICost({ operationType: 'audio_minutes', provider: 'openai', model: 'whisper-1', realCostUsd: computeWhisperCostUsd(ident.durationSeconds), ... })` records the cost keyed by `attemptId`, with `units = minutes` (or null when ≤ 0).
- 7 Wave-0 TDD tests (minutes × rate, fractional minute, 0/null/undefined/negative/NaN → null, positive default rate) — RED → GREEN. Full suite green: 281 files / 1967 tests (no regressions on the ~1957 baseline; +1 file / +8 tests).

## Task Commits

Each task was committed atomically (normal hooked commits — gitleaks ran, no `--no-verify`, no leaks found):

1. **Task 1: Pure Whisper cost module (TDD)** - `41f14893` (test, RED) → `424684a` (feat, GREEN)
2. **Task 2: Record Whisper cost on transcribe success** - `742b606` (feat)

**Plan metadata:** (docs commit — STATE/ROADMAP/SUMMARY)

## Files Created/Modified
- `lib/billing/whisper-cost.ts` - `WHISPER_USD_PER_MINUTE` const + `computeWhisperCostUsd()`. Pure, no DB, no provider seam, no charging code.
- `tests/unit/billing/whisper-cost.test.ts` - 8 tests: rate positivity/default + 7 compute cases including the full null-vs-0 ladder.
- `lib/inngest/functions/transcribe-audio.ts` - `loadCompanyForRecording` loads `duration_seconds`; `void recordAICost(...)` recorded alongside the terminal-success pipeline event; imports `recordAICost` + `computeWhisperCostUsd`. No `recordUsage`, no `audio_transcribed` event.

## Decisions Made
- Cost is COMPUTED from the existing `recordings.duration_seconds`, never parsed (Whisper returns no usage/cost).
- Rate stays a module const this phase (env-overridable); Phase 111 `billing_config` becomes the runtime source with this const as the fallback.
- The job records `provider:'openai'` with the computed cost for the success path. The Gemini fallback is hidden inside `transcribeAudioOR`, so precise provider attribution would require a `transcribeAudioOR` return-value change — deferred. We never guess a Gemini rate and never record `real_cost_usd = 0`.
- Cost correlation rides on `attempt_id` alone; no `audio_transcribed` usage_event is created (Phase 112 owns the metering decision).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Forbidden charging tokens in the whisper-cost doc comment**
- **Found during:** Task 1 (acceptance grep "File contains NO `markup`, `debit`, `credit`, `ledger`")
- **Issue:** The plan's verbatim doc-comment line "Measure-only: no markup, no debit here." contains the forbidden `markup`/`debit` tokens the measure-only static guards (Plan 110-01) scan for across billing modules — the same prose-token collision Plan 110-01 hit twice.
- **Fix:** Reworded to "Measure-only: this module computes the real cost only — no charging arithmetic." — same intent, zero forbidden tokens.
- **Files modified:** lib/billing/whisper-cost.ts
- **Verification:** `grep -ci "markup\|debit\|credit\|ledger"` → 0; 8/8 whisper-cost tests still green.
- **Committed in:** `424684a` (Task 1 GREEN commit)

---

**Total deviations:** 1 auto-fixed (1 prose-token collision with the phase's measure-only static guard — rewording strengthens the measure-only contract).
**Impact on plan:** No scope change. The cost math, constant, and all wiring match the plan exactly.

## Issues Encountered
None beyond the single guard-caught prose collision documented above.

## Deferred / Known Follow-ups
- **Gemini transcription-fallback provider attribution:** the success path is currently recorded as `provider:'openai'` with the computed cost because `transcribeAudioOR` does not return which provider ran. Precise attribution needs a `transcribeAudioOR` return-value change — deferred (out of scope; the computed OpenAI rate is the measure-only approximation; the Gemini cost is never guessed and never recorded as 0).
- **Operational (inherited):** apply migration `20260624000003` (ai_cost_events, Plan 110-01) to remote via the CI→GHCR→Coolify pipeline — the new `recordAICost` write targets that table.

## User Setup Required
None — no external service configuration. `WHISPER_USD_PER_MINUTE` is optional (defaults to 0.006); set it in env to override the rate during the measure-only window.

## Next Phase Readiness
- COST-02 is live: the transcribe job records computed Whisper cost into `ai_cost_events`, correlated by `attempt_id`, joinable with `pipeline_events` and the Langfuse trace.
- Phase 111 (`billing_config`) can replace the `WHISPER_USD_PER_MINUTE` const read with a runtime-config read (the const becomes the fallback).
- Phase 110 is now 3/3 plans — the phase's cost-capture foundation (OpenRouter parsed cost + computed Whisper cost) is complete and measure-only. No blockers.

## Known Stubs
None — `computeWhisperCostUsd` is fully implemented and tested; the transcribe job records real computed cost. No placeholder/empty-value stubs introduced.

## Self-Check: PASSED

All created files exist on disk; all task commits present in git history (verified below).

---
*Phase: 110-real-cost-capture-foundation-measure-only-mode*
*Completed: 2026-06-24*
