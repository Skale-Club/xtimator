# Phase 114: Estimate Payment Fee + Payment-UI Gating + Disclosure - Research

**Researched:** 2026-06-24
**Domain:** Stripe Connect Direct Charges (application fee), payment-UI gating, fee disclosure
**Confidence:** HIGH

## Summary

Phase 114 monetizes estimate payments with a configurable platform fee (default 1%), gates ALL
payment UI behind an active Stripe Connect status, and discloses the fee at connection time. The
Connect infrastructure is already shipped (Phase 70 columns + OAuth flow, Phase 94 hosted
invoices), so this phase is surgical: fill one deliberately-omitted Stripe field, centralize one
gating helper, and add one disclosure block.

**Critical correction to the seed/requirements breadcrumbs:** there is **no longer a standalone
Phase-70 "Pay $X" estimate checkout route** in the codebase. The Phase-70 standalone checkout was
superseded by Phase 94, which moved customer payment to **Stripe hosted invoices** created by
`createConnectInvoice` (`lib/billing/invoice-service.ts`). The only place a customer pays today is
the hosted invoice page reached from `estimate-view.tsx` (share page) and `issued-invoices-panel.tsx`
(editor). A full-repo search for `checkout.sessions.create` with `stripeAccount` / `payment_intent_data`
on the estimate path found **nothing** — only the subscription route (`create-checkout-session`) and
the top-up route (`create-topup-session`), both of which are platform-account charges, NOT
connected-account Direct Charges, and must NOT carry the estimate fee. **FEE-02's `payment_intent_data`
target does not exist; FEE-01 (the invoice path) is the single real charge surface.** The planner
must treat FEE-02 as either (a) a no-op with an explicit "route does not exist, fee lives entirely on
the invoice path" finding, or (b) future-proofing if a checkout pay-route is ever re-introduced.

**Primary recommendation:** Add `application_fee_amount = clamp(round(amountCents × estimateFeePct),
min=estimateFeeMinCents, max=amountCents−1)` to the `stripe.invoices.create(...)` call in
`createConnectInvoice` (read fee% from `getBillingConfig()`); centralize gating in a single
`paymentsEnabled(company)` server helper keyed on `stripe_connect_status === 'active'`; add a fee
disclosure block to the `not_connected` state of `StripeConnectCard` reading the live fee% server-side.

<user_constraints>
## User Constraints (from REQUIREMENTS.md — no CONTEXT.md exists for this phase)

> No `114-CONTEXT.md` exists. The binding constraints come from the milestone v4.7 locked decisions
> and the requirement statements. They are reproduced verbatim below and are authoritative.

### Locked Decisions (milestone v4.7, 2026-06-24)
- **1% estimate application fee** via Direct Charges (owner stays merchant of record; Xtimator never
  custodies funds). Total payment-UI gating on Stripe-connected; clear fee disclosure at connection.
- **Everything super-admin-configurable** via `billing_config` — no hard-coded billing numbers, no
  env vars. The tenant only experiences the result.
- **Stripe is the rail, the credit ledger is OURS** — applies to the credit track; for THIS phase it
  means the fee % and min come from `billing_config`, never hard-coded.

### Requirement statements (binding)
- **FEE-01**: The Stripe Connect invoice path (`lib/billing/invoice-service.ts`) charges a platform
  `application_fee_amount` (the deliberately omitted hook at line 17), routing the fee to the Xtimator
  platform account.
- **FEE-02**: The Phase-70 estimate checkout path charges the same platform fee via
  `payment_intent_data.application_fee_amount`. *(See Open Question 1 — this route no longer exists.)*
- **FEE-03**: The fee percentage is read from `billing_config` (super-admin, default 1%) — never
  hard-coded.
- **FEE-04**: The fee is computed on the amount actually charged (deposit or full total), with a sane
  minimum/rounding so Stripe never receives an invalid (e.g. $0) fee.
- **PAYGATE-01**: A single `usePaymentsEnabled` guard gates all payment UI; every payment page, screen,
  button, and element renders only when the company's Stripe Connect status is `active`.
- **PAYGATE-02**: With Stripe disconnected, no payment-related element appears anywhere (no orphan) and
  the product otherwise works fully; both states are covered by tests.
