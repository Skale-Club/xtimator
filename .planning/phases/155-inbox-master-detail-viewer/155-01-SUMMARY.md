---
phase: 155-inbox-master-detail-viewer
plan: 01
subsystem: ui
tags: [nextjs, app-router, react, url-state, tailwind, admin-inbox]

# Dependency graph
requires:
  - phase: 154-inbox-route-consolidation-settings
    provides: "app/admin/inbox/{page.tsx,admin-whatsapp-client.tsx,admin-whatsapp-filters.tsx} relocated to their new location, conversations-only page shape"
provides:
  - "Two-pane master-detail Inbox viewer at /admin/inbox (list left, thread right, same page — no Sheet/modal overlay)"
  - "?conversation=<id> URL-driven selection (shallow router.replace, scroll: false, page param preserved)"
  - "SSR-resolved deep-linking: page.tsx reads searchParams.conversation and passes initialConversationId to the client"
  - "EmptyState ('Select a conversation') for the no-selection right-pane state"
  - "Mobile single-column collapse (conditional rendering, not CSS-only) with a Back affordance clearing the URL param"
affects: [155-02-inbox-e2e-test-update]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "URL-param-driven pane selection via useSearchParams + router.replace({ scroll: false }), mirroring the existing AdminWhatsAppFilters shallow-update pattern but deliberately NOT resetting page on selection"
    - "Slot-prop composition (filtersSlot/paginationSlot) so a Server Component parent keeps owning filter/pagination prop-wiring while a two-pane Client Component only places them"
    - "cancelled-flag guard in useEffect cleanup to prevent stale async thread-fetch responses from overwriting a newer selection"

key-files:
  created: []
  modified:
    - app/admin/inbox/admin-whatsapp-client.tsx
    - app/admin/inbox/page.tsx

key-decisions:
  - "Company label in the thread header falls back to the matched list row's company_name (best-effort) since WaConversationRow has no company_name field — deep-linked conversations off the current page/filter will show name+phone only, no company label, matching the plan's explicit fallback contract"
  - "Conversations-count paragraph stays rendered by page.tsx directly, above the two-pane container's height-bearing wrapper, per the plan's placement guidance"
  - "Kept page.tsx's outer wrapper as flex h-full min-h-0 flex-col space-y-8 — space-y-8 remains compatible with flex-col (Tailwind's sibling-margin selector works identically on flex children)"

patterns-established:
  - "Two-pane admin viewer layout (list + detail on one page, URL-selected, mobile-collapsing) — reusable shape for any future admin master-detail surface"

requirements-completed: [INBOX-02]

# Metrics
duration: 18min
completed: 2026-07-05
---

# Phase 155 Plan 01: Inbox Master-Detail Viewer (Core UI/Interaction Refactor) Summary

