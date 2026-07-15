# Deferred Items — quick-260715-08i

Out-of-scope discoveries found while executing this task. NOT caused by these
changes, NOT fixed here (scope boundary: only auto-fix issues the current task
introduced).

## Pre-existing `tsc --noEmit` errors (25, all in `tests/`)

`npx tsc --noEmit` is **not** clean on `main` and was not clean before this task.
Verified by stashing this task's changes and re-running: baseline is 25 errors,
and this task adds **zero** new ones (all 25 are in unrelated test files; none in
`app/admin/billing/**`).

Clusters:
- `tests/unit/billing/calibration.test.ts` — test fixtures build partial
  `TierBilling` objects; the type gained `subscriptionPriceAnnualCents`,
  `includedSeats`, `stripePriceIdMonth`, `stripePriceIdYear` + 2 more, so the
  fixtures no longer satisfy `Pick<BillingConfig, 'markup'|'creditUnitUsd'|'tiers'>`.
- `tests/unit/billing/seat-billing.test.ts` — spread-argument / tuple-cast errors.
- `tests/unit/whatsapp/*` — `whatsappEnabled` no longer exists on `Entitlements`
  (5 occurrences across handler tests).
- `tests/unit/estimate/observability.test.ts` — regex `s` flag needs `target: es2018+`.
- `tests/unit/estimate/step-runner.test.ts` — `StepRunner` generic mock mismatch.
- `tests/unit/inngest/generate-estimate-job.test.ts` — mock not callable.
- `tests/unit/observability/env-check.test.ts` — `delete` on a non-optional operand.

Note: these are type-level only — `npx vitest run tests/unit/admin tests/unit/billing`
passes 661/661. The test *runtime* is fine; the *types* have drifted from the source.

## Pre-existing `npm run lint` failures (504 problems: 179 errors, 325 warnings)

Repo-wide `eslint` is not clean on `main`. The four files touched by this task
(`app/admin/billing/{page,loading,billing-table}.tsx`,
`tests/unit/admin/billing-table-controls.test.tsx`) lint **clean** (exit 0).

Bulk of the errors are `@typescript-eslint/no-explicit-any` in test files
(e.g. `tests/unit/whatsapp/integrations-page.test.tsx`) plus `no-unused-vars`
warnings.

## Why this matters

The plan's verification block specifies bare `npx tsc --noEmit` and `npm run lint`
as pass/fail gates. Neither can pass on this repo today, so those gates were
evaluated **scoped to the changed files** instead, plus a stash-based baseline
diff to prove no new errors were introduced. A separate cleanup task should
either fix the test-type drift or the gates will keep reading as red.
