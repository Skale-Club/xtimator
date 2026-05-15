---
phase: 67-inngest-background-ai-jobs
plan: "03"
subsystem: inngest-dispatch-routes
tags: [inngest, ai-routes, dispatch, jobs-proxy, async, refactor]
dependency_graph:
  requires: [67-01, 67-02]
  provides:
    - dispatch-generate-estimate
    - dispatch-analyze-photos
    - dispatch-transcribe
    - jobs-status-proxy
  affects:
    - app/api/generate-estimate/route.ts
    - app/api/analyze-photos/route.ts
    - app/api/transcribe/route.ts
    - app/api/jobs/[jobId]/route.ts
    - lib/actions/recording.ts
    - components/capture/capture-recorder.tsx
tech_stack:
  added: []
  patterns:
    - "Routes are dispatchers — pre-flight (auth + rate-limit + quota) stays synchronous, AI work moves to Inngest"
    - "Event id naming: estimate-{projectId}-{requestId}, photos-{projectId}-{requestId}, transcribe-{recordingId}"
    - "Server-side proxy pattern for INNGEST_SIGNING_KEY — browser never sees secrets"
    - "Empty data[] from Inngest run API → Running status (event accepted, function not yet started)"
key_files:
  created:
    - app/api/transcribe/route.ts
    - app/api/jobs/[jobId]/route.ts
    - tests/unit/api/transcribe-dispatch.test.ts (replaced Wave 0 stub)
    - tests/unit/api/jobs-status.test.ts (replaced Wave 0 stub)
  modified:
    - app/api/generate-estimate/route.ts
    - app/api/analyze-photos/route.ts
    - lib/actions/recording.ts
    - components/capture/capture-recorder.tsx
    - tests/unit/api/generate-estimate-dispatch.test.ts (replaced Wave 0 stub)
    - tests/unit/api/analyze-photos-dispatch.test.ts (replaced Wave 0 stub)
    - tests/unit/api/generate-estimate-quota.test.ts (contract updated for dispatcher)
    - tests/unit/api/analyze-photos-quota.test.ts (contract updated for dispatcher)
    - tests/unit/api/generate-estimate-name-patch.test.ts (contract updated for dispatcher)
decisions:
  - "Routes are pure dispatchers; recordUsage was REMOVED from /api/generate-estimate and /api/analyze-photos (it now lives inside the Inngest worker's final step.run('record-usage', ...) — see Plan 02)"
  - "transcribeRecording server action kept as a thin Inngest dispatch wrapper for backwards compat with two existing component callers; return shape changed from { data: { transcript } } to { data: { jobId } }"
  - "capture-recorder.tsx received a minimal type-safe shim (jobId|transcript union) with TODO(67-05) for polling rewire — keeps tsc clean without functional rework"
  - "/api/jobs/[jobId] uses cache: 'no-store' because run status changes constantly; server-side Bearer auth so browser never sees INNGEST_SIGNING_KEY"
  - "Empty Inngest data[] mapped to { status: 'Running', output: null } — event accepted but function run hasn't started yet"
  - "Per-job ownership check on /api/jobs/[jobId] deferred to follow-up (matches RESEARCH.md Architecture Pattern 4 MVP callout)"
metrics:
  duration_minutes: 8
  tasks_completed: 3
  tasks_total: 3
  files_created: 4
  files_modified: 9
  completed_date: "2026-05-15"
  tests_green: 36
---

# Phase 67 Plan 03: AI Routes Refactor + Jobs Status Proxy

**One-liner:** Refactored 3 AI routes (`/api/generate-estimate`, NEW `/api/transcribe`, `/api/analyze-photos`) into pure Inngest dispatchers returning `{ jobId }` in <1s, and added the `/api/jobs/[jobId]` status proxy with server-side Bearer auth — turning Wave 0 RED tests GREEN.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Refactor /api/generate-estimate + /api/analyze-photos to dispatch via Inngest | 5a9049e | app/api/generate-estimate/route.ts, app/api/analyze-photos/route.ts, 5 test files (quota + dispatch + name-patch contracts updated) |
| 2 | NEW /api/transcribe dispatch route + transcribeRecording action refactor | 473c917 | app/api/transcribe/route.ts (new), lib/actions/recording.ts, tests/unit/api/transcribe-dispatch.test.ts, components/capture/capture-recorder.tsx (shim) |
| 3 | NEW /api/jobs/[jobId] status proxy route | ff4baee | app/api/jobs/[jobId]/route.ts (new), tests/unit/api/jobs-status.test.ts |

