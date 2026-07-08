---
status: complete
quick_id: 260707-umu
date: 2026-07-08
commit: 629374a2
---

# Quick Task 260707-umu Summary

Aligned the dashboard "Recent projects" status filters with the Projects page control-bar pattern.

Changes:

- Added `ProjectStatusTabs` as the shared segmented status-tab component.
- Reused it in `/projects` and in the dashboard project list.
- Moved dashboard filters into the `DataTable` `headerLeft` group so filters and search share one bordered control.
- Changed the dashboard visible label from `estimate_ready` to `Estimate ready`.
- Replaced the `DataTable` synchronous page-reset effect with explicit update handlers to satisfy ESLint while preserving reset-to-page-1 behavior.
- Updated the dashboard unit test for the new tab UI.

Verification:

- `npx eslint components/dashboard/project-list.tsx components/projects/project-status-tabs.tsx components/projects/projects-page-shell.tsx components/ui/data-table.tsx tests/unit/dashboard/project-list.test.tsx`
- `npm test -- tests/unit/dashboard/project-list.test.tsx`
