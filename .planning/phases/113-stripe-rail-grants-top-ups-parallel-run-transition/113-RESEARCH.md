# Phase 113: Stripe Rail — Grants, Top-Ups + Parallel-Run Transition - Research

**Researched:** 2026-06-24
**Domain:** Stripe webhooks (subscription invoice.paid grant + one-time top-up checkout) wiring the Phase-112 credit ledger; parallel-run safety with the count-based tier path
**Confidence:** HIGH (entirely codebase-internal; all primitives already exist and are tested)

## Summary

Phase 113 is a **wiring phase, not a new-subsystem phase**. Every primitive it needs already exists and is unit-tested: `grantCredits` (Phase 112, ships dormant — this phase is its first caller), the Stripe webhook with signature verification + `processed_stripe_events` idempotency (Phase 58), the subscription checkout route (the exact pattern to mirror for a one-time top-up), `getBillingConfig` (Phase 111, the runtime source for grant amounts + top-up packs), and `checkCredits` (Phase 112, the enforcement-gated balance gate that stays inert until Phase 116). The work is: (1) add a `grantCredits` call inside the existing `invoice.paid` branch keyed on `event.id`; (2) add a new `mode:'payment'` checkout route + a `checkout.session.completed` branch that grants a top-up pack read back from `session.metadata`; (3) surface a top-up/upgrade affordance off `checkCredits.shortfall` (path only — enforcement is OFF); (4) verify nothing touches the count-based `checkQuota`/entitlements path.