## Test Status

```
Test Files  7 passed (7)
Tests       36 passed (36)
```

All Wave 0 RED stubs that this plan targets are now GREEN:
- generate-estimate-dispatch.test.ts (6 tests)
- analyze-photos-dispatch.test.ts (6 tests)
- transcribe-dispatch.test.ts (7 tests)
- jobs-status.test.ts (7 tests)

Pre-existing Phase 57 quota tests updated to reflect the dispatcher contract:
- generate-estimate-quota.test.ts (3 tests — recordUsage assertion moved to inngest/generate-estimate-job.test.ts)
- analyze-photos-quota.test.ts (3 tests — same)
- generate-estimate-name-patch.test.ts (4 tests — 200/estimateId became 202/jobId)

TypeScript clean: `npx tsc --noEmit` exits 0.

## Architecture Decisions

### Dispatcher contract (canonical)

```typescript
// 1. Synchronous pre-flight (must complete in <1s)
const supabase = await createClient()
if (!claims) throw new XtimatorError('unauthorized', ...)
const { allowed } = await rateLimit(...)        // Redis, ~50ms
const { allowed } = await checkQuota(...)        // DB query, ~50ms

// 2. Dispatch (Inngest send is ~10-50ms)
const { ids } = await inngest.send({
  name: EVENT_*,
  id: '{kind}-{naturalUniqueId}',  // event-level idempotency
  data: payload,
})

// 3. Return 202 Accepted with jobId
return NextResponse.json({ jobId: ids[0] }, { status: 202 })
```

### Event id naming (idempotency keys)

| Route | Event ID Pattern | Natural Uniqueness |
|---|---|---|
| /api/generate-estimate | `estimate-{projectId}-{requestId}` | requestId is per-call UUID |
| /api/analyze-photos | `photos-{projectId}-{requestId}` | requestId is per-call UUID |
| /api/transcribe | `transcribe-{recordingId}` | recordingId is the row UUID — same recording never transcribed twice |

### recordUsage relocation

Was inline in `/api/generate-estimate` (`await recordUsage(supabase, companyId, 'estimate_generated', 1, requestId)`) and `/api/analyze-photos` (`await recordUsage(supabase, companyId, 'photo_analyzed', photos.length, requestId)`).

Now lives inside the FINAL `step.run('record-usage', ...)` block of each Inngest function. Benefits:
1. **Bills only on success** — pre-flight failures (quota, validation) never increment usage.
2. **Independently retriable** — DB write failure can retry without re-charging Anthropic/OpenAI.
3. **Idempotency at the DB layer** — `usage_events` partial UNIQUE index on `(company_id, idempotency_key)` makes double-recording impossible.

### Status proxy security

The browser never sees `INNGEST_SIGNING_KEY`. `/api/jobs/[jobId]` reads it from `process.env`, attaches as `Authorization: Bearer ${key}`, and proxies the response. `cache: 'no-store'` because status changes constantly. 503 returned if env var is missing — prevents silent token leak via misconfiguration.

### transcribeRecording shape change

Old: `Promise<{ data: { transcript: string } } | { error: string }>`
New: `Promise<{ data: { jobId: string } } | { error: string }>`

Existing callers:
- `components/capture/capture-recorder.tsx` line 247: TS-safe shim added with TODO(67-05) — Plan 67-05 will replace with polling hook against `GET /api/jobs/{jobId}`.
- `components/workspace/audio/audio-recorder.tsx` line 263: only reads `'error' in result` so compatible with new shape (but shows "transcribed successfully" toast prematurely — Plan 67-05 will fix).

## Verification Checks

