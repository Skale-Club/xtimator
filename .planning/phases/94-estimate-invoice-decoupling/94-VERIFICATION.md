---
phase: 94-estimate-invoice-decoupling
verified: 2026-06-19T16:20:00Z
status: human_needed
score: 7/7 must-haves verified (automated) — 1 live Stripe checkpoint pending
re_verification:
human_verification:
  - test: "Live generate-invoice end-to-end flow (Plan 94-04 Task 4 checkpoint)"
    expected: >-
      With a Stripe account Connected in test mode (Settings -> Payments):
      (1) the editor shows "Generate invoice"; (2) Deposit 30% previews ~30% of the
      total + implied balance; (3) issuing shows a toast + inline
      "Invoice issued: $X . open" with working View/PDF (hosted page + PDF render);
      (4) editing the estimate total after issue does NOT change the issued-invoice
      amount (snapshot frozen, INVOICE-06); (5) issuing the balance creates a second
      invoice row; (6) the public share link shows working "Pay deposit/balance"
      hosted links.
    why_human: >-
      Requires a connected Stripe test-mode account and real network round-trips to
      Stripe (Customer -> InvoiceItem -> Invoice -> finalize -> hosted page + PDF +
      email + webhook). Un-automatable without live credentials. Static + unit-level
      verification of every code path backing this flow has PASSED; only the live
      integration remains.
---

# Phase 94: Estimate-Invoice Decoupling Verification Report

**Phase Goal:** Retire the estimate "consolidate" lock so estimates are always editable, and introduce a separate Invoice entity that issues real Stripe Invoices (hosted page + PDF + email) with deposit + balance support. Immutability moves off the estimate and onto the invoice.

**Verified:** 2026-06-19T16:20:00Z
**Status:** human_needed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria = INVOICE-01..07)

| # | Truth (Success Criterion) | Req | Status | Evidence |
| --- | --- | --- | --- | --- |
| 1 | Estimates always editable - consolidate fully gone (no status lock, no save block, no forced fork; share page + send routes + pay flow no longer require `consolidated`) | INVOICE-01 | ✓ VERIFIED | Zero `workflow_status === 'consolidated'` read-gates in source (only a `.todo` test stub + planning docs). `consolidateEstimate`/`createNewDraftVersion` = 0 hits (deleted). No "is consolidated" write-block in `lib/actions/estimate.ts`. `app/api/estimates/{send,send-sms,send-whatsapp,refine,pdf}` + `app/estimate/[token]/page.tsx` = 0 consolidate hits (the lone `notFound()` is the expired/invalid-link branch). Drop-index migration present. Test `estimate-save-no-gate` GREEN. |
| 2 | `invoices` table: immutable snapshot, company-scoped RLS, one estimate -> many invoices | INVOICE-02 | ✓ VERIFIED | `20260619000001_phase94_invoices.sql`: 16 cols, `kind`/`status` CHECK enums, `amount_cents > 0`, FK estimate/company ON DELETE CASCADE (1->many), 3 indexes (unique partial on stripe_invoice_id + estimate_id + company_id), no DELETE policy. RLS = Phase 82 `company_members` subquery (4 occurrences), **0** `companies.user_id`. |
| 3 | "Generate invoice" picks deposit %/full -> creates/reuses Customer -> real Stripe Invoice (InvoiceItem + finalize) -> persists row -> returns hosted URL + PDF | INVOICE-03 | ✓ VERIFIED | `invoice-service.ts createConnectInvoice`: Customer(reuse/create)->InvoiceItem(amount)->Invoice(`send_invoice`)->`sendInvoice`(finalize+email)->read hosted/pdf; `{stripeAccount}` on every call; **no** `application_fee_amount`; `metadata.invoice_id`+`company_id`; idempotencyKey per call. `actions/invoice.ts generateInvoice`: auth->ownership->demo guard (before any Stripe call)->connect-active->single snapshot insert->returns URLs. Dialog calls `generateInvoice` (line 72). |
| 4 | Deposit + balance: separate independent Stripe Invoices from one estimate | INVOICE-04 | ✓ VERIFIED | `money/invoice-split.ts splitDepositBalance`: deposit rounded once, balance = remainder by subtraction => `deposit + balance === total` exact incl. 0-decimal (JPY). Action computes `split.depositCents`/`balanceCents` per kind; idempotencyBase scoped `inv_{estimateId}_{kind}` so deposit and balance are distinct invoices. Test 40/40 incl. boundary cases. |
| 5 | Connect webhook handles `invoice.paid` (event.account), matches by `metadata.invoice_id`, marks row paid, reuses payment-received + receipt emails + in-app notification | INVOICE-05 | ✓ VERIFIED | `connect-webhook.ts` `case 'invoice.paid'` -> `handleInvoicePaid`: matches `invoice.metadata?.invoice_id`, updates row paid + snapshot read-back, fires `payment.received` (`resourceType:'invoice'`) using **snapshot** `updated.amount_cents` (never re-derived), dynamic-imports both emails via `Promise.allSettled`. Dispatch in `route.ts`: `event.account` -> Connect; else -> `handlePlatformEvent` (separate platform `invoice.paid` at line 133, untouched - its test 8/8 GREEN). |
| 6 | Editing estimate after issue does NOT mutate the issued invoice (frozen snapshot); editor surfaces issued invoices inline | INVOICE-06 | ✓ VERIFIED | `queries/invoice.ts getInvoicesByEstimateId` returns stored `amount_cents` verbatim. `issued-invoices-panel.tsx` renders `formatMinorUnits(inv.amount_cents)` + hosted/PDF links. Data-flow FLOWING: `page.tsx:159` `getInvoicesByEstimateId(supabase, currentEstimate.id)` -> ProjectWorkspace -> OverviewTab -> EstimateTab -> EstimateEditor:286 -> IssuedInvoicesPanel. Snapshot insert is single-write (immutable). |
| 7 | Backfill (1 full/paid invoice per paid estimate); retire `/estimate/[token]/pay`; existing estimates load | INVOICE-07 | ✓ VERIFIED | `20260619000003_phase94_backfill_invoices.sql`: `INSERT...SELECT` `kind='full', status='paid'`, idempotent `NOT EXISTS` guard, `amount_cents > 0` filter, NULL stripe_invoice_id (partial index safe). Pay route gone (`app/api/estimate/[token]/pay/route.ts` + `app/estimate/**/pay` Globs = no files). `estimate-view.tsx` 0 hits for `PayNowButton`/`stripeState`; deleted `pay-now-button.tsx` + `payment-success-banner.tsx` confirmed absent. Backfill-migration test GREEN. |

