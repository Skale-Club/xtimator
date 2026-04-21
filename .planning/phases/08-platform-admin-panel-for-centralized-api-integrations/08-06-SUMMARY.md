---
phase: 08-platform-admin-panel-for-centralized-api-integrations
plan: "06"
subsystem: ui
tags: [admin, platform-admins, supabase, server-actions, vitest, playwright, shadcn, react-hook-form, zod]

# Dependency graph
requires:
  - phase: 08-platform-admin-panel-for-centralized-api-integrations
    provides: "AdminShell layout (Plan 04), addAdminSchema (Plan 04), requireAdmin() (Plan 03), platform_admins table + last-admin trigger (Plan 01)"
provides:
  - "addPlatformAdmin server action — email lookup via service-role listUsers, friendly inline errors for not-found + already-admin"
  - "removePlatformAdmin server action — trigger-error translation to UI-SPEC copy, revalidatePath on success"
  - "/admin/admins page — lists current admins with 'Admin since' dates, Add dialog, Remove with AlertDialog confirmation"
  - "AdminList client component — shadcn Table, avatar, disabled+tooltip guard for last-admin self-removal"
  - "AddAdminDialog client component — react-hook-form + zod, inline error display, toast on success"
  - "6/6 vitest unit tests for both server actions (mocked Supabase client)"
  - "Playwright e2e spec env-gated on TEST_ADMIN_EMAIL — asserts inline error for unknown email"
  - "Human-verification checkpoint approved across all three Wave-3 admin pages (integrations, branding, admins)"
affects:
  - 08-platform-admin-panel-for-centralized-api-integrations (Plans 07+, wave close-out)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED→GREEN commit pair for server action unit tests with chainable Supabase mock"
    - "Discriminated-union return { ok: boolean; message?: string } from server actions for inline error surfacing"
    - "Auth trigger error message regex matching to translate DB-raised exception to UI-SPEC copy"
    - "service-role auth.admin.listUsers + Array.find for email→user lookup without custom RPC"
    - "Last-admin guard: button disabled when row.user_id === currentUserId && admins.length === 1, tooltip via Radix TooltipProvider"

key-files:
  created:
    - app/admin/admins/actions.ts
    - app/admin/admins/page.tsx
    - app/admin/admins/admin-list.tsx
    - app/admin/admins/add-admin-dialog.tsx
    - tests/unit/admin-actions.test.ts
    - tests/e2e/admin-admins.spec.ts
  modified: []

key-decisions:
  - "Discriminated-union return type { ok: boolean; message?: string } for server actions so clients surface inline errors verbatim without try/catch"
  - "service-role auth.admin.listUsers (perPage: 1000) + JS Array.find for email lookup — fits small admin sets, avoids custom RPC"
  - "Trigger error matched by /Cannot remove the last platform admin/i regex — catch-branch returns UI-SPEC copy without exposing raw Postgres message"
  - "Self+only-admin Remove button disabled client-side (not just server) — immediate UX feedback without round-trip"

patterns-established:
  - "Server action unit tests: vi.mock requireAdmin to fixed context + vi.mock createServiceClient to chainable spy factory"
  - "E2e spec gated at describe level with test.skip(!process.env.TEST_ADMIN_EMAIL) — exits 0 in CI without credentials"

requirements-completed: [ADMIN-03]

# Metrics
duration: 15min
completed: 2026-04-20
---

# Phase 08 Plan 06: /admin/admins — Platform Admin Management Summary

**Platform admin CRUD with last-admin guard, trigger-error translation, TDD unit tests, and human-verified Wave-3 checkpoint across all three admin pages**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-20T21:29:00Z
- **Completed:** 2026-04-20T21:41:37Z
- **Tasks:** 3 (Task 1 RED + GREEN, Task 2, Task 3 human-verify)
- **Files modified:** 6 created

## Accomplishments

- Shipped `addPlatformAdmin` and `removePlatformAdmin` server actions with full discriminated-union error handling — email-not-found, already-admin, and last-admin trigger branches all surface UI-SPEC copy verbatim
- Built `/admin/admins` page, `AdminList` (shadcn Table with AlertDialog remove), and `AddAdminDialog` (react-hook-form + zod, inline error) — all wired to server actions, all gated by `requireAdmin()`
- Completed the final Wave-3 human-verification checkpoint covering all three admin pages (integrations, branding, admins) — user approved

## Task Commits

Each task was committed atomically:

1. **Task 1 RED: failing unit tests for admin server actions** — `7c51616` (test)
2. **Task 1 GREEN: addPlatformAdmin + removePlatformAdmin server actions** — `3fb1d16` (feat)
3. **Task 2: /admin/admins page + AdminList + AddAdminDialog + e2e spec** — `c8ea8a8` (feat)
4. **Task 3: human-verify checkpoint** — approved by user (no commit — verification only)

_Note: Task 1 used TDD RED→GREEN pair commits._

## Files Created/Modified

- `app/admin/admins/actions.ts` — `addPlatformAdmin` + `removePlatformAdmin` server actions with service-role lookups and trigger-error translation
- `app/admin/admins/page.tsx` — server component; `requireAdmin()` gate, loads platform_admins joined to auth.users via Map, renders page shell
- `app/admin/admins/admin-list.tsx` — client component; shadcn Table with avatar, "Admin since" date badge, destructive Remove (AlertDialog), disabled+tooltip guard for last-admin self-removal
- `app/admin/admins/add-admin-dialog.tsx` — client component; shadcn Dialog + react-hook-form + addAdminSchema; inline server-action error display; toast + close on success
- `tests/unit/admin-actions.test.ts` — 6 vitest tests: add happy path, email not found, already admin; remove happy path, last-admin trigger, generic error — all pass (6/6)
- `tests/e2e/admin-admins.spec.ts` — Playwright spec env-gated on TEST_ADMIN_EMAIL/TEST_ADMIN_PASSWORD; asserts inline "No user registered" error for unknown email

## Decisions Made

- Used discriminated-union `{ ok: boolean; message?: string }` return type for server actions — clients receive typed inline errors without try/catch on the call site
- Chose `auth.admin.listUsers({ perPage: 1000 }) + Array.find` for email-to-user lookup rather than a custom RPC — sufficient for small admin sets, zero migration needed
- Matched trigger error with `/Cannot remove the last platform admin/i` regex — translates raw Postgres exception to UI-SPEC copy without exposing internal message text
- Last-admin Remove button disabled client-side in addition to server guard — provides immediate UX feedback (tooltip: "You are the only admin. Add another admin before removing yourself.")

## Deviations from Plan

None — plan executed exactly as written. TDD RED→GREEN cycle matched the plan's behavior and action specs. All 6 unit tests pass. E2e spec exits 0 (skips without credentials). Human-verify checkpoint approved.

## Issues Encountered

None.

## Known Stubs

None — all data is wired to live Supabase service-role queries. No placeholder values flow to UI rendering.

## User Setup Required

None — no new environment variables introduced in this plan. Existing `SUPABASE_SERVICE_ROLE_KEY` (Plan 01) is sufficient. Admin bootstrap documented in `supabase/ADMIN-BOOTSTRAP.md`.

## Next Phase Readiness

- All three Wave-3 admin pages are complete and human-verified: integrations (Plan 04), branding (Plan 05), admins (Plan 06)
- Wave-3 human checkpoint closed — remaining Phase 08 plans (07+) can proceed
- `platform_admins` table, `requireAdmin()`, `AdminShell`, `addAdminSchema`, and all three admin feature pages are available as stable dependencies

---
*Phase: 08-platform-admin-panel-for-centralized-api-integrations*
*Completed: 2026-04-20*
