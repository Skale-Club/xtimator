---
phase: 114-estimate-payment-fee-payment-ui-gating-disclosure
plan: 02
subsystem: billing
tags: [stripe-connect, payment-ui-gating, paymentsEnabled, paygate, no-orphan]
requires:
  - lib/actions/invoice.ts (Phase 94 generateInvoice + Phase 70 Connect columns)
  - components/workspace/estimate/estimate-editor.tsx (Phase 94 GenerateInvoiceDialog)
  - app/(app)/projects/[id]/page.tsx (company row + editor prop chain)
provides:
  - "lib/billing/payments-enabled.ts :: paymentsEnabled(company) — single forward-affordance gate (PAYGATE-01)"
  - "EstimateEditor Generate-invoice affordance gated on paymentsEnabled (PAYGATE-02)"
  - "generateInvoice Connect check refactored to call the same predicate (no drift)"
affects:
  - lib/actions/invoice.ts
  - components/workspace/project-workspace.tsx
  - components/workspace/overview-tab.tsx
  - components/workspace/estimate/estimate-tab.tsx
  - components/workspace/estimate/estimate-editor.tsx
  - app/(app)/projects/[id]/page.tsx
tech-stack:
  added: []
  patterns:
    - "Pure predicate (no server-only) so a server-computed boolean threads to a client surface as a prop"
    - "One gate definition (paymentsEnabled) backs BOTH the server action and the UI affordance — zero drift"
    - "Gate forward-looking AFFORDANCES; historical read-only RECORDS stay ungated (locked decision)"
key-files:
  created:
    - lib/billing/payments-enabled.ts
    - tests/unit/billing/payments-enabled.test.ts
    - tests/unit/settings/editor-payment-gating.test.tsx
  modified:
    - lib/actions/invoice.ts
    - components/workspace/project-workspace.tsx
    - components/workspace/overview-tab.tsx
    - components/workspace/estimate/estimate-tab.tsx
    - components/workspace/estimate/estimate-editor.tsx
    - app/(app)/projects/[id]/page.tsx
    - tests/unit/settings/payments-page.test.tsx
    - tests/e2e/estimate-share-payment.spec.ts
decisions:
  - "Gate forward-looking AFFORDANCES only; the Paid badge and IssuedInvoicesPanel are RECORDs and may persist when disconnected — a never-connected company simply has none (panel returns null when empty)."
  - "Editor-gating test asserts the exact {isCurrent && paymentsEnabled} guard via the predicate rather than full-rendering the heavy client editor — the deterministic seam, same boolean the JSX consumes."
  - "Connect control panel (app/(app)/settings/payments/page.tsx) keeps its own three-way state machine (not_configured/connected/not_connected); it is inventory surface 4 (the gate's OWN panel, Plan 03's), NOT a forward affordance — out of this plan's scope."
metrics:
  duration: ~9m
  tasks: 3
  files: 11
  completed: 2026-06-24
---

# Phase 114 Plan 02: Payment-UI Gating Summary

A single `paymentsEnabled(company)` server predicate is now the only source of truth for whether forward-looking payment UI may render; it gates the owner editor's Generate-invoice affordance (no orphan when disconnected) and backs the `generateInvoice` Connect check, so the action and the UI can never drift.

## What Shipped

