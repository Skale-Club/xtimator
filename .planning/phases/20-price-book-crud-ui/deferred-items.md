# Phase 20 — Deferred Items (Out-of-Scope Pre-Existing Failures)

These test failures are **pre-existing on `main` before Phase 20 Plan 02 started** and are not caused by this plan's changes. Recorded here per Scope Boundary rule (only auto-fix issues directly caused by the current task).

## Failing Tests (10 total across 4 files)

### tests/unit/globals-brand-tokens.test.ts (5 failures)
- Phase 10 BRAND-01/02/03 token assertions for `224 86% 60%` HSL — likely globals.css drift
- BRAND-01 `:root --primary`, `:root --ring`
- BRAND-02 `app/admin/layout.tsx`, `[data-theme="admin-dark"] --primary`
- BRAND-03 `app/(auth)/layout.tsx --primary`

### tests/unit/onboarding-schema.test.ts (2 failures)
- `brandPrimaryColor defaults to "#0D9488"` — schema default may have changed to `#406EF1` per Phase 10
- `schema validates with only companyName provided (all others use defaults)` — likely cascades from same default change

### tests/unit/admin-gate.test.ts (2 failures)
- `getAdminContext() returns { userId, email } on positive admin lookup`
- `getAdminContext() returns null when user is not in platform_admins`

### tests/unit/auth-actions.test.ts (1 failure)
- `exports SignOutButton as a function (React component)` (7.8s timeout)

### tests/integration/missing-key-ux.test.ts (1 failure)
- `estimate /send route returns 503 with friendly body when Resend not configured`

## Action

Triage separately — likely small drift in `app/globals.css` brand tokens and `lib/schemas/onboarding.ts` default, plus possible mock setup issues in admin/auth integration tests. Phase 20 work (16/16 tests for price-book + schema) is fully GREEN.
