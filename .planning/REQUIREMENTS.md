# Requirements: Xtimator — Milestone v4.13 Annual Billing

**Defined:** 2026-06-25
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** Add a discounted ANNUAL subscription option while keeping AI credit distribution MONTHLY for every interval. Annual changes price + billing cadence only — never the rate at which credits flow. Source: [SEED-038](seeds/SEED-038-annual-billing-discount.md).

> **Locked decisions (non-negotiable):**
> - **Credits stay MONTHLY for everyone; annual is only a price discount.** The annual plan is the same tier (same entitlements, same `monthlyCreditGrant`, same seats) at a lower effective monthly price. The discount is the only incentive.
> - **Decouple the credit grant from the invoice cadence.** Today the monthly grant is a side-effect of `invoice.paid`, which fires monthly for monthly subs but only **once a year** for annual subs. The grant becomes calendar-month-driven: a monthly Inngest cron grants `monthlyCreditGrant` to active paying companies, idempotent on a **company+month** key `grant:{companyId}:{YYYY-MM}`. `invoice.paid` uses the SAME key so the two converge → **exactly one grant per company per calendar month**, for any interval. Monthly sub → webhook grants (cron no-ops); annual sub → webhook grants month 1, cron grants months 2-12.
> - **ZERO hardcoded billing numbers.** The annual price (`tiers[tier].subscriptionPriceAnnualCents`) and the annual seat price (`seatPriceAnnualCents`) live in the super-admin `billing_config`, read at runtime via `getBillingConfig()`, editable without a deploy. The displayed discount % is DERIVED (`1 − annual/(12×monthly)`), never a stored magic number. No annual price, discount %, or Stripe Price ID may be a constant in application code.
> - **The actual base-subscription charge uses pre-created annual Stripe Price IDs** (env `STRIPE_PRICE_PRO_ANNUAL` / `STRIPE_PRICE_BUSINESS_ANNUAL`, placeholders only). `billing_config.subscriptionPriceAnnualCents` is the display/super-admin figure kept consistent with the Stripe Price (same split as the existing monthly path). Seat billing uses inline `price_data` driven straight from `seatPriceAnnualCents` (no pre-created Price ID).
> - **Interval is selected at checkout** (`billingInterval: 'month' | 'year'`, default `'month'`) and threaded through metadata; the seat-billing sync reads the subscription interval and matches it (the hardcoded `recurring: { interval: 'month' }` becomes dynamic).
> - **Retrocompat is mandatory.** Default interval is `'month'`; every existing monthly subscriber is untouched. The grant idempotency-key change must keep granting monthly subs exactly once per month with NO double-grant across the webhook + cron (the company-month key is the single dedup authority) — a regression test locks this.
> - **Charging stays behind the existing enforcement / live-mode discipline** (consistent with credit + seat billing). Display can ship anytime.

## v1 Requirements

Each requirement maps to exactly one roadmap phase.

### Configurable Annual Pricing

- [x] **ANN-01**: Extend `BillingConfig` + `DEFAULT_BILLING_CONFIG` (`lib/billing/billing-config.ts`) with `tiers[tier].subscriptionPriceAnnualCents` (per-tier) + `seatPriceAnnualCents` (global) as null-safe calibration placeholders, mirror them in the admin zod schema (`lib/schemas/admin.ts`), and surface both as editable fields in the super-admin billing panel. Nothing hardcoded; deep-merge tolerant for rows written before the fields existed.

### Monthly Credit Grant Decouple (the core)

- [x] **ANN-02**: Change the `invoice.paid` credit-grant idempotency key to `grant:{companyId}:{YYYY-MM}` and add an Inngest monthly cron (`lib/inngest/functions/monthly-credit-grant.ts`) that grants `monthlyCreditGrant` to active paying companies once per company-month using the SAME key (reusing the idempotent, never-throw `grantCredits`). Guarantees exactly one grant per company per calendar month for ALL intervals. Retrocompat: monthly subscribers still get exactly one grant/month with NO double-grant across webhook + cron — regression-tested.

### Settings Account Consolidation and Admin-Only WhatsApp Control

