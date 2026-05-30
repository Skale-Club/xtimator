---
phase: 92
plan: 02
subsystem: observability
tags: [pipeline-events, attempt-lineage, input-type, inngest-payloads]
requires:
  - "92-01: recordPipelineEvent() helper + PipelineInputType union"
provides:
  - "attemptId + inputType threaded through all dispatch payloads + 3 routes"
  - "AnalyzePhotosPayload gains attemptId + inputType (Phase 91 gap closed)"
  - "Explicit inputType minted at every entrypoint (photo / manual_text / recording)"
affects:
  - "Wave 3 instrumentation reads attemptId/inputType off the now-extended payloads"
tech-stack:
  added: []
  patterns:
    - "Client-minted crypto.randomUUID() attemptId, minted once, reused on retry (Phase 91 pattern extended to photo/manual)"
    - "Explicit client-sent inputType in POST body; route forwards with server fallback (no brittle server inference)"
key-files:
  created: []
  modified:
    - "lib/inngest/events.ts"
    - "components/projects/photos-input.tsx"
    - "components/projects/text-describe.tsx"
    - "components/workspace/ai-input-group/use-ai-input-submit.ts"
    - "components/capture/capture-recorder.tsx"
    - "app/api/transcribe/route.ts"
    - "app/api/analyze-photos/route.ts"
    - "app/api/generate-estimate/route.ts"
decisions:
  - "Payload fields added as optional (attemptId?/inputType?) so legacy callers compile; Wave 3 server fallback fills missing values (D-08)"
  - "generate-estimate route defaults inputType to manual_text when absent (Open-Question 1)"
  - "analyze-photos route mints a server uuid fallback for attemptId when client omits it"
metrics:
  duration: "~5m"
  completed: "2026-05-30"
  tasks: 3
  files: 8
---

# Phase 92 Plan 02: attemptId + inputType Lineage Threading Summary

Made the Phase 91 `attemptId` lineage and the new `inputType` discriminator EXIST and FLOW across every pipeline entrypoint, dispatch payload, and API route — without adding any `recordPipelineEvent` calls yet (that is Wave 3). This is the additive plumbing that lets Wave 3 instrumentation read correct `attempt_id`/`input_type` off the payloads at each server boundary.

## What Shipped

- **`lib/inngest/events.ts`** — `AnalyzePhotosPayload` gained `attemptId?` + `inputType?` (the Phase 91 gap); `TranscribeAudioPayload` + `EstimateGeneratePayload` gained `inputType?`. All optional to keep legacy callers and `tsc` clean.
- **Entrypoint mints** — `photos-input.tsx` → `inputType:'photo'`; `text-describe.tsx` → `inputType:'manual_text'`; `use-ai-input-submit.ts` → `inputType:'manual_text'`, each via a stable `ensureAttempt()` ref that mints `crypto.randomUUID()` once and reuses it on retry.
- **`capture-recorder.tsx`** — added `inputType:'recording'` to its 3 generate dispatch payloads (existing Phase 91 attemptId logic untouched).
- **Routes forward the fields** — transcribe → `'recording'`; analyze-photos reads `attemptId` (server uuid fallback) + `'photo'`; generate-estimate reads `inputType` (defaults `manual_text`) + `attemptId` (server fallback).

## Verification

- `npx vitest run tests/unit/observability/input-type-threading.test.ts` — GREEN (5/5).
- `tests/unit/capture/capture-attempt-lineage.test.ts` — GREEN (2/2, unchanged — Phase 91 lineage preserved).
- `npx tsc --noEmit` — clean (exit 0).
- Observability suite: 4 files green (3 prior + threading); `instrumentation-presence.test.ts` correctly remains RED (Wave 3).

## Commits

- `e202c06` feat(92-02): extend Inngest payload types with attemptId + inputType
- `584b20c` feat(92-02): mint + thread attemptId/inputType at all entrypoints
- `a9e98df` feat(92-02): forward inputType + attemptId through the 3 API routes

## Deviations from Plan

None — additive only, executed as written. No pipeline behavior changed. Unrelated working-tree files (`components/workspace/send/*`, `lib/utils/share-link.ts`) left untouched; staged only by explicit path.

## Self-Check: PASSED

- FOUND: lib/inngest/events.ts, components/capture/capture-recorder.tsx, app/api/generate-estimate/route.ts (+5 more)
- FOUND commits: e202c06, 584b20c, a9e98df
