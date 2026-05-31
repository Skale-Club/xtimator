# Phase 91: Recording Pipeline Reliability - Research

**Researched:** 2026-05-28
**Domain:** Next.js 16 App Router API hardening + Inngest v4 background-job reliability + React capture-flow UX
**Confidence:** HIGH (all claims grounded in current source reads; one external API shape verified via Inngest docs)

## Summary

The opaque 503 is real and originates at exactly one place: `app/api/jobs/[jobId]/route.ts:37-42` returns `503 { error: 'Inngest not configured' }` when `!devMode && !signingKey`. `hooks/use-job-status.ts` then converts *any* non-200 (including this 503) into a synthetic `status: 'Failed'` with `error: "Status 503"` (hook variant, line 75) or throws `"Status check failed: 503"` (the `pollJob` standalone helper, line 37). The capture popup's `runPipeline`/`triggerEstimateGeneration` catch that throw and call `failAt(...)`, surfacing the raw message. So the symptom chain is: missing env config → 503 → hook throws → popup shows `"Status check failed: 503"`.

Critically, in real local use the 503 is **not** the most common failure — the documented production-like failure (`.planning/debug/transcribing-hangs.md`) is that the Inngest job itself *fails* (missing `OPENROUTER_API_KEY`), the job retries for ~70s, then the run reports `Failed`, and the popup shows whatever Inngest returns. Phase 91 must handle **both**: (a) config-unavailable (no signing key / dev server down → 503 today) and (b) genuine job failure (run status `Failed`). These are different states and the success criteria (REC-05) explicitly require distinguishing them.

The good news for REC-04 (idempotency / INNGEST-06): **the Inngest functions are already substantially idempotent.** All three pipeline functions (`transcribe-audio`, `generate-estimate`, `analyze-photos`) already declare `idempotency:` keys, wrap every external provider call in `step.run()`, and the dispatch sites already pass deterministic event `id`s. The carry-forward work for REC-04 is mostly *verification + closing the retry-lineage gap* rather than a from-scratch build — see Runtime State Inventory and Common Pitfalls. INNGEST-01 (worker registration/reachability) is **already wired** (`app/api/inngest/route.ts` serves 7 functions); the remaining INNGEST-01 work is making the *job-status endpoint* degrade gracefully when the worker/keys are absent, not registering the worker.

**Primary recommendation:** Change the job-status endpoint to a non-error JSON contract (`{ state: 'processing' | 'failed' | 'completed' | 'config_unavailable', reason, ... }`, always HTTP 200 for known states), rewrite `use-job-status.ts` to interpret that contract without throwing on non-200, give `CaptureFailure` a human-readable reason mapped from the new states, thread an `attemptId` through the capture flow + Inngest events so Retry continues the same lineage, and add tests verifying retries reuse the same idempotency key (no double-charge). Do NOT introduce a new queue/library — Inngest v4.4.0 already provides everything needed.

## User Constraints

No `CONTEXT.md` exists for this phase (only `.gitkeep` in `.planning/phases/91-recording-pipeline-reliability/`). There are therefore no locked decisions, discretion areas, or deferred ideas from a discuss step. The authoritative constraints come from `REQUIREMENTS.md` Key Decisions and `ROADMAP.md` Phase 91 Success Criteria, reproduced under Phase Requirements below.

## Phase Requirements

| ID | Description (from REQUIREMENTS.md) | Research Support |
|----|-----------------------------------|------------------|
| REC-01 | `GET /api/jobs/[jobId]` no longer hard-503s when Inngest unconfigured — completes INNGEST-01 OR degrades gracefully to an actionable, non-error status the client can render (never opaque 503) | Root cause located at `route.ts:37-42`; worker already registered (`app/api/inngest/route.ts`); see Architecture Pattern 1 for the graceful-degradation contract |
| REC-02 | Capture popup shows human-readable failure reason + Retry + "Edit manually" — never raw status code or stack | `CaptureFailure` component already exists (`components/capture/capture-failure.tsx`) but renders `errorMessage` verbatim (currently raw `"Status 503"`); needs a state→message map. Retry + Edit-manually buttons already wired in `capture-recorder.tsx:607-624` |
| REC-03 | Retry creates/continues a traceable attempt (same attempt id lineage); "Edit manually" preserves project context | No attempt-id concept exists today (Open Question 1). Retry currently re-runs `runPipeline(audioBlob)` and re-mints a fresh `recordingId`/`requestId`. "Edit manually" already navigates to `/projects/${projectId}` preserving the project + recording rows. See Architecture Pattern 3 |
| REC-04 | Inngest jobs idempotent — `step.run()` + explicit `idempotencyKey` per job so retries never double-charge AI/transcription (carry-forward INNGEST-06) | **Already 80% done**: all 3 functions declare `idempotency:` + use `step.run()`. Gap is verifying + tying the *user-initiated retry* to the same key. See Don't Hand-Roll + Pitfall 4 |
| REC-05 | `hooks/use-job-status.ts` interprets new graceful statuses — distinguishes "still processing" / "failed with reason" / "config unavailable" without throwing on non-200 | Hook currently maps every non-200 to `Failed` (line 73-78) and `pollJob` throws (line 36-37). Needs rewrite against the new contract. See Architecture Pattern 2 |

