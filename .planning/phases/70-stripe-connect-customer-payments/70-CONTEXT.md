# Phase 70: Stripe Connect — Optional Customer Payments - Context

**Gathered:** 2026-05-17
**Status:** Ready for planning
**Mode:** Auto-generated from SEED-020 (decisions locked during seed planting)

<domain>
## Phase Boundary

Ship an entirely-optional Stripe Connect Standard integration so any service business using Xtimator can connect their own Stripe account once via OAuth and immediately get a "Pay Now" button on every shared estimate. The customer clicks → Stripe Checkout hosted on the business's connected account → pays full amount → estimate marked paid in Xtimator, business gets email notification, customer gets branded receipt, share page shows green confirmation banner.

**Hard boundary — what is OUT of scope:**
- Refunds initiated from Xtimator (business uses Stripe Dashboard directly)
- Partial payments, deposits, or custom amounts (MVP is full-amount only)
- Recurring billing for retainer-style projects
- Multi-currency support (USD only for v1)
- ACH / bank transfer (Stripe Card via Checkout default; Apple/Google Pay auto-enabled by Checkout when business is eligible)
- Express or Custom Connect account types (Standard OAuth only)
- Application fees / platform cut (zero — provider keeps 100%)

**Critical constraint:** Everything in Xtimator works perfectly without this. Companies that don't connect Stripe see ZERO Stripe UI anywhere — no broken buttons, no "Coming soon" upsell, no Settings nag. Existing share/PDF/email flows render identically. Tests verify both branches.

</domain>

<decisions>
## Implementation Decisions

### Stripe Connect Architecture
- **Connect type: Standard** — business uses their own Stripe Dashboard for refunds/disputes/payouts (Xtimator never builds payout UI)
- **OAuth flow:** business clicks Connect → redirect to `connect.stripe.com/oauth/authorize` → callback exchanges code for `stripe_user_id` (acct_xxx)
- **Charge mode: Direct charges** on the connected account (using `stripeAccount` header option in API calls); funds settle directly to the business's Stripe balance, not the platform's
- **Application fee: 0%** — provider keeps 100% of payment; Xtimator monetizes via SaaS plans only
- **Per-company isolation:** each company's `stripe_account_id` is independent; one company connecting/disconnecting never affects others

### Data Model
- **New columns on `companies`:** `stripe_account_id`, `stripe_connect_status` ('pending'|'active'|'disconnected'), `stripe_connected_at`, `stripe_account_email`, `stripe_account_display_name`
- **New columns on `estimates`:** `payment_status` ('unpaid'|'paid'|'refunded'), `stripe_checkout_session_id`, `stripe_payment_intent_id`, `paid_at`, `payment_amount_cents`
- **No new tables** — extend existing companies + estimates
- **RLS unchanged** — company-scoped policies already cover the new columns
- **No backfill needed** — `payment_status` defaults to `'unpaid'` for existing rows

### Platform Configuration
- **New integration key:** `stripe_connect_client_id` (`ca_...` value) — managed via `/admin/integrations` using existing AES-GCM `platform_config` pattern (same as `stripe_secret_key`, `anthropic_api_key`, etc.)
- **Graceful degrade:** when `stripe_connect_client_id` is unset platform-wide, Settings → Payments shows "Stripe Connect not yet enabled — contact support" and never attempts OAuth (no broken redirect)
- **Existing `STRIPE_SECRET_KEY` reused** — same key authenticates Connect API calls (with `stripeAccount` header for connected-account operations)

### Settings UI (`/settings/payments`)
- **New dedicated sub-page** linked from main Settings page (consistent with `/settings/price-book`, `/settings/estimate-templates` pattern)
- **Three states:** (a) not connected — "Connect Stripe Account" CTA, (b) connected — "Connected ✓ as [display name] ([email])" + Disconnect button, (c) platform not configured — friendly message
- **Use existing shadcn/ui Card + Button** — no new design tokens
- **Brand colors:** #406EF1 primary for Connect CTA; success-green (existing semantic token) for connected state badge

