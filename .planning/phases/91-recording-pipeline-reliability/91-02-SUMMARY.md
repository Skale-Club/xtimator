---
phase: 91-recording-pipeline-reliability
plan: 02
subsystem: capture-pipeline
tags: [inngest, idempotency, attempt-lineage, discriminated-union, next-app-router, react-hook, i18n, vitest, tdd]

# Dependency graph
requires:
  - phase: 91-recording-pipeline-reliability
    plan: 01
    provides: "JobResult / JobStatusState discriminant exported from hooks/use-job-status.ts (pollJob never throws on non-200)"
  - phase: 67-inngest-background-ai-jobs
    provides: "idempotent Inngest functions (idempotency keys + step.run boundaries), generate-estimate/transcribe dispatch routes"
provides:
  - "attemptId on TranscribeAudioPayload + EstimateGeneratePayload (in-flight attempt lineage; Phase 92 owns durable persistence)"
  - "buildGenerateEventId(projectId, requestId) — stable Inngest event id helper exported from app/api/generate-estimate/route.ts"
  - "generate-estimate route honors a client-supplied requestId/attemptId (Retry reuses the original idempotency key → no double-charge)"
  - "capture-recorder mints attempt/request/recording lineage once and reuses it on Retry; reads JobResult discriminant for an i18n failure reason"
  - "ALL production pollJob consumers (text-describe, photos-input, use-ai-input-submit) read the JobResult discriminant — no silent failure-swallowing (REC-05 consumer half)"
affects: [92-event-store, capture-recorder, generate-estimate-route, transcribe-route]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Attempt lineage as in-flight event-payload field (no DB migration) — minted once per capture session, reused on Retry"
    - "Stable idempotency key on user Retry: reuse original requestId (generate) + recordingId (transcribe) so an already-completed step is memoized, a failed step still re-runs"
    - "Every pollJob caller branches on the JobResult discriminant; non-completed → existing toast/failure path; completed → read run output from result.output"
    - "i18n failure reason via inline t() ternaries at the call site (Pitfall 5) so the extractor picks up keys"

key-files:
  created:
    - tests/unit/capture/capture-attempt-lineage.test.ts
  modified:
    - lib/inngest/events.ts
    - app/api/generate-estimate/route.ts
    - app/api/transcribe/route.ts
    - lib/actions/recording.ts
    - components/capture/capture-recorder.tsx
    - components/projects/text-describe.tsx
    - components/projects/photos-input.tsx
    - components/workspace/ai-input-group/use-ai-input-submit.ts
    - tests/unit/inngest/transcribe-audio-job.test.ts

key-decisions:
  - "attemptId lives ONLY in the event payload for Phase 91 (resolve_open_questions #1) — no recordings.attempt_id migration; Phase 92's event store owns durable persistence"
  - "Retry reuses the ORIGINAL requestId/recordingId (not a child request) so an already-completed step is memoized by Inngest (no re-charge); a genuinely-failed step still re-runs (resolve_open_questions #2)"
  - "On the capture-recorder generate/transcribe paths the run output is read from the DB (Inngest dev server returns empty function output) — result.output is consulted via the discriminant only to gate completed-vs-not, matching the pre-existing DB-read pattern"
  - "text-describe/photos-input narrow-cast result.output (not the top-level result) to GenerateEstimateResponse — acceptable because the route's run output is documented as that shape; the masking top-level cast is removed so tsc validates the union"

patterns-established:
  - "ensureAttempt() mints attemptId + requestId once via refs; Retry handlers never reset them so the lineage (and idempotency keys) survive a re-dispatch"
  - "reasonForJobState(result, kind) maps a non-completed JobResult to an inline-t() friendly reason (config_unavailable / not_found / failed)"

requirements-completed: [REC-03, REC-04, REC-05]

# Metrics
duration: 11min
completed: 2026-05-29
---

# Phase 91 Plan 02: Attempt Lineage + Idempotent Retry + pollJob Consumer Rewire Summary

**Threaded an in-flight `attemptId` (minted once, reused on Retry) through the capture flow and Inngest event payloads, closed the double-charge gap by making the user-initiated Retry reuse the original idempotency keys (stable `requestId` for generate via `buildGenerateEventId`, stable `recordingId` for transcribe), and rewired every production `pollJob` consumer to read Plan 01's `JobResult` discriminant so no flow silently swallows a failure.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-05-29T04:29:24Z
- **Completed:** 2026-05-29T04:40:15Z
- **Tasks:** 4
- **Files modified:** 9 (1 created, 8 modified)

## Accomplishments

- **REC-03 (attempt lineage):** `attemptId?` added to `TranscribeAudioPayload` + `EstimateGeneratePayload` (in-flight only, documented for Phase 92). `capture-recorder` mints `attemptId`/`requestId` once via `ensureAttempt()` and a `recordingIdRef`, reusing all three on Retry so the lineage survives. "Edit manually" already preserved context (`router.push('/projects/${projectId}')`) — left unchanged.
- **REC-04 (no double-charge):** `app/api/generate-estimate/route.ts` now honors a client-supplied `requestId` (mints only when absent) and derives the event id from the new exported `buildGenerateEventId(projectId, requestId)` — a Retry that reuses the original `requestId` yields the same event id → Inngest dedups → an already-completed generate step is not re-charged. Transcribe keeps `transcribe-${recordingId}` (the recording id is reused on Retry). A genuinely-failed step still re-runs (memoization gates accidental re-dispatch, not legitimate re-execution).
- **REC-05 (consumer half):** the masking `as ... GenerateEstimateResponse` casts are removed from `text-describe` + `photos-input`; both branch on `result.state`, read run output from `result.output` on `completed`, and route non-completed states to the existing `toast.error` + `setIsGenerating(false)` path. `use-ai-input-submit` branches on `result.state !== 'completed'` instead of relying on a thrown `pollJob`, so a failed transcription no longer proceeds to `runGenerate()` on an empty transcript.
- **Tests:** new `tests/unit/capture/capture-attempt-lineage.test.ts` proves `buildGenerateEventId` stability and the route's client-`requestId` reuse; the transcribe suite gained a recordingId-dedup intent test. All recording-pipeline suites green; `tsc --noEmit` clean (the union now type-checks because the masking casts were removed).

