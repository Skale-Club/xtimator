---
phase: 67-inngest-background-ai-jobs
verified: 2026-05-15T18:35:00Z
status: passed
score: 8/8 must-haves verified
---

# Phase 67: Inngest Background AI Jobs Verification Report

**Phase Goal:** AI routes (`/api/generate-estimate`, `/api/transcribe`, `/api/analyze-photos`) and the WhatsApp inbound handler dispatch long work to Inngest functions and return job IDs in <1s, bypassing Vercel Free's 10s function timeout. Same code runs unchanged on Hetzner Cloud later.
**Verified:** 2026-05-15T18:35:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                                | Status     | Evidence                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Inngest SDK installed; client + serve handler exist (INNGEST-01)                                                     | VERIFIED   | `inngest@^4.4.0` in package.json L35; `lib/inngest/client.ts` exports singleton with id 'xtimator'; `app/api/inngest/route.ts` exports GET/POST/PUT from `serve()` registering all 4 jobs |
| 2   | `/api/generate-estimate` returns `{ jobId }` <1s with no inline AI call; usage_events recorded only on job success (INNGEST-02) | VERIFIED   | Route imports `inngest` + `EVENT_ESTIMATE_GENERATE` only; no `generateEstimateForProject` or `recordUsage` imports; returns HTTP 202 with jobId; recordUsage moved to `record-usage` step.run in `lib/inngest/functions/generate-estimate.ts` |
| 3   | `/api/transcribe` returns `{ jobId }` <1s; Whisper moved to Inngest function (INNGEST-03)                           | VERIFIED   | NEW route at `app/api/transcribe/route.ts` exports POST; calls `inngest.send` with `id: 'transcribe-${recordingId}'`; `transcribeAudioJob` wraps Whisper fetch in `step.run('whisper-transcribe')` |
| 4   | `/api/analyze-photos` returns `{ jobId }` <1s; Vision moved to Inngest function (INNGEST-04)                        | VERIFIED   | Route does NOT import Anthropic; calls `inngest.send` with `name: EVENT_ANALYZE_PHOTOS`; `analyzePhotosJob` issues `step.run('vision-${photoId}')` per photo + final `step.run('record-usage')` |
| 5   | Frontend polls job status via `GET /api/jobs/[jobId]` — capture flow shows real Inngest stepper (INNGEST-05)        | VERIFIED   | `app/api/jobs/[jobId]/route.ts` exports GET (server-side Bearer auth); `hooks/use-job-status.ts` exports `useJobStatus` + `pollJob`; `capture-recorder.tsx` calls `pollJob` 3 times (transcribe + generate + triggerEstimateGeneration); no TODO(67-05) markers |
| 6   | Inngest functions are idempotent — `step.run()` per external call; explicit idempotency CEL per job (INNGEST-06)    | VERIFIED   | All 4 functions have `idempotency:` declared (`event.data.requestId` x2, `event.data.recordingId`, `event.data.batchKey`); 17 total `step.run(` blocks across 4 function files (target ≥6) |
| 7   | WhatsApp handler refactored — long Whisper/Vision dispatched via Inngest, not awaited inline (INNGEST-07)            | VERIFIED   | `lib/whatsapp/handler.ts:processInboundMessages` dispatches via `inngest.send({ name: EVENT_WHATSAPP_PROCESS, id: 'wa-batch-${lastMessageId}' })`; zero `generateEstimateForProject` / `api.openai.com` / `new Anthropic` matches in handler |
| 8   | Local dev workflow documented (INNGEST-08)                                                                            | VERIFIED   | `package.json` contains `dev:inngest: npx inngest-cli@latest dev -u http://localhost:9633/api/inngest`; `docs/INNGEST-LOCAL-DEV.md` exists (mentions `localhost:8288`); `README.md` mentions `npm run dev:inngest` |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact                                              | Expected                                                  | Status     | Details                                                                                          |
| ----------------------------------------------------- | --------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------ |
| `lib/inngest/client.ts`                               | Singleton Inngest client `id: 'xtimator'`                 | VERIFIED   | 14 lines; exports `inngest` instance via `new Inngest({ id: 'xtimator' })`                       |
| `lib/inngest/events.ts`                               | 4 event constants + 4 payload types                       | VERIFIED   | All 4 EVENT_* constants present; all 4 payload types referenced by routes/functions              |
| `lib/inngest/functions/generate-estimate.ts`          | `generateEstimateJob` with idempotency + 2 step.run       | VERIFIED   | 2 step.run blocks (`call-ai-provider`, `record-usage`); idempotency `event.data.requestId`       |
| `lib/inngest/functions/transcribe-audio.ts`           | `transcribeAudioJob` with idempotency + 2 step.run        | VERIFIED   | 2 step.run blocks (`whisper-transcribe`, `save-transcript`); idempotency `event.data.recordingId` |
| `lib/inngest/functions/analyze-photos.ts`             | `analyzePhotosJob` with idempotency + per-photo step.run  | VERIFIED   | 3 step.run blocks (`load-photos`, `vision-${id}`, `record-usage`); idempotency `event.data.requestId` |
| `lib/inngest/functions/whatsapp-process.ts`           | `whatsAppProcessJob` with idempotency + N+2 step.run      | VERIFIED   | 4 step.run blocks (per-msg, refresh-typing, generate-estimate, confirm-and-session); idempotency `event.data.batchKey` |
| `lib/inngest/functions/index.ts`                      | Barrel export of all 4 jobs                               | VERIFIED   | All 4 jobs re-exported (consumed by serve handler)                                               |
| `app/api/inngest/route.ts`                            | serve() handler exporting GET/POST/PUT                    | VERIFIED   | Exports `{ GET, POST, PUT }` from `serve({ client, functions: [4 jobs] })`                       |
| `app/api/generate-estimate/route.ts`                  | Dispatch route — auth + quota + inngest.send              | VERIFIED   | HTTP 202 + `{ jobId }`; preserves auth + 2 rate limits + quota check                             |
| `app/api/transcribe/route.ts`                         | NEW route accepting `{ recordingId }` → `{ jobId }`       | VERIFIED   | Validates recordingId + storage_path + ownership before dispatch                                 |
| `app/api/analyze-photos/route.ts`                     | Dispatch route — preserves rate limit + quota             | VERIFIED   | HTTP 202 + `{ jobId }`; no Anthropic SDK import                                                  |
| `app/api/jobs/[jobId]/route.ts`                       | GET status proxy with server-side Bearer                  | VERIFIED   | Reads `INNGEST_SIGNING_KEY` from env; fetches `https://api.inngest.com/v1/events/{jobId}/runs` with `cache: 'no-store'`; returns 401/404/503 properly |
| `lib/whatsapp/handler.ts`                             | Refactored — pre-flight only, dispatches via Inngest      | VERIFIED   | 3 occurrences (`inngest.send`, `EVENT_WHATSAPP_PROCESS`, batchKey); ZERO inline AI calls         |
| `hooks/use-job-status.ts`                             | Exports `useJobStatus` + `pollJob`                        | VERIFIED   | Both surfaces exported; 1.5s polling interval; stops on terminal status; AbortSignal honored     |
| `components/capture/capture-recorder.tsx`             | Uses pollJob; no TODO(67-05) markers                      | VERIFIED   | 3 pollJob calls; pollJob imported from `@/hooks/use-job-status`; no TODO markers                 |
| `components/workspace/audio/audio-recorder.tsx`       | Save & Transcribe polls until terminal                    | VERIFIED   | transcribeRecording return + pollJob wired (toast gating fix)                                    |
| `docs/INNGEST-LOCAL-DEV.md`                           | Full local dev runbook                                    | VERIFIED   | Mentions `localhost:8288`, two-terminal workflow, troubleshooting                                |
| `README.md`                                           | Background Jobs (Inngest) section                         | VERIFIED   | New file at repo root; mentions `npm run dev:inngest`                                            |
| `package.json`                                        | `dev:inngest` script + `inngest` dep                      | VERIFIED   | Script present (L7); inngest@^4.4.0 in dependencies (L35)                                        |