### Public Share Page Integration (`/estimate/[token]`)
- **Conditional render:** Pay Now button only when `company.stripe_account_id` is present AND `estimate.payment_status != 'paid'`
- **Button label:** "Pay $X" with dollar amount from `estimate.total_amount` (USD-formatted)
- **Position:** prominent above existing accept/decline buttons; visually primary (filled, brand color)
- **Success banner:** green banner appears when URL has `?stripe=success` query param; Pay Now button disappears
- **Cancel state:** when URL has `?stripe=canceled`, neutral inline message ("Payment canceled — try again anytime"); button remains

### Webhook Handling
- **Reuse existing endpoint:** `app/api/webhooks/stripe/route.ts` — extend to branch on `event.account` field
- **When `event.account` is present:** treat as connected-account event, look up company by `stripe_account_id`, find estimate by `metadata.estimate_id` (set on Checkout Session creation)
- **Idempotency:** reuse existing `stripe_processed_events` table — prevents duplicate paid markings on webhook retries
- **Events handled:** `checkout.session.completed` (mark paid + emails); other Connect events (account.updated, account.application.deauthorized) handled for status sync

### Post-Payment Actions (ALL 4 fire on successful payment)
1. **DB update:** `estimates.payment_status='paid'`, `stripe_checkout_session_id`, `stripe_payment_intent_id`, `paid_at`, `payment_amount_cents`
2. **Email to business owner** (Resend, branded with `getBranding()` template): subject "You received $X — [estimate title]", body shows customer email + amount + link to estimate
3. **Email to customer** (Resend, branded with business name from company): subject "Payment confirmation — $X to [business name]", body shows what they paid for + receipt-style line items
4. **Success banner on share page** (visible when customer returns from Stripe via success_url redirect)

### Disconnect Flow
- **Soft disconnect:** clear `stripe_account_id`, set `stripe_connect_status='disconnected'`, keep `stripe_account_email` for audit trail
- **Existing paid estimates retain `paid` status** — disconnect does not retroactively change history
- **Optional Stripe-side deauth:** call `POST /oauth/deauthorize` to revoke platform's access (best-effort; ignore failure since company-side intent is what matters)
- **Reconnect path:** re-running OAuth flow upserts the same row; status flips back to 'active'

