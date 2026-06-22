---
phase: 1000
plan: 03
subsystem: xphere-crm-sync
tags: [inngest, integration, crm, network-client, queue]
requires:
  - "buildSyncPayload (lib/integrations/xphere/mapping.ts) — Plan 01"
  - "XphereSyncPayload / XphereSyncResponse / XphereSyncEvent (lib/integrations/xphere/types.ts) — Plan 01"
  - "getXphereConfig() (lib/platform-config.ts) — Plan 02"
  - "companies.xphere_* columns migration (supabase/migrations/20260620000002_companies_xphere_sync.sql) — Plan 01"
provides:
  - "syncCompany(payload) per-request POST client (lib/integrations/xphere/client.ts)"
  - "EVENT_XPHERE_SYNC + XphereSyncRequestedPayload (lib/inngest/events.ts)"
  - "xphereSyncJob Inngest function (lib/inngest/functions/xphere-sync.ts), registered in serve()"
affects:
  - "Plan 04 (lifecycle hooks) — only needs inngest.send({ name: EVENT_XPHERE_SYNC, data })"
  - "Plan 05 (backfill) — enqueues the same event per company"
tech-stack:
  added: []
  patterns:
    - "Per-request client init via getXphereConfig() (mirrors getStripeClient) — never read creds at module load"
    - "3-step Inngest job (load / sync / persist) so a DB write error never re-POSTs"
    - "onFailure persists terminal error on retry exhaustion (mirrors transcribeAudioJob)"
    - "Manual database.types.ts column extension (Phase 24/38 precedent) — Docker-less Windows can't regen types"
key-files:
  created:
    - "lib/integrations/xphere/client.ts"
    - "lib/inngest/functions/xphere-sync.ts"
    - "tests/unit/xphere-client.test.ts"
  modified:
    - "lib/inngest/events.ts"
    - "lib/inngest/functions/index.ts"
    - "app/api/inngest/route.ts"
    - "types/database.types.ts"
decisions:
  - "syncCompany throws on non-2xx (message includes status) and on network error so Inngest retries; returns null no-op when unconfigured"
  - "xphereSyncJob retries:3 — idempotency is free via Xphere upsert-by-external_id (no Inngest idempotency key needed; backfill re-runs are safe)"
  - "Job casts the loaded company row (tier: string) through unknown to XphereCompanyInput (tier: XphereTier) — the pure mapper owns tier→stage validation"
  - "Extended companies Row/Insert/Update in types/database.types.ts with the 5 xphere_* columns (migration landed Plan 01, types never regenerated)"
metrics:
  tasks: 2
  files_created: 3
  files_modified: 4
  duration_minutes: 5
  completed: 2026-06-21
---

# Phase 1000 Plan 03: Xphere Network + Queue Layer Summary

Per-request Xphere HTTP client (`syncCompany`) wrapping the fixed `POST /api/xtimator/webhook` Bearer contract, plus the `xphere/sync.requested` Inngest event and the thin `xphereSyncJob` (load company → buildSyncPayload → syncCompany → persist IDs), registered in the serve handler — the durable, non-blocking core every later lifecycle hook and the backfill will drive with a single `inngest.send`.

## What Shipped

### Task 1 — Xphere HTTP client `syncCompany()` (TDD)
- `lib/integrations/xphere/client.ts` (`import 'server-only'`): reads creds inside the call via `getXphereConfig()` (mirrors `getStripeClient`), POSTs `JSON.stringify(payload)` to `${baseUrl}/api/xtimator/webhook` with `Authorization: Bearer <apiKey>` + `Content-Type: application/json`.
- Returns `null` (no fetch) when unconfigured; throws on non-2xx with the status in the message (and on network rejection) so Inngest retries. The apiKey value is never logged.
- `tests/unit/xphere-client.test.ts` — 4 vitest cases (unconfigured, success, non-2xx, network error). RED (module missing) → GREEN (4/4 pass). No refactor needed.
- Commit: `f9ac4de`

### Task 2 — `xphere/sync.requested` event + `xphereSyncJob` + registration
- `lib/inngest/events.ts`: `EVENT_XPHERE_SYNC = 'xphere/sync.requested'` + `XphereSyncRequestedPayload { companyId, event, occurredAt? }`.
- `lib/inngest/functions/xphere-sync.ts`: `xphereSyncJob` (`retries: 3`) with 3 `step.run` checkpoints — `load-company` (fresh service-role select of the 12 mapper columns), `sync-company` (build payload, override `occurred_at` if `occurredAt` provided, POST), `persist-result` (on a real result, write `xphere_account_id/contact_id/opportunity_id + xphere_synced_at` and clear `xphere_sync_error`; `null` result short-circuits with no writes). `onFailure` persists `xphere_sync_error` (sliced to 500 chars) on retry exhaustion.
- Registered in `lib/inngest/functions/index.ts` (barrel) and `app/api/inngest/route.ts` (serve `functions: [...]`).
- Commit: `56b0068`

## Verification

- `npx vitest run tests/unit/xphere-client.test.ts` → 4/4 pass; combined with `xphere-mapping.test.ts` → 15/15.
- Grep gates: `xphere/sync.requested` in events.ts; `xphereSyncJob` in barrel + serve handler; `buildSyncPayload` + `syncCompany` in the job. All pass.
- `npx tsc --noEmit`: zero errors in any file changed by this plan (verified by filtering, and by stashing all changes to confirm the 10 remaining errors are identical on the base commit). See Deviations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended `companies` types with the 5 `xphere_*` columns**
- **Found during:** Task 2 (`.update({ xphere_account_id, ... })` would not compile).
- **Issue:** Plan 01 added the columns via `supabase/migrations/20260620000002_companies_xphere_sync.sql`, but `types/database.types.ts` was never regenerated, so the columns were absent from the `companies` Row/Insert/Update types.
- **Fix:** Manually added `xphere_account_id / xphere_contact_id / xphere_opportunity_id / xphere_sync_error / xphere_synced_at` (`string | null`, all optional in Insert/Update) to all three blocks — the established Docker-less Windows pattern (Phase 24 / Phase 38).
- **Files modified:** `types/database.types.ts`
- **Commit:** `56b0068`

## Deferred Issues

10 pre-existing `tsc --noEmit` errors (Phase 97 Langfuse v3 migration leftovers + a few test fixtures) are present on the base commit and untouched by this plan. Re-confirmed via `git stash` that the same errors persist without any 1000-03 change. Logged in `.planning/phases/1000-xphere-crm-sync/deferred-items.md`. Not in scope for 1000-03.

## Notes for Plan 04 / 05

- Drive a sync from anywhere with `inngest.send({ name: EVENT_XPHERE_SYNC, data: { companyId, event } })` — fire-and-forget (`.catch`), user flows never await Xphere.
- Pass `occurredAt` (ISO8601) when the originating event time matters for Xphere last-write-wins ordering; otherwise the mapper stamps "now".
- Idempotency is free (Xphere upsert-by-external_id), so backfill (Plan 05) can re-enqueue freely.

## Self-Check: PASSED

- Files: `lib/integrations/xphere/client.ts`, `tests/unit/xphere-client.test.ts`, `lib/inngest/functions/xphere-sync.ts` all FOUND.
- Commits: `f9ac4de`, `56b0068` both FOUND.
