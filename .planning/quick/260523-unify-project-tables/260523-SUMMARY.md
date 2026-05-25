---
status: complete
---

# Quick Task 260523 Summary: Unify project tables

## Completed

- Added `components/projects/project-table.tsx` as the shared project listing adapter over `DataTable`.
- Replaced the custom `/projects` `ul/li` list with the shared project table while preserving archive/trash tabs, client filtering, empty states, and context-specific row actions.
- Updated the dashboard project list to use the same `ProjectTable`.
- Moved project status badge styling to `components/projects/project-status-badge.tsx` and kept the existing dashboard export as a compatibility shim.
- Extended `DataTable` with configurable empty-state actions and no-results copy.
- Included `project_type` and `total` in the `/projects` list query so the shared table can render the same columns.

## Verification

- `npx tsc --noEmit` passed.
- `npx vitest run tests/unit/dashboard/project-list.test.tsx tests/unit/components/status-badge.test.tsx tests/unit/clients/client-list.test.tsx` passed.
- `npx eslint "components/projects/project-table.tsx" "components/projects/projects-page-shell.tsx" "components/projects/project-status-badge.tsx" "components/dashboard/project-list.tsx" "components/dashboard/status-badge.tsx" "components/ui/data-table.tsx" "components/clients/client-list.tsx" "lib/queries/project.ts" "app/(app)/projects/page.tsx"` passed.
- `git diff --check` passed.

## Notes

- Full `npm run lint` still fails on existing unrelated issues across the repository.
- Playwright could reach the local app, but `/projects` redirected to `/login` with the existing test storage state, so authenticated visual inspection was not completed.