- [ ] **ACCT-01**: Consolidate the tenant's personal profile and credential controls into `Settings → Account`; remove the separate General navigation entry, preserve `/settings/general` as a compatibility redirect to `/settings/account`, and keep profile photo, account name, personal phone, email, and password management functional.
- [ ] **WAADM-01**: Tenant users cannot view or configure WhatsApp provisioning data, inboxes, conversation history, linked numbers, status, delivery format, or message previews from any route or project surface; direct access to legacy tenant WhatsApp URLs returns no protected content.
- [ ] **WAADM-02**: The super-admin WhatsApp surface supports server-side filtering and pagination by tenant company/account, authorized sender/member, phone/contact search, status, unread state, and date range; opening a result shows the read-only conversation thread within the selected account context.
- [ ] **WAADM-03**: WhatsApp provisioning is writable only through `requireAdmin()`-gated server actions with E.164 validation, active-number uniqueness, explicit status transitions, and `admin_audit_log` coverage; no tenant action can write the provisioning tables through the service role.
- [ ] **WAADM-04**: Inbound owner routing trusts only active admin-provisioned senders; onboarding, profile, and Company Settings cannot seed or change routing, and the `companies.phone` fallback is removed. Existing per-user rows are migrated with an expand–migrate–contract rollout and ambiguous companies are surfaced for admin review instead of silently resolved.
- [ ] **WAADM-05**: Tenant outbound estimate sending via WhatsApp remains available only as an opaque action when the account is admin-provisioned and active, without exposing configuration or history. Proactive tenant WhatsApp notifications are disabled while their historical consent data is preserved until a compliant consent flow exists.

### Annual Checkout

- [ ] **ANN-03**: `create-checkout-session` accepts `billingInterval: 'month' | 'year'` (default `'month'`), selects the matching Stripe Price ID (annual via new env `STRIPE_PRICE_PRO_ANNUAL` / `STRIPE_PRICE_BUSINESS_ANNUAL`), and stores `billing_interval` in the subscription/session metadata. Env examples documented with placeholders only. Retrocompat: the no-interval / `'month'` path is byte-identical to today.

### Interval-Aware Seat Billing

- [ ] **ANN-04**: Make `syncSubscriptionSeatItem` interval-aware — read the subscription's interval and set the seat item's `recurring.interval` to match (replacing the hardcoded `'month'`), using `seatPriceAnnualCents` for annual subscriptions. Retrocompat: monthly orgs' seat billing is unchanged; gated by the same `enforcementEnabled` switch.

### Pricing UI

- [ ] **ANN-05**: The pricing cards (`components/billing/tier-cards-grid.tsx` + `tier-card.tsx`) gain a Monthly/Annual toggle showing the annual price, the DERIVED "save X%" badge, and the per-month-equivalent; the selected interval threads into the upgrade/checkout action. Mobile-safe; i18n en/pt/es via runtime t().

## v2 Requirements

Deferred to a future milestone. Tracked but not in this roadmap.

- **ANNX-01**: Mid-cycle interval switch (monthly↔annual) with Stripe proration.
- **ANNX-02**: Multi-currency annual pricing.
- **ANNX-03**: Per-tenant custom discounts / promo codes; annual-only tiers.
- **ANNX-04**: Dunning / retry-logic changes for annual invoices.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Granting credits 12× upfront on annual | Locked decision — credits stay MONTHLY for all intervals |
| Hardcoded annual price / discount % / Price ID | Every billing knob is super-admin-configurable via `billing_config`; the discount % is derived |
| Changing monthly-subscriber behavior | Retrocompat — default interval `'month'`, byte-identical monthly path |
| Mid-cycle proration on interval switch | Deferred to v2 — v1 selects interval at checkout/upgrade only |
| Charging before calibration / live-mode | Gated by the existing `enforcementEnabled` / live-mode discipline |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| ANN-01 | Phase 141 | Complete |
| ANN-02 | Phase 142 | Complete |
| ACCT-01 | Phase 142.1 | Pending |
| WAADM-01 | Phase 142.1 | Pending |
| WAADM-02 | Phase 142.1 | Pending |
| WAADM-03 | Phase 142.1 | Pending |
| WAADM-04 | Phase 142.1 | Pending |
| WAADM-05 | Phase 142.1 | Pending |
| ANN-03 | Phase 143 | Pending |
| ANN-04 | Phase 144 | Pending |
| ANN-05 | Phase 145 | Pending |

**Coverage:**
- v1 requirements: 5 total
- Mapped to phases: 5 (ANN-01 → 141, ANN-02 → 142, ANN-03 → 143, ANN-04 → 144, ANN-05 → 145)
- Unmapped: 0 — **zero orphans confirmed**

---
*Requirements defined: 2026-06-25 — milestone v4.13 Annual Billing (source SEED-038; phase numbering continues the global counter — v4.12 ended at Phase 140, so this milestone starts at Phase 141).*
