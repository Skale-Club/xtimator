---
phase: 111-billing-config-store-super-admin-billing-panel
plan: 01
subsystem: billing
tags: [billing-config, platform-integrations, zod, ttl-cache, server-only, audit-log]

# Dependency graph
requires:
  - phase: 110-real-cost-capture-foundation
    provides: "whisper-cost rate const (whisperUsdPerMinute fallback) + measure-only cost data the defaults will be calibrated against"
provides:
  - "lib/billing/billing-config.ts: DEFAULT_BILLING_CONFIG constant, BillingConfig type, server-only null-safe getBillingConfig() reader with 30s TTL cache (mirrors getSelectedAIProvider + brandingCache)"
  - "billingConfigSchema (zod) + BillingConfigInput in lib/schemas/admin.ts (money=integer cents, percentages=0..1 decimals)"
  - "'billing_config.save' AuditAction member (ready for the Plan 02 writer)"
  - "invalidateBillingConfigCache() wired into invalidatePlatformConfig() — runtime-apply-without-deploy key link"
affects: [111-02 super-admin billing panel, 112 credit ledger, 113 stripe rail, 114 estimate fee, 116 calibration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Metadata-only platform_integrations row (provider='billing_config') — no migration; existing CHECK permits all-null crypto cols with metadata set"
    - "Symbol-scoped dormancy: the reader FUNCTION ships unreferenced; the DEFAULT constant + type are public and importable"
    - "30s TTL module cache + central invalidate hook (invalidatePlatformConfig) so a future admin save applies at runtime"

key-files:
  created:
    - lib/billing/billing-config.ts
    - tests/unit/billing/billing-config.test.ts
  modified:
    - lib/schemas/admin.ts
    - lib/admin/audit-log.ts
    - lib/platform-config.ts

key-decisions:
  - "DEFAULT_BILLING_CONFIG values are illustrative placeholders explicitly flagged CALIB-02 — null-safe before any admin save, calibrated from real cost before charging"
  - "Money stored as INTEGER CENTS, percentages as 0..1 decimals (research Pitfall 4) — locked the FINAL billing_config row shape for Phases 112-116"
  - "Reader caches the null-svc / no-row DEFAULT path too (consistent with the brandingCache fallback caching)"

patterns-established:
  - "billing_config reads mirror getSelectedAIProvider: createServiceClient + maybeSingle on the metadata column, shallow-merge over defaults, deep-merge tiers"
  - "Dormancy guard is a symbol-scoped static-source walker (\\bgetBillingConfig\\b across lib/app/components minus the module + tests), NOT path-scoped — Plan 02 may import DEFAULT_BILLING_CONFIG/type"

requirements-completed: [BILLCFG-01, BILLCFG-03]

# Metrics
duration: 6min
completed: 2026-06-24
---

# Phase 111 Plan 01: billing_config Store CORE Summary

**Server-only, null-safe `getBillingConfig()` reader over a metadata-only `billing_config` platform_integrations row (30s TTL cache, deep-merged tiers), with the shared `billingConfigSchema` (zod) and the `'billing_config.save'` AuditAction the Plan 02 writer needs — reader ships dormant, no migration.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-24T15:46:22Z
- **Completed:** 2026-06-24T15:52:45Z
- **Tasks:** 4
- **Files modified:** 5 (2 created, 3 modified)

## Accomplishments
- `getBillingConfig()` — server-only, null-safe reader: returns `DEFAULT_BILLING_CONFIG` before any save and when the service client is unavailable (static build); shallow-merges stored metadata over defaults and deep-merges `tiers` so a row written before a field existed still resolves.
- `DEFAULT_BILLING_CONFIG` + `BillingConfig` type capturing the FINAL param set (markup, creditUnitUsd, whisperUsdPerMinute, estimateFeePct, estimateFeeMinCents, per-tier grant+price, topUpPacks, lowBalanceThresholds, meteredOperations, absorbedChatRateLimitPerMin) — illustrative placeholders flagged CALIB-02.
- `billingConfigSchema` (zod) + `BillingConfigInput` in the admin-schema home, money as integer cents / percentages as 0..1 decimals; round-trips the defaults and rejects negative/zero markup, fee > 1, non-int cents, a tiers object missing `business`, and `creditUnitUsd: 0`.
- `'billing_config.save'` added to the `AuditAction` union BEFORE any writer (avoids the known tsc-drift class) and a 30s TTL cache whose `invalidateBillingConfigCache()` is wired into `invalidatePlatformConfig()` — a Plan 02 save applies at runtime without a deploy.

## Task Commits

Each task was committed atomically:

1. **Task 1 (Wave 0 — RED): billing-config test file** — `a645a6ac` (test)
2. **Task 2 (GREEN — schema + audit action)** — `b9d28c21` (feat)
3. **Task 3 (GREEN — reader module)** — `62505cf9` (feat)
4. **Task 4 (TTL cache + invalidation hook)** — `8e1a0696` (feat)

**Plan metadata:** _(final docs commit appended after this summary)_

_Note: TDD Tasks 1-3 follow RED→GREEN; Task 4 is the cache/invalidation wiring._

## Files Created/Modified
- `lib/billing/billing-config.ts` (created) — `DEFAULT_BILLING_CONFIG`, `BillingConfig`/`TopUpPack`/`TierBilling`/`BillingTier` types, server-only `getBillingConfig()` reader + 30s TTL cache + `invalidateBillingConfigCache()`.
- `tests/unit/billing/billing-config.test.ts` (created) — defaults / merge / schema / server-only / symbol-scoped dormancy coverage (14 tests).
- `lib/schemas/admin.ts` (modified) — `billingConfigSchema` + `BillingConfigInput` + `tierBillingSchema`.
- `lib/admin/audit-log.ts` (modified) — `'billing_config.save'` AuditAction member.
- `lib/platform-config.ts` (modified) — imports + calls `invalidateBillingConfigCache()` inside `invalidatePlatformConfig()`.

## Decisions Made
- DEFAULT values are illustrative-by-design (CALIB-02): the store is correct and null-safe today; real numbers come from the cost measured since Phase 110 before charging turns on.
- The schema lives in `lib/schemas/admin.ts` (the established admin-zod home) so the Plan 02 client form and server action share one source-of-truth shape.
- Dormancy is enforced symbol-scoped (the `getBillingConfig` function), not path-scoped, so the same test stays GREEN after Plan 02 imports `DEFAULT_BILLING_CONFIG`/`BillingConfig` from the module path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded doc-comment tokens that tripped static-source grep acceptance**
- **Found during:** Task 3 and Task 4
- **Issue:** Two acceptance gates are literal static greps. Task 3's `grep -Ec "whisper-cost|record-ai-cost|entitlements|stripe" === 0` matched two doc-comment mentions (`lib/entitlements.ts TierName`, `whisper-cost const`). Task 4's symbol-scoped dormancy walker matched the `getBillingConfig()` mention in the Task 2 `lib/schemas/admin.ts` doc comment (the contract forbids the function symbol anywhere in production code, comments included).
- **Fix:** Reworded the three doc comments to keep their meaning without the literal tokens ("mirrors the TierName union", "runtime source for the Phase-110 transcription rate const", "the billing-config reader"). No code/behavior change.
- **Files modified:** lib/billing/billing-config.ts, lib/schemas/admin.ts
- **Verification:** consumer-wiring grep → 0; dormancy test → GREEN; full billing-config suite 14/14.
- **Committed in:** 62505cf9 (Task 3), 8e1a0696 (Task 4)

---

**Total deviations:** 1 auto-fixed (Rule 1 — doc-comment token rewording to satisfy static-source contract gates).
**Impact on plan:** Cosmetic comment wording only; the reader, schema, and cache are exactly as specified. No scope creep, no behavior change.

## Issues Encountered
- The single shared test file imports `invalidateBillingConfigCache` (added in Task 4) in its `beforeEach`, so the behavioral tests could not execute GREEN at Task 3 (import-resolution barrier). Resolved as designed: Task 4 adds the symbol and the file goes fully 14/14 GREEN. The reader module itself was correct and tsc-clean at Task 3.

## User Setup Required
None — no migration, no external service configuration. `billing_config` is a metadata-only `platform_integrations` row created on the first Plan 02 admin save; the existing CHECK (migration 20260517000002) already permits all-null crypto columns with metadata set.

## Next Phase Readiness
- Plan 02 (super-admin Billing panel) can import `DEFAULT_BILLING_CONFIG` + `BillingConfig` for the form defaults, validate with `billingConfigSchema`, audit with `'billing_config.save'`, and flush via `invalidatePlatformConfig()` on save — all surfaces exist and are tested.
- Reader stays DORMANT: phases 112 (ledger) / 113 (Stripe) / 114 (fee) / 116 (calibration) wire `getBillingConfig()` later. No consumer (whisper-cost / record-ai-cost / entitlements / invoice-service / Stripe) was touched.

## Self-Check: PASSED

- FOUND: lib/billing/billing-config.ts
- FOUND: tests/unit/billing/billing-config.test.ts
- FOUND commits: a645a6ac (test), b9d28c21 (schema+audit), 62505cf9 (reader), 8e1a0696 (cache+invalidate)

---
*Phase: 111-billing-config-store-super-admin-billing-panel*
*Completed: 2026-06-24*
