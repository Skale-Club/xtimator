# Deferred Items — Phase 136

## From 136-02 (out-of-scope pre-existing tsc errors)

Discovered while typechecking touched files. NONE are caused by 136-02 changes —
all pre-date this plan and live in unrelated test files. Not fixed here.

- `tests/unit/whatsapp/handler.test.ts` + `handler-inngest-dispatch.test.ts` +
  `handler-intent-routing.test.ts` — Entitlements fixtures missing `chatEnabled` property.
- `tests/unit/estimate/markup-totals.test.ts` — ComputeTotalsSection fixture type drift.
- `tests/unit/estimate/step-runner.test.ts` — StepRunner mock shape drift.
- `tests/unit/ai/refine-shared-prompt.test.ts` + `tests/unit/estimate/observability.test.ts`
  — regex `s` flag needs es2018+ target.
- `tests/unit/inngest/generate-estimate-job.test.ts` — Mock not callable (new vs call).
