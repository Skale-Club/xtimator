---
phase: quick-260521-gdf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/actions/project.ts
  - components/workspace/project-title.tsx
  - app/(app)/projects/[id]/page.tsx
autonomous: true
requirements:
  - QUICK-260521-GDF
must_haves:
  truths:
    - "User sees a Pencil icon button next to the project name in the header on /projects/[id]"
    - "Clicking the Pencil swaps the h1 into an editable text input pre-populated with the current name"
    - "Pressing Enter (or blur) submits the new name; the saved name is persisted to projects.name in Supabase"
    - "Pressing Escape cancels the edit and restores the original name without writing to the DB"
    - "After a successful save, the displayed project name reflects the new value (router.refresh / revalidatePath)"
    - "On save failure, the original name is restored and a toast surfaces the error"
    - "Empty or >200 char names are rejected before the server is hit (client-side validation matches server-side)"
    - "Header preserves clamp typography, font-weight, tracking, and line-height (no visual regression)"
  artifacts:
    - path: "lib/actions/project.ts"
      provides: "renameProjectAction(projectId, name) server action — getAuthContext + RLS-scoped UPDATE + revalidatePath"
      contains: "renameProjectAction"
    - path: "components/workspace/project-title.tsx"
      provides: "Client component rendering h1 + Pencil button + inline input with Enter/Escape/blur handlers"
      contains: "ProjectTitle"
      min_lines: 60
    - path: "app/(app)/projects/[id]/page.tsx"
      provides: "Header replaced — <h1>{project.name}</h1> swapped for <ProjectTitle projectId={project.id} initialName={project.name} />"
      contains: "ProjectTitle"
  key_links:
    - from: "components/workspace/project-title.tsx"
      to: "lib/actions/project.ts -> renameProjectAction"
      via: "import + startTransition(async () => await renameProjectAction(...))"
      pattern: "renameProjectAction\\("
    - from: "lib/actions/project.ts -> renameProjectAction"
      to: "supabase projects.update({ name }).eq('id', projectId)"
      via: "RLS-scoped createClient (NOT service role)"
      pattern: "from\\('projects'\\)\\s*\\.update"
    - from: "lib/actions/project.ts -> renameProjectAction"
      to: "Next.js cache invalidation"
      via: "revalidatePath after successful update"
      pattern: "revalidatePath\\("
---

<objective>
Add an inline-rename affordance (Pencil icon button) to the project name h1 in `app/(app)/projects/[id]/page.tsx`. Clicking the Pencil swaps the title into an editable input that saves the new name to Supabase on Enter/blur and cancels on Escape. The header lives in a server component, so the editable title is extracted into a small client component (`components/workspace/project-title.tsx`) that owns the edit state.

Purpose: Lets a user rename a project directly from its workspace header — a common ask after the wizard creates a placeholder-named project (`PLACEHOLDER_PREFIX` in `lib/constants/project.ts`). No modal/dialog round-trip required.

Output: Working inline rename with optimistic-feeling UX (useTransition + router.refresh), error toast + revert on failure, identical header typography preserved.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@app/(app)/projects/[id]/page.tsx
@components/workspace/project-workspace.tsx
@lib/queries/project.ts
@lib/actions/project.ts
@components/clients/client-detail-actions.tsx

<interfaces>
<!-- Contracts the executor needs. Extracted from codebase. -->

From `lib/queries/project.ts`:
```typescript
export interface ProjectDetail {
  id: string
  company_id: string
  name: string
  project_type: string | null
  status: string
  target_budget: number | null
  total: number
  created_at: string
  client: { id: string; name: string; email: string | null; phone: string | null } | null
}
```