**Score:** 7/7 truths VERIFIED via static + unit-level checks. Truths 3 + 6 additionally carry a live-Stripe human-verify item (does not lower the automated verdict).

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `supabase/migrations/20260619000001_phase94_invoices.sql` | invoices DDL + RLS | ✓ VERIFIED | 16 cols, CHECK enums, 3 indexes, company_members RLS, no DELETE |
| `supabase/migrations/20260619000002_phase94_drop_consolidate_index.sql` | drop single-draft index | ✓ VERIFIED | `DROP INDEX IF EXISTS one_active_draft_per_project` |
| `supabase/migrations/20260619000003_phase94_backfill_invoices.sql` | backfill paid estimates | ✓ VERIFIED | idempotent INSERT...SELECT, kind=full/status=paid |
| `lib/billing/invoice-service.ts` | createConnectInvoice | ✓ VERIFIED | full Connect sequence, no app fee, metadata, idempotency |
| `lib/actions/invoice.ts` | generateInvoice + read wrapper | ✓ VERIFIED | guard order correct, single snapshot insert |
| `lib/money/invoice-split.ts` | splitDepositBalance | ✓ VERIFIED | cents-exact, remainder-by-subtraction |
| `lib/queries/invoice.ts` | getInvoicesByEstimateId | ✓ VERIFIED | returns snapshot amount verbatim |
| `lib/billing/connect-webhook.ts` | invoice.paid handler | ✓ VERIFIED | matches by metadata, snapshot amount, emails + notify |
| `components/workspace/estimate/generate-invoice-dialog.tsx` | Full/Deposit/Balance picker | ✓ VERIFIED | calls generateInvoice; no stubs |
| `components/workspace/estimate/issued-invoices-panel.tsx` | inline issued list | ✓ VERIFIED | renders frozen snapshot + hosted/PDF links |
| `components/share/estimate-view.tsx` | hosted pay links only | ✓ VERIFIED | "Pay {kind}" -> hosted_invoice_url; Checkout surface removed |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| GenerateInvoiceDialog | generateInvoice action | `generateInvoice(estimateId, {kind, depositPct})` | ✓ WIRED | import L16, call L72 |
| generateInvoice | createConnectInvoice | direct call with metadata.invoice_id | ✓ WIRED | L145, pre-generated row id L140 |
| createConnectInvoice | Stripe (connected acct) | `{stripeAccount}` on each call | ✓ WIRED | reqOpt L43; customers/invoiceItems/invoices/sendInvoice |
| Stripe invoice.paid | invoices row | `metadata.invoice_id` | ✓ WIRED | route.ts event.account -> handleConnectEvent -> handleInvoicePaid match L216 |
| page.tsx | IssuedInvoicesPanel | issuedInvoices prop chain | ✓ WIRED (FLOWING) | DB query L160 -> 4-hop prop thread -> editor L286 |
| share estimate-view | Stripe hosted page | `hosted_invoice_url` anchor | ✓ WIRED | L257-268 open-invoice Pay links |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| IssuedInvoicesPanel | `issuedInvoices` / `inv.amount_cents` | `getInvoicesByEstimateId(supabase, currentEstimate.id)` (page.tsx L160) | Yes - RLS-scoped DB query, snapshot verbatim | ✓ FLOWING |
| estimate-view pay links | `invoices[]` (share payload) | `lib/queries/share.ts` service-client select (open/paid, 6 safe fields) | Yes - DB query | ✓ FLOWING |
| invoice.paid notification/email | `updated.amount_cents` | invoices row read-back in handleInvoicePaid | Yes - snapshot, never re-derived | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Phase-94 unit suites (split, service, action, query, both migrations, webhook, save-no-gate) | `vitest run` 8 files | 8 files / 40 tests passed | ✓ PASS |
| Platform subscription invoice.paid untouched | `vitest run stripe-webhook.test.ts` | 1 file / 8 tests passed | ✓ PASS |
| Live generate-invoice -> hosted page/PDF + frozen snapshot | requires connected Stripe test acct | n/a | ? SKIP -> human |