## Standard Stack

No new libraries needed. Everything required is already installed and in use.

### Core
| Library | Version (verified) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| `inngest` | `^4.4.0` (package.json) | Background job runner + retries + idempotency + step functions | Already the project's locked queue (v3.1.1 Key Decision 2: "Inngest is the AI timeout fix and stays even after Hetzner migration") |
| `next` | `16.2.6` (package.json) | App Router route handlers + server actions | Project framework (CLAUDE.md) |
| `vitest` | `^4.1.4` (package.json) | Unit tests (Nyquist validation enabled) | Project test runner; `npm run test` = `vitest run` |

### Supporting (already in codebase, reuse)
| Module | Path | Purpose | When to Use |
|--------|------|---------|-------------|
| `XtimatorError` / `asResponse` | `lib/errors/index.ts` | Typed error → JSON response with `code` + `userMessage` | For any *server-thrown* error in routes (NOT for the graceful job-status states, which should be 200 JSON) |
| `useTranslation().t` | `lib/i18n/use-translation.ts` | Wrap user-facing strings | EVERY new user-facing string in the popup/failure UI (see Project Constraints) |
| `<T>` component | `components/i18n/t` | i18n for JSX children in components that aren't easily `t()`-wrapped | Used in `estimate-creation-popup.tsx` |
| `pollJob` / `useJobStatus` | `hooks/use-job-status.ts` | Job polling | The two surfaces to modify for REC-05 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inngest idempotency config | DB-level dedup table | Already have `usage_events` partial UNIQUE on `(company_id, idempotency_key)` AND Inngest `idempotency:` — adding a third layer is redundant. Don't. |
| Polling `/api/jobs/[id]` | Inngest SSE / realtime | INNGEST-05 already shipped polling; switching transports is out of scope and not required by any REC requirement |

**Installation:** None. (`npm install` already satisfies all deps.)

## Architecture Patterns

### Recommended change surface (files to touch)
```
app/api/jobs/[jobId]/route.ts        # REC-01: replace 503 with graceful 200 contract; distinguish config vs failure
hooks/use-job-status.ts              # REC-05: interpret new contract; stop throwing on non-200
components/capture/capture-failure.tsx     # REC-02: map state→human message (+ i18n)
components/capture/capture-recorder.tsx    # REC-02/03: thread attemptId; map terminal state→reason; retry reuses attempt
lib/inngest/events.ts                # REC-03: add attemptId to payload types
lib/actions/recording.ts             # REC-03: accept/forward attemptId on dispatch
app/api/transcribe/route.ts          # REC-03/04: accept attemptId; keep deterministic event id
app/api/generate-estimate/route.ts   # REC-03/04: accept attemptId; keep deterministic event id
tests/unit/api/jobs-status.test.ts   # update existing 503 test (line 66-77) to new contract
```

### Pattern 1: Graceful job-status contract (REC-01)
**What:** The endpoint should return HTTP 200 with a discriminated `state` for every *known* condition, reserving non-200 only for truly unexpected upstream errors. The capture popup polls this every ~1.5s; a 503/502 in that loop is what breaks the UI.

**Current code (the bug), `app/api/jobs/[jobId]/route.ts:35-42`:**
```ts
const devMode = isDevMode()
const signingKey = process.env.INNGEST_SIGNING_KEY
if (!devMode && !signingKey) {
  return NextResponse.json({ error: 'Inngest not configured' }, { status: 503 })  // ← REC-01 root cause
}
```

**Recommended contract (planner decides exact field names; this is the shape the hook + popup can render):**
```ts
// Source: existing run-status values verified against Inngest docs (see Sources).
// Always HTTP 200 for these known states so the polling loop never throws.
type JobStatusContract =
  | { state: 'processing' }                                  // Inngest Running OR run not yet started
  | { state: 'completed'; output: unknown | null }           // Inngest Completed
  | { state: 'failed'; reason: string }                      // Inngest Failed | Cancelled (reason = safe summary)
  | { state: 'config_unavailable' }                          // signing key missing / dev server unreachable
  | { state: 'not_found' }                                   // Inngest 404 — event id unknown (can stay 404 if preferred)
```
**Why 200 not 503/502:** REC-01 Key Decision 2 ("Graceful degradation over hard failure"). The `config_unavailable` state is *actionable* (the popup can say "Processing service is temporarily unavailable — your recording is saved; Edit manually") whereas a 503 is opaque. Note: the existing 502 branch (`route.ts:56-58`, Inngest API itself erroring) and 404 branch (`route.ts:53-55`) are arguably also worth folding into the contract so the hook has one code path — flag for the planner.

