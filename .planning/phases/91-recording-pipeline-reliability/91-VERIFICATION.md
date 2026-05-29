---
phase: 91-recording-pipeline-reliability
verified: 2026-05-29T00:00:00Z
status: passed
score: 13/13 must-haves verified
human_verification:
  - test: "Capture popup shows human-readable failure + Retry + Edit-manually with Inngest unconfigured"
    expected: "Plain-language reason, both buttons render, no raw 503/stack"
    why_human: "Requires real recorder UI + browser media APIs"
  - test: "Retry continues same attempt lineage, no double-charge"
    expected: "Only one usage_events row / one OpenRouter charge for an already-successful step; a still-failing step may legitimately re-run"
    why_human: "End-to-end across UI + Inngest dispatch + provider billing; needs live Inngest + provider keys"
  - test: "Edit manually preserves context"
    expected: "Lands on /projects/[id] with the recording + transcript attached"
    why_human: "Requires browser navigation + DB state"
  - test: "Non-capture pollJob consumers surface failures (no false success)"
    expected: "text-describe, photos-input, header AI input each show a failure toast and do NOT navigate as if successful; transcription does not proceed to generation on a failed transcript"
    why_human: "Requires real browser flows with Inngest unconfigured"
---

# Phase 91: Recording Pipeline Reliability Verification Report

**Phase Goal:** A user whose recording pipeline hits an Inngest-config or processing problem always sees an actionable, recoverable state instead of an opaque 503 — and retries never double-charge AI/transcription providers. Completes the unfinished v3.1.1 INNGEST-01 (worker registration/reachability) and INNGEST-06 (idempotency).
**Verified:** 2026-05-29
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | GET /api/jobs/[jobId] returns HTTP 200 with a discriminated `state` for every known condition; never an opaque 503 | ✓ VERIFIED | route.ts:33-38 exports `JobStatusContract`; every return is `NextResponse.json<JobStatusContract>` at 200; no `status: 503/502/404` remains |
| 2 | Missing signing key (non-dev) → 200 `{ state: 'config_unavailable' }` | ✓ VERIFIED | route.ts:91-96 returns config_unavailable with no key leak; fetch-throw at 108-112 also maps here |
| 3 | Failed/Cancelled run → 200 `{ state: 'failed', reason }` with safe summary string | ✓ VERIFIED | route.ts:139-144 + `safeFailureReason()` 70-75 (trimmed plain string ≤200 chars or generic literal, never a stack) |
| 4 | 401 auth gate preserved | ✓ VERIFIED | route.ts:83-86 returns 401 before any job-state logic |
| 5 | pollJob resolves a typed JobResult discriminant, never throws on non-200 (only on abort) | ✓ VERIFIED | use-job-status.ts:82-93 — `Promise<JobResult>`, reads `body.state`, throws only `'Aborted'`; `Status check failed` line gone |
| 6 | useJobStatus exposes a discriminated state; never sets synthetic `{ status:'Failed', error:'Status 503' }` | ✓ VERIFIED | use-job-status.ts:99-159 — `UseJobStatusState`; failure path sets `{ state:'failed', reason }`, no synthetic status code |
| 7 | CaptureFailure renders a human-readable, i18n-wrapped reason + t()-wrapped Retry / Edit-manually | ✓ VERIFIED | capture-failure.tsx:18,28,33 — `useTranslation()`, `t('Retry')`, `t('Edit manually')`; renders `errorMessage` (no raw code) |
| 8 | attemptId minted once, reused across Retry (not re-minted) | ✓ VERIFIED | capture-recorder.tsx:130-138 `ensureAttempt()` guards on `!ref.current`; Retry handlers 695-698/717-720 call `runPipeline` without resetting refs |
| 9 | attemptId carried on both Inngest payloads | ✓ VERIFIED | events.ts:33 (EstimateGeneratePayload), events.ts:44 (TranscribeAudioPayload) |
| 10 | Retry reuses original requestId (generate) + recordingId (transcribe) → no double-charge | ✓ VERIFIED | generate-estimate route honors `body.requestId` (104-107) via `buildGenerateEventId`; capture-recorder reuses `recordingIdRef` (357-377) and threads requestId into all 3 POSTs |
| 11 | Genuinely-failed step still re-runs | ✓ VERIFIED | Idempotency gates re-dispatch of completed steps only; functions use `step.run` boundaries (generate-estimate.ts:69,79; transcribe-audio.ts:74,90) so a failed step re-executes |
| 12 | Edit manually preserves project context | ✓ VERIFIED | capture-recorder.tsx:699-702/721-724 `router.push('/projects/${projectId}')`; recording row + transcript already persisted before failure |
| 13 | EVERY production pollJob consumer reads the JobResult discriminant — no silent failure-swallowing | ✓ VERIFIED | text-describe.tsx:67-76, photos-input.tsx:65-74 branch on `result.state`, read `result.output`, route non-completed → toast.error; use-ai-input-submit.ts:128-131 branches `result.state !== 'completed'` |

