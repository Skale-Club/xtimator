---
phase: 157-admin-nav-reorg-naming-fixes
plan: 01
subsystem: ui
tags: [nextjs, react, admin-nav, app-router, tailwind]

# Dependency graph
requires: []
provides:
  - Reordered super-admin sidebar (Dashboard, Companies, Inbox first)
  - New "Content" grouped-nav rendering pattern (group header + child items) — first grouping pattern in components/admin/
  - "Legal Pages" nav label renamed to "Pages", route moved from /admin/legal to /admin/pages
  - Redirect stub at /admin/legal preserving old bookmarks
affects: [157-02, 157-03, admin-nav consumers]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Grouped sidebar nav: TOP_ITEMS / CONTENT_GROUP_ITEMS / BOTTOM_ITEMS consts + shared NavLink helper + a non-link <li> group-header div (text-xs uppercase tracking-wide text-muted-foreground)"
    - "Route relocation with redirect stub: old route reduced to a single redirect('/new-path') page.tsx (mirrors the v4.16 WhatsApp precedent)"

key-files:
  created:
    - app/admin/pages/page.tsx
    - app/admin/pages/legal-editor.tsx
    - app/admin/pages/actions.ts
    - app/admin/pages/loading.tsx
  modified:
    - components/admin/admin-nav.tsx
    - app/admin/legal/page.tsx

key-decisions:
  - "Kept the page's own internal heading text as <T>Legal Pages</T> unchanged in app/admin/pages/page.tsx per CONTEXT.md's explicit scope fence — only the nav label and route slug were confirmed rename targets, not the page's own copy."
  - "Icon for the Pages nav entry stays Scale (lucide-react) per CONTEXT.md's explicit allowance."
  - "Extracted a shared NavLink helper component instead of duplicating the isActive + JSX block three times, keeping the exact same isActive logic and active-state className byte-identical to the original."

requirements-completed: [NAV-01, NAV-02, NAV-03]

# Metrics
duration: 12min
completed: 2026-07-06
---

# Phase 157 Plan 01: Admin Nav Reorg + Content Group + Legal Pages -> Pages Summary

**Restructured the super-admin sidebar into TOP_ITEMS/CONTENT_GROUP_ITEMS/BOTTOM_ITEMS with a new visually-distinct "Content" group header, and relocated the Legal Pages editor from /admin/legal to /admin/pages with a redirect stub left behind.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-06T04:32:00Z
- **Completed:** 2026-07-06T04:44:00Z
- **Tasks:** 2 completed
- **Files modified:** 6 (1 modified in place, 4 created, 1 reduced to a stub; 3 old files deleted)

## Accomplishments
- `components/admin/admin-nav.tsx` now renders Dashboard, Companies, Inbox first, a new "Content" group (Landing Page, Pages, Blog, SEO, Branding) with a visually distinct uppercase group-header label, then Knowledge, Integrations, Billing, Admins, Event Log ungrouped — all with `isActive` behavior identical to before.
- The Legal Pages editor (page, editor, server action, loading skeleton) fully relocated to `app/admin/pages/`, with `saveLegalPage`'s `revalidatePath` retargeted from `/admin/legal` to `/admin/pages` (the sibling public-route revalidation call is untouched).
- `app/admin/legal/page.tsx` reduced to a 4-line redirect stub to `/admin/pages`, so any existing bookmark still resolves.

## Task Commits

Each task was committed atomically:

1. **Task 1: Reorder nav and build the Content group rendering pattern** - `5d132db5` (feat)
2. **Task 2: Move Legal Pages editor to app/admin/pages/ and retarget revalidatePath** - `59e4982e` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `components/admin/admin-nav.tsx` - Replaced flat `NAV_ITEMS` with `TOP_ITEMS`/`CONTENT_GROUP_ITEMS`/`BOTTOM_ITEMS` + extracted `NavLink` helper + new "Content" group header
- `app/admin/pages/page.tsx` - Relocated Legal/Pages editor Server Component (byte-identical copy, `requireAdmin` + `legal_pages` query)
- `app/admin/pages/legal-editor.tsx` - Relocated Client Component (byte-identical copy)
- `app/admin/pages/actions.ts` - Relocated server action; `revalidatePath` retargeted to `/admin/pages`
- `app/admin/pages/loading.tsx` - Relocated loading skeleton (byte-identical copy)
- `app/admin/legal/page.tsx` - Reduced to a redirect stub (`redirect('/admin/pages')`); the 3 sibling files (`legal-editor.tsx`, `actions.ts`, `loading.tsx`) deleted from the old location

## Decisions Made
- Left `<T>Legal Pages</T>` (the page's own `<h1>` heading text) unchanged in the relocated `app/admin/pages/page.tsx` — CONTEXT.md's locked scope is the nav label + route slug only, not the page's internal copy.
- Kept the `Scale` icon for the "Pages" nav entry as explicitly allowed by CONTEXT.md.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. `npx tsc --noEmit` showed a set of pre-existing type errors in unrelated test files (billing calibration, seat-billing mocks, whatsapp handler `Entitlements` shape, regex flag targets) — none attributable to `admin-nav.tsx`, `app/admin/pages/*`, or `app/admin/legal/page.tsx`; out of scope per the deviation rules' scope boundary and logged here for visibility only, not fixed. The concurrent 157-02 executor's `Support Mode` -> `View as Company` rename (a separate plan touching disjoint files) was mid-flight during this plan's execution; a `vitest run tests/unit` pass showed 2 of its own test files still asserting the old "Support Mode" copy (expected transient state, not a regression caused by this plan) plus 1 pre-existing unrelated `landing-page.test.tsx` timing flake.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `/admin/pages` is live and fully functional (edit + save both Privacy Policy and Terms of Service, revalidates both `/admin/pages` and the corresponding public route).
- `/admin/legal` correctly redirects to `/admin/pages` — no broken bookmarks.
- The new grouped-nav pattern (`TOP_ITEMS`/`CONTENT_GROUP_ITEMS`/`BOTTOM_ITEMS` + `NavLink` helper) is available as precedent for any future admin-nav additions.
- No blockers for 157-02 or 157-03 — this plan's file set (`components/admin/admin-nav.tsx`, `app/admin/pages/*`, `app/admin/legal/page.tsx`) is fully disjoint from theirs.

---
*Phase: 157-admin-nav-reorg-naming-fixes*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: components/admin/admin-nav.tsx
- FOUND: app/admin/pages/page.tsx
- FOUND: app/admin/pages/legal-editor.tsx
- FOUND: app/admin/pages/actions.ts
- FOUND: app/admin/pages/loading.tsx
- FOUND: app/admin/legal/page.tsx
- FOUND commit: 5d132db5
- FOUND commit: 59e4982e
