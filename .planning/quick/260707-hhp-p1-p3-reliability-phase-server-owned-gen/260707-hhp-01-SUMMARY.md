---
phase: quick-260707-hhp
plan: 01
subsystem: reliability
tags: [inngest, cron, pipeline-events, supabase-view, server-actions, watchdog]

# Dependency graph
requires:
  - phase: quick-260707-grq
    provides: "recordPipelineEvent early-return instrumentation in createRecording/createTextRecording/transcribeRecording"
provides:
  - "startRecordingPipeline: single server round trip composing createRecording + transcribeRecording(autoGenerateEstimate)"
  - "createTextRecording options.autoGenerateEstimate chain (jobId sibling key, dispatch_failed telemetry)"
  - "analyze-photos job dispatch-generate-estimate chain step (flag-gated, mirrors transcribe-audio.ts)"
  - "pipelineWatchdogJob cron (*/10 min): marks 15min-stale pending attempts failed + alerts ops"
  - "pipeline_attempts terminal_status v2 migration (latest-event semantics) — NOT yet applied"
  - "events-helpers.ts terminalStatus() updated to latest-event semantics"
affects: [quick-260707-hhp-02 (client-side wiring of startRecordingPipeline)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Chain-dispatch step mirrored across all 3 input paths (audio/text/photos): lazy-imported inngest client, try/caught send, dispatch_failed pipeline event on failure"
    - "Cron sweep extracted as pure/injectable-deps function (sweepStuckAttempts({svc, now})) for unit testability without the Inngest step harness — mirrors notification-cleanup.ts's runNotificationCleanup shape"
    - "Latest-event semantics (classifyLastEvent) shared conceptually across the SQL view CASE, the watchdog job, and the client-side events-helpers.ts terminalStatus()"

key-files:
  created:
    - lib/inngest/functions/pipeline-watchdog.ts
    - supabase/migrations/20260707000001_pipeline_attempts_terminal_status_v2.sql
    - tests/unit/inngest/pipeline-watchdog.test.ts
  modified:
    - lib/actions/recording.ts
    - lib/inngest/events.ts
    - lib/inngest/functions/analyze-photos.ts
    - app/api/analyze-photos/route.ts
    - lib/inngest/functions/index.ts
    - app/api/inngest/route.ts
    - lib/admin/events-helpers.ts
    - tests/unit/admin/event-step-timeline.test.ts
    - tests/unit/actions/recording-early-return-events.test.ts

key-decisions:
  - "startRecordingPipeline's error-forwarding branches reconstruct { error } fresh (created.error ?? fallback) instead of forwarding the union object as-is — TS widens createRecording/transcribeRecording's inferred multi-branch return type to include `string | undefined` on the error field, and the fallback is unreachable at runtime (every branch always assigns a real message)."
  - "analyze-photos chain step placed right after the vision Promise.all (descriptions persisted) and before record-usage/record-credit-debit — earliest point satisfying the plan's 'after descriptions written, before success notify/return' window."
  - "Watchdog sweep does NOT auto-redispatch (documented non-goal in the file header) — re-dispatch risks double-charging and timeline pollution; owner gets a Telegram alert + existing manual retry button."
  - "Migration file created but NOT applied — per constraints, orchestrator applies it via Supabase MCP after review."

requirements-completed: [QUICK-hhp-01, QUICK-hhp-02]

# Metrics
duration: ~25min
completed: 2026-07-07
---

# Phase quick-260707-hhp Plan 01: Server-owned generation chain + pipeline watchdog Summary

**Server-owned transcribe/analyze→generate chain for all 3 capture paths (audio/text/photos), plus a 10-minute cron watchdog and a `pipeline_attempts.terminal_status` v2 migration fixing a bug where any multi-event attempt (including completed ones) reported `'started'` forever.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-07
- **Tasks:** 3/3 completed
- **Files modified:** 12 (3 created, 9 modified)

## Accomplishments

- **startRecordingPipeline** composes `createRecording` + `transcribeRecording(..., { autoGenerateEstimate: true })` into one server action, with a Retry path (pass `recordingId` to skip creation and re-dispatch only — deduped by Inngest's idempotent `transcribe-${recordingId}` event id).
- **createTextRecording** gains an optional `autoGenerateEstimate` chain: dispatches `EVENT_ESTIMATE_GENERATE` after the save succeeds, returns `jobId` as a sibling key (existing callers destructuring `{ data }` compile unchanged), and records a `dispatch_failed` pipeline event + friendly error on dispatch failure.
- **analyze-photos job** dispatches the same chain event (`inputType: 'photo'`) right after per-photo descriptions are persisted, gated on a new additive `autoGenerateEstimate`/`estimateLanguage` pair on `AnalyzePhotosPayload`, forwarded from `/api/analyze-photos`'s JSON body (validated, ignored when absent — fully backward compatible).
- **pipelineWatchdogJob** cron (`*/10 * * * *`): sweeps `pipeline_attempts` for attempts whose latest event is `>15min` stale and still `'pending'` (not done, not already failed), records one `watchdog_timeout` failed event + one `notifyOps` Telegram alert per attempt, and skips attempts already flagged (idempotent across runs). Explicitly does NOT auto-redispatch (documented non-goal).
- **pipeline_attempts terminal_status v2** migration (created, not applied): fixes the precedence bug (`failed > started > succeeded` made any multi-event attempt show `'started'` forever) with latest-event semantics matching the watchdog's `classifyLastEvent`. `lib/admin/events-helpers.ts`'s `terminalStatus()` (used by the attempt detail page header) updated to the same semantics so the detail page agrees with the list page.

## Task Commits

Each task was committed atomically:

1. **Task 1: Chain plumbing — startRecordingPipeline, createTextRecording flag, analyze-photos chain** - `430e0edc` (feat)
2. **Task 2: Watchdog cron + pipeline_attempts terminal_status v2** - `0127b4fa` (feat)
3. **Task 3: Server-side tests** - `f59d12e1` (test)

_No plan-metadata commit yet — pending this SUMMARY + STATE.md update._

## Files Created/Modified

- `lib/actions/recording.ts` - Added `startRecordingPipeline`; `createTextRecording` gained `options.autoGenerateEstimate` chain
- `lib/inngest/events.ts` - `AnalyzePhotosPayload` gained additive `autoGenerateEstimate`/`estimateLanguage` fields
- `lib/inngest/functions/analyze-photos.ts` - Added `dispatch-generate-estimate` step mirroring transcribe-audio.ts
- `app/api/analyze-photos/route.ts` - Accepts + validates + forwards the two new optional body fields
- `lib/inngest/functions/pipeline-watchdog.ts` - New: `classifyLastEvent`, `sweepStuckAttempts`, `pipelineWatchdogJob` cron
- `lib/inngest/functions/index.ts` / `app/api/inngest/route.ts` - Registered `pipelineWatchdogJob`
- `supabase/migrations/20260707000001_pipeline_attempts_terminal_status_v2.sql` - New view definition (NOT applied)
- `lib/admin/events-helpers.ts` - `terminalStatus()` updated to latest-event semantics
- `tests/unit/admin/event-step-timeline.test.ts` - `terminalStatus` tests updated for v2 semantics
- `tests/unit/inngest/pipeline-watchdog.test.ts` - New: classification + sweep coverage
- `tests/unit/actions/recording-early-return-events.test.ts` - Added `createTextRecording` chain dispatch tests (failure + success)

## Decisions Made

- **Error-object reconstruction in startRecordingPipeline**: TypeScript's inferred multi-branch return type for `createRecording`/`transcribeRecording` widens the `error` field to include `undefined` (a compiler artifact of merging structurally-identical `{error: T}` return statements with differing literal `T`s alongside the `{data: ...}` branch). Rather than forwarding `created`/`dispatched` as-is (which fails the explicit `Promise<{data:...} | {error: string}>` return type), both branches reconstruct `{ error: created.error ?? '<fallback>' }` — the fallback is unreachable at runtime since every real branch always assigns a defined message.
- **Chain step placement in analyze-photos.ts**: placed immediately after the vision `Promise.all` (descriptions durably persisted) and before `record-usage`/`record-credit-debit`, satisfying the plan's "after descriptions written, before success notify/return" window at the earliest safe point.
- **Watchdog is a backstop, not a fixer**: no auto-redispatch — documented as a deliberate non-goal in the file header, consistent with the plan's stated rationale (double-charge risk + timeline pollution; owner already has a manual retry button from 260521-jx9).
- **Migration NOT applied**: file created only; per the constraints, the orchestrator applies it via Supabase MCP `apply_migration` after review (remote drift blocks a plain `db push`).

## Deviations from Plan

None — plan executed exactly as written. The only implementation-level judgment calls (TS error-type widening workaround, exact chain-step placement in analyze-photos.ts) are documented above under Decisions Made since they were within the plan's stated intent, not deviations from it.

## Issues Encountered

- TypeScript's inferred return type for `createRecording`/`transcribeRecording` (no explicit return-type annotation on either function) widened the `error` field of the narrowed `'error' in result` branch to `string | undefined` when merged with the `{data: ...}` success branch. Root-caused via a scratch type-probe file (removed after use, not committed) rather than guessing; resolved via explicit `{ error: created.error ?? fallback }` reconstruction at both call sites in `startRecordingPipeline`. No behavior change — the fallback string is never reached at runtime.

## User Setup Required

None - no external service configuration required. The new migration file requires the orchestrator to apply it via Supabase MCP `apply_migration` (not part of this execution per plan constraints).

## Next Phase Readiness

- `startRecordingPipeline` is ready for `260707-hhp-02` to wire into the client-side capture UI (audio path), replacing the browser-orchestrated create→transcribe→poll→generate→poll sequence with one dispatch call.
- The watchdog cron will start running automatically once deployed (Inngest cron functions activate on next sync) — no further action needed for P2 to take effect.
- The terminal_status v2 migration must be applied (via Supabase MCP) before the `/admin/events` list page will show corrected statuses for historical attempts; until applied, the OLD view semantics remain live (no functional regression — just the known precedence bug persists until applied).

## Self-Check: PASSED

All created files verified present; all 3 task commit hashes (430e0edc, 0127b4fa, f59d12e1) verified in git log.

---
*Phase: quick-260707-hhp*
*Completed: 2026-07-07*
