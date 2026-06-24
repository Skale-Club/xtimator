---
phase: 111-billing-config-store-super-admin-billing-panel
plan: 02
subsystem: billing
tags: [billing-config, platform-integrations, super-admin, zod, audit-log, runtime-config]

# Dependency graph
requires:
  - phase: 111-billing-config-store-super-admin-billing-panel
    provides: "Plan 01 DEFAULT_BILLING_CONFIG + BillingConfig type, billingConfigSchema (lib/schemas/admin), 'billing_config.save' AuditAction, invalidateBillingConfigCache wired into invalidatePlatformConfig"
provides:
  - "saveBillingConfig() server action — requireAdmin-first, zod-validated, metadata-only platform_integrations upsert (provider='billing_config'), cache-invalidating, audited"
  - "'billing' category in the integrations catalog (showBillingConfig flag) → panel at /admin/integrations/billing"
  - "BillingConfigForm client component (grouped fieldsets) writing the FULL BillingConfig shape"
  - "billing-config-save tests: authz-position, validate-rejects, upsert-shape, app/-scoped tenant-no-route guard"
affects: [112 credit ledger, 113 stripe rail, 114 estimate fee, 116 calibration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Super-admin runtime-config save mirrors setPriceResearchSource exactly: requireAdmin gate FIRST → zod safeParse → metadata-only upsert (crypto cols null) → invalidatePlatformConfig → revalidatePath → audit"
    - "Inline billing_config metadata read in the category-content host (deep-merged tiers over DEFAULT_BILLING_CONFIG) — never references the dormant getBillingConfig reader"
    - "app/-scoped static-source walker (skips app/admin) matching SPECIFIC markers (billing-config-form import + provider:'billing_config' upsert literal), not the bare token"

key-files:
  created:
    - app/admin/integrations/billing-config-form.tsx
    - tests/unit/admin/billing-config-save.test.ts
  modified:
    - app/admin/integrations/actions.ts
    - lib/admin/integrations-providers.ts
    - app/admin/integrations/integration-category-content.tsx
    - lib/admin/audit-log.ts

key-decisions:
  - "saveBillingConfig writes the FULL BillingConfig (incl. meteredOperations + absorbedChatRateLimitPerMin passed straight through from current) so the saved row matches what Phases 112-116 read"
  - "Panel attaches at /admin/integrations/billing via a NEW 'billing' category — NOT the Phase-60 /admin/billing route (collision avoided)"
  - "Form does only string→number conversion; the action's billingConfigSchema.safeParse is the validator of record"

patterns-established:
  - "Money inputs labelled (cents), percentages labelled (0–1); illustrative-defaults caption flags CALIB-02"

requirements-completed: [BILLCFG-02, BILLCFG-03]

# Metrics
duration: 8min
completed: 2026-06-24
---

# Phase 111 Plan 02: billing_config Store + Super-Admin Billing Panel Summary

**A requireAdmin-first `saveBillingConfig()` server action (zod-validated, metadata-only `billing_config` upsert, cache-invalidating, audited) plus a new `billing` integrations category and inline `BillingConfigForm` at `/admin/integrations/billing` — a super-admin edits every billing parameter and Save applies at runtime with no deploy; tenants have no route.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-06-24T15:56:17Z
- **Completed:** 2026-06-24T16:04:00Z
- **Tasks:** 4
- **Files modified:** 6 (2 created, 4 modified)

## Accomplishments
- `saveBillingConfig(input: unknown)` appended to `app/admin/integrations/actions.ts`: `requireAdmin()` is the FIRST statement (BILLCFG-03 authz position), then `billingConfigSchema.safeParse` (invalid → `ok:false`, NO upsert), then a metadata-only `platform_integrations` upsert (`provider='billing_config'`, all crypto columns explicitly `null`, `metadata: parsed.data`, `onConflict: 'provider'`), then `invalidatePlatformConfig()` (runtime apply — flushes the Plan-01 billing TTL cache), `revalidatePath('/admin/integrations')`, and a `'billing_config.save'` audit entry (no raw config logged).
- New `billing` category in `CATEGORIES` (`showBillingConfig` flag on the `Category` type) — the nav + route auto-pick it up at `/admin/integrations/billing`. NOT the Phase-60 `/admin/billing` route.
- `integration-category-content.tsx` loads the current `billing_config` metadata inline (deep-merged `tiers` over `DEFAULT_BILLING_CONFIG`) and renders `BillingConfigForm` — never references the dormant `getBillingConfig` reader, keeping Plan 01's symbol-scoped dormancy guard green.
- `BillingConfigForm` ('use client'): grouped fieldsets for markup/credit unit, Whisper rate, estimate fee (% labelled 0–1) + min cents, per-tier grants+prices (cents), add/removable top-up packs, comma-parsed low-balance thresholds, and a carried-through note for `meteredOperations` + `absorbedChatRateLimitPerMin`. Save assembles the FULL `BillingConfig` and calls `saveBillingConfig` inside `startTransition` with sonner toast. CALIB-02 caption + `min-h-[44px]` Save button.
- `tests/unit/admin/billing-config-save.test.ts` (5 tests): authz-first (non-admin rejected before any upsert), validate-rejects (`{}` + negative markup → `ok:false`, no upsert), happy-path upsert shape (provider + null crypto + metadata deep-equal + `invalidatePlatformConfig` + `'billing_config.save'` audit), and an `app/`-scoped tenant-no-route walker (skips `app/admin`, `tests`, `node_modules`, `.next`) asserting no `billing-config-form` import and no `provider: 'billing_config'` upsert literal in any tenant file.

## Task Commits

Each task was committed atomically (normal hooked commits, gitleaks clean):

1. **Task 1 — saveBillingConfig() server action** — `71964597` (feat)
2. **Task 2 — 'billing' category + load/render branch** — `cf3a0a13` (feat)
3. **Task 3 — BillingConfigForm client component** — `ad9c38c2` (feat)
4. **Task 4 — billing-config-save tests** — `ae1b8e53` (test)

**Plan metadata:** _(final docs commit appended after this summary)_

## Files Created/Modified
- `app/admin/integrations/billing-config-form.tsx` (created) — grouped-fieldset client form, full-shape payload, saveBillingConfig + toast.
- `tests/unit/admin/billing-config-save.test.ts` (created) — 5 tests: authz-position, validate-rejects, upsert-shape, app/-scoped tenant-no-route guard.
- `app/admin/integrations/actions.ts` (modified) — `saveBillingConfig()` appended; `billingConfigSchema` imported from `@/lib/schemas/admin`.
- `lib/admin/integrations-providers.ts` (modified) — `showBillingConfig` flag + `billing` category.
- `app/admin/integrations/integration-category-content.tsx` (modified) — inline `billing_config` load + `BillingConfigForm` render branch.
- `lib/admin/audit-log.ts` (modified) — added the missing `'price_research.set'` AuditAction union member (pre-existing tsc error — see Deviations).

## Decisions Made
- The save writes the FULL `BillingConfig` including `meteredOperations` + `absorbedChatRateLimitPerMin` (passed straight through from `current`), so the stored row is the final shape Phases 112-116 consume.
- Panel lives under the requireAdmin-gated `/admin/integrations/billing` (new `billing` category), deliberately distinct from the Phase-60 `/admin/billing` route.
- `billingConfigSchema` imported only from `@/lib/schemas/admin` (its sole home — no re-export from `billing-config`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added missing `'price_research.set'` AuditAction union member**
- **Found during:** Task 1
- **Issue:** `app/admin/integrations/actions.ts:739` (the pre-existing v4.6 `setPriceResearchSource`) emits `action: 'price_research.set'`, but that string was never added to the `AuditAction` union in `lib/admin/audit-log.ts`. This produced a TS2322 error in `actions.ts` at HEAD — blocking the Task 1 "no NEW tsc error in actions.ts" gate even though my change was clean.
- **Fix:** Added `| 'price_research.set'` to the `AuditAction` union (one line). No behavior change.
- **Files modified:** lib/admin/audit-log.ts
- **Commit:** 71964597 (Task 1)

**2. [Test harness] vi.mock hoisting fix for the platform-config / audit-log spies**
- **Found during:** Task 4
- **Issue:** Referencing top-level `const` spies inside a hoisted `vi.mock` factory threw "Cannot access before initialization".
- **Fix:** Used inline `vi.fn()` in the factories and captured handles via `vi.mocked(invalidatePlatformConfig)` / `vi.mocked(logAdminAction)` after the import — the established vitest pattern. No assertion change.
- **Files modified:** tests/unit/admin/billing-config-save.test.ts
- **Commit:** ae1b8e53 (Task 4)

**Total deviations:** 2 (1 Rule-3 one-line union fix that unblocked the tsc gate; 1 test-harness hoisting fix). No scope creep, no production behavior change beyond the intended save action.

## Deferred Issues
Pre-existing project-wide `tsc --noEmit` errors in 4 unrelated TEST files (regex-flag target + mock-generic nits) were discovered during the final full-project type-check. None are in any of the 5 plan files; all pre-date this plan and run green under vitest. Logged to `deferred-items.md` — NOT fixed (scope boundary).

## Verification
- `npx vitest run tests/unit/admin tests/unit/billing` — 31 files / 191 tests GREEN.
- `npx vitest run` (full suite) — 283 files passed, 3 skipped, 0 failed (1986 passed / 2 skipped / 33 todo).
- `npx tsc --noEmit` — NONE of the 5 touched files report errors (the only errors are the pre-existing unrelated test-file nits above).
- Plan 01 dormancy guard (`billing-config.test.ts`) stays 14/14 GREEN — no `getBillingConfig` reference introduced.

## Known Stubs
None that block the plan goal. `meteredOperations` + `absorbedChatRateLimitPerMin` are intentionally non-editable this phase (carried straight through from the loaded `current` values so the saved row keeps the final shape); they get UI/wiring in Phase 112 (ledger). This is documented in the form's "Advanced (carried through)" note and is by-design per the plan, not an unwired stub.

## Next Phase Readiness
- A super-admin can now persist real `billing_config` values from `/admin/integrations/billing`; the row applies at runtime (cache flush) with no deploy.
- The reader `getBillingConfig()` (Plan 01) is still dormant in production code — Phases 112 (ledger) / 113 (Stripe) / 114 (fee) / 116 (calibration) wire it. No consumer touched.

## Self-Check: PASSED

- FOUND: app/admin/integrations/billing-config-form.tsx
- FOUND: tests/unit/admin/billing-config-save.test.ts
- FOUND commits: 71964597 (Task 1), cf3a0a13 (Task 2), ad9c38c2 (Task 3), ae1b8e53 (Task 4)

---
*Phase: 111-billing-config-store-super-admin-billing-panel*
*Completed: 2026-06-24*
