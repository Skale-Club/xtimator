# Requirements: Xtimator — Milestone v4.7 Monetização

**Defined:** 2026-06-24
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** Transform billing from count-based tiers into a credit model with built-in margin (subscription grants AI credits consumed as real OpenRouter/Whisper cost × markup), and add a 1% platform application fee on estimate payments — every billing parameter configurable from the super-admin panel. Sources: [SEED-035](seeds/SEED-035-credit-based-subscription-billing.md), [SEED-036](seeds/SEED-036-estimate-payment-platform-fee.md).

> **Locked decisions (from design sessions 2026-06-24):**
> - **Stripe is the rail, the credit ledger is OURS** — Stripe Billing charges the recurring subscription + one-time top-ups; the credit metering lives in our `credit_ledger`, NOT Stripe metered billing. Founder is US-based with EIN + Stripe.
> - **Hybrid credit model** — backend debits `real_cost × markup` (margin-safe by construction); frontend shows a simple credit balance ("≈ an estimate = 10–15 credits"), never token math. Denomination: 1 credit = $0.01 of charged AI value.
> - **Markup target 4.5x** (~75–80% margin); grant sized so the real OpenRouter cost of the FULL monthly grant is ≤ ~30% of the subscription price (power-user at 100% still profits).
> - **Consumption rule** — debit wherever WE spend AI (the points already in `usage_events`); MCP external-assistant conversation = zero credit; lightweight web-chat conversation absorbed.
> - **Overage = top-up** (buy more credits) + upgrade prompt; no silent mid-job block.
> - **1% estimate application fee** via Direct Charges (owner stays merchant of record; Xtimator never custodies funds). Total payment-UI gating on Stripe-connected; clear fee disclosure at connection.
> - **Everything super-admin-configurable** via a new `billing_config` (the `ai_config`/`platform_integrations` pattern) — no hard-coded billing numbers, no env vars. The tenant only experiences the result.
> - **Calibrate before charging** — measure real cost in production with billing OFF; derive grant/markup/price from data.

## v1 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### Cost Capture (foundation)

- [x] **COST-01**: System captures the real USD cost of every OpenRouter AI call (today only tokens are captured for Langfuse) — OpenRouter now returns it automatically under `usage.cost` (USD, 1:1 credits); the `usage.include` request flag is deprecated/no-op and no `/api/v1/generation` round-trip is needed (per Phase-110 RESEARCH, verified against current OpenRouter docs).
- [x] **COST-02**: System computes Whisper/STT cost from audio minutes × a configurable rate (cost not returned by the provider).
- [x] **COST-03**: Real cost per AI operation is recorded and correlated to the existing attempt/usage instrumentation (`usage_events`/`pipeline_events`), available for calibration analysis.

### Credit Ledger & Consumption

- [x] **CREDIT-01**: A tenant-scoped append-only `credit_ledger` records every credit movement (grant, debit, topup, adjust) with real cost, markup, and resulting balance.
- [x] **CREDIT-02**: Each AI operation already instrumented in `usage_events` (`estimate`, `photo_batch`, `audio_minutes`, `price_research`) debits credits = `real_cost × markup`.
- [x] **CREDIT-03**: A company's current credit balance is derivable from the ledger with a fast-read path (cached balance, reconcilable to the ledger).
- [x] **CREDIT-04**: Each subscription tier grants a configurable monthly credit allowance (`monthlyCreditGrant` on entitlements).
- [x] **CREDIT-05**: Before an AI operation, the system checks credit balance; insufficient balance surfaces a top-up path rather than hard-failing mid-flow where avoidable.
- [x] **CREDIT-06**: Credit debits are idempotent (reuse the existing `recordUsage` idempotency) — a retried operation never double-charges.
- [x] **CREDIT-07**: Operations that do not spend our AI budget never debit credits (MCP external-assistant conversation = zero credit; lightweight web-chat conversation absorbed), enforced by metering at the point of real spend.

### Super-Admin Billing Config

- [x] **BILLCFG-01**: A `billing_config` section in the encrypted runtime-config store (`platform_integrations`/`ai_config` pattern) holds all billing parameters — no hard-coded values, no env vars.
- [x] **BILLCFG-02**: A super-admin "Billing" panel edits markup, credit denomination, per-tier monthly grant, subscription prices, top-up packs, Whisper rate, fee %, low-balance thresholds — applied at runtime without deploy.
- [x] **BILLCFG-03**: All billing logic (`recordAICost`/`checkCredits`/grant/fee) reads parameters from `billing_config` at runtime; the business owner (tenant) has no access to these controls.

### Subscription & Top-Up Rail (Stripe)

- [x] **TOPUP-01**: On `invoice.paid` for a subscription, the system grants the tier's monthly credit allowance to the company's ledger, idempotently (via the existing `stripe_processed_events`).
- [x] **TOPUP-02**: A company can buy a one-time credit top-up pack via Stripe checkout; the paid webhook credits the ledger.
- [x] **TOPUP-03**: When credits run low or hit zero, the company is offered top-up (and an upgrade suggestion when the usage pattern justifies it) — generation is not silently blocked mid-job.

### Estimate Payment Platform Fee