From `lib/actions/project.ts` (existing patterns to mirror):
```typescript
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }
  const { data: company } = await supabase
    .from('companies')
    .select('id')
    .eq('user_id', claims.sub)
    .single()
  if (!company) return { error: 'No company found' as const }
  return { supabase, company }
}

// linkProjectToClient is the closest existing pattern — update + revalidatePath
export async function linkProjectToClient(projectId: string, clientId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx
  const { error } = await supabase
    .from('projects')
    .update({ client_id: clientId })
    .eq('id', projectId)
  if (error) return { error: 'Failed to link client. Please try again.' }
  revalidatePath(`/projects/${projectId}`, 'layout')
  return { data: { linked: true } }
}
```

From `components/clients/client-detail-actions.tsx` (Pencil + useTransition + toast pattern):
```typescript
'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/i18n/use-translation'
// <Pencil className="h-4 w-4 mr-1" />
// startTransition(async () => { const r = await action(...); if (r.error) toast.error(r.error) })
```

From `app/(app)/projects/[id]/page.tsx` (current header markup — preserve typography exactly):
```tsx
<header className="space-y-1">
  <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground"><T>Project</T></p>
  <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-[-0.02em] leading-[1.1]">
    {project.name}
  </h1>
  {project.client && (
    <p className="text-sm text-muted-foreground">{project.client.name}</p>
  )}
</header>
```

