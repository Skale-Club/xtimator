---
phase: quick-260522-lhp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - supabase/migrations/20260522000002_quick_lhp_projects_archive_trash.sql
  - lib/queries/project.ts
  - lib/actions/project.ts
  - app/(app)/projects/page.tsx
  - components/projects/projects-page-shell.tsx
  - components/projects/project-row-actions.tsx
  - lib/inngest/functions/cleanup-trash.ts
  - lib/inngest/functions/index.ts
  - app/api/inngest/route.ts
  - tests/unit/inngest/cleanup-trash-job.test.ts
autonomous: true
requirements:
  - QUICK-LHP-DB-01    # Migration: archived_at + deleted_at + partial indexes on projects
  - QUICK-LHP-BE-01    # Server actions: archive/unarchive/soft-delete/restore/hard-delete (RLS preserved)
  - QUICK-LHP-BE-02    # List query: status filter (active|archived|trash) + client filter via Supabase
  - QUICK-LHP-FE-01    # Tabs (Active/Archived/Trash) + Client filter Select in /projects header
  - QUICK-LHP-FE-02    # Per-row DropdownMenu with status-contextual actions + AlertDialog for permanent-delete
  - QUICK-LHP-CRON-01  # Daily Inngest cron: hard-delete projects where deleted_at < now() - 30 days
must_haves:
  truths:
    - "User can switch between Active, Archived, and Trash tabs on /projects and see only matching projects"
    - "User can filter the visible list by client via a Select in the header"
    - "User can archive an Active project; it disappears from Active and appears under Archived"
    - "User can unarchive an Archived project; it returns to Active"
    - "User can soft-delete a project from Active or Archived; it disappears and appears under Trash"
    - "User can restore a Trash project; it returns to Active"
    - "User can permanently delete a Trash project after explicit AlertDialog confirmation"
    - "Default /projects view (Active) never shows deleted_at IS NOT NULL or archived_at IS NOT NULL rows"
    - "Trashed projects whose deleted_at is older than 30 days are hard-deleted by a daily Inngest cron"
    - "All state transitions are scoped to the user's company via existing RLS — no cross-tenant leakage"
  artifacts:
    - path: "supabase/migrations/20260522000002_quick_lhp_projects_archive_trash.sql"
      provides: "ALTER TABLE projects ADD COLUMN archived_at, deleted_at + partial indexes"
      contains: "archived_at TIMESTAMPTZ"
    - path: "lib/actions/project.ts"
      provides: "archiveProjectAction, unarchiveProjectAction, softDeleteProjectAction, restoreProjectAction, hardDeleteProjectAction"
      exports:
        - "archiveProjectAction"
        - "unarchiveProjectAction"
        - "softDeleteProjectAction"
        - "restoreProjectAction"
        - "hardDeleteProjectAction"
    - path: "lib/queries/project.ts"
      provides: "getProjectsForListPage(supabase, companyId, { status, clientId }) typed query"
      exports:
        - "getProjectsForListPage"
        - "ProjectListStatus"
    - path: "app/(app)/projects/page.tsx"
      provides: "Server component reading ?status= and ?client= and rendering ProjectsPageShell"
      contains: "searchParams"
    - path: "components/projects/projects-page-shell.tsx"
      provides: "Client component with Tabs + client Select + project list rendering"
      contains: "'use client'"
    - path: "components/projects/project-row-actions.tsx"
      provides: "Per-row DropdownMenu with status-aware actions + AlertDialog confirm for permanent delete"
      contains: "'use client'"
    - path: "lib/inngest/functions/cleanup-trash.ts"
      provides: "runCleanupTrash(svc) + cleanupTrashJob (cron '0 5 * * *', 30-day TTL)"
      exports:
        - "runCleanupTrash"
        - "cleanupTrashJob"
    - path: "tests/unit/inngest/cleanup-trash-job.test.ts"
      provides: "Vitest unit tests for runCleanupTrash + cleanupTrashJob (TDD RED→GREEN)"
      contains: "describe('QUICK-LHP-CRON-01"
  key_links:
    - from: "app/(app)/projects/page.tsx"
      to: "lib/queries/project.ts:getProjectsForListPage"
      via: "server-side import + await with searchParams"
      pattern: "getProjectsForListPage\\("
    - from: "components/projects/project-row-actions.tsx"
      to: "lib/actions/project.ts:{archive,unarchive,softDelete,restore,hardDelete}ProjectAction"
      via: "client component invokes server actions in useTransition"
      pattern: "(archiveProjectAction|unarchiveProjectAction|softDeleteProjectAction|restoreProjectAction|hardDeleteProjectAction)\\("
    - from: "lib/inngest/functions/cleanup-trash.ts"
      to: "supabase.from('projects').delete()"
      via: "service-role client filters deleted_at < now() - 30d and hard-deletes"
      pattern: "\\.delete\\(\\)|deleted_at"
    - from: "app/api/inngest/route.ts"
      to: "lib/inngest/functions/cleanup-trash.ts:cleanupTrashJob"
      via: "serve() functions array registration"
      pattern: "cleanupTrashJob"
---

<objective>
Add a complete two-stage trash + archive workflow to `/projects` so the user can organize the project list:
filter by client, switch between Active / Archived / Trash, and perform per-row Archive / Unarchive /
Delete (soft) / Restore / Permanently Delete actions. A daily Inngest cron permanently deletes trash
older than 30 days.

Purpose:
  - Today `/projects` is a flat list with no lifecycle. The user explicitly asked for the two-stage
    trash pattern from the [feedback memory](feedback_destructive_actions_two_stage.md): Delete = soft
    delete + 30-day auto hard-delete cron. Validated from prior Shateable work.
  - Pair the trash with an Archive tier (long-lived "done but not gone" state) plus a client filter so
    the list stays scannable as project counts grow.
  - Mirror the cleanup-audio Inngest pattern (commit 379d689, kf2) so we navigate the 3 documented
    local-dev landmines without re-discovering them.

