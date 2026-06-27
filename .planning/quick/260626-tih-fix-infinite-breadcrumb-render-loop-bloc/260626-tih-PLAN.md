---
phase: quick
plan: 260626-tih
type: execute
wave: 1
depends_on: []
files_modified:
  - components/app-shell/breadcrumb-context.tsx
  - components/workspace/project-header.tsx
  - components/clients/client-breadcrumb.tsx
  - tests/unit/components/breadcrumb-context.test.tsx
autonomous: true
requirements: [BREADCRUMB-LOOP-01]
must_haves:
  truths:
    - "Opening a project workspace does not enter a Maximum update depth render loop"
    - "Inline breadcrumb arrays with unchanged semantic content do not republish context state"
    - "Breadcrumb labels still update when the project or client name changes"
    - "Breadcrumb state is cleared when the publishing component unmounts"
  artifacts:
    - path: "components/app-shell/breadcrumb-context.tsx"
      provides: "Semantically stable breadcrumb publication and memoized provider value"
    - path: "tests/unit/components/breadcrumb-context.test.tsx"
      provides: "Regression coverage for inline-array rerenders, updates, and cleanup"
  key_links:
    - from: "components/workspace/project-header.tsx"
      to: "components/app-shell/breadcrumb-context.tsx"
      via: "useBreadcrumb with memoized project-name-dependent items"
      pattern: "useMemo.*project.name"
    - from: "components/clients/client-breadcrumb.tsx"
      to: "components/app-shell/breadcrumb-context.tsx"
      via: "useBreadcrumb with memoized client-name-dependent items"
      pattern: "useMemo.*clientName"
---

<objective>
Eliminate the infinite React effect cycle that crashes project workspaces and blocks access to Estimates.

The fix hardens the shared breadcrumb hook against referentially new but semantically unchanged arrays, stabilizes both current callers, and adds a focused regression suite.
</objective>

<tasks>

<task type="auto">
  <name>Task 1: Make breadcrumb publication referentially safe</name>
  <files>components/app-shell/breadcrumb-context.tsx, components/workspace/project-header.tsx, components/clients/client-breadcrumb.tsx</files>
  <action>
Add semantic breadcrumb equality and retain the previous array reference when label, href, and badge values are unchanged. Use the stable array as the effect dependency, avoid no-op state replacements, memoize the provider value, and stabilize both current call sites with useMemo keyed by their primitive name prop.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>Repeated renders no longer cause breadcrumb state to be republished indefinitely, while real label changes still propagate.</done>
</task>

<task type="auto">
  <name>Task 2: Add regression coverage for the render loop</name>
  <files>tests/unit/components/breadcrumb-context.test.tsx</files>
  <action>
Create Vitest + Testing Library coverage using a publisher that deliberately passes a fresh inline array on every render. Assert stable rendering without Maximum update depth errors, propagation of a changed name, and cleanup on unmount.
  </action>
  <verify>
    <automated>npx vitest run tests/unit/components/breadcrumb-context.test.tsx tests/unit/components/language-toggle.test.tsx</automated>
  </verify>
  <done>The exact unstable-array regression is locked by automated tests and the previously implicated LanguageToggle suite remains green.</done>
</task>

</tasks>

<verification>
Run the focused regression tests, TypeScript, lint on the changed files, and the production build. Inspect the authenticated project route in the browser when an authenticated browser session is available.
</verification>

<success_criteria>
- No Maximum update depth error from inline breadcrumb arrays
- Project and client breadcrumbs update correctly
- Breadcrumb cleanup remains correct
- Focused tests, TypeScript, lint, and production build pass
</success_criteria>

<output>
After completion, create `.planning/quick/260626-tih-fix-infinite-breadcrumb-render-loop-bloc/260626-tih-SUMMARY.md`.
</output>
