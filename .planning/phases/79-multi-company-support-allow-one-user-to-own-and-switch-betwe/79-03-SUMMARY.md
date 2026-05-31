---
phase: 79-multi-company-support-allow-one-user-to-own-and-switch-betwe
plan: 03
subsystem: server-action
tags: [multi-tenancy, billing, trial, server-action, supabase, vitest]

# Dependency graph
requires:
  - phase: 79-multi-company-support-allow-one-user-to-own-and-switch-betwe
    provides: company_members table + active company resolver (Plans 01 & 02)
provides:
  - createOrUpdateCompany now accepts `mode: 'first' | 'add'`
  - add-mode writes a company_members owner row via service-role
  - add-mode sets the active_company_id cookie to the new company
  - add-mode inherits tier/tier_trial_ends_at from the source company (no fresh trial)
affects: [80, multi-tenancy-ui, add-company-flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Mode-parameterized server actions: a single action can serve onboarding ('first') and post-onboarding add-company ('add') flows with disjoint semantics"
    - "Service-role escape hatch for company_members INSERT (RLS has no INSERT policy by D-03); inputs derived from claims.sub + just-inserted PK, never from caller params"
    - "Trial inheritance by SELECT-from-source: copy tier and tier_trial_ends_at verbatim from the cookie-resolved source company to prevent trial farming (D-14/D-15)"

key-files:
  created: []
  modified:
    - lib/actions/company.ts
    - tests/unit/company-action.test.ts

key-decisions:
  - "Add-mode never resets the trial clock — tier and tier_trial_ends_at are copied literally from the source company (past, future, or null) per D-14/D-15"
  - "When no source company is resolvable, add-mode falls back to a fresh 14-day trial (safe-default; Phase 80 UI will never trigger this path)"
  - "company_members INSERT uses service-role (D-03 RLS has no INSERT policy); user_id/company_id are server-derived so privilege escalation is structurally impossible (T-79-03-01/02)"
  - "currency_code field (added since plan drafted) preserved in the row builder — would otherwise regress existing onboarding behavior (Rule 1)"

patterns-established:
  - "Mode-parameterized server actions for shared-data divergent-control-flow operations"
  - "Trial-clock inheritance from source company on add-tenant flows (anti-trial-farming)"

requirements-completed: [D-12, D-13, D-14, D-15, D-16]

# Metrics
duration: ~10min
completed: 2026-05-25
---

# Phase 79 Plan 03: createOrUpdateCompany add-mode Summary

**`createOrUpdateCompany` now supports `mode: 'add'` — INSERTs a new company, writes a `company_members` owner row, sets the active_company_id cookie, and inherits tier/trial from the source company so users cannot reset their trial by creating new tenants.**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-25T22:03Z
- **Completed:** 2026-05-25T22:06Z
- **Tasks:** 1 (TDD: RED + GREEN)
- **Files modified:** 2

## Accomplishments

- Extended `createOrUpdateCompany(data, options?)` with `mode: 'first' | 'add'` (default `'first'`)
- `mode: 'first'` preserved bit-for-bit (existing TIER-04 regression tests still pass)
- `mode: 'add'` unconditional INSERT + service-role `company_members` write + `active_company_id` cookie set + tier/trial inheritance from source company
- 9 new unit tests covering all four sub-behaviors (INSERT runs, member row created, cookie set, trial inherited) including all three inheritance cases (paid, expired, mid-trial) plus the security T9 case
- 11/11 tests pass, `tsc --noEmit` clean

## Task Commits

1. **Task 1 (RED): failing tests for mode: add** — `8e387d2` (test)
2. **Task 1 (GREEN): implement mode parameter** — `87fd4fc` (feat)

## Files Created/Modified

- `lib/actions/company.ts` — added `CreateOrUpdateCompanyOptions` type and `mode === 'add'` branch (unconditional INSERT, source-company SELECT for inheritance, service-role member row INSERT, active_company_id cookie set, onboarding_complete cookie preserved, redirect to /dashboard)
- `tests/unit/company-action.test.ts` — added 9 add-mode tests + 1 regression-marker describe; kept the 2 original TIER-04 tests intact as `mode: 'first'` regression coverage

## Decisions Made

- **Trial inheritance is literal, not computed.** Source row's `tier_trial_ends_at` is copied verbatim (past/future/null). This is the load-bearing anti-abuse decision; tests T6/T7/T8 lock it in.
- **No fresh trial on add for users with a source company.** Only the degenerate zero-membership case (T10) falls back to a +14-day clock, which Phase 80 UI structurally cannot trigger.
- **Service-role for `company_members` only.** The new company INSERT uses the authenticated RLS-bound client (RLS allows users to create their own company); only the member row needs service-role because `company_members` has no INSERT policy by design (D-03).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Preserve existing behavior] Kept `currency_code` field in row builder**
- **Found during:** Task 1 (GREEN)
- **Issue:** Plan's exact-contract code block omitted the `currency_code` column that was added to `companies` since the plan was drafted; using the plan code verbatim would have dropped currency on every save.
- **Fix:** Kept the existing `normalizeCurrencyCode(data.currencyCode ?? DEFAULT_CURRENCY_CODE)` line in the shared `row` builder so both modes preserve it.
- **Files modified:** `lib/actions/company.ts`
- **Verification:** All 11 tests pass; TIER-04 regression tests still green.
- **Committed in:** `87fd4fc`

---

**Total deviations:** 1 auto-fixed (1 backwards-compat preservation)
**Impact on plan:** Single trivial preservation. No scope creep.

## Issues Encountered

None.

## User Setup Required

None — server-action change only; no env vars, no migrations, no external services.

## Next Phase Readiness

- Phase 80 can wire `/onboarding?mode=add` (or equivalent UI) to call `createOrUpdateCompany(data, { mode: 'add' })` with full confidence.
- All four sub-behaviors (INSERT, member, cookie, trial inheritance) are unit-locked.
- Phase 80 should add an integration test against a real Supabase project to verify the service-role member INSERT actually bypasses RLS as expected (unit tests mock that boundary).

---
*Phase: 79-multi-company-support-allow-one-user-to-own-and-switch-betwe*
*Completed: 2026-05-25*

## Self-Check: PASSED

- FOUND: lib/actions/company.ts
- FOUND: tests/unit/company-action.test.ts
- FOUND: .planning/phases/79-multi-company-support-allow-one-user-to-own-and-switch-betwe/79-03-SUMMARY.md
- FOUND commit: 8e387d2 (test RED)
- FOUND commit: 87fd4fc (feat GREEN)