Output:
  - 1 migration (additive — `archived_at TIMESTAMPTZ NULL`, `deleted_at TIMESTAMPTZ NULL`, 2 partial indexes)
  - 5 new server actions in `lib/actions/project.ts`
  - 1 typed query in `lib/queries/project.ts` (`getProjectsForListPage`)
  - 1 refactored `app/(app)/projects/page.tsx` (search-params driven)
  - 2 new client components (`projects-page-shell.tsx`, `project-row-actions.tsx`)
  - 1 new Inngest function (`cleanup-trash.ts`) + barrel/serve registration
  - 1 Vitest unit test file (TDD RED→GREEN, mirrors `cleanup-audio-job.test.ts`)
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

# Current Projects page (what we're refactoring)
@app/(app)/projects/page.tsx

# Schema source of truth — section "CREATE TABLE projects" (lines 54-65) and
# the existing RLS policies (lines 188-196). Note: D-08 originally said
# "Hard-delete only (no deleted_at columns)" — this quick task explicitly
# overrides that for projects only, per user feedback memory.
@supabase/migrations/20260409000001_initial_schema.sql

# Server-action auth/RLS pattern: getAuthContext() + (SELECT auth.uid()) RLS
# already restricts UPDATE/DELETE to user's company. We just need company
# ownership to be authenticated; RLS handles the company_id scope.
@lib/actions/project.ts

# Existing list-query pattern + ProjectDetail/ProjectSummary types we'll
# extend (NOT replace) with archived_at/deleted_at and a new status filter.
@lib/queries/project.ts
@lib/queries/clients.ts

# Inngest pattern to MIRROR EXACTLY for cleanup-trash:
#   - pure helper runCleanupX(svc) + Inngest wrapper
#   - step.run('verb-noun', ...) wrapping
#   - createStorage abstraction (NOT used here — no Storage involvement for projects)
#   - best-effort: no throws, per-row try/catch, counts deleted/errors
@lib/inngest/functions/cleanup-audio.ts
@tests/unit/inngest/cleanup-audio-job.test.ts
@lib/inngest/functions/index.ts
@app/api/inngest/route.ts
@lib/supabase/service.ts

# UI primitives + existing DropdownMenu/AlertDialog/Select usage to copy
@components/clients/client-list.tsx

<interfaces>
<!-- Types and contracts the executor needs. Extracted from codebase. -->
<!-- Executor should use these directly — no codebase exploration needed. -->

From lib/queries/project.ts (current — will extend, not replace):
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

export interface ProjectSummary {
  id: string
  name: string
  status: string
  created_at: string
}

export async function getProjectsByCompany(
  supabase: SupabaseClient,
  companyId: string,
  page = 1,
  limit = 10
): Promise<{ projects: ProjectSummary[]; hasMore: boolean }>
```

From lib/actions/project.ts (existing pattern to match):
```typescript
async function getAuthContext() {
  const supabase = await createClient()
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims ?? null
  if (!claims) return { error: 'Not authenticated' as const }
  const { data: company } = await supabase
    .from('companies').select('id').eq('user_id', claims.sub).single()
  if (!company) return { error: 'No company found' as const }
  return { supabase, company }
}
// Pattern for every action: ctx, check error, do UPDATE/DELETE, revalidatePath
```

From lib/queries/clients.ts:
```typescript
export interface ClientWithCount {
  id: string; name: string; email: string | null; phone: string | null
  logo_url: string | null; created_at: string; project_count: number
}
export async function getClients(supabase, companyId): Promise<ClientWithCount[]>
```

From lib/inngest/functions/cleanup-audio.ts (pattern to mirror):
```typescript
// 1) pure helper:
export async function runCleanupX(svc): Promise<{ deleted: number; errors: number }>
// 2) Inngest wrapper:
export const cleanupXJob = inngest.createFunction(
  { id: 'cleanup-x', triggers: [{ cron: '0 4 * * *' }] },
  async ({ step }) => step.run('verb-noun', async () => {
    const svc = requireServiceClient()
    return runCleanupX(svc)
  })
)
```

New types this plan introduces:
```typescript
// lib/queries/project.ts (NEW exports)
export type ProjectListStatus = 'active' | 'archived' | 'trash'

export interface ProjectListRow {
  id: string
  name: string
  status: string
  created_at: string
  archived_at: string | null
  deleted_at: string | null
  client: { id: string; name: string } | null
}

export async function getProjectsForListPage(
  supabase: SupabaseClient,
  companyId: string,
  opts: { status: ProjectListStatus; clientId?: string | null },
): Promise<ProjectListRow[]>
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Supabase migration — add archived_at + deleted_at + partial indexes to projects</name>
  <files>supabase/migrations/20260522000002_quick_lhp_projects_archive_trash.sql</files>
  <action>
Create a new additive migration. Do NOT modify the `clients` table.

File body — must include EXACTLY (use placeholders if any literal contains a secret-looking pattern; no secrets are involved here):

```sql
-- Quick task 260522-lhp — Projects two-stage trash + archive (QUICK-LHP-DB-01).
--
-- Adds two nullable timestamps to `projects`:
--   archived_at — set when user archives; cleared when unarchived. UI hides these from default Active view.
--   deleted_at  — set when user soft-deletes; cleared when restored. Inngest cleanup-trash hard-deletes after 30 days.
--
-- Note on D-08 ("Hard-delete only"): D-08 is overridden for projects only, per user feedback
-- memory (two-stage trash pattern). recordings/photos/estimates remain hard-delete (cascaded
-- by ON DELETE CASCADE from projects).
--
-- RLS: no policy changes needed. Existing projects_select/insert/update/delete policies are
-- company-scoped via (SELECT id FROM companies WHERE user_id = (SELECT auth.uid())) and
-- already cover UPDATE (archive/unarchive/soft-delete/restore = UPDATE) and DELETE
-- (hard-delete = DELETE). Default view filtering (deleted_at IS NULL etc.) is enforced
-- at the application layer in lib/queries/project.ts — RLS still guards row visibility.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS deleted_at  TIMESTAMPTZ NULL;

-- Partial indexes optimize the three list views. Each tab queries a disjoint subset of rows;
-- partial indexes keep them small (only matching rows are indexed) and selective.
-- "Active":   archived_at IS NULL AND deleted_at IS NULL
-- "Archived": archived_at IS NOT NULL AND deleted_at IS NULL
-- "Trash":    deleted_at IS NOT NULL
CREATE INDEX IF NOT EXISTS idx_projects_active_by_company
  ON projects (company_id, created_at DESC)
  WHERE archived_at IS NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_trash_deleted_at
  ON projects (deleted_at)
  WHERE deleted_at IS NOT NULL;
```

