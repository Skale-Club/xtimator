# Phase 94: Estimate–Invoice Decoupling + Stripe Invoices - Research

**Researched:** 2026-06-19
**Domain:** Stripe Invoicing API on Connect (Direct Charges), Supabase RLS schema design, large-scale code removal (consolidate/versioning retirement)
**Confidence:** HIGH (Stripe API verified against current docs + pinned SDK version `2026-04-22.dahlia`; blast radius verified by grep across the live codebase)

## Summary

This phase replaces the estimate "consolidate" lock with a separate `invoices` entity that issues **real Stripe Invoices** on the company's connected account. The Stripe side is a near-perfect reuse of the Phase 70 Connect foundation: the per-request `{ stripeAccount }` option, the `application_fee_amount`-omitted pattern, the `metadata`-keyed webhook, and `processed_stripe_events` idempotency are all already in production and verified. The new Stripe surface is a Customer → InvoiceItem → Invoice → finalize/send sequence (the docs confirm `send_invoice` collection with `days_until_due`), plus an `invoice.paid` webhook case alongside the existing `checkout.session.completed`.

The larger and riskier half is **removing consolidate**. The concept is woven through 7 server-side gates (save write-block, share page, 4 send routes, refine route, PDF route), 2 server actions (`consolidateEstimate`, `createNewDraftVersion`), the editor + floating-actions + reducer + project-header UI, the `EstimateWithSections` type, the share query's field-strip, a SQL unique index, and several test fixtures. None of it can be deleted blindly: `workflow_status`/`is_current`/`version` are real NOT-NULL columns with a partial unique index and they appear in test fixtures that must stay compilable. The plan must sequence schema change, gate removal, UI removal, and test rewrites together.

**Primary recommendation:** Build the `invoices` table + Stripe invoice service + `invoice.paid` webhook case **first** (additive, low-risk, mirrors Phase 70), then remove consolidate in a dedicated wave that touches all 18+ files in one coherent pass with a green test suite as the gate. Keep the legacy `estimates.payment_*` columns dormant (do not drop) — they back the migration and carry history.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Estimate model change (consolidate removed)**
- **D-01:** The `consolidate` concept is removed entirely. Estimates are always editable.
- **D-02:** Remove `consolidateEstimate` and the save write-block that rejects writes when `workflow_status === 'consolidated'` (`lib/actions/estimate.ts:86`, `:658`).
- **D-03:** Remove the forced version-fork model: `createNewDraftVersion` and the "one active draft per project" unique index are retired. (Manual versioning explicitly rejected in favor of a single always-editable estimate per project.)
- **D-04:** Drop the `workflow_status = 'consolidated'` gate everywhere: share page (`app/estimate/[token]/page.tsx:57`), send tab (`components/workspace/send/send-tab.tsx`), send routes (`app/api/estimates/[id]/send/*`), project header status badge (`components/workspace/project-header.tsx`).
- **D-05:** The public share link now renders the live estimate (a quote). Whether sending/sharing should snapshot what the client saw is out of scope — the invoice is the frozen artifact.