**Replaced the Inbox's table + right-side Sheet overlay with a persistent two-pane master-detail layout (Xphere-style list + thread), selection driven entirely by a shallow `?conversation=<id>` URL param with SSR deep-link resolution and a mobile single-column collapse — read-only behavior fully preserved.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-05T19:38:00Z (approx, first Read call)
- **Completed:** 2026-07-05T19:56:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `app/admin/inbox/admin-whatsapp-client.tsx` fully rewritten: zero `<table>`/`Sheet` markup remains; renders a `flex h-full min-h-0` two-pane row (list pane `w-full md:w-[320px] md:shrink-0`, thread pane `flex-1`) with independently scrolling panes.
- Selection is 100% URL-driven: `selectedId = sp.get('conversation') ?? initialConversationId`; `selectConversation`/`clearSelection` both use `URLSearchParams` + `router.replace(..., { scroll: false })`, and neither ever calls `params.delete('page')`, so choosing a conversation never resets list pagination or scroll position.
- Thread pane reads all header fields from `thread?.conversation` (never from a bare `row` lookup), so a direct link/refresh to `/admin/inbox?conversation=<id>` for a conversation outside the current page/filter still renders correctly — company label is the one best-effort exception (sourced from the matched row when available, since `WaConversationRow` carries no `company_name`).
- No-selection state renders the existing `EmptyState` component ("Select a conversation" / "Choose a conversation from the list to view its messages.") instead of a blank pane.
- Mobile (`< md`) shows exactly one pane via conditional Tailwind classes (`hidden md:flex` / `flex md:hidden` pairs), with a 44px-tall "← Back" button (`ChevronLeft` + text, `md:hidden`) in the thread header that clears the URL param.
- `app/admin/inbox/page.tsx` now computes `initialConversationId` from `searchParams.conversation` and passes it, plus `filtersSlot`/`paginationSlot` (the existing `AdminWhatsAppFilters` and Prev/Next pagination block, unchanged prop-wiring), into the new two-pane `AdminWhatsAppClient`. The page root and the wrapper around the viewer now carry `flex h-full min-h-0 flex-col` / `flex-1 min-h-0 overflow-hidden` so the two-pane component gets a bounded height from `<main>` without touching `app/admin/layout.tsx`.
- Zero reply/send/compose identifiers anywhere in the file (`sendMessage`, `handleSend`, `reply`, textarea, submit button) — locked read-only decision preserved.

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite admin-whatsapp-client.tsx as a two-pane master-detail component with URL-driven selection** - `07734c9f` (feat)
2. **Task 2: Wire page.tsx to pass initialConversationId and the filters/pagination slots into the new client component** - `a8897d5b` (feat)

_No TDD tasks in this plan (autonomous:true, type="auto" throughout)._

## Files Created/Modified
- `app/admin/inbox/admin-whatsapp-client.tsx` - full rewrite: two-pane master-detail layout, `useSearchParams`/`router.replace` selection, `cancelled`-flag-guarded thread fetch effect, `EmptyState` no-selection state, mobile collapse + Back affordance
- `app/admin/inbox/page.tsx` - added `initialConversationId` computation from `searchParams.conversation`; moved `AdminWhatsAppFilters` and the Prev/Next pagination block into `filtersSlot`/`paginationSlot` props; added the page-level `flex h-full min-h-0` height wrapper around the two-pane viewer

## Decisions Made
- Company label fallback: since `WaConversationRow` (the `thread.conversation` type) has no `company_name` field, the thread header sources name/phone from `thread.conversation` always, but the company label falls back to the matched list-page `row?.company_name` (may be blank for off-page/deep-linked conversations) — exactly as the plan's interfaces section specified as an acceptable best-effort exception.
- Kept the "conversations count" paragraph rendered directly by `page.tsx`, positioned above the two-pane container's `flex-1 min-h-0 overflow-hidden` wrapper (not inside either pane), per the plan's placement guidance for content that doesn't have an explicit slot in the UI-SPEC layout contract.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Both post-154 files (`admin-whatsapp-client.tsx`, `page.tsx`) matched the plan's `<interfaces>` description of their post-relocation shape exactly, so no re-adaptation was needed beyond what the plan specified.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `/admin/inbox` now renders the two-pane master-detail viewer with URL-param-driven selection, ready for Plan 155-02 to update `tests/e2e/admin-whatsapp.spec.ts`'s static-contract assertions (which still reference the old `loadAdminConversationThread(row.id, row.company_id)` literal and old two-tab/Accounts checks against stale paths — anticipated failures, not a regression from this plan).
- Regression-critical unit tests (`tests/unit/admin/whatsapp-filters.test.ts`, `tests/unit/whatsapp/admin-authority-contract.test.ts`) run green (33/33) — neither test touches this plan's changed markup/paths.
- `npx tsc --noEmit` shows zero errors in `app/admin/inbox/*` or `admin-whatsapp-client.tsx`; the handful of pre-existing repo-wide type errors (billing config test fixtures, entitlements test fixtures, regex-flag target warnings) are unrelated to this plan's files and were not introduced by it.
- No blockers identified for Plan 155-02.

---
*Phase: 155-inbox-master-detail-viewer*
*Completed: 2026-07-05*

## Self-Check: PASSED

All created/modified files verified present on disk; both task commit hashes (07734c9f, a8897d5b) verified present in git log.