Apply via the project's standard migration path (`bunx supabase db push --db-url $DATABASE_URL` or
remote `apply_migration` MCP tool — use whichever matches the established workflow; see
Phase 01-foundation-auth 01-03 decision: "Supabase migrations applied via bunx supabase db push
--db-url {DATABASE_URL}").

After apply, verify columns exist via `\d projects` or equivalent psql query.
  </action>
  <verify>
    <automated>node -e "const s = require('fs').readFileSync('supabase/migrations/20260522000002_quick_lhp_projects_archive_trash.sql','utf8'); for (const t of ['archived_at TIMESTAMPTZ NULL','deleted_at  TIMESTAMPTZ NULL','idx_projects_active_by_company','idx_projects_trash_deleted_at']) if (!s.includes(t)) { console.error('MISSING:', t); process.exit(1); } console.log('migration-shape ok');"</automated>
  </verify>
  <done>Migration file exists at the correct path; contains both ALTER TABLE columns and both partial indexes; applies cleanly against the database; existing projects rows have NULL for both new columns; no RLS policy was modified.</done>
</task>

<task type="auto">
  <name>Task 2: Extend lib/queries/project.ts with status-aware getProjectsForListPage + ProjectListStatus type</name>
  <files>lib/queries/project.ts</files>
  <action>
Extend the existing file — keep all existing exports (`ProjectDetail`, `getProjectById`,
`ActivityEvent`, `getProjectActivity`, `ProjectQuickStats`, `getProjectQuickStats`, `ProjectSummary`,
`getProjectsByCompany`) untouched.

Add:

```typescript
export type ProjectListStatus = 'active' | 'archived' | 'trash'

export interface ProjectListRow {
  id: string
  name: string
  status: string
  created_at: string
  archived_at: string | null
  deleted_at: string | null
  client: { id: string; name: string } | null
}

/**
 * Status-aware project list query for /projects page.
 * - 'active'   → archived_at IS NULL AND deleted_at IS NULL
 * - 'archived' → archived_at IS NOT NULL AND deleted_at IS NULL
 * - 'trash'    → deleted_at IS NOT NULL
 * Optionally filtered by client_id (null = unfiltered).
 *
 * RLS scopes rows to the user's company; we still pass company_id explicitly so the partial
 * indexes are hit (idx_projects_active_by_company is on (company_id, created_at DESC) with
 * the active partial predicate).
 */
export async function getProjectsForListPage(
  supabase: SupabaseClient,
  companyId: string,
  opts: { status: ProjectListStatus; clientId?: string | null },
): Promise<ProjectListRow[]> {
  let q = supabase
    .from('projects')
    .select('id, name, status, created_at, archived_at, deleted_at, client:clients(id, name)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  if (opts.status === 'active') {
    q = q.is('archived_at', null).is('deleted_at', null)
  } else if (opts.status === 'archived') {
    q = q.not('archived_at', 'is', null).is('deleted_at', null)
  } else {
    // 'trash'
    q = q.not('deleted_at', 'is', null)
  }

  if (opts.clientId) {
    q = q.eq('client_id', opts.clientId)
  }

  const { data, error } = await q
  if (error) {
    console.error('[getProjectsForListPage] supabase error', {
      companyId, status: opts.status, clientId: opts.clientId ?? null,
      code: error.code, message: error.message,
    })
    return []
  }
  // Supabase JS types the relation as an array OR single — narrow to single since clients(id) is FK.
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    created_at: row.created_at,
    archived_at: row.archived_at,
    deleted_at: row.deleted_at,
    client: (row.client as { id: string; name: string } | null) ?? null,
  })) as ProjectListRow[]
}
```

Do NOT regenerate database.types.ts. Per Phase 19 / Phase 24 / Phase 38 established convention,
manual type extension is acceptable when Docker is unavailable. If TS complains about the
selected `archived_at`/`deleted_at` columns on the generated `projects` row type, cast the
intermediate `data` as `unknown as Array<...>` with the narrow shape above (same pattern as
Phase 24 estimate_template_*).
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | head -40</automated>
  </verify>
  <done>`getProjectsForListPage` and `ProjectListStatus` exported; all 3 status branches produce the correct Supabase filter chain; clientId filter applied only when truthy; `tsc --noEmit` clean.</done>
</task>

<task type="auto">
  <name>Task 3: Add 5 lifecycle server actions in lib/actions/project.ts</name>
  <files>lib/actions/project.ts</files>
  <action>
Extend the existing file — keep all existing exports untouched. Add 5 new server actions following
the established `getAuthContext()` + `supabase.from('projects').update/delete()` + `revalidatePath`
pattern already used in `deleteProjectAction` and `renameProjectAction`.

RLS already enforces company scope for both UPDATE and DELETE on `projects` (lines 192-196 of
20260409000001_initial_schema.sql). The actions only need to invoke `getAuthContext()` (so the
unauthenticated path returns a clean error) and let RLS handle the per-row check via the WHERE
clause `.eq('id', projectId)` — if the project isn't in the user's company, RLS returns zero rows
affected and we surface a not-found error.

