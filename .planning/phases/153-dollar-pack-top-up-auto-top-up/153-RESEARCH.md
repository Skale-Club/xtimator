# Phase 153: Dollar-Pack Top-Up + Auto-Top-Up - Research

**Researched:** 2026-07-05
**Domain:** Stripe off-session charging (PaymentIntents + SetupIntents), Next.js server routes, Supabase-backed idempotency/concurrency control
**Confidence:** HIGH (codebase patterns, installed SDK verified directly) / MEDIUM (Stripe off-session edge-case behavior, verified against installed type defs but not a live Stripe sandbox run)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**CREDITUI-06 — Dollar-pack top-up (the light lift)**

The existing route `app/api/billing/create-topup-session/route.ts` (Phase 113) ALREADY does everything correctly: server-side pack lookup by `packIndex` (never trusts client-sent price/credits), inline Stripe `price_data`, metadata-driven webhook grant. **Do not rewrite this route.** The only real changes:

1. **`lib/billing/billing-config.ts` `DEFAULT_BILLING_CONFIG.topUpPacks`**: change the values to three packs priced at exactly $20 / $50 / $100 (`priceCents: 2000/5000/10000`). Credits-per-pack are a CALIBRATE-BEFORE-CHARGING placeholder like every other number in this file (see the file's own existing comments on `tiers`/`seatPriceCents`) — pick round numbers roughly consistent with the existing packs' ~$0.012-0.015/credit ratio (e.g. ~1300/3500/7500 credits — Claude's/researcher's discretion on the exact figures, they are NOT final pricing).
2. **New pack-picker UI** replacing the single hardcoded `<TopUpButton packIndex={0}>` currently in `credit-balance-card.tsx`: a 3-card row, one per configured pack, showing the DOLLAR AMOUNT as the primary label (`$20`, not `1300 credits`) — mirror `components/billing/tier-card.tsx`'s visual language (Card, big price line, CTA button) since that is the established "pick one of N priced options" pattern in this codebase, not a new design. `TopUpButton` itself (the fetch+redirect logic) can stay as the underlying action per card, just parameterized by `packIndex` and re-labeled.
3. Read `getBillingConfig().topUpPacks` server-side wherever the pack labels are rendered — never hardcode "$20" as a literal string disconnected from the actual configured `priceCents` (the label must be DERIVED from `priceCents`, matching the SEED-035 "everything configurable" principle already enforced for annual pricing's derived discount %).

**CREDITUI-07 — Auto-top-up (the real new capability — be conservative)**

This is genuinely new: nothing today charges a saved card automatically. Lock these safety-first architectural choices before implementation:

1. **Platform-wide kill switch first.** Add `billing_config.autoTopupEnabled: boolean` (default `false`) — mirrors the existing `enforcementEnabled` pattern exactly. The tenant-facing "Enable auto-top-up" toggle only renders/functions when this is `true`. This gives the owner a single super-admin switch to disable the entire feature instantly without a deploy if something goes wrong, on top of each tenant's own opt-in.
2. **Per-company settings — new nullable columns on `companies`** (mirrors how `demo_estimate_quota`/`ai_model_override`/`byok_enabled` already live as simple columns, not a new table): something like `auto_topup_enabled boolean not null default false`, `auto_topup_threshold_credits integer`, `auto_topup_pack_index smallint`. Exact names/types are the researcher's/planner's call, but they MUST default to fully-off (`false`/`null`) so every existing company is unaffected (retrocompat, same posture as every prior billing phase in this project).
3. **Saved payment method.** Reuse Stripe's existing customer (`company.stripe_customer_id` already exists and is already used by `create-topup-session`). Auto-charging needs a payment method saved OUTSIDE a live checkout session — research the cleanest mechanism (a Stripe Checkout session with `mode:'setup'`, or `payment_method_collection` on the subscription checkout, or the Stripe Customer Portal's card-management flow that may already be reachable via the existing `create-portal-session` route) rather than inventing a custom card-collection form — **never build a raw card-number input; Stripe Elements/Checkout only.**
4. **Charge via off-session PaymentIntent** (`stripe.paymentIntents.create({customer, payment_method, off_session:true, confirm:true, ...})`), NOT a new Checkout Session (checkout requires an active browser tab; auto-top-up must fire from server-side code with nobody looking at a browser).
5. **Trigger point: hook into the EXISTING low-balance detection**, not a new polling cron. `lib/billing/credit-ledger.ts` already has a `notifyLowCreditBalance` hook fired from `recordCreditDebit` (Phase 115, CREDITUI-02) every time a debit crosses a `lowBalanceThresholds` boundary — extend that SAME call site: after the existing low-balance notification logic, if `company.auto_topup_enabled && balance < auto_topup_threshold_credits`, fire the off-session charge. Do not add a second cron/webhook path that duplicates this detection.
6. **Idempotency / race safety (load-bearing — this is the riskiest single detail in the milestone).** Two debits could cross the threshold concurrently (e.g. WhatsApp + web hitting the same company near-simultaneously) and both try to auto-charge. Mirror the project's established idempotency-key convention (`grant:{companyId}:{YYYY-MM}` style, Phase 142/ANN-02) — use something like `autotopup:{companyId}:{isoDateOrLedgerEventId}` as the PaymentIntent's `idempotency_key` AND/OR gate the charge attempt behind an atomic DB check (e.g. an `auto_topup_in_flight_until` timestamp column, set with a conditional `UPDATE ... WHERE auto_topup_in_flight_until IS NULL OR auto_topup_in_flight_until < now()`) so a second concurrent debit cannot also fire a charge while the first is still in flight. Research the cleanest correct primitive; do not ship this without SOME concurrency guard — a double-charge is a real customer-trust incident, not a cosmetic bug.
7. **Failure handling:** if the off-session charge fails (card declined, `authentication_required`, etc.), do NOT retry silently in a loop — log it (reuse `lib/observability/ops-alert.ts`'s `notifyOps` if the failure rate looks systemic, or at minimum the existing admin audit log) and let the tenant see a "auto-top-up failed, update your payment method" state next time they view the low-balance surface. Do not block estimate generation on this failure — auto-top-up is a convenience, not a gate.
8. **UI home:** the auto-top-up settings (enable toggle, threshold, pack choice, saved card display) live on the SAME Settings > Plans surface as the manual top-up cards from CREDITUI-06 — mirror the visual shape of Anthropic Console's own Auto Top-Up card (a settings card showing "Auto top-up is enabled and will add $X when your balance drops below $Y", with a "Manage" affordance opening the threshold/amount/payment-method controls) that the owner referenced when planting the seed for this milestone.

### Claude's Discretion
- Exact credits-per-pack numbers (CALIBRATE-BEFORE-CHARGING placeholders, not final pricing).
- Exact column names/types for the new `companies` auto-top-up columns.
- Exact concurrency-guard primitive (idempotency key vs. in-flight column vs. both).
- Whether to add backup-payment-method support (explicitly optional, see Deferred).

### Deferred Ideas (OUT OF SCOPE)
- Free-entry custom top-up amount beyond the 3 configured packs (CREDITUIX-01, v2).
- Multiple/backup payment methods for auto-top-up (Anthropic's UI shows up to 3; v1 here can ship with a single saved default payment method — Claude's discretion to add backup-method support if genuinely low-cost during implementation, but not required).
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CREDITUI-06 | Tenant purchases additional credits by choosing a dollar amount ($20/$50/$100, sizes configurable in `billing_config`) rather than a credit quantity; charged via Stripe one-time checkout and converted to credits using existing markup/denomination. | `billing-config.ts` change (3 packs), `topup-pack-card.tsx`/`topup-packs-grid.tsx` new components mirroring `tier-card.tsx`/`tier-cards-grid.tsx`, `top-up-button.tsx` parameterization (label prop), zero changes to `create-topup-session/route.ts` or the webhook grant arm. |
| CREDITUI-07 | Tenant can enable auto-top-up — when balance drops below a configurable dollar threshold, the configured dollar pack purchases automatically against saved default payment method, mirroring Anthropic Console's Auto Top-Up UX. | New `companies` columns, `billing_config.autoTopupEnabled` kill switch, `mode:'setup'` Checkout Session (or Billing Portal `payment_method_update` feature) for card capture, off-session `paymentIntents.create({customer, payment_method, off_session:true, confirm:true})`, extension of `notifyLowCreditBalance` call site in `recordCreditDebit`, idempotency key + DB-level in-flight guard, failure surfacing via `notifyOps`/admin audit log + UI alert. |
</phase_requirements>

## Summary

This phase is two very differently-shaped pieces of work bolted onto the same settings surface. **CREDITUI-06** is nearly zero-risk: the Phase 113 top-up checkout route (`create-topup-session/route.ts`) already does exactly the right thing (server-side pack lookup, inline `price_data`, metadata-driven webhook grant) and per CONTEXT.md must NOT be touched. The only work is a config value change (3 packs at $20/$50/$100) and a new 3-card picker UI that mirrors the existing `tier-card.tsx`/`tier-cards-grid.tsx` pattern almost verbatim — this part is UI composition, not new backend logic, and the approved UI-SPEC.md already specifies the exact component names, copy, and visual treatment.

**CREDITUI-07** is the real engineering. Nothing in this codebase today charges a saved card without a live browser tab, so this phase introduces the project's first off-session PaymentIntent flow. Three sub-problems must all be solved correctly: (1) capturing a reusable payment method outside a live checkout — a Stripe Checkout Session with `mode:'setup'` is the cleanest mechanism (confirmed available in the installed `stripe@22.1.1` SDK; the existing Billing Portal route lacks an explicit `Configuration`, so its `payment_method_update` availability depends on Stripe Dashboard defaults, not code — flagged as an environment check, not a pure code decision); (2) firing the actual off-session charge via `paymentIntents.create({customer, payment_method, off_session: true, confirm: true, error_on_requires_action: true, ...})`, all confirmed present in the installed SDK's type definitions; and (3) preventing a double-charge when two debits cross the threshold concurrently — this project has no existing primitive for "gate a side-effecting action behind an atomic per-company lock" (the existing idempotency pattern is Stripe-event-ID-based or content-hash-based, both post-hoc dedup, not a pre-emptive lock), so this phase must introduce a new atomic-UPDATE-based in-flight guard, which should also be combined with the existing idempotency-key convention for defense in depth.

**Primary recommendation:** Leave `create-topup-session/route.ts` untouched; add the 3 dollar packs to `billing-config.ts`; build the picker UI as directly specified in `153-UI-SPEC.md`; implement auto-top-up as a new `lib/billing/auto-topup.ts` module (mirroring `credit-ledger.ts`'s never-throw, best-effort style) that is called from the existing `notifyLowCreditBalance` call site in `recordCreditDebit`, gated by both the platform kill switch and an atomic `auto_topup_in_flight_until` column update, using `mode:'setup'` Checkout for card capture and `paymentIntents.create({off_session:true, confirm:true})` for the actual charge.

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| stripe (Node SDK) | 22.1.1 (installed, per `package.json`; `node_modules` resolved 22.3.0 — same v22 major, compatible) | PaymentIntents, SetupIntents, Checkout Sessions, Customers, Billing Portal | Already the project's sole payment integration; `getStripeClient()` is the established per-request client factory (never `new Stripe()` at module scope) |

**Version verification:** `npm view stripe version` failed in this sandboxed environment (no registry access), but the installed package was verified directly: `node_modules/stripe/package.json` reports `22.1.1`; `package.json` pins `"stripe": "^22.1.1"`. All required methods (`paymentIntents.create`, `setupIntents.create`, `checkout.sessions.create` with `mode:'setup'`, `customers.retrieve`, `customers.listPaymentMethods`, `paymentMethods.list`) were confirmed to exist at runtime via a local Node script instantiating the SDK, and the exact parameter shapes (`off_session`, `confirm`, `error_on_requires_action`, `customer`, `payment_method`, Checkout `mode: 'setup'`) were confirmed present in the shipped `.d.ts` type definitions (`node_modules/stripe/cjs/resources/PaymentIntents.d.ts` line ~2517-2600; `node_modules/stripe/cjs/resources/Checkout/Sessions.d.ts` line ~537, 2518). **Confidence: HIGH** — verified against the actual installed artifact, not training-data recall.

### Supporting
No new libraries needed. Everything required (Stripe SDK, Supabase service client, `sonner` toasts, shadcn/radix components) is already installed and used elsewhere in `lib/billing/*` and `components/billing/*`.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `mode:'setup'` Checkout Session for card capture | Billing Portal's `payment_method_update` feature (via existing `create-portal-session` route) | Portal is one click shorter (no separate setup-session route needed) IF the Stripe Dashboard's default portal Configuration has `payment_method_update` enabled — but that's a Stripe Dashboard setting, not something this codebase's `create-portal-session/route.ts` explicitly configures today (it calls `stripe.billingPortal.sessions.create({customer, return_url})` with no `configuration` param, so it inherits whatever the *default* Configuration on the Stripe account has). A dedicated `mode:'setup'` Checkout Session is self-contained, requires zero Stripe Dashboard configuration, and matches the "successfully returns to our own success_url with a known session id" pattern already used by `create-topup-session`. **Recommendation: use `mode:'setup'` Checkout**, but flag the Portal route as a possible secondary "manage payment method" entry point once a payment method already exists (lower engineering cost for the "update" case, since portal already exists and works today for subscription management).
| SetupIntent created directly (`stripe.setupIntents.create({customer, usage:'off_session'})`) + Stripe Elements client-side | `mode:'setup'` Checkout Session | CONTEXT.md explicitly says "never build a raw card-number input; Stripe Elements/Checkout only" — a raw SetupIntent + Elements requires building/loading `@stripe/stripe-js` + `@stripe/react-stripe-js` (NOT currently installed in this project) and a client-side card form. Checkout Session in `mode:'setup'` needs zero new dependencies and zero new client-side card UI — it's a redirect, exactly like the existing top-up and subscription checkout flows. **Recommendation: Checkout `mode:'setup'`, not raw Elements** — avoids a new dependency and matches the existing "redirect to Stripe-hosted page" pattern used everywhere else in this codebase. |
| Atomic in-flight DB column | Redis-based distributed lock (`lib/redis.ts` already exists, used by `ops-alert.ts`'s dedupe) | Redis SETNX would work and this project already has `getRedis()` with fail-open semantics — but `ops-alert.ts`'s Redis usage explicitly fails OPEN (proceeds if Redis is down), which is the wrong failure mode for a payment-double-charge guard (you want ambiguity to favor NOT double-charging, i.e. fail CLOSED). A Postgres conditional `UPDATE ... WHERE auto_topup_in_flight_until IS NULL OR ... < now() RETURNING id` is atomic, needs no new infra, fails closed (if the UPDATE affects 0 rows, the lock wasn't acquired — do not charge), and mirrors the existing `23505`-swallow / partial-unique-index idempotency convention already used throughout `credit-ledger.ts`. **Recommendation: Postgres atomic UPDATE, not Redis** — correctness > latency for a once-per-threshold-crossing operation. |

**Installation:**
No new packages required.

## Architecture Patterns

### Recommended Project Structure
```
lib/billing/
├── billing-config.ts        # existing — add autoTopupEnabled + 3 topUpPacks (MODIFY)
├── credit-ledger.ts         # existing — notifyLowCreditBalance call site extended (MODIFY, small)
├── auto-topup.ts            # NEW — off-session charge orchestration, in-flight guard, failure logging
├── stripe-client.ts         # existing — unchanged
app/api/billing/
├── create-topup-session/route.ts       # existing — UNCHANGED per CONTEXT.md decision
├── create-portal-session/route.ts      # existing — unchanged (or reused as secondary "update card" entry)
├── create-autotopup-setup-session/route.ts   # NEW — mode:'setup' Checkout Session for card capture
├── auto-topup-settings/route.ts        # NEW (or a server action) — save threshold/pack/enabled
app/api/webhooks/stripe/route.ts        # existing — add checkout.session.completed arm for mode:'setup' (attach default payment method) + optionally payment_intent.payment_failed handling for observability
components/billing/
├── tier-card.tsx             # existing pattern to mirror — unchanged
├── top-up-button.tsx         # existing — add `label` prop (small MODIFY per UI-SPEC)
├── topup-pack-card.tsx       # NEW
├── topup-packs-grid.tsx      # NEW
├── credit-balance-card.tsx   # existing — MODIFY: warning CTA becomes "Top up now" link, not inline TopUpButton
├── auto-topup-card.tsx       # NEW
├── auto-topup-dialog.tsx     # NEW
supabase/migrations/
├── 2026XXXXXXXXXX_phase153_auto_topup_columns.sql   # NEW — companies columns
```

### Pattern 1: Off-session charge as a best-effort, never-throw module (mirrors `credit-ledger.ts`)
**What:** Every function that touches money in this codebase (`recordCreditDebit`, `grantCredits`, `reconcileBalance`) follows the same shape: wrapped in try/catch, swallows failures with `console.warn`, never throws out to the caller, because the caller (a debit inside estimate generation) must never be blocked by a billing side-effect failing.
**When to use:** The new `triggerAutoTopupIfNeeded()` function (called from `recordCreditDebit`'s existing `notifyLowCreditBalance` call site) MUST follow this exact shape — a Stripe API error, a DB lock-acquisition miss, or a network blip must never propagate up into the credit-debit path that triggered it.
**Example:**
```typescript
// Source: lib/billing/credit-ledger.ts (existing pattern, lines 141-151)
void notifyLowCreditBalance({
  companyId: input.companyId,
  userId: null,
  previousBalance: current,
  newBalance: balanceAfter,
  thresholds: cfg.lowBalanceThresholds,
})
// NEW call site to add directly after, same fire-and-forget `void` shape:
void triggerAutoTopupIfNeeded({
  companyId: input.companyId,
  newBalance: balanceAfter,
})
```

### Pattern 2: Atomic in-flight guard via conditional UPDATE ... RETURNING
**What:** Postgres-native mutual exclusion without new infrastructure. A single `UPDATE companies SET auto_topup_in_flight_until = now() + interval '2 minutes' WHERE id = $1 AND (auto_topup_in_flight_until IS NULL OR auto_topup_in_flight_until < now()) RETURNING id` either returns exactly one row (lock acquired — proceed to charge) or zero rows (another request already holds the lock — skip, do not charge). This is atomic at the Postgres row level; two concurrent requests racing this UPDATE will have exactly one succeed.
**When to use:** Immediately before calling `stripe.paymentIntents.create({..., off_session: true, confirm: true})`. Release the lock (`auto_topup_in_flight_until = NULL`) in a `finally`-equivalent after the Stripe call resolves (success or failure) so a legitimately failed/declined charge doesn't leave the company permanently locked out of future auto-top-up attempts. Clear the lock proactively OR rely on the timestamp itself expiring (the `2 minutes` TTL) as a self-healing backstop if the process crashes mid-charge — the TTL approach is safer here since Stripe API calls can occasionally hang and a crashed Next.js serverless function will never run a `finally`.
**Example:**
```typescript
// NEW pattern for this phase — no direct precedent in codebase, but modeled on
// the same idempotent-write discipline as credit-ledger.ts's PG_UNIQUE_VIOLATION
// swallow (23505) and its "read current balance, write, update cache" transaction shape.
const svc = requireServiceClient()
const { data: locked } = await svc
  .from('companies')
  .update({ auto_topup_in_flight_until: new Date(Date.now() + 2 * 60_000).toISOString() })
  .eq('id', companyId)
  .or('auto_topup_in_flight_until.is.null,auto_topup_in_flight_until.lt.' + new Date().toISOString())
  .select('id')
  .maybeSingle()
if (!locked) return // another concurrent debit already holds the lock — skip
try {
  // ... stripe.paymentIntents.create({ off_session: true, confirm: true, idempotency_key: ... })
} finally {
  await svc.from('companies').update({ auto_topup_in_flight_until: null }).eq('id', companyId)
}
```
**Caveat (MEDIUM confidence):** Supabase-js's `.or()` filter combined with `.eq()` in the same `.update()` chain needs to be verified for exact chaining syntax at implementation time — the existing codebase's `.update().eq()` calls are all single-condition; this is the first multi-condition conditional UPDATE in the project's Supabase usage. An alternative if `.or()` proves awkward: a Postgres RPC function (`supabase.rpc('acquire_autotopup_lock', { company_id })`) that runs the conditional UPDATE server-side in one round trip — this is more robust and matches how genuinely atomic guards are usually implemented with Supabase-js (the client library does not expose raw `UPDATE ... RETURNING` with confidence for compound WHERE clauses). Flagged in Open Questions.

### Pattern 3: `mode:'setup'` Checkout Session for reusable payment-method capture, mirroring `create-topup-session`'s structure
**What:** A new route `app/api/billing/create-autotopup-setup-session/route.ts` structured identically to `create-topup-session/route.ts` (auth check → demo guard → company lookup → Stripe client → session create → return `{url}`), but with `mode: 'setup'` instead of `mode: 'payment'`, no `line_items`, and `metadata: { type: 'autotopup_setup', companyId }` so the webhook can attach the resulting payment method.
**When to use:** Whenever the tenant clicks "Add payment method" in the auto-top-up dialog (per UI-SPEC's Component Inventory #3).
**Example:**
```typescript
// Source: Stripe Checkout Sessions API — mode:'setup' confirmed in installed SDK
// (node_modules/stripe/cjs/resources/Checkout/Sessions.d.ts line ~537, 2518:
//   type Mode = 'payment' | 'setup' | 'subscription')
const session = await stripe.checkout.sessions.create({
  mode: 'setup',
  customer: company.stripe_customer_id ?? undefined,
  success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?autotopup_setup=1`,
  cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?autotopup_setup=cancelled`,
  metadata: { type: 'autotopup_setup', companyId: company.id },
})
```
Webhook arm to add in `app/api/webhooks/stripe/route.ts`'s existing `checkout.session.completed` switch case (before the `credit_topup` early-break, following the exact same "check metadata.type first" branching already used there):
```typescript
// The completed setup session's `setup_intent` field carries the id;
// retrieve it to get the resulting payment_method, then set it as the
// customer's invoice_settings.default_payment_method AND persist locally.
if (session.metadata?.type === 'autotopup_setup' && session.setup_intent) {
  const setupIntent = await stripe.setupIntents.retrieve(session.setup_intent as string)
  if (setupIntent.payment_method) {
    await stripe.customers.update(session.customer as string, {
      invoice_settings: { default_payment_method: setupIntent.payment_method as string },
    })
  }
  break
}
```

### Pattern 4: Off-session charge call shape
**What:** The actual auto-top-up charge.
**Example:**
```typescript
// Source: node_modules/stripe/cjs/resources/PaymentIntents.d.ts (installed 22.1.1)
// confirmed fields: confirm, customer, off_session, error_on_requires_action, payment_method, metadata
const paymentIntent = await stripe.paymentIntents.create({
  amount: pack.priceCents,
  currency: 'usd',
  customer: company.stripe_customer_id,
  payment_method: defaultPaymentMethodId,
  off_session: true,
  confirm: true,
  error_on_requires_action: true, // fail cleanly instead of hanging on requires_action (SCA)
  metadata: { type: 'auto_topup', companyId: company.id, credits: String(pack.credits) },
}, {
  idempotencyKey: `autotopup:${company.id}:${ledgerEventRefId}`, // 2nd request header, not body param
})
```
**Important correction vs. CONTEXT.md's literal snippet:** `idempotency_key` is NOT a body parameter of `paymentIntents.create()` — it is passed as the SECOND argument (Stripe's request-options object: `{ idempotencyKey: '...' }`), consistent with every Stripe Node SDK method. CONTEXT.md's decision #6 describes the concept correctly but the call-site shape needs this correction at implementation time.
**Handling the synchronous failure:** `off_session:true` + `confirm:true` + `error_on_requires_action:true` means Stripe throws a `StripeCardError` (declined) or a `StripeInvalidRequestError` (e.g. `authentication_required`) synchronously on the `create()` call rather than returning a pending/`requires_action` PaymentIntent — this must be caught and handled as "auto-top-up failed," not treated as an unhandled exception.

### Anti-Patterns to Avoid
- **Building a raw card form / loading Stripe Elements:** CONTEXT.md explicitly forbids this. `@stripe/stripe-js` and `@stripe/react-stripe-js` are not installed in this project (confirmed: no such entries in `package.json`) — adding them would be new dependency surface for a use case the existing Checkout redirect pattern already solves.
- **A new cron/polling route to check balances:** CONTEXT.md explicitly forbids this (decision #5). The existing `app/api/cron/*` routes are for unrelated cleanup jobs (WhatsApp sessions, orphan projects) — do not add a third one for this.
- **Trusting client-supplied packIndex/amount for the auto-top-up charge:** Exactly like `create-topup-session`, the auto-top-up charge amount must be read server-side from `company.auto_topup_pack_index` → `getBillingConfig().topUpPacks[i]`, never trusted from any request body (there IS no live request for the actual charge — it's server-triggered — but the SAME discipline applies to the settings-save endpoint that sets `auto_topup_pack_index`: validate the index is in-range server-side before persisting).
- **Retrying a declined off-session charge in a loop:** CONTEXT.md explicitly forbids silent retry (decision #7). A single attempt per threshold-crossing event; failure surfaces to the tenant on next view, no automatic re-attempt.
- **Storing the raw idempotency key without tying it to a stable ledger event:** Using `Date.now()` or a random UUID as the idempotency key defeats its purpose (a serverless function retry would generate a NEW key and double-charge). The key must be derived from something stable across retries of the SAME logical event — the ledger row's `id` (once inserted) or the debit's `attemptId` is the right anchor, not a freshly generated value at charge time.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Card capture / storage | A custom card-number input + your own PCI-scope card storage | Stripe Checkout `mode:'setup'` (redirect) | CONTEXT.md explicit constraint; Stripe Checkout is PCI SAQ-A scope (Stripe hosts the card fields), a custom form would put this codebase in a much heavier PCI compliance scope for zero benefit |
| SCA / 3D-Secure handling | Custom retry/polling logic for `requires_action` PaymentIntents | `error_on_requires_action: true` + treat the thrown error as a clean failure | Off-session charges can legitimately require authentication the customer isn't present to complete; Stripe's own recommended pattern for "charge later" flows is to fail fast rather than attempt to resolve SCA server-side |
| Distributed lock / mutex | A new Redis-based locking library or hand-rolled semaphore | A single atomic Postgres `UPDATE ... WHERE <condition> RETURNING` (or a Postgres RPC function) | Postgres already guarantees row-level atomicity for a single UPDATE; no new infrastructure, no new failure mode (a Redis outage would otherwise become a new single point of failure for a payment safety guard) |
| Idempotent Stripe calls | Manually tracking "did I already call this" in application memory | Stripe's native `idempotencyKey` request option (`stripe.paymentIntents.create(params, { idempotencyKey })`) | Stripe deduplicates identical requests with the same key server-side for 24h — this is the correct primitive for "this exact charge attempt must not double-fire even across a client retry," complementing (not replacing) the DB-level in-flight guard which prevents two DIFFERENT logical events from both attempting a charge concurrently |

**Key insight:** This phase's risk is entirely in composition, not in any single primitive being hard — Stripe already provides every safety primitive needed (Checkout for card capture, idempotency keys for request dedup, `off_session`/`confirm` for the actual charge). The engineering discipline required is making sure the DB-level in-flight guard (prevents two *different* threshold-crossing events from racing) and the Stripe-level idempotency key (prevents the *same* event from double-firing on retry) are both present — they solve different halves of the concurrency problem and neither alone is sufficient.

## Common Pitfalls

### Pitfall 1: Confusing the webhook's `checkout.session.completed` handling for `mode:'setup'` sessions with the existing `mode:'payment'` credit_topup arm
**What goes wrong:** The existing webhook switch statement branches on `session.metadata?.type === 'credit_topup'` before falling through to subscription handling. A new `mode:'setup'` session will also fire `checkout.session.completed`, but it has no `payment_status` field meaningfully set to `'paid'` (setup sessions don't have a payment_status in the same sense) and no `credits` metadata. If the new arm isn't added BEFORE the existing `if (session.metadata?.type === 'credit_topup' ...)` check in a way that doesn't accidentally fall through into the subscription-mode branch, the session could silently no-op or (worse) attempt to read `session.subscription` fields that don't exist for a setup session.
**Why it happens:** The webhook handler is a single large switch/if-chain for `checkout.session.completed`, matching on `metadata.type` first. Any new metadata type must be added as its own `if (...) { ...; break }` arm, following the exact structure already used for `credit_topup`.
**How to avoid:** Add the new `autotopup_setup` arm as its own `if` block, breaking immediately, positioned alongside (not nested inside) the existing `credit_topup` arm — both before the generic `companyId = session.metadata?.companyId; if (!companyId || session.mode !== 'subscription') break` line that starts the subscription-mode handling.
**Warning signs:** If testing shows the payment method never gets attached as `default_payment_method`, check whether the `autotopup_setup` arm is unreachable due to falling into the subscription `break` first.

### Pitfall 2: `off_session: true` + `confirm: true` without a pre-existing attached payment method throws immediately, not gracefully
**What goes wrong:** If `company.auto_topup_enabled` is somehow true but no payment method was ever actually attached (e.g. the setup session was abandoned, or the webhook arm from Pitfall 1 never fired), calling `paymentIntents.create({customer, off_session:true, confirm:true})` without a `payment_method` param will attempt to use the customer's `invoice_settings.default_payment_method` — if that's also null, Stripe throws an `invalid_request_error` immediately.
**Why it happens:** Nothing in the phase 153 UI flow currently prevents a tenant from toggling "Enable auto-top-up" ON before a payment method exists — the UI-SPEC's Copywriting Contract says the Save button should be "disabled while pending or while no payment method is on file," but this is a CLIENT-side guard; the server-side save endpoint must independently reject `auto_topup_enabled: true` when no payment method exists, or a client bypass (or a race where the payment method is later detached in the Stripe Dashboard) leaves a company in an inconsistent enabled-but-unchargeable state.
**How to avoid:** The settings-save server action/route must verify `company.stripe_customer_id` resolves to a customer with a non-null `invoice_settings.default_payment_method` (via `stripe.customers.retrieve(id)`) BEFORE persisting `auto_topup_enabled = true`. If checked at charge time too (defensive double-check), a missing payment method should short-circuit to the "auto-top-up failed — update your payment method" state rather than calling Stripe and catching the resulting error — cheaper and clearer.
**Warning signs:** `StripeInvalidRequestError` with a message referencing a missing payment method on the auto-top-up charge path, for a company that should have had one on file.

### Pitfall 3: The `notifyLowCreditBalance` call site fires on EVERY debit that crosses a threshold, including thresholds well above the auto-top-up threshold
**What goes wrong:** `notifyLowCreditBalance` already fires once per threshold crossing (e.g. crossing 200, then later crossing 50). If `triggerAutoTopupIfNeeded` is naively wired to fire every time `notifyLowCreditBalance` fires (rather than being its own independent check against `auto_topup_threshold_credits`), a company with a threshold of, say, 100 credits could get evaluated (and potentially charged) at the 200-credit low-balance notification crossing too, well before the tenant's own configured auto-top-up threshold.
**Why it happens:** CONTEXT.md's decision #5 says to extend "that SAME call site" — this means physically calling the new function from the same place in `recordCreditDebit`, NOT that the new function shares the notification's threshold-crossing logic. The auto-top-up trigger has its OWN threshold (`company.auto_topup_threshold_credits`, tenant-configured in dollars/credits) which is entirely independent of `billing_config.lowBalanceThresholds` (platform-wide, informational).
**How to avoid:** `triggerAutoTopupIfNeeded` should take `{companyId, newBalance}` and independently fetch `company.auto_topup_enabled`/`auto_topup_threshold_credits`, checking `newBalance < auto_topup_threshold_credits` on its own — it should NOT receive or reuse the `thresholds`/`crossed` variables computed for the notification logic.
**Warning signs:** Auto-top-up firing at a balance far above the tenant's configured threshold, or firing multiple times per billing cycle when it should fire once and then stay "recharged" above threshold.

### Pitfall 4: Race between the in-flight lock's TTL expiry and a slow Stripe API call
**What goes wrong:** If the in-flight lock TTL (e.g. 2 minutes) is shorter than a slow/hanging Stripe API call, a second concurrent debit could acquire the lock and fire a SECOND charge while the first Stripe call is still in progress (not yet timed out, not yet released the lock because it hasn't returned).
**Why it happens:** Stripe API calls typically resolve in under a few seconds, but network partitions or Stripe-side incidents can occasionally hang far longer. A too-short TTL optimizes for "don't get permanently stuck" at the cost of reintroducing the double-charge risk it exists to prevent.
**How to avoid:** Pick a TTL comfortably longer than any realistic Stripe API call (30-60 seconds is more than generous for a single `paymentIntents.create` call; even 2 minutes is defensible) AND release the lock explicitly in a `finally`-equivalent as soon as the Stripe call resolves (success or failure) so the TTL is a backstop, not the primary release mechanism. In a Next.js serverless/edge route, ensure the release happens even on error by wrapping in try/finally, not just try/catch.
**Warning signs:** None observable without a specific stress test — this is a design-time risk to document and size conservatively, not something that will show up as an obvious bug during normal development.

### Pitfall 5: Stripe API version mismatch between `stripe-client.ts`'s pinned apiVersion and the setup/off-session flow's expected response shape
**What goes wrong:** `getStripeClient()` pins `apiVersion: '2026-04-22.dahlia'`. All new Stripe calls in this phase automatically use that same pinned version (since they share the client). This is generally safe, but the SDK's TypeScript types are for the SDK's OWN bundled API version, which may lag or lead the explicitly pinned string — a mismatch here would show up as TypeScript types not perfectly matching runtime response shapes (e.g. a field renamed/moved, similar to the existing `current_period_end` cast-through-`unknown` workaround already present in the webhook handler for `invoice.paid`).
**Why it happens:** Same root cause as the existing documented workaround in `app/api/webhooks/stripe/route.ts` line 167-169 ("Stripe API 2026-04-22 moved current_period_end under billing_details but the runtime object still carries this field; TypeScript types haven't caught up").
**How to avoid:** When retrieving a `setup_intent` or `payment_intent` from a webhook event object, expect the possibility of needing a similar `as unknown as {...}` cast if a field the code needs isn't where the installed SDK's types say it should be — verify against an actual test-mode Stripe webhook payload during implementation rather than trusting the type definitions blindly for anything beyond the well-documented core fields (`id`, `status`, `payment_method`, `customer`).
**Warning signs:** TypeScript compiles clean but a runtime field access returns `undefined` unexpectedly on a webhook-delivered object.

## Runtime State Inventory

> This phase is NOT a rename/refactor/migration phase — it is new-capability development (new columns, new config keys, new routes, new UI components). This section is not applicable. Explicitly confirmed: no existing stored data, live service config, OS-registered state, secrets, or build artifacts reference "auto-topup," "autotopup," or the new column names, since none of this exists yet in the codebase (verified via the greps and file reads performed during this research — the only "auto_topup"-adjacent existing code is `enforcementEnabled` in `billing-config.ts`, which is the pattern being MIRRORED, not renamed).

## Code Examples

Verified patterns from the actual installed SDK and existing codebase (not training-data recall):

### Reading a customer's default payment method for display (masked)
```typescript
// Source: node_modules/stripe/cjs/resources/Customers.d.ts line 221, 295
// Customer.invoice_settings.default_payment_method: string | PaymentMethod | null
const customer = await stripe.customers.retrieve(company.stripe_customer_id, {
  expand: ['invoice_settings.default_payment_method'],
}) as Stripe.Customer
const pm = customer.invoice_settings?.default_payment_method as Stripe.PaymentMethod | null
const display = pm?.card ? { brand: pm.card.brand, last4: pm.card.last4 } : null
```

### The existing metadata-branching webhook pattern to extend (verbatim structure to mirror)
```typescript
// Source: app/api/webhooks/stripe/route.ts lines 112-131 (existing, unmodified)
case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session

  if (session.metadata?.type === 'credit_topup' && session.payment_status === 'paid') {
    // ... existing grant logic
    break
  }

  // NEW arm to add here, same structural level:
  // if (session.metadata?.type === 'autotopup_setup' && session.setup_intent) { ...; break }

  const companyId = session.metadata?.companyId
  if (!companyId || session.mode !== 'subscription') break
  // ... existing subscription handling
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|---------------|--------|
| N/A — this is the project's first off-session charge | Off-session PaymentIntent + `mode:'setup'` Checkout for card capture | N/A (first implementation) | Establishes the pattern future phases (e.g. subscription dunning improvements) could reuse |

**Deprecated/outdated:** Nothing in this domain is deprecated in the installed SDK version — `off_session`, `mode:'setup'`, `error_on_requires_action`, and `idempotencyKey` request options are all current, stable Stripe API surface as confirmed in the installed `stripe@22.1.1` type definitions.

## Open Questions

1. **Exact Supabase-js syntax for the compound-condition atomic UPDATE (in-flight lock)**
   - What we know: Supabase-js supports `.update().eq()` chains (used throughout `credit-ledger.ts`) and has an `.or()` filter method for compound conditions.
   - What's unclear: Whether `.update({...}).eq('id', companyId).or('auto_topup_in_flight_until.is.null,auto_topup_in_flight_until.lt.' + isoNow).select().maybeSingle()` compiles to the intended atomic single-statement UPDATE with the OR condition correctly ANDed with the `eq('id', ...)` filter (Supabase-js's `.or()` semantics relative to preceding `.eq()` calls needs a quick local check against the actual client version in this project, not assumed from general Supabase docs memory).
   - Recommendation: Planner should budget a small spike/verification step in Wave 0, or default to a Postgres RPC function (`CREATE FUNCTION acquire_autotopup_lock(company_id uuid) RETURNS boolean ...`) which sidesteps the query-builder chaining question entirely by running the exact atomic SQL server-side — this is the safer default if the spike reveals ambiguity.

2. **Whether the existing `create-portal-session` route's Stripe Dashboard Configuration actually has `payment_method_update` enabled**
   - What we know: The route code makes no `configuration` param assertion, so it uses whichever Configuration is marked default in the connected Stripe account's Dashboard — this is an account-level setting, not something visible in this codebase's git history.
   - What's unclear: Whether this environment's Stripe test/live account has that feature toggled on. This doesn't block CREDITUI-07's chosen `mode:'setup'` approach (which is self-contained and doesn't depend on portal configuration), but it does mean the Portal route CANNOT be assumed as a fallback "manage payment method" affordance without checking the Stripe Dashboard directly.
   - Recommendation: Treat `mode:'setup'` Checkout as the sole card-capture/update mechanism for this phase (both initial capture and any later "update" flow) rather than depending on the Portal's uncertain configuration — simpler, self-contained, and doesn't require coordinating with Stripe Dashboard settings that live outside this repo.

3. **Exact credits-per-pack numbers for the new $20/$50/$100 packs**
   - What we know: CONTEXT.md explicitly delegates this to researcher/planner discretion, suggesting ~1300/3500/7500 credits as an example consistent with the existing packs' ~$0.012-0.015/credit ratio (existing: 1000 credits/$15 = $0.015/credit; 5000 credits/$60 = $0.012/credit).
   - What's unclear: Nothing — this is explicitly a placeholder per CONTEXT.md and the file's own established comment convention ("CALIBRATE BEFORE CHARGING").
   - Recommendation: Use $20→1300 credits ($0.0154/credit), $50→3500 credits ($0.0143/credit), $100→7500 credits ($0.0133/credit) — mild volume discount curve consistent with the existing two-pack ratio, clearly commented as a placeholder in `billing-config.ts` exactly like every other number in that file.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `stripe` npm package | Both CREDITUI-06 and CREDITUI-07 | Yes | 22.1.1 (pinned `^22.1.1`, resolved 22.3.0 in `node_modules`) | — |
| Stripe secret key (DB-stored, `getIntegrationKey('stripe')`) | Both requirements — all Stripe calls | Not verifiable from this sandbox (requires live DB/admin panel state); code path exists and is the established retrieval mechanism | — | If unset, `getStripeClient()` throws a clear configured error — existing routes already handle this by surfacing a 503/error, no new fallback needed |
| Stripe Dashboard: default Billing Portal Configuration with `payment_method_update` | Only relevant if choosing the Portal-based fallback (NOT recommended per Open Question 2) | Unknown (Stripe Dashboard setting, not in this repo) | — | Use `mode:'setup'` Checkout Session instead (self-contained, no Dashboard dependency) — this is the primary recommendation, not a fallback |
| `@stripe/stripe-js` / `@stripe/react-stripe-js` | Only needed if a raw-Elements card form were built | Not installed, and NOT needed — CONTEXT.md forbids raw card forms | — | N/A — Checkout redirect avoids needing these entirely |
| Supabase service-role client (`requireServiceClient()`) | New `companies` columns, in-flight lock UPDATE | Yes — existing infrastructure, used throughout `lib/billing/*` | — | — |
| `lib/observability/ops-alert.ts` (`notifyOps`) | Failure-rate alerting for systemic auto-top-up decline patterns | Yes — existing, never-throw, fail-open on Redis | — | — |
| `lib/admin/audit-log.ts` (`logAdminAction`) | Auditing auto-top-up enable/disable/settings changes (recommended, not explicitly required by CONTEXT.md but consistent with project convention) | Yes — existing | — | — |

**Missing dependencies with no fallback:** None identified — everything required is either already installed or achievable with already-installed tooling.

**Missing dependencies with fallback:** Billing Portal's `payment_method_update` Dashboard configuration status is unknown, but the recommended architecture (`mode:'setup'` Checkout) does not depend on it at all, so this is a non-blocking unknown.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (existing `vitest.config.ts` at repo root) |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/billing/<file>.test.ts` |
| Full suite command | `npx vitest run tests/unit/billing` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CREDITUI-06 | `billing-config.ts` DEFAULT_BILLING_CONFIG.topUpPacks has exactly 3 packs at 2000/5000/10000 cents | unit | `npx vitest run tests/unit/billing/billing-config.test.ts` | ✅ (existing file — extend) |
| CREDITUI-06 | `create-topup-session` route still creates a valid `mode:'payment'` session for `packIndex` 0/1/2 with the new 3-pack config (regression — route unchanged, config changed) | unit | `npx vitest run tests/unit/billing/topup-checkout.test.ts` | ✅ Wave 0 — extend existing `TOPUP_PACKS` fixture to 3 packs and add a `packIndex: 2` case |
| CREDITUI-06 | Pack picker labels are derived from `priceCents`, never a hardcoded `"$20"` literal disconnected from config (mirrors `pricing-ui-no-hardcode.test.ts` convention) | unit | `npx vitest run tests/unit/billing/pricing-ui-no-hardcode.test.ts` (extend) or new `topup-pack-labels-no-hardcode.test.ts` | ❌ Wave 0 (new assertion needed, extending an existing no-hardcode convention file) |
| CREDITUI-07 | `billing_config.autoTopupEnabled` defaults to `false`; kill switch gates the tenant-facing card render | unit | `npx vitest run tests/unit/billing/billing-config.test.ts` (extend) | ✅ (existing file — extend) |
| CREDITUI-07 | New `companies` auto-top-up columns default to false/null (migration test, mirrors `credit-ledger-migration.test.ts` convention) | unit/migration | `npx vitest run tests/unit/billing/<new>-migration.test.ts` | ❌ Wave 0 |
| CREDITUI-07 | `triggerAutoTopupIfNeeded` fires the off-session charge only when `auto_topup_enabled && newBalance < threshold`, and does NOT fire on unrelated `lowBalanceThresholds` crossings (Pitfall 3) | unit | `npx vitest run tests/unit/billing/auto-topup.test.ts` | ❌ Wave 0 |
| CREDITUI-07 | Concurrent-debit race: two simultaneous calls to the in-flight-guarded charge function result in exactly ONE Stripe `paymentIntents.create` call | unit | `npx vitest run tests/unit/billing/auto-topup-concurrency.test.ts` | ❌ Wave 0 |
| CREDITUI-07 | Off-session charge failure (declined/`requires_action`) is caught, logged, and surfaces the "update payment method" state without throwing into the caller (mirrors `credit-low-notify.test.ts`'s "never throws" convention) | unit | `npx vitest run tests/unit/billing/auto-topup.test.ts` | ❌ Wave 0 (same file as above) |
| CREDITUI-07 | `create-autotopup-setup-session` route creates a `mode:'setup'` session, server-side company lookup only (no client-trusted fields) | unit | `npx vitest run tests/unit/billing/autotopup-setup-session.test.ts` | ❌ Wave 0 |
| CREDITUI-07 | Webhook `checkout.session.completed` arm for `autotopup_setup` metadata attaches the resulting payment method as the customer's default (mirrors `stripe-webhook.test.ts` convention) | unit | `npx vitest run tests/unit/billing/stripe-webhook.test.ts` (extend) | ✅ Wave 0 — extend existing file with a new describe block |
| CREDITUI-07 | Settings-save endpoint rejects `auto_topup_enabled: true` when no payment method is on file server-side (Pitfall 2) | unit | `npx vitest run tests/unit/billing/auto-topup-settings.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/billing/<touched-file>.test.ts`
- **Per wave merge:** `npx vitest run tests/unit/billing`
- **Phase gate:** Full billing suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/billing/auto-topup.test.ts` — covers CREDITUI-07 trigger logic, threshold independence (Pitfall 3), never-throw failure handling
- [ ] `tests/unit/billing/auto-topup-concurrency.test.ts` — covers the in-flight lock / double-charge guard (the single riskiest test in this phase)
- [ ] `tests/unit/billing/autotopup-setup-session.test.ts` — covers the new `mode:'setup'` Checkout route, mirroring `topup-checkout.test.ts`'s structure
- [ ] `tests/unit/billing/auto-topup-settings.test.ts` — covers the settings-save endpoint's server-side payment-method-exists guard (Pitfall 2) and pack-index range validation
- [ ] New migration test for the `companies` auto-top-up columns, mirroring `credit-ledger-migration.test.ts`'s pattern (verifies columns exist, defaults are false/null)
- [ ] Extend `tests/unit/billing/stripe-webhook.test.ts` with an `autotopup_setup` describe block (Pitfall 1 — verify it doesn't fall through to subscription handling)
- [ ] Extend `tests/unit/billing/topup-checkout.test.ts`'s `TOPUP_PACKS` fixture from 2 to 3 packs and add a `packIndex: 2` case (regression coverage for the config change)
- [ ] Extend `tests/unit/billing/billing-config.test.ts` with assertions for `autoTopupEnabled` default and the new 3-pack `topUpPacks` shape

## Sources

### Primary (HIGH confidence)
- Local installed package inspection: `node_modules/stripe/package.json` (version 22.1.1), `node_modules/stripe/cjs/resources/PaymentIntents.d.ts`, `node_modules/stripe/cjs/resources/Checkout/Sessions.d.ts`, `node_modules/stripe/cjs/resources/Customers.d.ts`, `node_modules/stripe/cjs/resources/BillingPortal/Configurations.d.ts` — confirmed exact parameter shapes for `off_session`, `confirm`, `error_on_requires_action`, `mode:'setup'`, `invoice_settings.default_payment_method`, `payment_method_update` feature, directly against the SDK version actually pinned in this project's `package.json`.
- Runtime verification via local Node script instantiating `new Stripe('sk_test_dummy')` and confirming `paymentIntents.create`, `setupIntents.create`, `checkout.sessions.create`, `customers.listPaymentMethods`, `paymentMethods.list`, `customers.retrieve` all exist as callable methods.
- Direct file reads of every file named in the phase's `<additional_context>`: `app/api/billing/create-topup-session/route.ts`, `app/api/billing/create-portal-session/route.ts`, `lib/billing/stripe-client.ts`, `lib/billing/billing-config.ts`, `lib/billing/credit-ledger.ts`, `components/billing/tier-card.tsx`, `components/billing/tier-cards-grid.tsx`, `components/billing/credit-balance-card.tsx`, `components/billing/top-up-button.tsx`, `app/api/webhooks/stripe/route.ts`, `app/admin/companies/handoff-button.tsx` (Dialog precedent), `lib/observability/ops-alert.ts`, `lib/admin/audit-log.ts`, `lib/demo/guard.ts`.
- `.planning/phases/153-dollar-pack-top-up-auto-top-up/153-CONTEXT.md` and `153-UI-SPEC.md` (approved, locked artifacts for this phase).
- `.planning/REQUIREMENTS.md` — CREDITUI-06/CREDITUI-07 exact wording and milestone-level locked decisions.
- Existing migration files (`20260704000001_billing_v2_byok_columns.sql`, `20260628000003_phase148_demo_estimate_quota.sql`, `20260514000001_phase58_stripe_processed_events.sql`, `20260624000004_phase112_credit_ledger.sql`) — confirmed the exact nullable-column-on-companies convention and the append-only ledger/idempotency-index pattern to mirror.
- Existing test files (`tests/unit/billing/topup-checkout.test.ts`, `tests/unit/billing/credit-low-notify.test.ts`) — confirmed the mocking conventions (`vi.mock` module-level, `beforeEach` reset, `never`-cast test doubles) this phase's new tests must follow.

### Secondary (MEDIUM confidence)
- None — all Stripe-specific claims in this research were verified against the actually-installed SDK's type definitions rather than relying on WebSearch or general training-data recall of the Stripe API, given the explicit instruction to confirm against the installed SDK version, not assumed from memory.

### Tertiary (LOW confidence)
- Supabase-js exact `.or()` chaining behavior for the compound-condition atomic UPDATE (Open Question 1) — this was reasoned from general Supabase-js query-builder conventions observed elsewhere in the codebase, not verified against a live query in this research session. Flagged explicitly as needing a Wave 0 spike or an RPC-function fallback.
- Whether the connected Stripe account's Billing Portal Configuration has `payment_method_update` enabled (Open Question 2) — this is an external Stripe Dashboard setting not visible from the repository; the research recommends an architecture that doesn't depend on the answer, sidestepping the need to verify it.

## Metadata

**Confidence breakdown:**
- Standard stack (Stripe SDK capabilities): HIGH — verified directly against the installed package's type definitions and runtime method existence, not training-data recall.
- Architecture (auto-top-up trigger wiring, in-flight guard): MEDIUM-HIGH — the overall shape mirrors well-established codebase conventions (`credit-ledger.ts`'s never-throw style, the metadata-branching webhook pattern, nullable-column migrations), but the exact Supabase-js query syntax for the atomic lock (Open Question 1) has not been runtime-verified in this research pass.
- Pitfalls: HIGH — each pitfall is grounded in a specific, cited line of existing code or a specific, cited SDK type definition, not speculative.

**Research date:** 2026-07-05
**Valid until:** 30 days (Stripe API surface for these specific methods is stable; the installed SDK version is pinned via `package.json` so it won't drift without an explicit dependency bump) — re-verify sooner if `stripe` package is upgraded before this phase executes.
