# Quick Task 260526-0hv — Summary

**Description:** Corrigir filtros de status do dashboard em `components/dashboard/project-list.tsx`.
**Date:** 2026-05-26
**Status:** Complete

## Problem

`STATUS_FILTERS` listed eight statuses (`'all', 'draft', 'processing', 'ready', 'sent', 'accepted', 'declined', 'archived'`) that the dashboard tabs filter projects by with strict equality (`project.status === tab.key` in `components/projects/project-table.tsx:216`). Only the three statuses actually present in `projects.status` for the dashboard's query scope are `recording`, `estimate_ready`, and `draft` — every other tab filtered to empty. `archived` could never match because `lib/queries/dashboard.ts` excludes `archived_at IS NOT NULL` server-side.

## Change

- `components/dashboard/project-list.tsx`: replaced `STATUS_FILTERS` with `['all', 'recording', 'draft', 'estimate_ready']`.
- `tests/unit/dashboard/project-list.test.tsx`: retargeted the filter-click assertion from `'accepted'` (now removed) to `'estimate_ready'`, including the matching project-status fixture.

No label/i18n renames, no query changes, no `ProjectTable` / `DataTable` refactor — scope locked per user instruction.

## Verification

- `npx vitest run tests/unit/dashboard/project-list.test.tsx` → 6/6 pass (run inside the executor's worktree)
- `git diff --stat` (worktree commit): 2 files, 10 insertions / 14 deletions

## Commits

- `7f98789` (worktree) — `fix(quick-260526-0hv): replace dashboard STATUS_FILTERS with real project.status values`
- Merged to `main` via `chore: merge quick task worktree (worktree-agent-a0ba322783a4f0031)`

## Files touched

- `components/dashboard/project-list.tsx`
- `tests/unit/dashboard/project-list.test.tsx`

## Deviations

None.
