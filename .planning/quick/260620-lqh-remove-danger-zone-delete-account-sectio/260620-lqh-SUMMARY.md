---
phase: quick-260620-lqh
plan: 01
subsystem: ui
tags: [settings, account, react, next-app-router, eslint]

# Dependency graph
requires:
  - phase: settings-account-ui
    provides: AccountSection component + account loading skeleton
provides:
  - Account settings panel limited to Change Password + Change Email (no self-deletion UI)
  - Account loading skeleton without the Danger Zone card
affects: [settings-account, account-deletion-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "UI-only affordance removal: strip JSX block + verify each now-orphaned import/state/handler before deleting it, leaving the backend server action intact"

key-files:
  created: []
  modified:
    - components/settings/account-section.tsx
    - app/(app)/settings/(tabs)/account/loading.tsx

key-decisions:
  - "Left lib/actions/settings.ts deleteAccount export in place (unused) — UI-only change, backend may be wired to other/admin flows"
  - "Kept loading.tsx skeleton description matching the real page.tsx header copy rather than editing copy out of scope"

patterns-established:
  - "Before deleting an orphaned import/var, grep-confirm zero remaining references, then rely on tsc + eslint no-unused-vars as the gate"

requirements-completed: [QUICK-LQH-01]

# Metrics
duration: 4min
completed: 2026-06-20
---

# Phase quick-260620-lqh Plan 01: Remove Danger Zone / Delete Account Section Summary

**Removed the self-account-deletion UI ("Danger Zone" / Delete Account) from the account settings panel and its loading skeleton, leaving the `deleteAccount` server action untouched.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-20T19:41:39Z
- **Completed:** 2026-06-20T19:46:00Z
- **Tasks:** 2 of 2 complete
- **Files modified:** 2

## Accomplishments
- `components/settings/account-section.tsx` now renders only Change Password + Change Email — the entire Danger Zone block (heading, description, `AlertDialog` confirm dialog, Delete Account button) plus its preceding `<Separator />` are gone.
- Removed all code that became orphaned: `deleteAccount` import, `onDeleteAccount` handler, `isPendingDelete`/`startDeleteTransition`, the `useRouter` import + `router` const, and the full multi-line `AlertDialog*` import.
- `app/(app)/settings/(tabs)/account/loading.tsx` skeleton no longer contains the Danger Zone `SettingsCard`; it now mirrors the two-card (Password + Email) layout.
- `lib/actions/settings.ts` `deleteAccount` export verified intact (line 353) — confirmed unmodified in git.

## Task Commits

Each task was committed atomically:

1. **Task 1: Remove Danger Zone block + orphaned code from account-section.tsx** — `b034f39` (feat)
2. **Task 2: Remove Danger Zone skeleton from account loading.tsx** — `0ecaec4` (feat)
3. **Task 2 (re-apply): Re-remove Danger Zone skeleton after concurrent rewrite** — `2727438` (fix)

_Note: Task 2 required a second commit (`2727438`) because a concurrent branch refactor rewrote `loading.tsx` between Read and commit, re-introducing the Danger Zone card — see Issues Encountered._

## Files Created/Modified
- `components/settings/account-section.tsx` — Account settings form; Danger Zone delete-account affordance and all now-unused imports/state/handlers removed. Change Password + Change Email blocks and the separator between them retained.
- `app/(app)/settings/(tabs)/account/loading.tsx` — Account route loading skeleton; Danger Zone `SettingsCard` skeleton removed. All skeleton imports retained (still used by Password/Email cards).

## Decisions Made
- **Backend left intact:** Did not touch `lib/actions/settings.ts`; the `deleteAccount` server action stays exported (unused) per plan scope guardrails — it may be wired to other or future admin flows.
- **Skeleton description copy:** The loading skeleton's `SettingsPageSkeleton` description ("...manage irreversible account actions.") still matches the live `account/page.tsx` header. Editing that copy is out of scope (page.tsx is not in this plan's `files_modified`), and keeping them identical avoids a copy jump during the skeleton-to-loaded transition. Left as-is.

## Deviations from Plan

None — plan executed exactly as written. All six precise edits to `account-section.tsx` and the skeleton-card removal in `loading.tsx` were applied as specified. No deviation rules (1-4) were triggered.

## Issues Encountered

**Concurrent rewrite of `loading.tsx` by an in-flight branch refactor.**
- **What happened:** A separate settings-layout refactor (migrating skeletons from `SettingsShellSkeleton` wrappers to a `noPadding` `SettingsPageSkeleton`) was modifying many `app/(app)/settings/**` files on the same `dev` branch during execution. Between my Read of `loading.tsx` and my first commit, the file was rewritten on disk to the new structure — which re-introduced the Danger Zone card. My first `git add` (commit `0ecaec4`) therefore staged the externally-rewritten file without my removal.
- **How it was resolved:** Detected via the PostToolUse system reminder showing an unexpected on-disk structure. Re-read the current file, re-applied the Danger Zone `SettingsCard` removal to the new structure, and committed the isolated 7-line deletion as `2727438`. Verified the working-tree diff vs HEAD contained *only* my removal. Net on-disk result is correct: account skeleton has no Danger Zone card.
- **Scope safety:** Only `loading.tsx` was staged (never `git add .`); the many other concurrently-modified settings files were left untouched.

**Pre-existing project-wide tsc errors (out of scope).**
- Running `npx tsc --noEmit` surfaced 4 unrelated files with errors (Stripe `apiVersion` literal mismatch in `lib/billing/stripe-client.ts` + `app/admin/integrations/actions.ts`; test-fixture/mock type issues in two `tests/unit/**` files). None are in this task's files; the working tree shows them unmodified. Logged to `deferred-items.md` per the SCOPE BOUNDARY rule and not fixed. tsc reports zero errors for `account-section.tsx`.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness
- Account settings panel and its loading skeleton are consistent (Password + Email only).
- `deleteAccount` remains available as a server action if a future admin/automation flow needs it.
- Note for maintainers: the `dev` branch has an in-flight settings-layout (`noPadding`) refactor with many uncommitted/partially-committed files; coordinate before further settings work to avoid the same concurrent-edit collision.

## Self-Check: PASSED

- FOUND: `components/settings/account-section.tsx`
- FOUND: `app/(app)/settings/(tabs)/account/loading.tsx`
- FOUND: `.planning/quick/260620-lqh-remove-danger-zone-delete-account-sectio/260620-lqh-SUMMARY.md`
- FOUND: commit `b034f39` (Task 1)
- FOUND: commit `0ecaec4` (Task 2)
- FOUND: commit `2727438` (Task 2 re-apply)

---
*Phase: quick-260620-lqh*
*Completed: 2026-06-20*
