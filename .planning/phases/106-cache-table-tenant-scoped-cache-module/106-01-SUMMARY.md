---
phase: 106-cache-table-tenant-scoped-cache-module
plan: 01
subsystem: database
tags: [postgres, supabase, rls, cache, price-research, normalization]

# Dependency graph
requires:
  - phase: 104-whatsapp-template-notifications
    provides: service-role-only RLS-zero-policies migration template (whatsapp_notification_templates)
  - phase: 22-ai-price-anchoring
    provides: normalizeNameForMatch helper (lib/ai/price-anchoring.ts)
provides:
  - price_research_cache table DDL (RLS enabled, zero tenant policies, 4-tuple UNIQUE key)
  - normalize.ts (normalizeRegion canonical "city|state" + normalizeServiceNameKey reusing normalizeNameForMatch)
affects: [106-02 cache module, 107 provider seam, 108 orchestrator integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Service-role-only table: RLS ENABLED with zero anon/authenticated policies (deny-all for clients, service role bypasses)"
    - "Cache key derivation reuses the existing name normalizer (single source of truth, no body duplication)"

key-files:
  created:
    - supabase/migrations/20260624000001_phase106_price_research_cache.sql
    - lib/estimate/price-research/normalize.ts
  modified: []

key-decisions:
  - "Reused normalizeNameForMatch via import + re-export rather than duplicating the body so the cache name key and the price-anchoring pass never drift"
  - "normalizeRegion produces a stable deterministic key even on null/empty city or state (e.g. '|tx' or '|')"

patterns-established:
  - "Service-role-only RLS posture: ENABLE ROW LEVEL SECURITY with zero CREATE POLICY statements; reads/writes via requireServiceClient()"
  - "Migration NOT applied to remote — deploy owned by CI->GHCR->Coolify, never on the VPS"

requirements-completed: [RCACHE-01, RCACHE-02]

# Metrics
duration: 5min
completed: 2026-06-24
---

# Phase 106 Plan 01: Cache Table + Normalize Helpers Summary

**Idempotent price_research_cache migration (RLS-enabled, zero tenant policies, 4-tuple UNIQUE key) plus a pure normalize.ts that canonicalizes "city|state" regions and reuses normalizeNameForMatch for the cache name key.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-24T08:29:00Z
- **Completed:** 2026-06-24T08:30:39Z
- **Tasks:** 2
- **Files modified:** 2 (both created)

## Accomplishments
- New idempotent `public.price_research_cache` table with the RCACHE-01 columns (company_id FK, normalized_name, region, currency_code, unit_price numeric(12,2), source, confidence, expires_at) and a `UNIQUE (company_id, normalized_name, region, currency_code)` key plus lookup + expiry indexes.
- Service-role-only RLS posture: `ENABLE ROW LEVEL SECURITY` with exactly zero `CREATE POLICY` / FOR-clause statements (mirrors whatsapp_notification_templates / pipeline_events). Not applied to remote.
- New pure `lib/estimate/price-research/normalize.ts` exporting `normalizeRegion` (canonical "city|state", deterministic on null/empty segments) and `normalizeServiceNameKey` (delegating to the imported `normalizeNameForMatch` — no body duplication).

## Task Commits

Each task was committed atomically:

1. **Task 1: price_research_cache migration** - `3e41ae66` (feat)
2. **Task 2: normalize.ts (region + name key)** - `852bbb9` (feat)

**Plan metadata:** docs commit (this SUMMARY + STATE + ROADMAP)

## Files Created/Modified
- `supabase/migrations/20260624000001_phase106_price_research_cache.sql` - price_research_cache DDL; RLS enabled, zero policies; sorts last after 20260623000001.
- `lib/estimate/price-research/normalize.ts` - normalizeRegion + normalizeServiceNameKey (re-exports normalizeNameForMatch).

## Decisions Made
- Reused `normalizeNameForMatch` via import + re-export (single source of truth) so the cache name key and the anchoring pass never diverge.
- `normalizeRegion` yields a stable key even when city or state is null/empty, so state-only or fully-unknown regions still cache deterministically.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. Both grep acceptance suites passed first-run; `npx tsc --noEmit` reported no errors in normalize.ts; the price-anchoring test file stayed green (7/7) confirming the reused import did not regress.

## Known Stubs
None. Both artifacts are complete for their dormant scope. Nothing reads/writes the table in production yet — Plan 106-02 builds the cache module against this contract; Phase 108 consumes it.

## User Setup Required
None - no external service configuration required. Operational deferral (out of this plan's scope): apply migration `20260624000001_phase106_price_research_cache.sql` to the remote DB via CI->GHCR->Coolify (never on the VPS).

## Next Phase Readiness
- Table contract + key-derivation helpers ready for Plan 106-02's cache.ts (get/put with 30-day TTL via requireServiceClient).
- Migration on disk only; remote apply deferred to the deploy pipeline.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260624000001_phase106_price_research_cache.sql
- FOUND: lib/estimate/price-research/normalize.ts
- FOUND: .planning/phases/106-cache-table-tenant-scoped-cache-module/106-01-SUMMARY.md
- FOUND commit: 3e41ae66 (Task 1)
- FOUND commit: 852bbb9 (Task 2)

---
*Phase: 106-cache-table-tenant-scoped-cache-module*
*Completed: 2026-06-24*
