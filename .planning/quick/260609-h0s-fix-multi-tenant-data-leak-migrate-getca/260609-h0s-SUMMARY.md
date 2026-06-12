---
phase: quick-260609-h0s
plan: 01
subsystem: api
tags: [multi-tenancy, rls, cookies, next-app-router, data-leak, getActiveCompany]

# Dependency graph
requires:
  - phase: 79-04 (v4.0 Multi-Tenancy)
    provides: getActiveCompany() cookie-based resolver in lib/queries/active-company.ts
provides:
  - All 11 remaining page/route data-loaders resolve the active company via the active_company_id cookie
  - Cross-tenant data leak closed for users owning 2+ companies (price-book, projects, dashboard, clients, capture flow, notifications)
affects: [multi-tenancy, company-switcher, notifications, capture-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Page/route data-loaders call getActiveCompany() (zero-arg, cookie-scoped) instead of getCachedCompany(claims.sub) (user_id-scoped)"

key-files:
  created: []
  modified:
    - app/(app)/price-book/page.tsx
    - app/(app)/projects/page.tsx
    - app/(app)/dashboard/page.tsx
    - app/(app)/clients/page.tsx
    - app/(capture)/layout.tsx
    - app/(capture)/projects/[id]/capture/page.tsx
    - app/(capture)/projects/[id]/describe/page.tsx
    - app/(capture)/projects/[id]/photos-input/page.tsx
    - app/api/notifications/[id]/read/route.ts
    - app/api/notifications/mark-all-read/route.ts
    - app/api/notifications/list/route.ts

key-decisions:
  - "getCachedCompany export preserved in lib/queries/auth.ts (D-10) — only its app/ callers were removed; tests/unit/app-layout-active-company.test.ts contract still green"
  - "getAuthClaims retained in every file for the unauthenticated -> /?auth=login (pages) / 401 (routes) redirect distinction; only the company resolver line changed"

patterns-established:
  - "Multi-tenant data loaders must resolve company via getActiveCompany() (cookie) — never getCachedCompany(userId), which ignores the active-company switcher"

requirements-completed: [MULTITENANT-LEAK-FIX]

# Metrics
duration: 12min
completed: 2026-06-09
---

# Phase quick-260609-h0s Plan 01: Fix Multi-Tenant Data Leak (migrate getCachedCompany -> getActiveCompany) Summary

**Migrated the 11 remaining page/route data-loaders from the user_id-scoped getCachedCompany(claims.sub) resolver to the cookie-scoped getActiveCompany(), closing a cross-tenant data leak for users who own 2+ companies.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-06-09T15:14:00Z (approx)
- **Completed:** 2026-06-09T15:26:37Z
- **Tasks:** 2 (1 migration task + 1 verification task)
- **Files modified:** 11

## Accomplishments
- Eliminated the multi-tenant leak: price-book, projects, dashboard, clients, the full (capture) flow, and the 3 notifications API routes now load the company selected by the `active_company_id` cookie instead of the user's first-owned company.
- Zero `getCachedCompany(` callers remain anywhere under `app/` (verified by grep — includes `app/(app)/settings/`).
- Preserved the legacy `getCachedCompany` export in `lib/queries/auth.ts` (D-10) so the contract test `tests/unit/app-layout-active-company.test.ts` stays green.
- Drop-in replacement confirmed type-safe: every downstream consumer of `company.id`, `company.currency_code`, `company.owner_name`, `company.name` type-checks against the identical `AppCompany` shape returned by `getActiveCompany()`.

## Task Commits

1. **Task 1: Migrate all 11 data-loaders from getCachedCompany to getActiveCompany** - `ef5b89d` (fix)

**Task 2: Verify zero remaining app/ callers, preserved export, and clean typecheck** — verification-only, no commit (no files modified).

**Plan metadata:** handled by orchestrator (docs commit).

## Files Created/Modified
- `app/(app)/price-book/page.tsx` - Price book loader scoped to active company
- `app/(app)/projects/page.tsx` - Projects list loader scoped to active company
- `app/(app)/dashboard/page.tsx` - Dashboard loader scoped to active company
- `app/(app)/clients/page.tsx` - Clients loader scoped to active company
- `app/(capture)/layout.tsx` - Capture flow layout guard scoped to active company
- `app/(capture)/projects/[id]/capture/page.tsx` - Capture step loader scoped to active company
- `app/(capture)/projects/[id]/describe/page.tsx` - Describe step loader scoped to active company
- `app/(capture)/projects/[id]/photos-input/page.tsx` - Photos-input step loader scoped to active company
- `app/api/notifications/[id]/read/route.ts` - Mark-one-read route scoped to active company
- `app/api/notifications/mark-all-read/route.ts` - Mark-all-read route scoped to active company
- `app/api/notifications/list/route.ts` - Notifications list route scoped to active company

Each file: dropped `getCachedCompany` from the `@/lib/queries/auth` import (kept `getAuthClaims`), added `import { getActiveCompany } from '@/lib/queries/active-company'`, and replaced the `getCachedCompany(claims.sub[ as string])` call with the zero-arg `getActiveCompany()`. Auth checks and onboarding/404 guards left unchanged.

## Decisions Made
- None beyond the plan. Executed the mechanical migration exactly as specified; `getCachedCompany` export and `getAuthClaims` usage preserved per plan.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Pre-existing test/typecheck failures (NOT caused by this migration).** The full `npm run test` run reported 56 failing tests, and `tsc --noEmit` reported 3 errors — all in files this plan never touched:
  - Test failures live in unrelated suites (e.g. `tests/unit/tour/tour-telemetry.test.ts`, `tests/unit/whatsapp/client.test.ts`, `tests/unit/queries/auth.test.ts`'s `requireServiceClient` mock gap).
  - The 3 tsc errors are all in `tests/unit/notifications/account-emails.test.ts` (a `Branding` type missing `metaDescription`/`ogImageUrl`/`canonicalBaseUrl`/`faviconUrl`).
  - Confirmed pre-existing: `git diff a49393a HEAD` for `lib/queries/auth.ts`, `tests/unit/queries/auth.test.ts`, `lib/supabase/service.ts`, and `tests/unit/notifications/account-emails.test.ts` is empty (byte-identical to the parent commit before this work).
  - The plan-critical D-10 contract test `tests/unit/app-layout-active-company.test.ts` PASSES.
  - Per the task constraints, `npx tsc --noEmit` was used for the typecheck portion (full `npm run build` substituted) — there are zero type errors in production source or any of the 11 migrated files. These pre-existing failures are out of scope (per the executor scope boundary) and were not fixed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The multi-tenant leak across all page/route loaders is closed. A user owning 2+ companies now sees the cookie-selected active company's data everywhere, matching the switcher UI.
- The legacy `getCachedCompany` resolver remains exported for backward-compat / the D-10 test contract but has no `app/` callers.
- Note for a future cleanup pass: the pre-existing `tests/unit/queries/auth.test.ts` (`requireServiceClient` mock) and `tests/unit/notifications/account-emails.test.ts` (`Branding` shape) failures predate this work and remain open.

## Self-Check: PASSED

- FOUND: `.planning/quick/260609-h0s-fix-multi-tenant-data-leak-migrate-getca/260609-h0s-SUMMARY.md`
- FOUND: `app/(app)/price-book/page.tsx` (+ all 11 migrated files)
- FOUND: `lib/queries/auth.ts` (getCachedCompany export preserved)
- FOUND commit: `ef5b89d`

---
*Phase: quick-260609-h0s*
*Completed: 2026-06-09*
