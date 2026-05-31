---
phase: 92
plan: 03
subsystem: observability
tags: [pipeline-events, instrumentation, inngest, best-effort, EVENT-02, EVENT-03, EVENT-04]
requires:
  - "92-01: recordPipelineEvent() best-effort service-role writer"
  - "92-02: attemptId + inputType lineage threaded through payloads + routes"
provides:
  - "save_recording terminal events (audio + text) in lib/actions/recording.ts"
  - "transcribe started/succeeded/failed events (provider=openrouter)"
  - "analyze started/succeeded/failed events (provider=openrouter)"
  - "generate_estimate started/succeeded/failed events + preview_redirect succeeded marker"
affects:
  - "Phase 93 Super Admin event-log UI reads the durable rows these sites write"
tech-stack:
  added: []
  patterns:
    - "void recordPipelineEvent(...) fire-and-forget off the hot path (mirrors void notify(...))"
    - "In-memory t0 = Date.now() captured at step entry; duration_ms on terminal row (D-03)"
    - "Server fallback attemptId = payload.attemptId ?? randomUUID() (D-08)"
key-files:
  created: []
  modified:
    - "lib/actions/recording.ts"
    - "lib/inngest/functions/transcribe-audio.ts"
    - "lib/inngest/functions/analyze-photos.ts"
    - "lib/inngest/functions/generate-estimate.ts"
decisions:
  - "save_recording collapsed to a single terminal row (D-03 allowance — synchronous step, no started row)"
  - "preview_redirect emitted server-side from generate succeeded path (client redirect non-instrumentable, D-04/Open-Question 3)"
  - "provider=null on generate_estimate + preview_redirect (Open-Question 2 — not trivially in scope, column nullable)"
  - "estimateId resolved from GenerateEstimateResult.estimateId (no extra query)"
metrics:
  duration: "~6m"
  completed: "2026-05-30"
  tasks: 3
  files: 4
---

# Phase 92 Plan 03: Pipeline Instrumentation (EVENT-02/03/04) Summary

Wired `recordPipelineEvent()` into all six server-side step boundaries of the recording→estimate pipeline. Every step now durably records its transition (`started`/`succeeded`/`failed`) with `duration_ms`, `provider`, and the threaded `attemptId`/`inputType` lineage, plus a server-side `preview_redirect` terminal marker. All calls are best-effort `void recordPipelineEvent(...)` off the hot path; the EVENT-04 `recording_added` write is untouched. This turns `instrumentation-presence.test.ts` GREEN while keeping `event04-regression.test.ts` GREEN — phase gate passed.

## What Shipped

- **`lib/actions/recording.ts`** — `createRecording` (audio, `inputType:'recording'`) + `createTextRecording` (text, `inputType:'manual_text'`) each emit a single terminal `save_recording` event: `succeeded` after the activity insert, `failed` in the error branch, with `durationMs` (in-memory `t0`) and an optional `attemptId` param defaulting to `randomUUID()` (D-08). The `recording_added` (L105-110) and `description_added` inserts are byte-for-byte unchanged (D-10).
- **`lib/inngest/functions/transcribe-audio.ts`** — `started` at handler entry, `succeeded` after `save-transcript` (`provider:'openrouter'`, `durationMs`), `failed` in the existing `onFailure`. `loadCompanyForRecording` extended with an additive `project_id` select to populate the event's `projectId`.
- **`lib/inngest/functions/analyze-photos.ts`** — `started` at entry, `succeeded` after `record-usage` (`provider:'openrouter'`, `durationMs`), `failed` in `onFailure`. `userId` via existing `loadOwnerUserId`; `inputType` defaults to `'photo'`.
- **`lib/inngest/functions/generate-estimate.ts`** — `started` at entry, `succeeded` after `record-usage` (`estimateId` from `GenerateEstimateResult`, `provider:null`, `durationMs`), `failed` in `onFailure`, PLUS a `preview_redirect` `succeeded` marker emitted immediately after (server-side logical "reached preview" since the client redirect is non-instrumentable per D-04).

## Verification

- `npx vitest run tests/unit/observability/` — **5/5 files GREEN (22 tests)**, including the now-green `instrumentation-presence.test.ts`.
- `event04-regression.test.ts` — GREEN (recording_added still fires unchanged).
- `tests/unit/capture/capture-attempt-lineage.test.ts` — GREEN (2/2).
- `npx tsc --noEmit` — clean (exit 0).
- Full `npm test` — 1273 passed; 50 failures across 21 files, ALL documented pre-existing (`requireServiceClient`-mock infra condition in `deferred-items.md`). None are files this plan touched; no NEW failures in previously-green suites.

## Commits

- `7d17234` feat(92-03): instrument save_recording in recording.ts (EVENT-04 preserved)
- `601a155` feat(92-03): instrument transcribe + analyze Inngest functions
- `b127308` feat(92-03): instrument generate_estimate + preview_redirect marker

## Deviations from Plan

None - plan executed exactly as written. All Rules 1-4 deviation triggers: none encountered. The ~50 pre-existing full-suite failures are out of scope (documented in `deferred-items.md`, Wave 0) and were not touched.

## Known Stubs

None. All six boundaries emit real events with live lineage/identity fields; `provider` is intentionally `null` on `generate_estimate`/`preview_redirect` per Open-Question 2 (nullable column, not load-bearing), not a stub.

## Self-Check: PASSED

- FOUND: lib/actions/recording.ts
- FOUND: lib/inngest/functions/transcribe-audio.ts
- FOUND: lib/inngest/functions/analyze-photos.ts
- FOUND: lib/inngest/functions/generate-estimate.ts
- FOUND commit: 7d17234
- FOUND commit: 601a155
- FOUND commit: b127308
