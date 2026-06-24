---
phase: 114-estimate-payment-fee-payment-ui-gating-disclosure
verified: 2026-06-24T15:25:00Z
status: passed
score: 12/12 must-haves verified
gaps: []
---

# Phase 114: Estimate Payment Fee / Payment-UI Gating / Disclosure Verification Report

**Phase Goal:** Xtimator earns a platform fee (default 1%, from `billing_config.estimateFeePct`) on estimate payments via `application_fee_amount` on the Direct Charge invoice (owner stays merchant of record). A single `usePaymentsEnabled`/`paymentsEnabled` guard gates all forward-looking payment UI so nothing renders unless `stripe_connect_status==='active'`. The Stripe connect flow clearly discloses the fee (live % from `billing_config`).
**Verified:** 2026-06-24T15:25:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                          | Status     | Evidence                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | A connected-account estimate invoice carries `application_fee_amount = max(round(amt×pct), minCents)` clamped strictly below the charge | ✓ VERIFIED | `invoice-service.ts:79-81` sets the field only when `>0`; `estimate-fee.ts:23` returns `Math.min(floored, amountCents-1)`                  |
| 2   | Fee % and min come from `billing_config` at runtime, never hard-coded                                         | ✓ VERIFIED | `invoice.ts:130` `const { estimateFeePct, estimateFeeMinCents } = await getBillingConfig()`; `estimate-fee.ts` takes pct/min as params    |
| 3   | A 1-cent invoice omits the fee rather than sending an invalid value                                           | ✓ VERIFIED | `estimate-fee.ts` clamps to `amount-1=0`; `invoice-service.ts:79` omits when `0`; test `computeApplicationFee(1,0.01,1)===0`              |
| 4   | Subscription and top-up checkouts carry NO estimate fee (FEE-02 satisfied by FEE-01)                          | ✓ VERIFIED | grep `application_fee_amount` over `app/api/billing/` → 0 matches; FEE-02 note in `invoice.ts:126-129`                                     |
| 5   | A single `paymentsEnabled(company)` predicate is the only source of truth for forward payment UI             | ✓ VERIFIED | `lib/billing/payments-enabled.ts` pure predicate; `invoice.ts:104` and editor both call it; no inline `=== 'active'` payment literal left |
| 6   | When `stripe_connect_status` is not `active`, the owner editor shows NO Generate-invoice affordance           | ✓ VERIFIED | `estimate-editor.tsx:299` `{isCurrent && paymentsEnabled && (<GenerateInvoiceDialog/>)}`                                                  |
| 7   | The `generateInvoice` inline connect check is refactored to call the same predicate                          | ✓ VERIFIED | `invoice.ts:104` `if (!company || !paymentsEnabled(company))`                                                                             |
| 8   | Historical read-only indicators (IssuedInvoicesPanel, Paid badges) stay ungated; both states tested          | ✓ VERIFIED | `estimate-editor.tsx:293-297` IssuedInvoicesPanel intentionally ungated; `editor-payment-gating.test.tsx` covers both states              |
| 9   | The disconnected Connect card shows a clear fee disclosure separate from Stripe's fees                        | ✓ VERIFIED | `stripe-connect-card.tsx:81-86` `data-testid="fee-disclosure"` in the `not_connected` branch only                                         |
| 10  | The disclosed % is the LIVE `billing_config.estimateFeePct` read server-side, never hard-coded                | ✓ VERIFIED | `payments/page.tsx:64` reads `estimateFeePct`, passes `feePct={estimateFeePct}` (line 98); `card:40-41` `feePct*100`; grep `1%` literal→0 |
| 11  | The % formats as `feePct×100` (0.02→"2%"), proven by a config-mock test                                       | ✓ VERIFIED | `payments-disclosure.test.tsx` mocks `getBillingConfig→0.02` asserts "2%", `0.01→"1%"`, absent when connected                            |
| 12  | The Phase-111 dormancy allowlist was extended (not weakened) for the two new consumers                        | ✓ VERIFIED | `billing-config.test.ts:221-228` Set retains Phase-113 entries + adds `INVOICE_ACTION_PATH` + `PAYMENTS_PAGE_PATH`                       |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact                                          | Expected                                                  | Status     | Details                                                                              |
| ------------------------------------------------- | --------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------- |
| `lib/billing/estimate-fee.ts`                     | `computeApplicationFee` pure helper (FEE-04)              | ✓ VERIFIED | Pure (no `server-only`), exported, `amountCents-1` clamp; imported by `invoice.ts`   |
| `lib/billing/invoice-service.ts`                  | `application_fee_amount` on `stripe.invoices.create`      | ✓ VERIFIED | Conditional set when `>0`, with `{ stripeAccount }` reqOpt; InvoiceItem stays fee-free |
| `lib/actions/invoice.ts`                          | reads `estimateFeePct/min`, threads `applicationFeeCents` | ✓ VERIFIED | `getBillingConfig()` + `computeApplicationFee()` + passes to `createConnectInvoice`  |
| `lib/billing/payments-enabled.ts`                 | `paymentsEnabled(company)` predicate (PAYGATE-01)         | ✓ VERIFIED | Pure, exported, single `=== 'active'` definition                                     |
| `components/workspace/estimate/estimate-editor.tsx` | gated GenerateInvoiceDialog                              | ✓ VERIFIED | `{isCurrent && paymentsEnabled && (...)}` at line 299                                |
| `components/settings/stripe-connect-card.tsx`     | feePct-driven disclosure (DISCLOSE-01)                     | ✓ VERIFIED | `feePct` prop, `feePct*100` label, `not_connected`-only disclosure                   |
| `app/(app)/settings/payments/page.tsx`            | server `getBillingConfig().estimateFeePct` → `feePct` prop | ✓ VERIFIED | Line 64 read, line 98 passed                                                         |
| `tests/unit/settings/payments-disclosure.test.tsx` | config-driven proof (0.02 → "2%")                        | ✓ VERIFIED | Exists, green                                                                        |

