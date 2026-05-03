---
phase: 15-owner-admin-panel
plan: "02"
subsystem: admin-panel
tags: [admin, dashboard, stats, nav, lucide]
dependency_graph:
  requires: [15-01]
  provides: [admin-dashboard, admin-stats-query, extended-admin-nav]
  affects: [app/admin/page.tsx, lib/queries/admin-stats.ts, components/admin/admin-nav.tsx]
tech_stack:
  added: []
  patterns:
    - Promise.all for parallel Supabase count queries
    - RPC call for platform-level user count (bypasses RLS)
    - Exact-match vs prefix-match active state for nested nav
key_files:
  created:
    - lib/queries/admin-stats.ts
  modified:
    - app/admin/page.tsx
    - components/admin/admin-nav.tsx
    - tests/unit/admin-dashboard.test.ts
decisions:
  - getPlatformStats uses Promise.all with 3 concurrent queries for minimal latency
  - get_platform_user_count RPC used because users span all companies (service-role bypass)
  - /admin Dashboard item uses exact pathname === '/admin' match; all others use startsWith
metrics:
  duration: 11min
  completed: "2026-05-03"
  tasks: 2
  files_modified: 4
---

# Phase 15 Plan 02: Admin Dashboard Stats Cards + Extended Nav Summary

**One-liner:** Real admin dashboard with 3 Supabase-backed stat cards (companies, users, estimates-30d) and 7-item nav with exact-match active state fix.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | Create lib/queries/admin-stats.ts (TDD) | 015c2cc | lib/queries/admin-stats.ts, tests/unit/admin-dashboard.test.ts |
| 2 | Replace admin/page.tsx + extend admin nav | 4f2e922 | app/admin/page.tsx, components/admin/admin-nav.tsx |

## What Was Built

### lib/queries/admin-stats.ts
Server-only module exporting `PlatformStats` type and `getPlatformStats()`. Uses `Promise.all` with three concurrent Supabase calls:
- `companies` table count with `count: 'exact', head: true`
- `estimates` table count filtered by `gte('created_at', thirtyDaysAgo())`
- `get_platform_user_count` RPC for platform-wide user count

All results fall back to `0` on null or error responses.

### app/admin/page.tsx
Replaced the previous `redirect('/admin/integrations')` stub with a real async server component. Calls `requireAdmin()` for auth guard, then `getPlatformStats()` for data. Renders 3 stat cards in a responsive 1-col/3-col grid with `Building2`, `Users`, and `FileText` Lucide icons.

### components/admin/admin-nav.tsx
Extended from 3 to 7 nav items: Dashboard, SEO, Landing Page, Blog, Branding, Integrations, Admins. Added `LayoutDashboard`, `Globe`, `Layout`, `FileText` imports from lucide-react. Fixed active-state logic to use exact match (`pathname === '/admin'`) for the Dashboard item and prefix match for all others.

## Tests

4 tests in `tests/unit/admin-dashboard.test.ts` (all passing):
- Returns `totalCompanies` count from companies table
- Returns `totalUsers` from `get_platform_user_count` RPC
- Returns `estimatesLast30d` count within 30 days
- Returns zeros on DB errors (graceful degradation)

Full suite: 286/286 passing, 50 test files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript cast too narrow in test file**
- **Found during:** Task 1 verification (tsc check)
- **Issue:** `spy as ReturnType<typeof createServiceClient>` raised TS2352 — ChainSpy doesn't overlap with SupabaseClient
- **Fix:** Changed to `spy as unknown as ReturnType<typeof createServiceClient>` double-cast pattern
- **Files modified:** tests/unit/admin-dashboard.test.ts
- **Commit:** 4f2e922

## Known Stubs

None — all stat cards are wired to real DB queries via `getPlatformStats()`.

## Self-Check: PASSED

- lib/queries/admin-stats.ts: FOUND
- app/admin/page.tsx: FOUND (contains getPlatformStats)
- components/admin/admin-nav.tsx: FOUND (7 nav items, LayoutDashboard import, exact-match fix)
- Commit 015c2cc: FOUND
- Commit 4f2e922: FOUND