### Requirements Coverage

| Requirement | Source | Status | Evidence |
| --- | --- | --- | --- |
| INVOICE-01 | ROADMAP SC1 (+ SUMMARY 94-05) | ✓ SATISFIED | Truth 1 - all gates/actions/UI removed; save-no-gate GREEN |
| INVOICE-02 | ROADMAP SC2 (+ SUMMARY 94-01) | ✓ SATISFIED | Truth 2 - invoices migration + company_members RLS |
| INVOICE-03 | ROADMAP SC3 (+ SUMMARY 94-02/04) | ✓ SATISFIED | Truth 3 - service + action + dialog wired |
| INVOICE-04 | ROADMAP SC4 (+ SUMMARY 94-02) | ✓ SATISFIED | Truth 4 - cents-exact split, independent invoices |
| INVOICE-05 | ROADMAP SC5 (+ SUMMARY 94-03) | ✓ SATISFIED | Truth 5 - webhook invoice.paid, emails + notify reused |
| INVOICE-06 | ROADMAP SC6 (+ SUMMARY 94-04) | ✓ SATISFIED | Truth 6 - frozen snapshot + editor surfaces wired |
| INVOICE-07 | ROADMAP SC7 (+ SUMMARY 94-06) | ✓ SATISFIED | Truth 7 - backfill + pay-route retirement |

Note: INVOICE-01..07 are tracked inline in ROADMAP.md Phase 94 success criteria + SUMMARY frontmatter, NOT as `.planning/REQUIREMENTS.md` checkboxes (that file is the older v4.2 milestone). This is expected per phase context and is NOT a gap. Non-blocking follow-up: author a v4.3 REQUIREMENTS.md.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| (none) | - | No TODO/FIXME/placeholder in new lib files; no return-null/empty-array/`=>{}` stubs in dialog | - | No blockers |

`tests/unit/whatsapp/send-route.test.ts:10` carries `it.todo('returns 409 when ... !== "consolidated"')` - an intentionally pending stub describing the OLD behavior; harmless, not a gate. (ℹ️ Info)

### Human Verification Required

1. **Live generate-invoice end-to-end (Plan 94-04 Task 4 checkpoint)** - with a Stripe account Connected in test mode, run `npm run dev` and verify: Generate-invoice button visible; Deposit 30% preview ~30% + implied balance; issuing -> toast + inline "Invoice issued: $X . open" with working View/PDF (hosted page + PDF render); editing the total after issue leaves the issued amount frozen (INVOICE-06); issuing the balance creates a second row; share link shows working "Pay deposit/balance" hosted links.
   - **Why human:** Needs live Stripe credentials + real network round-trips (Customer->InvoiceItem->Invoice->finalize->hosted page+PDF+email+webhook). Every code path behind this flow passed static + unit verification; only the live integration is un-automatable.

### Gaps Summary

No code gaps. All 7 ROADMAP success criteria (INVOICE-01..07) are verified against actual source - not just SUMMARY claims:
- Consolidate lock fully retired (gates, actions, UI, index) with columns intentionally kept dormant so un-enumerated writers keep compiling.
- A real `invoices` snapshot entity with correct company_members RLS, CHECK enums, and indexes.
- Real Stripe Connect invoices (deposit/balance/full) via the correct Direct-Charges invariants (no platform fee, metadata routing, idempotency).
- The `invoice.paid` webhook closes the loop on the snapshot amount and reuses existing emails + notification; the platform subscription path is cleanly separated and untouched (its test stays 8/8).
- Snapshot immutability + inline editor surfacing are wired end-to-end with real DB-backed data flow.
- Backfill migration preserves history; the legacy Checkout pay route + components are fully removed; share page pays exclusively via hosted invoice links.

Phase-94 targeted suites are 40/40 GREEN. The ~24 pre-existing failing test files in the repo are an environment gap (uninstalled optional deps: langfuse, @sentry/nextjs, @modelcontextprotocol/sdk, @langchain/*) proven unrelated to this phase by set-diff against the pre-phase baseline - explicitly NOT attributed here.

The single outstanding item is the un-automatable live-Stripe checkpoint from Plan 94-04, hence status `human_needed` rather than `passed`.

---

_Verified: 2026-06-19T16:20:00Z_
_Verifier: Claude (gsd-verifier)_
