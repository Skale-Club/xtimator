---
phase: 175-telegram-platform-events-toggles
plan: 01
subsystem: notifications
tags: [telegram, observability, supabase, vitest, fail-open]

# Dependency graph
requires:
  - phase: 104-whatsapp-notification-templates
    provides: "DB-fallback fail-open pattern (getApprovedTemplateForEvent) mirrored by isTelegramAlertEnabled()"
  - phase: 172-notification-templates
    provides: "20260721000001 migration slot (confirmed this plan's migration is ...000002, not a collision)"
provides:
  - "PlatformEventKind — 10-kind typed union + PLATFORM_EVENTS catalog (label/category/locked), sibling to tenant EventType"
  - "isLockedPlatformEvent() — locked-set membership check (pipeline_stuck, cron_failed)"
  - "platform_notification_preferences table (migration, not yet applied to prod)"
  - "isTelegramAlertEnabled(kind) — fail-open Telegram delivery gate with 30s TTL cache + invalidatePlatformPreferencesCache()"
  - "notifyOps() now gates Telegram per-kind through the toggle matrix; Sentry stays unconditional"
affects: [175-02-tenant-event-routing, 175-03-admin-toggle-ui]

tech-stack:
  added: []
  patterns:
    - "Fail-open DB-preference gate: lazy import + nullable createServiceClient() + try/catch → console.warn + safe default, mirrored from whatsapp-registry.ts"
    - "30s in-memory TTL cache (Map) mirroring lib/platform-config.ts's brandingCache/integrationCache pattern"
    - "Locked-kind short-circuit checked BEFORE any DB read, so critical alerts never depend on DB availability"

key-files:
  created:
    - lib/notifications/platform-events.ts
    - lib/observability/platform-preferences.ts
    - supabase/migrations/20260721000002_phase175_platform_notification_preferences.sql
    - tests/unit/notifications/platform-events.test.ts
    - tests/unit/observability/platform-preferences.test.ts
  modified:
    - lib/observability/ops-alert.ts
    - tests/unit/observability/ops-alert.test.ts

key-decisions:
  - "PlatformEventKind is a SIBLING union to tenant EventType, never merged — platform alerts carry no company_id and flow through notifyOps(), not the tenant notify() dispatch"
  - "tenant_payment_received (Connect: customer→tenant) and subscription_payment_received (platform: tenant→Xtimator) are distinct kinds, kept separate for Plan 02's two Stripe webhook arms"
  - "Locked set is exactly {pipeline_stuck, cron_failed} — reliability-down signals that must always reach Telegram; ai_fallback stays admin-toggleable despite critical category since it's degraded-but-working, not an outage"
  - "isLockedPlatformEvent() check happens BEFORE any DB read in isTelegramAlertEnabled(), so locked-kind delivery has zero DB dependency"
  - "Migration ships inert per project convention — applied to prod manually, not via CI/deploy"

patterns-established:
  - "Pattern: platform-scoped alert catalogs live beside (not inside) tenant-scoped catalogs, with their own gate module under lib/observability/"

requirements-completed: [PLAT-01, PLAT-03]

# Metrics
duration: 5min
completed: 2026-07-21
---

# Phase 175 Plan 01: Platform-Event Catalog & Telegram Toggle Gate Summary

**Typed 10-kind PlatformEventKind catalog (4 tenant + 6 reliability kinds) plus a fail-open isTelegramAlertEnabled() gate wired into notifyOps(), with pipeline_stuck/cron_failed locked to always deliver regardless of DB toggle state.**

## Performance

- **Duration:** 5 min
- **Started:** 2026-07-21T21:57:00Z (approx, first file read)
- **Completed:** 2026-07-21T22:01:19-04:00
- **Tasks:** 2 completed
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments
- `lib/notifications/platform-events.ts` — typed `PlatformEventKind` union (10 kinds), `PLATFORM_EVENTS` catalog with label/category/locked, `LOCKED_PLATFORM_EVENT_KINDS` set, `isLockedPlatformEvent()`
- `supabase/migrations/20260721000002_phase175_platform_notification_preferences.sql` — service-role-only `platform_notification_preferences` table seeded for all 10 kinds, ships inert
- `lib/observability/platform-preferences.ts` — `isTelegramAlertEnabled(kind)` fail-open gate (locked bypass, 30s TTL cache, DB-fallback shape mirroring `whatsapp-registry.ts`) + `invalidatePlatformPreferencesCache()`
- `lib/observability/ops-alert.ts`'s `notifyOps()` now gates the Telegram send per-kind through the toggle while `Sentry.captureMessage` remains completely unconditional
- 30 automated tests (7 catalog + 8 gate + 15 ops-alert, including 7 new + 8 pre-existing unmodified) all passing; `tsc -p tsconfig.ci.json --noEmit` clean

