---
phase: 94-estimate-invoice-decoupling
plan: 06
subsystem: billing
tags: [invoices, stripe, migration, decoupling, retirement]
requires:
  - "20260619000001_phase94_invoices.sql (invoices table + CHECK constraints)"
  - "lib/billing/connect-webhook.ts invoice.paid handler (Plan 94-03)"
  - "estimate-view.tsx issued-invoice hosted-link block (Plan 94-04)"
  - "consolidate retirement (Plan 94-05)"
provides:
  - "Backfill of paid estimates into the invoices table (history preserved)"
  - "Retirement of the legacy /estimate/[token]/pay Checkout route"
  - "Share page pays exclusively via issued-invoice hosted links"
affects:
  - "Customer-facing estimate share page payment surface"
  - "supabase migrations (new backfill migration)"
tech-stack:
  added: []
  patterns:
    - "Idempotent backfill via INSERT ... SELECT with a NOT EXISTS guard"
    - "Set-diff regression check: full-suite fail list compared against the pre-change baseline"
key-files:
  created:
    - supabase/migrations/20260619000003_phase94_backfill_invoices.sql
  modified:
    - app/estimate/[token]/page.tsx
    - components/share/estimate-view.tsx
  deleted:
    - app/api/estimate/[token]/pay/route.ts
    - tests/unit/billing/estimate-pay.test.ts
    - components/estimate/pay-now-button.tsx
    - tests/unit/components/pay-now-button.test.tsx
    - components/estimate/payment-success-banner.tsx
decisions:
  - "Kept the Connect webhook checkout.session.completed case (Task 4): tests/unit/notifications/event-sources.test.ts still asserts that path, so per the plan guardrail the harmless dead case stays rather than break the suite"
  - "Deleted pay-now-button.tsx + its test and payment-success-banner.tsx as orphans once estimate-view stopped importing them — coherent retirement of the Checkout surface"
  - "Removed the now-unused searchParams from the share page (the ?stripe param was produced only by the deleted Checkout redirect)"
  - "Demo seed needed no change — Plan 94-05 already stopped seeding the retired consolidate fields; no dropped columns are referenced"
metrics:
  duration_min: 35
  tasks: 4
  files_changed: 8
  commits: 3
  completed: 2026-06-19
---

# Phase 94 Plan 06: Invoice Backfill + Checkout Pay-Route Retirement Summary

Completed the estimate–invoice decoupling (INVOICE-07): a backfill migration preserves payment history by writing one `kind='full', status='paid'` invoice per already-paid estimate, the legacy `/estimate/[token]/pay` Stripe Checkout Session route is retired, and the old Checkout `PayNowButton` (plus its dead `?stripe=` return banners) is removed from the share page so customers now pay exclusively through the Plan 94-04 issued-invoice hosted links.

## What Was Built

### Task 1 — Backfill migration (INVOICE-07 / D-22) — commit `32e34f5`
`supabase/migrations/20260619000003_phase94_backfill_invoices.sql` performs an `INSERT INTO public.invoices ... SELECT ... FROM estimates WHERE payment_status = 'paid'`, creating one immutable `kind='full', status='paid'` invoice row per paid estimate. It:
- Snapshots `payment_amount_cents` → `amount_cents`, `currency_code` (COALESCE to 'USD'), the project name (LEFT JOIN projects), and `paid_at`/`created_at` (COALESCE `paid_at` → `updated_at` → `now()`).
- Only backfills rows with `payment_amount_cents > 0` so the `invoices.amount_cents > 0` CHECK is never violated.
- Is idempotent via a `NOT EXISTS` guard that skips estimates that already have a paid full invoice (safe to re-run). `stripe_invoice_id` is NULL for backfilled rows; the partial unique index only indexes non-null values, so NULLs never collide.

Turns the Plan 94-01 static-contract test `tests/unit/billing/invoices-backfill-migration.test.ts` GREEN (4/4).

### Task 2 — Retire the Checkout pay route (D-23) — commit `dbc1d0a`
Deleted `app/api/estimate/[token]/pay/route.ts` (the POST Checkout Session handler) and its test `tests/unit/billing/estimate-pay.test.ts`. The empty `app/api/estimate/...` directory tree was pruned. Grep across `app/`, `lib/`, `components/`, `tests/` confirmed no live code references the dead route after Task 3.

> Note: the route lives at `app/api/estimate/[token]/pay/route.ts` (under `app/api/`), not `app/estimate/[token]/pay/route.ts` as the plan/objective shorthand wrote it. Confirmed via Glob before deleting.

### Task 3 — Remove Checkout PayNowButton + dead stripeState banners — commit `b002b22`
- `components/share/estimate-view.tsx`: dropped the `PayNowButton` import + its Phase 70 Card block, the `PaymentSuccessBanner`/`PaymentCanceledNotice` imports + render, and the now-always-null `stripeState` prop (from `EstimateViewProps` and the destructure). The Plan 94-04 issued-invoice `hosted_invoice_url` "Pay {kind} — $X" links are KEPT as the sole payment surface.
- `app/estimate/[token]/page.tsx`: removed the `stripeState` derivation, the `stripeState` prop on `<EstimateView />`, and the now-unused `searchParams` (the `?stripe=success|canceled` param was produced only by the deleted Checkout redirect).
- Deleted the orphaned `components/estimate/pay-now-button.tsx` + its test `tests/unit/components/pay-now-button.test.tsx` and the dead `components/estimate/payment-success-banner.tsx` (no remaining consumers).

