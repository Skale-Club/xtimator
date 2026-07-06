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

## 151-02: Pre-existing full-suite failures (unrelated to this plan's files)

`npm test` full run shows 7 failing tests across 6 files, none referencing
`app/(app)/layout.tsx`, `lib/auth/support-mode.ts`, or
`components/admin/support-mode-banner.tsx`. Confirmed via `git log --stat` on
the last 2-3 commits that none of these files were touched by Plan 02's
changes:

- `tests/integration/blog-rls.test.ts` (2 tests) — anon-client RLS visibility checks, requires a live DB connection; likely a pre-existing integration-test env gap on this machine
- `tests/unit/cleanup-route-auth.test.ts` — `CRON_SECRET` 503 gate test
- `tests/unit/company-action.test.ts` — Billing v2 signup credit grant regression
- `tests/unit/ai/empty-output-guards.test.ts` — photo analysis empty-output guard
- `tests/unit/ai/transcribe-fallback.test.ts` — OpenRouter primary transcription success path
- `tests/unit/components/landing-page.test.tsx` — AuthDialog auto-open on `?auth=login` (matches STATE.md's documented Windows parallel-import flake history)

Not fixed, per scope-boundary rule — none are caused by this plan's changes.
`npx tsc --noEmit` also confirmed clean for `app/(app)/layout.tsx` and
`components/admin/support-mode-banner.tsx` (zero new errors in either file;
all remaining tsc output matches the 151-01 list above).
