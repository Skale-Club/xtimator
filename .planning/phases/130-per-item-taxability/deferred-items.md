# Phase 130 — Deferred Items (out of scope)

Discovered during Plan 130-01 execution. These PRE-DATE Plan 130-01 and live in
UNRELATED test files — none in this plan's changed files. Not fixed per the
executor scope boundary.

## Pre-existing `tsc --noEmit` errors (unrelated test files)

- `tests/unit/ai/refine-shared-prompt.ts:49` — TS1501 regex flag requires es2018+ target.
- `tests/unit/estimate/observability.test.ts:38,58,66` — TS1501 regex flag requires es2018+ target.
- `tests/unit/estimate/step-runner.test.ts:50` — TS2322 StepRunner mock return type mismatch.
- `tests/unit/inngest/generate-estimate-job.test.ts:150` — TS2348 mock not callable.
- `tests/unit/whatsapp/handler-inngest-dispatch.test.ts:125,224` — TS2345 `Entitlements` fixture missing `chatEnabled`.
- `tests/unit/whatsapp/handler-intent-routing.test.ts:123` — TS2345 same `chatEnabled` gap.
- `tests/unit/whatsapp/handler.test.ts:135,282` — TS2345 same `chatEnabled` gap.

Note: the runtime vitest suite for these areas is green; these are type-level fixture/config drift in tests only.

## Re-confirmed during Plan 130-02

The identical pre-existing `tsc --noEmit` error set was re-observed during Plan 130-02 Task 2 and
re-confirmed pre-existing by stashing the 130-02 changes. The plan-touched files
(`lib/estimate/compute-totals.ts`, `lib/services/generate-estimate.ts`,
`tests/unit/estimate/per-category-tax.test.ts`, `tests/unit/services/pricing-retrocompat.test.ts`)
are tsc-clean. Still out of scope.
