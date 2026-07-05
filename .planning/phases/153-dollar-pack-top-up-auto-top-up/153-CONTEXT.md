# Phase 153: Dollar-Pack Top-Up + Auto-Top-Up - Context

**Gathered:** 2026-07-05
**Status:** Ready for planning
**Mode:** Autonomous run (discuss skipped per explicit user authorization to execute unattended). This is the riskiest phase in the milestone (real money charged automatically) — decisions below are deliberately conservative and specific.

<domain>
## Phase Boundary

Buying more credits becomes a "$20/$50/$100" choice (CREDITUI-06) instead of a credit-quantity choice, and the tenant can optionally enable auto-top-up (CREDITUI-07) so a low balance is refilled automatically via their saved payment method. This phase builds on Phase 152's progress-bar surface (the top-up entry point sits next to/below the bar) and the EXISTING Stripe one-time top-up rail (Phase 113) + `billing_config` (Phase 111). Does not touch the subscription checkout, seat billing, or annual billing paths.

</domain>

<decisions>
## CREDITUI-06 — Dollar-pack top-up (the light lift)

The existing route `app/api/billing/create-topup-session/route.ts` (Phase 113) ALREADY does everything correctly: server-side pack lookup by `packIndex` (never trusts client-sent price/credits), inline Stripe `price_data`, metadata-driven webhook grant. **Do not rewrite this route.** The only real changes:

