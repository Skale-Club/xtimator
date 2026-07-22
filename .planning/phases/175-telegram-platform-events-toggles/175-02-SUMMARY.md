---
phase: 175-telegram-platform-events-toggles
plan: 02
subsystem: notifications
tags: [telegram, observability, stripe, quota, vitest, fail-open]

# Dependency graph
requires:
  - phase: 175-telegram-platform-events-toggles
    provides: "PlatformEventKind catalog + isTelegramAlertEnabled() toggle gate wired into notifyOps() (Plan 01)"
provides:
  - "notifyOps({kind:'tenant_signup'}) fired from createOrUpdateCompany's mode:'first' brand-new-company branch"
  - "notifyOps({kind:'tenant_payment_received'}) fired from both connect-webhook.ts arms (checkout.session.completed + invoice.paid — Stripe Connect, customer pays tenant)"
  - "notifyOps({kind:'subscription_payment_received'}) fired from both handlePlatformEvent arms (checkout.session.completed mode:'subscription' + invoice.paid — platform, tenant pays Xtimator)"
  - "notifyOps({kind:'tenant_quota_exhausted'}) fired from notifyQuotaThresholds' 100% branch in lib/quota.ts"
  - "notifyQuotaThresholds() revived with a live production caller in generate-estimate.ts's record-usage path"
affects: [176-end-customer-consent-optout-quiet-hours]

tech-stack:
  added: []
  patterns:
    - "Sibling void notifyOps() call placed inside the SAME try block as the existing void notify() call, never replacing/awaiting it — mirrors the 260705-c1y precedent"
    - "Test-safety-first: vi.mock('@/lib/observability/ops-alert') added to every test file exercising a call site that now carries a dedupeKey, before wiring the call site itself, to prevent a real Upstash SETNX round-trip"

key-files:
  created: []
  modified:
    - lib/actions/company.ts
    - lib/billing/connect-webhook.ts
    - lib/quota.ts
    - lib/inngest/functions/generate-estimate.ts
    - app/api/webhooks/stripe/route.ts
    - tests/unit/company-action.test.ts
    - tests/unit/notifications/event-sources.test.ts
    - tests/unit/webhooks/connect-events.test.ts
    - tests/unit/billing/stripe-webhook.test.ts

key-decisions:
  - "lib/quota.ts's tenant_quota_exhausted notifyOps() call was implemented and committed as part of Task 1 (not Task 2, despite quota.ts being listed under Task 2's files in the plan frontmatter) because its test coverage naturally lives in tests/unit/notifications/event-sources.test.ts Block G — a Task 1 file that exercises notifyQuotaThresholds() directly and already needed the ops-alert mock for Block D's Connect assertions"
  - "tenant_payment_received (Stripe Connect — customer pays tenant) and subscription_payment_received (platform webhook — tenant pays Xtimator) kept structurally distinct per the plan's locked decision: wired from different Stripe webhook handlers (connect-webhook.ts vs app/api/webhooks/stripe/route.ts), never conflated"
  - "notifyQuotaThresholds revival call is a non-durable void async IIFE inside the Inngest handler body (not step.run), matching the existing fire-and-forget posture of void notify()/notifyOps() calls elsewhere in the same function — a failure never blocks or retries generation"

patterns-established:
  - "Pattern: quota-threshold platform alerting piggybacks on the existing tenant-facing notifyQuotaThresholds() helper rather than a separate call site, keeping the 80%/100% crossing logic in one place"

requirements-completed: [PLAT-01]

# Metrics
duration: 12min
completed: 2026-07-21
---

# Phase 175 Plan 02: Platform-Event Routing (Net-New notifyOps Call Sites) Summary

**Wired all 4 net-new platform events (tenant_signup, tenant_payment_received, subscription_payment_received, tenant_quota_exhausted) into notifyOps() as additive sibling calls, and revived notifyQuotaThresholds() — dead since Phase 77 — with a real production caller in the estimate-generation usage path.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-21T22:07:00Z (approx, first file read)
- **Completed:** 2026-07-21T22:11:42Z
- **Tasks:** 2 completed
- **Files modified:** 9