### Key Link Verification

| From                          | To                            | Via                                              | Status  | Details                                              |
| ----------------------------- | ----------------------------- | ------------------------------------------------ | ------- | ---------------------------------------------------- |
| `invoice.ts`                  | `estimate-fee.ts`             | `computeApplicationFee(amount, pct, min)`        | ✓ WIRED | `invoice.ts:131`                                     |
| `invoice.ts`                  | `invoice-service.ts`          | `createConnectInvoice({ ..., applicationFeeCents })` | ✓ WIRED | `invoice.ts:175`                                     |
| `invoice-service.ts`          | `stripe.invoices.create`      | `application_fee_amount` (omitted when 0)        | ✓ WIRED | `invoice-service.ts:79-81`                           |
| `invoice.ts`                  | `payments-enabled.ts`         | inline check refactored to `paymentsEnabled()`   | ✓ WIRED | `invoice.ts:104`                                     |
| `projects/[id]/page.tsx`      | editor (via prop chain)       | `paymentsEnabled` threaded server→client         | ✓ WIRED | page→ProjectWorkspace→OverviewTab→EstimateTab→Editor |
| `payments/page.tsx`           | `billing-config.ts`           | `await getBillingConfig()` server-side           | ✓ WIRED | `payments/page.tsx:64`                               |
| `payments/page.tsx`           | `stripe-connect-card.tsx`     | `<StripeConnectCard feePct={estimateFeePct} />`  | ✓ WIRED | `payments/page.tsx:98`                               |
| `stripe-connect-card.tsx`     | rendered disclosure copy      | `feePct * 100` interpolation                     | ✓ WIRED | `stripe-connect-card.tsx:40-41`, 85                  |

### Data-Flow Trace (Level 4)