- **DISCLOSE-01**: The Stripe connection flow shows a clear disclosure that Xtimator charges the
  platform fee (e.g. 1%), separate from Stripe's fees, with the live percentage read from `billing_config`.

### Claude's Discretion
- The exact min/rounding formula for FEE-04 (research recommends `max(round(amt × pct), minCents)`
  clamped below `amountCents`).
- Whether `paymentsEnabled` is one server helper, one client hook, or both (research recommends
  server helper primary; the gated surfaces are mostly server-rendered).
- Exact disclosure copy and placement (recommended: in the `not_connected` CTA card + a perennial note).

### Deferred Ideas (OUT OF SCOPE — do NOT touch)
- **Deposit base for the fee** (SEED-032) — deposit/balance split already exists in invoices, so the
  fee naturally applies to whatever `amountCents` is charged; no new deposit logic in this phase.
- **Credit ledger / credit-billing work** (phases 112/113/115/116) — do NOT touch `credit_ledger`,
  `grantCredits`, `checkCredits`, or any credit surface.
- **Per-tier fee differentiation** (GRAN-02), **transactional-revenue dashboard** (GRAN-04),
  **`refund_application_fee` policy** (GRAN-05) — all v2.
- **Recording the received `application_fee` for reporting** — SEED-036 §5/6 marks this "optional";
  leave out unless trivially free.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FEE-01 | Charge `application_fee_amount` on the Connect invoice path | Add the field to `stripe.invoices.create(...)` in `createConnectInvoice` (invoice-service.ts:67). Confirmed by Stripe docs: the field goes on the invoice with `Stripe-Account` header (= the existing `{ stripeAccount }` reqOpt). |
| FEE-02 | Charge the same fee via `payment_intent_data.application_fee_amount` on the Phase-70 checkout path | **Route does not exist** (superseded by Phase 94 invoices). See Open Question 1. Documented `payment_intent_data.application_fee_amount` shape for completeness/future use. |
| FEE-03 | Fee % read from `billing_config`, never hard-coded | `getBillingConfig().estimateFeePct` (default `0.01`) — already a field on `BillingConfig`. Caller (`generateInvoice` in `lib/actions/invoice.ts`) reads it and passes `feeCents` into `createConnectInvoice`. |
| FEE-04 | Computed on actual charged amount, sane min/rounding, never invalid | `amountCents` is already computed in `generateInvoice` (full/deposit/balance). Stripe requires fee **positive and < charge amount**; use `estimateFeeMinCents` floor + clamp below `amountCents`. |
| PAYGATE-01 | Single `usePaymentsEnabled` guard over all payment UI | Inventory below: 5 surfaces. Recommend one server helper `paymentsEnabled(company)` keyed on `stripe_connect_status === 'active'`. |
| PAYGATE-02 | No orphan when disconnected; both states tested | Audit checklist + the existing two-state test pattern (SEED-020 `payments-page.test.tsx`, `estimate-share-payment.spec.ts`). |
| DISCLOSE-01 | Fee disclosure at connection, live % from `billing_config` | Add to `StripeConnectCard` `not_connected` branch; page (`payments/page.tsx`) reads `getBillingConfig().estimateFeePct` server-side and passes the % into the card. |
</phase_requirements>

## Standard Stack

This is an integration phase on an existing stack — no new libraries.

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `stripe` (Node SDK) | already installed (`getStripeClient()`) | `invoices.create` with `application_fee_amount`; Direct Charges via `{ stripeAccount }` reqOpt | Already the project's Stripe rail (Phases 58/70/94/113) |
| `@/lib/billing/billing-config` | in-repo (Phase 111) | `getBillingConfig()` → `estimateFeePct`, `estimateFeeMinCents` | The locked super-admin config source |
| `zod` | already installed | (no new schema needed — fee read at runtime) | — |
| `vitest` | already installed | unit tests for fee math + gating + dormancy guard | Project test framework |

**No `npm install`. No new migration** — `stripe_connect_status` (the gate flag),
`payment_status`/`payment_amount_cents`, and `billing_config.estimateFeePct`/`estimateFeeMinCents`
all already exist.

