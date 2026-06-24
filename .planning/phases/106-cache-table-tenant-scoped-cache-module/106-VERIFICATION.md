---
phase: 106-cache-table-tenant-scoped-cache-module
verified: 2026-06-24T04:46:00Z
status: passed
score: 10/10 must-haves verified
---

# Phase 106: Cache Table + Tenant-Scoped Cache Module Verification Report

**Phase Goal:** A tenant-scoped, TTL-bounded cache for researched market prices exists and is unit-tested in isolation — so once research is wired (Phase 108) a repeat lookup of the same service in the same region is free and never re-consumes the research allowance. The cached value is a neutral market datum (no company/client/margin data) so it can never leak across tenants. Ships dormant.

**Verified:** 2026-06-24T04:46:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                  | Status     | Evidence                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------ | ---------- | --------------------------------------------------------------------------------------------------------- |
| 1   | Migration creates `price_research_cache` with RCACHE-01 columns + 4-tuple UNIQUE key                   | ✓ VERIFIED | migration L18-30: table + `UNIQUE (company_id, normalized_name, region, currency_code)`                    |
| 2   | Migration enables RLS with ZERO tenant policies (service-role-only / deny-all)                         | ✓ VERIFIED | `ENABLE ROW LEVEL SECURITY` L39; `grep -ci "CREATE POLICY"` == 0; `grep -ciE "FOR (INSERT...)"` == 0       |
| 3   | `unit_price` is `numeric(12,2)`; `expires_at` column present                                           | ✓ VERIFIED | migration L24 `numeric(12,2)`, L27 `expires_at timestamptz NOT NULL`                                       |
| 4   | Migration NOT applied to remote (CI→GHCR→Coolify owns deploy)                                           | ✓ VERIFIED | File committed (3e41ae66) but no `apply_migration`/`db push`; deploy via CI per project memory             |
| 5   | normalize.ts canonicalizes region to "city\|state" and reuses `normalizeNameForMatch` (no duplication) | ✓ VERIFIED | `import { normalizeNameForMatch } from '@/lib/ai/price-anchoring'` L9; `normalizeRegion` L29; source has 1 def |
| 6   | `get()` treats `expires_at < now` as a MISS (returns null)                                              | ✓ VERIFIED | cache.ts L64 `if (new Date(data.expires_at).getTime() < Date.now()) return null`; TTL-expiry test green    |
| 7   | `put()` stamps `expires_at = now + 30d` via TTL const; uses `requireServiceClient`                     | ✓ VERIFIED | `PRICE_RESEARCH_TTL_MS = 30*24*60*60*1000` L18; `requireServiceClient` L52/L80; put-stamp test green       |
| 8   | Returned value is neutral datum `{unit_price, currency, source, confidence?, expires_at}` — no leakage  | ✓ VERIFIED | `CachedPriceDatum` interface L25-31 has zero `company_id`/client/margin/job; leakage test green            |
| 9   | Tests: leakage guard, HIT-without-provider, TTL-miss, normalization-collapse — all green               | ✓ VERIFIED | `vitest run` on 2 phase files: 13 passed; all four named cases present in price-research-cache.test.ts     |
| 10  | DORMANT: no production module imports the cache; full suite green (no regression)                      | ✓ VERIFIED | `grep -rl "price-research/cache" lib/ app/ components/` (minus module) returns nothing; full suite 1827 passed |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact                                                                | Expected                                          | Status     | Details                                                                            |
| ----------------------------------------------------------------------- | ------------------------------------------------- | ---------- | --------------------------------------------------------------------------------- |
| `supabase/migrations/20260624000001_phase106_price_research_cache.sql`  | Table DDL + RLS-enabled-zero-policies             | ✓ VERIFIED | 43 lines; table, 4-tuple UNIQUE, RLS enabled, 2 indexes, COMMENT; zero policies    |
| `lib/estimate/price-research/normalize.ts`                              | `normalizeRegion` + `normalizeServiceNameKey`     | ✓ VERIFIED | Both exported; reuses imported `normalizeNameForMatch`; pure (no I/O)              |
| `lib/estimate/price-research/cache.ts`                                  | get/put + TTL const + neutral datum               | ✓ VERIFIED | `get`/`put`/`PRICE_RESEARCH_TTL_MS`/`CachedPriceDatum` exported; service-role only |
| `tests/unit/estimate/price-research-cache.test.ts`                      | Leakage + HIT + TTL + normalization tests         | ✓ VERIFIED | 7 tests incl. all 4 required behaviors; all green                                 |
| `tests/unit/estimate/price-research-cache-migration.test.ts`           | Static SQL contract (table/UNIQUE/RLS/zero-policy) | ✓ VERIFIED | 6 tests; asserts `not.toMatch(/CREATE POLICY/i)` + 4-tuple UNIQUE; all green       |