Validation constants (mirror existing schemas — `lib/schemas/price-book.ts` line 5):
```typescript
z.string().min(1, 'Project name is required').max(200, 'Name must be 200 characters or less')
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="false">
  <name>Task 1: Add renameProjectAction server action</name>
  <files>lib/actions/project.ts</files>
  <action>
Append a new exported async function `renameProjectAction(projectId: string, name: string)` to the **end** of `lib/actions/project.ts`. Do NOT modify any existing function.

Implementation:
1. Trim the incoming `name`. Validate: `if (!name || name.length === 0) return { error: 'Project name is required' }`. Then `if (name.length > 200) return { error: 'Name must be 200 characters or less' }`. (Server-side defense — client also validates, but never trust the client.)
2. Call `getAuthContext()` (already defined at top of file). If `'error' in ctx` return `{ error: ctx.error }`.
3. Use the **RLS-scoped** `supabase` from ctx (NOT service role — CLAUDE.md SEC requirement: service role never reachable from this code path; RLS on `projects` already gates by company ownership).
4. `await supabase.from('projects').update({ name }).eq('id', projectId)` — capture `{ error }`. If error: `return { error: 'Failed to rename project. Please try again.' }` (do not leak DB internals).
5. On success: call `revalidatePath(\`/projects/${projectId}\`, 'layout')` (matches existing `linkProjectToClient` pattern at line 170). Also call `revalidatePath('/dashboard')` and `revalidatePath('/', 'layout')` so the sidebar project list (Phase 16) reflects the new name without 60s TTL wait — mirrors the pattern used by `createProjectAction` and `duplicateProjectAction`.
6. Return `{ data: { renamed: true } }`.

Do NOT log activity events (no `estimate_activity` insert) — rename is not a meaningful audit event for v1 of this quick task and adding it would expand scope.
Do NOT add a zod schema file — inline validation is consistent with `linkProjectToClient`'s shape (also no schema). If a follow-up reuses this validation, factor it then.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
- `renameProjectAction` exported from `lib/actions/project.ts`
- Validates trimmed empty + max 200 chars
- Uses `getAuthContext()` + RLS `createClient` (not service role)
- `revalidatePath` called for `/projects/${projectId}` layout, `/dashboard`, and `/` layout on success
- Returns `{ data: { renamed: true } }` on success, `{ error: string }` on failure
- `npx tsc --noEmit` passes with no new errors
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 2: Build ProjectTitle client component with inline rename UX</name>
  <files>components/workspace/project-title.tsx</files>
  <action>
Create new file `components/workspace/project-title.tsx` as a client component (`'use client'` at top).

Imports:
```typescript
'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { renameProjectAction } from '@/lib/actions/project'
import { useTranslation } from '@/lib/i18n/use-translation'
```

Props interface:
```typescript
interface ProjectTitleProps {
  projectId: string
  initialName: string
}
```

State (inside `ProjectTitle({ projectId, initialName }: ProjectTitleProps)`):
- `const [name, setName] = useState(initialName)` — current displayed/edited value
- `const [editing, setEditing] = useState(false)` — controls h1-vs-input swap
- `const [draft, setDraft] = useState(initialName)` — buffer while editing (so cancel can revert)
- `const [isPending, startTransition] = useTransition()` — disables input during save
- `const router = useRouter()`
- `const { t } = useTranslation()`
- `const inputRef = useRef<HTMLInputElement>(null)`

Behavior:
1. **Enter edit mode**: clicking the Pencil button sets `setDraft(name); setEditing(true)`. Use `useEffect` (import it) or a callback ref to focus + select-all the input when `editing` flips to true: `useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select() } }, [editing])`.
2. **Cancel** (Escape): `setEditing(false); setDraft(name)` — does NOT call the action.
3. **Submit** (Enter key OR blur): trim `draft`. If trimmed value === `name` (no change) just close: `setEditing(false)`. If trimmed empty: toast.error(`${t('Project name is required')}`), keep editing open, do nothing else. If trimmed length > 200: toast.error(`${t('Name must be 200 characters or less')}`), keep editing open. Otherwise call `startTransition(async () => { const result = await renameProjectAction(projectId, trimmed); if (result.error) { toast.error(result.error); setDraft(name); /* keep editing open so user can retry or escape */ return; } setName(trimmed); setEditing(false); router.refresh(); })`.
4. Pencil button: `<button type="button" onClick={enterEdit} className="inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label={t('Rename project')}><Pencil className="h-4 w-4" /></button>`.
5. Display markup (when NOT editing) — preserve typography exactly from page.tsx; render h1 + Pencil button inline:
```tsx
<div className="flex items-center gap-2">
  <h1 className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-[-0.02em] leading-[1.1]">
    {name}
  </h1>
  <button .../* Pencil button */>
</div>
```
6. Edit markup (when `editing`) — use `<input>` with matching typography so layout does not jump:
```tsx
<input
  ref={inputRef}
  type="text"
  value={draft}
  onChange={(e) => setDraft(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSubmit() }
    else if (e.key === 'Escape') { e.preventDefault(); handleCancel() }
  }}
  onBlur={handleSubmit}
  disabled={isPending}
  maxLength={200}
  aria-label={t('Project name')}
  className="text-[clamp(28px,3.5vw,40px)] font-semibold tracking-[-0.02em] leading-[1.1] bg-transparent border-b border-border focus:border-primary focus:outline-none w-full disabled:opacity-60"
/>
```

Notes:
- Use `maxLength={200}` on the input so the browser hard-caps input length (defense-in-depth before client validation).
- Do NOT wrap submit in a `<form>` — Enter and blur handlers are enough and a form would require preventing default elsewhere.
- Use `useTranslation` for all user-facing strings (matches Phase 12 i18n convention).
- When `onBlur` and `onKeyDown` both fire (Enter then blur), guard against double-submit: `if (isPending) return` at the top of `handleSubmit`. Also: pressing Enter dispatches submit which on success calls `setEditing(false)` — at that point the input unmounts so blur cannot fire. The guard is mainly for safety while `isPending`.
- Export: `export function ProjectTitle(props: ProjectTitleProps) { ... }`.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
- `components/workspace/project-title.tsx` exists with `'use client'` directive
- `ProjectTitle` named export accepting `{ projectId, initialName }`
- Pencil button toggles inline input
- Enter/blur calls `renameProjectAction`, Escape cancels without server call
- Input auto-focuses and selects-all on entering edit mode
- Input disabled during `isPending`
- Error path: toast shown, draft reverted to last saved name, edit mode stays open
- Success path: local `name` updated, edit mode closes, `router.refresh()` called
- Typography preserved (clamp font size, font-semibold, tracking, leading match h1)
- `npx tsc --noEmit` passes
  </done>
</task>

<task type="auto" tdd="false">
  <name>Task 3: Wire ProjectTitle into the project page header</name>
  <files>app/(app)/projects/[id]/page.tsx</files>
  <action>
In `app/(app)/projects/[id]/page.tsx`:

1. Add import at top with the other component imports (e.g. just below the `ProjectWorkspace` import on line 8):
   ```typescript
   import { ProjectTitle } from '@/components/workspace/project-title'
   ```
2. In the `<header>` block (lines 47-55), replace the static `<h1>` with the client component. Keep the surrounding "Project" caption and client name paragraph EXACTLY as they are:
   ```tsx
   <header className="space-y-1">
     <p className="text-xs uppercase tracking-[0.08em] text-muted-foreground"><T>Project</T></p>
     <ProjectTitle projectId={project.id} initialName={project.name} />
     {project.client && (
       <p className="text-sm text-muted-foreground">{project.client.name}</p>
     )}
   </header>
   ```
3. Do NOT touch anything below the header (Suspense / ProjectTabs / ProjectWorkspaceSkeleton remain untouched).
4. Do NOT remove the existing `<T>` translation wrapper for the "Project" caption.

Sanity: `page.tsx` remains a server component (no `'use client'` added) — `ProjectTitle` is the only client island in the header.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx next build --no-lint 2>&1 | head -80</automated>
  </verify>
  <done>
- `ProjectTitle` imported and rendered inside `<header>` of `app/(app)/projects/[id]/page.tsx`
- Surrounding "Project" caption and client name paragraph preserved
- `page.tsx` remains a server component
- Header DOM order unchanged: caption → title (now editable) → client name
- `npx tsc --noEmit` passes
- Next.js build does not surface new client/server boundary errors for this route
  </done>
</task>

</tasks>

<verification>
Manual smoke (run after Task 3):
1. `npm run dev`, sign in, open any project at `/projects/[id]`.
2. Confirm header looks visually identical to current (typography, spacing) — Pencil icon sits to the right of the name with subtle muted color.
3. Click Pencil → h1 swaps to input, cursor focused, text pre-selected.
4. Type new name, press Enter → input closes, new name appears, sidebar project list (if visible at lg+) reflects new name after refresh.
5. Click Pencil again, edit, press Escape → reverts to previous name, no network call (verify in DevTools Network tab).
6. Click Pencil, clear input, press Enter → toast "Project name is required", edit mode stays open.
7. Click Pencil, paste a 201+ char string → input hard-caps at 200 via `maxLength`; if user somehow exceeds, toast surfaces "Name must be 200 characters or less".
8. (Optional negative test) Temporarily change Task 1 to return `{ error: 'Test failure' }` unconditionally → confirm toast shows + name reverts + edit mode stays open. Revert.

Automated:
- `npx tsc --noEmit` clean.
- Existing test suite still passes: `npm run test` (no test changes required — this is a UI affordance over an existing data path).
</verification>

<success_criteria>
- User can rename a project inline from the workspace header in under 3 seconds (click Pencil → type → Enter).
- New name persists to `projects.name` in Supabase under RLS (verified by refreshing the page and seeing the new name).
- Escape cancels without writing to the DB.
- Failed saves show a toast and revert the displayed name; edit mode stays open so the user can retry.
- Header typography is pixel-identical to the previous static h1 (no layout shift when toggling edit mode).
- No new TypeScript errors; existing tests still pass.
</success_criteria>

<output>
After completion, create `.planning/quick/260521-gdf-adicionar-pencil-rename-ao-header-de-pro/260521-gdf-SUMMARY.md` summarizing:
- The `renameProjectAction` shape and which revalidation paths fire
- The `ProjectTitle` state machine (display ↔ editing, draft buffer, isPending guard)
- Any deviations from the plan (e.g. if the input typography needed adjustment for visual parity)
</output>
