---
phase: quick
plan: 260704-owm
type: execute
wave: 1
depends_on: []
files_modified: [components/workspace/project-workspace.tsx]
autonomous: true
requirements: [QUICK-FIX]
must_haves:
  truths:
    - "Expanded sub-sidebar (Overview/Client/Photos) is wide enough that nav labels render without horizontal scroll/clipping"
  artifacts:
    - path: "components/workspace/project-workspace.tsx"
      provides: "Workspace sub-sidebar rail width classes"
  key_links:
    - from: "components/workspace/project-workspace.tsx"
      to: "expanded rail width"
      via: "cn(...) className on the sticky rail div"
      pattern: "w-40 md:w-48"
---

<objective>
Restore the expanded width of the admin workspace sub-sidebar rail (Overview/Client/Photos nav) to `w-40 md:w-48`, undoing the regression introduced in commit `5c8dc806` that shrank it to `w-28 md:w-32`.

Purpose: The narrowed width causes nav labels to no longer fit, producing an unwanted horizontal scrollbar under the Overview/Client/Photos items on the project detail page.
Output: One-line Tailwind class fix in `components/workspace/project-workspace.tsx`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@components/workspace/project-workspace.tsx

Root cause (already investigated via git history): commit `5c8dc806` ("feat(v4.15): UI overhaul — data table, workspace, settings, send dialog") changed the expanded-state Tailwind classes on the sticky rail wrapper `<div>` (around line 124-131) from `w-40 md:w-48` to `w-28 md:w-32`. The collapsed-state classes (`w-14 md:w-14`) are unaffected and must remain unchanged.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Restore expanded sub-sidebar rail width</name>
  <files>components/workspace/project-workspace.tsx</files>
  <action>
    In the `cn(...)` className call on the sticky rail wrapper `<div>` (currently around line 124-131), change the ternary's expanded-state branch from `'w-28 md:w-32'` to `'w-40 md:w-48'`. Leave the collapsed-state branch (`sidebarCollapsed ? 'w-14 md:w-14' : ...`) exactly as-is. Do not touch any other className, prop, or logic in the file — this is a single-line value change only.
  </action>
  <verify>
    <automated>grep -n "w-40 md:w-48" "components/workspace/project-workspace.tsx"</automated>
  </verify>
  <done>The line reads `sidebarCollapsed ? 'w-14 md:w-14' : 'w-40 md:w-48',` and no other lines in the file changed.</done>
</task>

</tasks>

<verification>
Read `components/workspace/project-workspace.tsx` after the edit and confirm the expanded-state class string is exactly `w-40 md:w-48`, and that the collapsed-state class string `w-14 md:w-14` is unchanged.
</verification>

<success_criteria>
- Expanded sub-sidebar rail width classes are `w-40 md:w-48`
- No other code in the file was modified
- `grep -n "w-40 md:w-48" components/workspace/project-workspace.tsx` returns a match
</success_criteria>

<output>
After completion, create `.planning/quick/260704-owm-fix-sub-sidebar-width-shrinking-on-admin/260704-owm-SUMMARY.md`
</output>
