---
phase: 113-stripe-rail-grants-top-ups-parallel-run-transition
plan: 03
subsystem: billing
tags: [stripe, billing, credits, topup, overage, affordance, mig-01]

# Dependency graph
requires:
  - phase: 113-01
    provides: the RED unit tests (topup-checkout, overage-affordance) this plan flips GREEN
  - phase: 111-billing-config
    provides: getBillingConfig().topUpPacks (inline price_data source)
  - phase: 112-credit-ledger-metering
    provides: checkCredits (shortfall for the affordance; enforcement OFF)
provides:
  - one-time top-up checkout route (TOPUP-02 route side) — mode:'payment', inline price_data from topUpPacks
  - buildOverageAffordance pure helper (TOPUP-03 path) — shortfall>0 -> {topUpUrl, upgradeUrl}; 0 -> null
  - enriched generate-estimate 402 response carrying topUpUrl (additive; no new block)
affects: [115-credit-balance-ux]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline Stripe price_data (mode:'payment') driven entirely by billing_config.topUpPacks — no pre-created Stripe Price"
    - "Server-side pack lookup by index — pack credits/price never trusted from the request body (Pitfall 4)"
    - "Additive over-quota enrichment — the count-based 402 gains a topUpUrl field without any credit-based gating (MIG-01)"

key-files:
  created:
    - app/api/billing/create-topup-session/route.ts
    - lib/billing/overage-affordance.ts
  modified:
    - app/api/generate-estimate/route.ts
    - tests/unit/billing/billing-config.test.ts

key-decisions:
  - "buildOverageAffordance keys on shortfall (not allowed) so it surfaces a top-up path even while enforcement is OFF — TOPUP-03 is a PATH, not a block"
  - "The over-quota 402 enrichment lives INSIDE the existing checkQuota !allowed branch — no new code path, no credit.allowed gating (MIG-01 parallel-run safety)"
  - "Extended the Phase-111 BILLCFG-03 dormancy allowlist to cover the two Stripe-rail consumers (webhook grant arm + top-up route) — both are runtime-authoritative billing config readers"

metrics:
  duration: 8min
  completed: 2026-06-24
---

# Phase 113 Plan 03: Stripe Rail — Top-Up Checkout + Overage Affordance Summary

**Two additive features flip the last 113-01 RED tests GREEN: a one-time top-up Checkout route (mode:'payment' with inline price_data sourced 100% from billing_config.topUpPacks) and a pure buildOverageAffordance helper whose top-up path enriches the existing over-quota 402 — informational only, no hard block, count gate untouched (MIG-01).**

## Performance

- **Duration:** ~8 min
- **Tasks:** 2
- **Files:** 2 created, 2 modified

## Accomplishments

- **TOPUP-02 (route side)** — `app/api/billing/create-topup-session/route.ts`: a near-copy of the subscription checkout route with the auth/demoGuard/company-lookup/getStripeClient blocks identical, but `mode:'payment'` + inline `price_data` (`currency:'usd'`, `unit_amount:pack.priceCents`, `product_data.name`) and `metadata:{ type:'credit_topup', companyId, credits:String(pack.credits) }`. The pack is looked up server-side by `packIndex` from `getBillingConfig().topUpPacks` and never trusted from the body; out-of-range packIndex → 400 (no `sessions.create`), unauthenticated → 401. No pre-created Stripe Price. 3/3 topup-checkout tests green.
- **TOPUP-03 (affordance path)** — `lib/billing/overage-affordance.ts` exports the pure `buildOverageAffordance(check)`: `shortfall>0` → `{ topUpUrl:'/settings/billing?topup=1', upgradeUrl:'/settings/billing' }`, `shortfall===0` → `null`. It keys on `shortfall` independent of `allowed`, so an enforcement-off shortfall still yields an affordance. 3/3 overage-affordance tests green.
- **MIG-01 (additive enrichment)** — `app/api/generate-estimate/route.ts`: inside the EXISTING `if (!allowed)` count-based 402 branch, `checkCredits(supabase, companyId)` + `buildOverageAffordance(credit)` merge a `topUpUrl` field onto the SAME response. The `checkQuota(...)` call and its triggering condition are byte-unchanged; no `credit.allowed` gating path was introduced. `checkCredits` is enforcement-off (always `allowed:true`) so it can never cause a new block.

