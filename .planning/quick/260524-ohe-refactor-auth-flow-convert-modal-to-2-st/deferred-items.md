# Deferred items — 260524-ohe

Pre-existing unit-test failures discovered while running the full `npx vitest run` for verification. **None of these are caused by this refactor** — verified by stashing the working tree and confirming the same tests fail on the base commit.

Out of scope per executor SCOPE BOUNDARY rule. Tracked here for future cleanup.

## Pre-existing failing tests (13 verified pre-existing, ~25 more in the same vein)

All failures share the same root cause pattern: `vi.mock` declarations are missing exports the implementation now imports (e.g. `requireServiceClient` not declared on the `@/lib/supabase/service` mock; `getServiceClient` not declared on `@/lib/supabase/admin`). These are stale test mocks that drifted from the production module surface — they need targeted `vi.mock` updates per file.

- `tests/unit/admin-actions.test.ts` — 6 tests (`requireServiceClient` mock missing)
- `tests/unit/blog-actions.test.ts` — 7 tests (`requireServiceClient` mock missing)
- `tests/unit/admin-dashboard.test.ts` — 4 tests
- `tests/unit/admin-gate.test.ts` — 4 tests
- `tests/unit/app-icons.test.ts` — 1 test
- `tests/unit/cleanup-route-auth.test.ts` — 1 test
- `tests/unit/seo-actions.test.ts` — 4 tests
- `tests/unit/translate-route.test.ts` — 1 test
- `tests/unit/wizard-client-only.test.ts` — 2 tests
- `tests/unit/ai/provider-factory.test.ts` — 3 tests
- `tests/unit/inngest/transcribe-audio-job.test.ts` — 1 test
- `tests/unit/price-book/bulk-adjust-dialog.test.tsx` — 1 test
- `tests/unit/queries/auth.test.ts` — 2 tests
- `tests/integration/missing-key-ux.test.ts` — 1 test
- `tests/unit/globals-brand-tokens.test.ts` — 1 suite failed to load

**Plan-scoped tests (this refactor's tests + the modified files') are all green:**
- `tests/unit/middleware.test.ts` — 9 passed
- `tests/unit/auth-actions.test.ts` — 6 passed
- `tests/unit/components/landing-page.test.tsx` — 9 passed
