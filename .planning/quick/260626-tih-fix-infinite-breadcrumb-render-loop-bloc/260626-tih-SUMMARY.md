---
phase: quick
plan: 260626-tih
subsystem: app-shell
tags: [react, breadcrumbs, estimates, render-loop]
dependency_graph:
  requires: []
  provides: [BREADCRUMB-LOOP-01]
  affects: [project-workspace, client-detail, app-topbar]
tech_stack:
  added: []
  patterns: [semantic state equality, memoized context value, primitive effect inputs]
key_files:
  modified:
    - components/app-shell/breadcrumb-context.tsx
    - components/workspace/project-header.tsx
    - components/clients/client-breadcrumb.tsx
  created:
    - tests/unit/components/breadcrumb-context.test.tsx
decisions:
  - "Breadcrumb badges are restricted to string or number so semantic equality cannot be defeated by a newly allocated React element."
  - "Unmount cleanup is isolated from publication so ordinary rerenders never clear and republish breadcrumb state."
metrics:
  completed: "2026-06-26"
  tasks_completed: 2
  files_modified: 4
---

# Quick Task 260626-tih: Breadcrumb Render Loop Fix Summary

**One-liner:** Removed the `useEffect -> setBreadcrumbs -> new inline array -> useEffect` cycle that crashed project workspaces and blocked Estimates, with central semantic guards and regression coverage.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Make breadcrumb publication referentially safe | c3e51366 | breadcrumb-context.tsx, project-header.tsx, client-breadcrumb.tsx |
| 2 | Add regression coverage for inline-array rerenders | c3e51366 | breadcrumb-context.test.tsx |

## What Was Done

- `BreadcrumbProvider` now ignores semantically unchanged publications, avoids no-op clears, and memoizes its context value.
- `useBreadcrumb` separates publication from unmount cleanup, preventing effect cleanup from clearing state during ordinary rerenders.
- Project and client breadcrumb arrays are memoized from their primitive name dependency.
- Breadcrumb badges are narrowed to `string | number`, matching their count/label purpose and keeping equality deterministic.
- The new test deliberately rerenders a publisher 20 times with a fresh inline array, verifies no maximum-depth error, verifies a real name change, and verifies unmount cleanup.

## Verification Results

```text
npx vitest run tests/unit/components/breadcrumb-context.test.tsx tests/unit/components/language-toggle.test.tsx
Test Files 2 passed; Tests 5 passed, 3 todo

npx eslint <four changed files>
Exit 0

npm run build
Compiled successfully; TypeScript finished; 74/74 static pages generated; /projects/[id] included

npm test
371 files passed, 3 skipped; 2583 tests passed, 2 skipped, 33 todo.
One known parallel-only timeout: mcp-route-contract GET test.

npx vitest run tests/unit/mcp-route-contract.test.ts
1 file passed; 8/8 tests passed in isolation.
```

## Manual Verification Note

The internal browser had no authenticated Xtimator session and redirected the supplied project URL to `/?auth=login`. The authenticated route itself therefore remains a user-session UAT item; the exact render-loop mechanism is covered by the new component regression test.

## Deviations from Plan

The first implementation used a ref to retain semantic identity. React 19's `react-hooks/refs` lint rule correctly rejected reading and writing that ref during render. It was replaced with a provider-level semantic state guard and separate effects, then the full focused verification was rerun.

## Self-Check: PASSED

- [x] Source commit exists: `c3e51366`
- [x] Regression test reproduces the formerly unsafe inline-array usage
- [x] Focused tests and lint pass
- [x] Production build passes
- [x] Unrelated landing-page changes were not staged or committed