- [x] **FEE-01**: The Stripe Connect invoice path (`lib/billing/invoice-service.ts`) charges a platform `application_fee_amount` (the deliberately omitted hook at line 17), routing the fee to the Xtimator platform account.
- [x] **FEE-02**: The Phase-70 estimate checkout path charges the same platform fee via `payment_intent_data.application_fee_amount`.
- [x] **FEE-03**: The fee percentage is read from `billing_config` (super-admin, default 1%) — never hard-coded.
- [x] **FEE-04**: The fee is computed on the amount actually charged (deposit or full total), with a sane minimum/rounding so Stripe never receives an invalid (e.g. $0) fee.

### Payment UI Gating

- [x] **PAYGATE-01**: A single `usePaymentsEnabled` guard gates all payment UI; every payment page, screen, button, and element renders only when the company's Stripe Connect status is `active`.
- [x] **PAYGATE-02**: With Stripe disconnected, no payment-related element appears anywhere (no orphan) and the product otherwise works fully; both states are covered by tests.

### Fee Disclosure

- [x] **DISCLOSE-01**: The Stripe connection flow shows a clear disclosure that Xtimator charges the platform fee (e.g. 1%), separate from Stripe's fees, with the live percentage read from `billing_config`.

### Credit Balance UX (owner-facing)

- [ ] **CREDITUI-01**: The business owner sees a simple credit balance (header/settings) with consumption history and rough per-action guidance — never token math.
- [ ] **CREDITUI-02**: Low-balance and zero-balance states show a warning and a top-up/upgrade CTA, reusing the existing threshold-notification path.

### Calibration & Transition

- [x] **CALIB-01**: Cost capture can run in production in measure-only mode (instrumented, no charging) so real per-operation cost is collected before any billing is enabled.
- [ ] **CALIB-02**: Grant/markup/price are derived from measured real cost and satisfy the margin invariant (real cost of the full monthly grant ≤ ~30% of the subscription price), documented.
- [x] **MIG-01**: Credits run in parallel with the existing count-based tiers during transition; no existing account breaks, and the count-based limits degrade to secondary guard-rails.

## v2 Requirements

Deferred to a future milestone. Tracked but not in this roadmap.

### Granular Billing

- **GRAN-01**: Per-operation-type markup (e.g. research markup ≠ generation markup).
- **GRAN-02**: Per-tier fee differentiation (e.g. Free 2%, Business 0.5%).
- **GRAN-03**: Credit rollover for unused balance (current decision: no rollover — expire at cycle end).
- **GRAN-04**: Platform transactional-revenue reporting dashboard (how much 1% fee accrued per period).
- **GRAN-05**: `refund_application_fee` policy when an owner refunds a customer.

## Out of Scope

| Feature | Reason |
|---------|--------|
| Stripe metered/usage-based billing for credits | The credit ledger is OURS; tying it to a gateway's metered billing makes us hostage to that gateway |
| Platform custodying funds (Destination Charges) | Owner stays merchant of record; custody brings chargeback liability + money-transmitter exposure (Option B rejected) |
| Charging real money before calibration | Must measure real cost in production first; charging on guessed numbers risks margin |
| Switching off Stripe entirely | Founder is US-based with EIN + Stripe; Stripe is the rail (only the credit logic is ours) |
| Model Complexity Gate (SEED-031) | Dormant optimization; synergistic with margin but not required for this milestone |
| Owner-editable billing parameters | Billing config is super-admin only; the tenant only experiences the result |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| COST-01 | Phase 110 | Complete |
| COST-02 | Phase 110 | Complete |
| COST-03 | Phase 110 | Complete |
| CREDIT-01 | Phase 112 | Complete |
| CREDIT-02 | Phase 112 | Complete |
| CREDIT-03 | Phase 112 | Complete |
| CREDIT-04 | Phase 112 | Complete |
| CREDIT-05 | Phase 112 | Complete |
| CREDIT-06 | Phase 112 | Complete |
| CREDIT-07 | Phase 112 | Complete |
| BILLCFG-01 | Phase 111 | Complete |
| BILLCFG-02 | Phase 111 | Complete |
| BILLCFG-03 | Phase 111 | Complete |
| TOPUP-01 | Phase 113 | Complete |
| TOPUP-02 | Phase 113 | Complete |
| TOPUP-03 | Phase 113 | Complete |
| FEE-01 | Phase 114 | Complete |
| FEE-02 | Phase 114 | Complete |
| FEE-03 | Phase 114 | Complete |
| FEE-04 | Phase 114 | Complete |
| PAYGATE-01 | Phase 114 | Complete |
| PAYGATE-02 | Phase 114 | Complete |
| DISCLOSE-01 | Phase 114 | Complete |
| CREDITUI-01 | Phase 115 | Pending |
| CREDITUI-02 | Phase 115 | Pending |
| CALIB-01 | Phase 110 | Complete |
| CALIB-02 | Phase 116 | Pending |
| MIG-01 | Phase 113 | Complete |

**Coverage:**
- v1 requirements: 28 total
- Mapped to phases: 28
- Unmapped: 0 ✓ (all v1 requirements mapped to phases 110-116)

---
*Requirements defined: 2026-06-24*
*Last updated: 2026-06-24 — milestone v4.7 Monetização roadmap created; all 28 v1 requirements mapped to phases 110-116 (coverage 28/28, 0 orphans)*