- **PAYGATE-01 — `lib/billing/payments-enabled.ts` :: `paymentsEnabled(company)`**: a PURE module (no `import 'server-only'`, no I/O) returning `Boolean(company.stripe_account_id) && company.stripe_connect_status === 'active'`. Pure so the server computes it and threads the boolean to a client surface as a prop, and so it is unit-testable in isolation. 5 unit cases cover active / disconnected / pending / null-account / null-status.
- **PAYGATE-01 — `generateInvoice` refactor (no drift)**: the inline `if (!company?.stripe_account_id || company.stripe_connect_status !== 'active')` in `lib/actions/invoice.ts` (step 4) is replaced with `if (!company || !paymentsEnabled(company))`. Same error message, same guard position (before any Stripe call), same selected columns. No `=== 'active'` payment literal remains in the action (only a doc-comment mention).
- **PAYGATE-02 — editor affordance gated, threaded server→client**: the project page (`app/(app)/projects/[id]/page.tsx`) now selects `stripe_account_id, stripe_connect_status` on the company query and computes `const canIssueInvoice = paymentsEnabled(...)` server-side. The boolean is threaded `ProjectWorkspace → OverviewTab → EstimateTab → EstimateEditor` (the real chain — one level deeper than the plan's sketch). In the editor the dialog gate changed from `{isCurrent && (` to `{isCurrent && paymentsEnabled && (` around `<GenerateInvoiceDialog />`, so a disconnected company renders NO orphan payment element.
- **PAYGATE-02 — IssuedInvoicesPanel stays ungated (locked decision)**: it returns null when empty, so a never-connected company shows nothing anyway; an already-issued panel / "Paid" badge is a historical RECORD, not an affordance, and may persist when disconnected. Documented in an editor code-comment and in the tests.
- **PAYGATE-02 — two-state coverage**:
  - `tests/unit/settings/payments-page.test.tsx` gains a `PAYGATE-02` block asserting `paymentsEnabled` is OFF for disconnected / never-connected and ON for active (the boolean the editor gate consumes).
  - NEW `tests/unit/settings/editor-payment-gating.test.tsx` asserts the editor's exact `{isCurrent && paymentsEnabled}` guard: affordance renders only when active AND current; not rendered when disconnected, never-connected, or non-current (read-only version).
  - `tests/e2e/estimate-share-payment.spec.ts` Scenario A already proves the disconnected share page shows no "Pay $" surface / "Powered by Stripe" (inventory surface 3 — naturally gated, a disconnected company has no open invoice); a documenting comment records the locked record-vs-affordance decision.

## Tasks & Commits

| Task | Name | Commit | Key files |
| ---- | ---- | ------ | --------- |
| 1 | paymentsEnabled predicate + refactor generateInvoice gate (PAYGATE-01) | 7f16528c | lib/billing/payments-enabled.ts, tests/unit/billing/payments-enabled.test.ts, lib/actions/invoice.ts |
| 2 | Gate Generate-invoice affordance on paymentsEnabled (PAYGATE-02) | 91e696f1 | app/(app)/projects/[id]/page.tsx, project-workspace.tsx, overview-tab.tsx, estimate-tab.tsx, estimate-editor.tsx |
| 3 | Two-state coverage for the payment gate (PAYGATE-02) | 047e07d4 | payments-page.test.tsx, editor-payment-gating.test.tsx, estimate-share-payment.spec.ts |

## Verification

- `npx vitest run tests/unit/billing/payments-enabled.test.ts tests/unit/settings/payments-page.test.tsx tests/unit/settings/editor-payment-gating.test.tsx tests/unit/actions/invoice.test.ts` → **4 files / 20 passed**.
- `tsc --noEmit -p tsconfig.json` → no NEW errors in the five touched source files (page + workspace + overview-tab + estimate-tab + editor).
- Acceptance greps all pass: predicate exported + pure (no `import 'server-only'`); action calls `paymentsEnabled(company)`; `grep -c "stripe_connect_status !== 'active'" lib/actions/invoice.ts` → 0; editor has `isCurrent && paymentsEnabled`; page selects `stripe_connect_status` + computes + passes; `disconnected` present in payments-page test; e2e disconnected-no-pay case present.
- Single-gate invariant holds: the only forward-affordance active-status predicate is `paymentsEnabled`. The remaining `=== 'active'` matches are a doc-comment in invoice.ts and the Connect control panel's own three-way state machine (surface 4, Plan 03's scope, not a forward affordance).
- FULL `npx vitest run` → **291 files passed | 1 failed (2077 passed)**; the single failure is the pre-existing PARALLEL-ONLY flake `tests/unit/mcp-route-contract.test.ts > GET returns 405` (re-confirmed **8/8 in isolation**), which touches no Phase-114 file — out of scope per the known issue.
- All commits normal hooked (gitleaks ran, no `--no-verify`); no leaks (placeholder Stripe ids only in tests).

## Deviations from Plan

None affecting behavior. One implementation note: the editor prop chain is one level deeper than the plan's sketch — the real path is `page.tsx → ProjectWorkspace → OverviewTab → EstimateTab → EstimateEditor` (the plan named page → OverviewTab → EstimateEditor). `paymentsEnabled` was threaded through all four intermediate components; tsc confirms no render site was missed.

## Deferred Issues

- **Full-suite flake (out of scope):** `tests/unit/mcp-route-contract.test.ts > GET returns 405` fails ONLY in the full parallel `npx vitest run`; passes **8/8 in isolation**. Pre-existing test-isolation/ordering flake (also logged in 114-01), touches no Phase-114 file. Not fixed per the scope boundary.

## Known Stubs

None. The gate is fully wired: the boolean is computed server-side from the live company Connect row and threaded to the affordance; no hardcoded/empty placeholder values feed the gate.

## Self-Check: PASSED

- Created files exist: lib/billing/payments-enabled.ts, tests/unit/billing/payments-enabled.test.ts, tests/unit/settings/editor-payment-gating.test.tsx, 114-02-SUMMARY.md
- Commits exist: 7f16528c, 91e696f1, 047e07d4