## Task Commits

1. **Task 1: attempt-lineage RED suite + recordingId dedup assertion** — `b0f21cc` (test)
2. **Task 2: attemptId on payloads + honor client requestId on dispatch** — `4545620` (feat)
3. **Task 3: thread lineage through capture-recorder + consume JobResult** — `768026c` (feat)
4. **Task 4: rewire all pollJob consumers to JobResult discriminant** — `1d7cc14` (fix)

## Files Created/Modified

- `tests/unit/capture/capture-attempt-lineage.test.ts` — NEW. Asserts `buildGenerateEventId` stability + route reuse of a client-supplied requestId/attemptId.
- `tests/unit/inngest/transcribe-audio-job.test.ts` — Added a dedup-intent test tying the `event.data.recordingId` idempotency key to the memoized `step.run('whisper-transcribe')` boundary.
- `lib/inngest/events.ts` — Added optional `attemptId` to both pipeline payloads.
- `app/api/generate-estimate/route.ts` — Exported `buildGenerateEventId`; resolve `requestId` from `body.requestId` (mint only when absent); read `attemptId`; include both on the payload and use the helper for the event id.
- `app/api/transcribe/route.ts` — Read `body.attemptId`, forward on the payload; event id unchanged.
- `lib/actions/recording.ts` — `transcribeRecording(recordingId, attemptId?)` forwards `attemptId`.
- `components/capture/capture-recorder.tsx` — `attemptIdRef`/`requestIdRef`/`recordingIdRef` + `ensureAttempt()` + `reasonForJobState()`; reuse the recording row on Retry (no re-upload/re-create); all 3 generate POSTs carry `requestId`/`attemptId`; every `pollJob` call branches on the `JobResult` discriminant.
- `components/projects/text-describe.tsx`, `components/projects/photos-input.tsx` — Removed masking casts; branch on `result.state`; read `result.output`; non-completed → existing toast path.
- `components/workspace/ai-input-group/use-ai-input-submit.ts` — Branch on `result.state !== 'completed'` instead of a thrown `pollJob`.

## Decisions Made

- attemptId stays in-flight (event payload) for Phase 91; no `recordings.attempt_id` migration. Phase 92's event store owns durable lineage persistence (RESEARCH Open Question 1).
- Retry reuses the original `requestId`/`recordingId` for true idempotent continuation — an already-completed step is memoized (no re-charge); a failed step legitimately re-runs (RESEARCH Open Question 2 / Pitfall 3).
- The capture-recorder paths still read the resulting estimate/transcript from the DB (Inngest dev server returns an empty function output); the `JobResult` discriminant is consulted to gate completed-vs-not and to render the i18n failure reason.

## Deviations from Plan

None — plan executed as written. (The `use-ai-input-submit` catch was tightened to re-throw the original error rather than always re-wrapping it, so the explicit non-completed `throw new Error(t('Transcription failed...'))` message is preserved verbatim through the outer catch — a faithful implementation of the plan's intent, not a scope change.)

## Issues Encountered

- The full `npx vitest run` merge gate surfaced 21 pre-existing, unrelated failing suites (~50 tests: admin/blog/seo/theme/price-book/tour/wizard/translate/app-icons/globals-brand-tokens). Verified pre-existing by stashing the Task 4 edits and re-running the failing suites — they fail identically without this plan's changes, and none import the recording-pipeline modules. Root cause sampled: vitest 4 mock-hoisting drift (e.g. `No "requireServiceClient" export is defined on the mock`). Logged to `.planning/phases/91-recording-pipeline-reliability/deferred-items.md` as a separate test-infra maintenance task. All recording-pipeline suites (capture, hooks/use-job-status, inngest, api/jobs-status, capture-failure) are green.

## Known Stubs

None. The attempt lineage is intentionally in-flight-only for Phase 91 (durable persistence is Phase 92's event store, per RESEARCH Open Question 1) — documented above, not a stub.

## User Setup Required

None for code work. End-to-end UAT (deferred to phase UAT) needs `INNGEST_SIGNING_KEY` + `OPENROUTER_API_KEY` set with both `npm run dev` + `npm run dev:inngest` running to validate the no-double-charge Retry behavior and the consumer failure toasts with Inngest unconfigured.

## Next Phase Readiness

- `attemptId` is on both pipeline event payloads and threaded through the capture UI → Phase 92 (EVENT-03: retries link to the originating attempt id) can read the lineage off the events without re-threading.
- `buildGenerateEventId` is exported for any server-side mirror of the dispatch key.
- Every `pollJob` consumer now reads the discriminant — no caller relies on a thrown exception.

---
*Phase: 91-recording-pipeline-reliability*
*Completed: 2026-05-29*

## Self-Check: PASSED
- All key files verified present on disk (capture-attempt-lineage.test.ts, 91-02-SUMMARY.md, capture-recorder.tsx, generate-estimate/route.ts).
- All 4 task commits verified in git history (b0f21cc, 4545620, 768026c, 1d7cc14).
