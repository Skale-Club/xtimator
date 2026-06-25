---
id: SEED-020
status: harvested
planted: 2026-05-17
planted_during: v3.1.1 post-Phase-69
harvested_in: Phase 70
trigger_when: User requested feature — execute immediately, before v3.2 deploy
scope: Medium-Large
superseded_partial: "The original 'Application fee: 0%' decision was REVERSED by [[SEED-036-estimate-payment-platform-fee]] (shipped) — Xtimator now charges a 1% application fee, configurable in the super-admin billing_config. The 'Pay Now' flow and the '100% optional' gating below remain accurate."
---

# SEED-020: Stripe Connect — Optional Customer Payments on Estimates

## Why This Matters

Today, when a service business sends an estimate via Xtimator, the customer reads it and pays **outside** the platform — by check, cash, Venmo, Zelle, or asks for an invoice. There is **zero collection friction reduction**: the business still has to chase payment manually.

With Stripe Connect Standard, any service business that has (or creates) a Stripe account can **connect it once** to Xtimator and instantly get a **"Pay Now"** button on every shared estimate. The customer clicks → goes to Stripe Checkout (hosted by Stripe, branded with the business name) → pays the estimate total → the estimate is automatically marked `paid` in Xtimator.

**Money flows directly from the customer's card to the business's Stripe account.** The business stays the merchant of record (it owns the sale, the customer, and the chargeback risk), and Xtimator never custodies the funds — so there is zero PCI scope and no money-transmitter exposure. Xtimator takes a **1% platform application fee** on each payment, routed automatically via Stripe's `application_fee_amount` (the fee percentage is configurable in the super-admin `billing_config`, not hardcoded — see [[SEED-036-estimate-payment-platform-fee]]). The business sees the payout in their bank in 2 business days via Stripe's normal payout schedule.

This unlocks a real "estimate → payment in under 10 minutes" loop, which is a wedge differentiator vs every other estimate tool that just emails PDFs.

## Critical Constraint: 100% Optional

**The connection is entirely optional. Everything in Xtimator works perfectly without it.**

- Companies that do not connect Stripe see no Stripe UI anywhere (no broken buttons, no "Coming soon" tease, no upsell nag)
- Existing estimate-sharing, PDF generation, email delivery, share link, accept/decline flow all continue working unchanged
- The "Pay Now" button **only appears** on a shared estimate when the company has an active Stripe Connect account
- Disconnecting Stripe is one click in Settings → existing paid estimates keep their `paid` status; new estimates simply lose the Pay Now button
- Tests must verify share page renders correctly in BOTH states: with and without a connected account

## Architecture

### Stripe Connect Standard (OAuth-based)

The business owner uses their **existing** Stripe account (or creates one inline). Xtimator acts as a Connect platform that creates Checkout Sessions on behalf of the connected account using the `Stripe-Account` header.

**Why Standard over Express/Custom:**
- Standard: business keeps full ownership of their Stripe Dashboard (refunds, disputes, payouts — all handled in Stripe directly, not Xtimator)
- Express/Custom would require Xtimator to build dashboard UI for refunds, disputes, payout schedules — out of scope
- Standard's OAuth flow is one-click for anyone who already uses Stripe

### Flow Diagram

```
Business owner (Settings → Payments):
  1. Click "Connect Stripe Account"
  2. → redirect to Stripe OAuth: https://connect.stripe.com/oauth/authorize?...
  3. Logs into Stripe (or creates account), authorizes Xtimator
  4. → callback /api/stripe/connect/callback?code=...&state=...
  5. Server exchanges code for stripe_user_id (acct_...)
  6. Store in companies.stripe_account_id; set stripe_connect_status='active'
  7. Settings UI now shows "Connected ✓ as acct_xxx — [Disconnect]"

Customer (shared estimate page /estimate/[token]):
  1. Loads estimate; if company.stripe_account_id present AND estimate.payment_status != 'paid'
     → render "Pay Now" button with total amount
  2. Click → POST /api/estimate/[token]/pay
  3. Server creates Stripe Checkout Session with stripeAccount: company.stripe_account_id
     - line_items: [{ price_data: { product: estimate.title, unit_amount: total }, quantity: 1 }]
     - success_url: /estimate/[token]?stripe=success&session_id={CHECKOUT_SESSION_ID}
     - cancel_url: /estimate/[token]?stripe=canceled
  4. Redirect customer to session.url (Stripe-hosted Checkout)
  5. Customer pays on Stripe → redirected back to /estimate/[token]?stripe=success
  6. Banner: "✓ Payment received — thank you!"

Webhook (POST /api/webhooks/stripe — connected account events):
  1. Stripe sends checkout.session.completed event with account=acct_xxx
  2. Look up company by stripe_account_id
  3. Find estimate by metadata.estimate_id (we set this on session creation)
  4. Update estimates: payment_status='paid', stripe_checkout_session_id, paid_at, payment_amount
  5. Send branded email to business owner (Resend): "You received $X from [customer email]"
  6. Send branded email to customer (Resend): "Payment confirmation — $X paid to [business]"
```

