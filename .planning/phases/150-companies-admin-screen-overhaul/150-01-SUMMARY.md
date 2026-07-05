---
phase: 150-companies-admin-screen-overhaul
plan: 01
subsystem: admin
tags: [nextjs, supabase, server-components, pagination, search, filters]

# Dependency graph
requires:
  - phase: 93-super-admin-event-log-ui
    provides: "Event Log searchParams-driven filter/search/pagination pattern (app/admin/events/page.tsx + events-controls.tsx) mirrored verbatim for Companies"
  - phase: 149-admin-sales-mode-handoff
    provides: "HandoffButton component + Demo Accounts section on the companies admin page"
provides:
  - "Server-side searched, filtered, paginated app/admin/companies/page.tsx (All Companies)"
  - "app/admin/companies/companies-controls.tsx client component (search + 3 filter Selects + Refresh)"
  - "Email-to-company resolution via auth.admin.listUsers() + company_members (reusable pattern for future admin surfaces)"
affects: [151-super-admin-support-mode-tenant-impersonation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "searchParams-driven server component filter/search/pagination (Phase-93 Event Log pattern reused for a 2nd admin surface)"
    - "Email search resolves through auth.admin.listUsers() + a membership join table, never a business-contact email column"

key-files:
  created:
    - app/admin/companies/companies-controls.tsx
    - tests/unit/admin/companies-route-gate.test.ts
    - tests/unit/admin/companies-email-search.test.ts
    - tests/unit/admin/companies-filters.test.ts
    - tests/unit/admin/companies-pagination.test.ts
    - tests/unit/admin/companies-controls.test.ts
  modified:
    - app/admin/companies/page.tsx

key-decisions:
  - "Total-count header sentence simplified to the single UI-SPEC-mandated \"{total} companies total\" string (sourced from the paginated query's exact count), dropping the old override-subcount 3-branch phrasing since it no longer matches filtered-page semantics"
  - "Unmatched email search forces zero rows via an explicit sentinel-id .eq() fallback in addition to relying on .in('id', []) semantics, for defense-in-depth against client-library short-circuiting"

patterns-established:
  - "Second admin surface (Companies) now shares the exact structural contract as Event Log (Phase 93): requireAdmin() index-ordering test, PAGE_SIZE + .range()/count:'exact' pagination test, pageUrl() param-preservation, and a 'use client' controls component with router.replace()/router.refresh()"

requirements-completed: [ADMINCO-01, ADMINCO-02, ADMINCO-03, ADMINCO-04]

duration: 12min
completed: 2026-07-05
---

# Phase 150 Plan 01: Companies Admin Screen Overhaul Summary

**Rewrote `app/admin/companies/page.tsx` from a flat unpaginated list into a server-side searched/filtered/paginated admin surface (name+email search, tier/AI-override/demo-vs-real filters, PAGE_SIZE=25 pagination), mirroring the Phase-93 Event Log pattern verbatim while keeping Demo Accounts, HandoffButton, and "Configure →" untouched.**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-07-05T14:01:30Z
- **Completed:** 2026-07-05T14:11:XXZ
- **Tasks:** 3 completed
- **Files modified:** 7 (2 source files, 5 test files)

## Accomplishments
- All Companies table now supports server-side search by company name or by the email of the user who owns it (via `auth.admin.listUsers()` + `company_members`, never `companies.email`), never loading the full table client-side
- Three independently toggleable filters (tier, AI-override presence, demo-vs-real) combine with AND semantics in a single chainable Supabase query builder
- Server-side pagination (`PAGE_SIZE = 25`, `.range()` + `{count:'exact'}`) with Prev/Next links that preserve all active search/filter params via a `pageUrl()` helper, and a "{total} companies total" count that reflects the current filtered result set
- Demo Accounts section remains a fully independent, unfiltered, unpaginated query — untouched by any All Companies search/filter/page state
- `HandoffButton` and "Configure →" render unchanged with identical props in both sections

## Task Commits

Each task was committed atomically:

1. **Task 1: Write Wave 0 failing tests for route gate, email search, filters, pagination, and controls** - `36315180` (test)
2. **Task 2: Rewrite app/admin/companies/page.tsx with searchParams-driven filter/search/pagination** - `a994c019` (feat)
3. **Task 3: Create companies-controls.tsx client component and verify full phase suite** - `be504679` (feat)

_TDD flow: RED (Task 1, 18/22 assertions failing against the pre-overhaul codebase) → GREEN (Tasks 2+3, all 22 Wave-0 assertions passing)._

## Files Created/Modified
- `app/admin/companies/page.tsx` - Rewritten: `requireAdmin()` → `requireServiceClient()` → email resolution → chainable filtered/paginated "All Companies" query → independent unfiltered Demo Accounts query → `pageUrl()` → JSX render with `EmptyState` (filtered vs. true-zero) and Prev/Next pagination
- `app/admin/companies/companies-controls.tsx` - New `'use client'` component: search input (commits on Enter/blur) + Tier/AI-override/Demo-Real `Select` filters (each resets `page` on change) + Refresh button (`router.refresh()`)
- `tests/unit/admin/companies-route-gate.test.ts` - Static-source contract: `requireAdmin()` precedes `requireServiceClient()`, `force-dynamic` export, `.range()` appears exactly once (Demo Accounts independence)
- `tests/unit/admin/companies-email-search.test.ts` - Static-source contract: email resolves via `svc.auth.admin.listUsers()` + `company_members`, never `.ilike('email'`, uses `.in('id',` not `.eq('id',`
- `tests/unit/admin/companies-filters.test.ts` - Static-source contract: `.eq('tier',` + both branches of `ai_model_override`/`demo_estimate_quota` tri-state filters + `tiers` import from `@/lib/entitlements`
- `tests/unit/admin/companies-pagination.test.ts` - Static-source contract: `PAGE_SIZE = 25`, `.range(`, `count: 'exact'`, `pageUrl` helper, empty-resolved-ids zero-row guard
- `tests/unit/admin/companies-controls.test.ts` - Static-source contract: `'use client'`, `router.refresh()`, `router.replace(`, three `pushParam()` keys, `onKeyDown`/`onBlur` search commit

## Decisions Made
- Simplified the header total-count sentence to the single UI-SPEC string `"{total} companies total"` sourced from the paginated query's `count`, replacing the old 3-branch override-subcount phrasing (which no longer matched filtered-page semantics — the plan explicitly called this out as the simplest correct option)
- Kept the sentinel-id `.eq('id', '00000000-...')` fallback alongside `.in('id', [])` for the unmatched-email case, as specified in the plan, for defense-in-depth
- `companies-controls.tsx` was created during Task 2 (not deferred to Task 3) because `page.tsx` imports it and needs it to compile/pass Task 2's tests; Task 3's action of "creating" it was effectively a verification pass confirming its contract and running the full regression suite — documented here since the plan's task boundary assumed sequential file creation but TypeScript compilation required both files to exist together

## Deviations from Plan

None — plan executed exactly as written. The only implementation-order nuance (creating `companies-controls.tsx` alongside `page.tsx` rather than strictly after it) was necessary for TypeScript compilation and is noted above under Decisions, not a scope or behavior deviation; Task 3 still independently verified the controls file's full contract and ran the complete regression suite as specified.

## Issues Encountered

`npm test` full-suite run surfaced 2 pre-existing, out-of-scope failures unrelated to this plan's files (logged to `deferred-items.md`):
- `tests/integration/blog-rls.test.ts` (2 failures) — requires a live Supabase connection, fails without one in this environment
- `tests/unit/components/landing-page.test.tsx` (1 failure) — async `findByRole` timing flake on an unrelated `AuthDialog` modal test

Neither file was touched by this plan (confirmed via `git log` — both last modified by an unrelated prior commit `5dcbe578`). All 5 Wave-0 companies test files (22 assertions) and the Phase-93 Event Log regression check (7 assertions) are green. `tsc --noEmit` shows zero errors attributable to `app/admin/companies/*`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- ADMINCO-01..04 fully verified: search, filters, pagination, and Demo Accounts/HandoffButton/Configure preservation all confirmed via static-source contract tests plus manual sanity read
- The `auth.admin.listUsers() + company_members` email-resolution pattern established here is directly reusable for Phase 151 (Super Admin Support Mode / Tenant Impersonation), which will also need to resolve a tenant company from an admin-entered identifier
- No blockers for subsequent phases in the v4.15 milestone

---
*Phase: 150-companies-admin-screen-overhaul*
*Completed: 2026-07-05*

## Self-Check: PASSED

All claimed files verified present on disk (7 files) and all claimed commit hashes verified present in git history (36315180, a994c019, be504679).