```bash
# Routes contain inngest.send (one per route)
grep -E "inngest\.send" app/api/generate-estimate/route.ts \
  app/api/transcribe/route.ts \
  app/api/analyze-photos/route.ts
# → 3 hits

# Routes do NOT call inline AI providers
grep -E "generateEstimateForProject|Anthropic\(|api\.openai\.com/v1/audio/transcriptions" \
  app/api/generate-estimate/route.ts \
  app/api/analyze-photos/route.ts \
  app/api/transcribe/route.ts
# → 0 hits (matches only appear in doc comments)

# Routes do NOT call recordUsage inline
grep "recordUsage(" app/api/generate-estimate/route.ts app/api/analyze-photos/route.ts
# → 0 hits

# No real signing keys committed
grep -E "signkey-(prod|test)-" app/api/jobs/
# → 0 hits
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — blocking] Updated outdated Phase 57 quota tests**
- **Found during:** Task 1
- **Issue:** Pre-existing `generate-estimate-quota.test.ts`, `analyze-photos-quota.test.ts`, and `generate-estimate-name-patch.test.ts` asserted the OLD inline contract (200/estimateId result + `generateEstimateForProject` called + `recordUsage` called). With dispatcher refactor these assertions are false.
- **Fix:** Updated each test file to assert the dispatcher contract (202/jobId, no inline AI call, no inline recordUsage). The recordUsage behavior is fully covered by `tests/unit/inngest/generate-estimate-job.test.ts` from Plan 02.
- **Files modified:** tests/unit/api/generate-estimate-quota.test.ts, tests/unit/api/analyze-photos-quota.test.ts, tests/unit/api/generate-estimate-name-patch.test.ts
- **Commit:** 5a9049e

**2. [Rule 1 — bug] Fixed TypeScript error from test mock retryAfter: null**
- **Found during:** Task 1 verification
- **Issue:** RateLimit interface declares `retryAfter?: number` (undefined-only), but mocks used `retryAfter: null` — causing 5 TS errors.
- **Fix:** Removed `retryAfter: null` from all rate-limit mock defaults (undefined is the canonical "no retry" sentinel).
- **Files modified:** all 5 api test files in Task 1
- **Commit:** 5a9049e (folded in)

**3. [Rule 3 — blocking] Added type-safe shim to capture-recorder.tsx**
- **Found during:** Task 2
- **Issue:** `lib/actions/recording.ts:transcribeRecording` return shape changed from `{ data: { transcript } }` to `{ data: { jobId } }`. The existing `components/capture/capture-recorder.tsx` consumer accessed `.data.transcript` causing 2 TS errors.
- **Fix:** Added a union-typed read with `TODO(67-05)` marker pointing to the future polling rewire. Component compiles cleanly; functional rework deferred to Plan 67-05 as planned.
- **Files modified:** components/capture/capture-recorder.tsx
- **Commit:** 473c917

## Known Stubs

None — every dispatch route is real code wired end-to-end. The only deferred item is the consumer-side polling logic in `capture-recorder.tsx` (TODO(67-05) marker), which is explicitly scoped to Plan 67-05.

## Ready for Plan 67-04

Plan 04 will wire the WhatsApp webhook handler to dispatch `whatsAppProcessJob` via `inngest.send` (currently it runs the work inline) — same dispatcher pattern, same `id: 'whatsapp-{wamid}'` event-level idempotency.

## Self-Check: PASSED

- `app/api/generate-estimate/route.ts` — EXISTS, imports inngest + EVENT_ESTIMATE_GENERATE, no generateEstimateForProject/recordUsage imports, returns 202
- `app/api/analyze-photos/route.ts` — EXISTS, imports inngest + EVENT_ANALYZE_PHOTOS, no Anthropic/recordUsage imports, returns 202
- `app/api/transcribe/route.ts` — EXISTS (new), exports POST, dispatches EVENT_TRANSCRIBE_AUDIO with id `transcribe-{recordingId}`, validates ownership + storage_path
- `app/api/jobs/[jobId]/route.ts` — EXISTS (new), exports GET, reads INNGEST_SIGNING_KEY from env, proxies api.inngest.com with Bearer auth, cache: 'no-store'
- `lib/actions/recording.ts:transcribeRecording` — refactored to dispatch via Inngest, no fetch to api.openai.com
- `npx vitest run tests/unit/api` — 36/36 GREEN
- `npx tsc --noEmit` — clean (exit 0)
- Commits 5a9049e, 473c917, ff4baee all present in git log
- No real signing keys in code (gitleaks PASS on all 3 commits)
