# Phase 94: Estimate–Invoice Decoupling + Stripe Invoices - Context

**Gathered:** 2026-06-19
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the estimate "consolidate" lock model with **always-editable estimates** plus a separate **Invoice** entity. The invoice is an immutable financial snapshot generated on demand from an estimate; it issues a **real Stripe Invoice** (hosted page + PDF + email + reminders) on the company's connected account, supports **deposit + balance** as two independent invoices, and carries its own payment state.

The core re-modeling: today the `estimates` table is both the negotiable proposal AND the frozen financial object (payment columns live on it, the webhook marks the estimate paid). This phase splits those roles — the estimate stays a living proposal, the invoice becomes the frozen object that carries money. Immutability moves off the estimate and onto the invoice.

**In scope:** remove consolidate/versioning lock, `invoices` table, "Generate invoice" action, Stripe Invoice creation (Customer + InvoiceItem + finalize), deposit + balance, `invoice.paid` webhook handling, issued-invoice display in the editor, data migration + retirement of the old Checkout pay route.

**Out of scope:** tax/line-item-level invoicing, recurring/scheduled payments beyond deposit+balance, credit notes, full refund handling (only the existing best-effort refund notification stays).

</domain>

<decisions>
## Implementation Decisions

### Estimate model change (consolidate removed)
- **D-01:** The `consolidate` concept is removed entirely. Estimates are always editable.
- **D-02:** Remove `consolidateEstimate` and the save write-block that rejects writes when `workflow_status === 'consolidated'` (`lib/actions/estimate.ts:86`, `:658`).
- **D-03:** Remove the forced version-fork model: `createNewDraftVersion` and the "one active draft per project" unique index are retired. (Manual versioning was explicitly rejected in favor of a single always-editable estimate per project — see Deferred if revisited.)
- **D-04:** Drop the `workflow_status = 'consolidated'` gate everywhere it appears: share page (`app/estimate/[token]/page.tsx:57`), send tab (`components/workspace/send/send-tab.tsx`), send routes (`app/api/estimates/[id]/send/*`), and the project header status badge (`components/workspace/project-header.tsx`).
- **D-05:** The public share link now renders the live estimate (a quote). Whether sending/sharing should snapshot what the client saw is **out of scope** — the invoice is the frozen artifact, not the estimate.

