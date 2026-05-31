---
phase: quick-260525-mur
plan: 01
subsystem: database
tags: [supabase, postgres, dashboard, soft-delete, archive, query-filter]

# Dependency graph
requires:
  - phase: quick-260525-lt5
    provides: AlertDialog confirmation before soft-delete in ProjectRowActions (exposes the same soft-deleted rows that were leaking into /dashboard)
provides:
  - Dashboard Recent Projects list now filters out archived_at IS NOT NULL and deleted_at IS NOT NULL rows
  - Dashboard totalProjects stat card now counts only active projects (archived_at IS NULL AND deleted_at IS NULL)
  - /dashboard and /projects Active tab now agree on the definition of "active project" via the same filter chain
affects: [v4.0-multi-tenancy, future-trash-views, future-archived-views, dashboard-widgets]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mirror the active-view filter (.is('archived_at', null).is('deleted_at', null)) from lib/queries/project.ts:170-171 whenever a query needs to show 'active' projects only — keeps /dashboard, /projects, and future surfaces in lock-step on the active-row definition"

key-files:
  created: []
  modified:
    - lib/queries/dashboard.ts

key-decisions:
  - "Filter clauses placed after .eq('company_id', ...) and before .order(...) to match the chain ordering convention used in lib/queries/project.ts (active branch). Supabase JS is order-agnostic at runtime but consistent ordering keeps diffs/grep reliable."
  - "Did NOT modify the estimates-stats branches (pendingEstimates, acceptedEstimates, totalRevenue) — an estimate tied to a soft-deleted project is still a real business signal (past work). Scope-bounded to projects-table queries per the plan."
  - "Did NOT add archived_at/deleted_at to the getProjects select projection — they are filter-only columns; the ProjectWithClient return type is unchanged."

patterns-established:
  - "Active-row filter chain: any query that should match the /projects Active tab MUST chain .is('archived_at', null).is('deleted_at', null) immediately after .eq('company_id', ...)."

requirements-completed:
  - QUICK-MUR-01

# Metrics
duration: 4min
completed: 2026-05-25
---

# Quick 260525-mur: Fix Dashboard Showing Soft-Deleted and Archived Projects Summary

**Two-line surgical fix in lib/queries/dashboard.ts that hides archived + soft-deleted projects from the dashboard's Recent Projects list and totalProjects stat card by mirroring the active-view filter chain from lib/queries/project.ts.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-25T19:30:29Z
- **Completed:** 2026-05-25T19:34:21Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Dashboard Recent Projects no longer renders projects with `archived_at IS NOT NULL` or `deleted_at IS NOT NULL`
- "Total Projects" stat card on /dashboard now equals `count(projects WHERE company_id = $1 AND archived_at IS NULL AND deleted_at IS NULL)` — matches /projects Active tab
- softDeleteProjectAction (which already calls revalidatePath('/dashboard')) now produces the expected UX: trashed project disappears from dashboard the moment it's deleted

## Task Commits

Each task was committed atomically:

1. **Task 1: Add active-row filter to both dashboard queries** - `0a15842` (fix)

## Files Created/Modified
- `lib/queries/dashboard.ts` — Added `.is('archived_at', null).is('deleted_at', null)` to two query chains:
  - `getDashboardStats` totalProjects count query (after `.eq('company_id', ...)`, before the next stat block)
  - `getProjects` Recent Projects select chain (after `.eq('company_id', ...)`, before `.order('created_at', ...)`)

## Decisions Made
- Filter clauses ordered between `.eq('company_id', ...)` and `.order(...)` to match the chain layout in `lib/queries/project.ts:170-171`. PostgREST is order-agnostic at runtime; consistency exists for code-review and grep reliability.
- Comment on `getDashboardStats` totalProjects expanded ("Total active projects (exclude archived + trashed; mirrors /projects "Active" view filter from getProjectsForListPage in lib/queries/project.ts)") so future readers immediately see the active-view semantic alignment.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Windows worktree path duality (operator note, not a code issue):** The harness exposes two on-disk locations for the same logical file — the main project tree and the worktree branch checkout. Early Edit operations targeted the main-tree absolute path while git was operating on the worktree, producing a transient mismatch where the plan's verifier reported 0 hits on the worktree file. Resolved by re-applying both edits with the explicit worktree absolute path, then re-verifying. Final state: only the worktree file is modified (git status shows exactly `M lib/queries/dashboard.ts`), main tree is back to baseline, npx tsc --noEmit exits 0.
- **Plan's `node -e` verifier (Windows shell quoting):** The plan's inline `node -e "..."` regex check fails on Windows bash because single-quote escaping inside the `-e` argument collapses the regex literal. Worked around by writing the same script to a temp file (c:\tmp\verify-mur.cjs) and invoking it via `node c:/tmp/verify-mur.cjs`. The verification semantics are identical and the assertion passed (2 active-row filter chains present).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Quick task complete. No follow-up work required.
- Future dashboards/widgets that surface "active projects" should reuse the same `.is('archived_at', null).is('deleted_at', null)` filter chain to stay aligned with /projects Active tab semantics.

## Self-Check: PASSED

- Created files: N/A (task modified one existing file; no new files)
- Modified files:
  - `lib/queries/dashboard.ts` — FOUND (contains exactly 2 `.is('archived_at', null).is('deleted_at', null)` chains, 3872 bytes)
- Commits:
  - `0a15842` — FOUND (`fix(quick-260525-mur): hide archived + soft-deleted projects on dashboard`)
- Type check: `npx tsc --noEmit` → exit 0
- Static check: 2 active-row filter chains present (matches plan's `<verify automated>` assertion)
- Scope check: `git status --short` shows exactly `M lib/queries/dashboard.ts` — no collateral changes

---
*Phase: quick-260525-mur*
*Completed: 2026-05-25*
