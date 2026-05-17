# Phase 71 — Deferred Items (out-of-scope discoveries)

## Pre-existing unit test failures (NOT caused by Plan 71-02)

Running `bun run test` reports 43 failures across:
- `tests/unit/inngest/*` (7 files) — Inngest job + client tests; env/service config required
- `tests/unit/storage/s3-provider.test.ts` — S3 provider env
- `tests/unit/admin-actions.test.ts`, `tests/unit/admin-dashboard.test.ts`, `tests/unit/admin-gate.test.ts`, `tests/unit/admin-test-button.test.ts`, `tests/unit/queries/auth.test.ts` — `requireServiceClient()` throws when no SUPABASE_SERVICE_ROLE_KEY in test env

These pre-date Plan 71-02 (none touch UI primitives or design tokens). Logged here per executor `SCOPE BOUNDARY` rule. To resolve: ensure `tests/setup/load-env.ts` is producing a service-role key for local test runs, or mock `requireServiceClient` in the affected test suites.

**Verification this is pre-existing:** all failing files are in `tests/unit/{inngest,storage,admin*,queries}` paths with no overlap to `tests/unit/components/` (which is 65/65 passing post-71-02).

## Plan 71-03 — Marketing visual baselines NOT minted

Marketing visual spec (`tests/e2e/visual/marketing.spec.ts`) was authored and committed during 71-03 covering `/`, `/blog`, `/blog/[slug]` across 3 viewports × 3 langs (up to 27 baselines). However, baselines were NOT minted because:

1. The plan ran in **parallel wave 2** alongside 71-04 (auth/onboarding) with the executor instructed not to monopolize the dev server.
2. Playwright `webServer` config attempts to spawn `bun run dev` per run; boot consistently exceeded the 30s default in the executor sandbox.

The spec is well-formed and will mint cleanly in a single command once a dev server is running:

```bash
bun run dev &  # in another shell
VISUAL=1 bunx playwright test tests/e2e/visual/marketing.spec.ts --grep @visual --update-snapshots --project=chromium
```

Suggested follow-up: bundle this with the post-wave verification step that the orchestrator runs (or with the first plan in Wave 3 once the auth fixture lands). REDESIGN-04 marked **partial-complete** in REQUIREMENTS.md (marketing surfaces redesigned, baselines pending mint).
