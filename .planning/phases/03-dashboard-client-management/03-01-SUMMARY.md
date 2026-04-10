---
phase: 03-dashboard-client-management
plan: 01
subsystem: app-shell, data-layer
tags: [layout, navigation, queries, schemas, actions, components]
dependency_graph:
  requires: [01-foundation-auth, 02-company-onboarding]
  provides: [app-shell-layout, nav-components, dashboard-queries, client-queries, client-schema, client-actions, project-actions, status-badge, empty-state]
  affects: [03-02-PLAN, 03-03-PLAN]
tech_stack:
  added: ["@testing-library/react", "@testing-library/jest-dom"]
  patterns: [route-group-layout, getClaims-auth-pattern, supabase-query-functions, zod-optional-empty-string]
key_files:
  created:
    - components/app-shell/nav-items.ts
    - components/app-shell/sidebar.tsx
    - components/app-shell/bottom-nav.tsx
    - components/app-shell/topbar.tsx
    - components/app-shell/mobile-header.tsx
    - app/(app)/layout.tsx
    - app/(app)/dashboard/loading.tsx
    - app/(app)/clients/loading.tsx
    - components/dashboard/status-badge.tsx
    - components/dashboard/empty-state.tsx
    - lib/queries/dashboard.ts
    - lib/queries/clients.ts
    - lib/schemas/client.ts
    - lib/actions/client.ts
    - lib/actions/project.ts
    - tests/unit/queries/dashboard.test.ts
    - tests/unit/queries/clients.test.ts
    - tests/unit/schemas/client.test.ts
    - tests/unit/components/status-badge.test.tsx
  modified:
    - package.json
    - package-lock.json
  deleted:
    - app/dashboard/page.tsx
decisions:
  - "NAV_ITEMS typed as NavItem[] (not as const satisfies) to allow uniform property access across union members"
  - "getAuthContext() helper extracted in client.ts and project.ts to DRY the getClaims + company fetch pattern"
  - "getClients uses single projects query + JS counting for project_count (avoids N+1 queries)"
  - "signOut in topbar reuses existing server action from lib/actions/auth.ts"
metrics:
  duration: 6min
  completed: "2026-04-10T12:19:39Z"
  tasks_completed: 3
  tasks_total: 3
  tests_passed: 20
  tests_total: 20
  files_created: 19
  files_deleted: 1
---

# Phase 03 Plan 01: App Shell, Shared Components & Data Layer Summary

App shell layout with sidebar/topbar/bottom-nav, skeleton loaders, status badge, empty state, dashboard+client queries, client schema, and CRUD server actions for clients and projects.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Nav config, shell components | 92a9eaf | nav-items.ts, sidebar.tsx, bottom-nav.tsx, topbar.tsx, mobile-header.tsx |
| 2 | App shell layout, skeleton loaders, status badge, empty state | fc197d3 | (app)/layout.tsx, loading.tsx x2, status-badge.tsx, empty-state.tsx |
| 3 | Data layer (queries, schemas, server actions, tests) | e22bfd3 | dashboard.ts, clients.ts, client.ts schema+actions, project.ts |

## Verification Results

- TypeScript compiles with no new errors (pre-existing e2e/env test errors only)
- 20/20 unit tests passing (5 StatusBadge, 4 dashboard queries, 5 client queries, 6 client schema)
- Route group (app) structure in place with app/(app)/layout.tsx
- Old app/dashboard/page.tsx deleted
- All exported functions/types importable from their paths

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Installed @testing-library/react**
- **Found during:** Task 2
- **Issue:** @testing-library/react not installed, component tests could not run
- **Fix:** `npm install -D @testing-library/react @testing-library/jest-dom`
- **Files modified:** package.json, package-lock.json
- **Commit:** fc197d3

**2. [Rule 1 - Bug] NAV_ITEMS typed as NavItem[] instead of as const satisfies**
- **Found during:** Task 1
- **Issue:** `as const satisfies` created narrow union types where `primary` property access failed on items without it
- **Fix:** Changed to `NavItem[]` typing for uniform property access
- **Files modified:** components/app-shell/nav-items.ts
- **Commit:** 92a9eaf

## Decisions Made

1. NAV_ITEMS uses `NavItem[]` typing (not `as const satisfies`) for uniform property access across the union
2. `getAuthContext()` helper function extracted in client and project actions to DRY the getClaims + company fetch pattern
3. `getClients` uses a single projects query + JS counting to compute `project_count` (avoids N+1 per client)
4. Topbar sign-out reuses existing `signOut` server action from `lib/actions/auth.ts`

## Known Stubs

None - all components and functions are fully implemented with real Supabase query patterns.

## Self-Check: PASSED

- All 19 created files exist on disk
- All 3 task commits verified (92a9eaf, fc197d3, e22bfd3)
- Old app/dashboard/page.tsx confirmed deleted