### Invoice entity & data model
- **D-06:** New `invoices` table. One estimate → many invoices.
- **D-07:** An invoice row is an **immutable snapshot** taken at issue time: `amount_cents`, `currency_code`, and enough of the estimate (project name / description) to render independently. Editing the estimate afterward never mutates an issued invoice.
- **D-08:** Columns include at least: `id`, `estimate_id`, `company_id`, `kind` (`deposit` | `balance` | `full`), `amount_cents`, `currency_code`, `status` (mirrors Stripe lifecycle: `draft`/`open`/`paid`/`void`/`uncollectible`), `stripe_invoice_id`, `stripe_customer_id`, `hosted_invoice_url`, `invoice_pdf_url`, `paid_at`, `created_at`. (Exact names = Claude's discretion.)
- **D-09:** RLS scoped to `company_id`, consistent with every other tenant table. ⚠️ **Correction (see 94-RESEARCH.md):** use the **`company_members` subquery pattern** introduced by Phase 82 (migration `20260526000001`), NOT the legacy `companies WHERE user_id` form — a migration assertion fails the build if any policy still references `companies.user_id`. RESEARCH.md has the exact policy SQL.
- **D-10:** Payment state lives on the **invoice**, not the estimate. The legacy `estimates.payment_status` / `paid_at` / `stripe_payment_intent_id` / `payment_amount_cents` columns stop being the source of truth (kept for backfill/history; planner decides whether to deprecate in place vs migrate off).

### Stripe mechanism
- **D-11:** Use **real Stripe Invoices** (`stripe.invoices.create` + `invoiceItems.create` + finalize) on the connected account via Direct Charges — same `{ stripeAccount }` per-request option already used in `app/api/estimate/[token]/pay/route.ts`. NOT a Payment Link / Checkout Session.
- **D-12:** Rationale (locked): the user wants a real "guia de pagamento" (hosted invoice page + PDF + email + reminders), and deposit+balance maps cleanly to two real invoices. Payment Links would be bare payment pages with no document.
- **D-13:** Application fee is **omitted** (0%) — same as today (Stripe rejects `application_fee_amount: 0`; omitting yields 100% to the connected account). Xtimator monetizes via SaaS plans.
- **D-14:** Requires creating/reusing a Stripe **Customer** on the connected account before the invoice. Reuse a stored customer id when present.

### Deposit + balance (partial payments)
- **D-15:** Deposit + balance ships **now** (not deferred).
- **D-16:** A deposit (e.g. 30%) and the balance (remainder) are issued as **two separate, independent real Stripe Invoices** from the same estimate, each its own `invoices` row with `kind = deposit` / `kind = balance`.
- **D-17:** Issuing the full amount in one shot is `kind = full`.

### Generate-invoice UX
- **D-18:** A "Generate invoice" action lives in the estimate editor. The owner chooses a deposit % (or full amount), then the action: creates/reuses the Customer → creates the Stripe Invoice → finalizes → persists the `invoices` row → returns the hosted invoice URL + PDF.
- **D-19:** Issued invoices are surfaced inline in the editor so editing-after-issue isn't confusing — e.g. "Invoice issued: $X · {status}". This is the UX guardrail for the frozen-snapshot semantics (D-07).

### Webhook & payment completion
- **D-20:** The Connect webhook (`lib/billing/connect-webhook.ts`, `handleConnectEvent`) handles `invoice.paid` (events where `event.account` is present), matches by `metadata.invoice_id`, and marks the matching `invoices` row paid. Today it handles `checkout.session.completed` and marks the estimate via `metadata.estimate_id` — that path is replaced.
- **D-21:** Reuse the existing payment-received + receipt emails (`lib/email/payment-emails.ts`) and the in-app `payment.received` notification — repoint payloads from estimate → invoice. Idempotency stays via the existing `processed_stripe_events` insert in `app/api/webhooks/stripe/route.ts`.

### Migration & retirement
- **D-22:** Migration backfills one `invoices` row (`kind = full`, `status = paid`) per already-paid estimate so payment history is preserved.
- **D-23:** Retire the old `/estimate/[token]/pay` Checkout Session route and the `consolidated` gate. Existing estimates must load without error after the migration.

### Claude's Discretion
- Exact `invoices` column names/types and index choices.
- Deposit-% input UX (preset chips vs slider vs free input) and exact placement of "Generate invoice" (editor floating actions vs Send tab).
- Invoice numbering (Stripe-managed vs own scheme).
- Whether legacy `estimates.payment_*` columns are dropped now or left dormant for history.
- Stripe `days_until_due` / auto-advance / reminder cadence defaults.
- How the share page surfaces "Pay deposit / Pay balance" links for issued invoices to the client.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Model being replaced
- `.planning/seeds/SEED-028-estimate-editing-workflow-draft-consolidate.md` — The draft→consolidate workflow this phase retires; explains the original intent and constraints.

### Stripe Connect foundation (reuse, do not rebuild)
- `.planning/seeds/SEED-020-stripe-connect-customer-payments.md` — Original Stripe Connect customer-payments design (Phase 70). Direct Charges, 0% app fee, webhook-as-source-of-truth.
- `docs/STRIPE-CONNECT-OWNER-SETUP.md` — Connected-account setup, env vars, and Connect onboarding for the business owner.
- ROADMAP.md → "Phase 70: Stripe Connect" success criteria — the existing, shipped customer-payment behavior being re-modeled.

> No formal ADRs in this repo. The authoritative implementation anchors are the code files listed in `code_context` below — treat them as the spec for current behavior.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/billing/stripe-client.ts` (`getStripeClient`) — per-request Stripe client; reuse for invoice creation.
- `lib/billing/connect-webhook.ts` (`handleConnectEvent`) — Connect-branch webhook dispatch; add `invoice.paid` case here.
- `app/api/webhooks/stripe/route.ts` — webhook entry: raw-body-first signature verify, dual platform/connect secrets, `processed_stripe_events` idempotency, then `event.account ? handleConnectEvent : handlePlatformEvent`. Don't disturb the ordering.
- `lib/email/payment-emails.ts` (`sendPaymentReceivedEmail`, `sendPaymentReceiptEmail`) — repoint to invoice context.
- `lib/notifications/dispatch.ts` (`notify`) + `lib/notifications/copy.ts` (`buildNotificationCopy('payment.received', …)`) — reuse for the paid notification.
- `lib/money/currency.ts` (`normalizeCurrencyCode`, `formatMinorUnits`) — currency handling for amounts/emails.
- `lib/supabase/service.ts` (`requireServiceClient`) — service-role client used by webhook to bypass RLS.
- `lib/queries/share.ts` (`getEstimateByShareToken`) — share-token resolution used by the customer-facing pay route.
- `app/api/estimate/[token]/pay/route.ts` — current Checkout pattern (Direct Charges via `{ stripeAccount }`, metadata, 303 redirect, demo guard). The `{ stripeAccount }` + metadata pattern carries over to invoices; the Checkout body is replaced.

### Established Patterns
- Direct Charges: every connected-account Stripe call passes `{ stripeAccount: company.stripe_account_id }` as the request option (not in the body).
- `application_fee_amount` is OMITTED (Stripe rejects 0).
- Stripe metadata carries `{ company_id, estimate_id }` on both the Session and the PaymentIntent today — add `invoice_id` and key the webhook off it.
- Webhook idempotency via `processed_stripe_events` insert (23505 = already processed) — already in place; invoices ride the same path.
- Server actions return discriminated `{ error }` | `{ data }` / `{ success }`; auth via `getAuthContext()`.
- Migrations: TEXT + CHECK constraints over Postgres enums (e.g. `payment_status CHECK (... IN (...))`); RLS subquery scoping on `company_id`; types often hand-extended in `types/database.types.ts` (Docker-less Windows env).

### Integration Points
- `estimates` table & `lib/actions/estimate.ts` — remove consolidate/version logic; estimate becomes always-editable.
- Estimate editor (`components/workspace/estimate/estimate-editor.tsx`, `estimate-floating-actions.tsx`, `use-estimate-reducer.ts`) — drop consolidate actions; add "Generate invoice" + issued-invoice display.
- `supabase/migrations/20260520000003_estimate_workflow_status.sql` (workflow_status) and `20260517000001_phase70_stripe_connect_columns.sql` (payment_* on estimates) — the schema this phase unwinds / supersedes.
- Customer-facing share page (`app/estimate/[token]/page.tsx`) — drop consolidated gate; surface issued-invoice pay links.

</code_context>

<specifics>
## Specific Ideas

- Mental model the user articulated: **estimate = proposta viva** (always editable), **invoice = cobrança congelada** (frozen, carries money). "O consolidate morre, o estimate fica vivo, e a invoice é o objeto congelado que carrega o dinheiro."
- Real-world reference: QuickBooks / Stripe flow — *quote → invoice*. The invoice is the deliverable "guia de pagamento" the client receives.
- Deposit example used in discussion: 30% deposit + 70% balance as two invoices.
- UX guardrail the user agreed matters: after issuing an invoice, the estimate screen must show the issued invoice + status so an edited estimate vs an issued invoice amount is never confusing.

</specifics>

<deferred>
## Deferred Ideas

- **Tax / line-item-level invoices** — invoices snapshot a single total amount for now; itemized/tax invoices are a later concern.
- **Refunds beyond notification** — the existing best-effort `charge.refunded` notification stays; full refund state handling on invoices is out of scope (matches current Phase 70 scope).
- **Recurring / scheduled payment plans** beyond deposit+balance (e.g. milestone billing, installments via Stripe Subscriptions/Schedules).
- **Credit notes / partial payment of a single invoice.**
- **Manual estimate versioning** — explicitly rejected for this phase (single always-editable estimate per project). Revisit only if "snapshot of what the client saw" becomes a requirement.

</deferred>

---

*Phase: 94-estimate-invoice-decoupling*
*Context gathered: 2026-06-19*
