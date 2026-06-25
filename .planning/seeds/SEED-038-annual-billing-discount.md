---
id: SEED-038
status: activating
planted: 2026-06-25
planted_during: v4.12 close-out (billing review — "is there annual billing?")
trigger_when: User activated 2026-06-25 — add a discounted annual plan while keeping credit distribution monthly.
scope: Medium
---

# SEED-038: Annual Billing — Discounted Yearly Price, Credits Still Monthly

Today every Xtimator subscription is **monthly only** — the Stripe interval is hardcoded `'month'`, `billing_config` has a single `subscriptionPriceCents` per tier, the pricing cards hardcode `period: 'month'`, and the credit grant fires on `invoice.paid`. This seed adds an **annual** option: the customer pays yearly at a **discount**, but their AI **credits are still distributed monthly** — not 12× upfront. The annual choice changes *price and billing cadence*, never the rate at which credits flow.

## The one decision that drives the whole design (locked 2026-06-25)

> **Credits stay MONTHLY for everyone. Annual is only a price discount.**

This is the load-bearing constraint. Today the monthly credit grant is a side-effect of `invoice.paid` (`app/api/webhooks/stripe/route.ts:194`) — which works for monthly subs (one invoice/month → one grant/month) but **breaks for annual** (one invoice/**year** → one grant/year). So the credit grant must be **decoupled from the invoice cadence** and driven by the calendar month instead.

**Mechanism:** a monthly **Inngest cron** grants `monthlyCreditGrant` to every active paying company once per calendar month, idempotent on a **company+month** key (`grant:{companyId}:{YYYY-MM}`). The same key is used by `invoice.paid` so the two converge: exactly **one grant per company per calendar month**, regardless of billing interval.
- **Monthly subscriber:** `invoice.paid` fires monthly and grants (the cron no-ops that month — key already present).
- **Annual subscriber:** `invoice.paid` fires once at purchase (month 1 grant); the cron grants months 2-12.
- A new Pro signup still gets an **immediate** first grant from `invoice.paid` (no waiting for the 1st of the month).

This single change (key from `event.id` → `grant:{companyId}:{YYYY-MM}`) + the cron fixes the latent annual bug AND unifies both intervals under one rule.

## Locked principles

### 1. Annual = a discounted price, nothing else changes about value delivery
The annual plan is the same tier (same entitlements, same monthly credit grant, same seats) at a lower effective monthly price. The discount is the only incentive; credits, limits, and features are identical to the monthly plan of that tier.

### 2. ZERO hardcoded billing numbers — the annual price + discount live in the super-admin
Extend the `billing_config` store ([lib/billing/billing-config.ts](lib/billing/billing-config.ts)) — mirroring how `subscriptionPriceCents` / `seatPriceCents` / `estimateFeePct` already work:
- `tiers[tier].subscriptionPriceAnnualCents: number` — the per-tier annual price (e.g. pro $290/yr vs 12×$29=$348 → the discount is implicit in the lower number). Null-safe placeholder in `DEFAULT_BILLING_CONFIG`, **CALIBRATE BEFORE CHARGING**, editable in the super-admin panel.
- `seatPriceAnnualCents: number` — the annual per-seat price (seats also get the discount when the org is on an annual plan).
- The effective discount % shown in the UI is **derived** (`1 − annual/(12×monthly)`), never a stored magic number that could diverge.
- No annual price, discount %, or Stripe Price ID may be hardcoded in application code.

### 3. The actual Stripe charge uses pre-created annual Price IDs (the base subscription)
The base subscription charge comes from **pre-created Stripe Price objects** (today: env `STRIPE_PRICE_PRO` / `STRIPE_PRICE_BUSINESS` at `app/api/billing/create-checkout-session/route.ts:32`). Annual needs the yearly counterparts: env `STRIPE_PRICE_PRO_ANNUAL` / `STRIPE_PRICE_BUSINESS_ANNUAL` (the Xtimator owner creates these once in Stripe, like the monthly ones). The `billing_config.subscriptionPriceAnnualCents` is the **display/super-admin** figure; the Stripe Price ID is what actually charges — both must be kept consistent (same as the existing monthly split).
- (Seat billing is different: it uses inline `price_data` driven by `billing_config.seatPriceCents` directly — so the annual seat price flows straight from config, no pre-created Price ID needed. The hardcoded `recurring: { interval: 'month' }` at [lib/billing/stripe-client.ts:79](lib/billing/stripe-client.ts) becomes interval-aware.)

### 4. Interval is selected at checkout and threaded through
- `create-checkout-session` accepts `billingInterval: 'month' | 'year'` (default `'month'` — retrocompat), picks the matching Stripe Price ID, and stores `billing_interval` in the subscription/session metadata.
- The seat-billing sync (`syncSeatBilling` → `syncSubscriptionSeatItem`) reads the subscription's interval and sets the seat item's `recurring.interval` to match (no longer hardcoded `'month'`), with the annual seat unit_amount from `seatPriceAnnualCents`.

### 5. Retrocompat is mandatory
- Default interval is `'month'` everywhere; every existing monthly subscriber is untouched.
- The credit-grant idempotency-key change (`event.id` → `grant:{companyId}:{YYYY-MM}`) must keep granting existing monthly subscribers exactly once per month, with no double-grant during the transition (the company-month key is the single dedup authority for both the webhook and the new cron). Lock this with a regression test.
- Annual is purely additive — a tenant who never picks annual sees no behavior change.

### 6. UI: a monthly/annual toggle that shows the discount
The pricing cards ([components/billing/tier-cards-grid.tsx](components/billing/tier-cards-grid.tsx) — currently hardcode `period: 'month'`) gain a Monthly/Annual toggle. Annual shows the yearly price + the derived "save X%" badge + the effective per-month equivalent. Mobile-safe, runtime i18n (en/pt/es). The selected interval is passed to checkout.

## Decisions to lock before planning

1. **Annual price model** — explicit per-tier `subscriptionPriceAnnualCents` (recommended — full control, no rounding surprises, mirrors the monthly field) vs. a single global `annualDiscountPct` applied to 12× monthly. Recommend explicit per-tier price; derive the displayed discount %.
2. **Credit grant for monthly subs — keep on `invoice.paid` or move entirely to the cron?** Recommend: KEEP `invoice.paid` for the immediate first/renewal grant AND add the cron for coverage; both share the `grant:{companyId}:{YYYY-MM}` key so there is never a double grant. (The cron is what makes annual work; the webhook keeps the UX instant.)
3. **Cron timing** — 1st of month (e.g. `cron: '0 5 1 * *'`) granting any active paying company that has no grant row for the current `YYYY-MM`. Confirm the "active paying company" query (tier ≠ free/trial-expired, subscription active).
4. **Seats on annual** — annual seat price = `seatPriceAnnualCents` (configurable) and the seat item interval matches the subscription. Confirm seats inherit the same interval as the base subscription (recommended) rather than being independently chosen.
5. **Mid-life interval switch** (monthly→annual or back) — in scope for v1, or "cancel + resubscribe"? Recommend: v1 supports choosing interval at checkout/upgrade only; Stripe proration on switch is a v2 follow-up.
6. **Enforcement gating** — annual pricing display can ship anytime, but real charging stays behind the existing `enforcementEnabled` discipline / live-mode (consistent with the credit + seat billing). Confirm.

## Architecture sketch

1. **`billing_config` extension** ([lib/billing/billing-config.ts](lib/billing/billing-config.ts) + [lib/schemas/admin.ts](lib/schemas/admin.ts) + the admin form): `tiers[tier].subscriptionPriceAnnualCents` + `seatPriceAnnualCents`, calibration placeholders, super-admin-editable. Deep-merge tolerant (Pitfall 6).
2. **Credit-grant cadence decouple:** change the grant idempotency key to `grant:{companyId}:{YYYY-MM}` in the `invoice.paid` handler ([app/api/webhooks/stripe/route.ts:194-200](app/api/webhooks/stripe/route.ts)); add an Inngest monthly cron `lib/inngest/functions/monthly-credit-grant.ts` (mirror the `cron:` pattern in [cleanup-audio.ts:103](lib/inngest/functions/cleanup-audio.ts)) that grants `monthlyCreditGrant` to active paying companies with the same key. Reuse the idempotent never-throw `grantCredits` ([lib/billing/credit-ledger.ts:209](lib/billing/credit-ledger.ts)).
3. **Checkout interval:** `create-checkout-session` accepts + routes on `billingInterval`, selects the annual Stripe Price ID (new env), stores `billing_interval` in metadata.
4. **Seat interval-awareness:** make `syncSubscriptionSeatItem` interval-aware (read it from the subscription) + use `seatPriceAnnualCents` on annual; replace the hardcoded `recurring: { interval: 'month' }`.
5. **Pricing UI:** Monthly/Annual toggle on the tier cards + derived discount badge; thread the interval into the upgrade action.
6. **Tests:** the company-month grant dedup (monthly retrocompat + annual months-2-12 coverage), no double-grant across webhook+cron, annual checkout selects the annual price, seat interval/price follows the subscription, nothing-hardcoded static guard.

## Scope fence

- **In:** annual price + seat price in `billing_config`/super-admin; annual Stripe Price IDs; checkout interval selection; the monthly-credit-grant cron + the company-month idempotency-key change; interval-aware seat billing; the pricing-card monthly/annual toggle; retrocompat for monthly subs.
- **Out (v2):** mid-cycle proration on interval switch; multi-currency; annual-only tiers; per-tenant custom discounts; dunning/retry logic changes.

## Breadcrumbs

- [lib/billing/billing-config.ts](lib/billing/billing-config.ts) — `TierBilling` (`subscriptionPriceCents` → add `subscriptionPriceAnnualCents`) + add `seatPriceAnnualCents`; the super-admin config the price plugs into
- [lib/schemas/admin.ts](lib/schemas/admin.ts) — `billingConfigSchema` / `tierBillingSchema`; add the annual fields
- `app/admin/integrations/billing-config-form.tsx` — the super-admin billing form; add the annual price inputs
- [app/api/billing/create-checkout-session/route.ts](app/api/billing/create-checkout-session/route.ts) — base subscription checkout; add `billingInterval` + annual Price ID selection + metadata
- [app/api/webhooks/stripe/route.ts](app/api/webhooks/stripe/route.ts) — `invoice.paid` grant (line ~194); change the idempotency key to `grant:{companyId}:{YYYY-MM}`
- [lib/billing/credit-ledger.ts](lib/billing/credit-ledger.ts) — `grantCredits` (idempotent, never-throws) — the cron + webhook both call it
- [lib/inngest/functions/cleanup-audio.ts](lib/inngest/functions/cleanup-audio.ts) — the `triggers: [{ cron: ... }]` pattern to mirror for the monthly grant; register in [lib/inngest/functions/index.ts](lib/inngest/functions/index.ts)
- [lib/billing/stripe-client.ts](lib/billing/stripe-client.ts) — `syncSubscriptionSeatItem` + the hardcoded `recurring: { interval: 'month' }` (line ~79) to make interval-aware
- [components/billing/tier-cards-grid.tsx](components/billing/tier-cards-grid.tsx) + [components/billing/tier-card.tsx](components/billing/tier-card.tsx) — the pricing cards; add the Monthly/Annual toggle + derived discount
- `.env.local.example` / `.env.production.example` — document the new `STRIPE_PRICE_PRO_ANNUAL` / `STRIPE_PRICE_BUSINESS_ANNUAL` (placeholders only — no real IDs)

## Related Seeds

- **[[SEED-035-credit-based-subscription-billing]]** — the credit/grant model annual must preserve (credits stay monthly; the `billing_config`/super-admin + "calibrate before charging" discipline is reused)
- **[[SEED-013-subscription-tiers-entitlements]]** — the tier model the annual price is a variant of
- **[[SEED-037-team-seats-member-invites]]** — seats inherit the subscription interval + get the annual seat price
- **[[SEED-017-stripe-live-webhook]]** — the webhook go-live the grant cadence depends on

## Notes

**Why the cron is the heart of this seed, not the price field:** adding an annual Stripe price is trivial. The real work — and the reason the user's "credits stay monthly" decision matters — is that the credit grant is currently welded to the invoice. Annual breaks that weld. Moving the monthly grant to a calendar-month-idempotent cron (shared key with the webhook) is what lets annual exist without either starving annual customers of 11 months of credits or double-granting monthly ones. Get that right and the rest (price field, checkout interval, UI toggle) is mechanical.

**Why discount-only (not more credits) is the right model:** annual buyers pre-commit cash, so the incentive is a price break, not extra value delivery — the per-month experience is identical to the monthly plan. This keeps entitlements/credit accounting interval-agnostic (one `monthlyCreditGrant`, one monthly cadence) and avoids a second credit-accounting path.
