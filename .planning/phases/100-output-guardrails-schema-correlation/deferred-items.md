# Phase 100 — Deferred / Out-of-Scope Items

Pre-existing issues observed during execution but NOT in scope of the current plan.
Do not fix these here.

## Pre-existing tsc --noEmit errors (unrelated to 100-02 files)

Observed while running `npx tsc --noEmit` during Plan 100-02. None are in the
plan's files (`lib/ai/price-anchoring.ts`, `lib/estimate/totals.ts`,
`lib/services/generate-estimate.ts` — all clean). All pre-date this plan:

- `tests/unit/ai/schema.test.ts` — `result.data` typed `unknown` (TS18046 x6). Belongs to 100-01 (GUARD-01 schema) test surface.
- `tests/unit/estimate/observability.test.ts` — regex flag requires es2018 target (TS1501 x3). 100-03 / tsconfig target concern.
- `tests/unit/inngest/generate-estimate-job.test.ts` — Mock not callable (TS2348).
- `tests/unit/notifications/account-emails.test.ts` — Branding type missing fields (TS2345 x3). Unrelated to estimate engine.
- `tests/unit/xphere-client.test.ts` — `pipeline` property missing (TS2741). Per execution_mode: xphere is OUT OF SCOPE; do NOT touch.

These do not affect the runtime vitest run (`tests/unit/ai` + `tests/unit/estimate`
are 120/120 green) and are runtime-type-only test issues.
