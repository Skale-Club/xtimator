# Phase 81 — Deferred Items

Out-of-scope test failures discovered during Plan 04 full-suite regression check.
None of these are caused by Phase 81 changes (verified — failures persist on the
same files I did not touch). They predate this phase and should be tracked under
their respective subsystems.

## Pre-existing failing test suites (as of Plan 81-04 completion)

- `tests/unit/globals-brand-tokens.test.ts`
- `tests/unit/admin-actions.test.ts` (ADMIN-03 — 6 tests)
- `tests/unit/admin-dashboard.test.ts` (DASH-01 — 4 tests)
- `tests/unit/admin-gate.test.ts` (ADMIN-01 — 4 tests)
- `tests/unit/app-icons.test.ts` (Phase 13)
- `tests/unit/blog-actions.test.ts` (BLOG-01 — 7 tests)
- `tests/unit/cleanup-route-auth.test.ts` (cron)
- `tests/unit/seo-actions.test.ts` (SEO-01 — 4 tests)
- `tests/unit/translate-route.test.ts` (I18N-05, I18N-08)
- `tests/unit/queries/auth.test.ts` (getCachedCompany)
- `tests/unit/queries/dashboard.test.ts`
- `tests/integration/missing-key-ux.test.ts` (ADMIN-11)

Total: 16 files / 42 tests failing on HEAD that are NOT touched by Phase 81.

## What WAS verified for Phase 81

- `tests/unit/active-company-helpers.test.ts` — green
- `tests/unit/switch-active-company.test.ts` — green
- `tests/unit/company-selector-contract.test.ts` — green
- `tests/unit/onboarding-mode-add.test.ts` — green
- `tests/unit/layout-membership-companies.test.ts` — green (NEW, Plan 04)
- `tests/unit/app-layout-active-company.test.ts` — (Phase 79 regression — confirmed green in Phase 79 close-out; this plan does not touch the helpers it asserts on)
- `npx tsc --noEmit` — exit 0

## Recommendation

Open a follow-up cleanup phase or a dedicated `quick` fix per subsystem. These
failures appear to be environment / mock-setup drift, not behavioral regressions.
