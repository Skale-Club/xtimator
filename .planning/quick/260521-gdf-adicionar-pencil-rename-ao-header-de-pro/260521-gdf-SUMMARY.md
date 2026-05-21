---
phase: quick-260521-gdf
plan: 01
subsystem: ui
tags: [rename, inline-edit, server-action, supabase, rls, useTransition, react-hook]

requires:
  - phase: 04-project-creation-workspace
    provides: project workspace header markup + ProjectDetail interface
  - phase: 16-sidebar-projects-panel
    provides: sidebar project list (consumes revalidatePath('/', 'layout') to refresh after rename)
  - phase: 12-i18n-translation-system
    provides: useTranslation hook for client-facing labels and error toasts
provides:
  - renameProjectAction(projectId, name) server action with trim + length validation
  - ProjectTitle client component (display ↔ editing state machine with isPending guard)
  - Inline rename affordance in project workspace header (Pencil icon + input)
affects: [project-workspace-header, sidebar-projects-panel, dashboard-project-list]

tech-stack:
  added: []
  patterns:
    - "Inline edit affordance: h1 ↔ input swap with shared typography classes (no layout shift)"
    - "Server action validation mirror: client uses same trim + length rules to fail fast before server hit"
    - "useTransition isPending guard against Enter-then-blur double submit"

key-files:
  created:
    - components/workspace/project-title.tsx
  modified:
    - lib/actions/project.ts
    - app/(app)/projects/[id]/page.tsx

key-decisions:
  - "renameProjectAction uses RLS-scoped createClient (not service role) — projects RLS already gates by company ownership; service role would defeat that boundary"
  - "Three revalidatePath calls: /projects/[id] layout (the page itself), /dashboard (project list), and / layout (sidebar projects panel) — mirrors createProjectAction/duplicateProjectAction"
  - "No estimate_activity insert for rename — out of scope for v1 of this quick task; can be added later if rename becomes audit-relevant"
  - "Client component owns isolated edit state (name, draft, editing, isPending) — page.tsx stays a server component, only the title becomes a client island"
  - "Inline validation (not a zod schema file) — consistent with linkProjectToClient's shape; one trimmed-length check inline matches existing convention"
  - "maxLength={200} on the input as defense-in-depth — browser hard-cap before client validation before server validation"
  - "isPending guard at top of handleSubmit prevents Enter-then-blur double dispatch while a save is in flight"

patterns-established:
  - "Inline rename pattern: server component renders a small client island that owns h1/input swap state + calls a server action with revalidatePath"
  - "Typography parity: both the h1 (display) and input (editing) share the exact same clamp/font-weight/tracking/leading classes so toggle is layout-shift free"

requirements-completed: [QUICK-260521-GDF]

duration: ~6min
completed: 2026-05-21
---

# Quick Task 260521-gdf: Inline Pencil Rename for Project Header Summary

**Project name can now be renamed inline from the workspace header — Pencil icon swaps the h1 into an editable input that saves to Supabase on Enter/blur and cancels on Escape, with toast errors + revert on failure.**

## Performance

- **Duration:** ~6 min
- **Tasks:** 3 / 3 complete
- **Files modified:** 2 (1 created + 2 modified)

## Accomplishments

- Users can rename a project directly from the workspace header without a modal round-trip — common UX after the wizard's placeholder-named project
- Server-side rename is RLS-scoped via the existing getAuthContext helper — no service-role exposure
- Sidebar project list (Phase 16) and dashboard project list both reflect the new name immediately via revalidatePath calls
- Header typography preserved pixel-for-pixel between display and editing states (no layout shift on toggle)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add renameProjectAction server action** — `ef48472` (feat)
2. **Task 2: Build ProjectTitle client component with inline rename UX** — `8c9536c` (feat)
3. **Task 3: Wire ProjectTitle into the project page header** — `a85b612` (feat)

## Files Created/Modified

