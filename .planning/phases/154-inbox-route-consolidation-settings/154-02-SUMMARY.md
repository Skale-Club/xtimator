---
phase: 154-inbox-route-consolidation-settings
plan: 02
subsystem: ui
tags: [nextjs, react, radix-tabs, server-actions, admin-panel, whatsapp]

# Dependency graph
requires:
  - phase: 154-inbox-route-consolidation-settings (plan 01)
    provides: "/admin/inbox base route + master-detail conversation viewer; /admin/whatsapp redirect stub"
provides:
  - "/admin/inbox/settings tabbed page (Accounts + Templates) reusing existing components"
  - "AdminWhatsAppAccounts relocated to app/admin/inbox/settings/admin-whatsapp-accounts.tsx"
  - "All 6 revalidatePath calls in lib/actions/admin-whatsapp-accounts.ts retargeted to /admin/inbox/settings"
  - "/admin/whatsapp-templates redirect stub to /admin/inbox/settings"
affects: [154-03, inbox-nav, admin-whatsapp-templates, admin-integrations-whatsapp]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SSR-readable tab state via searchParams.tab, seeded into Tabs defaultValue (uncontrolled Radix tabs, no client-side URL sync on click)"
    - "Byte-verbatim component relocation (move only, zero text changes) to preserve behavior while changing route ownership"

key-files:
  created:
    - app/admin/inbox/settings/page.tsx
    - app/admin/inbox/settings/admin-whatsapp-accounts.tsx
  modified:
    - lib/actions/admin-whatsapp-accounts.ts
    - app/admin/whatsapp-templates/page.tsx

key-decisions:
  - "AdminWhatsAppAccounts moved (not copied+deleted-later) verbatim into app/admin/inbox/settings/, preserving all imports, props, and the component name unchanged"
  - "WhatsAppTemplatesPanel and its data layer (lib/actions/admin-whatsapp-templates.ts) left completely in place — only imported into the new settings page, per INBOX-04's contained-blast-radius requirement"
  - "Tab state is SSR-readable via ?tab=accounts|templates parsed server-side into defaultValue; no client-side router sync on click, since neither CONTEXT.md nor UI-SPEC mandated live URL updates on tab switch"
  - "Neither AdminWhatsAppAccounts nor WhatsAppTemplatesPanel is wrapped in an extra Card — both already own their root markup (space-y-6 / internal Card usage), avoiding double-wrapping"

patterns-established:
  - "Settings/tabbed admin pages follow the app/admin/legal/page.tsx composition: Tabs variant=line + shared TabsTrigger className constant"

requirements-completed: [INBOX-03, INBOX-04]

# Metrics
duration: 18min
completed: 2026-07-05
---

# Phase 154 Plan 02: Inbox Settings Tabbed Page Summary

**Built the `/admin/inbox/settings` tabbed page (Accounts + Templates) by relocating `AdminWhatsAppAccounts` verbatim and retargeting all 6 `revalidatePath` calls, while `WhatsAppTemplatesPanel` and its data layer stayed untouched in place.**

## Performance

- **Duration:** 18 min
- **Started:** 2026-07-05T22:57:00Z
- **Completed:** 2026-07-05T23:15:00Z
- **Tasks:** 2
- **Files modified:** 4 (2 created, 2 modified, 1 deleted-via-rename)

## Accomplishments
- `/admin/inbox/settings` now renders a requireAdmin-gated, SSR tab-readable page with Accounts and Templates tabs, both wired to the existing components with zero behavior change
- `AdminWhatsAppAccounts` relocated byte-for-byte from `app/admin/whatsapp/` to `app/admin/inbox/settings/` (git recorded it as a 100% rename)
- All 6 `revalidatePath('/admin/whatsapp')` call sites in `lib/actions/admin-whatsapp-accounts.ts` now target `/admin/inbox/settings`, so account/sender mutations revalidate the correct new route
- Old `/admin/whatsapp-templates` route is now a pure redirect stub to `/admin/inbox/settings`
- Confirmed `lib/queries/admin-whatsapp.ts`, `lib/actions/admin-whatsapp.ts`, `lib/actions/admin-whatsapp-templates.ts`, and `app/admin/integrations/whatsapp/*` remain completely untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Relocate admin-whatsapp-accounts.tsx verbatim and retarget revalidatePath** - `7b882f6a` (feat)
2. **Task 2: Build the new /admin/inbox/settings tabbed page and redirect stub** - `ccc00ad7` (feat)

_Note: no TDD tasks in this plan (tdd="false" on both)._

## Files Created/Modified
- `app/admin/inbox/settings/admin-whatsapp-accounts.tsx` - Byte-verbatim relocation of the Accounts provisioning UI (same export, props, imports)
- `app/admin/inbox/settings/page.tsx` - New async server component: requireAdmin gate, Promise.all data fetch (configs/senders/templates), Tabs(Accounts|Templates), Back to Inbox link
- `lib/actions/admin-whatsapp-accounts.ts` - All 6 `revalidatePath` calls changed from `/admin/whatsapp` to `/admin/inbox/settings`; no other line touched
- `app/admin/whatsapp-templates/page.tsx` - Replaced 33-line page with a 4-line redirect stub to `/admin/inbox/settings`

## Decisions Made
- Followed the plan's explicit discretion note: chose the simpler uncontrolled Radix `Tabs` approach (SSR-seeded `defaultValue` only, no client-side URL sync on click) since neither CONTEXT.md nor UI-SPEC required live URL updates on tab clicks, only that the tab be shareable/bookmarkable on page load.
- `Promise.all` used for the two service-role queries plus `listTemplates()` to parallelize the settings page's data fetch (plan explicitly left this to executor discretion).

## Deviations from Plan

None - plan executed exactly as written.

(Note: `app/admin/whatsapp/page.tsx` was already a redirect stub to `/admin/inbox` on disk at the start of this plan — that was Plan 01's prior, already-committed work, not something this plan touched or needed to touch.)

## Issues Encountered
- Initial verbatim-copy verification attempted a raw `git cat-file` byte comparison against the relocated file and found a 361-byte difference. Investigation confirmed this was purely a CRLF (working tree, `core.autocrlf=true`) vs LF (git blob storage) difference — every file in this repo's working tree uses CRLF on disk while git stores LF internally. Confirmed by checking sibling files (`app/admin/legal/page.tsx`, `lib/actions/admin-whatsapp-accounts.ts`) which show the same pattern. The relocated file is genuinely byte-identical to the source file as it existed on disk; no content was altered.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `/admin/inbox/settings` is live with working Accounts + Templates tabs and correct revalidation targets, ready for Plan 03 (test/reference updates) to point any remaining test suites or path references at the new route.
- No blockers. `components/admin/whatsapp-templates-panel.tsx`, `lib/queries/admin-whatsapp.ts`, `lib/actions/admin-whatsapp.ts`, `lib/actions/admin-whatsapp-templates.ts`, and Integrations > WhatsApp credentials remain fully untouched as required by INBOX-04.

---
*Phase: 154-inbox-route-consolidation-settings*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: app/admin/inbox/settings/page.tsx
- FOUND: app/admin/inbox/settings/admin-whatsapp-accounts.tsx
- FOUND: lib/actions/admin-whatsapp-accounts.ts
- FOUND: app/admin/whatsapp-templates/page.tsx
- CONFIRMED REMOVED: app/admin/whatsapp/admin-whatsapp-accounts.tsx
- FOUND commit: 7b882f6a
- FOUND commit: ccc00ad7
