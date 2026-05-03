---
phase: 16
plan: 01
subsystem: sidebar / data-layer
tags: [query, server-action, sidebar, pagination, projects]
dependency_graph:
  requires:
    - "lib/supabase/server (createClient)"
    - "projects table with company_id FK"
  provides:
    - "getProjectsByCompany — paginated company project query"
    - "getMoreProjects — server action for pagination"
    - "Sidebar props: projects + hasMore"
  affects:
    - "app/(app)/layout.tsx — adds project fetch to server component"
    - "components/app-shell/sidebar.tsx — extended prop contract"
tech_stack:
  added: []
  patterns:
    - "Supabase .range() for keyset-style pagination"
    - "Server action delegating to query helper (no extra auth check — RLS enforced)"
key_files:
  created: []
  modified:
    - lib/queries/project.ts
    - lib/actions/project.ts
    - app/(app)/layout.tsx
    - components/app-shell/sidebar.tsx
decisions:
  - "No auth re-check in getMoreProjects — RLS on projects table enforces company_id ownership automatically"
  - "ProjectSummary is minimal (4 fields) — enough for sidebar list without pulling full ProjectDetail"
  - "hasMore = data.length === limit — simple O(1) sentinel without a separate COUNT query"
metrics:
  duration: "~8 minutes"
  completed: "2026-05-03T20:14:15Z"
  tasks: 2
  files: 4
---

# Phase 16 Plan 01: Sidebar Projects Data Layer Summary

**One-liner:** Supabase paginated project query + server action + layout wiring and Sidebar prop contracts for the upcoming projects list panel.

## What Was Built

- `ProjectSummary` interface exported from `lib/queries/project.ts` (id, name, status, created_at)
- `getProjectsByCompany(supabase, companyId, page, limit)` — orders by `created_at` descending, uses `.range()` for pagination, returns `{ projects, hasMore }`, never throws
- `getMoreProjects(companyId, page)` server action in `lib/actions/project.ts` — creates a fresh server Supabase client (RLS auto-applies) and delegates to the query helper
- `app/(app)/layout.tsx` now fetches the first 10 projects after the company fetch and passes `projects` and `hasMore` as props to `<Sidebar>`
- `components/app-shell/sidebar.tsx` `SidebarProps` extended with `projects: ProjectSummary[]` and `hasMore: boolean`; function signature updated to destructure them — no JSX rendering added (Plan 02's responsibility)

## Commits

| Hash    | Description                                                  |
|---------|--------------------------------------------------------------|
| 2cc227f | feat(16-01): add ProjectSummary type and getProjectsByCompany query helper |
| 5373cf6 | feat(16-01): wire getMoreProjects action, layout projects fetch, and Sidebar props |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — no UI rendering added yet. Props are accepted but unused in JSX (intentional; Plan 02 renders them).

## Deferred Items

Pre-existing test failures in `tests/unit/components/language-toggle.test.tsx` (5 tests, I18N language toggle aria-label mismatch) — unrelated to this plan, present before changes.

## Self-Check: PASSED

- FOUND: lib/queries/project.ts
- FOUND: lib/actions/project.ts
- FOUND: app/(app)/layout.tsx
- FOUND: components/app-shell/sidebar.tsx
- FOUND: commit 2cc227f
- FOUND: commit 5373cf6
- FOUND: getProjectsByCompany export
- FOUND: getMoreProjects export
- FOUND: projects={projects} in layout
- FOUND: ProjectSummary in sidebar
