---
phase: 77-notifications-system
plan: 04
subsystem: notifications
tags: [bell, popover, realtime, supabase, topbar, in-app, parallel]
requires: [77-02, 77-03, lib/queries/auth, lib/supabase/client, lib/supabase/service, lib/notifications/queries]
provides:
  - NotificationBell — topbar trigger + unread badge + Popover root
  - NotificationPanel — 400px panel grouped by day with mark-all-read + see-all CTA
  - NotificationItem — single-row component with optimistic markRead + navigate
  - CategoryIcon — Lucide icon map keyed by EventCategory
  - useNotifications — initial fetch + Supabase Realtime subscription + optimistic state
  - GET /api/notifications/list — cursor-paginated user-scoped feed
  - PATCH /api/notifications/[id]/read — service-role single-row read mark
  - POST /api/notifications/mark-all-read — bulk read mark, returns count
affects: [components/app-shell/topbar.tsx, app/(app)/layout.tsx]
tech-stack:
  added: []
  patterns:
    - Supabase Realtime channel name `notifications:${companyId}:${userId}` with company-id-scoped server filter + client-side user-id narrow
    - 300ms debounce batch flush on burst inserts (e.g. multi-row dispatches)
    - Optimistic local mutation before fire-and-forget API call (mirrors lib/admin/audit-log best-effort)
    - Service-role UPDATE bypasses RLS using explicit (company_id, user_id) WHERE for authz
key-files:
  created:
    - components/notifications/notification-bell.tsx
    - components/notifications/notification-panel.tsx
    - components/notifications/notification-item.tsx
    - components/notifications/category-icon.tsx
    - components/notifications/use-notifications.ts
    - app/api/notifications/list/route.ts
    - app/api/notifications/[id]/read/route.ts
    - app/api/notifications/mark-all-read/route.ts
    - tests/unit/notifications/notification-bell.test.tsx
  modified:
    - components/app-shell/topbar.tsx
    - app/(app)/layout.tsx
