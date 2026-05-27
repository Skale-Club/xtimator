---
phase: quick-260527-jhp
plan: 01
subsystem: ui
tags: [react, hydration, ssr, intl, nextjs, date-formatting]

# Dependency graph
requires:
  - phase: lib/money/currency.ts
    provides: formatMoney + DEFAULT_CURRENCY_CODE (pinned-locale money formatter reused for budget)
provides:
  - "lib/utils/format-date.ts — shared hydration-safe formatDate (en-US + UTC pinned)"
  - "All confirmed React #418 offending date/money/relative-time call sites routed through hydration-safe formatting"
  - "NotificationList mounted-guard pattern for Date.now()-based relative time"
affects: [notifications, dashboard, project-workspace, date-formatting]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Hydration-safe date formatting: pin locale (en-US) + timeZone (UTC) via Intl.DateTimeFormat"
    - "Mounted-guard + suppressHydrationWarning for intentional post-mount text upgrade (relative time)"

key-files:
  created:
    - lib/utils/format-date.ts
    - tests/unit/utils/format-date.test.ts
  modified:
    - components/workspace/project-metadata-strip.tsx
    - components/projects/project-table.tsx
    - components/dashboard/project-card.tsx
    - components/dashboard/project-table-row.tsx
    - lib/utils/relative-time.ts
    - components/notifications/notification-item.tsx
    - components/notifications/NotificationList.tsx

key-decisions:
  - "formatDate pins locale to en-US and timeZone to UTC; no lang/locale param (locale fixed for hydration safety)"
  - "Default formatDate options reproduce the locale-less toLocaleDateString US numeric shape (5/27/2026)"
  - "NotificationList renders deterministic formatDate on SSR/first paint, upgrades to live relative string after mount with suppressHydrationWarning"

patterns-established:
  - "Hydration-sensitive chrome/list/notification dates go through formatDate; multi-locale estimate/PDF formatters keep their own"
  - "Date.now()-driven render output guarded by a mounted flag to keep SSR == first client render"

requirements-completed: [FIX-REACT418]

# Metrics
duration: 9min
completed: 2026-05-27
---

# Phase quick-260527-jhp: Fix React #418 Hydration Text Mismatch Summary

**Eliminated React #418 hydration crashes by pinning all SSR-sensitive date/money/relative-time formatting to en-US + UTC via a shared formatDate helper, plus a mounted-guard for Date.now()-based relative time.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-05-27T17:07:54Z
- **Completed:** 2026-05-27T17:17:02Z
- **Tasks:** 3
- **Files modified:** 7 (+ 1 new test file)

## Accomplishments
- New `lib/utils/format-date.ts` (`formatDate`) — single home for hydration-safe date formatting, pinned to en-US locale and UTC timezone (mirrors the pinned-locale `lib/money/currency.ts` pattern).
- Eight confirmed React #418 offending call sites across project workspace, dashboard lists/tables, and the /notifications page now produce byte-identical SSR and first-client text.
- NotificationList's `Date.now()`-based relative time is now hydration-safe: SSR/first paint renders a deterministic `formatDate` value, then upgrades to the live relative string ("3m ago") after mount via a `mounted` flag + `suppressHydrationWarning`.
- en-US/UTC visual output preserved exactly ($1,000 / "5/27/2026" / "May 27, 2026").

## Task Commits

Each task was committed atomically:

1. **Task 1: Create shared hydration-safe date helper (TDD)**
   - `b6eb905` (test — RED: failing formatDate test)
   - `47188ba` (feat — GREEN: formatDate implementation)
2. **Task 2: Route money + date call sites through hydration-safe formatters** - `0c03ce5` (fix)
3. **Task 3: Make relative-time helpers hydration-safe** - `0b836b9` (fix)

_Plan metadata commit handled by orchestrator._

## Files Created/Modified
- `lib/utils/format-date.ts` (created) - Shared hydration-safe `formatDate(iso, options?)`, en-US + UTC pinned; invalid input returns ''.
- `tests/unit/utils/format-date.test.ts` (created) - 4 behavior tests (default numeric, month-short, TZ-independent date, invalid input).
- `components/workspace/project-metadata-strip.tsx` - Budget via `formatMoney(USD)`, created date via `formatDate`.
- `components/dashboard/project-card.tsx` - "Paid …" tooltip + created date via `formatDate`.
- `components/dashboard/project-table-row.tsx` - "Paid …" tooltip + created date via `formatDate`.
- `components/projects/project-table.tsx` - ProjectPaidBadge tooltip + date column + mobile-card date via `formatDate` (3 sites).
- `lib/utils/relative-time.ts` - Date fallback now uses `formatDate`.
- `components/notifications/notification-item.tsx` - Date fallback now uses `formatDate`.
- `components/notifications/NotificationList.tsx` - `formatRelative` fallback via `formatDate`; mounted-guard + `suppressHydrationWarning` on the `<time>` element.

## Decisions Made
- `formatDate` intentionally has no `lang`/locale parameter — locale is fixed (en-US) for hydration safety. The estimate-document/estimate-pdf formatters keep their own multi-locale formatters; this helper only serves hydration-sensitive chrome/list/notification surfaces.
- Default `formatDate` options reproduce the locale-less `toLocaleDateString()` US numeric shape ("5/27/2026"); callers wanting "May 27, 2026" pass `{ month: 'short', day: 'numeric', year: 'numeric' }`.
- For NotificationList relative time, the lightest correct fix is the mounted-guard: deterministic SSR/first-paint value via `formatDate`, then the live relative value after mount, with `suppressHydrationWarning` covering the intentional post-mount text swap.

## Deviations from Plan

None - plan executed exactly as written.

(The `project-table.tsx` date replacement required handling two indentation variants — the data-table cell at line ~163 and the mobile-card at line ~296. The first replace_all pass matched only the cell; the mobile-card was then replaced separately. This is a mechanical detail of applying the planned change, not a deviation from the plan's intent — all three sites in that file now use `formatDate`.)

## Issues Encountered
- Pre-existing `npx tsc --noEmit` errors in MCP files (`app/api/mcp/route.ts`, `lib/mcp/*`) caused by the missing `@modelcontextprotocol/sdk` dependency in this worktree. These are unrelated to this task (none reference the eight touched files) and are out of scope per the scope boundary rule. Logged to `deferred-items.md`. All plan-touched files compile cleanly under tsc.

## Verification
- `npx vitest run tests/unit/utils/format-date.test.ts tests/unit/notifications/` — 60/60 tests pass (9 files).
- `npx tsc --noEmit` — zero errors in any of the eight plan-touched files.
- `npx eslint` on the four Task 2 files — clean (exit 0).
- Grep confirms zero remaining locale-less `toLocaleDateString()` / `toLocaleString()` calls across the eight touched files; `.getTime()` sort comparators intentionally retained (never rendered, timezone/locale-independent).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- React #418 crash surfaces (project workspace, /notifications) are fixed; SSR markup matches first client render for all touched call sites.
- Recommended manual check: load the project workspace page and /notifications in a dev build with React in development mode and confirm no hydration warning in the console.

## Self-Check: PASSED

---
*Phase: quick-260527-jhp*
*Completed: 2026-05-27*
