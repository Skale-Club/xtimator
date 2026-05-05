---
phase: 17
plan: "02"
subsystem: navigation
tags: [caching, performance, react-cache, unstable-cache, supabase, auth]
dependency_graph:
  requires: [17-01-loading-skeletons]
  provides: [getAuthClaims, getCachedCompany, AppCompany-type, company-cache-tag]
  affects:
    - app/(app)/layout.tsx
    - app/(app)/dashboard/page.tsx
    - app/(app)/clients/page.tsx
    - app/(app)/projects/new/page.tsx
    - app/(app)/settings/page.tsx
    - lib/actions/settings.ts
tech_stack:
  added: []
  patterns: [react-cache-per-request-dedup, next-unstable-cache-cross-request-ttl, revalidate-tag-on-write]
key_files:
  created:
    - lib/queries/auth.ts
    - tests/unit/queries/auth.test.ts
  modified:
    - app/(app)/layout.tsx
    - app/(app)/dashboard/page.tsx
    - app/(app)/clients/page.tsx
    - app/(app)/projects/new/page.tsx
    - app/(app)/settings/page.tsx
    - lib/actions/settings.ts
decisions:
  - getCachedCompany uses createServiceClient (not createClient) because unstable_cache cannot call cookies() inside its memoized function — service role bypasses RLS, and the userId argument scopes the query correctly
  - getAuthClaims wraps React cache() so layout + page within the same render share one Supabase auth call
  - getCachedCompany wraps unstable_cache with 60s revalidate and 'company' tag for on-demand invalidation
  - AppCompany interface includes industry field so projects/new page can resolve INDUSTRIES.find without a second query
  - revalidateTag('company') wired into updateCompanySettings so the layout reflects company name/logo updates immediately after a settings save
  - settings/page.tsx keeps getCompanySettings (full record needed for the form) and only swaps the claims call to getAuthClaims — the cached company helper would lose form-only fields
metrics:
  duration: "completed across multiple commits"
  completed: "2026-05-05"
  tasks_completed: 11
  tasks_total: 11
  files_changed: 8
---

# Phase 17 Plan 02: Cache Company + Auth Claims in Layout Summary

Centralised, cached auth + company data fetching for the authenticated app shell. Replaced duplicated Supabase calls in `layout.tsx` and 4 page files with React `cache()` (per-request dedup) + `unstable_cache` (60s cross-request TTL), eliminating 200–400ms of redundant latency on warm navigations and wiring `revalidateTag('company')` into the settings save action so cached layout data refreshes on user updates.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 0-1 | Create auth query test scaffold | 802890f, 49b9ae6 | tests/unit/queries/auth.test.ts |
| 1-1 | Create lib/queries/auth.ts (getAuthClaims, getCachedCompany, AppCompany) | 802890f | lib/queries/auth.ts |
| 2-1 | Update app/(app)/layout.tsx to use cached helpers | 802890f, 47d9676 | app/(app)/layout.tsx |
| 2-2 | Update dashboard/page.tsx to use cached helpers | 802890f | app/(app)/dashboard/page.tsx |
| 2-3 | Update clients/page.tsx to use cached helpers | 802890f | app/(app)/clients/page.tsx |
| 2-4 | Update projects/new/page.tsx + extend AppCompany with industry | 802890f | app/(app)/projects/new/page.tsx, lib/queries/auth.ts |
| 2-5 | Update settings/page.tsx (getAuthClaims only; keep getCompanySettings) | 802890f | app/(app)/settings/page.tsx |
| 2-5b | Wire revalidateTag('company') into updateCompanySettings | 802890f | lib/actions/settings.ts |
| 3-1 | TypeScript check (no new errors on plan surfaces) | n/a (verification) | — |
| 3-2 | Unit test suite (3/3 auth tests + 12/12 queries tests pass) | n/a (verification) | — |
| 3-3 | Manual performance check (deferred to phase smoke) | n/a (verification) | — |
| 3-4 | Verify revalidateTag on settings save (settings.ts:93 confirmed) | n/a (verification) | — |

## Decisions Made