| Artifact                   | Data Variable    | Source                          | Produces Real Data | Status     |
| -------------------------- | ---------------- | ------------------------------- | ------------------ | ---------- |
| `stripe-connect-card.tsx`  | `feePct`         | `getBillingConfig().estimateFeePct` (server, page.tsx) | Yes — live config  | ✓ FLOWING  |
| `estimate-editor.tsx`      | `paymentsEnabled`| `paymentsEnabled(company row)` server-computed in page.tsx | Yes — live company row | ✓ FLOWING  |
| `invoice-service.ts` fee   | `applicationFeeCents` | `computeApplicationFee` ← `getBillingConfig` | Yes — live config + computed amount | ✓ FLOWING  |

### Behavioral Spot-Checks

| Behavior                                  | Command                                            | Result               | Status |
| ----------------------------------------- | -------------------------------------------------- | -------------------- | ------ |
| Billing + settings unit suites green      | `npx vitest run tests/unit/billing tests/unit/settings` | 24 files / 173 passed | ✓ PASS |
| FEE-04 edge cases (1-cent, strict clamp)  | grep `estimate-fee.test.ts`                         | `(1,0.01,1)→0`, `(3,0.5,5)→2`, zero/neg/zero-pct→0 present | ✓ PASS |
| Subscription/top-up carry no fee (FEE-02) | grep `application_fee_amount` in `app/api/billing/` | 0 matches            | ✓ PASS |
| No hard-coded "1%" in card copy           | (verified in source) `feePct*100` interpolation     | config-driven        | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description                                                | Status      | Evidence                                              |
| ----------- | ----------- | --------------------------------------------------------- | ----------- | ----------------------------------------------------- |
| FEE-01      | 114-01      | `application_fee_amount` on Connect invoice path          | ✓ SATISFIED | `invoice-service.ts:79-81`                            |
| FEE-02      | 114-01      | Estimate checkout charges same fee (satisfied-by-FEE-01)  | ✓ SATISFIED | Pay-route superseded; documented `invoice.ts:126-129`; checkouts fee-free |
| FEE-03      | 114-01      | Fee % read from `billing_config`, never hard-coded        | ✓ SATISFIED | `invoice.ts:130`                                      |
| FEE-04      | 114-01      | Fee computed on charged amount, sane min/rounding, never $0 | ✓ SATISFIED | `estimate-fee.ts` + 10 unit cases                    |
| PAYGATE-01  | 114-02      | Single guard gates all payment UI; backs action           | ✓ SATISFIED | `payments-enabled.ts` used by action + editor         |
| PAYGATE-02  | 114-02      | Disconnected → no orphan; both states tested              | ✓ SATISFIED | editor gate + `editor-payment-gating.test.tsx`        |
| DISCLOSE-01 | 114-03      | Connect flow discloses fee, live % from `billing_config`  | ✓ SATISFIED | card + page + `payments-disclosure.test.tsx`          |

No orphaned requirements — all 7 declared in plan frontmatter, all mapped to Phase 114 in REQUIREMENTS.md, all marked Complete.

### Anti-Patterns Found

None. No TODO/FIXME/placeholder in phase files. The `getBillingConfig` mock in `payments-page.test.tsx` is a test stub (intentional), not a production placeholder. The `application_fee_amount: opts.applicationFeeCents` is conditionally spread (correct Stripe behavior), not an empty stub.

### Human Verification Required

None blocking. Optional live smoke (not required for goal verification):
- Connect a real Stripe test account and issue a $100 estimate invoice; confirm a 100-cent `application_fee_amount` lands on the platform account and the disclosed % matches `billing_config`.

### Gaps Summary

No gaps. All 12 must-have truths verified against the actual source (not just SUMMARY claims). The fee rides on the Direct Charge invoice (`application_fee_amount`, conditionally present, computed from live `billing_config`), the single `paymentsEnabled` predicate gates the forward affordance and backs the server action with no inline `=== 'active'` drift, and the fee disclosure renders the live config-driven % only in the `not_connected` branch. Subscription/top-up checkouts correctly carry no fee, the dormancy allowlist was extended (not weakened), and the billing + settings unit suites are green (173 passed). The known `mcp-route-contract.test.ts` parallel-only flake is out of scope and touches no Phase-114 file.

---

_Verified: 2026-06-24T15:25:00Z_
_Verifier: Claude (gsd-verifier)_