### Version verification
The `stripe` package version is pinned by the repo; the fee API (`application_fee_amount` on invoices
and on `payment_intent_data`) has been stable across all recent Stripe API versions and is not version-
sensitive. No registry check required for this phase.

## Architecture Patterns

### Where the fee goes (FEE-01) — the single real surface

`lib/billing/invoice-service.ts` → `createConnectInvoice` → step 3, the `stripe.invoices.create(...)`
call (currently lines 67–76). Today the InvoiceItem (step 2) and Invoice (step 3) deliberately omit any
fee field (header comment line 17, code comment line 55). The fee field belongs on the **Invoice object**,
NOT the InvoiceItem.

**Pattern:** thread the fee in as a new option on `createConnectInvoice` so the math lives in the
caller (which already has `amountCents`, `companyId`, and can read `billing_config`), keeping the
Stripe wrapper a thin executor:

```typescript
// lib/billing/invoice-service.ts — add to the opts type:
//   applicationFeeCents: number  // 0 = omit (Stripe rejects a 0 fee)
//
// then in step 3:
const invoice = await stripe.invoices.create(
  {
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: opts.daysUntilDue,
    pending_invoice_items_behavior: 'include',
    metadata: opts.metadata,
    // FEE-01: omit when 0 — Stripe rejects a $0 application fee (Pitfall 1).
    ...(opts.applicationFeeCents > 0
      ? { application_fee_amount: opts.applicationFeeCents }
      : {}),
  },
  { ...reqOpt, idempotencyKey: `${opts.idempotencyBase}_inv` },
)
// Source: https://docs.stripe.com/invoicing/connect (application_fee_amount on invoices.create + Stripe-Account header)
```

The `{ stripeAccount }` reqOpt (line 43) already sets the `Stripe-Account` header, which IS the Direct
Charge context Stripe's invoice-fee doc requires. Nothing else in the call changes.

### Where the fee is computed (FEE-03/04) — the caller

`lib/actions/invoice.ts` → `generateInvoice`. It already computes `amountCents` (full/deposit/balance,
lines 102–112) and already short-circuits `amountCents <= 0`. Add a fee computation just after, reading
the live config, then pass `applicationFeeCents` into `createConnectInvoice`:

```typescript
// lib/actions/invoice.ts — after amountCents is finalized (and > 0):
const { estimateFeePct, estimateFeeMinCents } = await getBillingConfig()
const applicationFeeCents = computeApplicationFee(amountCents, estimateFeePct, estimateFeeMinCents)
// ... pass into createConnectInvoice({ ..., applicationFeeCents })
```

**Recommended pure helper (testable in isolation, FEE-04):**

```typescript
// lib/billing/estimate-fee.ts (new pure module — no 'server-only', easy to unit-test)
/**
 * Platform application fee in integer cents (FEE-04). Stripe requires the fee to
 * be POSITIVE and STRICTLY LESS than the charge amount, so:
 *   - round(amountCents × feePct), floored at minCents so a tiny charge never
 *     yields a $0 fee Stripe would reject;
 *   - clamped to amountCents - 1 so the fee can never equal/exceed the charge;
 *   - 0 when amountCents <= 0 (caller already guards, but defensive).
 */
export function computeApplicationFee(
  amountCents: number,
  feePct: number,
  minCents: number,
): number {
  if (amountCents <= 0 || feePct <= 0) return 0
  const raw = Math.round(amountCents * feePct)
  const floored = Math.max(raw, minCents)
  return Math.min(floored, amountCents - 1)
}
```

> Edge case to test: `amountCents === 1` (a 1-cent invoice) → `min(max(round(0.01), 1), 0) = 0` → fee
> omitted. Correct: you cannot take a positive fee strictly less than 1 cent. Document this as expected.

### Where the gate lives (PAYGATE-01) — one server helper

Recommend a single **server helper** (most gated surfaces are server components / server actions):

```typescript
// lib/billing/payments-enabled.ts
import type { Database } from '@/types/database.types'

/** PAYGATE-01: the ONE source of truth for "may payment UI render for this company?" */
export function paymentsEnabled(company: {
  stripe_account_id: string | null
  stripe_connect_status: string | null
}): boolean {
  return Boolean(company.stripe_account_id) && company.stripe_connect_status === 'active'
}
```

