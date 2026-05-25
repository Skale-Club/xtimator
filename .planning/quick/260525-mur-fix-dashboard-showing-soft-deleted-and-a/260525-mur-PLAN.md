---
phase: quick-260525-mur
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/queries/dashboard.ts
autonomous: true
requirements:
  - QUICK-MUR-01
must_haves:
  truths:
    - "Recent Projects list on /dashboard hides projects whose deleted_at IS NOT NULL"
    - "Recent Projects list on /dashboard hides projects whose archived_at IS NOT NULL"
    - "totalProjects stat card on /dashboard counts only active projects (archived_at IS NULL AND deleted_at IS NULL)"
    - "Active /projects view and /dashboard agree on which projects are active (same filter chain)"
  artifacts:
    - path: "lib/queries/dashboard.ts"
      provides: "getProjects + getDashboardStats both filter out archived and soft-deleted rows"
      contains: ".is('archived_at', null)"
  key_links:
    - from: "lib/queries/dashboard.ts (getProjects)"
      to: "projects table"
      via: ".is('archived_at', null).is('deleted_at', null) on .from('projects').select(...)"
      pattern: "is\\('archived_at', null\\)\\.is\\('deleted_at', null\\)"
    - from: "lib/queries/dashboard.ts (getDashboardStats totalProjects branch)"
      to: "projects table count query"
      via: ".is('archived_at', null).is('deleted_at', null) on the count('exact') query"
      pattern: "is\\('archived_at', null\\)\\.is\\('deleted_at', null\\)"
---

<objective>
Fix the dashboard so soft-deleted and archived projects no longer appear in the Recent Projects list or get counted in the totalProjects stat card.

Purpose: When a user soft-deletes a project (`softDeleteProjectAction` sets `deleted_at`), it correctly disappears from `/projects` (active view) but still shows up on `/dashboard` because the dashboard queries filter only by `company_id`. Same problem for archived projects. The active view on `/projects` (`getProjectsForListPage` with `status: 'active'`) already does the right thing via `.is('archived_at', null).is('deleted_at', null)` — we're aligning the dashboard with that semantic.

Output: `lib/queries/dashboard.ts` modified in two places (count query in `getDashboardStats` + select chain in `getProjects`) so the dashboard's "active projects" view matches `/projects`'s active filter.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- Reference filter pattern from lib/queries/project.ts:170-171 (getProjectsForListPage 'active' branch) -->
<!-- The dashboard must apply this exact same filter chain to match active-view semantics -->

From lib/queries/project.ts (line 170-171, active-view filter):
```typescript
if (opts.status === 'active') {
  q = q.is('archived_at', null).is('deleted_at', null)
}
```

Current state of lib/queries/dashboard.ts (the two query chains to patch):

```typescript
// lib/queries/dashboard.ts:29-32 — totalProjects count (BROKEN: no soft-delete/archive filter)
const { count: totalProjects } = await supabase
  .from('projects')
  .select('*', { count: 'exact', head: true })
  .eq('company_id', companyId)

// lib/queries/dashboard.ts:79-87 — Recent Projects list (BROKEN: no soft-delete/archive filter)
const { data } = await supabase
  .from('projects')
  .select(
    `id, name, project_type, status, total, created_at,
     client:clients(id, name),
     estimates!estimates_project_id_fkey(payment_status, paid_at, currency_code, is_current)`
  )
  .eq('company_id', companyId)
  .order('created_at', { ascending: false })
```

Server action that triggers the bug (lib/actions/project.ts:265-282):
```typescript
export async function softDeleteProjectAction(projectId: string) {
  // ... sets deleted_at = new Date().toISOString()
  // revalidatePath('/dashboard') is already called — once the query is fixed, the row will vanish
}
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add active-row filter to both dashboard queries</name>
  <files>lib/queries/dashboard.ts</files>
  <action>
Edit `lib/queries/dashboard.ts` in exactly two places. Mirror the active-view filter from `lib/queries/project.ts:170-171` (`.is('archived_at', null).is('deleted_at', null)`) so the dashboard semantically matches `/projects`'s Active tab.

**Change 1 — `getDashboardStats` totalProjects count query (lines 28-32):**

Before:
```typescript
// Total projects
const { count: totalProjects } = await supabase
  .from('projects')
  .select('*', { count: 'exact', head: true })
  .eq('company_id', companyId)
```

After:
```typescript
// Total active projects (exclude archived + trashed; mirrors /projects "Active" view filter
// from getProjectsForListPage in lib/queries/project.ts).
const { count: totalProjects } = await supabase
  .from('projects')
  .select('*', { count: 'exact', head: true })
  .eq('company_id', companyId)
  .is('archived_at', null)
  .is('deleted_at', null)
```

**Change 2 — `getProjects` Recent Projects select chain (lines 79-87):**

Before:
```typescript
const { data } = await supabase
  .from('projects')
  .select(
    `id, name, project_type, status, total, created_at,
     client:clients(id, name),
     estimates!estimates_project_id_fkey(payment_status, paid_at, currency_code, is_current)`
  )
  .eq('company_id', companyId)
  .order('created_at', { ascending: false })