decisions:
  - Plan referenced `createBrowserClient` from `@/lib/supabase/client` — actual export is `createClient`. Used the real export aliased as `createBrowserSupabase`. No client-shape change.
  - Auth claims (`getAuthClaims`) do not include `company_id`. All 3 API routes resolve company via `getCachedCompany(claims.sub)` (already memoized via React `cache` + `unstable_cache`), then enforce scope via explicit `eq('company_id', company.id)` + `.or('user_id.is.null,user_id.eq.${claims.sub}')`.
  - Realtime postgres_changes server-side `filter` is single-column only (`company_id=eq.X`). User-scope narrowing (`user_id IS NULL OR = me`) happens client-side inside the channel callback before pushing to state.
  - Dropped per-task commits — single feature commit per CLAUDE.md `--no-verify` parallel-mode instruction (3 commits for 5 tasks would split an indivisible feature surface).
  - reuse `lib/notifications/queries.ts::listNotificationsPage` (created by 77-05's parallel work — file present on disk pre-commit) inside the GET route. This is a soft cross-plan dependency: if 77-05 had not staged the file first, the GET route would need its own select. Confirmed file exists at commit time.
metrics:
  duration_minutes: 9
  tasks_completed: 5
  files_created: 9
  files_modified: 2
  commits: 1
  completed_date: 2026-05-20
requirements: [NOTIF-05, NOTIF-11]
---

# Phase 77 Plan 04: Bell + Panel + Realtime Summary

**One-liner:** Ships the always-visible notification surface — bell in topbar, 400px Radix Popover panel, live unread badge via Supabase Realtime postgres_changes — proving the dispatch pipeline end-to-end.

## Tasks Executed

| Task | Name                                                | Commit    | Files                                                                                                        |
| ---- | --------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------ |
| 1    | API routes — list, [id]/read, mark-all-read          | `e6cab9d` | `app/api/notifications/{list,[id]/read,mark-all-read}/route.ts`                                              |
| 2    | useNotifications hook + Supabase Realtime channel    | `e6cab9d` | `components/notifications/use-notifications.ts`, `tests/unit/notifications/notification-bell.test.tsx`        |
| 3    | Bell, Panel, Item, CategoryIcon components           | `e6cab9d` | `components/notifications/{notification-bell,notification-panel,notification-item,category-icon}.tsx`         |
| 4    | Mount NotificationBell in topbar (thread userId)     | `e6cab9d` | `components/app-shell/topbar.tsx`, `app/(app)/layout.tsx`                                                    |
| 5    | Feature commit (closeout)                            | `e6cab9d` | (commit only)                                                                                                |

Single combined commit per CLAUDE.md `--no-verify` parallel-mode instruction; per-task split would produce intermediate states where the bell renders without a hook or with broken types.

## API Route Contracts

### GET /api/notifications/list

```
GET /api/notifications/list?cursor=<ISO>&limit=<1-100>

200 → { items: NotificationRow[], nextCursor: string | null }
401 → { error: 'unauthorized' }
404 → { error: 'no_company' }
```

- `limit` defaults 20; clamped to [1, 100]
- Uses `listNotificationsPage` from `lib/notifications/queries.ts` — RLS-bypassing service client + explicit `company_id` + `(user_id IS NULL OR = me)` filter
- Order: `pinned DESC, created_at DESC`

### PATCH /api/notifications/[id]/read

```
PATCH /api/notifications/<id>/read

204 (no body)
401 → { error: 'unauthorized' }
404 → { error: 'no_company' }
500 → { error: <postgres-message> }
```

- Sets `read_at = now()` if row matches `(id, company_id, user_id|null)`
- Idempotent: re-marking an already-read row is a no-op (no `read_at IS NULL` filter — safe to call repeatedly)

### POST /api/notifications/mark-all-read

```
POST /api/notifications/mark-all-read

200 → { updated: number }
401 / 404 as above
```

- Updates every `read_at IS NULL` row scoped to `(company_id, user_id|null)`

## Supabase Realtime — Channel Convention

```ts
supabase
  .channel(`notifications:${companyId}:${userId}`)
  .on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'notifications',
      filter: `company_id=eq.${companyId}`,
    },
    handler,
  )
  .subscribe()
```

**Why client-side user narrowing?** Supabase realtime `filter` accepts only one column. The channel listens to all inserts on the company; the callback drops `payload.new.user_id` rows that don't match either `null` (company-wide) or the current user. This is correct because RLS still gates DB access — realtime just delivers payloads matching the channel filter.

**Burst handling:** `pendingRef[]` accumulates inserts; a 300ms `setTimeout` flushes them in one `setItems` call. Prevents 5-render storms when a webhook fans out N rows at once. Dedupe-by-id avoids double-render if `refresh()` races with a delivered insert.

**Lifecycle:** `useEffect` returns a cleanup that calls `supabase.removeChannel(channel)` + clears the pending timeout. Verified by the "subscribes on mount and removes channel on unmount" test.

## Component Tree

```
<Topbar company userId isAdmin?>
  ...
  <ContextualTooltip><LanguageToggle/></ContextualTooltip>
  <NotificationBell companyId userId>      ← NEW
    <Popover>
      <PopoverTrigger>
        <button data-testid="notification-bell">
          <Bell/>
          {badge && <span data-testid="notification-bell-badge">{1..'9+'}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent w-[400px]>
        <NotificationPanel state onItemClick>
          Header (title + "Mark all as read")
          Unread section ─ groupByDay → <NotificationItem/>...
          Recent section ─ groupByDay → <NotificationItem/>...
          Footer (<Link href="/notifications">See all →</Link>)
        </NotificationPanel>
      </PopoverContent>
    </Popover>
  </NotificationBell>
  <ThemeToggle/>
  ...
```

## Topbar Mount — Threading userId

`TopbarProps` gained a required `userId: string` field. `app/(app)/layout.tsx` already calls `getAuthClaims()` for the auth check, so it now passes `userId={claims.sub as string}`. No other caller of `<Topbar` exists in the repo (grep confirmed).

**For admin shell:** `components/admin/admin-topbar.tsx` is a separate component (not affected). If admin needs the bell, a follow-up plan should add it explicitly.

## Verification Results

| Check                                                       | Result                                  |
| ----------------------------------------------------------- | --------------------------------------- |
| `npx vitest run tests/unit/notifications/notification-bell` | 7/7 GREEN                                |
| `npx vitest run tests/unit/notifications/` (full suite)     | 42/42 GREEN (incl. plan 77-01/02/03)    |
| `npx tsc --noEmit` (77-04 surface only)                     | Clean                                    |
| `git log -1 --oneline`                                      | `e6cab9d feat(77-04): notification bell + panel + realtime` |
| Grep `<NotificationBell` in topbar                          | Present at the correct slot              |
| Grep `channel.*notifications.*postgres_changes`             | Present in `use-notifications.ts`        |

## Deviations from Plan

### [Rule 3 - Blocker] `createBrowserClient` not exported from `@/lib/supabase/client`
- **Found during:** Task 2
- **Issue:** Plan example used `import { createBrowserClient } from '@/lib/supabase/client'`. The file exports `createClient` (which internally calls `@supabase/ssr#createBrowserClient`).
- **Fix:** Use real export `createClient`, aliased locally as `createBrowserSupabase` for clarity. No behavior change.
- **Files modified:** `components/notifications/use-notifications.ts`
- **Commit:** `e6cab9d`

### [Rule 2 - Critical] auth claims have no `company_id`
- **Found during:** Task 1
- **Issue:** Plan suggested `claims.company_id` for the scope filter. `getAuthClaims()` returns Supabase JWT claims; `company_id` is NOT a claim in this project (companies are looked up by `user_id` via `getCachedCompany`).
- **Fix:** All 3 API routes call `await getCachedCompany(claims.sub)` and use `company.id` for the scope clause. Already memoized via React `cache` + `unstable_cache` so this adds no measurable cost.
- **Files modified:** all 3 routes
- **Commit:** `e6cab9d`

### [Rule 1 - Bug] Realtime `filter` cannot express compound conditions
- **Found during:** Task 2 — designing the subscription
- **Issue:** Plan example used a single company_id filter. Without user-id narrowing, a user in a company with N members would see every per-user notification fired anywhere in the org.
- **Fix:** Server-side filter remains `company_id=eq.X` (max one filter clause supported). Client-side callback inspects `payload.new.user_id` and discards rows belonging to other users. RLS still enforces actual DB scope; this is purely a UI noise filter.
- **Commit:** `e6cab9d`

### [Process deviation] Combined commit instead of 5 per-task commits
- **Reason:** Each component depends on the next (hook → panel → bell → topbar mount). Splitting into 5 commits would create intermediate states with broken imports or unmounted UI. Per CLAUDE.md parallel-mode `--no-verify` instruction, single feature commit preserves bisectability.

## Disjoint from 77-05 (Parallel Confirmation)

| Area                                              | 77-04 owns | 77-05 owns | Conflict? |
| ------------------------------------------------- | ---------- | ---------- | --------- |
| `components/notifications/notification-bell.tsx`  | ✓          |            | No        |
| `components/notifications/notification-panel.tsx` | ✓          |            | No        |
| `components/notifications/notification-item.tsx`  | ✓          |            | No        |
| `components/notifications/category-icon.tsx`      | ✓          |            | No        |
| `components/notifications/use-notifications.ts`   | ✓          |            | No        |
| `components/notifications/NotificationList.tsx`   |            | ✓          | No        |
| `components/notifications/NotificationFilters.tsx`|            | ✓          | No        |
| `app/api/notifications/list/route.ts`             | ✓          |            | No        |
| `app/api/notifications/[id]/read/route.ts`        | ✓          |            | No        |
| `app/api/notifications/mark-all-read/route.ts`    | ✓          |            | No        |
| `app/(app)/notifications/page.tsx`                |            | ✓          | No        |
| `lib/notifications/queries.ts`                    |            | ✓ (created)| 77-04 consumes |
| `components/app-shell/topbar.tsx`                 | ✓          |            | No        |
| `app/(app)/layout.tsx`                            | ✓          |            | No        |

**Soft dependency:** 77-04's `GET /api/notifications/list` route imports `listNotificationsPage` from `lib/notifications/queries.ts`, a file authored by 77-05. At commit time the file exists on disk (verified). If plans run in a different order in the future, 77-04 must own that helper itself.

## Deferred Issues (Out of Scope)

- `tests/unit/notifications/notifications-page.test.tsx` (77-05 owns) currently has 8 `tsc` errors for missing `@testing-library/jest-dom` matcher types (`toBeInTheDocument`, `toHaveTextContent`). Runtime tests pass — only TypeScript-time. 77-05 should add `import '@testing-library/jest-dom/vitest'` in its setup or add the types package. Not blocking the build.

## Known Stubs

None. All wiring is live: bell mounts in topbar, fetches real data via 3 real API routes, subscribes to a real Supabase Realtime channel. The downstream `/notifications` page link in the footer is implemented by parallel plan 77-05.

## Handoff to 77-07 (settings/notifications)

The `useNotifications` hook does not yet honor `notification_preferences.in_app` (the GREEN dispatch in 77-02 already gates row creation). So a user who disabled `in_app` for a category simply won't see that category's rows arrive — UI is automatically correct.

## Handoff to 77-06 (email digest cron)

Unrelated to this plan — bell is in-app only. Email path is the Inngest `notification/email.queued` consumer (see 77-02 SUMMARY § Handoff to 77-06).

## Requirements Status

| ID        | Description                                                          | Status   |
| --------- | -------------------------------------------------------------------- | -------- |
| NOTIF-05  | Topbar bell + unread badge + 400px Popover panel + click-to-navigate | Complete |
| NOTIF-11  | Real-time bell badge via Supabase Realtime channel (no polling)      | Complete |
| NOTIF-12  | ≥20 unit test cases — +7 added (cumulative: 20+ across 77-01..04)    | Partial — running total now ≥20 |

## Self-Check: PASSED

- FOUND: `components/notifications/notification-bell.tsx`
- FOUND: `components/notifications/notification-panel.tsx`
- FOUND: `components/notifications/notification-item.tsx`
- FOUND: `components/notifications/category-icon.tsx`
- FOUND: `components/notifications/use-notifications.ts`
- FOUND: `app/api/notifications/list/route.ts`
- FOUND: `app/api/notifications/[id]/read/route.ts`
- FOUND: `app/api/notifications/mark-all-read/route.ts`
- FOUND: `tests/unit/notifications/notification-bell.test.tsx`
- FOUND modified: `components/app-shell/topbar.tsx` (NotificationBell import + mount + userId prop)
- FOUND modified: `app/(app)/layout.tsx` (userId threaded to Topbar)
- FOUND commit: `e6cab9d` (`feat(77-04): notification bell + panel + realtime`)
- TEST: 7/7 GREEN at `tests/unit/notifications/notification-bell.test.tsx`
- TEST: 42/42 GREEN at `tests/unit/notifications/` (full notifications suite)
- TYPECHECK: clean for 77-04 surface (pre-existing 77-05 page-test type errors out of scope)
