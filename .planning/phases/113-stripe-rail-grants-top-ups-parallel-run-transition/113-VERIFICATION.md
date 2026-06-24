---
phase: 113-stripe-rail-grants-top-ups-parallel-run-transition
verified: 2026-06-24T17:00:00Z
status: passed
score: 4/4 must-haves verified
---

# Phase 113: Stripe Rail — Grants, Top-Ups, Parallel-Run Transition Verification Report

**Phase Goal:** Stripe is wired as the payment rail for the credit model — a paid subscription invoice grants the tier's monthly credit allowance to the ledger idempotently; a one-time top-up checkout credits the ledger; low/zero balance offers top-up + upgrade without silently blocking mid-job; the credit model runs in parallel with the existing count-based tiers so no existing account breaks.

**Verified:** 2026-06-24
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | A paid subscription invoice grants the tier's monthly credit allowance to the ledger idempotently (TOPUP-01) | ✓ VERIFIED | `route.ts:185-202` — invoice.paid resolves company+tier by `stripe_subscription_id` (`.eq('stripe_subscription_id', subId)`), reads `cfg.tiers[tierKey]?.monthlyCreditGrant` from `getBillingConfig()`, calls `grantCredits({reason:'grant', idempotencyKey: event.id, refId: invoice.id})`. Grant occurs ONLY in invoice.paid (line 195), not in the subscription checkout path. |
| 2   | A one-time top-up checkout credits the ledger (TOPUP-02) | ✓ VERIFIED | Route `create-topup-session/route.ts` is `mode:'payment'` with inline `price_data` from `getBillingConfig().topUpPacks[packIndex]`, metadata `{type:'credit_topup', companyId, credits: String(pack.credits)}`. Webhook arm `route.ts:118-131` sits BEFORE the `mode !== 'subscription'` early-break (line 134), parses `Number(metadata.credits)`, grants `reason:'topup'` idempotent on `event.id`. |
| 3   | Low/zero balance offers top-up + upgrade without silently blocking mid-job (TOPUP-03) | ✓ VERIFIED | `buildOverageAffordance` returns `{topUpUrl, upgradeUrl}` when `shortfall > 0`, `null` when `0`. The 402 in `generate-estimate/route.ts:88-97` is enriched with `topUpUrl` inside the existing count-based `if (!allowed)` branch. No `credit.allowed` gating path — enforcement off. |
| 4   | The credit model runs in parallel with the count-based tiers; no existing account breaks (MIG-01) | ✓ VERIFIED | `checkQuota(supabase, companyId, 'estimate')` call unchanged (`generate-estimate/route.ts:82`). No `maxEstimatesPerMonth` or `checkQuota` added to the webhook. Credit additions are purely additive (`topUpUrl` field merged via spread). Existing quota + webhook regression suites green. |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `app/api/webhooks/stripe/route.ts` | invoice.paid grant + checkout.session.completed top-up arm | ✓ VERIFIED | Both grant arms present (lines 122, 195); `grantCredits`/`getBillingConfig` imported (lines 7-8); count path byte-unchanged |
| `app/api/billing/create-topup-session/route.ts` | mode:'payment' top-up route, exports POST | ✓ VERIFIED | Exports `POST`; `mode:'payment'`, inline `price_data`, no `price:` id; server-side pack lookup; 401/400 guards present |
| `lib/billing/overage-affordance.ts` | buildOverageAffordance pure helper | ✓ VERIFIED | Pure function, no imports/side effects; `shortfall>0 → {topUpUrl, upgradeUrl}`, else `null` |
| `app/api/generate-estimate/route.ts` | enriched 402, count gate unchanged | ✓ VERIFIED | `topUpUrl` enrichment additive inside existing branch; `checkQuota` unchanged; no credit-based block |
| `tests/unit/webhooks/stripe-credit-grant.test.ts` | TOPUP-01/02 webhook tests + MIG-01 guard | ✓ VERIFIED | Passing |
| `tests/unit/billing/topup-checkout.test.ts` | TOPUP-02 route tests | ✓ VERIFIED | Passing |
| `tests/unit/billing/overage-affordance.test.ts` | TOPUP-03 affordance tests | ✓ VERIFIED | Passing |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `route.ts` invoice.paid | `credit-ledger.ts grantCredits` | resolve company+tier by subId, idempotencyKey=event.id | ✓ WIRED | `route.ts:195`, idempotencyKey=event.id, credits from billing-config |
| `route.ts` checkout.session.completed | `credit-ledger.ts grantCredits` | top-up arm before subscription early-break, reason:'topup' | ✓ WIRED | `route.ts:122`, arm at line 118 < early-break line 134 |
| `create-topup-session/route.ts` | `billing-config.ts topUpPacks` | server-side pack lookup → inline price_data + metadata | ✓ WIRED | `route.ts:42-43`, `cfg.topUpPacks[packIndex]` |
| `generate-estimate/route.ts` 402 | `overage-affordance.ts buildOverageAffordance` | enrich over-quota JSON with topUpUrl | ✓ WIRED | `route.ts:88-94`, spread-merge additive |

