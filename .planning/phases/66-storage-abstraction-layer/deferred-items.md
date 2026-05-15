# Phase 66 — Deferred Items (Out-of-scope discoveries)

Items found during Phase 66 execution that are unrelated to this phase's
scope and should be triaged in a separate plan.

## Pre-existing tsc errors (baseline, present on main before Phase 66)

These errors exist on main and were NOT introduced by Phase 66. They are
out of scope per the SCOPE BOUNDARY rule (executor only auto-fixes issues
directly caused by the current task's changes).

- `tests/unit/api/analyze-photos-quota.test.ts(111,81)` — TS2322: Type 'null' is not assignable to type 'number | undefined'
- `tests/unit/api/generate-estimate-quota.test.ts(72,81)` — TS2322: Type 'null' is not assignable to type 'number | undefined'
- `tests/unit/whatsapp/pdf-delivery.test.ts(106,31)` — TS2339: Property 'storage' does not exist on type 'never'
- `tests/unit/whatsapp/pdf-delivery.test.ts(108,33)` — TS2339: Property 'storage' does not exist on type 'never'

Recommended fix path: small follow-up plan or piggy-back on Phase 66 Plan 02
(which migrates pdf-delivery.ts and may re-touch the related test file).