```typescript
// All 5 actions follow this skeleton:
//   1. getAuthContext()  →  { supabase, company } | { error }
//   2. supabase.from('projects').update({ ... }).eq('id', projectId)  (or .delete())
//   3. revalidatePath('/projects')
//   4. return { data: { ok: true } } | { error: '...' }

export async function archiveProjectAction(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Setting archived_at moves the row from Active → Archived.
  // We do NOT touch deleted_at — archiving a trashed project shouldn't undelete it
  // (UI prevents this anyway by only showing Archive on Active rows).
  const { error } = await supabase
    .from('projects')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', projectId)
    .is('deleted_at', null)  // defense-in-depth: don't archive a trashed project

  if (error) return { error: 'Failed to archive project. Please try again.' }
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')
  return { data: { archived: true } }
}

export async function unarchiveProjectAction(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  const { error } = await supabase
    .from('projects')
    .update({ archived_at: null })
    .eq('id', projectId)
    .is('deleted_at', null)

  if (error) return { error: 'Failed to unarchive project. Please try again.' }
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')
  return { data: { unarchived: true } }
}

export async function softDeleteProjectAction(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Soft delete: sets deleted_at. Row hides from Active AND Archived; appears in Trash.
  // We do NOT clear archived_at — restoring later should bring it back to wherever it was.
  const { error } = await supabase
    .from('projects')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', projectId)

  if (error) return { error: 'Failed to delete project. Please try again.' }
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')
  return { data: { soft_deleted: true } }
}

export async function restoreProjectAction(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Restore = clear deleted_at. archived_at is preserved (intentional — see softDelete above).
  // If the row was archived before deletion, it returns to Archived; otherwise to Active.
  const { error } = await supabase
    .from('projects')
    .update({ deleted_at: null })
    .eq('id', projectId)

  if (error) return { error: 'Failed to restore project. Please try again.' }
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')
  return { data: { restored: true } }
}

export async function hardDeleteProjectAction(projectId: string) {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase } = ctx

  // Hard delete: cascades to recordings/photos/estimates/sections/items/activity per FK ON DELETE CASCADE.
  // Only valid for rows that are already in Trash (deleted_at IS NOT NULL) — defense-in-depth filter.
  // UI gates this behind an AlertDialog (project-row-actions.tsx).
  const { error } = await supabase
    .from('projects')
    .delete()
    .eq('id', projectId)
    .not('deleted_at', 'is', null)

  if (error) return { error: 'Failed to permanently delete project. Please try again.' }
  revalidatePath('/projects')
  revalidatePath('/dashboard')
  revalidatePath('/', 'layout')
  return { data: { hard_deleted: true } }
}
```

NOTE: the existing `deleteProjectAction` (hard-delete with no guard) is preserved for now —
removing it would touch callers outside this quick task's scope. The new soft/hard split is what
the /projects UI uses; existing callers (sidebar etc.) keep working unchanged.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | head -40 ; node -e "const s=require('fs').readFileSync('lib/actions/project.ts','utf8'); for (const n of ['archiveProjectAction','unarchiveProjectAction','softDeleteProjectAction','restoreProjectAction','hardDeleteProjectAction']) if (!s.includes('export async function '+n)) { console.error('MISSING:',n); process.exit(1); } console.log('actions ok');"</automated>
  </verify>
  <done>5 new actions exported; each calls `getAuthContext()`; archive/unarchive guard with `.is('deleted_at', null)`; hardDelete guards with `.not('deleted_at', 'is', null)`; existing actions unchanged; `tsc --noEmit` clean.</done>
</task>

<task type="auto">
  <name>Task 4: Refactor /projects page to consume searchParams + create ProjectsPageShell client component</name>
  <files>app/(app)/projects/page.tsx, components/projects/projects-page-shell.tsx</files>
  <action>
**File 1: `app/(app)/projects/page.tsx`** — rewrite as a thin server component that reads
`searchParams`, fetches data, and hands off to the client shell. Next.js 16 typing convention
(from Phase 03-03 decision): `searchParams` is `Promise<{ ... }>` with `await` destructuring.

```typescript
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthClaims, getCachedCompany } from '@/lib/queries/auth'
import { getProjectsForListPage, type ProjectListStatus } from '@/lib/queries/project'
import { getClients } from '@/lib/queries/clients'
import { ProjectsPageShell } from '@/components/projects/projects-page-shell'

function parseStatus(raw: string | string[] | undefined): ProjectListStatus {
  const v = Array.isArray(raw) ? raw[0] : raw
  return v === 'archived' || v === 'trash' ? v : 'active'
}

function parseClient(raw: string | string[] | undefined): string | null {
  const v = Array.isArray(raw) ? raw[0] : raw
  // Reject anything that doesn't look like a UUID — prevents arbitrary string injection into the .eq filter.
  return v && /^[0-9a-f-]{36}$/i.test(v) ? v : null
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; client?: string }>
}) {
  const claims = await getAuthClaims()
  if (!claims) redirect('/login')

  const company = await getCachedCompany(claims.sub)
  if (!company) redirect('/onboarding')

  const sp = await searchParams
  const status = parseStatus(sp.status)
  const clientId = parseClient(sp.client)

  const supabase = await createClient()
  const [projects, clients] = await Promise.all([
    getProjectsForListPage(supabase, company.id, { status, clientId }),
    getClients(supabase, company.id),
  ])

  return (
    <ProjectsPageShell
      status={status}
      clientId={clientId}
      projects={projects}
      clients={clients}
    />
  )
}
```

**File 2: `components/projects/projects-page-shell.tsx`** — new client component owning Tabs
(Active/Archived/Trash) + client Select + the project list rendering (porting the existing
`<ul>/<li>` row layout from page.tsx). On tab/select change, push a new URL via
`router.push('/projects?status=...&client=...')` so the server component re-renders. Use
`useTransition` to keep the UI responsive.

