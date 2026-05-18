---
phase: 72-admin-menu-performance
plan: "03"
subsystem: admin
tags: [performance, auth-api, n+1, query-optimization]
dependency_graph:
  requires: []
  provides: [PERF-ADMIN-04, PERF-ADMIN-05, PERF-ADMIN-06]
  affects: [lib/admin/integrations-providers.ts, app/admin/admins/page.tsx]
tech_stack:
  added: []
  patterns: [batch-getUserById, Promise.all-bounded]
key_files:
  created: []
  modified:
    - lib/admin/integrations-providers.ts
    - app/admin/admins/page.tsx
decisions:
  - "Batch getUserById by unique updated_by IDs (deduplicated via Set) before decrypt loop — typically 1-2 calls instead of N per integration row"
  - "getUserById per platform_admins row (O(n) where n<=5) preferred over listUsers(perPage:1000) — research confirmed table has only 1-5 rows; paginating 5 rows adds complexity with zero perf benefit"
metrics:
  duration: "~2 minutes"
  completed: "2026-05-17"
  tasks_completed: 2
  files_modified: 2
requirements:
  - PERF-ADMIN-04
  - PERF-ADMIN-05
  - PERF-ADMIN-06
---

# Phase 72 Plan 03: Admin Query De-N+1 Summary

**One-liner:** Eliminated N+1 getUserById in integrations-providers via unique-ID batching and replaced listUsers(1000) with bounded getUserById per admin row (1-5 calls).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fix loadCategoryInitials N+1 getUserById — batch by unique updated_by IDs | a74a955 | lib/admin/integrations-providers.ts |
| 2 | Replace listUsers(1000) with bounded getUserById per admin row | 3a8f489 | app/admin/admins/page.tsx |

## Changes Made

### Task 1: loadCategoryInitials N+1 fix (`lib/admin/integrations-providers.ts`)

**Before:** Inside `Promise.all(rows.map(...))`, each row called `svc.auth.admin.getUserById(r.updated_by)` — N calls for N integration rows, even when all rows share the same 1-2 admin accounts.

**After:**
1. Before the decrypt loop: collect unique `updated_by` IDs via `Set` deduplication
2. Run `Promise.all(updatedByIds.map(...getUserById))` — typically 1-2 calls total
3. Build `userEmailMap: Map<string, string>`
4. In the decrypt loop: replace API call with `userEmailMap.get(r.updated_by) ?? ''`

The function signature, return type, imports, and all other code remain unchanged.

### Task 2: listUsers(1000) replacement (`app/admin/admins/page.tsx`)

**Before:** `svc.auth.admin.listUsers({ perPage: 1000 })` fetched up to 1000 users, then built an `emailById` Map to look up 1-5 admin emails.

**After:** `Promise.all((rows ?? []).map(async (row) => { ... getUserById(row.user_id) ... }))` — concurrent lookup of exactly the admin rows that exist (typically 1-5). Removed `listUsers` call and `emailById` Map entirely.

## Verification

- `grep -n "userEmailMap" lib/admin/integrations-providers.ts` — 3 hits: declaration (line 138), set (line 142), get (line 161)
- `grep -n "getUserById" lib/admin/integrations-providers.ts` — hits only in `updatedByIds.map` batch section (line 141), NOT inside decrypt loop
- `grep -n "listUsers" app/admin/admins/page.tsx` — 0 hits (removed)
- `grep -n "getUserById" app/admin/admins/page.tsx` — 1 hit inside `Promise.all` (line 18)
- `npx tsc --noEmit` — exits 0

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `lib/admin/integrations-providers.ts` — modified and committed (a74a955)
- `app/admin/admins/page.tsx` — modified and committed (3a8f489)
- Both commits verified in git log
- TypeScript check passes
