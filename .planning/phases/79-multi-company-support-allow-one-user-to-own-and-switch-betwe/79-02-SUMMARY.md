---
phase: 79-multi-company-support-allow-one-user-to-own-and-switch-betwe
plan: 02
subsystem: auth
tags: [multi-tenancy, cookies, unstable_cache, server-components, rls]

requires:
  - phase: 79-multi-company-support-allow-one-user-to-own-and-switch-betwe
    provides: company_members table with RLS gated by auth.uid() (Plan 01)
provides:
  - getActiveCompanyId() — cookie-first active company resolver with mandatory company_members validation and most-recent-membership fallback
  - getActiveCompany() — cached AppCompany loader keyed by activeCompanyId with tag 'company'
  - ACTIVE_COMPANY_COOKIE constant ('active_company_id') for reuse by Plan 03
  - ACTIVE_COMPANY_COOKIE_OPTIONS (httpOnly/sameSite=lax/path=/maxAge=30d) for reuse by Plan 03
affects: [79-03 add-mode, 79-04 layout-integration, 80-company-switch, 81-rls-tightening, 82-invite-flow]

tech-stack:
  added: []
  patterns:
    - "Cookie-as-state resolver pattern: cookie read → validate via RLS-bound client → fallback query → write cookie → return id"
    - "unstable_cache keyed by tenant-scoped id (activeCompanyId) instead of userId for multi-company correctness"
    - "Two-client split: authenticated client for validation/RLS-gated reads; service client only inside unstable_cache after upstream validation"

key-files:
  created:
    - lib/queries/active-company.ts
    - tests/unit/active-company-helpers.test.ts
  modified: []

key-decisions:
  - "Cookie write wrapped in try/catch — RSC read-only contexts cannot write Set-Cookie; the next server action / route handler request will succeed. Worst case: one extra company_members query per request until cookie sticks (T-79-02-04 accepted)."
  - "loadCompanyById takes activeCompanyId as a parameter (not userId) so unstable_cache key correctly invalidates per company, enabling Phase 80's revalidateTag('company') on switch."
  - "Mirrored existing AppCompany shape from lib/queries/auth.ts including currency_code (plan snippet omitted it — used the real interface to keep tsc green)."

patterns-established:
  - "Active-tenant resolver: cookie + validation + fallback + write, returning null when user has zero memberships"
  - "Service-role usage inside unstable_cache is safe ONLY when the id parameter is already validated upstream by an RLS-bound query"

requirements-completed: [D-05, D-06, D-07, D-08, D-09, D-11, D-16]

duration: 4min
completed: 2026-05-25
---

# Phase 79 Plan 02: Active Company Resolver Summary

**Cookie-first `getActiveCompanyId()` + cached `getActiveCompany()` helpers — the single entry point for multi-tenant state in every server-side request.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-26T01:58:06Z
- **Completed:** 2026-05-26T02:01:30Z
- **Tasks:** 1 (TDD: 1 red commit + 1 green commit)
- **Files modified:** 2 (1 created source, 1 created test)

## Accomplishments
- `lib/queries/active-company.ts` exports `getActiveCompanyId()` and `getActiveCompany()` matching the downstream contract Plan 04 will consume.
- Mandatory cookie validation against `company_members` on every read (D-08) — stale or foreign cookies fall through to the fallback path and get overwritten.
- Fallback selects the user's most-recently-created membership via foreign-table ordering on `companies.created_at DESC` (D-07).
- Cookie write uses the documented options (`httpOnly: true, sameSite: 'lax', path: '/', maxAge: 30 days`) wrapped in try/catch for RSC-read-only contexts (D-05/D-06).
- `getActiveCompany()` wraps the row load in `unstable_cache` keyed by `activeCompanyId` with tag `'company'`, ready for `revalidateTag('company')` on switch in Phase 80 (D-11).
- 8/8 unit tests green covering all six truth conditions plus unauthenticated short-circuit and null-propagation through `getActiveCompany()`.
- `npx tsc --noEmit` exits 0.

## Task Commits

1. **Task 1 (RED): tests for getActiveCompanyId/getActiveCompany** — `4fb9c7c` (test)
2. **Task 1 (GREEN): getActiveCompanyId + getActiveCompany implementation** — `5737f13` (feat)

Plan metadata commit will follow this summary.

