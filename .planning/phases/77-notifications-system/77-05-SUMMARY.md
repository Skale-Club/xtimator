---
phase: 77-notifications-system
plan: 05
subsystem: notifications
tags: [ui, page, filter, pagination, search, parallel-wave-4]
requires: [77-01, 77-02, 77-03]
parallel_safe_with: [77-04]
provides:
  - /notifications full-page view (auth-gated, paginated, filtered)
  - components/notifications/NotificationList (client, search + pagination + empty states)
  - components/notifications/NotificationFilters (chips + unread toggle + search input, with CATEGORY_ICONS map)
  - lib/notifications/queries.ts → listNotificationsPage() server query helper
affects: []
tech-stack:
  added: []
  patterns:
    - Cursor pagination via URL search params (?cursor=ISO timestamp)
    - Server-side filter via URL search params (?category=&unread=1) — Next.js App Router shallow nav
    - Best-effort query (DB read failure → empty list, never throws)
    - twMerge-aware Card variant override (px-4 py-3 overrides Card's baked py-6)
key-files:
  created:
    - app/(app)/notifications/page.tsx
    - app/(app)/notifications/loading.tsx
    - components/notifications/NotificationList.tsx
    - components/notifications/NotificationFilters.tsx
    - lib/notifications/queries.ts
    - tests/unit/notifications/notifications-page.test.tsx
  modified: []
decisions:
  - Server-driven filter + pagination via URL search params instead of dedicated /api/notifications/page route. Reason: executor objective explicitly carved out /api/notifications/* as 77-04's scope. Using App Router search params + RSC re-render is cleaner anyway — no JSON fetch dance, no client useEffect for refetch, automatic Suspense via loading.tsx.
  - Pin/unpin and mark-read interactions deferred to 77-04 (it owns the /api/notifications/[id]/read and /pin endpoints). NotificationList renders link clicks as plain navigation; the row's `data-unread` attribute is the surface 77-04 can hook into to mark read via fetch.
  - Empty state messages tailored per active filter combo (4 variants): default, unread only, category only, unread + category. Each variant covered by a dedicated unit test.
  - Plan's request for inline NotificationItem dedup with 77-04 sidestepped by writing a self-contained NotificationRow inside NotificationList — 77-04's NotificationItem can be swapped in later via Edit without changing the list's contract.
  - All commits --no-verify per parallel-mode instruction (executor objective).
metrics:
  duration_minutes: 8
  tasks_completed: 3
  files_created: 6
  files_modified: 0
  commits: 1
  completed_date: 2026-05-20
requirements: [NOTIF-06, NOTIF-12]
---

# Phase 77 Plan 05: /notifications Full-Page View Summary

**One-liner:** Ships `/notifications` deep-dive surface with 8 category chips + unread toggle + client-side search + cursor pagination — server-driven via URL search params (no extra API route needed).

## Tasks Executed

| Task | Name                                                          | Commit    | Files                                                                                                                                                                |
| ---- | ------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | listNotificationsPage server query (cursor + category + unread) | `f3417e3` | `lib/notifications/queries.ts`                                                                                                                                       |
| 2    | Page (server) + List + Filters + loading skeleton + 10 tests  | `f3417e3` | `app/(app)/notifications/page.tsx`, `app/(app)/notifications/loading.tsx`, `components/notifications/NotificationList.tsx`, `components/notifications/NotificationFilters.tsx`, `tests/unit/notifications/notifications-page.test.tsx` |
| 3    | Commit `--no-verify` (parallel mode)                          | `f3417e3` | (combined)                                                                                                                                                           |

Single commit per parallel-mode `--no-verify` instruction; per-task split would have produced three near-empty commits.

## Route Contract

```
GET /notifications
  ?category=<estimate|payment|trial|quota|whatsapp|ai_job|admin|system>
  &unread=1
  &cursor=<ISO created_at>
```

- All params optional. Unknown `category` is ignored (falls back to "All").
- `cursor` is reset on any filter change (handled inside NotificationFilters).
- Server-component re-renders on URL change; loading.tsx skeleton ships during transition.

## listNotificationsPage() Signature (for reuse)

```ts
import { listNotificationsPage } from '@/lib/notifications/queries'

await listNotificationsPage({
  companyId: string,
  userId: string,
  category?: EventCategory | null,
  unreadOnly?: boolean,
  cursor?: string | null,   // ISO created_at; rows older than this returned
  limit?: number,           // default 50, max 100
}): Promise<{
  items: NotificationRow[],
  nextCursor: string | null,
}>
```

- Scopes to `company_id = $1 AND (user_id IS NULL OR user_id = $2)` — same RLS shape as 77-04 will use.
- Orders by `pinned DESC, created_at DESC`.
- Fetches `limit+1` rows to derive `nextCursor` without a count query.
- Best-effort: DB error logged as console.warn, returns `{ items: [], nextCursor: null }` (never throws).
- `category` filter expands to `event_type IN (…)` via `EVENT_CATEGORIES` map — single source of truth, no enum duplication.

## Parallel Run with 77-04 — Confirmation

**Zero file overlap.** Scope split:

| Surface                                          | Owner |
| ------------------------------------------------ | ----- |
| `app/(app)/notifications/page.tsx`               | 77-05 |
| `app/(app)/notifications/loading.tsx`            | 77-05 |
| `components/notifications/NotificationList.tsx`  | 77-05 |
| `components/notifications/NotificationFilters.tsx` | 77-05 |
| `lib/notifications/queries.ts`                   | 77-05 |
| `components/notifications/NotificationBell.tsx`  | 77-04 |
| `components/notifications/NotificationPanel.tsx` | 77-04 |
| `components/notifications/notification-item.tsx` | 77-04 |
| `components/notifications/use-notifications.ts`  | 77-04 |
| `components/app-shell/topbar.tsx`                | 77-04 |
| `app/api/notifications/**` routes                | 77-04 |

`git status --short` after staging confirmed only the 6 listed files were touched; no overlap with 77-04's tree.

## Verification Results

| Check                                                  | Result                              |
| ------------------------------------------------------ | ----------------------------------- |
| `npx tsc --noEmit`                                     | Clean                                |
| `npx vitest run tests/unit/notifications/notifications-page.test.tsx` | 10/10 GREEN |
| `npx vitest run tests/unit/notifications/` (full suite) | 42/42 GREEN (32 prior + 10 new)     |
| `git log -1 --pretty=format:'%s'`                      | `feat(77-05): /notifications full-page view with filter + search + pagination` |
| `git status --short` post-commit (scope)               | Only my 6 files staged (no 77-04 collision) |

## Deviations from Plan

### [Rule 3 — Scope] No /api/notifications/page or /api/notifications/[id]/pin route created

- **Found during:** Task 1 — reading executor objective
- **Issue:** Plan task 1 specified creating `app/api/notifications/page/route.ts` and `app/api/notifications/[id]/pin/route.ts`, but the executor's overriding objective explicitly excluded `/api/notifications/*` (owned by parallel plan 77-04).
- **Fix:** Implemented the same functionality without an API route. The page is a Next.js server component that reads URL search params (`?category=&unread=&cursor=`) and calls `listNotificationsPage` directly. Filter chip clicks `router.push()` to the same route with new params, triggering an RSC re-render with the `loading.tsx` skeleton in between. This is the idiomatic App Router pattern for filtered list pages and avoids a redundant JSON-fetch layer.
- **Files modified:** `app/(app)/notifications/page.tsx`, `components/notifications/NotificationFilters.tsx`, `components/notifications/NotificationList.tsx`
- **Trade-off:** Pin/unpin and mark-read interactions are deferred to 77-04's endpoints (which the bell panel will also use). NotificationList renders `data-unread` attributes on each row so 77-04's hooks can layer in.
- **Commit:** `f3417e3`

### [Process] Combined commit instead of three per-task commits

- **Reason:** Executor objective specified "parallel mode, `git commit --no-verify`" — three commits would all use `--no-verify` and bisectability across plans isn't applicable (tasks have no intermediate runnable state — Task 2 needs Task 1's `queries.ts` to typecheck).

### [Naming] PascalCase component file names retained per objective

- Plan suggested kebab-case (`notifications-client.tsx`); objective specified `NotificationList.tsx` and `NotificationFilters.tsx` (PascalCase). Followed objective.

## Known Stubs

**Pin toggle UI is render-only (no PATCH handler wired).** The `pinned` badge displays on rows where `pinned = true`, but there's no button to toggle it from the page yet. This is intentional — the PATCH `/api/notifications/[id]/pin` endpoint is in 77-04's scope. Pinned rows still sort first via the server query (`order('pinned', { ascending: false })`).

**Mark-read on row click is link-only navigation.** Clicking a row navigates to `link_url` but does NOT call `/api/notifications/[id]/read` from this client — 77-04 owns that endpoint and will layer the fetch into the shared NotificationList consumers when merged. The row's `data-unread` attribute is the integration surface.

Both stubs document themselves: the deferred work is concretely scoped to 77-04 endpoints that exist in parallel.

## Handoff to 77-04 Merge

When 77-04 lands its `/api/notifications/[id]/read` + `/pin` endpoints, layer them in without modifying NotificationList by:

1. Wrap the `<Link>` in NotificationList with a click handler that fires `fetch('/api/notifications/${row.id}/read', { method: 'PATCH' })` before navigation
2. Add a small pin/unpin icon button to the right of the timestamp that calls `/api/notifications/${row.id}/pin`

Both changes are additive — no contract change required.

## Requirements Status

| ID        | Description                                                  | Status                                   |
| --------- | ------------------------------------------------------------ | ---------------------------------------- |
| NOTIF-06  | `/notifications` full-page view with filter + search + pagination | Complete                                 |
| NOTIF-12  | ≥20 unit test cases for notifications system                 | Progressing (10 new added → 42 total across 77-01/02/03/05) |

## Self-Check: PASSED

- FOUND: `app/(app)/notifications/page.tsx`
- FOUND: `app/(app)/notifications/loading.tsx`
- FOUND: `components/notifications/NotificationList.tsx`
- FOUND: `components/notifications/NotificationFilters.tsx`
- FOUND: `lib/notifications/queries.ts`
- FOUND: `tests/unit/notifications/notifications-page.test.tsx`
- FOUND commit: `f3417e3`
- TYPECHECK: `npx tsc --noEmit` clean (exit 0)
- TESTS: 10/10 GREEN in notifications-page.test.tsx; 42/42 GREEN in full notifications suite
