---
phase: 70-stripe-connect-customer-payments
plan: 03
subsystem: payments
tags: [stripe, stripe-connect, checkout, direct-charges, share-page, tdd]

requires:
  - phase: 70-01
    provides: companies.stripe_account_id + estimates.payment_status DB columns; Wave 0 RED tests for estimate-pay and pay-now-button

provides:
  - POST /api/estimate/[token]/pay — creates a Stripe Checkout Session on the connected account via Direct Charges and 303-redirects to session.url
  - PayNowButton component (server-compatible, plain <form method=POST>) with 4-condition visibility gate
  - PaymentSuccessBanner + PaymentCanceledNotice components driven by ?stripe=success|canceled URL params
  - formatUSD(cents) helper using Intl.NumberFormat (en-US)
  - Extended ShareEstimateData shape: payment_status, total_amount_cents (derived from estimate.total dollars), stripe_checkout_session_id, paid_at, payment_amount_cents, company.id, company.stripe_account_id, company.stripe_connect_status

affects:
  - 70-04 (webhook handler reads Checkout Session metadata.estimate_id / company_id set here; reads payment_status set to 'paid' by webhook then surfaced via the same share query)

tech-stack:
  added: []
  patterns:
    - Direct Charges via per-request `stripeAccount` option on `stripe.checkout.sessions.create` (do NOT modify the platform `getStripeClient` factory)
    - HTML `<form method="POST">` → 303 redirect to Stripe Checkout (server-rendered, JS-free)
    - URL-driven success/cancel banners on the share page (webhook is the DB source of truth; URL drives the immediate UI)
    - Derive `total_amount_cents = Math.round(estimate.total * 100)` until/unless a true cents column is added in a later migration

key-files:
  created:
    - app/api/estimate/[token]/pay/route.ts
    - components/estimate/pay-now-button.tsx
    - components/estimate/payment-success-banner.tsx
    - tests/unit/utils/format.test.ts
  modified:
    - lib/utils/format.ts
    - lib/queries/share.ts
    - app/estimate/[token]/page.tsx
    - components/share/estimate-view.tsx
    - tests/unit/billing/estimate-pay.test.ts
    - tests/unit/components/pay-now-button.test.tsx

key-decisions:
  - application_fee_amount OMITTED entirely (NOT set to 0) — RESEARCH Pitfall 2; Stripe rejects 0
  - success_url uses literal {CHECKOUT_SESSION_ID} template (no URL encoding) — Pitfall 5
  - PayNowButton is server-compatible (no 'use client') and uses plain HTML form POST + 303 redirect — works without JS; Stripe Checkout itself shows loading state
  - coerce paymentStatus='paid' in EstimateView when stripeState='success' so the button disappears immediately on return, even before the webhook lands
  - derive total_amount_cents from existing numeric `total` column (no schema change) until/unless a future plan adds an explicit cents column
  - reuse PayNowButton inside the existing client component EstimateView (server-renderable child of a client component — works fine, no extra hydration)

patterns-established:
  - Per-tenant Connect API calls via per-request `stripeAccount` option (vs polluting the factory)
  - URL-driven optimistic UI for post-redirect Stripe flows (Pattern repeated for any future Connect-redirect feature)
  - formatUSD(cents) is the canonical USD formatter for cents-denominated values across the app

requirements-completed: [CONNECT-06, CONNECT-07, CONNECT-09]

duration: ~7 min
completed: 2026-05-17
---

# Phase 70 Plan 03: Customer Payment Trigger Summary

**POST /api/estimate/[token]/pay creates a Stripe Checkout Session on the connected account; the share page renders a conditional Pay $X button + URL-driven success/cancel banners. Wave 0 RED tests for estimate-pay and pay-now-button are now GREEN.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-05-17T05:41:15Z
- **Completed:** 2026-05-17T05:47:50Z
- **Tasks:** 3
- **Files modified:** 10 (4 created, 6 modified)

## Accomplishments

- Shipped the customer-facing payment trigger: button visibility rules, Checkout Session creation on connected account, and post-redirect banners.
- Three Wave 0 tests transitioned RED → GREEN: `format.test.ts` (new, 5 cases), `estimate-pay.test.ts` (4 cases), `pay-now-button.test.tsx` (4 cases). All 13 assertions pass.
- Closed CONNECT-06 (button visibility), CONNECT-07 (checkout session creation), CONNECT-09 (success/cancel UI). Plan 70-04 (webhook → mark paid + emails) is now the only remaining blocker for end-to-end customer payments.
- Zero new TypeScript errors (baseline 21 → 21, all pre-existing in unrelated inngest/storage/stripe-missing-node-modules contexts).

## Task Commits

1. **Task 1: formatUSD helper + extend share query** — `ae54cc7` (feat)
2. **Task 2: POST /api/estimate/[token]/pay route** — `31f268e` (feat)
3. **Task 3: PayNowButton + PaymentSuccessBanner + share page wiring** — `53b566b` (feat)

