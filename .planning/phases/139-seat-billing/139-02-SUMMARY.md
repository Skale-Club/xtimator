---
phase: 139-seat-billing
plan: 02
subsystem: payments
tags: [stripe, billing, seats, subscriptions, vitest]

# Dependency graph
requires:
  - phase: 139-01
    provides: BillingConfig.seatPriceCents + per-tier includedSeats + billingConfigSchema seat validation
  - phase: 111-billing-config
    provides: getBillingConfig() runtime-authoritative, cached config reader
  - phase: 112-credit-ledger
    provides: requireServiceClient + best-effort never-throw write shape precedent
provides:
  - computeBillableSeats(activeMembers, includedSeats) pure helper = max(0, members - included)
  - computeSeatChargeCents(billableSeats, seatPriceCents) pure helper
  - syncSeatBilling(companyId) server fn — gated, idempotent, never-throw Stripe seat reconciliation
  - syncSubscriptionSeatItem thin mockable Stripe SDK boundary (config-driven inline price_data)
affects: [139-03, seat-billing, membership-actions, stripe-subscription]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure-math module (no server-only) + transitively-server-only sync fn in same file (mirrors estimate-fee + credit-ledger split)"
    - "Stripe SDK seat write isolated behind one thin mockable method; the pure decision (quantity/unitAmount) lives in syncSeatBilling"
    - "enforcementEnabled gating + best-effort never-throw for billing side-effects"

key-files:
  created:
    - lib/billing/seat-billing.ts
    - tests/unit/billing/seat-billing.test.ts
  modified:
    - lib/billing/stripe-client.ts
    - tests/unit/billing/billing-config.test.ts

key-decisions:
  - "Subscription-item price_data requires a product ID (no inline product_data like Checkout) — provision a metadata-tagged seat product find-or-create and reuse it; still NO hardcoded pre-created Price ID, unit_amount stays config-driven"
  - "Idempotency read uses the same subscription.retrieve the SDK boundary uses; compares current quantity + unit_amount to desired before any write"
  - "Unknown tier string falls back to free tier includedSeats (null-safe, never throws)"

patterns-established:
  - "Seat charge math lives in exactly one pure place; callers read seatPriceCents/includedSeats from billing_config at runtime"
  - "Membership-affecting billing side-effects never throw into the caller (log + swallow)"

requirements-completed: [SEAT-07]

# Metrics
duration: 6min
completed: 2026-06-25
---

# Phase 139 Plan 02: Seat Math + syncSeatBilling Summary

**Pure seat arithmetic (computeBillableSeats / computeSeatChargeCents) plus a gated, idempotent, never-throw `syncSeatBilling(companyId)` that reconciles a company's Stripe subscription seat-quantity item to the live member count, with the Stripe SDK write isolated behind one thin mockable method.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-06-25T19:35:59Z
- **Completed:** 2026-06-25T19:42:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments
- `computeBillableSeats` / `computeSeatChargeCents` — pure, integer, boundary-safe (non-finite/negative clamp to 0), no hardcoded seat numbers.
- `syncSeatBilling(companyId)` — reads getBillingConfig() + live company_members count + company tier/subscription, computes billableSeats, gated by `enforcementEnabled`, idempotent (unchanged quantity+unitAmount = no-op), best-effort never-throw.
- `syncSubscriptionSeatItem` thin Stripe boundary — config-driven inline `price_data` (metadata-tagged auto-provisioned seat product, NO pre-created Price ID), find-or-create seat item by `metadata.kind === 'seat'`.
- Single-owner retrocompat: activeMembers=1 within includedSeats → billable=0 → NO Stripe write in either mode (tested).
- seat-billing.ts added to the BILLCFG-03 dormancy-guard allowlist; full billing suite (27 files / 217 tests) stays green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure seat math (RED→GREEN)** - `7a3bc56e` (feat)
2. **Task 2: syncSeatBilling + thin Stripe seat-item method** - `6134b960` (feat)
3. **Task 3: syncSeatBilling behavior tests + dormancy allowlist** - `dc4d42a2` (test)

_TDD Task 1: RED (failing module-missing test) then GREEN committed together as one atomic feat._

## Files Created/Modified
- `lib/billing/seat-billing.ts` - Pure seat math + server-side syncSeatBilling (3 exports)
- `lib/billing/stripe-client.ts` - Added syncSubscriptionSeatItem + ensureSeatProduct + SEAT_ITEM_METADATA_KIND
- `tests/unit/billing/seat-billing.test.ts` - Pure golden cases + 9 syncSeatBilling behavior cases
- `tests/unit/billing/billing-config.test.ts` - Allowlisted seat-billing.ts as a legitimate getBillingConfig consumer

## Decisions Made
- **Seat product provisioning:** Stripe subscription-item `price_data` requires a `product` ID (it does NOT accept Checkout-style inline `product_data`). Resolved by find-or-create of a metadata-tagged (`kind:'seat'`) product that is reused across syncs. This preserves the plan's intent — no hardcoded pre-created Price ID, unit_amount fully config-driven from `seatPriceCents` on every sync.
- **Idempotency source:** the unchanged-quantity check reads the current seat item off the same `subscriptions.retrieve` and compares both quantity and unit_amount before deciding to write.
- **Unknown tier:** falls back to the free tier's includedSeats rather than throwing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Subscription-item price_data needs a product ID, not inline product_data**
- **Found during:** Task 2 (thin Stripe seat-item method)
- **Issue:** The plan's sketch used `price_data.product_data`, which TypeScript rejected (TS2353) — `Stripe.SubscriptionItemCreateParams.PriceData` only accepts `product: string`, unlike Checkout's inline `product_data`. This blocked tsc.
- **Fix:** Added `ensureSeatProduct(stripe)` — a find-or-create of an active, `metadata.kind='seat'`-tagged Product whose ID feeds `price_data.product`. The unit_amount remains inline + config-driven; still NO hardcoded pre-created Price ID.
- **Files modified:** lib/billing/stripe-client.ts
- **Verification:** `npx tsc --noEmit` clean for stripe-client.ts/seat-billing.ts; behavior tests green.
- **Committed in:** 6134b960 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to satisfy the Stripe SDK's typed contract while preserving the no-hardcoded-Price-ID, config-driven intent. No scope creep.

## Issues Encountered
- Pre-existing tsc errors in `tests/unit/whatsapp/handler.test.ts` (Entitlements mocks missing `chatEnabled`) are unrelated to this plan and out of scope — logged to `deferred-items.md`, not fixed.

## User Setup Required
None - no external service configuration required. The seat product is auto-provisioned on first enforced sync; tests mock the SDK entirely.

## Next Phase Readiness
- syncSeatBilling is ready to be wired into membership add/remove actions (139-03 / SEAT wiring): callers can `void syncSeatBilling(companyId)` without risk of breaking the membership op.
- Ships effectively dormant in production: enforcementEnabled defaults false → compute-only, no Stripe writes until calibration flips it on.

## Self-Check: PASSED
- FOUND: lib/billing/seat-billing.ts
- FOUND: lib/billing/stripe-client.ts
- FOUND: tests/unit/billing/seat-billing.test.ts
- FOUND commit: 7a3bc56e
- FOUND commit: 6134b960
- FOUND commit: dc4d42a2

---
*Phase: 139-seat-billing*
*Completed: 2026-06-25*
