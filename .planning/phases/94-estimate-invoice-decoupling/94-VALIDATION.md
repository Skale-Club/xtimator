---
phase: 94
slug: estimate-invoice-decoupling
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-19
---

# Phase 94 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Seeded from 94-RESEARCH.md § Validation Architecture. Task IDs are assigned by the planner; this map is requirement-level until plans exist.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | `vitest` `^4.1.4` (jsdom, globals) |
| **Config file** | `vitest.config.ts` (include `tests/unit/**`, `tests/integration/**`; alias `@`→root; `server-only`→stub) |
| **Quick run command** | `npx vitest run tests/unit/billing tests/unit/webhooks tests/unit/money` |
| **Full suite command** | `npx vitest run` (baseline: 1516 passing / 213 files per STATE.md) |
| **Estimated runtime** | quick ~30s · full ~several min |
| **Conventions** | Late `await import()` after `vi.mock`; explicit `import { ... } from 'vitest'`; class-based mock factories for SDK constructors; per-table Supabase `.from()` mocks; `vi.stubEnv` with **placeholder** secret values only |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/unit/billing tests/unit/webhooks tests/unit/money` (< 30s)
- **After every plan wave:** `npx vitest run` (full suite; must stay ≥ the 1516 baseline minus deleted pay-route tests, plus new tests)
- **Phase gate (before `/gsd:verify-work`):** full suite green + manual Stripe CLI webhook simulation of `invoice.paid` on a connected account (placeholder secret) + manual end-to-end issue-deposit-then-balance in Stripe test mode
- **Max feedback latency:** ~30 seconds

---

## Per-Requirement Verification Map

| Req ID | Behavior | Test Type | Automated Command | File Exists | Status |
|--------|----------|-----------|-------------------|-------------|--------|
| INVOICE-01 | `saveEstimate` no longer blocks on consolidated; send/share/pdf routes have no consolidated gate | unit | `npx vitest run tests/unit/actions/estimate.test.ts` | ❌ W0 | ⬜ pending |
| INVOICE-01 | Share page renders live estimate (no `notFound` on non-consolidated) | unit | `npx vitest run tests/unit/share-query.test.ts` | ✅ update | ⬜ pending |
| INVOICE-02 | `invoices` migration: table, RLS via `company_members`, indexes, CHECKs | unit (migration text) | `npx vitest run tests/unit/billing/invoices-migration.test.ts` | ❌ W0 | ⬜ pending |
| INVOICE-03 | Invoice service: customer reuse, `amount` InvoiceItem, `send_invoice`, NO `application_fee_amount`, `{stripeAccount}`, metadata.invoice_id, idempotencyKey | unit | `npx vitest run tests/unit/billing/invoice-service.test.ts` | ❌ W0 | ⬜ pending |
| INVOICE-03 | `generateInvoice` action: demo guard blocks Stripe, requires active Connect, persists row, returns URLs | unit | `npx vitest run tests/unit/actions/invoice.test.ts` | ❌ W0 | ⬜ pending |
| INVOICE-04 | `splitDepositBalance`: deposit+balance == total for boundary totals + 0-decimal currency | unit | `npx vitest run tests/unit/money/invoice-split.test.ts` | ❌ W0 | ⬜ pending |
| INVOICE-05 | Connect `invoice.paid` → marks `invoices` row paid by metadata.invoice_id + emails + notification; dedup skips; platform `invoice.paid` untouched | unit | `npx vitest run tests/unit/webhooks/connect-events.test.ts` (+ keep `tests/unit/billing/stripe-webhook.test.ts` green) | ✅ rewrite | ⬜ pending |
| INVOICE-06 | Issued invoice amount is the stored snapshot, not re-derived; editor read-back lists invoices | unit | `npx vitest run tests/unit/queries/invoice.test.ts` | ❌ W0 | ⬜ pending |
| INVOICE-07 | Backfill creates one `kind=full,status=paid` invoice per paid estimate; `/estimate/[token]/pay` removed | unit (migration) + grep absence | `npx vitest run tests/unit/billing/invoices-backfill-migration.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/billing/invoice-service.test.ts` — INVOICE-03 (Stripe sequence, no app fee, idempotency, demo guard at service boundary)
- [ ] `tests/unit/actions/invoice.test.ts` — INVOICE-03 (action: demo guard, Connect-active check, row persist)
- [ ] `tests/unit/money/invoice-split.test.ts` — INVOICE-04 (cents exactness)
- [ ] `tests/unit/billing/invoices-migration.test.ts` — INVOICE-02 (DDL text: RLS `company_members`, CHECKs, indexes)
- [ ] `tests/unit/billing/invoices-backfill-migration.test.ts` — INVOICE-07 (backfill correctness)
- [ ] `tests/unit/queries/invoice.test.ts` — INVOICE-06 (read-back, snapshot)
- [ ] `tests/unit/actions/estimate.test.ts` — INVOICE-01 (save no longer blocks) — may be new
- [ ] REWRITE `tests/unit/webhooks/connect-events.test.ts` — Connect `invoice.paid` (INVOICE-05)
- [ ] UPDATE `tests/unit/share-query.test.ts`, `tests/unit/utils/estimate-template.test.ts`, `tests/e2e/fixtures/connect-estimates.ts` — drop `workflow_status`/`consolidated_*` from fixtures
- [ ] DELETE `tests/unit/billing/estimate-pay.test.ts` with the retired route
- [ ] Framework install: none — `vitest` present

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `invoice.paid` webhook end-to-end on a connected account | INVOICE-05 | Requires live Stripe (test mode) + Connect account; not unit-simulable end-to-end | Stripe CLI `trigger invoice.paid` / real pay on hosted invoice → confirm `invoices` row flips to paid, owner + customer emails arrive, in-app notification fires |
| Issue deposit then balance in Stripe test mode | INVOICE-04, INVOICE-03 | Validates two independent hosted invoices + PDFs from one estimate | Generate 30% deposit invoice, pay it, then generate balance invoice, pay it; confirm two rows, amounts sum to total |

---

## Validation Sign-Off

- [ ] All tasks have automated verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter (after planner maps tasks)

**Approval:** pending