## Task Commits

Each task was committed atomically:

1. **Task 1: Platform-event catalog + preferences migration** - `e8466812` (feat)
2. **Task 2: Toggle-gate logic + notifyOps() wiring** - `34fe5ba3` (feat)

**Plan metadata:** (this commit, pending)

## Files Created/Modified
- `lib/notifications/platform-events.ts` - `PlatformEventKind` union, `PLATFORM_EVENTS` catalog, `isLockedPlatformEvent()`
- `supabase/migrations/20260721000002_phase175_platform_notification_preferences.sql` - preferences table, service-role-only RLS, seeded rows for all 10 kinds
- `tests/unit/notifications/platform-events.test.ts` - set-equality, shape, and locked-bypass coverage for the catalog
- `lib/observability/platform-preferences.ts` - `isTelegramAlertEnabled(kind)` fail-open gate + `invalidatePlatformPreferencesCache()`
- `tests/unit/observability/platform-preferences.test.ts` - locked-bypass, DB-honor, fail-open (no row/no client/rejecting query), and cache-invalidation coverage
- `lib/observability/ops-alert.ts` - `notifyOps()` step 3 now gates `sendTelegramMessage` behind `isTelegramAlertEnabled(alert.kind)`; step 2 (Sentry) untouched
- `tests/unit/observability/ops-alert.test.ts` - added `isTelegramAlertEnabled` mock (default enabled, preserving every pre-existing test) + 3 new toggle-gate tests

## Decisions Made
- Kept `PlatformEventKind` fully separate from tenant `EventType` per the plan's locked architectural decision — no shared identifiers, no merged maps.
- Preserved the exact fail-open code shape from `whatsapp-registry.ts` (lazy import, nullable service client, try/catch → warn + safe default) for `platform-preferences.ts`, and the exact TTL-cache shape from `lib/platform-config.ts`, so the new module reads as idiomatic to reviewers already familiar with those files.
- Migration filename confirmed as `...000002` (not `...000001`, which belongs to Phase 172) per the plan-check revision instructions; verified no existing `20260721000002*` file before writing.

## Deviations from Plan

None - plan executed exactly as written (post-plan-check revision).

## Issues Encountered
None. A sibling executor (172-03) was concurrently modifying `lib/notifications/dispatch.ts`, `lib/notifications/template-resolver.ts`, and (mid-session) `.planning/phases/176-.../176-01-PLAN.md` in the same working tree; all staging/commits in this plan used pathspec-scoped `git add`/`git commit -- <paths>` targeting only this plan's files, and no index.lock contention occurred.

## User Setup Required

**Manual migration required before Plan 02/03 depend on it.** The `platform_notification_preferences` table has NOT been applied to prod. Per project convention, apply `supabase/migrations/20260721000002_phase175_platform_notification_preferences.sql` manually (`supabase db push` or run the SQL directly against prod) before any code reading/writing that table ships live.

## Next Phase Readiness
- Plan 02 (tenant signup/payment/subscription-payment/quota-revival routing) can now call `notifyOps({ kind: 'tenant_signup' | 'tenant_payment_received' | 'subscription_payment_received' | 'tenant_quota_exhausted', ... })` and have it automatically gated by the toggle matrix.
- Plan 03 (admin toggle UI) has a stable contract: read/write `platform_notification_preferences` rows keyed by `PlatformEventKind`, call `invalidatePlatformPreferencesCache()` after every save.
- Blocker: the migration must be applied to prod manually before Plan 02/03's DB-dependent behavior (as opposed to the fail-open default) takes effect.

---
*Phase: 175-telegram-platform-events-toggles*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 8 claimed files found on disk; both task commits (`e8466812`, `34fe5ba3`) verified present in git log.
