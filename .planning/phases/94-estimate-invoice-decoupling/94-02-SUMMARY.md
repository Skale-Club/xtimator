---
phase: 94-estimate-invoice-decoupling
plan: 02
subsystem: billing
tags: [stripe, connect, invoices, money, server-action, query]

# Dependency graph
requires:
  - phase: 94-01
    provides: invoices table + types + RED contract tests (invoice-split, invoice-service, actions/invoice, queries/invoice)
  - phase: 70-stripe-connect
    provides: Direct-Charges { stripeAccount } request-option pattern, getStripeClient, isDemoCompany guard
provides:
  - "splitDepositBalance: cents-exact deposit/balance split (deposit + balance === total for boundary + 0-decimal currencies)"
  - "createConnectInvoice service: Customer reuse/create -> InvoiceItem (amount) -> Invoice (send_invoice) -> finalize -> read hosted_invoice_url/invoice_pdf on the connected account ({ stripeAccount }, no application_fee_amount, metadata.invoice_id + company_id, idempotencyKey)"
  - "getInvoicesByEstimateId: RLS-scoped read-back returning the stored amount_cents snapshot"
  - "generateInvoice server action: auth -> ownership -> demo guard -> connect-active -> immutable single-insert snapshot row -> returns hosted/pdf URLs"
  - "getInvoicesForEstimate server action wrapper for the editor read-back"
  - "lib/auth/context.ts: shared getAuthContext helper (extracted)"
affects: [94-03-invoice-paid-webhook, 94-04-generate-invoice-ux, 94-06-backfill]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Connected-account Stripe Invoice via the same { stripeAccount } request option as the Phase 70 pay route"
    - "application_fee_amount OMITTED (Stripe rejects 0 -> 100% to the connected account)"
    - "metadata.invoice_id = pre-generated row PK so the invoice.paid webhook routes back to the exact row"
    - "idempotencyKey scoped per estimate+kind to make invoice creation retry-safe"
    - "immutable snapshot: amount_cents + currency + project_name captured at issue time in a single insert"

key-files:
  created:
    - lib/money/invoice-split.ts
    - lib/billing/invoice-service.ts
    - lib/queries/invoice.ts
    - lib/actions/invoice.ts
    - lib/auth/context.ts
  modified: []

key-decisions:
  - "Extracted a shared lib/auth/context.ts getAuthContext (getAuthClaims + getActiveCompanyId) rather than re-inlining — additive; existing inline helpers untouched"
  - "Customer reuse is best-effort (reads the most recent prior invoices.stripe_customer_id for the estimate); degrades to a fresh customer if unreadable"
  - "Snapshot amount computed via toMinorUnits(total) for full, splitDepositBalance for deposit/balance; rejects amount <= 0"
  - "status set to 'paid' if Stripe returns paid immediately, else 'open'"

patterns-established:
  - "Server-action guard order mirrors the Phase 70 pay route: auth -> ownership -> demo guard (before any Stripe call) -> connect-active"

requirements-completed: [INVOICE-03, INVOICE-04, INVOICE-06]

# Metrics
duration: ~8min
completed: 2026-06-19
---

# Phase 94 Plan 02: Stripe Invoice Layer Summary

**The additive Stripe invoice layer — cents-exact deposit/balance split, the connected-account `createConnectInvoice` service, the snapshot read-back query, and the `generateInvoice` server action that wires them together behind the demo + Connect-active guards. Turns the four Wave-0 RED contracts green (16/16).**

## Performance
- **Duration:** ~8 min (interrupted by an API connection drop at the final commit; finished by the orchestrator after spot-check)
- **Tasks:** 3
- **Files modified:** 5 (5 created)

## Accomplishments
- `splitDepositBalance` (INVOICE-04): integer-cents split where `deposit + balance === total` exactly, including boundary totals and 0-decimal currencies (JPY).
- `createConnectInvoice` (INVOICE-03): full connected-account sequence — reuse/create Customer, add an `amount`-based InvoiceItem, create the Invoice with `collection_method: 'send_invoice'` + `days_until_due`, finalize, and read back `hosted_invoice_url` + `invoice_pdf`. Passes `{ stripeAccount }`, OMITS `application_fee_amount`, sets `metadata.invoice_id` + `company_id`, and uses an `idempotencyKey`.
- `getInvoicesByEstimateId` (INVOICE-06): RLS-scoped read returning the stored `amount_cents` snapshot (not a re-derived total).
- `generateInvoice` (INVOICE-03): guard order auth → ownership → demo (before any Stripe call) → Connect-active; snapshots the amount; single immutable insert; returns hosted/pdf URLs. Plus `getInvoicesForEstimate` wrapper.

## Task Commits
1. **Task 1: cents-exact deposit/balance split helper** — `74ada75` (feat)
2. **Task 2: createConnectInvoice Stripe Connect service** — `884d20c` (feat)
3. **Task 3: generateInvoice action + read-back query + shared auth context** — `0013d43` (feat) — committed by the orchestrator after the executor's API drop; work verified complete via the 4 green target tests before committing.

## Verification
- `npx vitest run tests/unit/money/invoice-split.test.ts tests/unit/billing/invoice-service.test.ts tests/unit/actions/invoice.test.ts tests/unit/queries/invoice.test.ts` → **4 files / 16 tests passed**.
- gitleaks ran clean on all commits (hooks enabled, no `--no-verify`); no real secrets.

## Deviations from Plan
- **Added `lib/auth/context.ts`** (a shared `getAuthContext`) — not in the plan's `files_modified`. Additive: existing inline `getAuthContext` helpers elsewhere are untouched; only `lib/actions/invoice.ts` consumes the new shared module. Low risk, isolated.
- Task 3's final commit + this SUMMARY + STATE/ROADMAP bookkeeping were completed by the orchestrator after the executor agent's connection dropped at the end (work was already on disk and test-green).

## Issues Encountered
- API connection drop ended the executor mid-final-commit. Spot-check confirmed Tasks 1–2 committed, Task 3 files on disk and test-green; the orchestrator committed Task 3 and finished bookkeeping.

## Next Phase Readiness
- `generateInvoice` + `getInvoicesByEstimateId` are ready for Plan 94-04's editor UX.
- `createConnectInvoice`'s `metadata.invoice_id` contract is ready for Plan 94-03's `invoice.paid` webhook.

## Self-Check: PASSED
All 5 created files exist on disk; all 3 task commits present in git history (`74ada75`, `884d20c`, `0013d43`).

---
*Phase: 94-estimate-invoice-decoupling*
*Completed: 2026-06-19*
