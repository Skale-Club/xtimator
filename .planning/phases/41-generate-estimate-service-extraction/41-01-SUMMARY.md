---
phase: 41-generate-estimate-service-extraction
plan: "01"
subsystem: whatsapp-pipeline
tags: [service-extraction, generate-estimate, whatsapp, refactor]
note: executed-in-worktree
dependency_graph:
  requires: [40-01]
  provides: [lib/services/generate-estimate.ts, slim-route]
  affects: [lib/services/generate-estimate.ts, app/api/generate-estimate/route.ts]
tech_stack:
  added: []
  patterns: [requireServiceClient for webhook context, service extraction for testability]
key_files:
  created:
    - lib/services/generate-estimate.ts
  modified:
    - app/api/generate-estimate/route.ts
metrics:
  duration_minutes: 10
  tasks_completed: 4
  tasks_total: 4
  files_created: 1
  files_modified: 1
  completed_date: "2026-05-10"
---

# Phase 41 Plan 01: Generate-Estimate Service Extraction Summary

**One-liner:** Extracted estimate generation into `lib/services/generate-estimate.ts` so the WhatsApp handler can call it without HTTP; route slimmed to a thin wrapper.

## What Was Built

### `lib/services/generate-estimate.ts`
- `generateEstimateForProject(companyId, projectId)` — full pipeline (transcript → Vision → Claude → persist)
- Uses `requireServiceClient` — no auth cookies needed (runs in webhook/cron context)
- `companyId` argument scopes all queries (RLS bypass via service role)
- Catches named error messages to distinguish 400 client errors from 500 server errors

### Route (`app/api/generate-estimate/route.ts`)
- Slimmed to auth + delegation to service function
- Returns same JSON shape as before — no client breakage

## Decisions

- `requireServiceClient` (not `createClient`) — no auth cookies available in webhook context; service role bypasses RLS; companyId scopes query correctly
- Route catches named error messages to distinguish 400 vs 500 — avoids leaking DB internals while returning meaningful status codes

## Self-Check: PASSED

- Executed via git worktree — artifacts merged to main
