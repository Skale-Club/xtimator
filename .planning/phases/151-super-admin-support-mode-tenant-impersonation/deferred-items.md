# Deferred Items — Phase 151

Items discovered during execution that are out of scope for this phase's plans
(pre-existing, unrelated to `lib/auth/support-mode.ts` / `lib/admin/audit-log.ts`)
and therefore NOT auto-fixed, per the executor's scope-boundary rule.

## 151-01: Pre-existing `tsc --noEmit` errors (unrelated files)

`npx tsc --noEmit` reports 42 lines of pre-existing type errors, confirmed present
even on a clean tree without this plan's changes (verified via `git stash`). None
reference `lib/auth/support-mode.ts` or `lib/admin/audit-log.ts`. Files affected:

- `tests/unit/ai/refine-shared-prompt.test.ts` — regex flag target error
- `tests/unit/billing/calibration.test.ts` — `TierBilling` missing `subscriptionPriceAnnualCents`/`includedSeats` in test fixtures
- `tests/unit/billing/seat-billing.test.ts` — spread-argument/tuple type errors
- `tests/unit/estimate/markup-totals.test.ts` — `ComputeTotalsItem` missing `unit_price` in test fixture
- `tests/unit/estimate/observability.test.ts` — regex flag target errors
- `tests/unit/estimate/step-runner.test.ts` — `StepRunner` mock type mismatch
- `tests/unit/inngest/generate-estimate-job.test.ts` — mock not callable
- `tests/unit/whatsapp/handler*.test.ts` (3 files) — `Entitlements` missing `chatEnabled` in test fixtures

These look like drift from other in-flight/unrelated milestone work (billing
annual pricing, seat billing, chat entitlements) whose test fixtures haven't
been updated to match evolved types. Not touched by Phase 151.

Also present in the working tree (uncommitted, not created by this plan):
`app/(app)/layout.tsx`, `app/(app)/settings/billing/page.tsx`,
`components/app-shell/topbar.tsx`, `tests/unit/billing/billing-config.test.ts`,
`app/admin/companies/[id]/page.tsx`, plus untracked
`app/admin/companies/[id]/company-cost-card.tsx`,
`tests/unit/admin/company-cost-card.test.tsx`,
`tests/unit/billing/tenant-cost-neutrality.test.ts` — all pre-dating this
session's work (last touched 2026-07-04 per git history), left untouched.