### Data Model

**New columns on `companies`:**
- `stripe_account_id TEXT NULL` — Stripe Connect account ID (`acct_...`)
- `stripe_connect_status TEXT NULL` — `pending` | `active` | `disconnected` (null if never connected)
- `stripe_connected_at TIMESTAMPTZ NULL`
- `stripe_account_email TEXT NULL` — denormalized for Settings UI display
- `stripe_account_display_name TEXT NULL` — denormalized for Settings UI display

**New columns on `estimates`:**
- `payment_status TEXT NOT NULL DEFAULT 'unpaid'` — `unpaid` | `paid` | `refunded`
- `stripe_checkout_session_id TEXT NULL` — for idempotency + lookup
- `stripe_payment_intent_id TEXT NULL` — for refund traceability
- `paid_at TIMESTAMPTZ NULL`
- `payment_amount_cents INTEGER NULL` — exact amount paid (in cents, USD)

**New env var (managed via `platform_integrations` admin UI):**
- `STRIPE_CONNECT_CLIENT_ID` — the `ca_...` Connect Client ID (registered once by Xtimator owner in Stripe Dashboard → Connect Settings)

### Reused Infrastructure

- ✅ `lib/billing/stripe-client.ts` — already exists; extend to accept `stripeAccount` option for Connect calls
- ✅ `app/api/webhooks/stripe/route.ts` — already handles `checkout.session.completed`; extend to handle connected-account events (distinguish by `event.account`)
- ✅ `lib/email/` (Resend) — already configured; add 2 new templates
- ✅ `lib/platform-config.ts` — `getIntegrationKey('stripe_connect_client_id')` follows same pattern as existing keys
- ✅ Public estimate share page at `app/estimate/[token]/page.tsx` — modify to inject Pay Now button

### Files to Be Created or Modified

**Created:**
- `supabase/migrations/2026XXXX_phase70_stripe_connect_columns.sql`
- `app/api/stripe/connect/initiate/route.ts` — generates OAuth state, redirects to Stripe
- `app/api/stripe/connect/callback/route.ts` — exchanges code, persists account_id
- `app/api/stripe/connect/disconnect/route.ts` — clears columns, optionally deauthorizes via Stripe API
- `app/api/estimate/[token]/pay/route.ts` — creates Checkout Session on connected account
- `app/(app)/settings/payments/page.tsx` — Connect/Disconnect UI
- `components/settings/stripe-connect-card.tsx` — connection status card
- `components/estimate/pay-now-button.tsx` — public share page button
- `components/estimate/payment-success-banner.tsx` — banner after Stripe redirect
- `lib/billing/connect-oauth.ts` — OAuth URL builder, state CSRF helper
- `lib/email/templates/payment-received.tsx` — to business owner
- `lib/email/templates/payment-receipt.tsx` — to customer
- `tests/unit/billing/connect-oauth.test.ts`
- `tests/unit/billing/estimate-pay.test.ts`
- `tests/unit/webhooks/connect-events.test.ts`

**Modified:**
- `lib/billing/stripe-client.ts` — add `stripeAccount` option pass-through
- `app/api/webhooks/stripe/route.ts` — branch on `event.account` for connected-account events
- `app/estimate/[token]/page.tsx` — conditional Pay Now button + success banner
- `app/(app)/settings/page.tsx` — add link to new Payments sub-page
- `lib/platform-config.ts` — add `stripe_connect_client_id` to integration keys
- `app/admin/integrations/page.tsx` — add Stripe Connect Client ID card
- `types/database.ts` — regenerate after migration
- `app/(app)/dashboard/page.tsx` — show "Pago" badge on paid estimates (small polish)