**Invoice entity & data model**
- **D-06:** New `invoices` table. One estimate → many invoices.
- **D-07:** An invoice row is an immutable snapshot at issue time: `amount_cents`, `currency_code`, and enough of the estimate (project name / description) to render independently. Editing the estimate afterward never mutates an issued invoice.
- **D-08:** Columns include at least: `id`, `estimate_id`, `company_id`, `kind` (`deposit`|`balance`|`full`), `amount_cents`, `currency_code`, `status` (mirrors Stripe: `draft`/`open`/`paid`/`void`/`uncollectible`), `stripe_invoice_id`, `stripe_customer_id`, `hosted_invoice_url`, `invoice_pdf_url`, `paid_at`, `created_at`. (Exact names = Claude's discretion.)
- **D-09:** RLS scoped to `company_id`, consistent with every other table (subquery pattern). **[See RESEARCH note: the CURRENT canonical pattern is the `company_members` subquery from Phase 82, NOT the older `companies WHERE user_id` subquery quoted in CONTEXT — match Phase 82. Detail in Architecture Patterns.]**
- **D-10:** Payment state lives on the **invoice**, not the estimate. Legacy `estimates.payment_status`/`paid_at`/`stripe_payment_intent_id`/`payment_amount_cents` stop being the source of truth (kept for backfill/history; planner decides deprecate-in-place vs migrate off).

**Stripe mechanism**
- **D-11:** Use real Stripe Invoices (`stripe.invoices.create` + `invoiceItems.create` + finalize) on the connected account via Direct Charges — same `{ stripeAccount }` per-request option as `app/api/estimate/[token]/pay/route.ts`. NOT a Payment Link / Checkout Session.
- **D-12:** Rationale (locked): real "guia de pagamento" (hosted invoice page + PDF + email + reminders); deposit+balance maps cleanly to two real invoices.
- **D-13:** Application fee is omitted (0%) — Stripe rejects `application_fee_amount: 0`; omitting yields 100% to the connected account.
- **D-14:** Requires creating/reusing a Stripe Customer on the connected account before the invoice. Reuse a stored customer id when present.

**Deposit + balance**
- **D-15:** Deposit + balance ships now (not deferred).
- **D-16:** Deposit (e.g. 30%) and balance (remainder) are two separate, independent real Stripe Invoices from the same estimate, each its own `invoices` row with `kind = deposit` / `kind = balance`.
- **D-17:** Issuing the full amount in one shot is `kind = full`.

**Generate-invoice UX**
- **D-18:** A "Generate invoice" action lives in the estimate editor. The owner chooses a deposit % (or full amount); the action creates/reuses Customer → creates Stripe Invoice → finalizes → persists `invoices` row → returns hosted URL + PDF.
- **D-19:** Issued invoices surfaced inline in the editor ("Invoice issued: $X · {status}") — UX guardrail for frozen-snapshot semantics.

**Webhook & payment completion**
- **D-20:** Connect webhook (`lib/billing/connect-webhook.ts`, `handleConnectEvent`) handles `invoice.paid` (events where `event.account` is present), matches by `metadata.invoice_id`, marks the matching `invoices` row paid. Replaces the `checkout.session.completed` → `metadata.estimate_id` path.
- **D-21:** Reuse existing payment-received + receipt emails (`lib/email/payment-emails.ts`) and the in-app `payment.received` notification — repoint payloads from estimate → invoice. Idempotency stays via `processed_stripe_events`.

**Migration & retirement**
- **D-22:** Migration backfills one `invoices` row (`kind = full`, `status = paid`) per already-paid estimate so history is preserved.
- **D-23:** Retire the old `/estimate/[token]/pay` Checkout Session route and the `consolidated` gate. Existing estimates must load without error after the migration.

### Claude's Discretion
- Exact `invoices` column names/types and index choices.
- Deposit-% input UX (preset chips vs slider vs free input) and exact placement of "Generate invoice" (editor floating actions vs Send tab).
- Invoice numbering (Stripe-managed vs own scheme). **[RESEARCH recommends Stripe-managed — see Don't Hand-Roll.]**
- Whether legacy `estimates.payment_*` columns are dropped now or left dormant for history. **[RESEARCH recommends LEAVE DORMANT — see Pitfalls.]**
- Stripe `days_until_due` / auto-advance / reminder cadence defaults.
- How the share page surfaces "Pay deposit / Pay balance" links for issued invoices to the client.

### Deferred Ideas (OUT OF SCOPE)
- Tax / line-item-level invoices (invoices snapshot a single total amount).
- Refunds beyond the existing best-effort `charge.refunded` notification.
- Recurring / scheduled payment plans beyond deposit+balance.
- Credit notes / partial payment of a single invoice.
- Manual estimate versioning (explicitly rejected — single always-editable estimate per project).
</user_constraints>

<phase_requirements>
## Phase Requirements

The 7 INVOICE requirements are defined inline by the ROADMAP Phase 94 Success Criteria. Every one is addressable by the research below.

| ID | Description (from ROADMAP Success Criteria) | Research Support |
|----|---------------------------------------------|------------------|
| INVOICE-01 | Estimates always editable — consolidate gone: no `workflow_status` lock, no save write-block, no forced version fork; share page, send routes, pay flow no longer require `workflow_status='consolidated'` | Blast Radius (§ Architecture) enumerates all 18+ files; gate locations confirmed by grep |
| INVOICE-02 | `invoices` table: immutable snapshot (amount_cents, currency_code, kind∈{deposit,balance,full}, status mirroring Stripe, stripe ids, hosted URL), RLS scoped to company; one estimate → many invoices | DDL proposal (§ Architecture) + Phase 82 `company_members` RLS pattern |
| INVOICE-03 | "Generate invoice" in editor: pick deposit % or full, create/reuse Stripe Customer, create real Stripe Invoice (InvoiceItem + finalize), persist `invoices` row, return hosted URL + PDF | Stripe sequence (§ Code Examples) + UX wiring (§ Architecture) |
| INVOICE-04 | Deposit + balance: owner issues deposit (e.g. 30%) and separate balance invoice from same estimate — each a real, independent Stripe Invoice | Cents-rounding algorithm (§ Don't Hand-Roll / Pitfalls); `kind` enum |
| INVOICE-05 | Connect webhook handles `invoice.paid` (event.account present), matches by `metadata.invoice_id`, marks `invoices` row paid, reuses payment-received + receipt emails + in-app notification | Webhook research (§ Code Examples); `invoice.paid` confirmed correct event |
| INVOICE-06 | Editing estimate after invoice issued does NOT mutate the issued invoice (snapshot frozen); editor surfaces issued invoices inline | Snapshot columns (D-07); read-back query pattern (§ Architecture) |
| INVOICE-07 | Migration backfills one `invoices` row per already-paid estimate, retires `/estimate/[token]/pay` route + consolidated gate; existing estimates load without error | Migration strategy (§ Architecture); retirement list (§ Blast Radius) |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

These are non-negotiable and the planner must verify compliance:

- **Stack:** Next.js 16 (App Router) — note `package.json` shows `next 16.2.6`, React `19.2.4` (CLAUDE.md says "14+", repo is on 16); TypeScript strict; Tailwind; shadcn/ui; react-hook-form + zod.
- **Database:** Supabase PostgreSQL with **RLS on all tables**. The `invoices` table MUST have RLS enabled with company scoping.
- **Security:** Service role key never in the browser; all Stripe calls server-side via API routes / server actions. Stripe client comes from `getStripeClient()` (DB-stored key, per-request).
- **SECRET HANDLING (CRITICAL):** NEVER commit secrets/API keys/signing secrets to git — including in markdown, planning docs, seeds, comments, examples. Use placeholders (`whsec_<your-secret>`, `sk_live_<your-key>`). `gitleaks` pre-commit hook blocks `whsec_*`, `sk_*`, `rk_*`, `sb_secret_*`, `sk-ant-*`, `sk-proj-*`, `re_*`. RESEARCH/PLAN/VALIDATION docs for this phase must use placeholder tokens only.
- **GSD workflow enforcement:** file edits go through a GSD command.

## Standard Stack

No new dependencies required. Everything is already installed and in production use.

### Core
| Library | Version (verified) | Purpose | Why Standard |
|---------|-------------------|---------|--------------|
| `stripe` | `^22.1.1` (in `package.json`) | Stripe Node SDK — `invoices.create`, `invoiceItems.create`, `invoices.finalizeInvoice`, `invoices.sendInvoice`, `customers.create`, `webhooks.constructEvent` | Already the project's Stripe SDK; Phase 70 built on it |
| Stripe API version | `2026-04-22.dahlia` (pinned in `lib/billing/stripe-client.ts:15`) | The exact version every request uses | Pinned — invoice payloads/events must be valid for THIS version |
| `@supabase/supabase-js` | `^2.103.0` | DB access; service role for webhook | Existing |
| `zod` | `^4.3.6` | Validate the generate-invoice action input (deposit %, kind) | Existing convention for all server actions |
| `vitest` | `^4.1.4` | Unit tests | Project test runner (`tests/unit/**`) |

### Supporting (reuse, do not rebuild)
| Module | Purpose | Use Case |
|--------|---------|----------|
| `lib/billing/stripe-client.ts` → `getStripeClient()` | Per-request Stripe client from DB key | Every invoice API call |
| `lib/billing/connect-webhook.ts` → `handleConnectEvent` | Connect-branch webhook dispatch | Add `case 'invoice.paid'` |
| `app/api/webhooks/stripe/route.ts` | Raw-body-first verify, dual secrets, `processed_stripe_events` idempotency, `event.account` branch | Untouched ordering; rides existing dedup |
| `lib/email/payment-emails.ts` → `sendPaymentReceivedEmail`, `sendPaymentReceiptEmail` | Branded plain-text payment emails (never throw) | Repoint ctx from estimate → invoice |
| `lib/notifications/dispatch.ts` → `notify` + `lib/notifications/copy.ts` → `buildNotificationCopy('payment.received', …)` | In-app + email notification | Reuse with `resourceType: 'invoice'` |
| `lib/money/currency.ts` → `normalizeCurrencyCode`, `toMinorUnits`, `fromMinorUnits`, `formatMinorUnits` | Currency / cents handling | Amount math + email formatting |
| `lib/supabase/service.ts` → `requireServiceClient` | Service-role client (bypasses RLS) | Webhook writes to `invoices` |
| `lib/demo/config.ts` → `isDemoCompany` | Demo guard | Block real Stripe calls for demo company |
| `lib/queries/estimate.ts` → `getEstimateById`, `getEstimateWithContext` | Estimate + project + company load | Source data for the snapshot |

### Alternatives Considered
| Instead of | Could Use | Tradeoff | Decision |
|------------|-----------|----------|----------|
| Real Stripe Invoices | Payment Links / Checkout (current) | Bare payment page, no document/PDF/reminders | **LOCKED to Invoices** (D-11/D-12) |
| Two separate invoices for deposit+balance | Stripe native partial payments on one invoice | Stripe invoices don't natively support arbitrary partial pre-payments cleanly; two invoices = two real "guias", clean state per row | **LOCKED to two invoices** (D-16); see Don't Hand-Roll |
| `amount`-based `InvoiceItem` | `price_data` / Price object | Price objects are for catalog/recurring; one-off amount is simpler and Stripe explicitly supports it | Use `amount` (see Code Examples) |
| Stripe-managed invoice numbering | Own numbering scheme | Own scheme duplicates Stripe and risks gaps/dupes | Use Stripe-managed (Claude's discretion → recommended) |

**Installation:** none. `npm view stripe version` was not run (offline-safe); repo pins `stripe ^22.1.1` and API `2026-04-22.dahlia` — plan against the pinned version, not the latest.

## Architecture Patterns

### Proposed `invoices` table DDL

Follows the project's TEXT+CHECK convention (no Postgres enums), the **Phase 82 `company_members` RLS pattern** (see RLS note below), and the standard `gen_random_uuid()` / `timestamptz` conventions. Column names are Claude's discretion (D-08); these are a recommendation.

```sql
-- supabase/migrations/2026MMDD000001_phase94_invoices.sql
CREATE TABLE IF NOT EXISTS public.invoices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estimate_id         UUID NOT NULL REFERENCES public.estimates(id) ON DELETE CASCADE,
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Immutable snapshot (D-07): never recomputed from the estimate after issue.
  kind                TEXT NOT NULL CHECK (kind IN ('deposit','balance','full')),
  amount_cents        INTEGER NOT NULL CHECK (amount_cents > 0),
  currency_code       TEXT NOT NULL,
  project_name        TEXT,            -- snapshot for independent rendering
  description         TEXT,            -- snapshot line description

  -- Stripe lifecycle mirror (D-08). Stripe Invoice.status values.
  status              TEXT NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','open','paid','void','uncollectible')),
  stripe_invoice_id   TEXT,            -- in_...  (NULL only transiently before create)
  stripe_customer_id  TEXT,            -- cus_... ON THE CONNECTED ACCOUNT (see note)
  hosted_invoice_url  TEXT,
  invoice_pdf_url     TEXT,

  paid_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Webhook matches by metadata.invoice_id (our PK) but also reconciles by stripe id.
CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_stripe_invoice_id
  ON public.invoices(stripe_invoice_id) WHERE stripe_invoice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_estimate_id ON public.invoices(estimate_id);
CREATE INDEX IF NOT EXISTS idx_invoices_company_id  ON public.invoices(company_id);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

-- RLS: MATCH PHASE 82 PATTERN (company_members), not the legacy companies.user_id subquery.
CREATE POLICY "invoices_select" ON public.invoices FOR SELECT TO authenticated
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "invoices_insert" ON public.invoices FOR INSERT TO authenticated
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = (SELECT auth.uid())));
CREATE POLICY "invoices_update" ON public.invoices FOR UPDATE TO authenticated
  USING (company_id IN (SELECT company_id FROM company_members WHERE user_id = (SELECT auth.uid())))
  WITH CHECK (company_id IN (SELECT company_id FROM company_members WHERE user_id = (SELECT auth.uid())));
-- No DELETE policy unless required (invoices are financial records; prefer void over delete).
-- Webhook writes via service role (requireServiceClient) which bypasses RLS.
```

**RLS note (HIGH confidence, IMPORTANT correction to D-09):** CONTEXT.md D-09 quotes the **legacy** pattern `company_id IN (SELECT id FROM companies WHERE user_id = (SELECT auth.uid()))`. That pattern was **rewritten away in Phase 82** (`supabase/migrations/20260526000001_phase82_rls_company_members.sql`), which migrated *every* tenant-scoped table (estimates, estimate_items, projects, clients, etc.) to gate by `company_members`. That migration ends with an assertion that FAILS the migration if any policy still references `companies.*user_id`. To stay consistent with the rest of the live schema and not break multi-company users, **the `invoices` table must use the `company_members` subquery**. D-09's intent ("scoped to company, consistent with every other table") is satisfied by the `company_members` pattern — the literal SQL it quotes is stale.

> Verification: `notifications` (Phase 77) uses a different shorthand (`company_id = (auth.jwt() ->> 'company_id')::uuid`) but the *table-creation convention used by every standard tenant table* is the `company_members` subquery. Use the `company_members` subquery for `invoices`.

### `stripe_customer_id` — connected-account scope (subtle, HIGH confidence)

`companies.stripe_customer_id` already exists (verified in `types/database.types.ts`) but it is the **platform** customer used for SaaS-subscription billing on the *platform* Stripe account. The customer required here (D-14) is created **on the connected account** via `{ stripeAccount }` and is a *different object in a different account*. Do NOT reuse `companies.stripe_customer_id`.

Storage options for the connected-account customer id (planner's call):
- **Per-invoice (simplest):** store `stripe_customer_id` on each `invoices` row (already in DDL). Reuse across deposit+balance by reading the most recent row for that estimate/client. Lowest schema churn.
- **Per-client (cleaner reuse):** add `stripe_customer_id` to the `clients` table so the same customer is reused for all of a client's invoices. The `clients` table currently has NO Stripe column (verified against initial schema). This is the better long-term model but adds a column + migration.

Recommendation: store on the `invoices` row now (DDL above) AND look up by client to reuse; defer a `clients.stripe_customer_id` column unless reuse correctness demands it. Either way, "reuse a stored customer id when present" (D-14) is honored.

### Recommended project structure (new files)
```
lib/billing/
├── invoice-service.ts        # createInvoiceForEstimate(estimateId, {kind, depositPct}) — Stripe sequence
└── connect-webhook.ts        # + case 'invoice.paid' → handleInvoicePaid
lib/actions/
└── invoice.ts                # 'use server' generateInvoice(...) + getInvoicesForEstimate(...)
lib/queries/
└── invoice.ts                # getInvoicesByEstimateId(supabase, estimateId)
components/workspace/estimate/
├── generate-invoice-dialog.tsx   # deposit % chips / full toggle (D-18)
└── issued-invoices-panel.tsx     # "Invoice issued: $X · {status}" inline list (D-19)
supabase/migrations/
├── 2026MMDD000001_phase94_invoices.sql            # table + RLS + indexes
└── 2026MMDD000002_phase94_drop_consolidate.sql    # drop index, columns/gate cleanup (see below)
types/database.types.ts        # hand-add invoices Row/Insert/Update (Docker-less convention)
```

### Pattern: amount math for deposit + balance (integer cents)
**What:** compute deposit and balance so `deposit + balance === total` exactly, in integer cents.
**Rule:** convert the estimate total to cents ONCE via `toMinorUnits(estimate.total, currency_code)`. Deposit = `Math.round(totalCents * pct / 100)`. Balance = `totalCents - depositCents` (subtraction, never a second independent rounding). This guarantees the two sum to the total with no drift. See Don't Hand-Roll for the helper.

### Pattern: webhook matching by `metadata.invoice_id`
**What:** attach `metadata: { invoice_id, company_id }` when creating the Stripe Invoice; the `invoice.paid` handler reads `event.data.object.metadata.invoice_id` and updates that `invoices` row. Mirrors today's `metadata.estimate_id` → estimates path exactly. The event carries metadata set at creation time (Stripe includes the full invoice object).

### Blast Radius of removing consolidate (CRITICAL — verified by grep)

Every code + test reference. The planner must scope removal so the build and `vitest` stay green.

**Schema (SQL):**
| File | Change |
|------|--------|
| `supabase/migrations/20260520000003_estimate_workflow_status.sql` | The migration being unwound. Do NOT edit historical migrations — write a NEW migration that `DROP INDEX one_active_draft_per_project` and either drops `workflow_status`/`consolidated_at`/`consolidated_by` OR leaves them dormant. **Recommendation: DROP the `one_active_draft_per_project` index (it enforces single-draft and will block the always-editable model), and drop `workflow_status`/`consolidated_at`/`consolidated_by` since nothing reads them after this phase.** `is_current`/`version` are separate (see note). |

**Server actions — `lib/actions/estimate.ts`:**
| Location | Change |
|----------|--------|
| `:86-94` (`saveEstimate` write-block) | DELETE the `workflow_status === 'consolidated'` pre-check (D-02). |
| `:353` (`createBlankEstimate` sets `workflow_status:'draft'`) | Remove the column from the insert if dropped. |
| `:605-648` (`markAsSentAction`) | Keep (still useful), just unrelated to consolidate. |
| `:651-704` (`consolidateEstimate`) | DELETE the whole action (D-02). |
| `:707-837` (`createNewDraftVersion`) | DELETE the whole action (D-03). |
| `createBlankEstimate` `is_current`/`version` logic (`:322-336`) | Decide: keep `is_current`/`version` columns (they're not consolidate). If versioning UI is removed, these become vestigial but harmless. **Recommendation: keep the columns, stop creating new versions; the editor always opens the single current estimate.** |

**Estimate query/type — `lib/queries/estimate.ts`:**
| Location | Change |
|----------|--------|
| `Estimate` interface `:32-36` (`workflow_status`, `consolidated_at`, `consolidated_by`) | Remove these fields from the type (and any consumer that destructures them). |

**Share query — `lib/queries/share.ts`:**
| Location | Change |
|----------|--------|
| `:13` `Omit<…, 'share_token' \| 'consolidated_by'>` | Remove `consolidated_by` from the Omit once the field is gone. |
| `:179` destructure strips `consolidated_by` | Remove. |
| `getShareLinkState` `:211` selects `workflow_status` | Remove from select; the function no longer needs it. |

**Server-side gates (the `workflow_status !== 'consolidated'` checks) — REMOVE ALL:**
| File | Line | Current gate |
|------|------|--------------|
| `app/estimate/[token]/page.tsx` | `:57` | `if (data.estimate.workflow_status !== 'consolidated') notFound()` → DELETE so the live estimate renders (D-05). |
| `app/api/estimates/[id]/send/route.ts` | `:101-107` | 409 unless consolidated → DELETE. |
| `app/api/estimates/[id]/send-sms/route.ts` | `:63,:75-76` | select + gate → DELETE gate. |
| `app/api/estimates/[id]/send-whatsapp/route.ts` | `:53,:63` | select + gate → DELETE gate. |
| `app/api/estimates/[id]/refine/route.ts` | `:122-124` | block refine when consolidated → DELETE. |
| `app/api/estimates/[id]/pdf/route.ts` | `:38-39` | require consolidated for PDF → DELETE. |

**Retire entirely:**
| File | Action |
|------|--------|
| `app/api/estimate/[token]/pay/route.ts` | DELETE the Checkout route (D-23). Its test `tests/unit/billing/estimate-pay.test.ts` must be deleted with it. |

**UI components:**
| File | Change |
|------|--------|
| `components/workspace/estimate/estimate-editor.tsx` | Remove `consolidateEstimate`/`createNewDraftVersion` imports + `handleConsolidate`/`handleNewVersion` + the `isReadOnly` branch driven by `workflow_status==='consolidated'` (`:158`); add "Generate invoice" trigger + issued-invoice display wiring. |
| `components/workspace/estimate/estimate-floating-actions.tsx` | Remove `ConsolidateAlert`, the consolidated-state pill, `onConsolidate`/`onNewVersion`/`workflowStatus` props (`:30-42`, `:106-131`, `:178-259`). Replace primary CTA with "Generate invoice" (D-18). |
| `components/workspace/estimate/use-estimate-reducer.ts` | Remove `workflow_status` from `EstimateEditorState` (`:35`) + `initState` (`:140,:170`). |
| `components/workspace/estimate/estimate-tab.tsx` | Passes estimate into editor; ensure it still compiles after type change. |
| `components/workspace/send/send-tab.tsx` | Remove `isDraft = workflow_status !== 'consolidated'` (`:56`), the draft-lock Card (`:85-94`), and the `disabled={isDraft}` props (`:81,:115`). |
| `components/workspace/project-header.tsx` | Remove the "Consolidated/Draft" workflow badge (`:80-97`) and the `workflowStatus` field from the version slot; decide whether to keep the version dropdown (it reads `version`/`is_current`, not consolidate). **Recommendation: drop the version dropdown too since versioning is retired — leaves a simpler status pill.** |
| `components/workspace/estimate-version-context.tsx` (referenced by editor/header) | Remove `workflowStatus` from the slot shape. |
| `components/workspace/project-workspace.tsx` | Feeds `currentEstimate`/`allVersions`; `allVersions` becomes single-element — keep or simplify. |

**Tests that reference consolidate/workflow (must be updated or deleted):**
| File | What it references | Action |
|------|-------------------|--------|
| `tests/unit/billing/estimate-pay.test.ts` | The whole Checkout pay route | DELETE (route retired). |
| `tests/unit/webhooks/connect-events.test.ts` | `checkout.session.completed` → estimates 5-column update | REWRITE for `invoice.paid` → invoices row (or add a parallel suite; the old checkout-connect path is replaced). |
| `tests/unit/billing/stripe-webhook.test.ts` | Platform `invoice.paid` (subscriptions) | KEEP — this is the *platform* invoice.paid (subscription renewals), unrelated to Connect invoices. Do NOT break it; the new Connect `invoice.paid` lives in `handleConnectEvent`, the platform one in `handlePlatformEvent`. |
| `tests/unit/share-query.test.ts` | `workflow_status:'consolidated'`, `consolidated_by` in fixtures (`:84-86,:152-158`) | Update fixtures to drop those fields; remove assertions on `consolidated_by` strip. |
| `tests/unit/utils/estimate-template.test.ts` | Mock estimate has `workflow_status`, `consolidated_at`, `consolidated_by` (`:100-102`) | Update the fixture to match the new `Estimate` type. |
| `tests/e2e/fixtures/connect-estimates.ts` | `workflow_status`/`consolidated` in fixtures | Update fixture shape (e2e not in vitest run but keep coherent). |
| `tests/e2e/estimate-share-payment.spec.ts` | Pay-now Checkout flow on share page | Update to the new issued-invoice pay path (e2e; lower priority, flag for the e2e/UAT). |
| Any test importing the deleted server actions | `consolidateEstimate`/`createNewDraftVersion` | grep before deletion; none found in `tests/` currently, but re-verify. |

**Demo seed / scripts:**
| File | Change |
|------|--------|
| `scripts/seed-demo-workspace.mjs` | References `workflow_status`/consolidate — update seed so demo estimates insert without the dropped columns. |

### Anti-Patterns to Avoid
- **Recomputing invoice amount from the estimate at render/webhook time.** The invoice is a frozen snapshot (D-07). Read `invoices.amount_cents`, never re-derive from `estimate.total`.
- **Editing historical migrations.** Always add a new migration; the Phase 82 assertion and migration-history integrity depend on it.
- **Dropping `is_current`/`version` as if they were consolidate.** They are independent columns; only `workflow_status`/`consolidated_*` and the `one_active_draft_per_project` index are consolidate-specific.
- **Reusing `companies.stripe_customer_id` for the connected-account customer.** Different account, different object.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Hosted payment page + PDF + email + reminders | Custom PDF/email/payment-page | Stripe Invoices (`send_invoice` collection) | This is the entire point of D-11; Stripe gives hosted page, PDF, email, and dunning reminders for free |
| Invoice numbering | Own sequence column | Stripe-managed `Invoice.number` | Stripe guarantees gapless per-account numbering; rolling your own risks dupes/gaps and legal-doc issues |
| Webhook idempotency | New dedup table | Existing `processed_stripe_events` insert (23505 = dup) | Already wired in `app/api/webhooks/stripe/route.ts`; invoices ride it |
| Cents rounding for deposit/balance | Two independent `Math.round` calls | `depositCents = round(total*pct/100); balanceCents = totalCents - depositCents` | Subtraction-of-remainder guarantees exact sum; double-rounding can be off by 1¢ |
| Currency formatting in emails | Manual `$` string | `formatMinorUnits(cents, currency)` from `lib/money/currency.ts` | Handles minor-unit + locale already |
| Partial payment of one invoice | Stripe partial-payment hacks | Two separate invoices (`kind=deposit`/`balance`) | LOCKED (D-16); two real invoices = two clean states, two real hosted guias |

**Key insight:** ~90% of this phase's "new" surface is already solved by Stripe and by the Phase 70 plumbing. The genuinely new code is small (one invoice-creation service, one webhook case, one action, two UI pieces). The risk budget belongs to the consolidate *removal*, not the Stripe *addition*.

## Common Pitfalls

### Pitfall 1: `application_fee_amount: 0` is rejected by Stripe
**What goes wrong:** Stripe returns an error if you pass `application_fee_amount: 0`.
**How to avoid:** OMIT the field entirely (do not set it to 0). This is the established Phase 70 pattern (`app/api/estimate/[token]/pay/route.ts:108`, asserted by `estimate-pay.test.ts:139`). The invoice-creation call must likewise never include `application_fee_amount`. Add the same `expect('application_fee_amount' in payload).toBe(false)` assertion to the new invoice tests.

### Pitfall 2: Webhook raw-body-before-parse ordering
**What goes wrong:** Reading/parsing the request body before signature verification breaks `stripe.webhooks.constructEvent` (it needs the exact raw bytes).
**How to avoid:** Do NOT touch `app/api/webhooks/stripe/route.ts`'s ordering. `request.text()` is read first (`:19`), then `constructEvent`, then dedup, then dispatch. The new `invoice.paid` logic goes inside `handleConnectEvent` (`lib/billing/connect-webhook.ts`), downstream of all of that.

### Pitfall 3: RLS on the new table (wrong subquery pattern)
**What goes wrong:** Using the legacy `companies WHERE user_id` subquery (as D-09 literally quotes) makes `invoices` inconsistent with every other table and breaks multi-company users; the Phase 82 assertion philosophy is `company_members`.
**How to avoid:** Use the `company_members` subquery (see DDL). Webhook writes use `requireServiceClient` (bypasses RLS); authenticated reads/writes use the policy.

### Pitfall 4: Cents rounding so deposit + balance == total
**What goes wrong:** `round(total*0.3)` + `round(total*0.7)` can be off by 1¢ on certain totals.
**How to avoid:** Balance = `totalCents - depositCents` (see Don't Hand-Roll). Unit-test boundary totals (e.g. $100.01 at 30%, JPY 0-decimal currency, $0.01).

### Pitfall 5: Idempotency on invoice creation (double-create on retry)
**What goes wrong:** A network retry of the generate-invoice action creates two Stripe Invoices and two `invoices` rows.
**How to avoid:** Pass an `idempotencyKey` to the Stripe `invoices.create` (and `customers.create`) request option. Note the Phase 70 pay route used `pay_${id}_${Date.now()}` which is NOT idempotent (Date.now changes per call) — do better here: derive a stable key, e.g. `inv_${estimateId}_${kind}` (one deposit + one balance + one full per estimate is the natural cardinality). If the owner legitimately needs to re-issue, vary the key deliberately. Also guard the DB: the `idx_invoices_stripe_invoice_id` unique index prevents duplicate rows for the same Stripe invoice.

### Pitfall 6: Demo-company guard must still block real Stripe calls
**What goes wrong:** The demo company issues a real Stripe Invoice / creates a real customer.
**How to avoid:** Call `isDemoCompany(companyId)` at the top of the generate-invoice action and return a friendly error before any Stripe call (mirror `app/api/estimate/[token]/pay/route.ts:56-61`). Add a test asserting no Stripe method is called for the demo company id.

### Pitfall 7: `send_invoice` finalize vs send sequencing
**What goes wrong:** Assuming `finalizeInvoice` emails the customer, or that creating with `auto_advance` auto-sends.
**How to avoid (verified against Stripe docs):** For `collection_method: 'send_invoice'`, finalize and send are separate. Either (a) explicitly `invoices.finalizeInvoice(id)` then `invoices.sendInvoice(id)` to email it, or (b) just call `invoices.sendInvoice(id)` which finalizes-and-emails in one step ("Stripe finalizes the invoice as soon as you send it"). Read back `hosted_invoice_url` + `invoice_pdf` from the finalized/sent invoice object (they are null on a draft). Decide `auto_advance` + `days_until_due` + reminder cadence (Claude's discretion D-defaults) — `send_invoice` with `days_until_due` and Stripe's automatic reminders covers the "reminders" requirement.

### Pitfall 8: `invoice.paid` collides with the existing platform handler
**What goes wrong:** The platform webhook (`handlePlatformEvent`) ALREADY handles `invoice.paid` for *subscription renewals* (`app/api/webhooks/stripe/route.ts:133`). Adding Connect `invoice.paid` naively could confuse the two.
**How to avoid:** They are already cleanly separated by `event.account`: platform events (no account) → `handlePlatformEvent`; Connect events (account present) → `handleConnectEvent`. Put the new logic ONLY in `handleConnectEvent`. The platform `invoice.paid` test (`stripe-webhook.test.ts:125`) must keep passing untouched.

### Pitfall 9: `event.account` requires a Connect webhook endpoint + secret
**What goes wrong:** Connect invoice events never arrive because they're only delivered to a Connect-type webhook endpoint.
**How to avoid:** This is already configured — `STRIPE_CONNECT_WEBHOOK_SECRET` is one of the two secrets the route tries (`:26,:44`), and Phase 70's `checkout.session.completed` Connect events already flow. `invoice.paid` on the connected account rides the same endpoint. Ensure the Stripe Connect webhook endpoint subscribes to `invoice.paid` (config/dashboard, document with placeholder secret only).

## Code Examples

### Stripe invoice creation sequence (connected account, Direct Charges)
```typescript
// lib/billing/invoice-service.ts (sketch) — verified against Stripe docs + SDK ^22
// Source: https://docs.stripe.com/api/invoices/create , https://docs.stripe.com/invoicing/integration
import { getStripeClient } from '@/lib/billing/stripe-client'

export async function createConnectInvoice(opts: {
  stripeAccountId: string
  customerEmail: string | null
  customerName: string | null
  existingCustomerId: string | null     // reuse if present (D-14)
  amountCents: number
  currencyCode: string                  // e.g. 'usd'
  description: string
  metadata: { invoice_id: string; company_id: string }  // our PK keys the webhook (D-20)
  daysUntilDue: number                  // Claude's discretion default
  idempotencyBase: string               // stable, e.g. `inv_${estimateId}_${kind}`
}) {
  const stripe = await getStripeClient()
  const reqOpt = { stripeAccount: opts.stripeAccountId }  // Direct Charges (D-11)

  // 1. Customer on the connected account (reuse when possible).
  const customerId = opts.existingCustomerId ?? (await stripe.customers.create(
    { email: opts.customerEmail ?? undefined, name: opts.customerName ?? undefined },
    { ...reqOpt, idempotencyKey: `${opts.idempotencyBase}_cust` }
  )).id

  // 2. InvoiceItem (amount-based; no Price object needed).
  //    NOTE: do NOT include application_fee_amount anywhere (Pitfall 1).
  await stripe.invoiceItems.create(
    { customer: customerId, amount: opts.amountCents,
      currency: opts.currencyCode, description: opts.description },
    { ...reqOpt, idempotencyKey: `${opts.idempotencyBase}_item` }
  )

  // 3. Invoice — send_invoice + days_until_due (manual collection, hosted guia).
  const invoice = await stripe.invoices.create(
    { customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: opts.daysUntilDue,
      pending_invoice_items_behavior: 'include',
      metadata: opts.metadata },
    { ...reqOpt, idempotencyKey: `${opts.idempotencyBase}_inv` }
  )

  // 4. Finalize + send (emails the hosted invoice). sendInvoice finalizes-and-emails.
  const sent = await stripe.invoices.sendInvoice(invoice.id, reqOpt)

  // 5. Read back hosted URL + PDF (null on a draft; populated after finalize/send).
  return {
    stripeInvoiceId: sent.id,
    stripeCustomerId: customerId,
    hostedInvoiceUrl: sent.hosted_invoice_url ?? null,
    invoicePdfUrl: sent.invoice_pdf ?? null,
    status: sent.status ?? 'open',   // 'open' once finalized/sent
    number: sent.number ?? null,
  }
}
```

### Webhook `invoice.paid` case (Connect branch)
```typescript
// lib/billing/connect-webhook.ts — add to the switch in handleConnectEvent
// Source: https://docs.stripe.com/api/events/types (invoice.paid fires for send_invoice paid)
case 'invoice.paid': {
  const invoice = event.data.object as Stripe.Invoice
  const invoiceRowId = invoice.metadata?.invoice_id          // our PK (D-20)
  if (!invoiceRowId) {
    console.warn('[stripe-webhook][connect] invoice.paid missing metadata.invoice_id')
    return
  }
  const { data: updated } = await svc
    .from('invoices')
    .update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      hosted_invoice_url: invoice.hosted_invoice_url ?? null,
      invoice_pdf_url: invoice.invoice_pdf ?? null,
    })
    .eq('id', invoiceRowId)
    .select('id, company_id, estimate_id, amount_cents, currency_code')
    .single()
  if (!updated) return
  // Reuse payment-received + receipt emails + payment.received notification (D-21),
  // repointing the ctx from estimate → invoice (amount = invoices.amount_cents).
  return
}
```
> `invoice.paid` is the correct event for `send_invoice` collection (it fires on payment-attempt-success OR mark-paid-out-of-band). `invoice.payment_succeeded` also fires but `invoice.paid` is the inclusive, documented choice. The event object includes the metadata set at creation and `hosted_invoice_url`/`invoice_pdf`.

### Deposit/balance cents helper
```typescript
// lib/money/invoice-split.ts (new)
import { toMinorUnits } from '@/lib/money/currency'
export function splitDepositBalance(totalDollars: number, currencyCode: string, depositPct: number) {
  const totalCents = toMinorUnits(totalDollars, currencyCode)
  const depositCents = Math.round((totalCents * depositPct) / 100)
  const balanceCents = totalCents - depositCents      // subtraction → exact sum (Pitfall 4)
  return { totalCents, depositCents, balanceCents }
}
```

### Generate-invoice UX wiring (D-18/D-19)
- **Trigger:** replace/augment the editor's primary CTA. The consolidate button lived in `components/workspace/estimate/estimate-floating-actions.tsx` (the `ConsolidateAlert` + primary `Button`); put "Generate invoice" there, OR in the Send tab — Claude's discretion. It opens `generate-invoice-dialog.tsx` (deposit % chips / full toggle), which calls `generateInvoice(estimateId, { kind, depositPct })` server action.
- **Action flow:** `generateInvoice` → demo guard → load estimate+project+company (`getEstimateWithContext`) → verify `company.stripe_account_id` + `stripe_connect_status === 'active'` (mirror pay route `:49`) → compute cents → `createConnectInvoice(...)` → insert `invoices` row → return `{ hostedInvoiceUrl, invoicePdfUrl }`.
- **Read-back / display:** `getInvoicesForEstimate(estimateId)` (RLS-scoped) → `issued-invoices-panel.tsx` renders "Invoice issued: $X · {status}" with links to hosted URL + PDF (D-19). Wire it into `estimate-editor.tsx` near the document. Feed invoices into the editor via `project-workspace.tsx`/`estimate-tab.tsx` (server fetch) so they're present on load.
- **Share-page client links (D-discretion):** optionally surface "Pay deposit / Pay balance" on `app/estimate/[token]/page.tsx` by reading the estimate's issued invoices and rendering their `hosted_invoice_url` (the client pays on Stripe's hosted page — no custom pay route needed, which is why `/estimate/[token]/pay` can be retired).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Payment welded to `estimates` (payment_* columns, webhook marks estimate via `metadata.estimate_id`) | Separate `invoices` entity, webhook marks invoice via `metadata.invoice_id` | This phase | Estimate = living proposal; invoice = frozen money object |
| Checkout Session (bare pay page) via `/estimate/[token]/pay` | Real Stripe Invoice (hosted guia + PDF + email + reminders) | This phase | Deliverable document, not just a charge |
| Consolidate lock + forced version fork (`workflow_status`, `one_active_draft_per_project`, `createNewDraftVersion`) | Always-editable single estimate | This phase | Removes a whole workflow + its UI + 6 server gates |
| RLS via `companies WHERE user_id` subquery | RLS via `company_members` subquery | Phase 82 (2026-05-26) | New `invoices` table MUST use `company_members` (corrects D-09's quoted SQL) |
| `InvoiceItem` requires Price object | `amount`-based InvoiceItem still fully supported | n/a (both supported) | One-off invoices stay simple |

**Deprecated/outdated:**
- The `companies.user_id` RLS subquery pattern (the literal SQL in D-09) — superseded by Phase 82. Use `company_members`.
- `/estimate/[token]/pay` Checkout route — retired this phase (D-23).
- `SEED-028` draft→consolidate workflow — retired this phase.

## Open Questions

1. **Connected-account customer storage (per-invoice vs per-client).**
   - What we know: `clients` table has no Stripe column; `companies.stripe_customer_id` is the platform (wrong-account) customer.
   - What's unclear: whether reuse correctness needs a `clients.stripe_customer_id` column now.
   - Recommendation: store `stripe_customer_id` on the `invoices` row + look up by client for reuse; defer the `clients` column. Both honor D-14.

2. **Drop vs keep `workflow_status`/`consolidated_*` columns and the version dropdown.**
   - What we know: nothing reads them after the gates are removed; `is_current`/`version` are independent.
   - Recommendation: drop `workflow_status`/`consolidated_at`/`consolidated_by` + the `one_active_draft_per_project` index; keep `is_current`/`version` columns (harmless) but remove the version-switching UI since versioning is retired. Confirm with planner whether to also drop `is_current`/`version` (larger blast radius — they appear in `createBlankEstimate`, reducer, header).

3. **`days_until_due` / reminder cadence / `auto_advance` defaults.**
   - Claude's discretion (D). Recommend `collection_method:'send_invoice'`, `days_until_due: 7` (or 14), rely on Stripe automatic reminders. Planner picks the number.

4. **Should the public share page auto-surface issued-invoice pay links?**
   - Claude's discretion (D). Low-risk to add (just render `hosted_invoice_url`); recommend yes so the client can pay the deposit/balance from the same link they already have.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `stripe` SDK | All invoice API calls | ✓ | `^22.1.1` | — |
| Stripe secret key | `getStripeClient()` | Runtime (DB-stored via `/admin/integrations`) | — | Webhook returns 503 if unset (existing behavior); generate-invoice action must error gracefully |
| `STRIPE_CONNECT_WEBHOOK_SECRET` | `invoice.paid` Connect events | Runtime env | — | Without it, Connect events fail signature verify (already required since Phase 70) |
| Connected Stripe account (`company.stripe_account_id`, status `active`) | Issuing invoices | Per-tenant | — | Action must refuse (mirror pay route `:49`) when not connected |
| Supabase / Postgres | `invoices` table + RLS | ✓ (project DB) | — | — |
| Docker (for `supabase gen types`) | Type generation | ✗ (Windows, Docker-less — established) | — | Hand-edit `types/database.types.ts` (project convention since Phase 19/24) |
| `vitest` | Unit tests | ✓ | `^4.1.4` | — |

**Missing dependencies with no fallback:** none — all runtime deps already provisioned by Phase 70.
**Missing with fallback:** Docker → hand-edit `types/database.types.ts` (add `invoices` Row/Insert/Update + remove dropped estimate fields).

## Validation Architecture

> nyquist_validation is enabled (`.planning/config.json` → `workflow.nyquist_validation: true`). This section seeds VALIDATION.md.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | `vitest` `^4.1.4` (jsdom, globals) |
| Config file | `vitest.config.ts` (include `tests/unit/**`, `tests/integration/**`; alias `@`→root; `server-only`→stub) |
| Quick run command | `npx vitest run tests/unit/billing tests/unit/webhooks` |
| Full suite command | `npx vitest run` (baseline: 1516 passing / 213 files per STATE.md) |
| Test conventions | Late `await import()` after `vi.mock`; explicit `import { ... } from 'vitest'`; class-based mock factories for SDK constructors; per-table Supabase `.from()` mocks (see `connect-events.test.ts`); `vi.stubEnv` for secrets (use placeholder values only) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INVOICE-01 | `saveEstimate` no longer blocks on consolidated; send/share/pdf routes have no consolidated gate | unit | `npx vitest run tests/unit/actions/estimate.test.ts` (new/updated) | ❌ Wave 0 |
| INVOICE-01 | Share page renders live estimate (no `notFound` on non-consolidated) | unit | `npx vitest run tests/unit/share-query.test.ts` (update fixtures) | ✅ (update) |
| INVOICE-02 | `invoices` migration: table, RLS via `company_members`, indexes, CHECKs | unit (migration text assertions, mirror `pipeline-events-migration.test.ts`) | `npx vitest run tests/unit/billing/invoices-migration.test.ts` | ❌ Wave 0 |
| INVOICE-03 | Invoice service: customer reuse, `amount` InvoiceItem, `send_invoice`, NO `application_fee_amount`, `{stripeAccount}`, metadata.invoice_id, idempotencyKey | unit | `npx vitest run tests/unit/billing/invoice-service.test.ts` | ❌ Wave 0 |
| INVOICE-03 | `generateInvoice` action: demo guard blocks Stripe, requires active Connect, persists row, returns URLs | unit | `npx vitest run tests/unit/actions/invoice.test.ts` | ❌ Wave 0 |
| INVOICE-04 | `splitDepositBalance`: deposit+balance==total for boundary totals + 0-decimal currency | unit | `npx vitest run tests/unit/money/invoice-split.test.ts` | ❌ Wave 0 |
| INVOICE-05 | Connect `invoice.paid` → marks `invoices` row paid by metadata.invoice_id + fires emails + notification; dedup skips; platform `invoice.paid` untouched | unit | `npx vitest run tests/unit/webhooks/connect-events.test.ts` (rewrite) + keep `tests/unit/billing/stripe-webhook.test.ts` green | ✅ (rewrite) |
| INVOICE-06 | Issued invoice amount is the stored snapshot, not re-derived; editor read-back lists invoices | unit | `npx vitest run tests/unit/queries/invoice.test.ts` | ❌ Wave 0 |
| INVOICE-07 | Backfill migration creates one `kind=full,status=paid` invoice per paid estimate; `/estimate/[token]/pay` removed | unit (migration assertions) + grep absence | `npx vitest run tests/unit/billing/invoices-backfill-migration.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/billing tests/unit/webhooks tests/unit/money` (fast, < 30s).
- **Per wave merge:** `npx vitest run` (full suite; must stay ≥ the 1516 baseline minus deleted pay-route tests, plus new tests).
- **Phase gate:** full suite green before `/gsd:verify-work`; plus a manual Stripe CLI webhook simulation of `invoice.paid` on a connected account (document with placeholder secret) and a manual end-to-end issue-deposit-then-balance check in Stripe test mode.

### Wave 0 Gaps
- [ ] `tests/unit/billing/invoice-service.test.ts` — covers INVOICE-03 (Stripe sequence, no app fee, idempotency, demo guard at service boundary)
- [ ] `tests/unit/actions/invoice.test.ts` — covers INVOICE-03 (action: demo guard, Connect-active check, row persist)
- [ ] `tests/unit/money/invoice-split.test.ts` — covers INVOICE-04 (cents exactness)
- [ ] `tests/unit/billing/invoices-migration.test.ts` — covers INVOICE-02 (DDL text: RLS `company_members`, CHECKs, indexes)
- [ ] `tests/unit/billing/invoices-backfill-migration.test.ts` — covers INVOICE-07 (backfill correctness)
- [ ] `tests/unit/queries/invoice.test.ts` — covers INVOICE-06 (read-back, snapshot)
- [ ] `tests/unit/actions/estimate.test.ts` — covers INVOICE-01 (save no longer blocks) — may be new
- [ ] REWRITE `tests/unit/webhooks/connect-events.test.ts` — Connect `invoice.paid` (INVOICE-05); reuse the per-table Supabase mock pattern already in the file
- [ ] UPDATE `tests/unit/share-query.test.ts`, `tests/unit/utils/estimate-template.test.ts`, `tests/e2e/fixtures/connect-estimates.ts` — drop `workflow_status`/`consolidated_*` from fixtures
- [ ] DELETE `tests/unit/billing/estimate-pay.test.ts` with the retired route
- [ ] Framework install: none — `vitest` present

## Sources

### Primary (HIGH confidence)
- Live codebase (read in full): `lib/billing/stripe-client.ts` (API version `2026-04-22.dahlia`), `lib/billing/connect-webhook.ts`, `app/api/webhooks/stripe/route.ts`, `app/api/estimate/[token]/pay/route.ts`, `lib/actions/estimate.ts`, `lib/queries/estimate.ts`, `lib/queries/share.ts`, `lib/email/payment-emails.ts`, `lib/money/currency.ts`, `lib/demo/config.ts`, editor/UI components, `package.json` (`stripe ^22.1.1`).
- Migrations: `20260520000003_estimate_workflow_status.sql`, `20260517000001_phase70_stripe_connect_columns.sql`, `20260526000001_phase82_rls_company_members.sql` (RLS pattern correction), `20260526000002_phase85_companies_rls_or_members.sql`, `20260520000002_notifications_system.sql`.
- Tests (patterns + blast radius): `tests/unit/billing/estimate-pay.test.ts`, `tests/unit/billing/stripe-webhook.test.ts`, `tests/unit/webhooks/connect-events.test.ts`, `tests/unit/share-query.test.ts`, `tests/unit/utils/estimate-template.test.ts`, `tests/fixtures/stripe-connect.ts`, `vitest.config.ts`.
- Stripe official docs (current): https://docs.stripe.com/api/invoices/create , https://docs.stripe.com/invoicing/integration , https://docs.stripe.com/api/events/types (invoice.paid vs invoice.payment_succeeded).
- `.planning/config.json` (nyquist_validation true), ROADMAP Phase 94 success criteria, CONTEXT.md (D-01..D-23), CLAUDE.md (secret handling, stack, RLS).

### Secondary (MEDIUM confidence)
- WebSearch (Stripe `invoiceitems` `amount` vs `price_data`): confirms `amount`-based InvoiceItem remains supported — cross-verified with the official create-invoiceitem docs.

### Tertiary (LOW confidence)
- None relied upon for load-bearing claims.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions read directly from `package.json` + pinned API version in source.
- Stripe invoice sequence + `invoice.paid` event choice: HIGH — current official docs + the exact Connect plumbing already in production (Phase 70).
- Blast radius of consolidate removal: HIGH — every file/line enumerated via grep against the live tree.
- RLS pattern correction (`company_members`): HIGH — verified by reading the Phase 82 migration and its in-migration assertion.
- Cents/idempotency/demo pitfalls: HIGH — derived from existing code + Stripe docs.
- Exact `days_until_due`/reminder defaults: LOW (intentionally — Claude's discretion; not a factual gap).

**Research date:** 2026-06-19
**Valid until:** ~2026-07-19 for Stripe API specifics (pinned version reduces drift risk); codebase blast radius valid until the files change (re-grep before the removal wave).
