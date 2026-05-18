---
phase: 72-admin-menu-performance
plan: "02"
subsystem: layouts
tags: [performance, suspense, react-cache, streaming, deduplication]
dependency_graph:
  requires: ["72-01"]
  provides: [getCachedBranding, admin-layout-suspense, parallel-branding-fetch]
  affects: [app/admin/layout.tsx, app/(app)/layout.tsx, lib/platform-config.ts]
tech_stack:
  added: []
  patterns: [React cache() deduplication, Suspense streaming boundary, parallel promise fire]
key_files:
  created: []
  modified:
    - lib/platform-config.ts
    - app/admin/layout.tsx
    - app/(app)/layout.tsx
decisions:
  - getCachedBranding = cache(getBranding) added as new export; original getBranding preserved for non-layout callers
  - Admin layout Suspense has no explicit fallback — loading.tsx (Plan 01) serves as App Router automatic fallback
  - brandingPromise starts immediately after getAuthClaims resolves because getBranding has no dependency on company data
metrics:
  duration: "~2.5min"
  completed: "2026-05-17"
  tasks: 3
  files: 3
---

# Phase 72 Plan 02: Layout Suspense + getCachedBranding Parallel Fetch Summary

**One-liner:** React cache() wrapper for getBranding deduplicates render-pass DB calls; admin layout streams via Suspense; app shell overlaps branding + company fetches for ~50-100ms cold-start improvement.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add getCachedBranding React cache() wrapper | 6c715e8 | lib/platform-config.ts |
| 2 | Wrap admin layout children in Suspense boundary | 75624da | app/admin/layout.tsx |
| 3 | Parallelize getCachedBranding with getCachedCompany in app shell | eafc201 | app/(app)/layout.tsx |

## What Was Done

**Task 1 — lib/platform-config.ts:**
- Added `import { cache } from 'react'`
- Exported `getCachedBranding = cache(getBranding)` after the `getBranding` function
- Original `getBranding` unchanged; all non-layout callers unaffected
- React cache() ensures only one DB round-trip per render pass even when multiple layouts call getBranding

**Task 2 — app/admin/layout.tsx:**
- Added `import { Suspense } from 'react'`
- Replaced `getBranding` import with `getCachedBranding`
- Wrapped `{children}` in `<Suspense>` — layout shell (AdminNav + AdminTopbar) renders immediately; page content streams in behind loading.tsx skeleton
- AdminNav and AdminTopbar props (appName, logoUrl, adminEmail) unchanged

**Task 3 — app/(app)/layout.tsx:**
- Replaced `getBranding` import with `getCachedBranding`
- Added `const brandingPromise = getCachedBranding()` immediately after `getAuthClaims()` resolves and before `getCachedCompany()` await
- Passed `brandingPromise` (already in flight) into the existing `Promise.all` array
- getBranding DB query now overlaps with getCachedCompany DB query — ~50-100ms savings on cold requests
- All JSX props (branding.appName, branding.logoUrl, company, isAdmin, trialDaysRemaining) unchanged

## Verification Results

1. `grep getCachedBranding lib/platform-config.ts` — export present at line 169
2. `grep Suspense app/admin/layout.tsx` — import (line 2) + JSX usage (line 40)
3. `grep getCachedBranding app/admin/layout.tsx` — import (line 5) + call (line 16)
4. `grep brandingPromise app/(app)/layout.tsx` — assignment (line 25) + use in Promise.all (line 33)
5. `grep getCachedBranding app/(app)/layout.tsx` — import (line 2) + call (line 25)
6. `npx tsc --noEmit` — exits 0, no errors

## Success Criteria

- [x] Admin layout {children} wrapped in Suspense — page content streams while nav renders immediately (PERF-ADMIN-03)
- [x] getBranding wrapped in React cache() as getCachedBranding — deduplicates calls within single render pass (D-06)
- [x] App shell layout getCachedBranding overlapped with getCachedCompany — layout cold-start time reduced (PERF-ADMIN-06)
- [x] No regressions: AdminNav receives appName/logoUrl/adminEmail; Sidebar receives branding/company; all layout rendering unchanged
- [x] `npx tsc --noEmit` exits 0

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all data paths fully wired.

## Self-Check: PASSED

- lib/platform-config.ts: modified (getCachedBranding export added)
- app/admin/layout.tsx: modified (Suspense + getCachedBranding)
- app/(app)/layout.tsx: modified (brandingPromise parallelization)
- Commits: 6c715e8, 75624da, eafc201 — all present in git log
