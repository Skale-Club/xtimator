---
phase: 1000
plan: 05
subsystem: xphere-crm-sync
tags: [inngest, integration, crm, backfill, observability, admin]
requires:
  - "EVENT_XPHERE_SYNC + inngest client (lib/inngest/events.ts, lib/inngest/client.ts) — Plan 03"
  - "companies.xphere_synced_at / xphere_sync_error columns — Plan 01"
  - "requireAdmin() (lib/auth/admin-context.ts)"
  - "category.showXphereConfig render block (app/admin/integrations/integration-category-content.tsx) — Plan 02"
provides:
  - "POST /api/admin/xphere-backfill — admin-only batched backfill enqueue"
  - "chunkEventBatches(companyIds, size) — pure, unit-tested chunker"
  - "XphereStatus observability panel (app/admin/integrations/xphere-status.tsx)"
affects: []
tech-stack:
  added: []
  patterns:
    - "Admin API route guard: try { await requireAdmin() } catch { return 401 } + export const dynamic = 'force-dynamic'"
    - "Head-count queries (count:'exact', head:true) to count without loading rows"
    - "Note-less 'company.updated' backfill event so re-runs never spam the Xphere timeline"
key-files:
  created:
    - "app/api/admin/xphere-backfill/route.ts"
    - "app/admin/integrations/xphere-status.tsx"
    - "tests/unit/xphere-backfill.test.ts"
  modified:
    - "app/admin/integrations/integration-category-content.tsx"
decisions:
  - "Backfill uses 'company.updated' (note-less in mapping.ts) so repeated runs add no timeline noise; idempotent via Xphere upsert-by-external_id"
  - "No new log table — companies.xphere_synced_at / xphere_sync_error + Inngest run history are the source of truth (CONTEXT deferred decision)"
  - "chunkEventBatches exported from the route as a pure helper so the chunking is unit-tested without HTTP"
metrics:
  tasks: 2
  files_created: 3
  files_modified: 1
  duration_minutes: 6
  completed: 2026-06-21
---

# Phase 1000 Plan 05: Backfill + Observability Summary

Closes the loop: a re-runnable admin backfill that enqueues a sync for every existing company (which predate the lifecycle hooks), plus a glanceable admin panel surfacing sync counts and recent errors straight from the `companies` sync-state columns.

## What Shipped

### Task 1 — Admin batched backfill route (TDD)
- `tests/unit/xphere-backfill.test.ts` written first — 4 vitest cases (chunk shape, event name/`data.event`, empty input, total-count invariant).
- `app/api/admin/xphere-backfill/route.ts`: `export const dynamic = 'force-dynamic'`; `POST` guards with `try { await requireAdmin() } catch { 401 }`, selects all `companies.id`, and `await inngest.send(chunk)` per 100-company chunk. Returns `{ enqueued, chunks }`.
- `chunkEventBatches(companyIds, size)` — pure exported helper mapping ids → note-less `company.updated` `xphere/sync.requested` events in chunks. Idempotent (Xphere upsert-by-external_id).
- Commit: `9264621`

### Task 2 — `XphereStatus` observability panel
- `app/admin/integrations/xphere-status.tsx`: async server component. Two head-count queries (synced count = `xphere_synced_at NOT NULL`, error count = `xphere_sync_error NOT NULL`) + one list query (last 20 errored companies). Renders "Synced: N · Errors: M", the errored list (name + truncated error) or "All companies synced", and the backfill instruction. No API key/token printed.
- `app/admin/integrations/integration-category-content.tsx`: renders `<XphereStatus />` under the existing `category.showXphereConfig` block, beside `<XphereConfigForm />`.
- Commit: `636c355`

## Verification

- `npx vitest run tests/unit/xphere-backfill.test.ts` → 4/4 pass; combined xphere suite (backfill + mapping + client) → 19/19.
- `npx eslint` on all 4 files → clean.
- `npx tsc --noEmit`: zero errors in any file changed by this plan (the ~10 pre-existing Langfuse/test-fixture errors in deferred-items.md are untouched — re-confirmed none reference the new files).

## Deviations from Plan

None — implemented as specified.

## Deferred Issues

The pre-existing repo-wide `tsc` errors (Phase 97 Langfuse migration + a few test fixtures) remain out of scope (see `deferred-items.md`). The plan's "tsc clean" criterion is met for all files this plan touched.

## Self-Check: PASSED

- Files `app/api/admin/xphere-backfill/route.ts`, `app/admin/integrations/xphere-status.tsx`, `tests/unit/xphere-backfill.test.ts` all FOUND.
- Commits `9264621`, `636c355` both FOUND.