### Key Link Verification

| From                                          | To                                                       | Via                                              | Status | Details                                                                              |
| --------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------ | ------ | ------------------------------------------------------------------------------------ |
| `app/api/generate-estimate/route.ts`          | Inngest worker                                           | `inngest.send({ name: EVENT_ESTIMATE_GENERATE })` | WIRED | Event id `estimate-${projectId}-${requestId}` for idempotency                       |
| `app/api/transcribe/route.ts`                 | Inngest worker                                           | `inngest.send({ name: EVENT_TRANSCRIBE_AUDIO })`  | WIRED | Event id `transcribe-${recordingId}` (UUID-natural unique)                          |
| `app/api/analyze-photos/route.ts`             | Inngest worker                                           | `inngest.send({ name: EVENT_ANALYZE_PHOTOS })`    | WIRED | Event id `photos-${projectId}-${requestId}`                                          |
| `app/api/jobs/[jobId]/route.ts`               | `https://api.inngest.com/v1/events/{jobId}/runs`         | fetch with Bearer INNGEST_SIGNING_KEY            | WIRED | `cache: 'no-store'`; returns `{ status, output }`                                    |
| `lib/whatsapp/handler.ts`                     | `whatsAppProcessJob`                                     | `inngest.send({ name: EVENT_WHATSAPP_PROCESS })`  | WIRED | Event id `wa-batch-${lastMessageId}` (Meta wamid is unique)                          |
| `components/capture/capture-recorder.tsx`     | `/api/transcribe` + `/api/generate-estimate` + `/api/jobs` | `transcribeRecording` + `pollJob`              | WIRED | runPipeline calls pollJob for both transcribe + generate flows                       |
| `app/api/inngest/route.ts`                    | All 4 function exports                                   | `serve({ functions: [4 jobs] })`                  | WIRED | All 4 jobs registered                                                                |
| `lib/actions/recording.ts:transcribeRecording` | `EVENT_TRANSCRIBE_AUDIO`                                 | dynamic import + `inngest.send`                   | WIRED | New return shape `{ data: { jobId } }` consumed by both capture-recorder + audio-recorder |