## Files Created/Modified
- `lib/queries/active-company.ts` — New. Cookie resolver (`getActiveCompanyId`) + cached AppCompany loader (`getActiveCompany`) plus the two reusable constants (`ACTIVE_COMPANY_COOKIE`, `ACTIVE_COMPANY_COOKIE_OPTIONS`).
- `tests/unit/active-company-helpers.test.ts` — New. 8 vitest cases covering cookie precedence, validation rejection, fallback ordering, zero-membership null return, unauthenticated short-circuit, and `getActiveCompany` cache key + null propagation.

## Decisions Made
- **AppCompany currency_code parity.** The plan snippet's column list omitted `currency_code`, but the live `AppCompany` interface in `lib/queries/auth.ts` includes it. Used the real interface (`select('id, name, logo_url, owner_name, theme_preference, industry, currency_code')`) so the cached row remains drop-in compatible with existing consumers of `AppCompany`.
- **Mock chain redesign during TDD.** Initial mock helper assumed validate-chain always runs before fallback-chain (counter-based). That broke for cookie-missing tests where only the fallback runs. Rewrote the helper so a single `.eq()` leaf object exposes both `.eq()` (validation continuation) and `.order()` (fallback continuation), letting the implementation drive which path executes. No production-code change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] AppCompany column list mismatch**
- **Found during:** Task 1 GREEN (implementing `loadCompanyById`)
- **Issue:** Plan's snippet selects 6 columns (`id, name, logo_url, owner_name, theme_preference, industry`) but the live `AppCompany` interface in `lib/queries/auth.ts` declares 7 fields including `currency_code: string` (non-nullable). Returning the smaller row would have failed type assertions downstream.
- **Fix:** Added `currency_code` to the select list inside `loadCompanyById`. No interface changes; mirrors `getCachedCompany` exactly.
- **Files modified:** `lib/queries/active-company.ts`
- **Verification:** `npx tsc --noEmit` exits 0; T7 asserts the returned row shape.
- **Committed in:** `5737f13`

**2. [Rule 3 — Blocking] Test mock chain ambiguity**
- **Found during:** Task 1 GREEN (first test run after implementation)
- **Issue:** Mock helper used a `selectCallCount` counter to return the validate-chain on first call and fallback-chain on second. Tests T2/T3/T5 (cookie missing → skip validation block) only invoke `.select()` once, so they got the validate-chain object whose `.eq().eq().maybeSingle()` chain doesn't include `.order()`.
- **Fix:** Rewrote `makeAuthedSupabase` to return a single `.eq()` leaf object that exposes both `.eq()` (validate continuation) and `.order()` (fallback continuation). Implementation drives which path runs; mock no longer cares about call order.
- **Files modified:** `tests/unit/active-company-helpers.test.ts`
- **Verification:** 8/8 tests green.
- **Committed in:** `5737f13` (combined GREEN commit)

---

**Total deviations:** 2 auto-fixed (1 bug, 1 blocking)
**Impact on plan:** No scope creep. Both fixes were necessary to make the contract typecheck and the test suite execute. Production code matches the plan's contract 1:1 except for the additional column in the AppCompany select.

## Issues Encountered
- None outside the deviations above.

## User Setup Required
None — pure code change. No env vars, no migrations, no dashboard configuration.

## Next Phase Readiness
- **Plan 03 (`add` mode)** can import `ACTIVE_COMPANY_COOKIE` and `ACTIVE_COMPANY_COOKIE_OPTIONS` directly when writing the cookie after a new-company creation flow.
- **Plan 04 (layout integration)** can replace the existing `getCachedCompany(userId)` call with `getActiveCompany()` — return shape is identical (`AppCompany | null`).
- **Phase 80 (company switch)** has the cache-tag wiring it needs: a single `revalidateTag('company')` invalidates `getActiveCompany` across all users, and writing the new id to `active_company_id` cookie is sufficient on the next request (validation always re-runs).

## Self-Check: PASSED
- FOUND: `lib/queries/active-company.ts`
- FOUND: `tests/unit/active-company-helpers.test.ts`
- FOUND commit: `4fb9c7c` (test/RED)
- FOUND commit: `5737f13` (feat/GREEN)
- 8/8 unit tests green
- `npx tsc --noEmit` exits 0

---
*Phase: 79-multi-company-support-allow-one-user-to-own-and-switch-betwe*
*Completed: 2026-05-25*
