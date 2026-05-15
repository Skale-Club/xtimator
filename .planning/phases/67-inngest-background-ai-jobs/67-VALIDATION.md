---
phase: 67
slug: inngest-background-ai-jobs
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-15
---

# Phase 67 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.x (unit) + manual smoke (Inngest dev dashboard observation) |
| **Config file** | `vitest.config.ts` (already configured) |
| **Quick run command** | `npx vitest run tests/unit/inngest --no-coverage` |
| **Full suite command** | `npx vitest run --no-coverage && npx tsc --noEmit` |
| **Estimated runtime** | ~30 seconds (unit only); manual smoke adds ~5 min |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/inngest --no-coverage` (just the new Inngest tests)
- **After every plan wave:** Run full vitest + `npx tsc --noEmit` to catch type regressions across the route refactors
- **Before `/gsd:verify-work`:** Full suite + manual smoke (start `inngest-cli dev` + `npm run dev`, dispatch one estimate job, watch dashboard show completion)
- **Max feedback latency:** 60 seconds (vitest unit) + 30 seconds (tsc)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| inngest client + serve handler | 01 | 1 | INNGEST-01 | Unit + manual | `npx vitest run tests/unit/inngest/client.test.ts` then `curl localhost:3000/api/inngest -I` returns 200 | `lib/inngest/client.ts`, `app/api/inngest/route.ts` | pending |
| generateEstimateJob function | 02 | 2 | INNGEST-02, INNGEST-06 | Unit | `npx vitest run tests/unit/inngest/generate-estimate-job.test.ts` (mocks step.run, asserts each external call wrapped) | `lib/inngest/functions/generate-estimate.ts` | pending |
| transcribeAudioJob function | 02 | 2 | INNGEST-03, INNGEST-06 | Unit | `npx vitest run tests/unit/inngest/transcribe-audio-job.test.ts` | `lib/inngest/functions/transcribe-audio.ts` | pending |
| analyzePhotosJob function | 02 | 2 | INNGEST-04, INNGEST-06 | Unit | `npx vitest run tests/unit/inngest/analyze-photos-job.test.ts` | `lib/inngest/functions/analyze-photos.ts` | pending |
| /api/generate-estimate refactor | 03 | 3 | INNGEST-02 | Unit | `npx vitest run tests/unit/api/generate-estimate-route.test.ts` (asserts returns jobId in <1s, no synchronous AI call) | `app/api/generate-estimate/route.ts` | pending |
| /api/transcribe refactor (NEW route) | 03 | 3 | INNGEST-03 | Unit | `npx vitest run tests/unit/api/transcribe-route.test.ts` | `app/api/transcribe/route.ts` | pending |
| /api/analyze-photos refactor | 03 | 3 | INNGEST-04 | Unit | `npx vitest run tests/unit/api/analyze-photos-route.test.ts` | `app/api/analyze-photos/route.ts` | pending |
| /api/jobs/[id] proxy | 03 | 3 | INNGEST-05 | Unit | `npx vitest run tests/unit/api/jobs-status.test.ts` (mocks Inngest API, verifies status mapping) | `app/api/jobs/[id]/route.ts` | pending |
| WhatsApp handler refactor | 04 | 4 | INNGEST-07 | Unit | `npx vitest run tests/unit/whatsapp/handler-inngest.test.ts` (asserts dispatch, NO inline await on Whisper/Vision) | `lib/whatsapp/handler.ts` | pending |
| Capture flow polling hook | 05 | 5 | INNGEST-05 | Unit + manual | `npx vitest run tests/unit/hooks/use-job-status.test.ts` then manual: dispatch from `/projects/[id]/capture`, observe stepper updates from polling | `hooks/use-job-status.ts`, `components/projects/voice-capture-recorder.tsx` | pending |
| Local dev workflow + scripts | 06 | 6 | INNGEST-08 | Doc + manual | `grep "dev:inngest" package.json` returns 1 hit; manual: `npm run dev:inngest` boots inngest-cli dashboard at :8288 | `package.json`, `README.md` | pending |

---

## Wave 0 (Test Scaffolding)

Wave 0 creates failing test stubs for every Inngest function and refactored route BEFORE any production code is written. This is mandatory per GSD Nyquist contract.

1. Create `tests/unit/inngest/` directory with 4 stub test files (client + 3 functions)
2. Create `tests/unit/api/jobs-status.test.ts` stub
3. Each stub uses `expect.fail('not implemented')` so tests fail loudly
4. CI green-light: `npx vitest run tests/unit/inngest tests/unit/api/jobs-status.test.ts` lists 5 failing tests

Wave 1+ implementations make stubs pass one by one.

---

## Goal-Backward Verification

**Phase Goal:** AI routes (`/api/generate-estimate`, `/api/transcribe`, `/api/analyze-photos`) and the WhatsApp inbound handler dispatch long work to Inngest functions and return job IDs in <1s, bypassing Vercel Free's 10s function timeout.

For the phase to be DONE, ALL of the following observable behaviors must be true:

1. ✅ `curl -X POST http://localhost:3000/api/generate-estimate -d '{...}' -H "Content-Type: application/json"` returns a JSON body with `jobId` in under 1 second
2. ✅ `curl -X POST http://localhost:3000/api/transcribe -F audio=@fixture.ogg` returns `{ jobId }` in under 1 second
3. ✅ `curl -X POST http://localhost:3000/api/analyze-photos -d '{...}'` returns `{ jobId }` in under 1 second
4. ✅ `curl http://localhost:3000/api/jobs/<id>` returns `{ status: "Running" | "Completed" | "Failed", output?, error? }`
5. ✅ Inngest dashboard at `localhost:8288` shows function runs for `generateEstimateJob`, `transcribeAudioJob`, `analyzePhotosJob` after dispatching from the routes
6. ✅ Sending a WhatsApp inbound audio message triggers an Inngest job (visible in dashboard); webhook ack returns in <10s
7. ✅ `grep -r "step.run(" lib/inngest/` returns at least 6 hits (1 step.run per external API call across the 3 functions)
8. ✅ `grep -r "idempotencyKey\|idempotency:" lib/inngest/` returns at least 3 hits (one per function definition)
9. ✅ `package.json` has `dev:inngest` script; README has setup section pointing to `npx inngest-cli dev`
10. ✅ Frontend capture flow stepper updates from polling `/api/jobs/[id]` — observable in browser dev tools network tab as ~1.5s interval polls

---

## Failure Modes & Recovery

| Failure | Detection | Recovery |
|---------|-----------|----------|
| Inngest signing key not loaded | `app/api/inngest/route.ts` returns 401 | Check `.env.local` has `INNGEST_SIGNING_KEY` and `INNGEST_EVENT_KEY` |
| Job dispatched but never executes | Inngest dashboard shows 0 runs | `inngest-cli dev` not running OR `app/api/inngest/route.ts` not registered with all functions |
| Step.run not idempotent (double-billing AI) | Test mocks Anthropic, asserts `mockAnthropic.create` called exactly once on retry | Wrap external call in `step.run()` — Inngest auto-checkpoints |
| Frontend stuck on "Saving" forever | Browser network tab: polling getting `Running` status indefinitely | Job exceeded Inngest's max duration (default 30s/step, 5min total) — check function timeouts |
| WhatsApp ack >10s | Meta retries webhook; user sees duplicate replies | Move final reply to Inngest function; webhook handler dispatches and returns immediately |
| `usage_events` double-recorded on Inngest retry | DB has 2 rows for same job | Wrap `recordUsage()` in `step.run()` AND ensure `idempotency_key` UNIQUE constraint exists on `usage_events.idempotency_key` (verify in Plan 02 prereq) |
