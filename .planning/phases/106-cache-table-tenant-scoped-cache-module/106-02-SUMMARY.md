---
phase: 106-cache-table-tenant-scoped-cache-module
plan: 02
subsystem: estimate-pricing
tags: [cache, price-research, supabase, service-role, ttl, normalization, leakage-guard, tdd]

# Dependency graph
requires:
  - phase: 106-cache-table-tenant-scoped-cache-module (plan 01)
    provides: price_research_cache table DDL + normalize.ts (normalizeServiceNameKey + normalizeRegion)
  - phase: 92-pipeline-event-persistence
    provides: requireServiceClient service-role access pattern + static-migration-test template
provides:
  - cache.ts (tenant-scoped get/put over price_research_cache via requireServiceClient + 30-day TTL const)
  - CachedPriceDatum neutral-datum value type (leakage-guard contract)
  - leakage/HIT-no-provider/TTL-expiry/normalization-collapse unit tests
  - static migration-contract test (table + 4-tuple UNIQUE + RLS + zero policy + numeric(12,2))
affects: [107 provider seam, 108 orchestrator integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cache VALUE is a neutral market datum: company_id is a KEY column for tenant scoping, NEVER part of the returned value (leakage-guard contract enforced by the CachedPriceDatum interface + a runtime key-subset test)"
    - "Lazy TTL purge: expires_at < now is treated as a MISS at read time (no background sweep)"
    - "Service-role-only cache access via requireServiceClient (mirrors pipeline_events) — RLS table has zero tenant policies"

key-files:
  created:
    - lib/estimate/price-research/cache.ts
    - tests/unit/estimate/price-research-cache.test.ts
    - tests/unit/estimate/price-research-cache-migration.test.ts
  modified: []

key-decisions:
  - "Returned CachedPriceDatum carries ONLY { unit_price, currency, source, confidence?, expires_at } — no company_id/client/margin/job-text; a typed literal in the test makes a future leaky-field addition a TS error as well as a runtime failure"
  - "get() has NO provider seam at all — a HIT is a pure DB read, so the cache can never invoke research on a hit (test stubs a provider and asserts it is never called)"
  - "put() upserts on the 4-tuple onConflict key with expires_at = now + PRICE_RESEARCH_TTL_MS (30 days) so a re-research overwrites rather than duplicates"

requirements-completed: [RCACHE-01, RCACHE-02]

# Metrics
duration: 5min
completed: 2026-06-24
---

# Phase 106 Plan 02: Tenant-Scoped Cache Module Summary

**Shipped the dormant `cache.ts` (`get`/`put` over `price_research_cache` via `requireServiceClient` + a 30-day `PRICE_RESEARCH_TTL_MS` const) with a neutral-datum return value that structurally cannot carry tenant-private data, plus unit tests locking the leakage guard, the HIT-without-provider behavior, the TTL-expiry miss, the normalization collapse, and a static migration contract.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-24T08:34:25Z
- **Completed:** 2026-06-24T08:39:03Z
- **Tasks:** 2
- **Files modified:** 3 (all created)

## Accomplishments
- New `lib/estimate/price-research/cache.ts`:
  - `get(companyId, name, region, currency)` → returns the neutral `CachedPriceDatum` when a non-expired row exists; treats `expires_at < now` as a MISS (`null`); a missing row is `null`. Builds the lookup key via the Plan 106-01 `normalizeServiceNameKey` + `normalizeRegion`. No provider seam — a HIT is a pure service-role DB read.
  - `put(input)` → stamps `expires_at = now + PRICE_RESEARCH_TTL_MS` (30 days) and upserts on the `(company_id, normalized_name, region, currency_code)` 4-tuple key.
  - `PRICE_RESEARCH_TTL_MS = 30 * 24 * 60 * 60 * 1000` module const; `CachedPriceDatum` interface lists ONLY `unit_price/currency/source/confidence?/expires_at` (no `company_id` in the value shape).
- New `tests/unit/estimate/price-research-cache.test.ts` (7 tests): leakage guard (runtime key-subset + explicit forbidden-field absence + a compile-time typed literal), cache-HIT-returns-price-without-provider (`expect(provider).not.toHaveBeenCalled()`), TTL-expiry → null, missing-row → null, normalization collapse (two punctuation/space/case variants produce identical captured `.eq('normalized_name', …)` + `.eq('region', …)` args), put-stamps-30-day-expiry (fake timers), and the TTL-const value lock. Service client fully mocked with a capture-based chainable `from()` — no network, no DB, no secrets.
- New `tests/unit/estimate/price-research-cache-migration.test.ts` (6 tests): `readFileSync` + regex static contract over the Plan 106-01 migration — table present, 4-tuple UNIQUE, RLS enabled, ZERO policies (`not.toMatch(/CREATE POLICY/i)` + no `FOR INSERT|UPDATE|DELETE|SELECT`), all neutral-datum + key columns, `numeric(12,2)`.

## Task Commits

Each task was committed atomically (normal commits — gitleaks ran, no leaks):

1. **Task 1: cache.ts (get/put, neutral datum, TTL const, service-role) + leakage/HIT/TTL/normalization tests** — `b6a75dd` (feat)
2. **Task 2: static migration-contract test + full-suite green (dormant)** — `3a52169` (test)

**Plan metadata:** docs commit (this SUMMARY + STATE + ROADMAP + REQUIREMENTS)

## Files Created/Modified
- `lib/estimate/price-research/cache.ts` — tenant-scoped `get`/`put` + `PRICE_RESEARCH_TTL_MS` + `CachedPriceDatum`.
- `tests/unit/estimate/price-research-cache.test.ts` — the four scope-required behaviors + TTL stamp.
- `tests/unit/estimate/price-research-cache-migration.test.ts` — static SQL contract for the 106-01 migration.

## Decisions Made
- The neutral-datum value shape is the leakage-guard contract: `company_id` is a KEY column only (`.eq`/`.upsert`), never in `CachedPriceDatum`. The test enforces this at both runtime (key subset + forbidden-field absence) and compile time (a typed literal).
- `get()` deliberately has no provider/network reference, so the HIT-without-provider guarantee is structural, not just tested.
- `put()` overwrites via `onConflict` on the 4-tuple key so a re-research refreshes the row + TTL rather than duplicating.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. The cache test file passed first-run (7/7); the migration test passed first-run (6/6). `npx tsc --noEmit` reported no errors involving the new files. The grep acceptance suite passed (get/put == 1, requireServiceClient present, TTL const + value present, `from './normalize'` == 1, `company_id` only in `.eq`/`.upsert` key usage). Full `npx vitest run` → **264 files passed | 3 skipped, 1827 passed | 2 skipped | 33 todo** — no regressions vs the 256/1773 baseline (the 2 new files add +13 green tests; the higher file/test totals reflect the full-suite run vs the STATE snapshot, all green).

## Known Stubs
None. The cache module is complete for its dormant scope. Nothing in production imports `lib/estimate/price-research/cache.ts` yet — confirmed via `grep -rl "price-research/cache" lib/ app/ components/` returning no importer other than the module itself. Phase 108 (orchestrator) consumes `get`/`put`.

## User Setup Required
None - no external service configuration required. Operational deferral (out of this plan's scope, inherited from 106-01): apply migration `20260624000001_phase106_price_research_cache.sql` to the remote DB via CI->GHCR->Coolify (never on the VPS).

## Next Phase Readiness
- `cache.ts` ready for Phase 107 (provider seam) + Phase 108 (orchestrator) to call `get` before research and `put` after.
- The full lookup/TTL contract is unit-proven and dormant — wiring it into the graph is the Phase 108 payoff (no-$0 fallback ladder + evidence-gated tagging).

## Self-Check: PASSED

- FOUND: lib/estimate/price-research/cache.ts
- FOUND: tests/unit/estimate/price-research-cache.test.ts
- FOUND: tests/unit/estimate/price-research-cache-migration.test.ts
- FOUND: .planning/phases/106-cache-table-tenant-scoped-cache-module/106-02-SUMMARY.md
- FOUND commit: b6a75dd (Task 1)
- FOUND commit: 3a52169 (Task 2)

---
*Phase: 106-cache-table-tenant-scoped-cache-module*
*Completed: 2026-06-24*