```typescript
'use client'

import { useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { FolderPlus, FolderOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { EmptyState } from '@/components/dashboard/empty-state'
import { T } from '@/components/i18n/t'
import { cn } from '@/lib/utils'
import { ProjectRowActions } from '@/components/projects/project-row-actions'
import type { ProjectListRow, ProjectListStatus } from '@/lib/queries/project'
import type { ClientWithCount } from '@/lib/queries/clients'

const IN_PROGRESS_LABEL = 'In progress'
const IN_PROGRESS_COLOR = 'bg-transparent text-blue-400 border border-blue-500/60'
const STATUS_LABEL: Record<string, string> = { estimate_ready: 'Estimate ready' }
const STATUS_COLOR: Record<string, string> = {
  estimate_ready: 'bg-green-500/15 text-green-400 border border-green-500/50',
}
const ALL_CLIENTS = '__all__'

interface Props {
  status: ProjectListStatus
  clientId: string | null
  projects: ProjectListRow[]
  clients: ClientWithCount[]
}

export function ProjectsPageShell({ status, clientId, projects, clients }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function pushQuery(next: { status?: ProjectListStatus; client?: string | null }) {
    const params = new URLSearchParams()
    const s = next.status ?? status
    const c = next.client === undefined ? clientId : next.client
    if (s !== 'active') params.set('status', s)
    if (c) params.set('client', c)
    const qs = params.toString()
    startTransition(() => router.push(qs ? `/projects?${qs}` : '/projects'))
  }

  return (
    <div className="px-6 py-8 space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <Tabs value={status} onValueChange={(v) => pushQuery({ status: v as ProjectListStatus })}>
            <TabsList>
              <TabsTrigger value="active"><T>Active</T></TabsTrigger>
              <TabsTrigger value="archived"><T>Archived</T></TabsTrigger>
              <TabsTrigger value="trash"><T>Trash</T></TabsTrigger>
            </TabsList>
          </Tabs>
          <Select
            value={clientId ?? ALL_CLIENTS}
            onValueChange={(v) => pushQuery({ client: v === ALL_CLIENTS ? null : v })}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All clients" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_CLIENTS}><T>All clients</T></SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            <T text={`${projects.length} ${projects.length === 1 ? 'project' : 'projects'}`} />
          </p>
        </div>
        <Button variant="primary" asChild>
          <Link href="?modal=new-project">
            <FolderPlus className="h-4 w-4 mr-2" />
            <T>New project</T>
          </Link>
        </Button>
      </header>

      {projects.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={
            status === 'active' ? 'No projects yet'
            : status === 'archived' ? 'No archived projects'
            : 'Trash is empty'
          }
          description={
            status === 'active'
              ? 'Create your first project to get started.'
              : status === 'archived'
                ? 'Archived projects appear here.'
                : 'Soft-deleted projects appear here for 30 days before being permanently removed.'
          }
          actionLabel={status === 'active' ? 'Create project' : undefined}
          actionHref={status === 'active' ? '?modal=new-project' : undefined}
        />
      ) : (
        <ul
          aria-busy={isPending}
          className={cn(
            'divide-y divide-border rounded-lg border border-border bg-card overflow-hidden',
            isPending && 'opacity-60',
          )}
        >
          {projects.map((project) => {
            const label = STATUS_LABEL[project.status] ?? IN_PROGRESS_LABEL
            const color = STATUS_COLOR[project.status] ?? IN_PROGRESS_COLOR
            const clientName = project.client?.name
            return (
              <li key={project.id} className="flex items-center justify-between h-10 px-4 hover:bg-[var(--glass-bg-light)] transition-colors group">
                <Link href={`/projects/${project.id}`} className="flex flex-col min-w-0 flex-1">
                  <span className="text-sm font-medium truncate group-hover:text-foreground">
                    {project.name}
                  </span>
                  {clientName && (
                    <span className="text-xs text-muted-foreground truncate">{clientName}</span>
                  )}
                </Link>
                <div className="flex items-center gap-4 shrink-0 ml-4">
                  <span className="text-xs text-muted-foreground">
                    {new Date(project.created_at).toLocaleDateString('en-US', {
                      month: 'short', day: 'numeric', year: 'numeric',
                    })}
                  </span>
                  <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', color)}>
                    {label}
                  </span>
                  <ProjectRowActions
                    projectId={project.id}
                    projectName={project.name}
                    status={status}
                  />
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

Empty-state copy + EmptyState component already accepts undefined actionLabel/actionHref —
checked in components/clients/client-list.tsx usage. If EmptyState requires actionLabel to be
non-undefined, replace the props with conditional rendering.
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | head -40 ; node -e "const s=require('fs').readFileSync('app/(app)/projects/page.tsx','utf8'); if (!s.includes('searchParams: Promise') || !s.includes('ProjectsPageShell')) { console.error('page.tsx missing searchParams or shell'); process.exit(1); } const t=require('fs').readFileSync('components/projects/projects-page-shell.tsx','utf8'); if (!t.includes(\"'use client'\") || !t.includes('TabsList') || !t.includes('SelectTrigger')) { console.error('shell missing client/Tabs/Select'); process.exit(1); } console.log('list+shell ok');"</automated>
  </verify>
  <done>Page reads `searchParams.status` and `searchParams.client`, fetches via `getProjectsForListPage` + `getClients` in parallel; ProjectsPageShell renders Tabs + Select in header and project list; URL updates on tab/select change via `router.push`; `tsc --noEmit` clean.</done>
</task>

<task type="auto">
  <name>Task 5: Per-row DropdownMenu with status-contextual actions + AlertDialog for permanent delete</name>
  <files>components/projects/project-row-actions.tsx</files>
  <action>
Create a new client component. Each row receives `{ projectId, projectName, status }`. The menu items
differ per tab:

- `active`   → "Archive", "Delete"  (Delete = soft delete)
- `archived` → "Unarchive", "Delete"  (Delete = soft delete)
- `trash`    → "Restore", "Delete permanently"  (the destructive one is gated by AlertDialog)

Mirror the DropdownMenu + AlertDialog usage from `components/clients/client-list.tsx` (already
the reference pattern in this codebase). Use `sonner` for toasts (same as client-list.tsx).
Use `useTransition` to keep clicks responsive; call `router.refresh()` after success.

```typescript
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  archiveProjectAction,
  unarchiveProjectAction,
  softDeleteProjectAction,
  restoreProjectAction,
  hardDeleteProjectAction,
} from '@/lib/actions/project'
import type { ProjectListStatus } from '@/lib/queries/project'

interface Props {
  projectId: string
  projectName: string
  status: ProjectListStatus
}

