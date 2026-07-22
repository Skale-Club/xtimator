---
phase: 175-telegram-platform-events-toggles
plan: 03
subsystem: admin-ui
tags: [telegram, admin-panel, server-actions, supabase, react]

# Dependency graph
requires:
  - phase: 175-telegram-platform-events-toggles
    provides: "Plan 01's PlatformEventKind catalog (10 kinds), isLockedPlatformEvent(), platform_notification_preferences table, invalidatePlatformPreferencesCache()"
provides:
  - "loadPlatformEventToggles() — admin-panel loader joining the catalog with DB toggle state, locked kinds forced enabled:true"
  - "savePlatformEventToggle() server action — requireAdmin-gated, rejects unknown kinds, rejects disabling locked kinds server-side (defense in depth beyond the disabled UI switch), invalidates the preferences cache + revalidates path + audit-logs"
  - "PlatformEventTogglesForm — client component rendering the full 10-event toggle matrix grouped by category on /admin/integrations → Platform Alerts, wired next to TelegramChatIdForm"
  - "'platform_event.toggle' added to the AuditAction union"
  - "showPlatformEventToggles category flag on the ops-alerts category"
affects: []

tech-stack:
  added: []
  patterns:
    - "Optimistic UI toggle: local state update immediately, startTransition + server action, revert-on-error via toast.error (mirrors TelegramChatIdForm's startTransition pattern)"
    - "Defense-in-depth locked-kind guard: disabled Switch client-side AND a server-side isLockedPlatformEvent() rejection in the action, so a direct action call can never disable a critical event"
    - "requireAdmin() called FIRST in every server action, before any validation or DB read"

key-files:
  created:
    - lib/admin/platform-event-preferences.ts
    - app/admin/integrations/platform-event-actions.ts
    - app/admin/integrations/platform-event-toggles-form.tsx
  modified:
    - lib/admin/audit-log.ts
    - lib/admin/integrations-providers.ts
    - app/admin/integrations/integration-category-content.tsx

key-decisions:
  - "Followed the plan-check-provided code verbatim (no material deviation) — it already matched every existing convention (loadCategoryInitials's requireServiceClient() posture, saveTelegramChatId's requireAdmin→validate→upsert→invalidate→revalidate→audit shape, TelegramChatIdForm's glassmorphism card + startTransition pattern)."
  - "UI is catalog-driven: PlatformEventTogglesForm reads PLATFORM_EVENT_KINDS via loadPlatformEventToggles() rather than hardcoding a kind list, so Plan 02's kinds (already in the 10-kind catalog) and any future catalog growth need no UI changes."

patterns-established:
  - "Per-event admin toggle matrix: category-grouped Switch rows with a locked/disabled state driven by a shared catalog def, reusable for any future platform-event-style toggle set."

requirements-completed: [PLAT-02]

# Metrics
duration: 12min
completed: 2026-07-21
---

# Phase 175 Plan 03: Admin Per-Event Telegram Toggle Matrix Summary

**Catalog-driven `/admin/integrations` → Platform Alerts panel where the super-admin toggles Telegram delivery for each of the 10 PlatformEventKinds, grouped by category, with `pipeline_stuck`/`cron_failed` rendered non-interactive (lock icon) and rejected server-side if a save is attempted anyway.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-21T22:03:00Z (approx, first file read)
- **Completed:** 2026-07-21T22:15:00Z (approx)
- **Tasks:** 2 completed
- **Files modified:** 6 (3 created, 3 modified)

## Accomplishments
- `lib/admin/platform-event-preferences.ts` — `loadPlatformEventToggles()` returns all 10 catalog kinds joined with `platform_notification_preferences` state; locked kinds always resolve `enabled: true` regardless of the DB row.
- `app/admin/integrations/platform-event-actions.ts` — `savePlatformEventToggle({kind, enabled})` server action: `requireAdmin()` first, rejects unknown kinds, rejects disabling a locked kind (PLAT-03 defense in depth), upserts `platform_notification_preferences`, calls `invalidatePlatformPreferencesCache()` so the toggle is honored by the next `notifyOps()` call immediately (not after the 30s TTL), `revalidatePath('/admin/integrations')`, and audit-logs via `logAdminAction`.
- `app/admin/integrations/platform-event-toggles-form.tsx` — client component rendering the matrix grouped by `Tenant Activity` / `Job Failures` / `Critical / Reliability`, optimistic toggle with revert-on-error, locked rows show a `Lock` icon and a permanently disabled `Switch`.
- `lib/admin/audit-log.ts` — `AuditAction` union extended additively with `'platform_event.toggle'`.
- `lib/admin/integrations-providers.ts` — `Category.showPlatformEventToggles` flag added and set `true` on the existing `ops-alerts` category.
- `app/admin/integrations/integration-category-content.tsx` — loads `loadPlatformEventToggles()` when the flag is set and renders `<PlatformEventTogglesForm>` immediately after the existing `<TelegramChatIdForm>` block.
- `npx tsc -p tsconfig.ci.json --noEmit` clean after both tasks.

