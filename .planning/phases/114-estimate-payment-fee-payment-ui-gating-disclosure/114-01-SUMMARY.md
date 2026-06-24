---
phase: 114-estimate-payment-fee-payment-ui-gating-disclosure
plan: 01
subsystem: billing
tags: [stripe-connect, application-fee, billing-config, direct-charges, fee]
requires:
  - lib/billing/invoice-service.ts (Phase 94 createConnectInvoice)
  - lib/billing/billing-config.ts (Phase 111 getBillingConfig, estimateFeePct/estimateFeeMinCents)
  - lib/actions/invoice.ts (Phase 94 generateInvoice)
provides:
  - "lib/billing/estimate-fee.ts :: computeApplicationFee (FEE-04)"
  - "application_fee_amount on stripe.invoices.create (FEE-01)"
  - "generateInvoice reads fee%/min from billing_config + threads applicationFeeCents (FEE-03)"
affects:
  - lib/billing/invoice-service.ts
  - lib/actions/invoice.ts
  - tests/unit/billing/billing-config.test.ts (dormancy allowlist)
tech-stack:
  added: []
  patterns:
    - "Pure fee helper (no server-only) so the fee math lives in one reusable place"
    - "Conditional Stripe field — omit application_fee_amount when 0 (Stripe rejects a $0 fee)"
    - "Runtime billing-config read (never hard-coded fee numbers)"
key-files:
  created:
    - lib/billing/estimate-fee.ts
    - tests/unit/billing/estimate-fee.test.ts
  modified:
    - lib/billing/invoice-service.ts
    - lib/actions/invoice.ts
    - tests/unit/billing/invoice-service.test.ts
    - tests/unit/actions/invoice.test.ts
    - tests/unit/billing/billing-config.test.ts
decisions:
  - "FEE-02 is satisfied-by-FEE-01: the Phase-70 standalone estimate checkout pay-route no longer exists (superseded by Phase-94 hosted invoices); the invoice path is the single customer-payment surface. Documented in lib/actions/invoice.ts."
  - "Subscription/top-up checkouts carry NO estimate fee (platform-account charges) — verified untouched."
  - "Fee clamps strictly below the charge (amount - 1); at the 1-cent edge the fee is 0 and the invoice omits the field rather than sending a value Stripe would reject."
metrics:
  duration: ~13m
  tasks: 3
  files: 7
  completed: 2026-06-24
---

# Phase 114 Plan 01: Estimate Payment Fee Summary

The 1% platform application fee now rides on the single real customer-payment surface — the Stripe Connect hosted invoice — via a pure, configurable, margin-safe fee helper wired through `billing_config`.

## What Shipped

- **FEE-04 — `lib/billing/estimate-fee.ts` :: `computeApplicationFee(amountCents, feePct, minCents)`**: a pure module (no `import 'server-only'`, no DB read) returning integer cents = `max(round(amount × pct), minCents)`, clamped strictly below the charge (`amount - 1`). Returns `0` for non-positive amount/pct and at the 1-cent edge (where no positive fee strictly below the charge exists), so the caller omits the field. 10 unit cases cover the full math + edge ladder.
- **FEE-01 — `application_fee_amount` on `stripe.invoices.create`**: `createConnectInvoice` gains a required `applicationFeeCents` opt. The field is set on the **Invoice** object **only when `> 0`** (Stripe rejects a $0 fee — Pitfall 1) and is never an InvoiceItem field (Pitfall 2). The existing `{ stripeAccount }` request option already supplies the Direct-Charge header, so nothing else changed. `idempotencyBase` untouched (Pitfall 6).
- **FEE-03 — `generateInvoice` reads the live fee from `billing_config`**: after the `amountCents <= 0` guard, the action reads `estimateFeePct`/`estimateFeeMinCents` from `getBillingConfig()` and computes `applicationFeeCents`, threading it into `createConnectInvoice`. Fee numbers are never hard-coded and apply without a deploy (30s config cache).
- **FEE-02 — documented satisfied-by-FEE-01**: an in-code note in `lib/actions/invoice.ts` records that the Phase-70 checkout pay-route no longer exists; the invoice path is the single customer-payment surface; subscription/top-up checkouts are platform-account charges and carry no fee (verified: `grep application_fee_amount` over both checkout routes returns nothing).
- **Dormancy guard extended**: the Phase-111 `BILLCFG-03` allowlist (`tests/unit/billing/billing-config.test.ts`) now covers both new `getBillingConfig` consumers — `lib/actions/invoice.ts` (this plan) and `app/(app)/settings/payments/page.tsx` (Plan 03's disclosure %, added pre-emptively so the guard stays green when Plan 03 lands). The guard still fails on any OTHER consumer.

## Tasks & Commits

| Task | Name | Commit | Key files |
| ---- | ---- | ------ | --------- |
| 1 | computeApplicationFee pure helper (FEE-04) | b5c749bb | lib/billing/estimate-fee.ts, tests/unit/billing/estimate-fee.test.ts |
| 2 | application_fee_amount on the invoice (FEE-01) | 1fd7f787 | lib/billing/invoice-service.ts, tests/unit/billing/invoice-service.test.ts |
| 3 | generateInvoice reads fee from billing_config + allowlist (FEE-03, FEE-02 note) | 294a2754 | lib/actions/invoice.ts, tests/unit/actions/invoice.test.ts, tests/unit/billing/billing-config.test.ts |

## Verification

- `npx vitest run tests/unit/billing tests/unit/actions/invoice.test.ts` → **21 files / 160 passed**.
- Plan-touched files (estimate-fee + invoice-service + invoice action + billing-config) → **40/40 passed**.
- `tsc --noEmit -p tsconfig.json` → clean on the three touched source files.
- Fee is never 0 when amount > 1 cent, never ≥ the charge, omitted entirely at amount === 1.
- Subscription + top-up checkout routes untouched (`grep application_fee_amount` returns nothing).
- No migration, no env var; fee%/min read only from `billing_config`.
- All commits normal hooked (gitleaks ran, no `--no-verify`); no leaks (no Stripe secrets in any change — placeholder ids only in tests).

## Deviations from Plan

None — plan executed exactly as written (Tasks 1-3 followed the TDD RED→GREEN flow; Task 1's RED+GREEN committed as a single `feat` since the helper is pure and authored alongside its test).

## Deferred Issues

- **Full-suite flake (out of scope):** `tests/unit/mcp-route-contract.test.ts > GET returns 405` fails ONLY in the full parallel `npx vitest run` (1 failed / 2065 passed); it passes **8/8 in isolation**. Touches no Phase-114 file (no MCP/route/shared module modified). Pre-existing test-isolation/ordering flake, logged to `.planning/phases/114-.../deferred-items.md`. Not fixed per the scope boundary.

## Known Stubs

None. The `app/(app)/settings/payments/page.tsx` allowlist entry is intentionally pre-emptive for Plan 03's disclosure read; it does not reference `getBillingConfig` yet and the allowlist Set tolerates that until Plan 03 wires it (DISCLOSE-01).

## Self-Check: PASSED

- Created files exist: lib/billing/estimate-fee.ts, tests/unit/billing/estimate-fee.test.ts, 114-01-SUMMARY.md
- Commits exist: b5c749bb, 1fd7f787, 294a2754