**Score:** 13/13 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `app/api/jobs/[jobId]/route.ts` | Graceful discriminated-state contract (always 200) | ✓ VERIFIED | Contains `config_unavailable`, `not_found`; exports `JobStatusContract`; no 503/502 status codes |
| `hooks/use-job-status.ts` | Contract interpretation w/o throwing; JobResult/JobStatusState | ✓ VERIFIED | Exports `JobResult` + `JobStatusState`; pollJob never throws on non-200 |
| `components/capture/capture-failure.tsx` | i18n reason + t()-wrapped buttons | ✓ VERIFIED | `useTranslation`, t() on both labels |
| `lib/inngest/events.ts` | attemptId on both payloads | ✓ VERIFIED | attemptId on both (count ≥ 2) |
| `app/api/generate-estimate/route.ts` | Honors client requestId/attemptId; stable event id | ✓ VERIFIED | `buildGenerateEventId` exported; `body.requestId` honored; attemptId on payload |
| `app/api/transcribe/route.ts` | attemptId threaded; recordingId event-id seam preserved | ✓ VERIFIED | reads `body.attemptId`, forwards on payload; `transcribe-${recordingId}` unchanged |
| `lib/actions/recording.ts` | transcribeRecording(recordingId, attemptId?) forwards attemptId | ✓ VERIFIED | signature + payload updated; event id unchanged |
| `components/capture/capture-recorder.tsx` | attemptId/requestId/recordingId refs reused on Retry; reads discriminant; i18n reason | ✓ VERIFIED | refs 130-132, `ensureAttempt`, `reasonForJobState`, all pollJob calls branch on state |
| `components/projects/text-describe.tsx` | pollJob rewired to discriminant; no masking cast | ✓ VERIFIED | branches on `result.state`, reads `result.output`, narrow-cast on output only |
| `components/projects/photos-input.tsx` | pollJob rewired to discriminant; no masking cast | ✓ VERIFIED | identical pattern to text-describe |
| `components/workspace/ai-input-group/use-ai-input-submit.ts` | branches on non-completed state | ✓ VERIFIED | `result.state !== 'completed'` throws friendly error, no longer relies on pollJob throw |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| use-job-status.ts | jobs/[jobId]/route.ts | reads `body.state` from 200 JSON | ✓ WIRED | pollJob fetches + reads `body.state`, no `res.ok` throw |
| capture-failure.tsx | use-job-status.ts | renders carried reason | ✓ WIRED | renders `errorMessage` (mapped via capture-recorder `reasonForJobState`) |
| capture-recorder.tsx | generate-estimate route | POST body { requestId, attemptId } | ✓ WIRED | all 3 POST bodies (294-296, 430-431, 505-506) carry both refs |
| generate-estimate route | functions/generate-estimate.ts | `estimate-${projectId}-${requestId}` + idempotency `event.data.requestId` | ✓ WIRED | `buildGenerateEventId`; function idempotency:'event.data.requestId' (line 38) |
| capture-recorder.tsx | use-job-status.ts | consumes JobResult discriminant | ✓ WIRED | `result.state === 'completed'` gating at 4 pollJob sites |
| text-describe.tsx | use-job-status.ts | reads result.output on completed, else toast | ✓ WIRED | 67-84 |
| photos-input.tsx | use-job-status.ts | reads result.output on completed, else toast | ✓ WIRED | 65-81 |
| use-ai-input-submit.ts | use-job-status.ts | branches on `result.state` for transcription failure | ✓ WIRED | 128-131 |
| transcribe route + functions | recordingId idempotency seam | `transcribe-${recordingId}` + idempotency `event.data.recordingId` | ✓ WIRED | function idempotency:'event.data.recordingId' (line 43) + step.run('whisper-transcribe') |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| REC-01 | 91-01 | No opaque 503; graceful discriminated state | ✓ SATISFIED | route.ts discriminated 200 contract |
| REC-02 | 91-01 (render) / 91-02 (wiring) | Human-readable failure + Retry + Edit-manually | ✓ SATISFIED | capture-failure.tsx + capture-recorder reasonForJobState mapping & wiring |
| REC-03 | 91-02 | Traceable attempt lineage; Edit-manually preserves context | ✓ SATISFIED | attemptId refs + payloads; router.push to project |
| REC-04 | 91-01/91-02 | Idempotent jobs, no double-charge (INNGEST-06) | ✓ SATISFIED | client requestId honored + stable event ids + step.run/idempotency keys |
| REC-05 | 91-01/91-02 | Hook + all consumers interpret graceful states without throwing | ✓ SATISFIED | pollJob/useJobStatus + 3 consumers rewired to discriminant |