### Key Link Verification

| From                          | To                          | Via                        | Status   | Details                                                          |
| ----------------------------- | --------------------------- | -------------------------- | -------- | ---------------------------------------------------------------- |
| normalize.ts                  | lib/ai/price-anchoring.ts   | `import normalizeNameForMatch` | ✓ WIRED  | Import present L9; source `normalizeNameForMatch` def count == 1 |
| cache.ts                      | lib/supabase/service.ts     | `requireServiceClient`     | ✓ WIRED  | Import L14; called in get() L52 and put() L80; source def == 1   |
| cache.ts                      | normalize.ts                | `from './normalize'`       | ✓ WIRED  | Import L15; `normalizeServiceNameKey` + `normalizeRegion` used in both get/put |

### Data-Flow Trace (Level 4)

N/A — phase ships DORMANT by design. No production data flows through the cache yet (Phase 108 consumes it). Test mocks supply the service-client rows; get/put correctly read/write the neutral-datum value shape. The leakage-guard contract (value carries no tenant-private fields) is enforced at both the TypeScript type level (CachedPriceDatum) and runtime (leakage test).

### Behavioral Spot-Checks

| Behavior                                       | Command                                             | Result                | Status |
| ---------------------------------------------- | --------------------------------------------------- | --------------------- | ------ |
| Phase test files pass                          | `vitest run` on 2 phase files                       | 2 files, 13 passed    | ✓ PASS |
| Zero RLS policies in migration                 | `grep -ci "CREATE POLICY"` on migration             | 0                     | ✓ PASS |
| Zero FOR-clause policies                       | `grep -ciE "FOR (INSERT\|UPDATE\|DELETE\|SELECT)"`  | 0                     | ✓ PASS |
| Cache dormant (no production import)            | `grep -rl "price-research/cache"` minus module      | empty                 | ✓ PASS |
| Full suite no regression                       | `npx vitest run`                                    | 264 files, 1827 passed, 0 failed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan       | Description                                                                                              | Status      | Evidence                                                                          |
| ----------- | ----------------- | ------------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------- |
| RCACHE-01   | 106-01, 106-02    | Researched prices cached in `price_research_cache` keyed by (company_id, normalized name, city+state), service-role/deny-all RLS | ✓ SATISFIED | Migration table + 4-tuple UNIQUE + RLS-enabled-zero-policies; static contract test green |
| RCACHE-02   | 106-01, 106-02    | Cache entries expire after ~30d TTL; a hit reuses the price without a new search / allowance consumption | ✓ SATISFIED | `PRICE_RESEARCH_TTL_MS = 30d`; expired-as-miss in get(); HIT-without-provider test green |

No orphaned requirements: REQUIREMENTS.md maps only RCACHE-01 and RCACHE-02 to Phase 106, both claimed by the plans and both marked Complete in the requirements matrix.

### Anti-Patterns Found

| File         | Line | Pattern | Severity | Impact |
| ------------ | ---- | ------- | -------- | ------ |
| _(none)_     | —    | —       | —        | No TODO/FIXME/placeholder/stub patterns in cache.ts or normalize.ts. `return null` in get() is intentional MISS semantics (expired/not-found), not a stub. |

### Human Verification Required

None. All must-haves are programmatically verifiable (static SQL contract, unit tests, grep-based wiring and dormancy checks). The cache is dormant — there is no runtime UI/behavior to validate until Phase 108 wires it.

### Gaps Summary

No gaps. The phase delivers exactly what the goal requires:

- The `price_research_cache` table ships with the tenant-scoping 4-tuple UNIQUE key, `numeric(12,2)` unit_price, an `expires_at` TTL column, and a service-role-only / deny-all RLS posture (RLS enabled, zero `CREATE POLICY`) — mirroring the Phase-92/104 pattern. Not applied to remote (committed for CI→GHCR→Coolify deploy).
- `normalize.ts` provides the canonical "city|state" region key and a name key that reuses `normalizeNameForMatch` (imported, not duplicated — single source of truth).
- `cache.ts` exposes `get`/`put` over the service-role client with a 30-day TTL const, expired-as-miss semantics, and a neutral-datum return value that — verified at both type and runtime level — carries no company_id/client/margin/job-text and therefore cannot leak across tenants.
- The four required tests (leakage guard, cache-HIT-without-provider, TTL-expiry miss, normalization collapse) plus the static migration contract are all green, and the full suite (264 files, 1827 tests) passes with no regression.
- Dormancy confirmed: no production module imports the cache yet.

---

_Verified: 2026-06-24T04:46:00Z_
_Verifier: Claude (gsd-verifier)_