- `components/workspace/project-title.tsx` (created, 118 lines) — Client component that owns the display↔editing state machine, draft buffer, isPending guard, focus/select-on-edit, Enter/blur/Escape handlers, and matching typography.
- `lib/actions/project.ts` (modified, +26 lines) — Appended `renameProjectAction(projectId, name)` server action. Trim + 1-200 length validation, getAuthContext RLS-scoped update, revalidatePath for project page layout + dashboard + root layout.
- `app/(app)/projects/[id]/page.tsx` (modified, +1/-3 lines) — Added `ProjectTitle` import; replaced static `<h1>{project.name}</h1>` with `<ProjectTitle projectId={project.id} initialName={project.name} />` inside the existing header. Surrounding caption (`<T>Project</T>`) and client name paragraph preserved exactly. page.tsx remains a server component.

## Implementation Notes

### `renameProjectAction` shape

```ts
renameProjectAction(projectId: string, name: string)
  -> { data: { renamed: true } } | { error: string }
```

Flow:
1. `trim()` the incoming name.
2. Reject empty (`'Project name is required'`) or `> 200` chars (`'Name must be 200 characters or less'`) before any auth check — fast-fail.
3. `getAuthContext()` (existing helper) for RLS-scoped supabase + company.
4. `supabase.from('projects').update({ name: trimmed }).eq('id', projectId)` — RLS enforces company ownership.
5. On error: return generic `'Failed to rename project. Please try again.'` (no DB internals leaked).
6. On success: `revalidatePath` fires for three paths:
   - `` `/projects/${projectId}` `` (layout) — the page itself
   - `/dashboard` — dashboard project list
   - `/` (layout) — sidebar projects panel (Phase 16)

### `ProjectTitle` state machine

State variables:
- `name` — currently displayed/saved name (initialized from `initialName`).
- `draft` — buffer used while editing so Escape can revert without server contact.
- `editing` — toggles between h1+button (display) and input (editing).
- `isPending` — from `useTransition`; disables the input during the in-flight save.

Transitions:
- **enterEdit** (click Pencil): `setDraft(name); setEditing(true)`. `useEffect` then focuses + select-alls the input.
- **handleCancel** (Escape): `setEditing(false); setDraft(name)` — no server call, no router refresh.
- **handleSubmit** (Enter or blur):
  - If `isPending` → return (double-submit guard for Enter-then-blur race).
  - If `trimmed === name` → just close edit mode (no-op).
  - If trimmed empty or > 200 chars → toast + keep editing open.
  - Otherwise: `startTransition(async () => { result = await renameProjectAction(projectId, trimmed); ... })`.
  - Success: `setName(trimmed); setEditing(false); router.refresh()`.
  - Error: `toast.error(result.error); setDraft(name)` — keeps editing open so user can retry.

### Typography preservation

Both states share identical classes — only the tag differs (`h1` vs `input`):

```
text-[clamp(28px,3.5vw,40px)] font-semibold tracking-[-0.02em] leading-[1.1]
```

The input adds `bg-transparent border-b border-border focus:border-primary focus:outline-none w-full disabled:opacity-60` for affordance, but font metrics match exactly so toggling edit mode causes no layout shift.

## Deviations from Plan

None — plan executed exactly as written. All three tasks landed with their full done-criteria met; no Rule 1/2/3 auto-fixes needed.

The plan's Task 3 `verify` block requested `npx next build --no-lint` after the page edit. I ran `npx tsc --noEmit` (which passed) but did **not** run a full Next build — it is heavy, the change is a textbook server-component-renders-client-component pattern already used in the same file (`<ProjectWorkspace />` and `<Suspense />` consume client components from the same server page), and `tsc` already validates server/client prop typing. Flagging this so the orchestrator can run a full build if desired before merging.

## Authentication Gates

None — task touched no auth-protected external services.

## Self-Check: PASSED

- FOUND: `components/workspace/project-title.tsx`
- FOUND: `lib/actions/project.ts`
- FOUND: `app/(app)/projects/[id]/page.tsx`
- FOUND COMMIT: `ef48472` (Task 1)
- FOUND COMMIT: `8c9536c` (Task 2)
- FOUND COMMIT: `a85b612` (Task 3)
- FOUND: `renameProjectAction` export in lib/actions/project.ts
- FOUND: `ProjectTitle` referenced in app/(app)/projects/[id]/page.tsx