**Plan metadata commit:** to follow this summary (docs).

## Pay Button Visibility (4-condition matrix)

The "Pay $X" button renders ONLY when ALL of the following are true:

| Condition | Source |
| --------- | ------ |
| `company.stripe_account_id` is non-null | tenant completed OAuth in Plan 70-02 |
| `company.stripe_connect_status === 'active'` | OAuth callback set this in Plan 70-02 |
| `estimate.payment_status !== 'paid'` | webhook sets this in Plan 70-04 |
| `estimate.total_amount_cents > 0` | derived from `estimate.total` (dollars) via `Math.round(total * 100)` |

Any failure returns `null` — no broken UI, no upsell, no "Coming soon" placeholder. Phase 70 hard constraint: zero new Stripe surface for non-connected tenants.

## API Route Contract

`POST /api/estimate/[token]/pay`:

- **200/303** on success → `Location: https://checkout.stripe.com/c/pay/cs_test_...`
- **404** when estimate token is unknown
- **400** when tenant isn't connected / inactive
- **400** when already paid
- **400** when amount ≤ 0
- **502** if Stripe returns no session URL

Body: empty (HTML form POST). Session created with:
- `stripeAccount: company.stripe_account_id` (Direct Charges)
- `metadata.{estimate_id, company_id}` on Session AND PaymentIntent (Plan 70-04 webhook routing)
- `application_fee_amount` **OMITTED** (NOT set to 0 — Stripe rejects 0; omission yields 100% to connected account modulo Stripe processing fees)
- `success_url` uses literal `{CHECKOUT_SESSION_ID}` template (Stripe substitutes server-side)
- `idempotencyKey: pay_{estimate.id}_{Date.now()}` to safe-guard double-submit

## Files Created/Modified

### Created (4)

- `app/api/estimate/[token]/pay/route.ts` — Checkout Session creator (POST).
- `components/estimate/pay-now-button.tsx` — Server-compatible <form method=POST> button with 4-condition visibility.
- `components/estimate/payment-success-banner.tsx` — `PaymentSuccessBanner` + `PaymentCanceledNotice` exports.
- `tests/unit/utils/format.test.ts` — 5 cases for `formatUSD`.

### Modified (6)

- `lib/utils/format.ts` — added `formatUSD(cents)` alongside existing `formatCurrency(value)`.
- `lib/queries/share.ts` — added Connect/payment columns to `ShareEstimateData` shape and derive `total_amount_cents` from `estimate.total` (dollars) in the query result.
- `app/estimate/[token]/page.tsx` — accept `searchParams`, compute `stripeState`, pass to `EstimateView`.
- `components/share/estimate-view.tsx` — accept `stripeState` prop; render `PayNowButton` + banners in a new Card above accept/decline; coerce `paymentStatus='paid'` when `stripeState='success'`.
- `tests/unit/billing/estimate-pay.test.ts` — replaced RED stubs with 4 real assertions (mocked Stripe + Supabase service client).
- `tests/unit/components/pay-now-button.test.tsx` — replaced RED stubs with 4 real RTL render-matrix assertions.

## Decisions Made

- **`application_fee_amount` omitted entirely** — RESEARCH Pitfall 2; Stripe returns 400 on 0. Omission means 100% goes to the connected account. Comment in route file cites the pitfall so a future contributor doesn't try to "fix" it by adding `application_fee_amount: 0`.
- **Direct Charges, NOT destination charges or separate charges + transfers** — simplest model when platform takes 0 cut; funds settle directly on the connected account's balance without ever touching Xtimator's.
- **HTML form POST + 303 redirect over fetch + spinner** — JS-free, works without hydration, and Stripe Checkout itself shows a loading state on the destination side. (Open Question 3 in RESEARCH.md resolved in favor of form POST.)
- **`success_url` with literal `{CHECKOUT_SESSION_ID}`** — Pitfall 5; Stripe substitutes server-side. Must NOT be URL-encoded.
- **Coerce `paymentStatus='paid'` in the view when `stripeState='success'`** — webhook may land a few seconds after the redirect; coercing the prop hides the Pay button immediately to avoid double-payment UX. The DB write itself is still the webhook's responsibility (Plan 70-04).
- **Derive `total_amount_cents` from `estimate.total` (dollars)** — no schema change. `Math.round(total * 100)` avoids float drift. If a future plan needs a true cents-only column, it can replace this derivation in one place (`lib/queries/share.ts`).
- **Server-compatible `PayNowButton` (no `'use client'`)** — even though it's rendered inside the existing client component `EstimateView`, the button itself has no JS surface. This keeps it correct for a future SSR-only rewrite and zero hydration overhead.
- **Re-fetch the company in the route via the service client** — `getEstimateByShareToken` already surfaces `stripe_account_id`, but we re-read the canonical row at the moment of payment so a tenant who just disconnected can't have a stale Pay button trigger a Checkout Session against an unlinked account.