## Task Commits

1. **Task 1: create-topup-session route (TOPUP-02 route side)** — `a09fe12` (feat)
2. **Task 2: buildOverageAffordance + enriched 402 (TOPUP-03 / MIG-01)** — `6f62056` (feat)
3. **Deviation fix: BILLCFG-03 allowlist extension** — `72f35836` (test)

## Files Created/Modified

- `app/api/billing/create-topup-session/route.ts` (created) — one-time top-up Checkout (mode:'payment', inline price_data from topUpPacks)
- `lib/billing/overage-affordance.ts` (created) — pure buildOverageAffordance helper
- `app/api/generate-estimate/route.ts` (modified) — enriched over-quota 402 with topUpUrl (additive)
- `tests/unit/billing/billing-config.test.ts` (modified) — BILLCFG-03 dormancy allowlist extended for the Stripe-rail config consumers

## Decisions Made

- The affordance keys on `shortfall`, not `allowed`, proving TOPUP-03 is a path not a block — exactly what the 113-01 RED enforcement-off test asserts.
- The 402 enrichment is spread-merged (`...(affordance ? { topUpUrl } : {})`) into the existing response object rather than added as a new branch, satisfying the MIG-01 additive-only contract.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended the Phase-111 BILLCFG-03 dormancy guard allowlist**
- **Found during:** final full-suite run after Task 2
- **Issue:** `tests/unit/billing/billing-config.test.ts` asserts that ONLY the reader module + `credit-ledger.ts` reference the `getBillingConfig` symbol. Phase 113's two legitimate Stripe-rail consumers — the webhook grant arm (`app/api/webhooks/stripe/route.ts`, added in 113-02) and the new `create-topup-session` route (113-03) — both read config (`tiers` grants / `topUpPacks`), so the guard flagged them as offenders. (The webhook consumer from 113-02 was already in the tree; this run surfaced it because the full guard was exercised here.)
- **Fix:** Added both paths to the test's `ALLOWLIST` set with a comment documenting them as runtime-authoritative billing-config consumers. The guard still fails on any OTHER consumer.
- **Rationale:** This is the same pre-declared pattern the planner anticipated — 112-03 made the identical Rule-3 extension to allowlist `credit-ledger.ts` as the first consumer. Intent preserved: dormancy is still enforced everywhere except the sanctioned billing surfaces.
- **Files modified:** tests/unit/billing/billing-config.test.ts
- **Commit:** 72f35836

## Verification

- `npx vitest run tests/unit/billing/topup-checkout.test.ts tests/unit/billing/overage-affordance.test.ts` → 6/6 GREEN (was the 113-01 RED set).
- `npx vitest run tests/unit/quota.test.ts tests/unit/quota-price-research.test.ts` → 17/17 GREEN (MIG-01: count gate unchanged).
- Grep guards: route has `mode: 'payment'`, `price_data`, `type: 'credit_topup'`, `String(pack.credits)`, `topUpPacks`, and NO `price:` Price id on line_items; the generate-estimate route still calls `checkQuota(supabase, companyId, 'estimate')` and contains NO `credit.allowed` gating.
- `npx tsc --noEmit -p tsconfig.json` → no errors in the three touched source files.
- **FULL `npx vitest run` → 289 files passed | 3 skipped, 2054 passed | 2 skipped | 33 todo** (one transient failure — the BILLCFG-03 guard — fixed in commit 72f35836; re-run fully green).

## Known Stubs

None. Both features are wired to real config + real routes. The full credit-balance widget that will reuse `buildOverageAffordance` is intentionally scoped to Phase 115 (per PROJECT.md).

## Self-Check: PASSED

- `app/api/billing/create-topup-session/route.ts` — FOUND
- `lib/billing/overage-affordance.ts` — FOUND
- Commits `a09fe12`, `6f62056`, `72f35836` — present in git history.

---
*Phase: 113-stripe-rail-grants-top-ups-parallel-run-transition*
*Completed: 2026-06-24*