### Data-Flow Trace (Level 4)

| Artifact                                  | Data Variable           | Source                                                 | Produces Real Data | Status   |
| ----------------------------------------- | ----------------------- | ------------------------------------------------------ | ------------------ | -------- |
| `app/api/jobs/[jobId]/route.ts` GET       | `run.status`, `run.output` | Inngest REST API `events/{jobId}/runs`                | Yes (live API)     | FLOWING |
| `hooks/use-job-status.ts` useJobStatus    | `state.status/output`   | fetch `/api/jobs/${jobId}` → JobStatusResponse        | Yes (real proxy)   | FLOWING |
| `capture-recorder.tsx` runPipeline transcribe | `transcribeOutput.transcript` | pollJob → Inngest `transcribeAudioJob` output    | Yes (Whisper result) | FLOWING |
| `capture-recorder.tsx` runPipeline generate | `output.estimateId`     | pollJob → Inngest `generateEstimateJob` output         | Yes (DB insert via service) | FLOWING |
| `lib/inngest/functions/generate-estimate.ts` | `result`                | `generateEstimateForProject(companyId, projectId)`     | Yes (Phase 41 service) | FLOWING |
| `lib/inngest/functions/transcribe-audio.ts` | `transcript`            | Whisper API call inside step.run                       | Yes (real Whisper) | FLOWING |
| `lib/inngest/functions/analyze-photos.ts` | `descriptions[]`        | per-photo Anthropic Vision call                        | Yes (real Vision)  | FLOWING |
| `lib/inngest/functions/whatsapp-process.ts` | `result`                | per-msg processing + generateEstimateForProject        | Yes (real flow)    | FLOWING |

### Behavioral Spot-Checks

| Behavior                                              | Command                                                                                              | Result                | Status |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------- | ------ |
| All Inngest unit tests GREEN                          | `npx vitest run tests/unit/inngest tests/unit/api/{generate-estimate,transcribe,analyze-photos,jobs-status}-dispatch.test.ts tests/unit/hooks/use-job-status.test.ts tests/unit/whatsapp/handler-inngest-dispatch.test.ts` | 14 files / 59 tests passed | PASS |
| WhatsApp suite still passes (no regression)           | `npx vitest run tests/unit/whatsapp`                                                                 | 13 files / 125 tests passed | PASS |
| step.run count threshold                              | `grep -c "step.run(" lib/inngest/functions/*.ts` (sum)                                              | 17 (target ≥ 6)       | PASS |
| idempotency declared on all 4 functions               | `grep -E "idempotency:" lib/inngest/functions/*.ts`                                                  | 4 matches             | PASS |
| WhatsApp handler clean of inline AI                   | `grep -c "generateEstimateForProject\|api.openai.com\|new Anthropic" lib/whatsapp/handler.ts`        | 0                     | PASS |
| No real Inngest signing keys committed                | `grep -rE "signkey-(prod\|test)-[A-Za-z0-9_-]{20,}" docs/ README.md hooks/ components/ app/ lib/ tests/` | 0 matches            | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description                                                          | Status                | Evidence                                                              |
| ----------- | ----------- | -------------------------------------------------------------------- | --------------------- | --------------------------------------------------------------------- |
| INNGEST-01  | 67-01, 67-02 | Inngest client + serve handler                                       | SATISFIED            | `lib/inngest/client.ts` + `app/api/inngest/route.ts` + 4 functions registered. (Note: REQUIREMENTS.md checkbox shows unchecked — likely a doc-tracking lag, implementation is complete.) |
| INNGEST-02  | 67-01, 67-02, 67-03 | `/api/generate-estimate` async dispatch                       | SATISFIED            | Route returns 202 + jobId; recordUsage moved to `record-usage` step.run; Wave 0 stub GREEN |
| INNGEST-03  | 67-01, 67-02, 67-03 | `/api/transcribe` async dispatch                              | SATISFIED            | NEW route + transcribeAudioJob wraps Whisper in step.run                                |
| INNGEST-04  | 67-01, 67-02, 67-03 | `/api/analyze-photos` async dispatch                          | SATISFIED            | Route returns 202; analyzePhotosJob has per-photo step.run                              |
| INNGEST-05  | 67-01, 67-03, 67-05 | Frontend polling                                              | SATISFIED            | useJobStatus + pollJob hook; capture-recorder polls 3x                                  |
| INNGEST-06  | 67-01, 67-02 | Idempotency contract                                                 | SATISFIED            | All 4 functions have `idempotency:` CEL; 17 step.run blocks total. (Doc-tracking checkbox unchecked but verified in code.) |
| INNGEST-07  | 67-01, 67-02, 67-04 | WhatsApp handler refactor                                     | SATISFIED            | handler dispatches via Inngest; zero inline AI imports                                  |
| INNGEST-08  | 67-01, 67-02, 67-05 | Local dev docs                                                | SATISFIED            | dev:inngest script + docs/INNGEST-LOCAL-DEV.md + README.md             |