### Task 4 — Optional cleanup (no code change)
- **Connect webhook:** evaluated removing the dead `checkout.session.completed` case. The Plan 94-03 `connect-events.test.ts` does not assert it, but a Phase 77 test (`tests/unit/notifications/event-sources.test.ts` Block D) DOES still call `handleConnectEvent` with a `checkout.session.completed` event and assert `payment.received`. Per the plan's explicit guardrail ("leave the case in place if a test still asserts it; harmless dead code is acceptable; do not break the suite"), the case was kept. The new `invoice.paid` handler (Plan 94-03) is untouched.
- **Demo seed:** no change required — Plan 94-05 (commit `8923e5e`) already stopped seeding the retired `workflow_status`/`consolidated_*` fields, and no columns were dropped this phase, so `scripts/seed-demo-workspace.mjs` references only valid columns.

## Verification

- `npx vitest run tests/unit/billing/invoices-backfill-migration.test.ts` → 4/4 GREEN.
- `npx tsc --noEmit` → zero errors in the files this plan touched (`estimate-view.tsx`, `app/estimate/[token]/page.tsx`) and no dangling errors for any deleted module. Remaining tsc errors are all pre-existing environment-gap errors (uninstalled optional deps `@langchain/*`, `@modelcontextprotocol/sdk`, `langfuse`, `@sentry/nextjs`) and one pre-existing `account-emails.test.ts` Branding-type drift — out of scope (SCOPE BOUNDARY).
- Full suite set-diff vs the pre-change baseline (`99cf983`): **zero new test failures**; the only resolved entries are the 4 backfill tests. Final 24 failed / 194 passed files (baseline 25/195); deletions removed 2 passing test files. All 24 remaining file failures are the documented environment gap + unrelated pre-existing (theme-toggle, onboarding-survey, landing-actions).
- Grep acceptance: `PayNowButton` and `stripeState` return NO hits in `estimate-view.tsx`; `stripeState` returns NO hits in `app/estimate/[token]/page.tsx`; `hosted_invoice_url` STILL hits in `estimate-view.tsx` (lines 257, 266 — Plan 94-04 links preserved).
- Existing estimates (paid and unpaid) still load on the share page: the share query and render path are unchanged except for the removal of the dead Checkout block; no gate or required field was added.

## Deviations from Plan

### Auto-fixed / scope-adjusted

**1. [Rule 3 - Blocking] Removed the now-unused `searchParams` from the share page**
- **Found during:** Task 3
- **Issue:** After dropping `stripeState`, `searchParams`/`sp` in `app/estimate/[token]/page.tsx` had no remaining consumer; leaving it would produce an unused-variable signal.
- **Fix:** Removed the `searchParams` field from `SharePageProps`, the `searchParams` param, and `const sp = await searchParams`.
- **Files modified:** app/estimate/[token]/page.tsx
- **Commit:** b002b22

**2. [Plan guardrail honored] Kept the Connect webhook checkout.session.completed case**
- **Found during:** Task 4
- **Issue:** An initial removal of the dead `checkout.session.completed` case broke `tests/unit/notifications/event-sources.test.ts` (a Phase 77 test that still asserts that path). The plan's read_first only named `connect-events.test.ts`, which does not assert it.
- **Resolution:** Reverted the removal. The plan explicitly directs keeping the case ("harmless dead code is acceptable; do not break the suite") when a test still asserts it. Net: Task 4 made no code change.
- **Files modified:** none (lib/billing/connect-webhook.ts restored to its committed state)

### Filename clarification
The objective/plan referenced `app/estimate/[token]/pay/route.ts`; the actual path is `app/api/estimate/[token]/pay/route.ts`. Resolved via Glob before deletion — no functional impact.

## Authentication Gates
None. No checkpoints in this plan; fully autonomous.

## Known Stubs
None. No placeholder data, empty-array-to-UI, or "coming soon" stubs were introduced. The change is a net removal of a retired payment surface plus a data backfill.

## Commits
- `32e34f5` feat(94-06): backfill one paid full invoice per paid estimate
- `dbc1d0a` feat(94-06): retire the /estimate/[token]/pay Checkout route + its test
- `b002b22` feat(94-06): remove Checkout PayNowButton + dead stripeState banners from share page

## Self-Check: PASSED

- Created files exist: `supabase/migrations/20260619000003_phase94_backfill_invoices.sql`, `.planning/phases/94-estimate-invoice-decoupling/94-06-SUMMARY.md`
- Deletions confirmed gone: pay route + its test, pay-now-button + its test, payment-success-banner
- Commits exist: `32e34f5`, `dbc1d0a`, `b002b22`