### Claude's Discretion
- Exact OAuth state CSRF mechanism (signed JWT vs DB-stored nonce vs encrypted cookie) — pick simplest secure option
- Email template visual design (use existing branded email pattern from `lib/email/templates/`)
- Whether to add a small "Powered by Stripe" badge on share page near Pay Now (standard Stripe branding guidance — likely yes)
- Loading states / spinner UX during OAuth round-trip and payment redirect
- Exact copy for empty states, error toasts, success banner
- Test fixture structure for unit tests (reuse existing patterns from `tests/unit/billing/`)
- Whether to add a "Pago" badge polish on dashboard estimate list (small UX win, low cost)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/billing/stripe-client.ts` — existing per-request Stripe client factory; extend to accept `stripeAccount` option for Connect calls
- `app/api/webhooks/stripe/route.ts` — existing webhook with HMAC verification + `stripe_processed_events` idempotency; extend to branch on `event.account`
- `lib/platform-config.ts` — `getIntegrationKey(name)` pattern for admin-managed encrypted keys (reuse for `stripe_connect_client_id`)
- `app/admin/integrations/page.tsx` + `app/admin/integrations/actions.ts` — existing UI pattern for adding integration key cards
- `lib/email/` (Resend) — existing branded email infrastructure
- `lib/email/branding.ts` (via `getBranding()`) — pulls company name, logo, color for emails
- `components/ui/card.tsx`, `components/ui/button.tsx` — shadcn/ui primitives for Settings UI
- `app/estimate/[token]/page.tsx` — existing public share page (server component) where Pay Now button slots in
- `supabase/migrations/` — convention: `YYYYMMDDHHMMSS_phaseNN_description.sql`
- `types/database.ts` — Supabase-generated TS types, regenerated after migration
- `tests/unit/billing/` — existing patterns for Stripe-related unit tests
- `tests/unit/webhooks/` — existing patterns for webhook handler tests

### Established Patterns
- **Server actions** for mutations (settings save pattern with `revalidatePath`)
- **Server components** for data fetching; client components for interactivity
- **React `cache()` + `unstable_cache`** for layout-level queries (don't double-fetch company in `/settings/payments` page)
- **Discriminated union returns** from admin actions: `{ ok: boolean; message?: string }`
- **Encrypted keys via `platform_integrations` table** — never module-level env reads for credentials
- **Service role client** (`createServiceClient()`) for privileged server ops (e.g., webhook handler updating estimates without RLS context)
- **HMAC verification** on all webhooks before processing
- **Idempotent event processing** via `stripe_processed_events` table (insert event_id; ON CONFLICT DO NOTHING)
- **Wave 0 test stubs** — write failing tests before implementation in each plan

### Integration Points
- Settings entry card → links to new `/settings/payments` sub-page
- Webhook route → extend with Connect-event branch
- Admin integrations page → add Connect Client ID card
- Public estimate share page → conditional Pay Now button
- Email templates → 2 new files (`payment-received.tsx`, `payment-receipt.tsx`)
- Dashboard estimate list (optional polish) → "Pago" badge when `payment_status='paid'`

</code_context>

<specifics>
## Specific Ideas

**See `.planning/seeds/SEED-020-stripe-connect-customer-payments.md` for full architecture spec, flow diagrams, file inventory, and setup runbook.**

Key references:
- [Stripe Connect Standard docs](https://docs.stripe.com/connect/standard-accounts)
- [OAuth for Standard accounts](https://docs.stripe.com/connect/oauth-reference)
- [Direct charges](https://docs.stripe.com/connect/direct-charges)
- [Connect webhooks](https://docs.stripe.com/connect/webhooks)
- [Checkout for Connect](https://docs.stripe.com/connect/payments-checkout)

**Plan structure (5 plans, ~17 tasks):**
- 70-01 — DB migration + types regen + Wave 0 test stubs
- 70-02 — OAuth flow (initiate + callback + disconnect) + Settings → Payments UI + Admin Client ID card
- 70-03 — Pay Now button + Checkout Session creation API + success/cancel banners on share page
- 70-04 — Webhook handler for connected-account events + payment notification emails (business + customer)
- 70-05 — Test pass + verification (snapshot tests for share page both branches) + dashboard "Paid" badge polish

**Setup that requires manual action by Xtimator owner AFTER ship** (documented in plan summary):
1. Enable Connect in Stripe Dashboard → Connect → Standard
2. Configure Platform Settings (brand name "Xtimator", logo, color #406EF1)
3. Set OAuth redirect URIs: `https://xtimator.com/api/stripe/connect/callback` and `http://localhost:3000/api/stripe/connect/callback`
4. Copy Client ID (`ca_...`) → paste into `/admin/integrations` Connect Client ID card
5. Smoke test: non-admin company → Settings → Payments → Connect → verify OAuth completes in test mode

</specifics>

<deferred>
## Deferred Ideas

- **Refund management UI inside Xtimator** — business handles in Stripe Dashboard; potential future seed if customer complaints arise
- **Partial payments / deposits** — could be Phase 70.5 if user demand surfaces post-launch
- **Custom payment amount** — customer-typed value; out of scope, security implications
- **Recurring/subscription billing for retainer projects** — different feature category, future seed
- **Multi-currency** — USD only for v1; add CAD/EUR when expanding markets
- **ACH / bank transfer** — Stripe Checkout supports adding payment_method_types; defer until US customers request
- **Apple Pay / Google Pay buttons explicit** — Stripe Checkout auto-enables when eligible; no extra code needed
- **Dashboard reporting / payment analytics** — Stripe Dashboard already provides this; in-app analytics would be future seed
- **Stripe Tax integration** — automated sales tax calculation; future feature when expanding to multi-state

</deferred>
