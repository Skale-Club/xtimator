---
phase: 56-usage-tracking
plan: 01
subsystem: api
tags: [quota, usage-tracking, supabase, vitest, tdd, idempotency]

# Dependency graph
requires:
  - phase: 55-schema-tier-definitions
    provides: usage_events table + companies.tier column + getEntitlements() + getCompanyTier()
provides:
  - lib/quota.ts with checkQuota() and recordUsage() exported functions
  - supabase/migrations/20260513000002_phase56_usage_idempotency.sql — idempotency_key column + partial unique index on usage_events
  - 7 unit tests covering all quota behaviors without a live database
affects: [57-enforcement-layer, 58-stripe-integration, 59-billing-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "supabase-js upsert with ignoreDuplicates:true for ON CONFLICT DO NOTHING (Phase 12 pattern extended to usage events)"
    - "Partial unique index WHERE IS NOT NULL for nullable deduplication keys (Postgres pattern)"
    - "Supabase client injection — quota functions never create their own client"
    - "TDD RED→GREEN: skeleton lib exports throw 'not implemented', then replaced with real logic"

key-files:
  created:
    - supabase/migrations/20260513000002_phase56_usage_idempotency.sql
    - lib/quota.ts
    - tests/unit/quota.test.ts
  modified: []

key-decisions:
  - "checkQuota queries companies by id directly (not via getCompanyTier which takes userId) — avoids userId→companyId lookup in pure library layer"
  - "photo_batch and audio_minutes quota types return { allowed: true, remaining: null } in Phase 56 — per-estimate enforcement deferred to Phase 57 call sites"
  - "Two separate usage_events queries for month and day counts — cleaner than JS filtering of a single result set"
  - "Partial unique index (WHERE idempotency_key IS NOT NULL) allows multiple NULL rows while enforcing uniqueness for non-null keys"
  - "recordUsage throws only on genuine DB errors — duplicate key conflicts silently succeed (ON CONFLICT DO NOTHING semantics)"

patterns-established:
  - "makeSupabase() factory in tests: injects fake Supabase client per test, no module-level DB mock needed"
  - "mockEntitlements() helper to set up getEntitlements mock return value cleanly per test"

requirements-completed: [QUOTA-01, QUOTA-02]

# Metrics
duration: 15min
completed: 2026-05-13
---

# Phase 56 Plan 01: Usage Tracking — Quota Library Summary

**Quota enforcement library (checkQuota + recordUsage) with idempotency deduplication — all 7 behaviors validated by unit tests passing without a live database.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-05-13T20:05:00Z
- **Completed:** 2026-05-13T20:20:00Z
- **Tasks:** 3 completed
- **Files modified:** 3 (created)

## Accomplishments

- Created migration `20260513000002_phase56_usage_idempotency.sql` adding nullable `idempotency_key TEXT` column + partial unique index on `(company_id, idempotency_key) WHERE IS NOT NULL` to usage_events
- Implemented `lib/quota.ts` with `checkQuota(supabase, companyId, quotaType)` and `recordUsage(supabase, companyId, eventType, units, idempotencyKey)` — client always injected by caller
- Wrote 7 unit tests in `tests/unit/quota.test.ts` covering all 7 behaviors (4 checkQuota scenarios + 3 recordUsage scenarios) — all GREEN without a live database

## Task Commits

1. **Task 1: Migration — add idempotency_key to usage_events** - `86f8b50` (chore)
2. **Task 2: Write quota.test.ts stubs RED, then implement lib/quota.ts GREEN** - `54c927d` (feat)
3. **Task 3: Full test suite regression check** — verification only, no new files

## Files Created/Modified

- `supabase/migrations/20260513000002_phase56_usage_idempotency.sql` — Adds `idempotency_key TEXT` column + `CREATE UNIQUE INDEX usage_events_idempotency ... WHERE idempotency_key IS NOT NULL`
- `lib/quota.ts` — Exports `checkQuota` and `recordUsage`; queries companies by id directly; uses upsert+ignoreDuplicates pattern
- `tests/unit/quota.test.ts` — 7 unit tests with `makeSupabase()` factory mock; no live DB required

## Function Signatures Shipped

```typescript
export type QuotaType = 'estimate' | 'photo_batch' | 'audio_minutes'
export type EventType = 'estimate_generated' | 'photo_analyzed' | 'audio_transcribed'

export async function checkQuota(
  supabase: SupabaseClient,
  companyId: string,
  quotaType: QuotaType
): Promise<{ allowed: boolean; remaining: number | null }>

export async function recordUsage(
  supabase: SupabaseClient,
  companyId: string,
  eventType: EventType,
  units: number,
  idempotencyKey: string
): Promise<void>
```

## Migration Filename

`supabase/migrations/20260513000002_phase56_usage_idempotency.sql`

## Test Patterns for Phase 57

- `makeSupabase({ tier, monthCount, dayCount, upsertError })` factory pattern — inject per test, no module-level DB mock
- `vi.mock('@/lib/entitlements', ...)` + `mockEntitlements()` helper for clean per-test entitlement configuration
- For Phase 57 integration tests: caller creates the service role client and passes to checkQuota/recordUsage; no internal client creation to mock

## Deviations from Plan

None — plan executed exactly as written. The TDD RED→GREEN flow worked correctly: skeleton `lib/quota.ts` caused all 7 tests to fail, then the full implementation turned them all GREEN.

## Regression Check (Task 3)

Full `npx vitest run` shows 16 test files with 38 pre-existing failures (confirmed by stash comparison — identical failures before Phase 56 changes). No regressions introduced. New quota tests add 7 tests to the suite total (599 → 606).

Pre-existing failures are in: `blog-actions.test.ts`, `branding-actions.test.ts`, `cleanup-route-auth.test.ts`, `landing-actions.test.ts`, `seo-actions.test.ts`, `wizard-client-only.test.ts`, `queries/auth.test.ts` — all out of scope.

## Self-Check

Checking all claimed artifacts exist:

- [x] `supabase/migrations/20260513000002_phase56_usage_idempotency.sql` — created (commit 86f8b50)
- [x] `lib/quota.ts` — created (commit 54c927d), exports checkQuota and recordUsage
- [x] `tests/unit/quota.test.ts` — created (commit 54c927d), 7 tests all GREEN
- [x] `grep "idempotency_key" migration` — 9 matches (> required 3)
- [x] `grep "upsert\|ignoreDuplicates" lib/quota.ts` — both present
- [x] All 7 tests pass: `npx vitest run tests/unit/quota.test.ts` exits 0