A client variant is optional. The naming `usePaymentsEnabled` in the requirement implies a hook, but
the surfaces (share page, editor server-render, settings page, dashboard query) are server-side. Use a
plain `paymentsEnabled(company)` predicate; if any client surface needs it, pass the boolean down as a
prop rather than re-deriving. **Do not duplicate the `=== 'active'` literal anywhere** — every gate
calls this helper.

> Note: `generateInvoice` (lib/actions/invoice.ts:98) ALREADY does this check inline
> (`stripe_account_id && stripe_connect_status === 'active'`). Refactor it to call the new helper so the
> server action and the UI gate share one definition (no drift).

### Where the disclosure goes (DISCLOSE-01)

`components/settings/stripe-connect-card.tsx`, the `not_connected` branch (lines 64–68 / footer 85–90).
The page `app/(app)/settings/payments/page.tsx` is a server component that already reads config — it
should additionally `await getBillingConfig()` and pass `estimateFeePct` into `StripeConnectCard` so the
disclosed % is the LIVE value, never a hard-coded "1%" string in JSX.

```typescript
// payments/page.tsx (server) — add:
const { estimateFeePct } = await getBillingConfig()
// pass feePct={estimateFeePct} into <StripeConnectCard />, format as `${(feePct*100).toFixed(...)}%`
```

### Anti-Patterns to Avoid
- **Hard-coding "1%" in disclosure copy or fee math.** Both MUST read `billing_config` (FEE-03,
  DISCLOSE-01 explicit). The number lives in exactly one place.
- **Putting the fee on the InvoiceItem.** `application_fee_amount` is an **Invoice** field, not an
  InvoiceItem field. The InvoiceItem (step 2) must stay fee-free.
