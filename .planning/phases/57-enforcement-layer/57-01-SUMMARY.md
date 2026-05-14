---
phase: 57-enforcement-layer
plan: "01"
subsystem: monetization
tags: [quota, enforcement, generate-estimate, analyze-photos, 402]
note: executed-in-worktree
dependency_graph:
  requires: [56-01]
  provides: [quota-enforcement-web-routes]
  affects: [app/api/generate-estimate/route.ts, app/api/analyze-photos/route.ts]
key_files:
  modified:
    - app/api/generate-estimate/route.ts
    - app/api/analyze-photos/route.ts
metrics:
  duration_minutes: 8
  tasks_completed: 3
  tasks_total: 3
  files_modified: 2
  completed_date: "2026-05-14"
---

# Phase 57 Plan 01: Enforcement Layer — Web Routes Summary

**One-liner:** `checkQuota` before AI call + `recordUsage` after success in `generate-estimate` and `analyze-photos` routes; HTTP 402 on limit.

## What Was Built

### `app/api/generate-estimate/route.ts`
- `checkQuota(supabase, companyId, 'estimate')` before Claude call — returns 402 if denied
- `requestId = crypto.randomUUID()` at handler top — passed as idempotency key to `recordUsage` after success
- `recordUsage` only called in success path — no charge for failed AI calls

### `app/api/analyze-photos/route.ts`
- Same pattern with `photo_batch` quota type

## Decisions

- Authenticated supabase client (not service role) for checkQuota/recordUsage in web routes — companyId scoping via RLS is sufficient
- requestId generated at handler top via crypto.randomUUID() — available only in success path, never in catch block
- HTTP 402 for quota-exceeded (not 403) per REQUIREMENTS.md

## Self-Check: PASSED

- Executed via git worktree — artifacts merged to main
