---
phase: 55-schema-tier-definitions
plan: 02
subsystem: database
tags: [typescript, supabase, tiers, subscription, database-types, company-action]

# Dependency graph
requires:
  - phase: 55-01
    provides: Migration SQL with tier columns + usage_events table + entitlements.ts definitions
provides:
  - TypeScript types for tier columns (companies Row/Insert/Update) and usage_events table
  - TIER-04: createOrUpdateCompany() INSERT branch sets tier_trial_ends_at = now() + 14 days
  - getCompanyTier() focused query for Phase 56/57 quota checks
affects:
  - 56-quota-enforcement
  - 57-tier-gating

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Manual TypeScript type extension (not supabase gen types) — Docker unavailable on Windows, established since Phase 19"
    - "tier_trial_ends_at set ONLY in INSERT branch, never UPDATE — avoids resetting trial on settings saves (TIER-04)"
    - "Focused query pattern: getCompanyTier() selects only id, tier, tier_trial_ends_at (not select('*'))"

key-files:
  created: []
  modified:
    - types/database.types.ts
    - lib/actions/company.ts
    - lib/queries/company.ts

key-decisions:
  - "tier_trial_ends_at spread into INSERT payload via {...row, tier_trial_ends_at} — keeps shared row object clean, INSERT-only field stays isolated"
  - "getCompanyTier() placed in lib/queries/company.ts alongside other focused queries (getEstimateTemplateSettings, getCustomDomainSettings)"
  - "usage_events placed BETWEEN companies and company_price_book in database.types.ts to match alphabetical order convention"

requirements-completed: [TIER-04, TIER-01, TIER-02]

# Metrics
duration: 10min
completed: 2026-05-13
---

# Phase 55 Plan 02: Schema Tier Definitions — TypeScript Wire-Up Summary

**TypeScript tier types + 14-day trial INSERT logic + getCompanyTier() query — Phase 55 type system alignment complete**

## Performance

- **Duration:** 10 min
- **Started:** 2026-05-13T23:36:21Z
- **Completed:** 2026-05-13T23:46:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Extended `types/database.types.ts` with 6 new tier/stripe columns in companies.Row/Insert/Update and added `usage_events` table with full Row/Insert/Update/Relationships
- Patched `createOrUpdateCompany()` INSERT branch to spread `tier_trial_ends_at: now() + 14 days` — UPDATE branch left unchanged per TIER-04
- Added `getCompanyTier(supabase, userId)` focused query to `lib/queries/company.ts` returning `{ id, tier, tier_trial_ends_at } | null` for Phase 56/57

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend types/database.types.ts** - `0628ee1` (feat)
2. **Task 2: Patch company.ts INSERT + getCompanyTier query** - `7a079ff` (feat)
3. **Task 3: Full test suite green-gate** - (verification only, no code changes)

## Files Created/Modified

- `types/database.types.ts` — companies.Row extended with `tier: string` (NOT NULL), plus 5 nullable columns; companies.Insert/Update with all 6 as optional; `usage_events` table added
- `lib/actions/company.ts` — INSERT branch patched with `tier_trial_ends_at: trialEndsAt.toISOString()` spread; UPDATE branch unchanged
- `lib/queries/company.ts` — `getCompanyTier()` exported at end of file

## Decisions Made

- `tier_trial_ends_at` spread via `{...row, tier_trial_ends_at}` into insert payload — keeps shared `row` object clean, the trial-start field stays INSERT-only without mutation
- Placed `usage_events` table between `companies` and `company_price_book` in the types file to follow near-alphabetical convention
- `getCompanyTier()` co-located with other focused queries in `lib/queries/company.ts` — consistent with `getEstimateTemplateSettings`, `getCustomDomainSettings` pattern

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `git stash` during pre-existing-failure verification introduced merge conflicts in `.planning/` files — resolved by `git checkout HEAD --` to restore from HEAD. No code changes affected.
- Pre-existing test failures in ratelimit, whatsapp, admin, blog, branding, SEO test suites confirmed pre-existing (failed before this plan's changes). The plan-required tests (entitlements.test.ts + company-action.test.ts) are fully GREEN.

## Test Results

- `tests/unit/entitlements.test.ts`: **11 passed** (was already GREEN from Plan 01)
- `tests/unit/company-action.test.ts`: **2 passed** (was RED, now GREEN — TIER-04 verified)
- Total key tests: **13/13 passing**
- Pre-existing failures in unrelated test files: not caused by this plan

## User Setup Required

None - no external service configuration required. (Migration was applied in Plan 01.)

## Next Phase Readiness

Phase 56 (checkQuota/recordUsage) is unblocked:
- Import `getCompanyTier` from `lib/queries/company.ts`
- Import `getEntitlements` from `lib/entitlements.ts`
- Write to `usage_events` via `requireServiceClient()`
- TypeScript types are fully aligned — no `any` casts needed for tier fields

Phase 55 is complete: migration SQL (55-01), entitlements.ts (55-01), TypeScript types (55-02), INSERT trial logic (55-02), query helper (55-02).

---
*Phase: 55-schema-tier-definitions*
*Completed: 2026-05-13*
