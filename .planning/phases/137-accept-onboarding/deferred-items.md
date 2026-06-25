# Deferred Items — Phase 137 (accept-onboarding)

Out-of-scope discoveries logged during execution. NOT fixed by this phase.

## Pre-existing tsc errors in unrelated test suites (found during 137-02)

`npx tsc --noEmit -p tsconfig.json` reports type errors in test files unrelated to
the SEAT-04 work. None are in files touched by Plan 02. Left untouched per scope boundary:

- `tests/unit/ai/refine-shared-prompt.test.ts` — TS1501 regex flag needs es2018+ target
- `tests/unit/estimate/markup-totals.test.ts` — TS2345 ComputeTotalsItem missing `unit_price`
- `tests/unit/estimate/observability.test.ts` — TS1501 regex flag (multiple)
- `tests/unit/estimate/step-runner.test.ts` — TS2322 StepRunner mock type mismatch
- `tests/unit/inngest/generate-estimate-job.test.ts` — TS2348 Mock not callable
- `tests/unit/whatsapp/handler-inngest-dispatch.test.ts` — TS2345 Entitlements missing `chatEnabled`
- `tests/unit/whatsapp/handler-intent-routing.test.ts` — TS2345 Entitlements missing `chatEnabled`

These are test-fixture drift against current types; they do not affect the runtime auth/invite flow.