```

After (add the two `.is(...)` clauses after `.eq('company_id', ...)` and before `.order(...)` to match the chain ordering used in `lib/queries/project.ts`):
```typescript
const { data } = await supabase
  .from('projects')
  .select(
    `id, name, project_type, status, total, created_at,
     client:clients(id, name),
     estimates!estimates_project_id_fkey(payment_status, paid_at, currency_code, is_current)`
  )
  .eq('company_id', companyId)
  .is('archived_at', null)
  .is('deleted_at', null)
  .order('created_at', { ascending: false })
```

**Constraints / do NOT do:**
- Do NOT modify the estimates-stats branches (`pendingEstimates`, `acceptedEstimates`, `totalRevenue`). Those filter by `is_current` + `client_response` and are out of scope per the bug context — an estimate tied to a deleted project is still a real signal of past work, and the user did not raise that.
- Do NOT add a new `archived_at` / `deleted_at` column to the `select(...)` projection in `getProjects` — they are filter-only; the `ProjectWithClient` return type does not need them.
- Do NOT change the `ProjectWithClient` interface — payload shape is unchanged.
- Do NOT touch the `.eq('company_id', companyId)` clause — RLS already scopes by company, but the explicit eq is kept to hit indexes (see comment style in `lib/queries/project.ts`).
- Do NOT add tests/migration/UI changes. This is a 4-line behavior fix in one file.

**Why no defensive `.not('deleted_at', 'is', null)` on the trash-view side here:** the dashboard has no trash view; it only shows active. The two `.is(..., null)` filters are sufficient.
  </action>
  <verify>
    <automated>node -e "const s = require('fs').readFileSync('lib/queries/dashboard.ts', 'utf8'); const hits = (s.match(/\.is\('archived_at', null\)\s*\.is\('deleted_at', null\)/g) || []).length; if (hits !== 2) { console.error('FAIL: expected 2 occurrences of active-row filter chain, got ' + hits); process.exit(1); } console.log('OK: 2 active-row filter chains present');"</automated>
    <manual>
1. Run `bunx tsc --noEmit` (or `npx tsc --noEmit`) — must report 0 errors. The change is type-neutral; any TS error here means the edit broke the file.
2. (Optional, requires a known soft-deleted project) In Supabase SQL editor or psql, pick a project where `deleted_at IS NOT NULL` for the current user's company. Load `/dashboard` in the browser. Confirm:
   - That project is NOT in the Recent Projects list.
   - The "Total Projects" stat card count equals the count from `SELECT count(*) FROM projects WHERE company_id = '<id>' AND archived_at IS NULL AND deleted_at IS NULL;`.
3. (Optional, end-to-end) On `/projects` (Active tab), soft-delete a project via the row's Delete action, then navigate to `/dashboard`. Confirm the project does not appear in Recent Projects and the count dropped by exactly 1.
    </manual>
  </verify>
  <done>
- `lib/queries/dashboard.ts` contains exactly two `.is('archived_at', null).is('deleted_at', null)` chains: one in the `totalProjects` count query, one in the `getProjects` select chain.
- TypeScript compiles cleanly (`tsc --noEmit` exits 0).
- Manual smoke (if a soft-deleted project exists in the dev database) confirms the row no longer appears on `/dashboard` and is not counted in the totalProjects stat.
- No other queries, components, types, or files are modified.
  </done>
</task>

</tasks>

<verification>
Phase-level checks (single-task plan, so identical to task verification):

1. **Static check** — grep confirms both query chains are filtered:
   ```
   grep -n "is('archived_at', null)" lib/queries/dashboard.ts  # expect exactly 2 hits
   grep -n "is('deleted_at', null)"  lib/queries/dashboard.ts  # expect exactly 2 hits
   ```
2. **Type check** — `bunx tsc --noEmit` exits 0.
3. **Behavioral parity** — `/dashboard` Recent Projects and `/projects` (Active tab) show the same set of projects (modulo limit/ordering — both order by `created_at DESC`).
4. **No collateral changes** — `git diff --stat` shows only `lib/queries/dashboard.ts` modified.
</verification>

<success_criteria>
- A project with `deleted_at IS NOT NULL` does not appear in the Recent Projects list on `/dashboard`.
- A project with `archived_at IS NOT NULL` (and `deleted_at IS NULL`) does not appear in the Recent Projects list on `/dashboard`.
- The "Total Projects" stat card on `/dashboard` equals `count(projects WHERE company_id = $1 AND archived_at IS NULL AND deleted_at IS NULL)`.
- `softDeleteProjectAction` already calls `revalidatePath('/dashboard')`, so the fix takes effect immediately after delete with no additional wiring.
- `tsc --noEmit` passes; no other files changed.
</success_criteria>

<output>
After completion, create `.planning/quick/260525-mur-fix-dashboard-showing-soft-deleted-and-a/260525-mur-SUMMARY.md` summarizing:
- The two-line filter additions in `lib/queries/dashboard.ts`.
- Confirmation that dashboard active-view semantics now match `/projects` Active tab.
- Any pitfalls noted during execution (e.g., chain ordering, type surprises) — record as a decision in STATE.md if non-obvious.
</output>
