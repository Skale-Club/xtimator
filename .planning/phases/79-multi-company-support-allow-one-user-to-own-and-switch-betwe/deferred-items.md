# Phase 79 — Deferred Items

Pre-existing test failures observed during Plan 04 full-suite run. **NOT caused by Plan 04** — none of these tests touch `app/(app)/layout.tsx` or the active-company resolvers. They are unrelated domains (admin actions, blog, seo, ai provider factory, inngest jobs, price-book, queries/auth mocks).

Counts at Plan 04 close: 15 test files failed / 145 passed (160 total); 38 tests failed / 985 passed / 2 skipped / 5 todo.

Notable failing files (not exhaustive):
- tests/unit/queries/auth.test.ts (getCachedCompany — mocked `requireServiceClient` issue, pre-existing)
- tests/unit/admin-actions.test.ts
- tests/unit/admin-dashboard.test.ts
- tests/unit/admin-gate.test.ts
- tests/unit/blog-actions.test.ts
- tests/unit/seo-actions.test.ts
- tests/unit/ai/provider-factory.test.ts
- tests/unit/inngest/transcribe-audio-job.test.ts
- tests/unit/price-book/bulk-adjust-dialog.test.tsx
- tests/unit/wizard-client-only.test.ts
- tests/unit/translate-route.test.ts
- tests/unit/cleanup-route-auth.test.ts
- tests/integration/missing-key-ux.test.ts
- tests/unit/globals-brand-tokens.test.ts
- tests/unit/app-icons.test.ts

Plan 04 contribution: 8/8 new contract tests in `tests/unit/app-layout-active-company.test.ts` pass; `npx tsc --noEmit` exits 0.

These pre-existing failures should be triaged in a dedicated quick task or as part of the next phase that touches the affected files.