## Setup Requirements (Manual — User Action Needed)

After code ships, the Xtimator owner must do **once** in Stripe Dashboard:

1. **Enable Connect:** Stripe Dashboard → Connect → Get Started → choose **Standard** integration type
2. **Configure Platform Settings:**
   - Brand name: "Xtimator"
   - Logo / icon upload
   - Brand color: `#406EF1`
   - Support email: `support@xtimator.com` (or owner's email)
3. **OAuth Settings:**
   - Redirect URI: `https://xtimator.com/api/stripe/connect/callback`
   - Also add: `http://localhost:3000/api/stripe/connect/callback` for dev
4. **Copy Client ID:** Format `ca_...` — paste into `/admin/integrations` → Stripe Connect Client ID card
5. **Test:** From a non-admin company account → Settings → Payments → Connect → complete test mode OAuth flow → verify status flips to Connected

**Without this setup:** the Pay Now button never renders, the Settings → Payments page shows "Stripe Connect not yet enabled on the platform — contact support." Code degrades gracefully.

## Scope Estimate

**Medium-Large** — 5 plans, ~15-20 tasks, ~3-5 hours of focused execution.

| Plan | What | Tasks |
|------|------|-------|
| 70-01 | DB migration + types regen + Wave 0 test stubs | 3 |
| 70-02 | OAuth flow (initiate + callback + disconnect) + Settings UI | 4 |
| 70-03 | Pay Now button + Checkout Session creation + success banner | 4 |
| 70-04 | Webhook handler for connected-account events + payment emails | 3 |
| 70-05 | E2E test pass + verification + dashboard "Paid" badge polish | 3 |

## Breadcrumbs

- `lib/billing/stripe-client.ts:1` — existing Stripe client pattern
- `app/api/webhooks/stripe/route.ts:1` — webhook handler to extend
- `app/estimate/[token]/page.tsx` — public estimate share page
- `lib/platform-config.ts:1` — admin-managed integration keys
- `app/admin/integrations/page.tsx` — where to add Connect Client ID card
- `lib/email/` — Resend templates directory
- `supabase/migrations/` — migration naming convention `YYYYMMDDHHMMSS_phaseNN_description.sql`

## References

- [Stripe Connect Standard Onboarding](https://docs.stripe.com/connect/standard-accounts)
- [OAuth for Standard Accounts](https://docs.stripe.com/connect/oauth-reference)
- [Direct charges with Connect](https://docs.stripe.com/connect/direct-charges)
- [Connect webhooks](https://docs.stripe.com/connect/webhooks)
- [Stripe Checkout for Connect](https://docs.stripe.com/connect/payments-checkout)

## Notes

**Decisions locked (2026-05-17):**
- Connect type: **Standard** (OAuth, business uses their existing Stripe)
- Application fee: **1%** (configurable in the super-admin `billing_config`, never hardcoded). ⚠️ The ORIGINAL Phase-70 decision was **0%** ("provider gets 100%; Xtimator monetizes via SaaS plans only"); that was **reversed on 2026-06-24 by [[SEED-036-estimate-payment-platform-fee]]** (shipped). The platform revenue model is now subscription/credits + 1% transactional. The "100% optional" gating below remains in force and is reinforced (no payment UI appears unless Stripe Connect is active).
- Payment scope: **MVP only — "Pay Now" full amount** (no deposits, no partial payments)
- Post-payment: all 4 actions (mark paid, email provider, success banner, branded receipt to customer)

**Out of scope for Phase 70 (potential future seeds):**
- Refunds initiated from Xtimator (business uses Stripe Dashboard directly)
- Partial payments / deposits
- Recurring billing for retainer-style projects
- Multi-currency (USD only — target US service businesses)
- ACH / bank transfer (Stripe Card only via Checkout default)
- Apple Pay / Google Pay (Stripe Checkout enables these automatically when business meets requirements — no extra code needed)
