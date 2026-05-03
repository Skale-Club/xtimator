---
phase: 17
plan: "03"
subsystem: app-shell, dashboard, project-workspace
tags: [performance, streaming, suspense, prefetch, navigation]
dependency_graph:
  requires: [17-01, 17-02]
  provides: [suspense-streaming-dashboard, suspense-streaming-project-workspace, hover-prefetch-sidebar]
  affects: [sidebar, dashboard-page, project-workspace-page]
tech_stack:
  added: []
  patterns:
    - React Suspense with async server sub-components for progressive streaming
    - HoverPrefetchLink: defer Next.js prefetch until mouse hover to reduce cold-load overhead
    - Promise-passing pattern: start queries without await in page, pass promises to async sub-component
key_files:
  created:
    - components/app-shell/hover-prefetch-link.tsx
  modified:
    - components/app-shell/sidebar.tsx
    - app/(app)/dashboard/page.tsx
    - app/(app)/projects/[id]/page.tsx
decisions:
  - company query in ProjectTabs moved into async sub-component alongside workspace data to keep main page shell fast
  - ProjectTabs receives typed promises (ReturnType<typeof fn>) rather than awaited values to preserve streaming semantics
metrics:
  duration: 3min
  completed_date: "2026-05-03"
  tasks: 4
  files: 4
---

# Phase 17 Plan 03: Suspense Streaming + Hover Prefetch Summary

**One-liner:** Progressive Suspense streaming for dashboard and project workspace with hover-triggered sidebar prefetch to reduce cold navigation cost.

## Tasks Completed

| # | Task | Status | Commit |
|---|------|--------|--------|
| 1 | Create HoverPrefetchLink component | DONE | a37ea50 |
| 2 | Update sidebar NAV_ITEMS to use HoverPrefetchLink | DONE | a37ea50 |
| 3 | Add Suspense streaming to dashboard page | DONE | a37ea50 |
| 4 | Add Suspense streaming to project workspace page | DONE | a37ea50 |

## What Was Built

### HoverPrefetchLink (`components/app-shell/hover-prefetch-link.tsx`)
A `'use client'` wrapper around Next.js `Link` that starts with `prefetch={false}` and switches to `prefetch={null}` (default eager behavior) on `onMouseEnter`. This defers the prefetch network cost until the user signals intent, reducing cold-load overhead for authenticated nav items.

### Sidebar NAV_ITEMS Update (`components/app-shell/sidebar.tsx`)
All NAV_ITEMS loop `<Link>` elements replaced with `<HoverPrefetchLink>`. All existing `className`, `key`, `href`, and other props preserved. The "New project" link and "Create your first project" link in the projects section were intentionally left as plain `Link` (per plan spec).

### Dashboard Suspense Streaming (`app/(app)/dashboard/page.tsx`)
The main `DashboardPage` component now handles only auth/company checks (fast path), then renders two Suspense-wrapped async sub-components:
- `<DashboardStats>` — fetches stats and renders `<StatCards>`; skeleton: 4 `h-24` grid cards
- `<DashboardProjects>` — fetches projects and renders `<ProjectList>`; skeleton: `h-64` full-width block

### Project Workspace Suspense Streaming (`app/(app)/projects/[id]/page.tsx`)
The page now:
1. Fetches `project` first with a single `await` for fast 404 check
2. Starts all 6 remaining queries as unresolved promises
3. Renders project name/client immediately (static shell above Suspense boundary)
4. Wraps `<ProjectTabs>` in Suspense with `<ProjectWorkspaceSkeleton>`
5. `ProjectTabs` async sub-component awaits all 6 promises via `Promise.all`, fetches company name, then renders `<ProjectWorkspace>`

## Deviations from Plan

None — plan executed exactly as written. The `ProjectTabs` typing used `ReturnType<typeof fn>` for promise props (consistent with TypeScript strict mode) and the company query was naturally co-located inside the async sub-component.

## Verification

- `npx tsc --noEmit --skipLibCheck`: PASS (no output = clean)
- `npm test`: 285/291 tests pass. 6 pre-existing failures in `language-toggle.test.tsx` and `auth.test.ts` — unrelated to this plan's changes, confirmed by git diff scope.

## Known Stubs

None.

## Self-Check: PASSED

- `components/app-shell/hover-prefetch-link.tsx` — FOUND
- `components/app-shell/sidebar.tsx` — modified, HoverPrefetchLink import present
- `app/(app)/dashboard/page.tsx` — Suspense + DashboardStats + DashboardProjects present
- `app/(app)/projects/[id]/page.tsx` — Suspense + ProjectTabs + ProjectWorkspaceSkeleton present
- Commit `a37ea50` — FOUND