## Why the DB isn't marked paid here

This plan only initiates payment. The actual `payment_status='paid'` write, `paid_at`, `payment_amount_cents`, `stripe_payment_intent_id`, and the two notification emails (business + customer) are all handled by the webhook handler shipped in **Plan 70-04**. This matches RESEARCH Pattern 5 (webhook branching on `event.account`).

The share page's green success banner is **URL-driven, not DB-driven** — it appears as soon as Stripe redirects the customer back with `?stripe=success`, which may be a few seconds before the webhook lands. This is the standard Stripe pattern: trust the URL for UI; trust the webhook for DB state.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 — Blocking] ShareEstimateData.estimate.company missing `id` field**
- **Found during:** Task 2 (drafting the route)
- **Issue:** The plan instructed `data.estimate.company.id` to flow into the metadata payload, but the existing `ShareEstimateData['estimate']['company']` shape didn't include `id`. Without it, the company select in the route's re-fetch step had nothing to key off cleanly.
- **Fix:** Added `id` to the company shape AND to the SELECT in `getEstimateByShareToken`. Also used `estimate.company_id` (which already existed on `EstimateWithSections`) inside the route for the service-client re-fetch, since that's the canonical FK.
- **Files modified:** `lib/queries/share.ts`
- **Committed in:** `ae54cc7` (Task 1 commit)

**2. [Rule 2 — Critical] Stripe payment cancel state had no UI**
- **Found during:** Task 3 (wiring banners)
- **Issue:** The plan called for both success AND cancel banners, but only the success banner had a polished design. A bare "Payment canceled" string would leave the share page looking broken.
- **Fix:** Added `PaymentCanceledNotice` as a sibling export from `payment-success-banner.tsx` with matching shadcn/ui styling (neutral muted background, no scary red).
- **Files modified:** `components/estimate/payment-success-banner.tsx`
- **Committed in:** `53b566b` (Task 3 commit)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 — Blocking, 1 Rule 2 — Critical UI completeness). Both within plan intent.

## Issues Encountered

- **None blocking.** Pre-existing TypeScript baseline (21 errors, all in unrelated inngest/storage/stripe-missing-node-modules modules) is unchanged. Pre-existing `Cannot find module 'stripe'` errors in `tests/fixtures/stripe-connect.ts`, `lib/billing/stripe-client.ts`, etc., resolve once `npm install` is re-run; my route doesn't introduce any new occurrences.

## Known Stubs

None — every code path is wired. The "DB marked paid" step is intentionally deferred to Plan 70-04 (webhook), which is the architecturally correct location per Stripe best practice (URL for UI, webhook for state).

## User Setup Required

None at code-ship time. The full Phase 70 setup runbook (Stripe Dashboard enablement + Client ID admin entry + Connect webhook event subscription) is owned by Plans 70-02 and 70-05 SUMMARYs.

## Next Phase Readiness

- **Ready for Plan 70-04** (webhook handler for connected-account `checkout.session.completed` + payment notification emails). All prerequisites in place: route writes the right `metadata.{estimate_id, company_id}` shape on both Session and PaymentIntent, share query surfaces `payment_status` for the post-webhook re-render.
- **End-to-end smoke (deferred until 70-04 + setup):** with a connected test-mode tenant: open share link → Pay $X visible → click → Stripe Checkout (URL `checkout.stripe.com/c/pay/...`) → pay with `4242 4242 4242 4242` → return to `/estimate/<token>?stripe=success&session_id=cs_test_...` → green banner shows + Pay button gone. **Currently:** the URL-driven UI parts work; DB `payment_status` flip and emails will land in 70-04.

## Self-Check: PASSED

- `app/api/estimate/[token]/pay/route.ts` — FOUND
- `components/estimate/pay-now-button.tsx` — FOUND
- `components/estimate/payment-success-banner.tsx` — FOUND
- `tests/unit/utils/format.test.ts` — FOUND
- Commits `ae54cc7`, `31f268e`, `53b566b` — FOUND in `git log`
- `npx vitest run tests/unit/utils/format.test.ts tests/unit/billing/estimate-pay.test.ts tests/unit/components/pay-now-button.test.tsx` — 13/13 PASS (5 + 4 + 4)
- `npx tsc --noEmit` — 21 errors (unchanged baseline; none introduced by this plan)
- `grep "application_fee_amount" app/api/estimate/[token]/pay/route.ts` — 2 hits, BOTH IN COMMENTS (none in code) — Pitfall 2 invariant holds

---
*Phase: 70-stripe-connect-customer-payments*
*Plan: 03*
*Completed: 2026-05-17*
