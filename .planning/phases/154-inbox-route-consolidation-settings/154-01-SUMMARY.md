---
phase: 154-inbox-route-consolidation-settings
plan: 01
subsystem: ui
tags: [nextjs, app-router, admin-nav, routing, redirect]

# Dependency graph
requires: []
provides:
  - "Single 'Inbox' nav item in the super-admin left-nav (replaces WhatsApp + WA Templates entries)"
  - "app/admin/inbox/page.tsx — conversations-only Inbox page (Accounts branch + tab-switcher removed)"
  - "app/admin/inbox/admin-whatsapp-client.tsx, admin-whatsapp-filters.tsx, loading.tsx relocated from app/admin/whatsapp/"
  - "app/admin/whatsapp/page.tsx now a thin redirect stub to /admin/inbox"
  - "Settings2-icon 'Settings' header link to /admin/inbox/settings (INBOX-03 gear affordance)"
affects: [155-inbox-master-detail-viewer, 154-02-inbox-settings-page]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Thin server-component redirect stub for retired routes (next/navigation redirect(), no auth check needed — target re-checks it)"]

key-files:
  created:
    - app/admin/inbox/page.tsx
    - app/admin/inbox/admin-whatsapp-client.tsx
    - app/admin/inbox/admin-whatsapp-filters.tsx
    - app/admin/inbox/loading.tsx
  modified:
    - components/admin/admin-nav.tsx
    - app/admin/whatsapp/page.tsx

key-decisions:
  - "app/admin/whatsapp/page.tsx kept at its original path (not moved) as a minimal redirect stub so old bookmarks still resolve"
  - "app/admin/inbox/page.tsx assembled as a new split (not a byte-verbatim copy) — Accounts tab, tab-switcher chrome, and the Promise.all service-role account fetches were dropped entirely per plan interfaces spec"
  - "Settings header link uses the existing Settings2 icon (already imported project-wide for Integrations nav) rather than a new gear glyph, per UI-SPEC Copywriting Contract"

patterns-established: []

requirements-completed: [INBOX-01]

# Metrics
duration: 12min
completed: 2026-07-05
---

# Phase 154 Plan 01: Inbox Route Consolidation (Nav + Page Split) Summary

**Collapsed the super-admin "WhatsApp" + "WA Templates" nav entries into one "Inbox" item, split the conversations-only surface out of the old tab-switcher page into `/admin/inbox`, and turned `/admin/whatsapp` into a redirect stub.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-05T22:59:00Z (approx, first Read call)
- **Completed:** 2026-07-05T23:13:24Z
- **Tasks:** 3
- **Files modified:** 6 (2 modified, 4 created; 3 old files deleted as part of relocation)

## Accomplishments
- `components/admin/admin-nav.tsx` shows exactly one "Inbox" nav entry (Inbox icon) instead of two WhatsApp-branded entries; unused `MessageCircle` import removed.
- `app/admin/whatsapp/page.tsx` is now a 4-line redirect stub (`redirect('/admin/inbox')`) — old bookmarks/links still resolve.
- `app/admin/inbox/admin-whatsapp-client.tsx` and `loading.tsx` relocated byte-verbatim (zero content changes) — ready for Phase 155's master-detail viewer redesign.
- `app/admin/inbox/admin-whatsapp-filters.tsx` relocated with all 4 `router.replace(...)` path literals retargeted from `/admin/whatsapp` to `/admin/inbox`.
- `app/admin/inbox/page.tsx` assembled as a new conversations-only server component: no Accounts tab, no tab-switcher chrome, no `requireServiceClient`/`AdminWhatsAppAccounts` — plus a new "Settings" header link (`Settings2` icon, 16px) pointing at `/admin/inbox/settings` (the INBOX-03 gear affordance, consumed by the sibling Plan 02).

## Task Commits

Each task was committed atomically:

1. **Task 1: Collapse nav to one Inbox item and create redirect stub for /admin/whatsapp** - `5a5c4f02` (feat)
2. **Task 2: Relocate admin-whatsapp-client.tsx and loading.tsx verbatim; relocate + retarget admin-whatsapp-filters.tsx** - `c9f6238b` (feat)
3. **Task 3: Assemble the new conversations-only app/admin/inbox/page.tsx** - `8483a598` (feat)

_No TDD tasks in this plan (autonomous:true, type="auto" throughout)._

## Files Created/Modified
- `components/admin/admin-nav.tsx` - merged the two WhatsApp-branded NAV_ITEMS entries into one `{ href: '/admin/inbox', label: 'Inbox', Icon: Inbox }`; dropped the now-unused `MessageCircle` lucide import
- `app/admin/whatsapp/page.tsx` - reduced from 208 lines to a 4-line redirect stub to `/admin/inbox`
- `app/admin/inbox/admin-whatsapp-client.tsx` - byte-verbatim relocation of the conversation table + Sheet (`AdminWhatsAppClient`)
- `app/admin/inbox/loading.tsx` - byte-verbatim relocation of the `AdminShellSkeleton`-wrapped loading skeleton
- `app/admin/inbox/admin-whatsapp-filters.tsx` - relocated `AdminWhatsAppFilters` with all 4 `/admin/whatsapp` → `/admin/inbox` path-literal edits (pushParam, dateFrom onChange, dateTo onChange, Clear filters onClick)
- `app/admin/inbox/page.tsx` - new server component: `requireAdmin()` → `parseAdminWhatsAppFilters` → single `listAdminWhatsAppConversations` fetch (no `Promise.all`, no service-role account queries) → conversations-only render (filters, count, table, pagination) + new Settings header link

## Decisions Made
- Kept `app/admin/whatsapp/page.tsx` at its original path as a redirect stub (per plan) rather than deleting it, so the old bookmarked URL keeps resolving.
- Followed the plan's explicit instruction that `app/admin/inbox/page.tsx` is a split/assembly, not a verbatim copy — Accounts tab and its service-role data fetches were fully removed, deferred to Plan 02's settings page.
- Reused the existing `Settings2` lucide icon for the new Settings link (matches `Integrations` nav icon already in the codebase) rather than importing a new gear icon, per the UI-SPEC Copywriting Contract.

## Deviations from Plan

None — plan executed exactly as written. One incidental observation (not a deviation, no action needed): the plan's `<verification>` section anticipated `tests/unit/admin/whatsapp-filters.test.ts` would fail until Plan 03 updates it, but running it showed all 27 tests passing — that test file only imports `@/lib/queries/admin-whatsapp` (a query module untouched by this plan), not the relocated page/component files, so it was never coupled to the route paths this plan changed.

## Issues Encountered

None. The parallel Plan 02 agent (154-02, disjoint files per the plan-checker's dependency graph) had already relocated `app/admin/whatsapp/admin-whatsapp-accounts.tsx` to `app/admin/inbox/settings/admin-whatsapp-accounts.tsx` by the time Task 2 ran — this is Plan 02's own scope and was left untouched; my commits only staged the files explicitly listed in this plan's `files_modified` frontmatter.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `app/admin/inbox/admin-whatsapp-client.tsx` is in place at its new location, ready for Phase 155's master-detail viewer redesign to edit directly.
- The Settings link in `app/admin/inbox/page.tsx` points at `/admin/inbox/settings`, which Plan 02 (running in parallel) is building out.
- No blockers identified for Phase 155 or the remaining Phase 154 plans.

---
*Phase: 154-inbox-route-consolidation-settings*
*Completed: 2026-07-05*

## Self-Check: PASSED

All created files verified present on disk; all 3 task commit hashes (5a5c4f02, c9f6238b, 8483a598) verified present in git log.
