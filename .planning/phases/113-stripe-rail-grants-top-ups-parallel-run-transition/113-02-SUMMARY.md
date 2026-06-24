---
phase: 113-stripe-rail-grants-top-ups-parallel-run-transition
plan: 02
subsystem: billing
tags: [stripe, billing, credits, webhook, grant, topup]

# Dependency graph
requires:
  - phase: 112-credit-ledger-metering
    provides: grantCredits in lib/billing/credit-ledger.ts (the call this plan wires)
  - phase: 111-billing-config
    provides: getBillingConfig — runtime-authoritative tiers[tier].monthlyCreditGrant
  - phase: 113-01
    provides: RED webhook tests (TOPUP-01/02 + MIG-01 guard) this plan flips GREEN
provides:
  - invoice.paid grants tiers[tier].monthlyCreditGrant idempotent on event.id (TOPUP-01)
  - checkout.session.completed credit_topup arm grants pack credits before the subscription early-break (TOPUP-02 webhook side)
  - MIG-01 additive guard satisfied (grantCredits present, no count-path gating)
affects: [113-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Webhook grant arm: resolve company+tier by stripe_subscription_id, grant via grantCredits keyed on event.id (double-layer idempotency: processed_stripe_events 23505 + grantCredits idempotencyKey)"
    - "Pre-guard top-up arm: handle mode:'payment' credit_topup BEFORE the mode!=='subscription' early-break so the one-time path is never skipped"
    - "String-metadata parse: Stripe metadata.credits is a STRING — Number(...) before grant"

key-files:
  created: []
  modified:
    - app/api/webhooks/stripe/route.ts

key-decisions:
  - "Grant subscription credits ONLY in invoice.paid (covers first-subscribe AND renewal) — never in checkout.session.completed, avoiding a double-grant"
  - "refId carries invoice.id (grant) / session.id (topup) for ledger traceability; idempotencyKey is event.id in both arms"
  - "Read the grant amount exclusively from getBillingConfig() (runtime-authoritative) — never hard-coded, never from entitlements.ts; tier resolved from companies.tier (metadata.plan is absent on invoice.paid)"

patterns-established:
  - "Additive webhook billing arm: new grant logic layered onto the existing platform switch without touching the count-based path (MIG-01)"

requirements-completed: [TOPUP-01, TOPUP-02, MIG-01]

# Metrics
duration: 3min
completed: 2026-06-24
---

# Phase 113 Plan 02: Stripe Rail — invoice.paid Grant + Top-Up Arm Summary

**Two additive changes to the platform Stripe webhook wire the Phase-112 credit ledger to Stripe: invoice.paid now grants the per-tier monthly allowance idempotently on event.id, and checkout.session.completed grows a credit_topup arm (before the subscription early-break) that credits one-time top-up packs — flipping the 113-01 RED webhook suite GREEN with zero count-path regression.**

## Performance

- **Duration:** ~3 min
- **Completed:** 2026-06-24T17:37:02Z
- **Tasks:** 2
- **Files modified:** 1 (app/api/webhooks/stripe/route.ts)

## Accomplishments

- **TOPUP-01 (invoice.paid grant):** After the existing tier_renews_at update, resolve `companies.id + tier` by `stripe_subscription_id`, read `tiers[tier].monthlyCreditGrant` from `getBillingConfig()`, and call `grantCredits({ reason:'grant', idempotencyKey: event.id, refId: invoice.id })`. A single hook covers first-subscribe AND renewal. Free tier resolves to 0 (grantCredits no-ops). A redelivered event short-circuits at the `processed_stripe_events` 23505 dedup gate before any grant; the `grantCredits` idempotencyKey is a second layer.
- **TOPUP-02 (webhook top-up arm):** New arm at the TOP of `checkout.session.completed`, BEFORE the `!companyId || session.mode !== 'subscription'` early-break, firing on `metadata.type === 'credit_topup' && payment_status === 'paid'`. Parses the STRING `metadata.credits` via `Number(...)`, grants via `grantCredits({ reason:'topup', idempotencyKey: event.id, refId: session.id })`, then `break`s so a top-up session never falls into the subscription update path.
- **MIG-01:** Additive only — the count-based subscription tier update, subId resolution, and subscriptions.retrieve cast are byte-unchanged; no `maxEstimatesPerMonth` gating added. The static guard now passes (`grantCredits` present).

## Task Commits

Each task was committed atomically (normal hooked commits, gitleaks ran, no `--no-verify`):

1. **Task 1: TOPUP-01 invoice.paid grant** — `2bc88b0` (feat)
2. **Task 2: TOPUP-02 checkout top-up arm** — `0c873d9` (feat)

## Files Created/Modified

- `app/api/webhooks/stripe/route.ts` — added `grantCredits` + `getBillingConfig` imports; invoice.paid grant block; checkout.session.completed credit_topup arm before the subscription early-break.

## Decisions Made

- Followed the plan exactly. Subscriptions grant only via invoice.paid (no checkout-side subscription grant) — a single idempotent hook for first-subscribe and renewal.
- `refId` records the originating Stripe object (invoice.id / session.id) for ledger traceability; `idempotencyKey` is `event.id` in both arms.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. RED → GREEN as designed:
- Pre-edit baseline: `tests/unit/webhooks/stripe-credit-grant.test.ts` = 5 failed / 2 passed.
- After Task 1: invoice.paid TOPUP-01 cases + the MIG-01 guard GREEN.
- After Task 2: full file 7/7 GREEN.

## Verification

- `npx vitest run tests/unit/webhooks/stripe-credit-grant.test.ts` — **7/7 passed** (TOPUP-01 invoice.paid grant/free-zero/redelivery + TOPUP-02 string-parse/before-guard/subscription-no-grant + MIG-01 additive guard).
- `npx vitest run tests/unit/billing/stripe-webhook.test.ts tests/unit/quota.test.ts tests/unit/quota-price-research.test.ts` — **25/25 passed** (webhook regression + MIG-01 count path unchanged).
- `npx tsc --noEmit -p tsconfig.json` — no type errors in the edited route.

## Known Stubs

None. Both grant arms call the real, already-shipped `grantCredits` (Phase 112) with runtime config from `getBillingConfig` (Phase 111). Enforcement stays OFF until Phase 116 calibration by design (grants RECORD; checkCredits never blocks) — that is the milestone's intended pre-calibration state, not a stub.

## User Setup Required

None. Stripe IDs in tests are placeholders (whsec_test, sub_test, evt_*, cs_top). No secrets touched.

## Next Phase Readiness

- 113-03 implements `lib/billing/overage-affordance.ts` `buildOverageAffordance` (TOPUP-03) and the create-topup-session route (TOPUP-02 route side) — turning the remaining 113-01 RED files (`topup-checkout.test.ts`, `overage-affordance.test.ts`) green.
- No blockers. The webhook rail is live: subscriptions credit the ledger on invoice.paid, top-ups on checkout.session.completed.

## Self-Check: PASSED

- `app/api/webhooks/stripe/route.ts` modified and on disk.
- `113-02-SUMMARY.md` created.
- Commits `2bc88b0` and `0c873d9` present in git history.

---
*Phase: 113-stripe-rail-grants-top-ups-parallel-run-transition*
*Completed: 2026-06-24*
