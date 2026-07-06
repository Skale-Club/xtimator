# Deferred Items — quick-260704-pt2

Pre-existing `tsc --noEmit` failures observed in the full project-wide run, unrelated to
this plan's `files_modified` list. Verified identical before and after all three tasks —
not introduced or worsened by this plan. Logged here per the scope-boundary rule
(out-of-scope failures in unrelated files are not auto-fixed).

- `tests/unit/ai/refine-shared-prompt.test.ts` — regex `d`/unicode flag needs `es2018`+ target (TS1501)
- `tests/unit/estimate/observability.test.ts` (x3) — same TS1501 regex-flag issue
- `tests/unit/billing/calibration.test.ts` (x2) — `TierBilling` missing `subscriptionPriceAnnualCents`/`includedSeats` in test fixtures
- `tests/unit/billing/seat-billing.test.ts` (x3) — tuple-type spread/conversion mismatches
- `tests/unit/estimate/markup-totals.test.ts` — `ComputeTotalsItem` missing `unit_price` in test fixture
- `tests/unit/estimate/step-runner.test.ts` — `StepRunner.run` mock generic mismatch
- `tests/unit/inngest/generate-estimate-job.test.ts` — `Mock<Procedure | Constructable>` not callable
- `tests/unit/whatsapp/handler*.test.ts` (x5) — `Entitlements` missing `chatEnabled` in test fixtures

None of these touch estimates, photos, or share-link code paths.