- **Adding the fee to the subscription/top-up checkout routes.** `create-checkout-session` and
  `create-topup-session` are **platform-account** charges (Xtimator's own revenue), NOT
  connected-account Direct Charges. Adding `application_fee_amount` there is meaningless/wrong.
- **Re-deriving `stripe_connect_status === 'active'` inline anywhere.** Always call `paymentsEnabled()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Routing the fee to the platform account | Manual transfer / separate charge | `application_fee_amount` on `invoices.create` with `{ stripeAccount }` | Stripe routes the fee atomically on a Direct Charge; a manual transfer reintroduces custody/money-transmitter risk the whole architecture avoids |
| Fee % storage / runtime edit | New env var or constant | `getBillingConfig().estimateFeePct` | Locked decision: super-admin config, no env vars, runtime-editable (BILLCFG-03) |
| "Is payments enabled" everywhere | Inline `status === 'active'` per surface | one `paymentsEnabled(company)` helper | PAYGATE-01 is explicitly "a SINGLE guard"; inline copies are how an orphan appears |
| Two-state UI testing | Ad-hoc | The existing SEED-020 pattern: `tests/unit/settings/payments-page.test.tsx` + `tests/e2e/estimate-share-payment.spec.ts` | The connected/disconnected matrix is already a tested convention |

**Key insight:** the entire fee mechanism is one Stripe field on a Direct Charge — the code was
explicitly left "prepared but omitted" (invoice-service.ts:17). The work is filling one field correctly
(min/clamp) and reading its value from the right place, not building plumbing.

## Common Pitfalls

### Pitfall 1: Stripe rejects a $0 (or non-positive) application fee
**What goes wrong:** Setting `application_fee_amount: 0` (or a value ≥ the charge) makes
`invoices.create` throw, breaking invoice issuance entirely.
**Why it happens:** Stripe requires the fee to be **positive and strictly less than the charge amount**
(confirmed: docs.stripe.com/connect — "must be positive and less than the amount of the charge").
**How to avoid:** `estimateFeeMinCents` floor (default 1) + omit the field entirely when the computed
fee is 0 (the `amountCents === 1` edge) + clamp below `amountCents`. Use the `computeApplicationFee`
helper above.
**Warning signs:** invoice-creation 500s on tiny test amounts; Stripe error "Application fee cannot be…".

### Pitfall 2: Putting the fee on the InvoiceItem instead of the Invoice
**What goes wrong:** No fee is taken (silently) or an API error.
**Why it happens:** the InvoiceItem create (step 2) is the natural-looking place, but
`application_fee_amount` is an **Invoice-object** field.
**How to avoid:** add the field ONLY to `stripe.invoices.create` (step 3). Keep the InvoiceItem
exactly as-is.

### Pitfall 3: Treating FEE-02's checkout route as existing
**What goes wrong:** time wasted searching for / editing a `payment_intent_data` checkout route that
isn't there; or worse, bolting the estimate fee onto the subscription/top-up routes.
**Why it happens:** the seed/requirement breadcrumbs were written against the Phase-70 design, before
Phase 94 replaced the standalone checkout with hosted invoices.
**How to avoid:** see Open Question 1. The fee lives entirely on the invoice path today. Note it
explicitly in the plan so verification doesn't flag FEE-02 as missing.

### Pitfall 4: The Phase-111 dormancy guard fails when a new `getBillingConfig` consumer appears
**What goes wrong:** `tests/unit/billing/billing-config.test.ts` (BILLCFG-03) walks `lib/app/components`
for the `getBillingConfig` symbol and fails the build for any file not in its `ALLOWLIST`.
**Why it happens:** the guard is symbol-scoped by design; this phase adds new legitimate consumers
(`lib/actions/invoice.ts` for the fee%, `app/(app)/settings/payments/page.tsx` for the disclosure %).
**How to avoid:** extend the `ALLOWLIST` set (test file ~lines 212–217) with the new consumer paths,
exactly as 112-03 and 113-03 did (see the in-test comment at lines 203–206). This is a **required**
plan task, not optional. Resolve paths with `resolve(process.cwd(), '<relative>')`.
**Warning signs:** `getBillingConfig may only be referenced by…` test failure listing the new files.

### Pitfall 5: Disconnected company still renders a payment element (orphan)
**What goes wrong:** PAYGATE-02 violated — a badge, link, or button leaks when Stripe is disconnected.
**Why it happens:** a surface that doesn't route through the gate (e.g. the dashboard "Paid" badge,
which reads `payment_status` not Connect status).
**How to avoid:** see the full inventory below; every surface must either be behind `paymentsEnabled()`
OR be provably safe-when-disconnected (the "Paid" badge only renders for historically-paid estimates,
which can only exist if the company WAS connected — document this as an intentional exception, or gate
it too for strict no-orphan compliance). Decide and TEST both states.

### Pitfall 6: Idempotency key collision when adding the fee
**What goes wrong:** none expected, but worth noting — the fee is part of the SAME `invoices.create`
call that already carries `idempotencyKey: ${idempotencyBase}_inv`. Changing only the fee value on a
retry with the same key returns the original (fee-less) invoice.
**How to avoid:** the fee is computed deterministically from a fixed `amountCents`, so a retry produces
the same fee — no key change needed. Do NOT alter `idempotencyBase`.

## Payment-UI Surface Inventory (PAYGATE-01/02)

Every payment-related surface found in the repo, with its current gating and required action:

| # | Surface | File | Current gate | Required action |
|---|---------|------|--------------|-----------------|
| 1 | "Generate invoice" button (owner editor) | `components/workspace/estimate/generate-invoice-dialog.tsx` (rendered by `estimate-editor.tsx:288-297`, only when `isCurrent`) | **None at UI level** — the dialog always renders; the server action `generateInvoice` rejects when not connected | Gate the dialog render on `paymentsEnabled(company)` so it doesn't appear at all when disconnected (no orphan). Editor must receive `stripe_account_id`+`stripe_connect_status`. |
| 2 | "Issued invoices" panel (owner editor) | `components/workspace/estimate/issued-invoices-panel.tsx` (`estimate-editor.tsx:286`) | Returns `null` when `invoices.length === 0` | Safe-when-disconnected (only shows historically-issued invoices, which imply past connection). Gate optionally for strictness; at minimum cover both states in test. |
| 3 | Customer "Pay {kind} — $X" button + "Invoices" card (share page) | `components/share/estimate-view.tsx:226-279` | Renders only when `estimate.invoices.length > 0` and per-invoice `status` | Same safe-when-disconnected reasoning. Confirm the share query (`lib/queries/share.ts`) — if a disconnected company can't have open invoices, this is implicitly gated. TEST disconnected state shows no pay button. |
| 4 | `/settings/payments` Connect card (owner) | `app/(app)/settings/payments/page.tsx` + `components/settings/stripe-connect-card.tsx` | Three-state (`not_configured` / `not_connected` / `connected`) | This is the CONNECT surface itself — must stay visible (it's how you connect). Add DISCLOSE-01 here. Not gated by `paymentsEnabled` (it's the gate's control panel). |
| 5 | Dashboard "Paid" badge | `components/dashboard/project-card.tsx:25`, `components/projects/project-table.tsx:48`, `components/dashboard/project-table-row.tsx:20` (data via `lib/queries/dashboard.ts:78-112`, `payment_status`/`paid_at`) | Renders when `payment_status === 'paid'` | Keyed on `payment_status`, NOT Connect status. A "paid" estimate implies past connection, so safe-when-disconnected. Document as intentional exception OR gate for strict no-orphan. Decide + test. |

**Audit method to prove no orphan (PAYGATE-02):** grep the repo for the payment lexicon
(`payment_status`, `hosted_invoice_url`, `invoice_pdf_url`, `Pay`, `Invoice`, `stripe_account`,
`generateInvoice`) and confirm each hit is either (a) behind `paymentsEnabled()`, or (b) gated by data
that can only exist post-connection (open/paid invoices), with the latter explicitly justified. The
existing test convention (`tests/unit/settings/payments-page.test.tsx`,
`tests/e2e/estimate-share-payment.spec.ts`, `tests/e2e/fixtures/connect-estimates.ts`) already exercises
connected vs. disconnected — extend it to cover surfaces 1, 2, 3, 5.

## Code Examples

### Reading the live fee % for disclosure (server)
```typescript
// app/(app)/settings/payments/page.tsx
import { getBillingConfig } from '@/lib/billing/billing-config'
const { estimateFeePct } = await getBillingConfig()
const feeLabel = `${(estimateFeePct * 100).toFixed(estimateFeePct * 100 % 1 === 0 ? 0 : 2)}%`
// pass feeLabel (or estimateFeePct) into <StripeConnectCard feeLabel={feeLabel} ... />
// Source: lib/billing/billing-config.ts (Phase 111), estimateFeePct default 0.01
```

### Disclosure block in the not_connected branch (DISCLOSE-01)
```tsx
// components/settings/stripe-connect-card.tsx — not_connected branch
// "Xtimator charges a {feeLabel} platform fee on each payment you receive
//  through the platform. This fee is separate from Stripe's processing fees."
// (translated via t(); feeLabel comes from billing_config so it never diverges)
```

### Fee on the invoice (FEE-01) — full call shape
See "Architecture Patterns → Where the fee goes" above. Field: `application_fee_amount` on
`stripe.invoices.create(...)`, omitted when 0, with the existing `{ stripeAccount }` reqOpt.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| SEED-020: 0% application fee, "Xtimator never touches the money, monetizes via SaaS only" | SEED-036: 1% application fee (configurable) on every estimate payment | 2026-06-24 | This phase fills the deliberately-omitted hook; reverses the 0% decision, KEEPS the "100% optional / gated" infra |
| Phase-70 standalone estimate checkout (`payment_intent_data`) | Phase-94 hosted invoices (`createConnectInvoice`) | Phase 94 (2026-06-19) | FEE-02's named route no longer exists; the fee lives on the invoice path only |

**Deprecated/outdated in the breadcrumbs:**
- `app/api/billing/create-checkout-session/route.ts` referenced for FEE-02 is the **subscription**
  route (platform account) — NOT the estimate pay route, and NOT a Direct Charge. The seed itself flags
  this ("atenção: este arquivo é assinatura"). The estimate pay-route it points to does not exist.

## Open Questions

1. **FEE-02: the `payment_intent_data` checkout route does not exist.**
   - What we know: Phase 94 replaced the standalone Phase-70 estimate checkout with hosted invoices.
     Repo-wide search for an estimate-payment `checkout.sessions.create` with `stripeAccount` /
     `payment_intent_data` returns nothing; only subscription + top-up routes exist (both platform-account).
   - What's unclear: whether the planner should (a) mark FEE-02 satisfied-by-FEE-01 with an explicit
     "no checkout path exists" note, or (b) add a guarded code path for future re-introduction.
   - **Recommendation:** (a). Document in the plan that the invoice path is the single customer-payment
     surface, so FEE-01 fully covers the fee requirement; FEE-02 becomes a documented no-op. If a
     checkout pay-route is ever re-added, it must include `payment_intent_data.application_fee_amount`
     using the same `computeApplicationFee` helper (note this in the helper's doc comment).

2. **Strict no-orphan vs. safe-when-disconnected for the "Paid" badge and issued-invoice panels.**
   - What we know: surfaces 2, 3, 5 are keyed on data (open/paid invoices, `payment_status`) that can
     only exist if the company WAS connected.
   - What's unclear: whether PAYGATE-02 "no payment-related element appears anywhere when disconnected"
     should be read literally (gate even historical "Paid" badges) or pragmatically (historical badges
     are fine; only forward-looking pay actions are gated).
   - **Recommendation:** gate forward-looking actions (surfaces 1, 3-pay-button) on `paymentsEnabled()`;
     treat historical read-only indicators (Paid badge, issued panel) as safe and TEST that a
     never-connected company sees none of them (it has no invoices/paid estimates, so they're naturally
     absent). Make the decision explicit in the plan.

3. **Currency of the fee.** The invoice `amountCents` carries `currency_code`; `application_fee_amount`
   is in the same currency as the charge (Stripe requirement). No multi-currency conversion needed — the
   fee is a fraction of the same `amountCents`. No action, just confirm in the plan.

## Environment Availability

Not applicable — code/config-only changes against the already-installed Stripe SDK and existing
`billing_config`. No new external tool, runtime, or service. No new migration (all columns/config exist).

## Validation Architecture

> `.planning/config.json` was modified in the working tree; `workflow.nyquist_validation` was not found
> to be explicitly `false` in the read context, so this section is included. If the planner confirms it
> is `false`, drop this section.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (unit) + Playwright (e2e) |
| Config file | repo root `vitest.config.*` (existing); `tests/e2e/` for Playwright |
| Quick run command | `npx vitest run tests/unit/billing/` |
| Full suite command | `npx vitest run` (baseline ~289 files / 2054 tests per 113-03) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FEE-04 | `computeApplicationFee` math: %, min floor, clamp < amount, 1-cent edge, 0 when amount≤0 | unit | `npx vitest run tests/unit/billing/estimate-fee.test.ts` | ❌ Wave 0 |
| FEE-01 | `createConnectInvoice` passes `application_fee_amount` (and omits when 0) | unit | `npx vitest run tests/unit/billing/invoice-service.test.ts` | ✅ extend (`tests/unit/billing/invoice-service.test.ts` exists) |
| FEE-03 | `generateInvoice` reads `estimateFeePct` from `getBillingConfig()` and passes fee in | unit | `npx vitest run tests/unit/actions/invoice.test.ts` | ✅ extend (`tests/unit/actions/invoice.test.ts` exists) |
| FEE-03/Pitfall4 | dormancy allowlist extended for new `getBillingConfig` consumers | unit | `npx vitest run tests/unit/billing/billing-config.test.ts` | ✅ extend (allowlist) |
| PAYGATE-01 | `paymentsEnabled(company)` predicate (active vs not) | unit | `npx vitest run tests/unit/billing/payments-enabled.test.ts` | ❌ Wave 0 |
| PAYGATE-02 | gated surfaces render in connected, vanish in disconnected | unit + e2e | `npx vitest run tests/unit/settings/payments-page.test.tsx` ; `npx playwright test tests/e2e/estimate-share-payment.spec.ts` | ✅ extend both |
| DISCLOSE-01 | not_connected card shows live fee % from config | unit | `npx vitest run tests/unit/settings/payments-page.test.tsx` | ✅ extend |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/billing/` (+ the touched surface's test file)
- **Per wave merge:** `npx vitest run` (full unit suite green)
- **Phase gate:** full unit suite + the Playwright connect/share specs green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/billing/estimate-fee.test.ts` — covers FEE-04 (the pure fee helper)
- [ ] `tests/unit/billing/payments-enabled.test.ts` — covers PAYGATE-01 (the predicate)
- [ ] Extend `tests/unit/billing/billing-config.test.ts` ALLOWLIST — new `getBillingConfig` consumers (Pitfall 4)
- [ ] Extend `tests/unit/billing/invoice-service.test.ts` — `application_fee_amount` present/omitted
- [ ] Extend `tests/unit/actions/invoice.test.ts` — fee read + passed through
- [ ] Extend `tests/unit/settings/payments-page.test.tsx` — disclosure + gating both states
- [ ] Extend `tests/e2e/estimate-share-payment.spec.ts` — disconnected share page shows no pay surface

## Project Constraints (from CLAUDE.md)

- **No secrets in code/docs/planning** — gitleaks pre-commit blocks `sk_*`, `whsec_*`, etc. Use
  placeholder Stripe ids (`acct_…`, `in_…`) in tests/docs, never real keys. (113-03 confirmed
  placeholder-only commits pass the hook.)
- **Deploy CI→GHCR→Coolify** — never build on the VPS; no deploy action needed this phase (no migration,
  no infra).
- **Service role key never in the browser** — all Stripe calls stay server-side (`server-only` on
  invoice-service; `getBillingConfig` is server-only). The new `paymentsEnabled` predicate is pure and
  may be used either side, but the data it reads comes from the server.
- **Tech stack:** Next.js 14 App Router, TypeScript strict, shadcn/ui, react-hook-form+zod — match the
  existing `StripeConnectCard` / settings-page conventions.
- **No hard-coded billing numbers / no env vars for billing** — fee % and min come ONLY from
  `billing_config` (reinforced by the milestone locked decisions).
- **GSD worktree fails on Windows path limit** (MEMORY) — run executors in-place; the long phase-114
  directory name already risks MAX_PATH, so avoid deep nested temp paths.

## Sources

### Primary (HIGH confidence)
- `lib/billing/invoice-service.ts`, `lib/actions/invoice.ts`, `lib/billing/billing-config.ts`,
  `app/api/webhooks/stripe/route.ts`, `app/(app)/settings/payments/page.tsx`,
  `components/settings/stripe-connect-card.tsx`, `components/share/estimate-view.tsx`,
  `components/workspace/estimate/{generate-invoice-dialog,issued-invoices-panel,estimate-editor}.tsx`,
  `components/dashboard/*`, `lib/queries/dashboard.ts`,
  `supabase/migrations/20260517000001_phase70_stripe_connect_columns.sql`,
  `tests/unit/billing/billing-config.test.ts` (ALLOWLIST), `.planning/STATE.md`,
  `.planning/REQUIREMENTS.md`, `.planning/seeds/SEED-036-*.md`,
  `.planning/phases/111-*/111-01-SUMMARY.md` — read directly this session.
- https://docs.stripe.com/invoicing/connect — `application_fee_amount` is a field on
  `invoices.create` with the `Stripe-Account` header (= Direct Charge). Verified by WebFetch.
- https://docs.stripe.com/connect/direct-charges — application fee must be positive and less than the
  charge amount (FEE-04 basis).

### Secondary (MEDIUM confidence)
- https://docs.stripe.com/api/checkout/sessions/create — `payment_intent_data.application_fee_amount`
  shape (documented for completeness; route does not exist in this repo).
- https://docs.stripe.com/connect/invoices — confirms invoice-level application fee on connected accounts.

### Tertiary (LOW confidence)
- None. All load-bearing claims verified against code or official Stripe docs.

## Metadata

**Confidence breakdown:**
- Fee mechanism (FEE-01/03/04): HIGH — exact field + call site confirmed in code and Stripe docs.
- FEE-02 (checkout path): HIGH that it does NOT exist — exhaustive repo search; only platform-account
  routes found.
- Gating inventory (PAYGATE): HIGH — all five surfaces located and read; only the strict-vs-pragmatic
  no-orphan policy is a decision (Open Question 2), not a fact gap.
- Disclosure (DISCLOSE-01): HIGH — exact component/branch + server config read identified.
- Dormancy-guard impact (Pitfall 4): HIGH — allowlist read directly; pattern set by 112-03/113-03.

**Research date:** 2026-06-24
**Valid until:** ~2026-07-24 (stable; Stripe fee API not version-sensitive, codebase the only moving part)
