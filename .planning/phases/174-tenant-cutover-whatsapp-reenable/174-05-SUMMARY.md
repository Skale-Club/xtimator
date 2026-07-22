---
phase: 174-tenant-cutover-whatsapp-reenable
plan: 05
subsystem: notifications
tags:
  - mechanical-sweep
  - copyContext-wiring
  - zero-behavior-change
dependency:
  requires:
    - 174-04
  provides:
    - copyContext wired to 7 call sites in quota/billing subsystem
  affects:
    - lib/quota.ts (notifyQuotaThresholds)
    - lib/billing/credit-ledger.ts (notifyLowCreditBalance)
    - lib/billing/connect-webhook.ts (payment handlers)
tech_stack:
  patterns:
    - mechanical ctx extraction and pass-through
    - zero-enrichment (no new fields, no call-site logic)
  libraries: []
  added: []
key_files:
  created: []
  modified:
    - lib/quota.ts
    - lib/billing/credit-ledger.ts
    - lib/billing/connect-webhook.ts
    - tests/unit/notifications/event-sources.test.ts
decisions: []
metrics:
  duration: ~2min
  tasks_completed: 2
  tasks_total: 2
  files_modified: 4
  lines_added: 37
  lines_removed: 12
  tests_passed: 322
---

# Phase 174 Plan 05: Mechanical copyContext Sweep (Billing/Quota Subsystem) Summary

**Objective:** Wire `copyContext` parameter to 7 `notify()` call sites across quota and billing modules so admin DB template edits for `quota.80pct`, `quota.exhausted`, `payment.received`, and `payment.refunded` take effect for these call sites.

**Result:** All 7 call sites wired. Zero behavior change when no DB template row exists. Admin can now customize notification text via DB templates for these events.

## Execution Summary

### Task 1: Sweep lib/quota.ts + lib/billing/credit-ledger.ts (4 call sites)

**Files:** `lib/quota.ts` (2 sites), `lib/billing/credit-ledger.ts` (2 sites)

Applied the mechanical transform to all 4 call sites:
- Extract the inline ctx literal into a named `const ctx = {...}` variable
- Pass `ctx` to both `buildNotificationCopy()` AND the new `copyContext:` field in `notify()`
- No changes to other parameters or logic

**Call sites:**
1. `lib/quota.ts:notifyQuotaThresholds` — `quota.80pct` (ctx: `{ quotaPercent: Math.floor(newPct) }`)
2. `lib/quota.ts:notifyQuotaThresholds` — `quota.exhausted` (ctx: `{}`)
3. `lib/billing/credit-ledger.ts:notifyLowCreditBalance` — `quota.exhausted` (ctx: `{}`)
4. `lib/billing/credit-ledger.ts:notifyLowCreditBalance` — `quota.80pct` (ctx: `{ quotaPercent: 0 }`)

**Verification:**
- All existing quota/credit-ledger test suites pass
- File integrity check: each file has ≥2 `copyContext:` occurrences
- No behavior change — buildNotificationCopy calls identical, copy.ts output used only as fallback

### Task 2: Sweep lib/billing/connect-webhook.ts (3 call sites) + test coverage

**Files:** `lib/billing/connect-webhook.ts` (3 sites), `tests/unit/notifications/event-sources.test.ts` (2 test extensions)

Applied the same mechanical transform to all 3 payment-related call sites:

**Call sites:**
1. `handleCheckoutSessionCompleted` — `payment.received` (ctx: `{ amountUSD, projectName }`)
2. `handleInvoicePaid` — `payment.received` (ctx: `{ amountUSD, projectName }`)
3. `handleChargeRefunded` — `payment.refunded` (ctx: `{ amountUSD, projectName }`)

**Test coverage:** Extended 2 existing describe blocks with explicit copyContext assertions:
- `handleConnectEvent(checkout.session.completed)` test: verifies `copyContext.amountUSD` and `copyContext.projectName`
- `handleConnectEvent(invoice.paid)` test: verifies `copyContext.amountUSD` and `copyContext.projectName`

**Verification:**
- All notification test suites pass (322 tests)
- `npx tsc --noEmit -p tsconfig.ci.json` passes with no errors
- `npx vitest run tests/unit/notifications/event-sources.test.ts` passes (both payment tests confirm copyContext present)

## Deviations from Plan

None — plan executed exactly as written. All 7 call sites wired, all existing tests remain green, new assertions verify copyContext wiring.

## Commits

| Hash | Message |
| --- | --- |
| 5ea856cd | feat(174-05): wire copyContext to 7 notify() call sites (quota/billing subsystem) |

## Key Implementation Details

- **Zero enrichment:** copyContext passed as-is from call sites; no new fields added (Plan 174-04 already made `notify()` internally apply `buildFullCopyContext` for enrichment)
- **Sparse ctx handling:** Two call sites (`credit-ledger.ts` quota.80pct) pass `{ quotaPercent: 0 }` to template resolution; `buildFullCopyContext` centrally enriches with copy.ts defaults
- **Test strategy:** Used existing `.find()` + property-inspection pattern (not full-object `toHaveBeenCalledWith` equality) to assert copyContext shape, avoiding brittleness against other notify() fields
- **Concurrent safety:** Pathspec-scoped git add/commit preserved; sibling executor 174-06's changes to `lib/inngest/functions/generate-estimate.ts` left untouched

## Verification Status

✓ All 322 tests pass (quota, credit-ledger, notifications suite, event-sources)  
✓ TypeScript check passes  
✓ 7/7 call sites pass copyContext  
✓ Zero behavior change when no DB template row exists  
✓ Commit signed and gitleaks-clean  

**Plan Status: COMPLETE**
