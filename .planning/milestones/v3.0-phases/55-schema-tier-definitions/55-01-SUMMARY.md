---
phase: 55-schema-tier-definitions
plan: 01
subsystem: database
tags: [supabase, postgresql, migrations, typescript, vitest, subscriptions, tiers]

requires:
  - phase: 46-typed-error-handling-foundation
    provides: "lib/errors/codes.ts module pattern (types then as const satisfies record)"

provides:
  - "supabase/migrations/20260513000001_phase55_subscription_tiers.sql — all DDL for Phase 55"
  - "lib/entitlements.ts — TierName, Entitlements, tiers, getEntitlements() — consumed by phases 56-60"
  - "tests/unit/entitlements.test.ts — 11 GREEN tests covering null/Infinity safety + JSON round-trip"
  - "tests/unit/company-action.test.ts — Wave 0 RED stub for TIER-04 (INSERT tier_trial_ends_at)"

affects:
  - 55-02
  - 56-quota-enforcement
  - 57-billing-stripe
  - 58-upgrade-ui
  - 59-usage-events
  - 60-tier-gating

tech-stack:
  added: []
  patterns:
    - "null (not Infinity) for unlimited quota values — JSON-safe sentinel"
    - "TEXT + CHECK constraint for tier column (no Postgres enum — D-07/D-08 pattern)"
    - "Deny-all RLS on usage_events — service role writes only (Phase 40 pattern)"
    - "Wave 0 Nyquist test stubs: RED before implementation, GREEN after"

key-files:
  created:
    - supabase/migrations/20260513000001_phase55_subscription_tiers.sql
    - lib/entitlements.ts
    - tests/unit/entitlements.test.ts
    - tests/unit/company-action.test.ts
  modified: []

key-decisions:
  - "Use null (not Infinity) for unlimited tier quotas — Infinity becomes null in JSON.stringify silently"
  - "TEXT + CHECK constraint for companies.tier — consistent with D-07/D-08, no Postgres enum"
  - "Deny-all RLS on usage_events (no policies added) — service role only, consistent with Phase 40 webhook tables"
  - "tier_trial_ends_at set only in INSERT branch of createOrUpdateCompany — UPDATE branch must not reset it (TIER-04)"
  - "getEntitlements() falls back to 'free' for unrecognized tier strings — defensive against future DB states"

patterns-established:
  - "null-for-unlimited: use null not Infinity for quota fields — survives JSON serialization round-trips"
  - "Wave 0 test scaffold: company-action.test.ts is intentionally RED until plan 02 patches company.ts"

requirements-completed:
  - TIER-01
  - TIER-02
  - TIER-03

duration: 3min
completed: 2026-05-13
---

# Phase 55 Plan 01: Schema + Tier Definitions Summary

**Migration + entitlements module: 6 new companies columns, usage_events table with deny-all RLS, and null-safe tier definitions covering free/trial/pro/business — foundation for all v3.0 quota enforcement**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-13T23:29:58Z
- **Completed:** 2026-05-13T23:32:46Z
- **Tasks:** 3 of 3
- **Files modified:** 4 created

## Accomplishments

- Migration SQL created with 6 `ALTER TABLE companies ADD COLUMN` statements (tier, tier_trial_ends_at, stripe_customer_id, stripe_subscription_id, tier_renews_at, tier_cancelled_at)
- `CREATE TABLE usage_events` with company_id FK, event_type CHECK constraint, JSONB metadata, and quota query index
- `ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY` with no policies — deny-all for anon/authenticated (Phase 40 pattern)
- `lib/entitlements.ts` exports `TierName`, `Entitlements`, `tiers` (4 tiers), `getEntitlements()` with free fallback
- `null` used for unlimited quota fields — verified JSON-safe via serialization round-trip tests
- `tests/unit/entitlements.test.ts` — 11 tests all GREEN
- `tests/unit/company-action.test.ts` — Wave 0 RED stub for TIER-04 INSERT branch (intentional, plan 02 patches)

## Files Created/Modified

- `supabase/migrations/20260513000001_phase55_subscription_tiers.sql` — all Phase 55 DDL
- `lib/entitlements.ts` — authoritative tier definitions consumed by phases 56-60
- `tests/unit/entitlements.test.ts` — 11 GREEN tests
- `tests/unit/company-action.test.ts` — Wave 0 stub, INSERT test RED until plan 02

## Decisions Made

- `null` (not `Infinity`) for unlimited quota fields — `JSON.stringify(Infinity) === null` silently; null round-trips correctly
- `TEXT + CHECK` for `companies.tier` — consistent with D-07/D-08 no-Postgres-enum constraint
- Deny-all RLS on `usage_events` (no INSERT/SELECT policies) — service role writes only; consistent with Phase 40 webhook tables pattern
- `getEntitlements()` falls back to `tiers.free` for unknown strings — defensive against future DB migration states
- `tier_trial_ends_at` set only in INSERT branch (TIER-04) — UPDATE branch must never reset it

## Test Status

| Test file | Tests | Status |
|-----------|-------|--------|
| tests/unit/entitlements.test.ts | 11 | GREEN (all passing) |
| tests/unit/company-action.test.ts | 2 | 1 RED (INSERT — expected Wave 0), 1 GREEN (UPDATE) |

## Notes for Plan 02 Executor

Plan 02 must complete:
1. **TIER-04 patch**: `lib/actions/company.ts` INSERT branch — add `tier_trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()` to the insert row (not the shared `row` object)
2. **Type extension**: `database.types.ts` — manually extend companies Row/Insert/Update with `tier`, `tier_trial_ends_at`, `stripe_customer_id`, `stripe_subscription_id`, `tier_renews_at`, `tier_cancelled_at`; add `usage_events` table types (Docker unavailable on Windows — manual extension, same pattern as Phases 19, 24, 38)
3. **`getCompanyTier` query**: `lib/queries/company-tier.ts` — fetch tier + trial_ends_at for a company_id (used by quota middleware in Phase 56)

After plan 02 completes, `npx vitest run tests/unit/company-action.test.ts` must exit 0 with both tests GREEN.

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Task | Commit | Files |
|------|--------|-------|
| Task 1: Migration SQL | 9446345 | supabase/migrations/20260513000001_phase55_subscription_tiers.sql |
| Task 2: lib/entitlements.ts | 50db9f9 | lib/entitlements.ts |
| Task 3: Wave 0 test stubs | 238e55e | tests/unit/entitlements.test.ts, tests/unit/company-action.test.ts |
