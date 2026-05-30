# Phase 92 — Deferred / Out-of-Scope Items

Logged during execution per the GSD SCOPE BOUNDARY rule (only auto-fix issues directly
caused by the current task's changes; log unrelated pre-existing failures here).

## Pre-existing full-suite failures (NOT caused by Phase 92 Wave 0)

Running `npm test` reports ~50 failing tests across ~22 files that are unrelated to the
Phase 92 Wave-0 deliverables. None of these files import the Wave-0 changes
(`types/database.types.ts` additive `pipeline_events` block, the new
`lib/observability/pipeline-events.ts` scaffold, the migration SQL, or the smoke-check script).

Representative root cause (sampled): suites that `vi.mock('@/lib/supabase/service')` fail with
`No "requireServiceClient" export is defined on the "@/lib/supabase/service" mock` — vitest 4's
stricter mock validation flags mock factories that omit exports the SUT now imports. This is a
pre-existing test-infra condition independent of Phase 92.

Affected files (sampled): `tests/unit/admin-actions.test.ts`, `tests/unit/blog-actions.test.ts`,
`tests/unit/seo-actions.test.ts`, `tests/unit/custom-domain-action.test.ts`,
`tests/integration/theme-action.test.ts`, `tests/unit/ai/provider-factory.test.ts`,
`tests/unit/admin-dashboard.test.ts`, `tests/unit/queries/dashboard.test.ts`,
`tests/unit/queries/auth.test.ts`, and others.

Action: NOT fixed in Phase 92 (out of scope). Flag for a dedicated test-maintenance pass.

## Intentional Wave-0 RED tests (expected to fail until Waves 1-3)

These are by design (Nyquist RED-first contract) and are NOT deferred work:

- `tests/unit/observability/record-pipeline-event.test.ts` (3) — helper impl lands Wave 1
- `tests/unit/observability/instrumentation-presence.test.ts` (5) — instrumentation lands Wave 2/3
- `tests/unit/observability/input-type-threading.test.ts` (5) — threading lands Wave 3
