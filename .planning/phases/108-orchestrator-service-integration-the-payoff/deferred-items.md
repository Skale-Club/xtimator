# Phase 108 — Deferred / Out-of-Scope Items

Logged during execution. NOT fixed (scope boundary: only auto-fix issues directly
caused by the current task's changes).

## Pre-existing full-`tsc --noEmit` errors (NOT caused by Plan 108-03)

A bare `npx tsc --noEmit` over the whole repo reports 12 errors. NONE are in the
108-03 orchestrator (`lib/estimate/price-research/orchestrator.ts`) or its test
(`tests/unit/estimate/price-research-orchestrator.test.ts`) — both are tsc-clean.
The project's CI uses a scoped `tsconfig.ci.json`, not the full repo tsc.

### Group A — stale `Entitlements` test mocks (regression from Plan 108-01)

Plan 108-01 added the required field `maxPriceResearchPerMonth` to the `Entitlements`
interface (`lib/entitlements.ts`). Five pre-existing WhatsApp test files build inline
`Entitlements` object literals that were not updated and now miss that field:

- tests/unit/whatsapp/handler.test.ts (135, 280)
- tests/unit/whatsapp/handler-inngest-dispatch.test.ts (125, 222)
- tests/unit/whatsapp/handler-intent-routing.test.ts (123)

These are runtime-green (the missing field defaults to `undefined`, the mocked
`getEntitlements` is never asked for it on the WhatsApp paths). They are a one-field
mechanical fix owned by whoever next touches WhatsApp metering, or a follow-up to
108-01. Out of scope for 108-03 (different subsystem, not caused by this task).

### Group B — long-standing tsconfig/strictness mismatches (predate Phase 108)

- components/workspace/estimate/estimate-editor.tsx(51) — DocumentSection[] assignment
- tests/unit/ai/refine-shared-prompt.test.ts(49) — regex `s` flag needs es2018 target
- tests/unit/estimate/observability.test.ts(38,58,66) — same es2018 regex-flag
- tests/unit/estimate/step-runner.test.ts(50) — StepRunner mock shape
- tests/unit/inngest/generate-estimate-job.test.ts(150) — Mock callable/new

All predate Plan 108-03; surfaced only by a full-repo `tsc` (the CI uses a scoped
config). Not caused by this task; not fixed here.