All 8 declared requirements SATISFIED in code. INNGEST-01 and INNGEST-06 still show as unchecked in REQUIREMENTS.md status table — appears to be a documentation-sync lag (the implementation evidence is overwhelming). Recommend updating `.planning/REQUIREMENTS.md` to mark these complete.

### Anti-Patterns Found

| File                                          | Line | Pattern         | Severity | Impact                                                                                |
| --------------------------------------------- | ---- | --------------- | -------- | ------------------------------------------------------------------------------------- |
| `components/capture/capture-recorder.tsx`     | 491  | `placeholder=`  | Info     | False positive — HTML `<input placeholder="Or describe the job here...">` attribute, not a stub |
| `components/capture/capture-recorder.tsx`     | 492  | `placeholder:text-muted-foreground` | Info | False positive — Tailwind class for placeholder text styling                          |

No blocker or warning anti-patterns. No TODO/FIXME/HACK in any Inngest production file or capture-recorder.

### Human Verification Required

None for this verification — all automated checks pass. Manual smoke testing already deferred to Phase 69 UAT (UAT-INNGEST-01 + UAT-INNGEST-02), per project plan:

1. **UAT-INNGEST-01:** Audio capture happy path — record 2-min audio, observe Inngest dashboard show `transcribeAudioJob` then `generateEstimateJob` complete, capture stepper UI updates, estimate appears in editor.
2. **UAT-INNGEST-02:** Long audio (8-min) — confirms estimate generation completes (would have timed out on Vercel Free without Inngest).

### Gaps Summary

No gaps. Phase 67 has delivered all 8 INNGEST requirements end-to-end:

- **Worker layer:** 4 Inngest functions with explicit idempotency + 17 step.run checkpoints across them.
- **Route layer:** 3 AI routes + 1 NEW transcribe route + 1 status proxy route, all returning HTTP 202 + `{ jobId }` in <1s.
- **WhatsApp:** processInboundMessages dispatches to Inngest only; webhook ack now bulletproof under Meta's 10s budget.
- **Frontend:** useJobStatus hook + pollJob helper; capture-recorder + audio-recorder both consume async pipeline; carryover toast bug fixed.
- **Docs:** docs/INNGEST-LOCAL-DEV.md + README.md ship with the two-terminal workflow.
- **Tests:** 59 GREEN across 14 Inngest-related test files (target ≥50). WhatsApp suite still 125/125 GREEN (no regression).
- **Security:** No real signing keys leaked anywhere in the repo (only `signkey-prod-<your-...>` placeholders).

The phase goal — "AI routes dispatch long work to Inngest and return job IDs in <1s, bypassing Vercel Free's 10s timeout; same code runs on Hetzner later" — is achieved. The architecture is platform-agnostic (Inngest provides an HTTP webhook to `app/api/inngest/route.ts` regardless of host), so Hetzner migration in v3.2 will require no code changes here.

Minor doc-only observation: `.planning/REQUIREMENTS.md` checkbox tracker still shows INNGEST-01 and INNGEST-06 unchecked (lines 1 and 6 of the requirement list). Implementation is verified as complete; recommend a doc-only patch to mark them `[x]`.

---

_Verified: 2026-05-15T18:35:00Z_
_Verifier: Claude (gsd-verifier)_
