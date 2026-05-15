---
phase: 67-inngest-background-ai-jobs
plan: "02"
subsystem: inngest-workers
tags: [inngest, background-jobs, refactor, ai-routes, whatsapp]
dependency_graph:
  requires: [67-01]
  provides: [inngest-client, inngest-events, generateEstimateJob, transcribeAudioJob, analyzePhotosJob, whatsAppProcessJob, inngest-serve-handler]
  affects: [lib/inngest/, app/api/inngest/route.ts, package.json]
tech_stack:
  added: [inngest@4.4.0]
  patterns: [Inngest serve handler exporting GET/POST/PUT, step.run wrapping each external API call, idempotencyKey per function definition, recordUsage in final step.run only]
key_files:
  created:
    - lib/inngest/client.ts
    - lib/inngest/events.ts
    - lib/inngest/functions/index.ts
    - lib/inngest/functions/generate-estimate.ts
    - lib/inngest/functions/transcribe-audio.ts
    - lib/inngest/functions/analyze-photos.ts
    - lib/inngest/functions/whatsapp-process.ts
    - app/api/inngest/route.ts
  modified:
    - package.json
    - .env.local.example
decisions:
  - "Inngest 4.4.0 — single app/api/inngest/route.ts exports GET/POST/PUT from serve({ client, functions })"
  - "Each external API call (Anthropic, OpenAI Whisper, Vision, Supabase write) wrapped in step.run() — checkpointed; retries don't double-bill providers"
  - "recordUsage() lives in the FINAL step.run() block of each function — only fires on success, not on dispatch"
  - "idempotencyKey uses requestId from event payload (web) or wamid (WhatsApp) — natural dedup keys"
  - "Inngest functions consume getServerStorage() from Phase 66, never direct supabase.storage calls — clean abstraction respected"
  - "WhatsApp inbound flow: webhook handler dispatches whatsAppProcessJob and acks <10s; the function does Whisper/Vision + reply orchestration sequentially via step.run blocks"
metrics:
  duration_minutes: 48
  tasks_completed: 3
  tasks_total: 3
  files_created: 8
  files_modified: 2
  completed_date: "2026-05-15"
  tests_green: 17
---

# Phase 67 Plan 02: Inngest Workers — Client, Events, 4 Functions, Serve Handler

**One-liner:** Installed Inngest 4.4.0 + built the client singleton, events module, 4 worker functions (generateEstimate, transcribeAudio, analyzePhotos, whatsAppProcess), and the serve handler — turning Wave 0 RED tests GREEN.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install Inngest + client + events + dev script | 52b4d66 | lib/inngest/client.ts, lib/inngest/events.ts, package.json, .env.local.example |
| 2 | generateEstimateJob + transcribeAudioJob functions | cdcbedc | lib/inngest/functions/generate-estimate.ts, transcribe-audio.ts, index.ts |
| 3 | analyzePhotosJob + whatsAppProcessJob + serve handler | 724ef4d | lib/inngest/functions/analyze-photos.ts, whatsapp-process.ts, app/api/inngest/route.ts |

## Test Status

```
Test Files  8 passed (8)
Tests       17 passed (17)
Duration    7.69s
```

All Wave 0 RED stubs that this plan targets are now GREEN:
- inngest/client.test.ts ✓
- inngest/route.test.ts ✓ (serve handler exports GET/POST/PUT)
- inngest/generate-estimate-job.test.ts ✓ (step.run wrapping verified)
- inngest/transcribe-audio-job.test.ts ✓
- inngest/analyze-photos-job.test.ts ✓

Remaining Wave 0 RED tests for Plan 67-03 (route refactors) and 67-04 (WhatsApp dispatch) and 67-05 (frontend polling).

## Architecture Decisions

### Function structure (canonical pattern)
```typescript
inngest.createFunction(
  { id: 'generate-estimate', idempotency: 'event.data.requestId' },
  { event: 'estimate/requested' },
  async ({ event, step }) => {
    const transcript = await step.run('fetch-recording', async () => { ... })
    const estimate = await step.run('call-claude', async () => { ... })
    await step.run('persist-estimate', async () => { ... })
    await step.run('record-usage', async () => recordUsage(...))  // FINAL step
    return { estimateId: estimate.id }
  }
)
```

### Idempotency strategy (two-layer)
1. **Event-level `id`** on `inngest.send({ id: requestId, ... })` — Inngest dedups events with same ID within 24h
2. **Function-level `idempotency: 'event.data.requestId'`** CEL expression — Inngest skips duplicate function runs even across event ID misses

### Storage integration
All worker functions use `getServerStorage()` from `lib/storage/index.ts` (Phase 66 abstraction). Zero direct `supabase.storage.from(...)` calls — preserves the migration discipline.

### WhatsApp single-function pattern (per RESEARCH.md decision)
Instead of `step.waitForEvent` orchestration, `whatsAppProcessJob` collapses the entire `processInboundMessages` body into N+2 sequential `step.run` blocks (one per inbound message + generate-estimate dispatch + confirm reply). Webhook handler stays simple: parse + dispatch + 200.

## Self-Check: PASSED

- `lib/inngest/client.ts` — EXISTS, exports `inngest` configured client
- `lib/inngest/events.ts` — EXISTS, defines event payload types
- `lib/inngest/functions/index.ts` — EXISTS, re-exports all 4 functions
- `lib/inngest/functions/generate-estimate.ts` — EXISTS, wraps Phase 41 service in step.run blocks
- `lib/inngest/functions/transcribe-audio.ts` — EXISTS, Whisper call in step.run
- `lib/inngest/functions/analyze-photos.ts` — EXISTS, Vision call in step.run
- `lib/inngest/functions/whatsapp-process.ts` — EXISTS, full WhatsApp flow in sequential steps
- `app/api/inngest/route.ts` — EXISTS, exports `serve({ client, functions })` GET/POST/PUT
- `package.json` — `inngest@4.4.0` dep + `dev:inngest` script
- `.env.local.example` — documents `INNGEST_EVENT_KEY` + `INNGEST_SIGNING_KEY` placeholders
- `npx vitest run tests/unit/inngest` — 17/17 GREEN
- No real signing keys committed (gitleaks PASS)

## Ready for Plan 67-03

Plan 03 will refactor the 3 AI routes (`/api/generate-estimate`, `/api/transcribe`, `/api/analyze-photos`) to dispatch to Inngest via `inngest.send()` and add the `/api/jobs/[id]` polling proxy.

## Note: SUMMARY recovered post-timeout

Plan 02 executor agent timed out after 48 minutes (68 tool uses) AFTER all 3 commits and all functional code shipped. SUMMARY.md was reconstructed by the orchestrator from the commit log + filesystem inspection + test run output. All work is verified present and GREEN; no functional rework needed.