### Phase-Critical Correctness

| Check | Status | Evidence |
| ----- | ------ | -------- |
| Grant ONLY in invoice.paid (no double-grant in checkout subscription path) | ✓ PASS | `grantCredits` called at lines 122 (topup) + 195 (invoice.paid). Subscription update path (133-155) does NOT call grantCredits |
| Idempotent on event.id (processed_stripe_events 23505 + grantCredits idempotencyKey) | ✓ PASS | `route.ts:68-71` 23505 short-circuit; `credit-ledger.ts:135-143` second-layer idempotencyKey dedup |
| Free-tier grants 0 (no-op) | ✓ PASS | `credit-ledger.ts:131` `if (!(input.credits > 0)) return` |
| Top-up arm BEFORE mode!=='subscription' early-break | ✓ PASS | awk: credit_topup at line 118, mode!==subscription at line 134 (a<b) |
| credits parsed STRING→number in webhook | ✓ PASS | `route.ts:120` `Number(session.metadata.credits)` |
| metadata.credits is STRING in route | ✓ PASS | `route.ts:69` `credits: String(pack.credits)` |
| Inline price_data, no pre-created Price | ✓ PASS | `route.ts:55-60` price_data only, no `price:` field on line_items |
| No hard mid-job credit block | ✓ PASS | No `credit.allowed` gating in generate-estimate; affordance keys on shortfall not allowed |
| Count path (checkQuota/entitlements) unchanged | ✓ PASS | `checkQuota` call unchanged; no `maxEstimatesPerMonth`/`checkQuota` in webhook |
| No real secrets (placeholders only) | ✓ PASS | Secret scan clean across route + test files |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase-113 unit suites green | `npx vitest run tests/unit/webhooks tests/unit/billing tests/unit/quota` | 23 files / 174 tests passed | ✓ PASS |
| Phase-113 specific files green | `npx vitest run stripe-credit-grant + topup-checkout + overage-affordance` | 3 files / 13 tests passed | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| TOPUP-01 | 113-01, 113-02 | invoice.paid grants tier monthly allowance idempotently | ✓ SATISFIED | webhook invoice.paid grant arm + passing tests |
| TOPUP-02 | 113-01, 113-02, 113-03 | one-time top-up pack credits the ledger via paid webhook | ✓ SATISFIED | create-topup-session route + checkout.session.completed arm + passing tests |
| TOPUP-03 | 113-01, 113-03 | low/zero balance offers top-up+upgrade, no silent mid-job block | ✓ SATISFIED | buildOverageAffordance + enriched 402, no credit block |
| MIG-01 | 113-01, 113-02, 113-03 | credit model parallel to count tiers; no account breaks | ✓ SATISFIED | count gate unchanged; additive-only; quota+webhook regression green |

No orphaned requirements — all four declared IDs map to Phase 113 in REQUIREMENTS.md and are marked Complete.

### Anti-Patterns Found

None. No stubs, TODOs, placeholder returns, or hardcoded empty data in the verified source. Grant arms call the real, already-shipped `grantCredits` (Phase 112) with runtime config from `getBillingConfig` (Phase 111). Enforcement-off (checkCredits always allowed:true) is the milestone's intended pre-calibration state, not a stub.

### Human Verification Required

None for automated goal achievement. End-to-end Stripe webhook delivery and live checkout flows are exercised by deployment/staging, outside unit-test scope, but all programmatically verifiable contracts pass.

### Gaps Summary

No gaps. All 4 observable truths verified, all 7 artifacts pass levels 1-3, all 4 key links WIRED, all 10 phase-critical correctness checks pass, and both behavioral spot-checks are green (174/174 unit tests). The Stripe rail is live: subscriptions grant tier credits on invoice.paid (idempotent, grant-only-once), top-ups credit on checkout.session.completed (arm before the subscription early-break), the over-quota 402 surfaces a top-up path without blocking, and the count-based path is byte-unchanged (MIG-01 parallel-run safety).

---

_Verified: 2026-06-24_
_Verifier: Claude (gsd-verifier)_
