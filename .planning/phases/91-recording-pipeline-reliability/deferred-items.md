# Deferred Items — Phase 91 (recording-pipeline-reliability)

Out-of-scope discoveries logged during execution. NOT fixed here — they are
unrelated to the recording pipeline and pre-date Phase 91.

## Pre-existing unit-suite failures (unrelated to REC-01..05)

Discovered during the Plan 91-02 full-suite merge gate (`npx vitest run`). These
21 suites (~50 tests) fail **with and without** the Plan 91-02 changes — verified
by stashing the Task 4 edits and re-running the failing suites (they still fail).
None of them import the recording-pipeline modules touched by Phase 91
(use-job-status, capture-recorder, generate-estimate/transcribe routes,
inngest/events, actions/recording, the three pollJob consumers).

Root cause (sampled): vitest 4 mock-hoisting semantics — e.g.
`admin-actions.test.ts` errors with `No "requireServiceClient" export is defined
on the "@/lib/supabase/service" mock`. The other suites show analogous
mock/assertion drift against the current vitest version.

Failing suites observed:
- tests/unit/globals-brand-tokens.test.ts
- tests/unit/price-book/bulk-adjust-action.test.ts
- tests/unit/price-book/import-action.test.ts
- tests/integration/missing-key-ux.test.ts
- tests/integration/theme-action.test.ts
- tests/unit/admin-actions.test.ts
- tests/unit/admin-dashboard.test.ts
- tests/unit/admin-gate.test.ts
- tests/unit/app-icons.test.ts
- tests/unit/blog-actions.test.ts
- tests/unit/cleanup-route-auth.test.ts
- tests/unit/custom-domain-action.test.ts
- tests/unit/seo-actions.test.ts
- tests/unit/translate-route.test.ts
- tests/unit/wizard-client-only.test.ts
- tests/unit/tour/tour-telemetry.test.ts
- (plus related admin/theme suites)

Recommendation: triage as a separate test-infra maintenance task (likely a
vitest 4 mock-API migration), independent of the v4.2 recording-reliability
milestone. The Phase 91 recording-pipeline suites (capture, hooks/use-job-status,
inngest, api/jobs-status, capture-failure) are all green.