**Dev-mode vs prod-mode is already handled** via `isDevMode()` reading `INNGEST_DEV` (`route.ts:19-22`). The subtlety: the local-dev docs (`docs/INNGEST-LOCAL-DEV.md`) instruct devs to set `INNGEST_SIGNING_KEY` to *any non-empty value*, which makes `!signingKey` false and avoids the 503 — so the 503 mainly bites when env is genuinely unset (e.g. a fresh clone, or prod before the Inngest-Vercel integration syncs keys). The `config_unavailable` state must cover both "no key" and "dev server not running" (the latter currently surfaces as a fetch failure / 502).

### Pattern 2: Hook interprets contract without throwing (REC-05)
**What:** Both `pollJob` (standalone, line 33-47) and `useJobStatus` (hook, line 53-103) currently treat non-200 as fatal. Rewrite to read `state` from the 200 body.

**Current (throws), `hooks/use-job-status.ts:34-37`:**
```ts
const res = await fetch(`/api/jobs/${jobId}`, { signal })
if (!res.ok) {
  throw new Error(`Status check failed: ${res.status}`)   // ← REC-05: this is what leaks "Status check failed: 503"
}
```
**Recommended:** parse `state`; on `processing` keep polling; on `completed` resolve `output`; on `failed`/`config_unavailable`/`not_found` resolve a *typed result* (not a thrown raw-status error) that carries the reason so the caller maps it to a friendly message. The hook variant should set a discriminated state object instead of `{ status: 'Failed', error: 'Status 503' }` (line 75).

**Anti-pattern to avoid:** keeping the `throw new Error("Status check failed: " + res.status)` and just catching it higher up — the failure *reason* (config vs genuine failure) is lost once it's stringified into an HTTP status. Carry the discriminant.

### Pattern 3: Attempt-id lineage for Retry (REC-03)
**What:** Today there is **no attempt-id**. On Retry, `capture-recorder.tsx:613-616` re-calls `runPipeline(audioBlob)`, which mints a brand-new `recordingId = crypto.randomUUID()` (line 306) → a new recording row → a new transcribe event id `transcribe-${recordingId}` → a new generate `requestId`. So a retry today is a *fresh* attempt, not a continuation, and it can re-upload + re-charge.

