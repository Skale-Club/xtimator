# Quick Task 260707-umu: Padronizar filtros de projetos recentes no dashboard

Goal: Make the Recent projects filters on the dashboard follow the Projects page control-bar pattern.

Tasks:

1. Reuse the shared `DataTable` header-left grouped control behavior for dashboard status filters.
   - Files: `components/dashboard/project-list.tsx`, `components/projects/project-table.tsx`
   - Action: Move dashboard status filters into a segmented `headerLeft` control instead of `DataTable` inline filter tabs.
   - Verify: The dashboard renders title, grouped status filters, and search field in the same visual style as `/projects`.

2. Normalize visible status labels.
   - Files: `components/dashboard/project-list.tsx`
   - Action: Render `Estimate ready` instead of `estimate_ready` while preserving filter keys.
   - Verify: The filter logic still uses project status values.

3. Run focused validation.
   - Files: affected tests or typecheck as available.
   - Action: Run lint/type/test command scoped enough for the UI change.
   - Verify: Command completes or any unrelated pre-existing issue is documented.
