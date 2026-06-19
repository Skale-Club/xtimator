# Phase 94: Estimate–Invoice Decoupling + Stripe Invoices - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-19
**Phase:** 94-estimate-invoice-decoupling
**Areas discussed:** Stripe mechanism, Consolidate model, Partial payments, Scaffolding

---

## Stripe mechanism

| Option | Description | Selected |
|--------|-------------|----------|
| Payment Link (fast) | Reuse ~90% of current Checkout/Direct Charges; button generates a hosted payment page. No invoice document. | |
| Stripe Invoice real | `stripe.invoices.create` on the connected account: hosted invoice + PDF + auto-email + lifecycle. A true "guia de pagamento". More work (Customer + InvoiceItem). | ✓ |
| Começar com Link, evoluir | v1 with Payment Link, migrate to real Invoice later. | |

**User's choice:** Asked "qual é o mais correto?" → deferred to recommendation. Resolved to **Stripe Invoice real**.
**Notes:** The deposit+balance requirement decided it — with Payment Links, deposit+balance would be two bare payment pages with no document, defeating the "guia de pagamento" goal. Stripe Invoice maps deposit+balance to two real invoices, each with PDF + reminders, and Stripe owns the lifecycle (less custom state machine).

---

## Consolidate model

| Option | Description | Selected |
|--------|-------------|----------|
| Remover por completo | Estimate always editable, one per project. Delete `workflow_status`, the consolidated gate, and version forking. Simpler model; more files touched + data migration. | ✓ |
| Manter versão manual opcional | Drop the forced lock but keep "save a version" as an optional action for history. | |

**User's choice:** **Remover por completo.**
**Notes:** The daily friction was being forced to fork a whole new version for a small edit after consolidating. User wants a single living estimate; immutability moves to the invoice instead.

---

## Partial payments (deposit)

| Option | Description | Selected |
|--------|-------------|----------|
| Só fatura cheia (v1) | One invoice = full estimate total. Simplest start. | |
| Depósito + saldo agora | Issue a deposit invoice (e.g. 30%) and a balance invoice from the same estimate. More useful; adds partial-amount logic. | ✓ |

**User's choice:** **Depósito + saldo agora.**
**Notes:** Deposit and balance become two independent real Stripe Invoices off the same estimate (`kind = deposit` / `balance`); full amount = `kind = full`.

---

## Scaffolding (how to register Phase 94)

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 94 + CONTEXT agora | Add Phase 94 to ROADMAP.md under a new milestone (v4.3) and write CONTEXT.md from the locked decisions; go straight to plan-phase. | ✓ |
| Milestone completa primeiro | Run `/gsd:new-milestone` (full requirements gathering) before capturing context. | |
| Só um doc de decisão | No roadmap/GSD changes; loose markdown summary + manual implementation. | |

**User's choice:** **Phase 94 + CONTEXT agora.**
**Notes:** `discuss-phase` requires an existing roadmap phase; Phase 94 did not exist (`phase_found: false`). Planning state had drift (STATE.md frontmatter said v1.5/verifying while ROADMAP showed v4.2 shipped through Phase 93). Chosen path: add Phase 94 under new milestone v4.3 "Invoices & Always-Editable Estimates" and capture context directly since the discussion was already complete.

## Claude's Discretion

- `invoices` column names/types/indexes.
- Deposit-% input UX and exact placement of "Generate invoice".
- Invoice numbering (Stripe-managed vs own).
- Whether legacy `estimates.payment_*` columns are dropped now or left dormant.
- Stripe due-date / reminder defaults.
- How the share page surfaces pay-deposit / pay-balance links to the client.

## Deferred Ideas

- Tax / itemized invoices; refunds beyond notification; recurring/scheduled plans beyond deposit+balance; credit notes; manual estimate versioning (explicitly rejected for this phase).
