---
phase: quick-260522-j7g
plan: "01"
subsystem: ui-components
tags: [datatable, generic-component, refactor, dashboard]
dependency_graph:
  requires: []
  provides: [components/ui/data-table.tsx]
  affects: [components/dashboard/project-list.tsx]
tech_stack:
  added: []
  patterns: [generic-React-component, column-definition-pattern, useMemo-derived-data]
key_files:
  created:
    - components/ui/data-table.tsx
  modified:
    - components/dashboard/project-list.tsx
decisions:
  - ProjectTableRow logic inlined into column cell definitions — avoids nested TableRow inside TableRow (invalid HTML)
  - filterTabs first key treated as show-all (no match fn) matching STATUS_FILTERS 'all' pattern
  - renderMobileCard is optional — DataTable renders nothing for mobile if not provided
metrics:
  duration: "8min"
  completed: "2026-05-22"
  tasks: 2
  files: 2
---

# Quick 260522-j7g: Create Generic DataTable Component and Migrate ProjectList

**One-liner:** Generic `DataTable<T>` with column definitions, internal search/sort/filter state, and mobile card fallback — ProjectList migrated as first consumer.

## What Was Built

### Task 1 — `components/ui/data-table.tsx` (new)

A fully generic `DataTable<T>` component with:

- `Column<T>` interface: `key`, `header`, `cell: (row: T) => React.ReactNode`, optional `className`
- `DataTableProps<T>`: data, columns, getRowKey, searchFn, sortOptions, filterTabs, emptyState props, onRowClick, renderMobileCard, headerRight
- Internal state: `search`, `activeSort` (defaults to `defaultSort ?? sortOptions[0].value`), `activeFilter` (defaults to `defaultFilter ?? filterTabs[0].key`)
- `useMemo` for `displayData`: applies searchFn, tab filter, then sort comparator
- Two empty states: no-data (`EmptyState` with emptyIcon/emptyTitle/emptyDescription) and no-results-match-filters (`EmptyState` with Search icon + clear-filters button)
- Desktop: `hidden md:block` Table with column-driven headers and cells
- Mobile: `md:hidden space-y-3` rendering via `renderMobileCard` (optional)
- Exports: `DataTable`, `Column`, `DataTableProps`

### Task 2 — `components/dashboard/project-list.tsx` (rewritten)

ProjectList is now a thin wrapper: 7 column definitions + `<DataTable<ProjectWithClient>>` call.

- All 7 columns defined inline: name (with Paid pill), client, type, status (StatusBadge), total (formatMoney), date, actions (ProjectActions)
- `ProjectTableRow` import removed — its cell content inlined per column (avoids nested `<TableRow>` inside `<TableRow>` which is invalid HTML)
- `ProjectTableRow` file itself untouched at `components/dashboard/project-table-row.tsx`
- Functional parity preserved: search, 4 sort modes (newest/oldest/highest/alphabetical), 8 status filter tabs, desktop table, mobile cards

## Deviations from Plan

None — plan executed exactly as written.

The constraint "do NOT nest TableRow inside TableRow" was already the reason the plan specified inlining column cells rather than reusing `ProjectTableRow`. The implementation followed the plan's column-cell spec exactly.

## Known Stubs

None. All data is wired from the `projects` prop passed by the dashboard server component.

## Self-Check: PASSED

- `components/ui/data-table.tsx`: FOUND
- `components/dashboard/project-list.tsx`: FOUND
- Commit `a78a146`: FOUND (Task 1 — DataTable generic component)
- Commit `ae70927`: FOUND (Task 2 — ProjectList migration)
- `tsc --noEmit`: 0 errors
- No `useMemo`/`useState`/`ProjectTableRow` remaining in project-list.tsx: VERIFIED