**Recommended:** introduce an `attemptId` (UUID minted once when the user first hits "Generate" / starts recording, stored in a ref in `capture-recorder.tsx`). Thread it:
- into `EstimateGeneratePayload` / `TranscribeAudioPayload` (`lib/inngest/events.ts`) as `attemptId`,
- into the dispatch routes + `transcribeRecording` action,
- on Retry, **reuse the same `attemptId`** and (decision for planner) either reuse the same `recordingId`/`requestId` (true idempotent continuation — no re-charge) or mint a child request under the same `attemptId` with `retry_count` incremented (Phase 92's event store will read this lineage; REC-03 only requires the lineage to *exist* and be traceable).

**Note for the planner:** REC-03's attempt-id is the seam Phase 92 (EVENT-03: "retries increment `retry_count` and link to the originating attempt id") and Phase 93 build on. Get the field name + threading right here so Phase 92 doesn't have to re-thread it.

**"Edit manually" already preserves context** — `capture-recorder.tsx:617-620` does `router.push('/projects/${projectId}')` after the recording row + transcript are already persisted in the DB. No recording work is lost; the user lands in the workspace tabs with the recording attached. REC-03's "Edit manually" half is mostly already satisfied; verify and add a test.

### Pattern 4: Idempotent jobs (REC-04 / INNGEST-06) — mostly DONE, verify
**What:** All three functions already follow the required pattern:
- `transcribe-audio.ts:42` → `idempotency: 'event.data.recordingId'`, `retries: 2`, Whisper call inside `step.run('whisper-transcribe')` (line 74), DB write in a *separate* `step.run('save-transcript')` (line 90).
- `generate-estimate.ts:38` → `idempotency: 'event.data.requestId'`, AI call inside `step.run('call-ai-provider')` (line 69), usage recorded in separate `step.run('record-usage')` (line 79) backed by `usage_events` partial UNIQUE on `(company_id, idempotency_key)` (commented line 77-78).
- `analyze-photos.ts:54` → `idempotency: 'event.data.requestId'`, one `step.run('vision-${photo.id}')` per photo (line 100).

Dispatch sites already pass deterministic event ids: `transcribe-${recordingId}` (recording.ts:155, transcribe route:106), `estimate-${projectId}-${requestId}` (generate-estimate route:97).

**The remaining REC-04 work is therefore:** (1) confirm the user-facing **Retry** path reuses the same idempotency key (it currently does NOT — see Pattern 3), and (2) add explicit tests proving a re-dispatched identical event does not double-invoke the provider. Do not re-architect the functions.

### Anti-Patterns to Avoid
- **Returning 503/502 inside a 1.5s polling loop** — any non-200 makes the hook throw; that's the whole bug. New known states = 200 JSON.
- **Stringifying the failure reason into an HTTP status** — loses the config-vs-failure discriminant REC-05 needs.
- **Adding a new dedup/queue layer** — three idempotency mechanisms already exist (Inngest `idempotency:`, deterministic event `id`, `usage_events` UNIQUE). More is regression risk.
- **Hardcoded English strings in the popup/failure UI** — violates the i18n convention (CLAUDE.md / Phase 12 decisions). `CaptureFailure` currently has hardcoded `"Retry"`/`"Edit manually"` (capture-failure.tsx:19,24) — these should be `t()`-wrapped as part of REC-02.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job retries with backoff | Custom retry loop | Inngest `retries: 2` (already set on all 3 functions) | Inngest owns exponential backoff; the ~70s in the debug doc *is* Inngest backoff |
| Provider call dedup | New dedup table | Inngest `idempotency:` + existing `usage_events` UNIQUE | Two layers already exist; adding a third is redundant |
| Step-level checkpointing | Manual "did this step run?" flags | `step.run()` (already wrapping every external call) | Inngest memoizes successful steps across retries |
| Error→HTTP mapping for thrown errors | Inline `NextResponse.json({error}, {status})` | `XtimatorError` + `asResponse` (`lib/errors/index.ts`) | Project convention; gives `code` + i18n-able `userMessage`. NOTE: the *graceful job states* should be 200 JSON, not thrown errors |

**Key insight:** Phase 91 is a *reliability + UX* phase, not a *build new infra* phase. The heavy lifting (Inngest functions, idempotency, polling, the failure component, the edit-manually path) already exists from Phase 67. The work is closing seams: graceful endpoint contract, hook interpretation, human-readable reasons, and attempt-id lineage.

## Runtime State Inventory

> This is a brownfield bug-fix/reliability phase touching dispatch payloads, an API contract, and an idempotency-key strategy. Inventory of runtime state that a code-only change would miss:

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `recordings` table (`storage_path`, `transcript`, `duration_seconds`, NO attempt_id column — schema at `supabase/migrations/20260409000001_initial_schema.sql:67-75`; `storage_path` made nullable by `20260508000002`). `estimates` table has `is_current` flag the popup reads (`capture-recorder.tsx:277,386`). | If `attemptId` (REC-03) needs to *persist* on the recording for Phase 92 lineage, a migration adds a nullable `attempt_id` column. If `attemptId` stays in-flight only (event payload), no migration. **Planner decision.** Phase 92 (EVENT-01) creates the dedicated events table — REC-03 may only need the id to exist in the event payload, not a recordings column. |
| Live service config | Inngest Cloud app `xtimator` (`lib/inngest/client.ts:12`). Functions are registered via `serve()` at `app/api/inngest/route.ts` and (in prod) synced to Inngest Cloud via the Inngest-Vercel integration (per `docs/INNGEST-LOCAL-DEV.md:66`). Registration config lives in code (good) but the *sync* to Inngest Cloud happens at deploy time, not in git. | No git-tracked config to change for REC. Verify (manual/UAT) that the 7 functions are reachable. INNGEST-01 "publicly reachable" = the `/api/inngest` route is not auth-gated (confirm `proxy.ts` allows it — it lists inngest among public paths per the env grep hit). |
| OS-registered state | None. No cron/Task Scheduler/pm2 state references the recording pipeline. (Vercel cron + pg_cron exist for other features but not REC.) | None — verified by grep; no OS-level registration carries pipeline identifiers. |
| Secrets/env vars | `INNGEST_SIGNING_KEY`, `INNGEST_EVENT_KEY`, `INNGEST_DEV` (gate the job-status route, `route.ts:19-22,36`); `OPENROUTER_API_KEY` (the real-world failure cause per `.planning/debug/transcribing-hangs.md`). These are *read by name* in code; REC changes the *response when they're absent*, not the key names. | None to rename. The graceful-degradation logic must correctly detect their absence (REC-01). The env example (`.env.local.example`) documents `INNGEST_SIGNING_KEY` + `OPENROUTER_API_KEY` but NOT `INNGEST_DEV` — flag: docs gap, not a blocker. |
| Build artifacts / installed packages | None. No compiled artifact or egg-info carries pipeline state. | None — verified. |

**The canonical question — after every file is updated, what runtime state still has the old behavior cached?** Two things: (1) a running Next.js dev process holds env vars from start (debug doc note: must restart `npm run dev` after editing `.env.local`); (2) Inngest Cloud holds the *previously synced* function definitions until the next deploy/sync. Neither blocks Phase 91 code work but both matter for UAT verification.

## Common Pitfalls

### Pitfall 1: The 503 is rare in normal dev; the real failure is a Failed run
**What goes wrong:** A developer fixes the 503 path, tests locally (where `INNGEST_SIGNING_KEY` is set per the docs, so the 503 never fires), sees green, and ships — but the *actual* user-reported failure (`transcribing-hangs.md`) is the job *running and failing* after ~70s of retries, which is the `Failed` state, not `config_unavailable`.
**Why it happens:** REC-01's headline is the 503, but REC-02/REC-05 require handling the genuine-failure state too. Local dev with keys set masks the 503 path.
**How to avoid:** Test BOTH states explicitly. Simulate `config_unavailable` (unset key) AND `failed` (mock Inngest run status `Failed`). The existing test file (`tests/unit/api/jobs-status.test.ts`) already mocks Inngest run responses — extend it.
**Warning signs:** Only the 503 test changed; no `Failed`-state assertion in the popup/hook tests.

### Pitfall 2: Inngest run ordering / multiple runs per event
**What goes wrong:** `route.ts:63` takes `json.data?.[0]` — the *first* run for the event. The debug doc's deferred note (line 117) flags that run ordering is not documented as guaranteed, and with retries there can be multiple run records.
**Why it happens:** One event id → potentially multiple runs (initial + retries, or onFailure handler runs which appear as separate `inngest/function.failed` runs per the debug doc line 21).
**How to avoid:** When reading status, prefer filtering to the target function (the debug doc suggests `function_id === 'transcribe-audio'`) or taking the most recent run, rather than blindly `data[0]`. Flag for the planner — this is a latent correctness bug the graceful-contract rewrite is a natural place to fix.
**Warning signs:** Status flips back to `processing` after `failed`, or the `onFailure` notification-handler run is mistaken for the main run.

### Pitfall 3: Retry re-mints IDs → double-charge (the REC-04 trap)
**What goes wrong:** Current Retry (`capture-recorder.tsx:613-616`) calls `runPipeline(audioBlob)` which mints a fresh `recordingId` and a fresh `requestId`, so Inngest's `idempotency:` key is different → the provider IS charged again. The functions are idempotent *per key*, but a user retry generates a new key.
**Why it happens:** Idempotency keys are derived from per-call UUIDs, not from a stable attempt id.
**How to avoid:** REC-03's `attemptId` must feed the idempotency key (or the retry must reuse the original `recordingId`/`requestId`). This is the intersection of REC-03 and REC-04 — they must be designed together.
**Warning signs:** Hitting Retry produces a second `usage_events` row / a second OpenRouter charge.

### Pitfall 4: `pollJob` and `useJobStatus` are two separate code paths
**What goes wrong:** `hooks/use-job-status.ts` exports BOTH a standalone `pollJob` (used by the popup, line 33) AND a `useJobStatus` React hook (line 53). They have independent non-200 handling (`pollJob` throws at line 36; the hook sets `Failed` at line 75). A fix applied to only one leaves the other broken.
**Why it happens:** The popup uses `pollJob` (imperative), other surfaces use the hook.
**How to avoid:** REC-05 must update *both*. Search for all `pollJob` callers — `capture-recorder.tsx` (lines 272, 338, 382, 442) and `components/workspace/ai-input-group/use-ai-input-submit.ts` (referenced in capture-recorder comments) and `ai-voice-dialog.tsx` (referenced in recording.ts:124).
**Warning signs:** Voice-refinement or AI-input-group flows still throw raw status while the capture popup is fixed.

### Pitfall 5: i18n strings must be literal at the call site
**What goes wrong:** New failure messages built via a `Record<state, string>` at render time won't be picked up by the i18n extractor (the codebase explicitly warns about this — `capture-processing-overlay.tsx:20-21`: "Keep raw string literals so the i18n extractor picks them up — do NOT build labels via a Record at render time").
**How to avoid:** Map state→message with inline ternaries of `t('literal')`, mirroring `capture-processing-overlay.tsx:22-28`.
**Warning signs:** PT/ES users see English failure reasons.

## Code Examples

### Existing idempotency pattern (the model to preserve), `lib/inngest/functions/generate-estimate.ts:35-82`
```ts
// Source: lib/inngest/functions/generate-estimate.ts (in-repo, Phase 67)
export const generateEstimateJob = inngest.createFunction(
  {
    id: 'generate-estimate',
    idempotency: 'event.data.requestId',   // ← per-job idempotency (REC-04)
    retries: 2,                             // ← Inngest owns backoff
    triggers: [{ event: EVENT_ESTIMATE_GENERATE }],
    onFailure: async ({ event, error }) => { /* ai_job.failed notification */ },
  },
  async ({ event, step }) => {
    const { companyId, projectId, requestId, language, prompts } = event.data
    const result = await step.run('call-ai-provider', async () => {  // ← heavy call checkpointed
      return await generateEstimateForProject(companyId, projectId, { ... })
    })
    await step.run('record-usage', async () => {  // ← usage in a separate step; usage_events UNIQUE(company_id, idempotency_key)
      await recordUsage(requireServiceClient(), companyId, 'estimate_generated', 1, requestId)
    })
    return result
  }
)
```

### Existing dispatch with deterministic event id, `app/api/generate-estimate/route.ts:91-100`
```ts
// Source: app/api/generate-estimate/route.ts (in-repo)
const payload: EstimateGeneratePayload = { companyId, projectId, requestId, language }
const { ids } = await inngest.send({
  name: EVENT_ESTIMATE_GENERATE,
  id: `estimate-${projectId}-${requestId}`,   // ← event-level dedup; jobId returned to client = ids[0]
  data: payload,
})
return NextResponse.json({ jobId: ids[0] }, { status: 202 })
```

### Existing failure UI (extend for REC-02), `components/capture/capture-failure.tsx`
```tsx
// Source: components/capture/capture-failure.tsx (in-repo)
// Already has Retry + Edit manually + retriesUsed cap (2). Gaps:
//  - errorMessage is rendered verbatim (today: raw "Status 503")
//  - "Retry"/"Edit manually" are hardcoded English (need t())
<p className="text-sm text-destructive">{errorMessage}</p>   // ← map state→t('friendly reason') upstream
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline Whisper/Anthropic in server actions/routes | Inngest background jobs with `step.run()` + `idempotency:` | Phase 67 (v3.1.1) | The pipeline is already async + idempotent; Phase 91 only hardens the edges |
| Direct OpenAI/Anthropic SDKs | All AI via OpenRouter (`lib/ai/openrouter-client.ts`) | commit 4bdd1ae, 2026-05-21 | The documented failure cause is a missing `OPENROUTER_API_KEY`, surfaced as a `Failed` run, NOT a 503 |
| `inngest@3.x` config keys | `inngest@4.4.0` — `idempotency`, `retries`, `triggers`, `onFailure` config object (in use, working) | package.json | API in the repo is v4-correct; no migration needed |

**Deprecated/outdated:**
- The anchor `lib/inngest/recording.ts` named in the task brief **does not exist**. Dispatch logic lives in `lib/actions/recording.ts` (`transcribeRecording`) + `app/api/transcribe/route.ts` + `app/api/generate-estimate/route.ts`. The `recording_added` write is in `lib/actions/recording.ts:105-110` (and `description_added` for text at line 56-61).
- `lib/inngest/functions.ts` (singular file named in brief) is actually a **directory** `lib/inngest/functions/` with one file per job + `index.ts`.
- A stale test (`tests/unit/inngest/transcribe-audio-job.test.ts`) still asserts the old OpenAI URL per the debug doc (line 84-87) — flag for cleanup, not a Phase 91 blocker.

## Open Questions

1. **Where should `attemptId` live — event payload only, or a `recordings.attempt_id` column?**
   - What we know: REC-03 needs a traceable lineage; Phase 92 (EVENT-03) needs retries to "link to the originating attempt id".
   - What's unclear: whether Phase 91 should add a DB column now or defer persistence to Phase 92's events table.
   - Recommendation: thread `attemptId` through the event payload + UI in Phase 91 (no migration); let Phase 92's events table own durable persistence. Confirm with planner — adding a nullable `recordings.attempt_id` now is low-risk if Phase 92 wants it on the recording row.

2. **Should Retry reuse the original IDs (true idempotent continuation, no re-charge) or mint a child request under the same attemptId (re-charge but traceable)?**
   - What we know: REC-04 says "retries never double-charge"; REC-03 says "same attempt id lineage".
   - What's unclear: a *genuinely failed* job (e.g. transient provider error) may *need* to re-run the provider call — that's a legitimate charge, not a double-charge. The "never double-charge" guarantee is about *accidental* re-dispatch of an *already-successful* job.
   - Recommendation: reuse the same `attemptId` for lineage; for the idempotency key, reuse the original `requestId`/`recordingId` so an *already-completed* step is memoized (no re-charge) while a *failed* step legitimately re-runs. Inngest's `step.run()` memoization already gives this if the key is stable. Planner should make this explicit.

3. **Fold the existing 404/502 branches into the graceful contract, or leave them?**
   - What we know: `route.ts:53-58` returns 404 and 502 for Inngest-not-found and Inngest-API-error respectively.
   - Recommendation: fold both into the 200 contract (`state: 'not_found'` / `state: 'failed'`) so the hook has exactly one code path and never throws — but this is a design call for the planner.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `inngest` (npm) | All pipeline jobs | ✓ | `4.4.0` | — |
| `next` | Routes + actions | ✓ | `16.2.6` | — |
| `vitest` | Nyquist tests | ✓ | `4.1.4` | — |
| `inngest-cli` (dev server) | Local UAT of pipeline | ✓ via `npx` (`npm run dev:inngest`) | latest | Cloud Inngest in prod |
| `INNGEST_SIGNING_KEY` | job-status route prod path | env-dependent | — | dev-mode (`INNGEST_DEV`) + the new `config_unavailable` graceful state |
| `OPENROUTER_API_KEY` | actual transcription/vision | env-dependent (was MISSING in the bug report) | — | none — its absence is exactly what produces the `Failed` state REC-02 must render |

**Missing dependencies with no fallback:** None block *code* work. For end-to-end UAT, both `INNGEST_SIGNING_KEY` (any non-empty value locally) and `OPENROUTER_API_KEY` must be set, and both `npm run dev` + `npm run dev:inngest` must run.

**Missing dependencies with fallback:** `INNGEST_SIGNING_KEY` absence is now a designed-for state (`config_unavailable`) rather than a crash.

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` (key present and enabled).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `4.1.4` |
| Config file | `vitest` config present; include pattern scoped to `tests/unit/**` (STATE.md decision) |
| Quick run command | `npx vitest run tests/unit/api/jobs-status.test.ts` |
| Full suite command | `npm run test` (= `vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REC-01 | job-status returns graceful 200 (not 503) when signing key absent | unit | `npx vitest run tests/unit/api/jobs-status.test.ts` | ✅ exists — UPDATE the `returns 503...` test (line 66-77) to assert `config_unavailable` 200 |
| REC-01 | job-status maps Inngest `Failed` run → `state: 'failed'` with reason | unit | same file | ✅ exists — add case |
| REC-05 | `pollJob` does NOT throw on the new states; resolves typed result | unit | `npx vitest run tests/unit/hooks/use-job-status.test.ts` | ❌ Wave 0 (no test file found for the hook) |
| REC-05 | `useJobStatus` hook sets discriminated state, not `{status:'Failed',error:'Status 503'}` | unit | same | ❌ Wave 0 |
| REC-02 | `CaptureFailure` renders friendly i18n reason + Retry + Edit-manually (no raw code) | unit/component | `npx vitest run tests/unit/components/capture-failure.test.ts` | ❌ Wave 0 (verify; none found) |
| REC-03 | Retry reuses same `attemptId`; Edit-manually preserves project context | unit | capture-recorder test | ❌ Wave 0 (verify; none found) |
| REC-04 | re-dispatching identical event does not double-invoke provider (idempotency key stable) | unit | `npx vitest run tests/unit/inngest/` | ⚠️ partial — `transcribe-audio-job.test.ts` exists but is STALE (asserts old OpenAI URL); needs repair + idempotency assertion |

### Sampling Rate
- **Per task commit:** `npx vitest run <touched test file>`
- **Per wave merge:** `npm run test`
- **Phase gate:** full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/hooks/use-job-status.test.ts` — covers REC-05 (both `pollJob` and `useJobStatus` against the new contract)
- [ ] `tests/unit/components/capture-failure.test.ts` — covers REC-02 (state→message map, i18n, button presence) — confirm one doesn't already exist under another name
- [ ] capture-recorder attempt-lineage test — covers REC-03 (Retry reuses attemptId)
- [ ] Repair `tests/unit/inngest/transcribe-audio-job.test.ts` (stale OpenAI assertion per debug doc) + add REC-04 idempotency assertion
- [ ] Update existing `tests/unit/api/jobs-status.test.ts:66-77` (the `returns 503` case) to the new graceful contract

*(Framework install: none — Vitest already present.)*

## Project Constraints (from CLAUDE.md)

- **Stack is fixed:** Next.js 16 App Router, TypeScript strict, Tailwind, shadcn/ui — no new UI framework.
- **AI is server-side only:** all provider calls already run inside Inngest functions (server). Do not move any AI call to the browser.
- **Service role key never in browser:** the job-status route is the server-side proxy precisely so `INNGEST_SIGNING_KEY` never reaches the client (`route.ts:8-14`). Preserve this — the graceful contract must not leak the key or its presence beyond a boolean-ish `config_unavailable`.
- **Secret handling (CRITICAL):** never put real `INNGEST_*` / `sk-*` / `sk-or-*` values in any planning doc, test fixture, or example. Use placeholders. (gitleaks pre-commit hook enforces; debug doc + env examples already use placeholders.)
- **i18n required:** wrap all user-facing strings with `t()` / `<T>`. `CaptureFailure`'s hardcoded "Retry"/"Edit manually" must be fixed as part of REC-02.
- **GSD workflow:** all edits go through the phase execution flow; no ad-hoc edits.
- **RLS:** the job-status route uses the authenticated client for `getClaims()` (auth gate) but does NOT enforce per-job ownership (`route.ts:11-14` documents this as a tracked follow-up). Phase 91 does not have to fix ownership, but should not regress it — flag if the graceful rewrite is a natural place to add the ownership check.

## Sources

### Primary (HIGH confidence) — in-repo reads
- `app/api/jobs/[jobId]/route.ts` — 503 root cause (lines 37-42), dev-mode detection (19-22), run-status read (60-72)
- `hooks/use-job-status.ts` — `pollJob` throw (34-37), hook `Failed` mapping (73-78)
- `components/capture/capture-recorder.tsx` — pipeline + failAt + Retry + Edit-manually (210-213, 298-466, 607-644)
- `components/capture/capture-failure.tsx` — failure UI (full file)
- `lib/inngest/functions/{transcribe-audio,generate-estimate,analyze-photos}.ts` — idempotency + step.run patterns
- `lib/inngest/events.ts` — event names + payload types
- `lib/inngest/client.ts` + `app/api/inngest/route.ts` — client config + serve() registration of 7 functions
- `lib/actions/recording.ts` — dispatch + `recording_added`/`description_added` activity writes
- `app/api/transcribe/route.ts` + `app/api/generate-estimate/route.ts` — dispatch routes + deterministic event ids
- `lib/errors/index.ts` — `XtimatorError` / `asResponse` convention
- `lib/i18n/use-translation.ts` + `components/capture/capture-processing-overlay.tsx` — i18n call-site pattern
- `.planning/debug/transcribing-hangs.md` — documented real-world failure (OpenRouter key → Failed run, ~70s)
- `tests/unit/api/jobs-status.test.ts` — existing endpoint test (the 503 case to update)
- `supabase/migrations/20260409000001_initial_schema.sql:67-75` — `recordings` table (no attempt_id column)
- `docs/INNGEST-LOCAL-DEV.md` + `.env.local.example` — env/config requirements
- `package.json` — inngest 4.4.0, next 16.2.6, vitest 4.1.4

### Secondary (MEDIUM confidence)
- Inngest docs — run-status values `Running | Completed | Failed | Cancelled` and `GET /v1/events/{eventId}/runs` shape, verified consistent with the codebase's existing usage (see Sources links below)

### Tertiary (LOW confidence)
- None. (Context7 MCP tools were not available in this environment; the Inngest API claims are cross-checked against both the official docs search and the working v4.4.0 usage already in the repo.)

## Metadata

**Confidence breakdown:**
- Root cause (503) & change surface: HIGH — read directly, single origin point confirmed
- Idempotency state (REC-04 mostly done): HIGH — all three functions read and confirmed
- Attempt-id lineage (REC-03): MEDIUM — no existing concept; design choices flagged as Open Questions
- Inngest run-status contract: HIGH — values match repo usage + docs
- Test gaps: MEDIUM — verified absence of hook/component tests by glob; planner should confirm no alternately-named files exist

**Research date:** 2026-05-28
**Valid until:** ~2026-06-27 (30 days; stable internal codebase, Inngest v4 API stable)

---

Sources:
- [Fetch run status and output - Inngest Documentation](https://www.inngest.com/docs/examples/fetch-run-status-and-output)
- [List event function runs - Inngest API reference](https://api-docs.inngest.com/docs/inngest-api/yoyeen3mu7wj0-list-event-function-runs)
- [Inngest Functions - Inngest Documentation](https://www.inngest.com/docs/learn/inngest-functions)