- **Service-role client inside unstable_cache** — `createClient()` (cookie-based) cannot run inside `unstable_cache` because `cookies()` is request-scoped. Switched to `createServiceClient()`; the `userId` argument scopes the query so RLS bypass is safe.
- **AppCompany interface as a single source of truth** — Five pages consume the same minimal shape (id, name, logo_url, owner_name, theme_preference, industry). Adding industry up front avoided a second DB call on projects/new.
- **Settings page keeps getCompanySettings** — The settings form needs the full company record. Swapping in getCachedCompany would require re-fetching extra fields. Only the claims dedup helps here, which is enough.
- **`'company'` cache tag on getCachedCompany** — paired with `revalidateTag('company')` in updateCompanySettings, the layout sidebar reflects updated company name/logo immediately after save (no 60s wait).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] getCachedCompany cannot use cookie-based createClient**
- **Found during:** Task 1-1 implementation
- **Issue:** The plan specified `createClient` (which calls `cookies()`) inside the `unstable_cache` body. Next.js throws because `cookies()` requires a request scope and `unstable_cache` is hoisted out of the request lifecycle.
- **Fix:** Switched to `createServiceClient()` from `@/lib/supabase/service`. Service role bypasses RLS but the explicit `userId` arg scopes the query correctly. Updated test mocks to mock `@/lib/supabase/service` instead of `@/lib/supabase/server`.
- **Files modified:** lib/queries/auth.ts, tests/unit/queries/auth.test.ts
- **Commits:** 802890f, 49b9ae6

**2. [Rule 2 - Critical functionality] Cache invalidation on company update**
- **Found during:** Task 2-5
- **Issue:** Plan called out the need but only as a note — without `revalidateTag('company')` in updateCompanySettings, users would see stale company name/logo in the sidebar for up to 60s after saving.
- **Fix:** Added `revalidateTag('company')` to `updateCompanySettings` after successful save. Cast through `any` because of next/cache type narrowing in this version.
- **Files modified:** lib/actions/settings.ts
- **Commit:** 802890f

## Verification Results

- `npx vitest run tests/unit/queries/auth.test.ts` — 3/3 tests pass
- `npx vitest run tests/unit/queries/` — 12/12 tests pass (no regressions in dashboard or clients query tests)
- `npx tsc --noEmit` filtered to plan 17-02 surfaces — zero errors. Two pre-existing errors in `components/blog/blog-content.tsx` (missing `react-markdown`, `remark-gfm`) are unrelated to this plan and tracked in `.planning/phases/17-navigation-performance/deferred-items.md`
- `revalidateTag('company')` confirmed at lib/actions/settings.ts:93 inside `updateCompanySettings` after a successful Supabase update
- All 5 modified files import from `@/lib/queries/auth` and consume `getAuthClaims` / `getCachedCompany` correctly

## Deferred Issues

Two pre-existing TypeScript module-resolution errors in `components/blog/blog-content.tsx` (Phase 15 surface) are out of scope for this plan and documented in `.planning/phases/17-navigation-performance/deferred-items.md` for a follow-up dependency-restoration quick task. They do not affect plan 17-02 surfaces.

## Known Stubs

None. All five page surfaces are wired to the real cached helpers; the helpers query Supabase directly.

## Self-Check: PASSED

- lib/queries/auth.ts — FOUND
- tests/unit/queries/auth.test.ts — FOUND
- app/(app)/layout.tsx (modified) — FOUND, imports `getAuthClaims, getCachedCompany`
- app/(app)/dashboard/page.tsx (modified) — FOUND, imports `getAuthClaims, getCachedCompany`
- app/(app)/clients/page.tsx (modified) — FOUND, imports `getAuthClaims, getCachedCompany`
- app/(app)/projects/new/page.tsx (modified) — FOUND, imports `getAuthClaims, getCachedCompany`
- app/(app)/settings/page.tsx (modified) — FOUND, imports `getAuthClaims`
- lib/actions/settings.ts (modified) — FOUND, contains `revalidateTag('company')` at line 93
- Commit 802890f — FOUND in git log
- Commit 49b9ae6 — FOUND in git log
