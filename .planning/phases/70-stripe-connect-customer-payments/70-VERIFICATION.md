---
phase: 70-stripe-connect-customer-payments
verified: 2026-05-17T02:18:00Z
status: passed
score: 7/7 success criteria verified
re_verification: false
---

# Phase 70: Stripe Connect — Optional Customer Payments Verification Report

**Phase Goal:** Any service business that connects their Stripe account once via OAuth in Settings → Payments gets a "Pay Now" button on every shared estimate. Customer pays the full estimate total via Stripe Checkout hosted on the business's connected account; webhook marks the estimate paid, emails business owner, emails customer branded receipt, shows banner on share page. The integration is 100% optional — companies without Stripe connected see zero Stripe UI anywhere and all existing share/PDF/email flows work unchanged. Application fee is 0% (provider keeps 100%; Xtimator monetizes via SaaS plans only).

**Verified:** 2026-05-17T02:18:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Owner connects Stripe via OAuth → Settings → Payments shows "Connected ✓ as [display name]" + Disconnect; companies.stripe_account_id populated, stripe_connect_status='active' | VERIFIED | OAuth round-trip: `app/api/stripe/connect/initiate/route.ts` (mintOAuthState + buildAuthorizeUrl), `callback/route.ts` (exchangeCode + accounts.retrieve + companies.update with stripe_account_id/stripe_connect_status='active'/email/display_name), `app/(app)/settings/payments/page.tsx` and `components/settings/stripe-connect-card.tsx` render three states correctly |
| 2 | Share page shows "Pay $X" button when company.stripe_account_id present AND payment_status != 'paid'; clicking creates Checkout Session on connected account via stripeAccount option | VERIFIED | `components/estimate/pay-now-button.tsx` lines 28-35 check ALL 4 conditions (stripeAccountId != null, stripeConnectStatus === 'active', paymentStatus !== 'paid', totalAmountCents > 0). `app/api/estimate/[token]/pay/route.ts` lines 102-105 pass `{ stripeAccount: company.stripe_account_id, idempotencyKey }` as the second arg to `stripe.checkout.sessions.create()`. Returns 303 to session.url |
| 3 | When no stripe_account_id OR paid, no Pay Now button shown; existing share UI unchanged — confirmed via two snapshot tests | VERIFIED | `tests/e2e/estimate-share-payment.spec.ts` defines 4 scenarios covering BOTH branches (without-Stripe + with-Stripe + ?stripe=success + ?stripe=canceled). PayNowButton returns null on any precondition failure |
| 4 | checkout.session.completed webhook (event.account present) matches company by stripe_account_id, finds estimate by metadata.estimate_id, updates 5 columns (payment_status='paid', stripe_checkout_session_id, stripe_payment_intent_id, paid_at, payment_amount_cents) | VERIFIED | `app/api/webhooks/stripe/route.ts` lines 67-71 branch on `event.account`. `lib/billing/connect-webhook.ts` lines 68-79 perform the 5-column update with all required fields. Idempotency preserved by existing `processed_stripe_events` ON CONFLICT |
| 5 | After payment: owner email "You received $X", customer email "Payment confirmation — $X to [business]", redirect to ?stripe=success shows green banner + Pay button gone | VERIFIED | `lib/email/payment-emails.ts` exports `sendPaymentReceivedEmail` (subject `You received ${amount} — ${projectName}`) and `sendPaymentReceiptEmail` (subject `Payment confirmation — ${amount} to ${businessName}`). Both invoked via `Promise.allSettled` in `connect-webhook.ts:140-143`. `app/estimate/[token]/page.tsx:52-57` reads searchParams.stripe; `estimate-view.tsx:399-411` renders PaymentSuccessBanner and coerces paymentStatus='paid' when stripeState==='success' so button vanishes immediately |
| 6 | Disconnect clears stripe_account_id, sets stripe_connect_status='disconnected'; existing paid estimates retain paid status; new shared estimates lose Pay button | VERIFIED | `app/api/stripe/connect/disconnect/route.ts` calls best-effort deauthorize then updates companies with stripe_account_id=null, stripe_connect_status='disconnected'. Email/display_name preserved as audit trail. estimates.payment_status untouched by this flow — paid estimates retain their state |
| 7 | Platform owner sets stripe_connect_client_id via /admin/integrations; when unset, Settings → Payments shows friendly message and never attempts OAuth redirect that would 404 | VERIFIED | `lib/platform-config.ts:46` adds `'stripe_connect_client_id'` to IntegrationProvider union. `app/admin/integrations/page.tsx:45` registers the provider card. `payments/page.tsx` sets `state = { kind: 'not_configured' }` when getIntegrationKey returns null; `initiate/route.ts:48-50` redirects to `?error=platform_not_configured` instead of attempting OAuth |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/20260517000001_phase70_stripe_connect_columns.sql` | DB columns for Connect on companies + estimates | VERIFIED | Contains all 5 companies columns + all 5 estimates columns with CHECK constraints + 2 partial indexes |
| `lib/billing/connect-oauth.ts` | mintOAuthState/verifyOAuthState/buildAuthorizeUrl/exchangeCode/deauthorize | VERIFIED | 6554 bytes; all 5 exports present (HMAC sign/verify + OAuth helpers) |
| `lib/billing/connect-webhook.ts` | handleConnectEvent dispatcher | VERIFIED | Exports handleConnectEvent; branches on checkout.session.completed, account.application.deauthorized, account.updated |
| `lib/email/payment-emails.ts` | sendPaymentReceivedEmail + sendPaymentReceiptEmail | VERIFIED | Both functions try/catch errors so webhook never 5xx on email failure |
| `lib/utils/format.ts` | formatUSD(cents) | VERIFIED | Uses Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }) |
| `app/api/stripe/connect/initiate/route.ts` | GET — mint state cookie + redirect to Stripe | VERIFIED | All required logic present |
| `app/api/stripe/connect/callback/route.ts` | GET — verify state + idempotent code exchange + persist | VERIFIED | Idempotency confirmed at lines 56-60 (short-circuit when stripe_account_id already set) |
| `app/api/stripe/connect/disconnect/route.ts` | POST — clear stripe_account_id | VERIFIED | Best-effort deauthorize + DB clear |
| `app/api/estimate/[token]/pay/route.ts` | POST — Checkout Session on connected account | VERIFIED | application_fee_amount NOT SET (only in comments at lines 17, 97); stripeAccount option passed at line 103; 303 redirect at line 116 |
| `components/estimate/pay-now-button.tsx` | Conditional Pay button | VERIFIED | 4-condition gate at lines 29-33 |
| `components/estimate/payment-success-banner.tsx` | Green banner + cancel notice | VERIFIED | Exports both PaymentSuccessBanner and PaymentCanceledNotice |
| `components/settings/stripe-connect-card.tsx` | 3-state card | VERIFIED | Renders not_configured / not_connected / connected branches |
| `app/(app)/settings/payments/page.tsx` | 3-state server component | VERIFIED | Computes state from getIntegrationKey + company columns |
| `tests/e2e/estimate-share-payment.spec.ts` | Snapshot tests both branches | VERIFIED | 4 scenarios; env-gated skip when seeder credentials absent |
| `docs/STRIPE-CONNECT-OWNER-SETUP.md` | Owner setup runbook | VERIFIED | 10111 bytes; 8 sections |
| All 6 Wave-0 unit test files + 1 fixture | Tests passing | VERIFIED | 22/22 tests pass |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `app/(app)/settings/page.tsx` | `/settings/payments` | href Link card | WIRED | Line 62 |
| `app/api/stripe/connect/initiate/route.ts` | `lib/billing/connect-oauth.ts mintOAuthState` | function call | WIRED | imports + calls mintOAuthState before redirect |
| `app/api/stripe/connect/callback/route.ts` | `companies.stripe_account_id` | supabase update | WIRED | Lines 70-79 update 5 columns |
| `app/api/estimate/[token]/pay/route.ts` | `stripe.checkout.sessions.create` | second-arg stripeAccount | WIRED | Line 103: `stripeAccount: company.stripe_account_id` |
| `components/estimate/pay-now-button.tsx` | `/api/estimate/[token]/pay` | HTML form POST | WIRED | `<form action method="POST">` at lines 38-41 |
| `app/estimate/[token]/page.tsx` | `pay-now-button.tsx` | conditional render via EstimateView | WIRED | estimate-view.tsx:401 renders PayNowButton |
| `app/api/webhooks/stripe/route.ts` | `handleConnectEvent` | event.account branching | WIRED | Lines 67-71 branch correctly |
| `lib/billing/connect-webhook.ts` | `estimates.payment_status='paid'` | supabase update | WIRED | Lines 68-79 |
| `lib/billing/connect-webhook.ts` | `lib/email/payment-emails.ts` | Promise.allSettled | WIRED | Lines 140-143 |
| `lib/platform-config.ts` | IntegrationProvider union includes `stripe_connect_client_id` | type addition | WIRED | Line 46 |
| `app/admin/integrations/page.tsx` | PROVIDERS array Connect card | card entry | WIRED | Line 45 `id: 'stripe_connect_client_id'` |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `PayNowButton` | totalAmountCents, stripeAccountId, paymentStatus | `lib/queries/share.ts getEstimateByShareToken` (companies select includes stripe_account_id/stripe_connect_status; estimates select includes payment_status/total_amount_cents) → estimate-view passes through | YES (real DB query, not static) | FLOWING |
| `StripeConnectCard` | ConnectState | `payments/page.tsx` derives from `getIntegrationKey('stripe_connect_client_id')` + companies row (stripe_account_id, stripe_connect_status, stripe_account_email, stripe_account_display_name) | YES (real Supabase query) | FLOWING |
| `PaymentSuccessBanner` | stripeState | `app/estimate/[token]/page.tsx:52-57` reads searchParams.stripe | YES (URL query param drives render) | FLOWING |
| Dashboard "Paid" badge | project.payment_status, project.paid_at | `lib/queries/dashboard.ts:83` joins estimates and exposes per-project payment_status + paid_at | YES (real DB join with is_current filter) | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase 70 unit tests pass | `npx vitest run tests/unit/billing/connect-*.test.ts tests/unit/billing/estimate-pay.test.ts tests/unit/webhooks/connect-events.test.ts tests/unit/components/pay-now-button.test.tsx tests/unit/settings/payments-page.test.tsx` | 6 files, 22/22 tests passed | PASS |
| application_fee_amount NOT set in pay route | grep `application_fee_amount` `app/api/estimate/[token]/pay/route.ts` | 2 matches; both are comments (lines 17, 97) | PASS |
| Webhook branches on event.account | grep `event.account` `app/api/webhooks/stripe/route.ts` | Line 68 conditional dispatch confirmed | PASS |
| Callback idempotency | Read `callback/route.ts` lines 56-60 | Short-circuits with `?connected=1` if company.stripe_account_id already set, without re-exchanging code | PASS |
| Snapshot test covers both branches | Read `tests/e2e/estimate-share-payment.spec.ts` | 4 scenarios: without-Stripe baseline + with-Stripe + ?stripe=success + ?stripe=canceled | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CONNECT-01 | 70-01 | DB migration: 5 columns on companies + 5 on estimates; types regenerated | SATISFIED | `supabase/migrations/20260517000001_phase70_stripe_connect_columns.sql` + 6 occurrences of new columns in `types/database.types.ts` |
| CONNECT-02 | 70-01 | stripe_connect_client_id integration key settable via /admin/integrations; null → friendly state, no broken OAuth | SATISFIED | platform-config.ts:46 union; admin/integrations/page.tsx:45 card; payments/page.tsx not_configured branch; initiate/route.ts redirect on missing client_id |
| CONNECT-03 | 70-02 | /settings/payments three-state UI; linked from main Settings | SATISFIED | payments/page.tsx + stripe-connect-card.tsx + settings/page.tsx:62 link |
| CONNECT-04 | 70-02 | OAuth flow end-to-end: initiate (CSRF state) → Stripe → callback (verify state, exchange code, persist) | SATISFIED | initiate/route.ts (mintOAuthState + cookie + redirect to authorize URL); callback/route.ts (verifyOAuthState + exchangeCode + accounts.retrieve + companies.update) |
| CONNECT-05 | 70-02 | Disconnect clears stripe_account_id, sets status='disconnected', calls deauthorize; paid estimates retain status | SATISFIED | disconnect/route.ts — deauthorize + DB update; estimates.payment_status untouched |
| CONNECT-06 | 70-03 + 70-05 | Conditional Pay button + 2 snapshot tests | SATISFIED | pay-now-button.tsx 4-condition gate + e2e spec with both-branch snapshots |
| CONNECT-07 | 70-03 | POST /api/estimate/[token]/pay creates Checkout Session on connected account | SATISFIED | pay/route.ts with stripeAccount option, metadata.estimate_id/company_id, success_url with {CHECKOUT_SESSION_ID} literal, 303 redirect |
| CONNECT-08 | 70-04 | Webhook branches on event.account, updates 5 estimate columns, fires 2 Resend emails, idempotent | SATISFIED | webhooks/stripe/route.ts:67-71 branch; connect-webhook.ts 5-column update; payment-emails.ts both helpers; Promise.allSettled fire |
| CONNECT-09 | 70-03 | ?stripe=success banner + Pay Now hidden; ?stripe=canceled neutral notice + Pay Now kept | SATISFIED | payment-success-banner.tsx PaymentSuccessBanner/PaymentCanceledNotice; estimate-view.tsx:399-411 conditional render; paymentStatus coerced to 'paid' on success |

All 9 declared requirement IDs SATISFIED. No orphans.

### Anti-Patterns Found

None of significance. Scanned all Phase 70 files for TODO/FIXME/placeholder/stub patterns:
- `application_fee_amount` mentions in `pay/route.ts` are intentional commentary explaining the omission (Stripe Pitfall 2)
- `console.warn` calls in `payment-emails.ts` and `connect-webhook.ts` are intentional graceful-degrade logging (email failures, missing customer email, deauth without account ID) — not stubs

### Human Verification Required

The following items pass code-level verification but warrant manual smoke testing against a test-mode Stripe environment per `docs/STRIPE-CONNECT-OWNER-SETUP.md` Section 6 before public launch:

1. **Snapshot baseline minting** — Test: run `npm run test:e2e -- estimate-share-payment.spec.ts --update-snapshots` in CI (or CI-equivalent docker) with `NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY` set; commit the resulting `share-without-stripe.png` and `share-with-stripe.png`. Expected: 2 PNGs land under `tests/e2e/estimate-share-payment.spec.ts-snapshots/`. Why human: baselines intentionally not committed (per 70-05 SUMMARY) so CI fonts/antialiasing match production renders.
2. **End-to-end OAuth flow** — Test: complete the 8-step smoke runbook in `docs/STRIPE-CONNECT-OWNER-SETUP.md` Section 6 (signup → connect → share → pay with 4242 4242 4242 4242 → verify DB + Resend dashboard). Expected: estimate row marked paid, 2 emails sent. Why human: requires live test-mode Stripe account, Stripe CLI webhook forwarding, and Resend account.
3. **Visual regression of share page** — Test: visit `/estimate/<token>` in both branches and visually confirm the without-Stripe branch is byte-identical to pre-Phase-70 behavior (no rogue spacing, no "Powered by Stripe" tagline leak). Why human: snapshot tests gate on this in CI but a designer eyeball is the gold standard.

### Gaps Summary

No gaps. All 7 success criteria verified, all 9 requirements satisfied, all artifacts exist and are wired with real data flowing. Unit test suite for Phase 70 is 22/22 green.

The only items deferred are:
- Snapshot baseline PNGs (intentionally deferred for CI-generated baselines per 70-05 SUMMARY rationale)
- Full end-to-end manual smoke against live Stripe test mode (requires owner-side platform setup per the shipped runbook)

Both are documented design choices, not implementation gaps.

---

_Verified: 2026-05-17T02:18:00Z_
_Verifier: Claude (gsd-verifier)_