The single most important architectural fact: **the existing webhook already proves the entire metadata round-trip.** `create-checkout-session/route.ts` writes `metadata: { companyId, plan }`; the `checkout.session.completed` handler reads `session.metadata?.companyId` and `session.metadata?.plan` back. Top-up is the identical pattern with `mode:'payment'` and a `type:'credit_topup'` marker — no new Stripe concepts, no Context7 needed for the round-trip (it's verified in-repo).

**Primary recommendation:** Reuse, don't rebuild. Add `grantCredits(idempotencyKey = event.id)` to the existing `invoice.paid` branch; mirror the subscription checkout route for a one-time top-up with a `type:'credit_topup'` metadata marker handled in a new `checkout.session.completed` sub-branch; gate the grant amount on `getBillingConfig().tiers[tier].monthlyCreditGrant` (runtime-authoritative). Keep the count-based path byte-for-byte untouched — credits are purely additive.

## User Constraints

> No CONTEXT.md exists for this phase (no `/gsd:discuss-phase` was run). Constraints below are the LOCKED DECISIONS from REQUIREMENTS.md v4.7 + SEED-035, which bind this phase identically.

### Locked Decisions (from REQUIREMENTS.md v4.7 + SEED-035)
- **Stripe is the RAIL, the credit ledger is OURS.** Stripe Billing charges the recurring subscription + one-time top-ups; credit metering lives in our `credit_ledger`, NOT Stripe metered/usage-based billing. (Out of scope: tying credits to Stripe metered billing.)
- **Overage = top-up + upgrade prompt; NO silent mid-job block.** When credits run low/zero, offer top-up (and an upgrade suggestion where the pattern justifies it) — never hard-fail mid-flow.
- **Everything super-admin-configurable via `billing_config`** — no hard-coded billing numbers, no env vars for grant amounts / top-up pack sizes/prices. Read from `getBillingConfig()` at runtime.
- **Calibrate before charging.** `enforcementEnabled` is FALSE this milestone (flips ON only in Phase 116). So the overage UX is the PATH/affordance, NOT a hard block.
- **No secrets in git** (CLAUDE.md): use placeholders (`whsec_<secret>`, `sk_live_<key>`) in any docs; never paste real Stripe IDs.
- **Deploy CI→GHCR→Coolify**, never build on the VPS.

### Claude's Discretion (within the scope fence)
- The exact `session.metadata` contract for top-up (`type`, `credits`, `companyId`, `packId`).
- Whether the top-up checkout uses inline `price_data` (recommended) vs pre-created Stripe Prices.
- The grant idempotency key shape (recommended: `event.id` for invoice.paid; `session.id` or `event.id` for top-up).
- The minimal overage affordance surface (recommended: enrich the existing 402 response shape + a thin client CTA).

### Deferred Ideas (OUT OF SCOPE — do not build here)
- **The owner-facing credit balance widget / consumption history UX → Phase 115** (CREDITUI-01/02). This phase ships only the overage *affordance/path*, not the balance widget.
- **Turning enforcement ON / calibration → Phase 116** (CALIB-02). `enforcementEnabled` stays false.
- **The 1% estimate application fee → Phase 114** (FEE-01..04). Different payment flow; do not touch `invoice-service.ts`.
- **Payment UI gating + fee disclosure → Phase 114** (PAYGATE/DISCLOSE).
- Credit rollover (v2 GRAN-03 — decision: no rollover, expire at cycle end).
- Per-operation markup / per-tier fee differentiation (v2 GRAN-01/02).

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| TOPUP-01 | On `invoice.paid` for a subscription, grant the tier's monthly credit allowance to the ledger idempotently (via existing `processed_stripe_events`) | Existing `invoice.paid` branch (route.ts:137-160) is the exact hook; `grantCredits` (credit-ledger.ts:123) accepts an `idempotencyKey`; grant amount from `getBillingConfig().tiers[tier].monthlyCreditGrant`. See "invoice.paid Grant" below. |
| TOPUP-02 | A company buys a one-time credit top-up pack via Stripe checkout; the paid webhook credits the ledger | Mirror `create-checkout-session/route.ts` with `mode:'payment'` + `price_data`; new `checkout.session.completed` sub-branch reads `session.metadata` and calls `grantCredits(reason:'topup')`. Top-up packs from `getBillingConfig().topUpPacks`. See "Top-Up Checkout" below. |
| TOPUP-03 | When credits run low/zero, offer top-up (+ upgrade suggestion) — not silently blocked mid-job | `checkCredits` already returns `{allowed, balance, shortfall}` and (enforcement OFF) `allowed:true` always. Enrich the existing 402 response shape + thin client CTA. Path only, not a block. See "Overage Affordance" below. |
| MIG-01 | Credits run in parallel with count-based tiers during transition; no account breaks; counts degrade to secondary guard-rails | This phase ADDS grant/top-up rows; it does NOT modify `checkQuota`/`entitlements` count logic. Parallel-run = both paths active, credits additive. See "Parallel-Run Transition" below. |

## Standard Stack

No new dependencies. Everything is already installed and pinned.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` (Node SDK) | 22.1.1 (installed; package.json `^22.1.1`) | Checkout Sessions + webhook signature verification | Already the project's Stripe SDK; `getStripeClient()` is the single entry point |
| `@supabase/supabase-js` | (installed) | Service-role writes to `credit_ledger` / `companies` | `requireServiceClient()` is the established RLS-bypass path |
| Next.js App Router route handlers | 14+ | Webhook + checkout routes | Existing `app/api/webhooks/stripe/route.ts` + `app/api/billing/*` |

> **Stripe API version note (HIGH — verified in-repo):** `lib/billing/stripe-client.ts` pins `apiVersion: '2026-04-22.dahlia'`. The installed SDK major is **22.1.1**. Do NOT change either. Note the existing `invoice.paid` handler already documents that `current_period_end` moved under `billing_details` in this API version and casts through `unknown` to read it — follow that exact existing pattern; do not "fix" the cast.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `lib/billing/credit-ledger.ts` `grantCredits` | Phase 112 | Positive `grant`/`topup` ledger row + cached-balance bump, idempotent, never-throws | Both the invoice.paid grant AND the top-up grant |
| `lib/billing/billing-config.ts` `getBillingConfig` | Phase 111 | Runtime grant amounts (`tiers[tier].monthlyCreditGrant`) + `topUpPacks` | Resolve grant size + validate top-up pack at runtime |
| `lib/billing/credit-ledger.ts` `checkCredits` | Phase 112 | `{allowed, balance, shortfall}` gate (inert until Phase 116) | Drives the overage affordance |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Inline `price_data` for top-up packs | Pre-created Stripe `Price` objects | Pre-created Prices require a separate provisioning step + storing price IDs; **inline `price_data` keeps top-up pack size/price 100% driven by `billing_config.topUpPacks`** (BILLCFG mandate). Recommend inline `price_data`. |
| `event.id` as grant idempotency key | A synthesized `${companyId}:${period}` key | `event.id` is already the dedup key for `processed_stripe_events`; reusing it makes redelivery a guaranteed no-op. Recommend `event.id`. |
| Reusing `processed_stripe_events` for grant dedup | A second dedup on `credit_ledger.idempotency_key` | **Use BOTH layers** (see Pitfall 1). `processed_stripe_events` stops whole-event reprocessing; `credit_ledger.idempotency_key` stops a double-grant if the event row was somehow inserted but the grant later retried. |

**Installation:** none — no `npm install`.

## Architecture Patterns

### invoice.paid Grant (TOPUP-01) — recommended exact hook

The existing `invoice.paid` branch (`app/api/webhooks/stripe/route.ts:137-160`) already:
1. Resolves `subId` (handles both `invoice.subscription` and the 2026-04-22 `invoice.parent.subscription_details.subscription` shape).
2. Updates `companies.tier_renews_at` filtered by `stripe_subscription_id = subId`.

It does **not** currently read back the `companyId` or `tier`. The grant needs both. Recommended addition **inside the same branch, after the existing `tier_renews_at` update**:

```typescript
// Source: pattern composed from app/api/webhooks/stripe/route.ts (existing) + lib/billing/credit-ledger.ts
// Resolve company + tier from the subscription (single read; the existing update
// already filters by stripe_subscription_id so the row exists).
const { data: company } = await svc
  .from('companies')
  .select('id, tier')
  .eq('stripe_subscription_id', subId)
  .maybeSingle()

if (company?.id) {
  const cfg = await getBillingConfig()
  const tierKey = (company.tier ?? 'free') as keyof typeof cfg.tiers
  const grant = cfg.tiers[tierKey]?.monthlyCreditGrant ?? 0
  await grantCredits({
    companyId: company.id,
    credits: grant,           // grantCredits no-ops when credits <= 0 (free tier = 0)
    reason: 'grant',
    refId: invoice.id,
    idempotencyKey: event.id, // redelivered webhook → guaranteed no double-grant
  })
}
```

**Runtime-authoritative grant amount (answers Key Question 1):** read from **`getBillingConfig().tiers[tier].monthlyCreditGrant`** (the `billing_config` row), NOT `entitlements.ts`. The `entitlements.ts` `monthlyCreditGrant` field is the *static null-safe mirror* — its own doc comment (lib/entitlements.ts:24-31) states "the AUTHORITATIVE runtime value is read from the billing-config reader at grant time (BILLCFG-03)." The two are kept in sync by convention; the config is authoritative because grant amounts must be super-admin-editable without a deploy.

**First grant (subscribe) vs renewal (answers Key Question 1):** Stripe fires `invoice.paid` for BOTH the first subscription invoice AND each renewal — so a single `invoice.paid` handler covers both. The existing `checkout.session.completed` branch sets `tier` (and clears trial) on subscribe; the very next `invoice.paid` for that subscription then grants. **Recommendation:** do the grant in `invoice.paid` only (covers subscribe + renewal uniformly). Do NOT also grant in `checkout.session.completed` for subscriptions — that would double-grant the first cycle. (The top-up grant, by contrast, lives in `checkout.session.completed` because top-ups have no invoice/subscription — see below.)

**Free-tier safety:** `grantCredits` already no-ops on `credits <= 0` (credit-ledger.ts:131), and `DEFAULT_BILLING_CONFIG.tiers.free.monthlyCreditGrant === 0`, so a free company never gets a phantom row.

### Top-Up Checkout (TOPUP-02) — new route + webhook sub-branch

**New route** `app/api/billing/create-topup-session/route.ts` — mirror `create-checkout-session/route.ts` exactly (auth via `auth.getClaims()`, `demoGuardResponse()`, company lookup), changing only the session args:

```typescript
// Source: mirror of app/api/billing/create-checkout-session/route.ts with mode:'payment'
const cfg = await getBillingConfig()
const pack = cfg.topUpPacks[packIndex]            // validate index server-side
if (!pack) return NextResponse.json({ error: 'Invalid pack' }, { status: 400 })

const session = await stripe.checkout.sessions.create({
  mode: 'payment',                                // one-time, NOT subscription
  line_items: [{
    quantity: 1,
    price_data: {                                 // inline → driven by billing_config, no pre-created Price
      currency: 'usd',
      unit_amount: pack.priceCents,
      product_data: { name: `${pack.credits} Xtimator credits` },
    },
  }],
  customer: company.stripe_customer_id ?? undefined,
  success_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?topup=1`,
  cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/settings/billing?topup=cancelled`,
  // The metadata contract — read back verbatim in the webhook (Stripe round-trips metadata unchanged)
  metadata: {
    type: 'credit_topup',
    companyId: company.id,
    credits: String(pack.credits),                // metadata values are strings
  },
})
return NextResponse.json({ url: session.url })
```

**Webhook sub-branch** — the existing `checkout.session.completed` branch currently early-`break`s unless `session.mode === 'subscription'` (route.ts:113). Add a **top-up arm BEFORE that guard**:

```typescript
case 'checkout.session.completed': {
  const session = event.data.object as Stripe.Checkout.Session

  // Top-up (one-time): mode 'payment' + our marker. Handle BEFORE the subscription guard.
  if (session.metadata?.type === 'credit_topup' && session.payment_status === 'paid') {
    const companyId = session.metadata.companyId
    const credits = Number(session.metadata.credits)
    if (companyId && credits > 0) {
      await grantCredits({
        companyId,
        credits,
        reason: 'topup',
        refId: session.id,
        idempotencyKey: event.id,   // event-level idempotency (also gated by processed_stripe_events)
      })
    }
    break
  }

  // ...existing subscription handling unchanged...
}
```

**Why `checkout.session.completed` (not a separate event):** a one-time `mode:'payment'` Checkout completion fires `checkout.session.completed` with `payment_status: 'paid'`. The metadata round-trip is identical to the subscription path already proven in this repo (`session.metadata?.companyId`). No `payment_intent` expansion needed — the credits + companyId travel in `session.metadata`.

### Overage Affordance (TOPUP-03) — path, not a block

`checkCredits(supabase, companyId, estimatedCredits)` already returns `{allowed, balance, shortfall}` and — because `enforcementEnabled` is false — returns `allowed: true` ALWAYS this milestone, while still reporting `shortfall` for UI. The existing over-quota pattern (generate-estimate route.ts:81-86) returns a 402 with `{ error, upgradeUrl }`.

**Recommendation (minimal but real):**
- Where an AI route already calls `checkQuota`, optionally call `checkCredits` alongside and, when `shortfall > 0`, **enrich** the response/affordance with a top-up path (`topUpUrl: '/settings/billing?topup=1'`) plus the existing `upgradeUrl`. Because `allowed` is always true, this is **informational only** — generation proceeds. This lands the SCAFFOLDING (the path exists, copy/CTA wired) so Phase 116 only has to flip `enforcementEnabled` to convert the affordance into a soft gate.
- Surface a thin client CTA off the enriched response (a "low balance — top up" affordance). The *full balance widget is Phase 115* — keep this to the affordance only.

**Do NOT** introduce a hard block, and do NOT call `checkCredits` in a way that can return `allowed:false` this milestone (it can't, by config, but don't add a code path that assumes it might block).

### Parallel-Run Transition (MIG-01) — what "parallel run" concretely means

| Aspect | This phase |
|--------|------------|
| Count-based `checkQuota` / `entitlements.maxEstimatesPerMonth` etc. | **Untouched.** Still the active gate. |
| Credit grant on invoice.paid + top-up | **Added** — writes `credit_ledger` rows + bumps `companies.credit_balance`. Additive only. |
| `checkCredits` enforcement | OFF (`enforcementEnabled: false`) → never blocks. |
| Existing accounts | Unaffected — a company with no grant simply has `credit_balance = 0` and the count path governs it as before. |
| "Counts degrade to secondary guard-rails" | Happens conceptually NOW (credits run alongside) and is *completed* in Phase 116 when enforcement flips. This phase must NOT remove or weaken the count path. |

**Concrete safety rule for the planner:** no task in this phase may modify `lib/quota.ts`, `lib/entitlements.ts` count logic, or any `checkQuota` call site's gating semantics. The only `entitlements.ts`/config touch allowed is *reading* `monthlyCreditGrant` (already present). Verification should grep that `checkQuota` behavior is unchanged.

### Recommended File Touches
```
app/api/webhooks/stripe/route.ts            # MODIFY: grant in invoice.paid; top-up arm in checkout.session.completed
app/api/billing/create-topup-session/route.ts  # NEW: mode:'payment' checkout mirroring the subscription route
components/billing/<top-up CTA>              # NEW (thin): affordance off checkCredits.shortfall (NOT the full widget)
lib/billing/credit-ledger.ts                # NO CHANGE: grantCredits/checkCredits called as-is
lib/billing/billing-config.ts               # NO CHANGE: getBillingConfig read as-is
lib/quota.ts / lib/entitlements.ts          # NO CHANGE (MIG-01 safety)
```

### Anti-Patterns to Avoid
- **Double-granting the first cycle:** granting in BOTH `checkout.session.completed` (subscription) AND the first `invoice.paid`. Grant subscriptions ONLY in `invoice.paid`.
- **Pre-created Stripe Prices for top-ups:** breaks the "all pack sizes/prices from `billing_config`" mandate. Use inline `price_data`.
- **Hard-coding grant amounts or pack prices** in the route/webhook. Always `getBillingConfig()`.
- **Touching `invoice-service.ts` / application_fee** — that's Phase 114 (FEE-*). Out of scope.
- **Returning non-200 from the webhook on a grant failure:** `grantCredits` never throws (best-effort). The webhook must still return 200 so Stripe stops retrying; the `processed_stripe_events` row + `credit_ledger.idempotency_key` protect against double-apply on any manual retry.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Webhook event de-duplication | A custom seen-events cache | `processed_stripe_events` insert + `23505` check (Phase 58, already in route.ts:60-75) | Already wired; redelivery returns 200 "Already processed" before the handler runs |
| Ledger grant idempotency | A bespoke "already granted this period" query | `grantCredits({ idempotencyKey })` (dedup by key, credit-ledger.ts:135-143) | Second dedup layer; never-throws; bumps cached balance atomically with the row |
| Credit balance cache update | Manual `companies.credit_balance` math | `grantCredits` does the read-bump-write internally | Single source of correct balance accounting |
| Signature verification | Manual HMAC | `stripe.webhooks.constructEvent(rawBody, sig, secret)` (route.ts:48) | Already handles the raw-body-first ordering + dual platform/connect secret |
| One-time checkout | A custom payment intent flow | `stripe.checkout.sessions.create({ mode: 'payment', ... })` mirroring the subscription route | Hosted Checkout = no PCI surface; metadata round-trip already proven in-repo |

**Key insight:** This phase has zero genuinely new primitives. Every "how do I…" already has an answer 1-2 files away. The risk is *re-implementing* something (a new dedup table, a new balance updater, a new Stripe client) instead of calling the existing helper.

## Common Pitfalls

### Pitfall 1: Single-layer idempotency → double grant on manual retry
**What goes wrong:** Relying ONLY on `processed_stripe_events` for grant idempotency. If the event row inserts but the grant is later replayed (e.g., a manual `stripe events resend` after a partial failure, or a code retry), the company is granted twice.
**Why it happens:** `processed_stripe_events` guards the *whole webhook invocation*, but a grant re-run inside an already-recorded event bypasses it.
**How to avoid:** Pass `idempotencyKey: event.id` to `grantCredits` as a SECOND layer. `grantCredits` dedups on `credit_ledger.idempotency_key`, so even a replayed grant is a no-op.
**Warning signs:** A company's `credit_balance` jumps by 2× the tier grant after a webhook redelivery in test.

### Pitfall 2: Granting subscriptions in checkout.session.completed AND invoice.paid
**What goes wrong:** First billing cycle grants twice.
**Why it happens:** Both events fire on first subscribe; it's tempting to grant "on checkout."
**How to avoid:** Subscriptions grant ONLY in `invoice.paid` (covers subscribe + every renewal). Top-ups grant ONLY in `checkout.session.completed` (no invoice). Different idempotency keys, different branches, no overlap.
**Warning signs:** A test asserting one grant per new subscription fails with two ledger rows.

### Pitfall 3: Top-up arm placed after the `mode==='subscription'` guard
**What goes wrong:** The existing `checkout.session.completed` branch `break`s early when `session.mode !== 'subscription'` (route.ts:113). A top-up is `mode:'payment'`, so a top-up arm placed *after* that guard never runs.
**How to avoid:** Put the `metadata.type === 'credit_topup'` check BEFORE the subscription-mode guard.
**Warning signs:** Top-up checkout completes, payment succeeds, but `credit_balance` never moves.

### Pitfall 4: Trusting client-supplied credits/price
**What goes wrong:** Reading the pack credits/price from the request body and trusting them → a user could request 1,000,000 credits for $1.50.
**How to avoid:** The route accepts only a pack *index/id*; it looks the credits + `priceCents` up from `getBillingConfig().topUpPacks` server-side and writes THOSE into `unit_amount` + `metadata.credits`. The webhook reads `credits` from `session.metadata` (which only Stripe could have set from our server call — metadata is not client-mutable post-creation).
**Warning signs:** A `credits` value in metadata that doesn't match any configured pack.

### Pitfall 5: metadata values are strings
**What goes wrong:** `Number(session.metadata.credits)` forgotten → `grantCredits` gets `"5000"` and the `> 0` guard or the balance math misbehaves.
**How to avoid:** Stripe metadata is always string-valued. Write `String(pack.credits)` on create; `Number(...)` on read, with a `> 0` guard.

### Pitfall 6: invoice.paid tier resolution reads a stale/missing tier
**What goes wrong:** Resolving the grant tier from `session.metadata.plan` (which only exists on the checkout event, not on invoice.paid) → undefined tier → wrong/zero grant.
**How to avoid:** On `invoice.paid`, resolve tier from `companies.tier` via `stripe_subscription_id` (the row already exists; the existing handler updates it by the same filter). The `checkout.session.completed` handler set `companies.tier` before the first `invoice.paid` arrives.

## Code Examples

(See "Architecture Patterns" above for the three load-bearing snippets: invoice.paid grant, top-up route, top-up webhook arm. They are composed from existing repo code — `app/api/webhooks/stripe/route.ts`, `app/api/billing/create-checkout-session/route.ts`, and `lib/billing/credit-ledger.ts` — not external sources.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Count-based tiers only (`maxEstimatesPerMonth`) | Credits run in parallel (debit = real cost × markup), counts as secondary guard-rails | v4.7 (Phases 110-116) | This phase ADDS the rail; counts stay live until Phase 116 |
| Stripe `invoice.subscription` field | `invoice.parent.subscription_details.subscription` (API 2026-04-22) | Stripe API 2026-04-22.dahlia | Already handled in the existing `invoice.paid` branch — reuse its `subId` resolution; don't reinvent |
| `current_period_end` top-level | Moved under `billing_details` (cast through `unknown`) | Stripe API 2026-04-22.dahlia | Existing handler documents + works around this; follow the existing cast |

**Deprecated/outdated:** none introduced by this phase.

## Open Questions

1. **Should the overage affordance call `checkCredits` from inside the AI routes now, or just ship the client CTA + balance-aware response shape?**
   - What we know: `checkCredits` is safe to call (always `allowed:true` this milestone) and already returns `shortfall`.
   - What's unclear: how much of the AI-route plumbing to wire now vs. leave for Phase 115/116.
   - Recommendation: wire the *response enrichment* (`topUpUrl`) and a thin CTA so the path is real, but keep it informational (no block). Defer the rich balance widget to Phase 115. The planner can scope this as the minimal TOPUP-03 task.

2. **Top-up `success_url` landing — does `/settings/billing` need a "top-up succeeded" toast now?**
   - Recommendation: a minimal query-param-driven toast (`?topup=1`) is in-scope as affordance feedback; the full balance display is Phase 115. Keep minimal.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `stripe` Node SDK | Checkout + webhook | ✓ | 22.1.1 (pinned `^22.1.1`) | — |
| Stripe secret key (`getIntegrationKey('stripe')`) | `getStripeClient()` | runtime (DB/admin) | — | Webhook returns 503 if unset (existing behavior, route.ts:37-39) |
| `STRIPE_WEBHOOK_SECRET` / `STRIPE_CONNECT_WEBHOOK_SECRET` | signature verify | env | — | 400 on verify fail (existing) |
| `NEXT_PUBLIC_APP_URL` | success/cancel URLs | env | — | already used by subscription checkout |
| `processed_stripe_events` table | event idempotency | ✓ (Phase 58 migration applied) | — | — |
| `credit_ledger` + `companies.credit_balance` | grant writes | ✓ (Phase 112 migration `20260624000004`) | — | — |
| `billing_config` row | grant amounts / packs | ✓ (Phase 111; null-safe DEFAULT) | — | `DEFAULT_BILLING_CONFIG` when no row |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Stripe secret key at runtime (webhook 503s gracefully; this is existing, not new).

> **No new migration needed.** `processed_stripe_events`, `credit_ledger`, and `companies.credit_balance` all already exist. If the planner believes a migration is required, that is a signal something is being re-built that already exists — re-check.

## Validation Architecture

> nyquist_validation is enabled (config.json `workflow.nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/billing/stripe-webhook.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| TOPUP-01 | `invoice.paid` grants `tiers[tier].monthlyCreditGrant` via `grantCredits(idempotencyKey=event.id)`; redelivery → no double-grant | unit | `npx vitest run tests/unit/billing/stripe-webhook.test.ts` | ✅ extend (add grant cases) |
| TOPUP-01 | grant amount read from `getBillingConfig()`, free tier (0) = no row | unit | `npx vitest run tests/unit/billing/stripe-webhook.test.ts` | ✅ extend |
| TOPUP-02 | new top-up route creates `mode:'payment'` session with `price_data` from `topUpPacks` + `metadata.type='credit_topup'` | unit | `npx vitest run tests/unit/billing/topup-checkout.test.ts` | ❌ Wave 0 (new, mirror `checkout.test.ts`) |
| TOPUP-02 | `checkout.session.completed` w/ `type='credit_topup'` + `payment_status='paid'` → `grantCredits(reason:'topup')` | unit | `npx vitest run tests/unit/billing/stripe-webhook.test.ts` | ✅ extend |
| TOPUP-03 | over-balance (`shortfall>0`) response carries a top-up path; generation NOT blocked (enforcement off) | unit | `npx vitest run tests/unit/billing/overage-affordance.test.ts` | ❌ Wave 0 (new) |
| MIG-01 | `checkQuota`/`entitlements` count path unchanged; credits additive | unit | `npx vitest run tests/unit/quota.test.ts` (existing) + grep guard | ✅ existing (regression) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/billing/stripe-webhook.test.ts` (+ the new top-up/affordance files as they land)
- **Per wave merge:** `npx vitest run tests/unit/billing`
- **Phase gate:** `npx vitest run` full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/billing/topup-checkout.test.ts` — covers TOPUP-02 route (mirror existing `tests/unit/billing/checkout.test.ts`)
- [ ] `tests/unit/billing/overage-affordance.test.ts` — covers TOPUP-03 path (enforcement-off, no block)
- [ ] Extend `tests/unit/billing/stripe-webhook.test.ts` — add `invoice.paid` grant cases + `checkout.session.completed` top-up arm cases (the file already mocks `requireServiceClient` + Stripe; add a `grantCredits`/`getBillingConfig` mock)
- *(Framework already installed; no install needed.)*

## Sources

### Primary (HIGH confidence — codebase-internal, all read this session)
- `app/api/webhooks/stripe/route.ts` — existing webhook: signature verify, `processed_stripe_events` dedup, `invoice.paid` + `checkout.session.completed` branches
- `app/api/billing/create-checkout-session/route.ts` — the subscription checkout pattern to mirror (metadata round-trip proven)
- `lib/billing/credit-ledger.ts` — `grantCredits` (dormant, first caller is this phase), `checkCredits`, idempotency
- `lib/billing/billing-config.ts` — `getBillingConfig`, `tiers[tier].monthlyCreditGrant`, `topUpPacks`
- `lib/entitlements.ts` — static `monthlyCreditGrant` mirror (config is runtime-authoritative)
- `lib/quota.ts` — `checkQuota`/`recordUsage` (the count path MIG-01 must not break) + the 402 over-quota response shape
- `lib/billing/stripe-client.ts` — `getStripeClient()`, `apiVersion: '2026-04-22.dahlia'`, SDK 22.1.1
- `supabase/migrations/20260514000001_phase58_stripe_processed_events.sql` — idempotency table to reuse
- `supabase/migrations/20260624000004_phase112_credit_ledger.sql` — `credit_ledger` + `companies.credit_balance` (already applied)
- `.planning/phases/112-.../112-03-SUMMARY.md` — `grantCredits` ships dormant; this phase is its first caller
- `tests/unit/billing/stripe-webhook.test.ts`, `checkout.test.ts` — existing test patterns to extend/mirror
- `app/api/generate-estimate/route.ts` — existing 402 over-quota pattern (`{error, upgradeUrl}`)
- `.planning/REQUIREMENTS.md` v4.7, `SEED-035` — locked decisions

### Secondary (MEDIUM confidence)
- Stripe Checkout one-time `mode:'payment'` + inline `price_data` shape — corroborated by Stripe docs (line_items require `currency`, `unit_amount`, `product_data.name`); the metadata→`checkout.session.completed` round-trip is independently proven in-repo by the existing subscription handler.

### Tertiary (LOW confidence)
- None. (The Stripe metadata round-trip was NOT taken on training-data trust alone — it is verified by the existing subscription checkout + webhook code in this repo.)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new deps; all primitives exist and are pinned/tested
- Architecture: HIGH — every hook point read directly from current source; the metadata round-trip is proven in-repo, not assumed
- Pitfalls: HIGH — derived from the actual control flow (early-break guard, dual events on subscribe, string metadata, dual idempotency)
- Stripe one-time checkout specifics: MEDIUM-HIGH — pattern mirrors the working subscription route; inline `price_data` shape corroborated by Stripe docs

**Research date:** 2026-06-24
**Valid until:** ~2026-07-24 (stable; the only external surface is the Stripe API version, already pinned in-repo)