## Accomplishments
- `lib/actions/company.ts` — `notifyOps({kind:'tenant_signup'})` fires from the `mode:'first'` brand-new-company branch, alongside the existing `grantSignupCredits` call
- `lib/billing/connect-webhook.ts` — `notifyOps({kind:'tenant_payment_received'})` fires from both `handleCheckoutSessionCompleted` and `handleInvoicePaid` (Stripe Connect arms — customer pays tenant), each inside the same try block as the existing `void notify(...)` call, dedupe-keyed by Stripe event id
- `lib/quota.ts` — `notifyQuotaThresholds()`'s 100% branch gained `notifyOps({kind:'tenant_quota_exhausted'})`, a sibling to the existing `quota.exhausted` tenant `notify()` call
- `app/api/webhooks/stripe/route.ts` — `notifyOps({kind:'subscription_payment_received'})` fires from `handlePlatformEvent`'s `checkout.session.completed` (mode:`'subscription'`) and `invoice.paid` arms (platform revenue — tenant pays Xtimator), structurally distinct from `tenant_payment_received`
- `lib/inngest/functions/generate-estimate.ts` — `notifyQuotaThresholds()` now has its first production caller since Phase 77: a best-effort, non-durable, try/caught call right after the existing `record-usage` `step.run` succeeds — no changes to the function's step structure, idempotency keys, or costContext threading
- Test-safety: `@/lib/observability/ops-alert` mocked in `tests/unit/notifications/event-sources.test.ts`, `tests/unit/webhooks/connect-events.test.ts`, and `tests/unit/billing/stripe-webhook.test.ts` — no test file in the repo can trigger a real Supabase/Telegram/Redis round-trip via `notifyOps`'s dedupeKey-driven Upstash SETNX as a side effect of these changes
- 142 tests pass across the full plan verification set (61 in the plan's exact `<verification>` block + `tests/unit/observability`); `tsc -p tsconfig.ci.json --noEmit` clean after both tasks

## Task Commits

Each task was committed atomically:

1. **Task 1: Tenant signup + tenant_payment_received (Stripe Connect) + tenant_quota_exhausted (quota.ts)** - `22deae44` (feat)
2. **Task 2: subscription_payment_received (platform Stripe webhook) + revive notifyQuotaThresholds()** - `f0fc6b2f` (feat)

**Plan metadata:** (this commit, pending)

## Files Created/Modified
- `lib/actions/company.ts` - `notifyOps({kind:'tenant_signup'})` sibling call in the brand-new-company insert branch
- `lib/billing/connect-webhook.ts` - `notifyOps({kind:'tenant_payment_received'})` sibling calls in both Connect handlers
- `lib/quota.ts` - `notifyOps({kind:'tenant_quota_exhausted'})` sibling call at the 100% threshold inside `notifyQuotaThresholds`
- `lib/inngest/functions/generate-estimate.ts` - revives `notifyQuotaThresholds()` with a real caller after `record-usage`; imports `getEntitlementsForTier` + `notifyQuotaThresholds`
- `app/api/webhooks/stripe/route.ts` - `notifyOps({kind:'subscription_payment_received'})` sibling calls in both platform Stripe webhook arms
- `tests/unit/company-action.test.ts` - mocks `@/lib/observability/ops-alert`, asserts `tenant_signup` fires on the INSERT branch
- `tests/unit/notifications/event-sources.test.ts` - mocks `@/lib/observability/ops-alert`; Block D gains a `tenant_payment_received` assertion on the existing `checkout.session.completed` test plus a new sibling test for the Connect `invoice.paid` arm; Block G gains a `tenant_quota_exhausted` assertion on the 100%-threshold test
- `tests/unit/webhooks/connect-events.test.ts` - mocks `@/lib/observability/ops-alert` (test-safety only, no new assertions per plan instructions)
- `tests/unit/billing/stripe-webhook.test.ts` - mocks `@/lib/observability/ops-alert`; adds `subscription_payment_received` assertions (with exact dedupeKeys) to the existing `checkout.session.completed` and `invoice.paid` tests

## Decisions Made
- Kept `lib/quota.ts`'s `notifyOps` addition inside Task 1's commit (see key-decisions above) rather than splitting it into Task 2, since its only test coverage (`event-sources.test.ts` Block G) sits in a Task 1 file and both changes were made together for coherence.
- Placed each new `notifyOps(...)` call inside the exact same `try` block as its sibling `notify(...)`/`notifyOps` call (not after the `catch`), since several sites reference `try`-scoped `const` locals (e.g. `amountUSD`) that are out of scope after the block closes.
- `invoice.paid`'s `subscription_payment_received` call fires unconditionally right after the `tier_renews_at` update, before (and not gated on) the credit-grant company lookup, per the plan's explicit instruction — Stripe has already confirmed payment by that point.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added the `lib/quota.ts` `tenant_quota_exhausted` `notifyOps()` call, which the plan's `must_haves.artifacts` and `truths` required but neither Task 1's nor Task 2's `<action>` prose actually described as a diff**
- **Found during:** Task 1 (reading the plan's `<interfaces>` section, which asserted "Task 1 already covers quota.ts" — a stale cross-reference that didn't match Task 1's actual `<files>`/`<action>` content)
- **Issue:** The plan's success criteria explicitly requires proof, "by automated tests, not manual inspection," that all 4 net-new `notifyOps` kinds fire — including `tenant_quota_exhausted` — and `must_haves.artifacts` explicitly names `lib/quota.ts` as needing "tenant_quota_exhausted sibling notifyOps() call at the 100% threshold in notifyQuotaThresholds." Without this, `tenant_quota_exhausted` would remain an unwired catalog entry despite being cataloged as PLAT-01 scope.
- **Fix:** Added `import { notifyOps } from '@/lib/observability/ops-alert'` to `lib/quota.ts` and a `void notifyOps({kind:'tenant_quota_exhausted', ...})` sibling call inside the existing 100% branch of `notifyQuotaThresholds`, right after the existing `quota.exhausted` `notify()` call. Added a corresponding assertion to `tests/unit/notifications/event-sources.test.ts`'s Block G 100%-threshold test (which already exercises `notifyQuotaThresholds` directly) and extended that file's new `@/lib/observability/ops-alert` mock (added for Block D's test-safety requirement) to cover it — no separate mock needed.
- **Files modified:** `lib/quota.ts`, `tests/unit/notifications/event-sources.test.ts`
- **Verification:** `npx vitest run tests/unit/notifications/event-sources.test.ts tests/unit/quota.test.ts` — all pass; `tsc -p tsconfig.ci.json --noEmit` clean
- **Committed in:** `22deae44` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 missing critical functionality)
**Impact on plan:** Necessary to satisfy the plan's own stated success criteria (all 4 net-new kinds proven by automated test) and `must_haves.artifacts`. No scope creep beyond what the plan itself required.

## Issues Encountered
None. The plan-check revision's `<interfaces>` section contained a stale cross-reference ("Task 1 already covers quota.ts") that didn't correspond to any diff in either task's `<action>` prose — resolved per the deviation above rather than treated as a blocker.

## User Setup Required
None - no external service configuration required. (Plan 01's `platform_notification_preferences` migration must still be applied to prod manually before Telegram toggle behavior takes effect for these new call sites — this was already flagged as a blocker in the 175-01 SUMMARY and is unchanged by this plan.)

## Next Phase Readiness
- All 4 net-new platform events (`tenant_signup`, `tenant_payment_received`, `subscription_payment_received`, `tenant_quota_exhausted`) now route through `notifyOps()` from live production call sites, each additive alongside its existing tenant `notify()` call.
- `notifyQuotaThresholds()` is no longer dead code — it has exactly one production caller (`generate-estimate.ts`'s `record-usage` path), fully isolated by try/catch.
- Phase 175's PLAT-01 requirement (catalog + toggle gate from Plan 01, routing from this plan) is functionally complete pending the Plan 01 migration being applied to prod.
- 175-03 (admin toggle UI) was already executed by a concurrent sibling agent per `.planning/phases/175-telegram-platform-events-toggles/175-03-SUMMARY.md` found on disk at the start of this session.

---
*Phase: 175-telegram-platform-events-toggles*
*Completed: 2026-07-21*

## Self-Check: PASSED

All 9 claimed source/test files found on disk; both task commits (`22deae44`, `f0fc6b2f`) verified present in git log.