## Task Commits

Each task was committed atomically:

1. **Task 1: Admin toggle matrix — backend (loader, action, audit-log, category flag)** - `5fdbd7d3` (feat)
2. **Task 2: Admin toggle matrix — UI component + wiring** - `84b8b75c` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified
- `lib/admin/platform-event-preferences.ts` - `loadPlatformEventToggles()`, `PlatformEventToggleRow` interface
- `app/admin/integrations/platform-event-actions.ts` - `savePlatformEventToggle()` server action
- `lib/admin/audit-log.ts` - added `'platform_event.toggle'` to `AuditAction`
- `lib/admin/integrations-providers.ts` - added `showPlatformEventToggles?: boolean`, set `true` on `ops-alerts`
- `app/admin/integrations/platform-event-toggles-form.tsx` - `PlatformEventTogglesForm` client component
- `app/admin/integrations/integration-category-content.tsx` - loads toggles + renders the form on the Platform Alerts tab

## Decisions Made
- Executed the plan-check's prescribed code verbatim — it was already vetted against every existing convention in this codebase (loader posture, server-action shape, form styling), so no material deviation was needed.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

A sibling executor (175-02) was concurrently modifying `lib/actions/company.ts` and `lib/billing/connect-webhook.ts` in the same working tree (file-disjoint from this plan's admin-UI/actions files, per the concurrency contract). Task-commit staging (`5fdbd7d3`, `84b8b75c`) used pathspec-scoped `git add <paths>` correctly and captured only this plan's 6 files.

**Self-flagged mistake (final metadata commit only):** the final `docs(175-03)` commit (`66612305`) was run as a plain `git commit -m` without a trailing pathspec. At that moment a separate concurrent process (unrelated to 175-02) already had `.planning/phases/176-end-customer-consent-optout-quiet-hours/176-01-PLAN.md`, `176-04-PLAN.md`, and `176-05-PLAN.md` staged in the shared index, and the plain commit swept them in alongside `175-03-SUMMARY.md`. No content was lost or altered — `git status` confirms those 3 files are clean (working tree matches HEAD) with no orphaned diff — but they are now attributed to this commit's message instead of whatever commit the 176 process intended. Not reverted/rewritten per the no-destructive-history-edit constraint; flagging for the orchestrator's awareness. Root cause: the two task commits correctly used pathspec-scoped `git add` + plain `git commit` (safe, since only my staged files were in the index at that point), but the SUMMARY commit should have used `git commit -- .planning/phases/175-telegram-platform-events-toggles/175-03-SUMMARY.md` to stay safe regardless of what else was staged concurrently.

## User Setup Required

None new. Plan 01's `supabase/migrations/20260721000002_phase175_platform_notification_preferences.sql` migration (manual-apply convention) is the same prerequisite this plan's `loadPlatformEventToggles()`/`savePlatformEventToggle()` depend on — if it has not yet been applied to prod, the panel will still render (defaulting every non-locked kind to `enabled: true`, fail-open) but saves will error until the table exists.

## Next Phase Readiness
- Super-admin can now view and edit the full 10-event Telegram toggle matrix from `/admin/integrations` → Platform Alerts, with locked events structurally non-interactive both client- and server-side.
- The UI needs no changes if Plan 02 or a future plan grows the `PLATFORM_EVENT_KINDS` catalog further — it is fully catalog-driven.
- With Plan 01 (catalog + gate), Plan 02 (call-site routing), and this plan (admin toggle UI) all landed, PLAT-01/02/03 are demonstrably complete end-to-end pending prod migration application.

---
*Phase: 175-telegram-platform-events-toggles*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 6 claimed files found on disk; both task commits (`5fdbd7d3`, `84b8b75c`) verified present in git log.
