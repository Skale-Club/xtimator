---
phase: 92
plan: 01
subsystem: observability
tags: [pipeline-events, instrumentation, service-role, best-effort]
requires:
  - "92-00: pipeline_events table (remote migration + generated types)"
provides:
  - "recordPipelineEvent(): best-effort service-role event writer"
  - "PipelineEventInput type + PipelineStep/PipelineStatus/PipelineInputType unions"
  - "computeRetryCount: count-query based retry_count (D-09)"
affects:
  - "Wave 2 instrumentation sites (3 routes + 3 Inngest functions) call this helper"
tech-stack:
  added: []
  patterns:
    - "Best-effort void-able observability write (mirrors existing void notify(...))"
    - "Service-role-only insert via requireServiceClient() (RLS bypass)"
key-files:
  created: []
  modified:
    - "lib/observability/pipeline-events.ts"
decisions:
  - "retry_count counts prior attempt_id+step+status rows; accepted TOCTOU race (diagnostic hint, not billing key) per D-09"
  - "started status short-circuits to retry_count=0 (no count query)"
metrics:
  duration: "~3m"
  completed: "2026-05-30"
  tasks: 1
  files: 1
---

# Phase 92 Plan 01: recordPipelineEvent Best-Effort Helper Summary

Replaced the Wave-0 throwing stub in `lib/observability/pipeline-events.ts` with the real best-effort `recordPipelineEvent(input)`: it maps the camelCase `PipelineEventInput` to the snake_case D-02 row, computes `retry_count` via a count query over prior `attempt_id + step + status` rows, and inserts into `pipeline_events` through `requireServiceClient()` — all wrapped in a single try/catch that swallows any failure (`console.warn`, never throws, never rejects the caller) per D-06.

## What Shipped

- **`recordPipelineEvent(ev: PipelineEventInput): Promise<void>`** — entire body in try/catch; null-coalesces every optional field to `null` before insert; on error logs `[recordPipelineEvent] swallowed write failure:` and returns.
- **`computeRetryCount(svc, ev)`** — `started` → 0; otherwise `select('id', { count: 'exact', head: true }).eq(attempt_id).eq(step).eq(status)` and returns `count ?? 0`.
- **Exports:** `recordPipelineEvent`, `PipelineEventInput`, `PipelineStep`, `PipelineStatus`, `PipelineInputType` (types were already the locked Wave-0 contract; left intact).

## Verification

- `npx vitest run tests/unit/observability/record-pipeline-event.test.ts` — GREEN (3/3): insert-shape, best-effort swallow (resolves + console.warn), retry_count=2 increment.
- `npx tsc --noEmit` — clean (exit 0).
- Previously-green tests stay green: `pipeline-events-migration.test.ts` + `event04-regression.test.ts` (combined run: 12/12 passed).
- Wave 2-3 tests correctly remain RED: `instrumentation-presence.test.ts`, `input-type-threading.test.ts` (10 failing, untouched).

## Commits

- `54a6fa1` feat(92-01): implement best-effort recordPipelineEvent helper

## Deviations from Plan

None - plan executed exactly as written. The Wave-0 type block already matched the locked contract, so only the function bodies were implemented.

## Self-Check: PASSED

- FOUND: lib/observability/pipeline-events.ts
- FOUND commit: 54a6fa1
