---
phase: 58-stripe-integration
plan: 02
subsystem: payments
tags: [stripe, webhooks, billing, idempotency, typescript, vitest]

# Dependency graph
requires:
  - phase: 58-01
    provides: getStripeClient factory, checkout-session route, portal-session route, Wave 0 test stubs, processed_stripe_events migration
  - phase: 55-schema-tier-definitions
    provides: tier columns on companies (stripe_customer_id, stripe_subscription_id, tier, tier_renews_at, tier_cancelled_at)
provides:
  - POST /api/webhooks/stripe — raw body verification, idempotency, four lifecycle event handlers
  - 14 passing tests across checkout, portal, and webhook unit test suites
affects:
  - 59-billing-ui (reads tier + subscription columns updated by this handler)
  - Phase 57 enforcement layer (reads tier set here)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Stripe webhook raw body pattern: request.text() before constructEvent — mirrors WhatsApp webhook"
    - "Idempotency via processed_stripe_events insert + 23505 unique_violation check"
    - "vitest mock of supabase.auth.getClaims() via createClient mock with auth.getClaims on returned object"

key-files:
  created:
    - app/api/webhooks/stripe/route.ts
  modified:
    - tests/unit/billing/checkout.test.ts
    - tests/unit/billing/portal.test.ts
    - tests/unit/billing/stripe-webhook.test.ts

key-decisions:
  - "invoice.paid subscription ID extracted via legacy field cast + parent.subscription_details fallback — Stripe API 2026-04-22 moved subscription to nested parent structure"
  - "subscriptions.retrieve cast through unknown for current_period_end — Stripe TypeScript types for API 2026-04-22 don't yet expose this field but runtime object carries it"
  - "checkout/portal tests mock supabase.auth.getClaims() via createClient mock (not @/lib/auth) — routes use supabase client auth directly"
  - "invoice.payment_failed makes zero DB writes — Stripe dunning handles retries; only customer.subscription.deleted triggers tier downgrade"

requirements-completed: [STRIPE-02, STRIPE-04]

# Metrics
duration: 25min
completed: 2026-05-14
---

# Phase 58 Plan 02: Stripe Webhook Handler Summary

**Stripe webhook handler with raw body verification, idempotency via processed_stripe_events, four subscription lifecycle event handlers, and 14 billing unit tests converted from Wave 0 stubs to GREEN**

## Performance

- **Duration:** 25 min
- **Started:** 2026-05-14T01:43:29Z
- **Completed:** 2026-05-14T02:08:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Implemented `POST /api/webhooks/stripe` with raw body first, constructEvent signature verification (400 on failure), idempotency via `processed_stripe_events` insert (23505 = already processed, return 200), and all four subscription lifecycle event handlers
- Converted 3 Wave 0 stub test files to 14 passing GREEN tests covering checkout session creation, portal session creation, and all webhook event/idempotency scenarios
- `invoice.payment_failed` confirmed to make zero DB writes; `customer.subscription.deleted` sets tier=free and tier_cancelled_at

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement POST /api/webhooks/stripe handler** - `79dd936` (feat)
2. **Task 2: Convert Wave 0 stubs to GREEN passing tests** - `31434a0` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `app/api/webhooks/stripe/route.ts` - Stripe webhook handler (STRIPE-02, STRIPE-04)
- `tests/unit/billing/checkout.test.ts` - 3 tests for create-checkout-session route
- `tests/unit/billing/portal.test.ts` - 3 tests for create-portal-session route
- `tests/unit/billing/stripe-webhook.test.ts` - 8 tests for webhook event handling + idempotency

## Decisions Made
- **Subscription field extraction (invoice.paid):** Stripe API version `2026-04-22.dahlia` moved `invoice.subscription` to `invoice.parent.subscription_details.subscription`. Used a type cast with `& { subscription?: string | null }` combined with parent fallback to handle both legacy and new structure safely.
- **current_period_end type cast:** Stripe TypeScript types for this API version don't expose `current_period_end` at top level of `Subscription`, but the runtime object carries it. Cast via `unknown` to avoid type error while keeping correct runtime behavior.
- **Test mock pattern for auth:** The checkout and portal routes use `supabase.auth.getClaims()` directly (not a `@/lib/auth` module). Tests mock `createClient` and return a supabase mock with `auth.getClaims()` — not the `getClaims` import pattern shown in the plan's pseudocode.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Adapted test mock pattern for actual route auth implementation**
- **Found during:** Task 2 (Convert Wave 0 stubs to GREEN passing tests)
- **Issue:** Plan's test pseudocode mocked `@/lib/auth` → `getClaims` but the actual routes use `supabase.auth.getClaims()` directly (no separate lib/auth module with getClaims export exists)
- **Fix:** Test mocks `createClient` and returns a supabase mock with `auth: { getClaims: vi.fn() }` — matching the actual route implementation
- **Files modified:** tests/unit/billing/checkout.test.ts, tests/unit/billing/portal.test.ts
- **Verification:** All 14 billing tests passing GREEN
- **Committed in:** 31434a0 (Task 2 commit)

**2. [Rule 1 - Bug] Stripe API type fixes for invoice.paid subscription field**
- **Found during:** Task 1 (Implement POST /api/webhooks/stripe handler)
- **Issue:** TypeScript error — `invoice.subscription` doesn't exist at top level in Stripe API 2026-04-22; `subscriptions.retrieve()` returns `Response<Subscription>` not `Subscription`; `current_period_end` not in Subscription interface
- **Fix:** Cast invoice with `& { subscription?: string | null }`, add parent fallback, cast subscription retrieve result through `unknown` to access `current_period_end`
- **Files modified:** app/api/webhooks/stripe/route.ts
- **Verification:** `npx tsc --noEmit` shows zero errors in webhook route
- **Committed in:** 79dd936 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - bugs)
**Impact on plan:** Both fixes necessary for TypeScript correctness and test accuracy. No scope creep.

## Issues Encountered
- Pre-existing TypeScript errors in tests/unit/api/analyze-photos-quota.test.ts, generate-estimate-quota.test.ts, and whatsapp/pdf-delivery.test.ts — these are from Phase 57 enforcement layer work, out of scope for this plan
- 42 pre-existing test failures in full suite (down from 56 before this plan's changes) — billing tests are all GREEN; pre-existing failures are in Phase 57 quota/enforcement tests

## User Setup Required
None — no external service configuration required beyond what was set up in Phase 58-01 (STRIPE_WEBHOOK_SECRET env var, stripe IntegrationProvider entry).

## Next Phase Readiness
- Stripe billing write path complete — webhook handler populates companies.tier, stripe_customer_id, stripe_subscription_id, tier_renews_at, tier_cancelled_at in response to real Stripe events
- Phase 59 (billing UI) can read these tier columns with confidence they're populated correctly
- STRIPE_WEBHOOK_SECRET must be configured in production Stripe dashboard + environment before webhook delivery works

---
*Phase: 58-stripe-integration*
*Completed: 2026-05-14*