export function ProjectRowActions({ projectId, projectName, status }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [confirmOpen, setConfirmOpen] = useState(false)

  function run(
    action: () => Promise<{ data?: unknown; error?: string }>,
    successMsg: string,
  ) {
    startTransition(async () => {
      const result = await action()
      if (result.error) toast.error(result.error)
      else {
        toast.success(successMsg)
        router.refresh()
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => e.stopPropagation()}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          {status === 'active' && (
            <>
              <DropdownMenuItem
                disabled={isPending}
                onClick={() => run(() => archiveProjectAction(projectId), `"${projectName}" archived`)}
              >
                Archive
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                disabled={isPending}
                onClick={() => run(() => softDeleteProjectAction(projectId), `"${projectName}" moved to Trash`)}
              >
                Delete
              </DropdownMenuItem>
            </>
          )}
          {status === 'archived' && (
            <>
              <DropdownMenuItem
                disabled={isPending}
                onClick={() => run(() => unarchiveProjectAction(projectId), `"${projectName}" unarchived`)}
              >
                Unarchive
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                disabled={isPending}
                onClick={() => run(() => softDeleteProjectAction(projectId), `"${projectName}" moved to Trash`)}
              >
                Delete
              </DropdownMenuItem>
            </>
          )}
          {status === 'trash' && (
            <>
              <DropdownMenuItem
                disabled={isPending}
                onClick={() => run(() => restoreProjectAction(projectId), `"${projectName}" restored`)}
              >
                Restore
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                disabled={isPending}
                onClick={() => setConfirmOpen(true)}
              >
                Delete permanently
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete project?</AlertDialogTitle>
            <AlertDialogDescription>
              {`"${projectName}" will be permanently deleted along with all its recordings, photos, estimates, and activity. This action cannot be undone.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                run(() => hardDeleteProjectAction(projectId), `"${projectName}" permanently deleted`)
                setConfirmOpen(false)
              }}
            >
              {isPending ? 'Deleting...' : 'Delete permanently'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
```

Critical: the DropdownMenu trigger button uses `onClick={(e) => e.stopPropagation()}` so it does
NOT bubble up to the row Link (the existing row is `<Link>` wrapping the whole thing — without
stopPropagation, clicking the kebab would navigate to the project). Same pattern applied to the
DropdownMenuContent. The trigger should be rendered as a sibling of the row Link (it is — see
Task 4 shell layout: `<Link>...</Link><div>... <ProjectRowActions/></div>`).
  </action>
  <verify>
    <automated>npx tsc --noEmit -p tsconfig.json 2>&1 | head -40 ; node -e "const s=require('fs').readFileSync('components/projects/project-row-actions.tsx','utf8'); for (const tok of [\"'use client'\",'AlertDialog','archiveProjectAction','unarchiveProjectAction','softDeleteProjectAction','restoreProjectAction','hardDeleteProjectAction','stopPropagation']) if (!s.includes(tok)) { console.error('MISSING:',tok); process.exit(1); } console.log('row-actions ok');"</automated>
  </verify>
  <done>Component renders status-contextual menu items; permanent delete is gated by AlertDialog; uses sonner for toasts; uses useTransition + router.refresh(); onClick bubble is stopped so kebab clicks don't navigate; `tsc --noEmit` clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 6: Inngest cleanup-trash daily cron (TDD RED→GREEN, mirrors cleanup-audio)</name>
  <files>tests/unit/inngest/cleanup-trash-job.test.ts, lib/inngest/functions/cleanup-trash.ts, lib/inngest/functions/index.ts, app/api/inngest/route.ts</files>
  <behavior>
    - Test 1 (happy path): runCleanupTrash with 3 stale rows → { deleted: 3, errors: 0 }; svc.from('projects') called; .lt('deleted_at', ISO) cutoff is now − 30 days (±5s); .delete().eq('id', id) called per row; .not('deleted_at','is',null) defensive filter applied.
    - Test 2 (no stale rows): empty result → { deleted: 0, errors: 0 }; no .delete() invocations.
    - Test 3 (per-row failure tolerated): 2nd of 3 rows returns delete error → { deleted: 2, errors: 1 }; loop continues; warn logged.
    - Test 4 (SELECT error best-effort): select returns error → { deleted: 0, errors: 0 }; no throw; warn logged.
    - Test 5 (function config): cleanupTrashJob.opts.id === 'cleanup-trash'; cron === '0 5 * * *' (one hour after cleanup-audio's 04:00 so the two crons don't collide on a single Inngest worker).
    - Test 6 (body shape): source file contains `step.run('hard-delete-trashed-projects', ...)`; no direct `supabase.storage` references (no Storage involvement here, but we keep the assertion as a tripwire).
    - Test 7 (registration): app/api/inngest/route.ts imports `cleanupTrashJob` and includes it in the `serve()` `functions` array.
  </behavior>
  <action>
**Sub-step 6a (RED) — write the failing test FIRST and commit.**

Create `tests/unit/inngest/cleanup-trash-job.test.ts` — mirror `tests/unit/inngest/cleanup-audio-job.test.ts`
exactly, but adapted for `projects` table and the trash semantics (no Storage). Key changes:

- `vi.mock('@/lib/storage', ...)` is NOT needed (cleanup-trash never touches Storage).
- `makeSvc` returns a chain that supports `.select().lt().not()` for SELECT and `.delete().eq()` for DELETE
  (where `cleanup-audio` used `.update().eq()`, this uses `.delete().eq()`).
- The query under test uses `.lt('deleted_at', isoCutoff).not('deleted_at', 'is', null)` (30-day cutoff).
- File-existence test: `readFileSync('lib/inngest/functions/cleanup-trash.ts')`.
- Step name: `step.run\(['"]hard-delete-trashed-projects['"]\)`.
- Registration test: route.ts must contain `/cleanupTrashJob/`.

Skeleton (copy/adapt from cleanup-audio-job.test.ts):

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('@/lib/supabase/service', () => ({ requireServiceClient: vi.fn() }))

import { runCleanupTrash, cleanupTrashJob } from '@/lib/inngest/functions/cleanup-trash'

function makeSvc(opts: {
  rows: Array<{ id: string }> | null
  selectError?: { message: string } | null
  deleteErrorForIds?: Set<string>
}) {
  const deleteCalls: string[] = []
  const selectChain: Record<string, unknown> = {}
  selectChain.lt = vi.fn().mockReturnValue(selectChain)
  selectChain.not = vi.fn().mockResolvedValue({
    data: opts.rows, error: opts.selectError ?? null,
  })

  return {
    from: vi.fn().mockImplementation((_table: string) => ({
      select: vi.fn().mockReturnValue(selectChain),
      delete: vi.fn(() => ({
        eq: vi.fn((_col: string, id: string) => {
          deleteCalls.push(id)
          if (opts.deleteErrorForIds?.has(id)) {
            return Promise.resolve({ data: null, error: { message: 'rls denied' } })
          }
          return Promise.resolve({ data: null, error: null })
        }),
      })),
    })),
    __deleteCalls: deleteCalls,
    __selectChain: selectChain,
  }
}

describe('QUICK-LHP-CRON-01: runCleanupTrash', () => {
  beforeEach(() => vi.clearAllMocks())

  it('happy path: 3 stale rows → { deleted: 3, errors: 0 }', async () => {
    const svc = makeSvc({ rows: [{ id: 'p-1' }, { id: 'p-2' }, { id: 'p-3' }] })
    const result = await runCleanupTrash(svc as never)
    expect(result).toEqual({ deleted: 3, errors: 0 })
    expect(svc.from).toHaveBeenCalledWith('projects')
    expect(svc.__selectChain.lt).toHaveBeenCalledWith('deleted_at', expect.any(String))
    const cutoff = new Date((svc.__selectChain.lt as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string).getTime()
    expect(Math.abs(cutoff - (Date.now() - 30 * 24 * 60 * 60 * 1000))).toBeLessThan(5_000)
    expect(svc.__deleteCalls.sort()).toEqual(['p-1', 'p-2', 'p-3'])
  })

  it('no stale rows: → { deleted: 0, errors: 0 }', async () => {
    const svc = makeSvc({ rows: [] })
    const result = await runCleanupTrash(svc as never)
    expect(result).toEqual({ deleted: 0, errors: 0 })
    expect(svc.__deleteCalls).toEqual([])
  })

  it('per-row delete failure tolerated → { deleted: 2, errors: 1 }', async () => {
    const svc = makeSvc({
      rows: [{ id: 'p-a' }, { id: 'p-b' }, { id: 'p-c' }],
      deleteErrorForIds: new Set(['p-b']),
    })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await runCleanupTrash(svc as never)
    expect(result).toEqual({ deleted: 2, errors: 1 })
    warn.mockRestore()
  })

  it('SELECT error → { deleted: 0, errors: 0 } (no throw)', async () => {
    const svc = makeSvc({ rows: null, selectError: { message: 'rls denied' } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await runCleanupTrash(svc as never)
    expect(result).toEqual({ deleted: 0, errors: 0 })
    expect(svc.__deleteCalls).toEqual([])
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('QUICK-LHP-CRON-01: cleanupTrashJob config', () => {
  type FnInternals = { opts: { id: string; triggers?: Array<{ cron?: string }> } }
  it('id="cleanup-trash", cron="0 5 * * *"', () => {
    const fn = cleanupTrashJob as unknown as FnInternals
    expect(fn.opts.id).toBe('cleanup-trash')
    expect(fn.opts.triggers).toContainEqual({ cron: '0 5 * * *' })
  })
  it('body wraps work in step.run("hard-delete-trashed-projects", ...) and uses no supabase.storage', () => {
    const src = readFileSync(resolve(process.cwd(), 'lib/inngest/functions/cleanup-trash.ts'), 'utf8')
    expect(src).toMatch(/step\.run\(['"]hard-delete-trashed-projects['"]/)
    expect(src).not.toMatch(/supabase\.storage/)
  })
})

describe('QUICK-LHP-CRON-01: registered in serve()', () => {
  it('app/api/inngest/route.ts includes cleanupTrashJob', () => {
    const src = readFileSync(resolve(process.cwd(), 'app/api/inngest/route.ts'), 'utf8')
    expect(src).toMatch(/cleanupTrashJob/)
  })
})
```

Run `bunx vitest run tests/unit/inngest/cleanup-trash-job.test.ts` — MUST fail (module not found).
Commit: `test(quick-260522-lhp): add failing tests for cleanup-trash Inngest job`.

**Sub-step 6b (GREEN) — implement the production code.**

Create `lib/inngest/functions/cleanup-trash.ts`. Mirror `cleanup-audio.ts` structure exactly:
pure helper + Inngest wrapper. Cron is `0 5 * * *` (one hour after cleanup-audio's `0 4 * * *`).
Best-effort: per-row try/catch, never throw.

```typescript
/**
 * Quick task 260522-lhp (QUICK-LHP-CRON-01) — Projects trash auto-purge cron.
 *
 * Daily at 05:00 UTC, hard-deletes `projects` rows whose `deleted_at` is more
 * than 30 days in the past. Cascades via existing ON DELETE CASCADE FKs to
 * recordings, photos, estimates, estimate_sections, estimate_items, and
 * estimate_activity (see 20260409000001_initial_schema.sql).
 *
 * Mirrors the cleanup-audio pattern (commit 379d689, quick-260522-kf2):
 *   - pure helper `runCleanupTrash(svc)` for testability
 *   - Inngest function body wrapped in `step.run('hard-delete-trashed-projects', ...)`
 *   - best-effort: SELECT failure returns {deleted:0, errors:0} (no throw);
 *     per-row DELETE failures are counted in `errors` and the loop continues
 *   - cron offset to 05:00 so it doesn't collide with cleanup-audio at 04:00
 */
import { inngest } from '@/lib/inngest/client'
import { requireServiceClient } from '@/lib/supabase/service'

type ServiceClientLike = ReturnType<typeof requireServiceClient>

export interface CleanupTrashResult {
  deleted: number
  errors: number
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000

export async function runCleanupTrash(
  svc: ServiceClientLike,
): Promise<CleanupTrashResult> {
  const cutoffIso = new Date(Date.now() - THIRTY_DAYS_MS).toISOString()

  // SELECT trashed projects past the 30-day TTL.
  // The .not('deleted_at','is',null) filter is defense-in-depth — .lt() already
  // excludes NULLs but explicit is clearer + matches cleanup-audio's style.
  const { data: rows, error: selectErr } = await svc
    .from('projects')
    .select('id')
    .lt('deleted_at', cutoffIso)
    .not('deleted_at', 'is', null)

  if (selectErr) {
    console.warn('[cleanup-trash] select failed:', selectErr.message)
    return { deleted: 0, errors: 0 }
  }

  const stale = (rows ?? []) as Array<{ id: string }>
  let deleted = 0
  let errors = 0

  for (const row of stale) {
    try {
      const { error: deleteErr } = await svc
        .from('projects')
        .delete()
        .eq('id', row.id)
      if (deleteErr) {
        console.warn('[cleanup-trash] delete failed for', row.id, deleteErr.message)
        errors += 1
      } else {
        deleted += 1
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[cleanup-trash] unexpected error for', row.id, msg)
      errors += 1
    }
  }

  return { deleted, errors }
}

export const cleanupTrashJob = inngest.createFunction(
  {
    id: 'cleanup-trash',
    triggers: [{ cron: '0 5 * * *' }],
  },
  async ({ step }) => {
    return step.run('hard-delete-trashed-projects', async () => {
      const svc = requireServiceClient()
      return runCleanupTrash(svc)
    })
  },
)
```

Update `lib/inngest/functions/index.ts` — append one export line:

```typescript
// Quick task 260522-lhp — daily projects trash purge (30-day TTL).
export { cleanupTrashJob } from './cleanup-trash'
```

Update `app/api/inngest/route.ts` — add `cleanupTrashJob` to the import list and to the `functions`
array (place it right after `cleanupAudioJob`).

Run `bunx vitest run tests/unit/inngest/cleanup-trash-job.test.ts` — MUST pass.
Commit: `feat(quick-260522-lhp): add daily cleanup-trash Inngest job (30-day TTL)`.

**Local-dev landmines (from xtimator-inngest-local-dev memory):**
The 3 documented landmines (proxy.ts bypass, INNGEST_DEV=1, signing-key placeholder) are already
navigated by the cleanup-audio job which uses identical `inngest.createFunction` + cron-trigger
shape. By mirroring that file structurally we inherit the working setup — no new env or proxy
changes needed.
  </action>
  <verify>
    <automated>bunx vitest run tests/unit/inngest/cleanup-trash-job.test.ts --reporter=basic 2>&1 | tail -20</automated>
  </verify>
  <done>Test file committed RED, then production code committed GREEN; all 7 test cases pass; `cleanupTrashJob` registered in `lib/inngest/functions/index.ts` barrel and in `app/api/inngest/route.ts` `serve()` functions array; cron is `0 5 * * *`; no direct Supabase storage references; best-effort error handling (never throws).</done>
</task>

</tasks>

<verification>
End-to-end phase check (manual, after all 6 tasks ship):

1. `bunx supabase db push --db-url $DATABASE_URL` (or `apply_migration` via Supabase MCP).
   Verify in psql: `\d projects` shows `archived_at` and `deleted_at` columns + 2 partial indexes.
2. `npx tsc --noEmit -p tsconfig.json` — clean.
3. `bunx vitest run tests/unit/inngest/cleanup-trash-job.test.ts` — green.
4. `bunx vitest run` — full suite green (no existing test regressions).
5. `bun run build` (or `next build`) — builds without errors.
6. Manual smoke on `/projects`:
   a. Default URL shows Active tab; no archived/trashed rows visible.
   b. Switch to Archived tab → URL becomes `/projects?status=archived`; only archived rows visible.
   c. Switch to Trash tab → URL becomes `/projects?status=trash`; only soft-deleted rows visible.
   d. Pick a client in the Select → URL becomes `/projects?status=...&client=<uuid>`; rows filter by client.
   e. On an Active project: kebab → Archive → toast "...archived" → row gone from Active, appears under Archived.
   f. On an Archived project: kebab → Unarchive → row returns to Active.
   g. On an Active or Archived project: kebab → Delete → row appears under Trash.
   h. On a Trash project: kebab → Restore → row returns to Active (or Archived if it was archived before delete).
   i. On a Trash project: kebab → Delete permanently → AlertDialog opens → Confirm → row gone for good (recordings/photos/estimates cascaded).
7. Inngest local dev:
   - With INNGEST_DEV=1 and the dev server running, the cleanup-trash function appears in the Inngest dev UI alongside cleanup-audio.
   - Manually invoke via the Inngest dev UI; with no stale rows the result is `{ deleted: 0, errors: 0 }`.

Cross-tenant safety check (smoke — no test required for quick):
- Create a second user/company; soft-delete a project as user A; sign in as user B; visit
  `/projects?status=trash` — user B sees only their own trash (RLS scoping unchanged).
</verification>

<success_criteria>
- Migration committed with 2 new nullable columns + 2 partial indexes on `projects`; no RLS policy changes.
- 5 new server actions exported from `lib/actions/project.ts`, each using `getAuthContext()`; archive guards with `.is('deleted_at',null)`; hardDelete guards with `.not('deleted_at','is',null)`; revalidates `/projects`, `/dashboard`, and `/` layout.
- `lib/queries/project.ts` exports `getProjectsForListPage` (3 status branches + optional client filter) and `ProjectListStatus` type; existing exports untouched.
- `/projects` page is search-params driven (`status`, `client`); reads via `await searchParams` (Next.js 16 pattern); fetches projects + clients in parallel.
- New `ProjectsPageShell` client component renders shadcn `Tabs` (Active/Archived/Trash) + shadcn `Select` (client filter) in the header; navigates via `router.push` + `useTransition`.
- New `ProjectRowActions` client component renders status-contextual `DropdownMenu`; permanent delete is gated by `AlertDialog`; uses `sonner` toasts + `router.refresh()`.
- `cleanup-trash` Inngest function exists at `lib/inngest/functions/cleanup-trash.ts` with cron `0 5 * * *`, wrapped in `step.run('hard-delete-trashed-projects', ...)`, mirroring `cleanup-audio.ts` shape; registered in `index.ts` barrel and `app/api/inngest/route.ts` `serve()`.
- Vitest unit tests (TDD RED→GREEN) covering 4 runCleanupTrash scenarios + cleanupTrashJob config + serve() registration — all green.
- `npx tsc --noEmit` clean. Full vitest suite green. `next build` clean.
- No secrets committed (placeholders only in any documentation comments).
</success_criteria>

<output>
After completion, create `.planning/quick/260522-lhp-project-management-filter-by-client-arch/260522-lhp-SUMMARY.md`
documenting:
  - What shipped (the 6 task outputs)
  - Decisions: 30-day TTL on trash; cron at 05:00 to offset from cleanup-audio at 04:00; archived_at
    is preserved through soft-delete + restore (intentional — restoring brings the row back to where
    it was); D-08 ("hard-delete only") explicitly overridden for projects only per user feedback memory.
  - Any deviations from this plan.
  - Follow-ups (e.g. UAT tasks, multi-tenant smoke test once v4.0 multi-tenancy lands).
</output>