No orphaned requirements: all 5 IDs in REQUIREMENTS.md map to Phase 91 and are claimed by plan frontmatter; REQUIREMENTS.md marks each Complete (lines 76-80).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| tsc clean + 5 Phase 91 suites pass (27/27) | (orchestrator-confirmed) | green | ✓ PASS |
| Live capture/Inngest E2E | n/a | requires running dev + dev:inngest + provider keys | ? SKIP (routed to human) |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| (none in phase-modified files) | — | No leftover 503/502 in jobs route; no `Status check failed`; no masking `as GenerateEstimateResponse` casts | — | The 503/502 grep hits are all in unrelated routes (translate/cron/estimates/admin), not the recording pipeline. The `output: ""` / DB-read pattern in capture-recorder is a documented Inngest-dev-server quirk, not a stub. |

### Human Verification Required

Automated verification passed all 13 must-haves. The following require live UAT (deferred to phase UAT, per VALIDATION.md Manual-Only table) — they do NOT block goal achievement at the code level:

1. **Capture popup failure UI** — Record audio with Inngest unconfigured; confirm plain-language reason + Retry + Edit-manually, no raw 503/stack.
2. **No double-charge on Retry** — Trigger a failure, tap Retry; confirm a single usage_events row / one provider charge for an already-successful step.
3. **Edit manually preserves context** — Confirm landing on /projects/[id] with recording + transcript attached.
4. **Non-capture consumers surface failures** — With Inngest unconfigured, run text-describe / photos-input / header AI input; confirm failure toast, no false success navigation, no generation on a failed transcript.

### Gaps Summary

No gaps. Every must-have across both plans is present, substantive, wired, and data-flow-correct in the actual codebase. The opaque 503 is eliminated (single 200 discriminated `state` contract), the polling layer and all four production pollJob consumers read the discriminant without relying on a thrown exception, attempt lineage (attemptId/requestId/recordingId) is minted once and reused on Retry, and the dispatch routes honor client-supplied idempotency keys that map onto the existing `step.run` + `idempotency` boundaries in the Inngest functions so an already-successful step is memoized while a failed step re-runs.

Pre-existing unrelated failing suites (vitest-4 mock-hoisting drift in admin/blog/seo/etc.) were independently confirmed as non-regressions and logged to deferred-items.md — not counted against this phase.

---

_Verified: 2026-05-29_
_Verifier: Claude (gsd-verifier)_