1. **`lib/billing/billing-config.ts` `DEFAULT_BILLING_CONFIG.topUpPacks`**: change the values to three packs priced at exactly $20 / $50 / $100 (`priceCents: 2000/5000/10000`). Credits-per-pack are a CALIBRATE-BEFORE-CHARGING placeholder like every other number in this file (see the file's own existing comments on `tiers`/`seatPriceCents`) — pick round numbers roughly consistent with the existing packs' ~$0.012-0.015/credit ratio (e.g. ~1300/3500/7500 credits — Claude's/researcher's discretion on the exact figures, they are NOT final pricing).
2. **New pack-picker UI** replacing the single hardcoded `<TopUpButton packIndex={0}>` currently in `credit-balance-card.tsx`: a 3-card row, one per configured pack, showing the DOLLAR AMOUNT as the primary label (`$20`, not `1300 credits`) — mirror `components/billing/tier-card.tsx`'s visual language (Card, big price line, CTA button) since that is the established "pick one of N priced options" pattern in this codebase, not a new design. `TopUpButton` itself (the fetch+redirect logic) can stay as the underlying action per card, just parameterized by `packIndex` and re-labeled.
3. Read `getBillingConfig().topUpPacks` server-side wherever the pack labels are rendered — never hardcode "$20" as a literal string disconnected from the actual configured `priceCents` (the label must be DERIVED from `priceCents`, matching the SEED-035 "everything configurable" principle already enforced for annual pricing's derived discount %).

## CREDITUI-07 — Auto-top-up (the real new capability — be conservative)

This is genuinely new: nothing today charges a saved card automatically. Lock these safety-first architectural choices before implementation:

1. **Platform-wide kill switch first.** Add `billing_config.autoTopupEnabled: boolean` (default `false`) — mirrors the existing `enforcementEnabled` pattern exactly. The tenant-facing "Enable auto-top-up" toggle only renders/functions when this is `true`. This gives the owner a single super-admin switch to disable the entire feature instantly without a deploy if something goes wrong, on top of each tenant's own opt-in.
2. **Per-company settings — new nullable columns on `companies`** (mirrors how `demo_estimate_quota`/`ai_model_override`/`byok_enabled` already live as simple columns, not a new table): something like `auto_topup_enabled boolean not null default false`, `auto_topup_threshold_credits integer`, `auto_topup_pack_index smallint`. Exact names/types are the researcher's/planner's call, but they MUST default to fully-off (`false`/`null`) so every existing company is unaffected (retrocompat, same posture as every prior billing phase in this project).
3. **Saved payment method.** Reuse Stripe's existing customer (`company.stripe_customer_id` already exists and is already used by `create-topup-session`). Auto-charging needs a payment method saved OUTSIDE a live checkout session — research the cleanest mechanism (a Stripe Checkout session with `mode:'setup'`, or `payment_method_collection` on the subscription checkout, or the Stripe Customer Portal's card-management flow that may already be reachable via the existing `create-portal-session` route) rather than inventing a custom card-collection form — **never build a raw card-number input; Stripe Elements/Checkout only.**
4. **Charge via off-session PaymentIntent** (`stripe.paymentIntents.create({customer, payment_method, off_session:true, confirm:true, ...})`), NOT a new Checkout Session (checkout requires an active browser tab; auto-top-up must fire from server-side code with nobody looking at a browser).
5. **Trigger point: hook into the EXISTING low-balance detection**, not a new polling cron. `lib/billing/credit-ledger.ts` already has a `notifyLowCreditBalance` hook fired from `recordCreditDebit` (Phase 115, CREDITUI-02) every time a debit crosses a `lowBalanceThresholds` boundary — extend that SAME call site: after the existing low-balance notification logic, if `company.auto_topup_enabled && balance < auto_topup_threshold_credits`, fire the off-session charge. Do not add a second cron/webhook path that duplicates this detection.
6. **Idempotency / race safety (load-bearing — this is the riskiest single detail in the milestone).** Two debits could cross the threshold concurrently (e.g. WhatsApp + web hitting the same company near-simultaneously) and both try to auto-charge. Mirror the project's established idempotency-key convention (`grant:{companyId}:{YYYY-MM}` style, Phase 142/ANN-02) — use something like `autotopup:{companyId}:{isoDateOrLedgerEventId}` as the PaymentIntent's `idempotency_key` AND/OR gate the charge attempt behind an atomic DB check (e.g. an `auto_topup_in_flight_until` timestamp column, set with a conditional `UPDATE ... WHERE auto_topup_in_flight_until IS NULL OR auto_topup_in_flight_until < now()`) so a second concurrent debit cannot also fire a charge while the first is still in flight. Research the cleanest correct primitive; do not ship this without SOME concurrency guard — a double-charge is a real customer-trust incident, not a cosmetic bug.
7. **Failure handling:** if the off-session charge fails (card declined, `authentication_required`, etc.), do NOT retry silently in a loop — log it (reuse `lib/observability/ops-alert.ts`'s `notifyOps` if the failure rate looks systemic, or at minimum the existing admin audit log) and let the tenant see a "auto-top-up failed, update your payment method" state next time they view the low-balance surface. Do not block estimate generation on this failure — auto-top-up is a convenience, not a gate.
8. **UI home:** the auto-top-up settings (enable toggle, threshold, pack choice, saved card display) live on the SAME Settings > Plans surface as the manual top-up cards from CREDITUI-06 — mirror the visual shape of Anthropic Console's own Auto Top-Up card (a settings card showing "Auto top-up is enabled and will add $X when your balance drops below $Y", with a "Manage" affordance opening the threshold/amount/payment-method controls) that the owner referenced when planting the seed for this milestone.

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- [`app/api/billing/create-topup-session/route.ts`](../../../app/api/billing/create-topup-session/route.ts) — the EXISTING one-time top-up checkout route; unmodified for CREDITUI-06, becomes the manual-charge half of what CREDITUI-07 needs to mirror (off-session instead of a live session).
- [`app/api/billing/create-portal-session/route.ts`](../../../app/api/billing/create-portal-session/route.ts) — check whether the Stripe Customer Portal already exposes card management that could shortcut the "save a payment method outside checkout" need.
- [`components/billing/tier-card.tsx`](../../../components/billing/tier-card.tsx) + `tier-cards-grid.tsx` — the established "3-card priced-option picker" visual pattern to mirror for the new top-up pack picker.
- [`lib/billing/credit-ledger.ts`](../../../lib/billing/credit-ledger.ts) — `recordCreditDebit`'s existing `notifyLowCreditBalance` hook (CREDITUI-02) — the exact call site to extend for the auto-top-up trigger.
- [`lib/billing/billing-config.ts`](../../../lib/billing/billing-config.ts) — `enforcementEnabled`'s exact pattern to mirror for the new `autoTopupEnabled` platform kill switch.
- Phase 142/ANN-02's `grant:{companyId}:{YYYY-MM}` idempotency-key convention — the pattern to mirror for the auto-top-up charge key.

### Established Patterns
- Every new billing number is a `billing_config` field, never a code constant (SEED-035 principle 6, honored by every phase so far).
- Stripe interactions never trust client-supplied price/amount — always look up server-side by an index/id (Pitfall 4, already enforced in `create-topup-session`).

</code_context>

<specifics>
## Specific Ideas

The owner explicitly referenced Anthropic Console's own "Auto Top-Up" settings card and modal (payment-method list with a primary + backups, "When credits are below: $__", "Purchase this amount: $__") as the literal visual/UX target when planting this milestone's seed — mirror that shape (threshold + amount, both in dollars, a payment-method affordance), not a bespoke design.

</specifics>

<deferred>
## Deferred Ideas

- Free-entry custom top-up amount beyond the 3 configured packs (CREDITUIX-01, v2).
- Multiple/backup payment methods for auto-top-up (Anthropic's UI shows up to 3; v1 here can ship with a single saved default payment method — Claude's discretion to add backup-method support if genuinely low-cost during implementation, but not required).

</deferred>
