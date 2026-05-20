# Deferred Items — Phase 77

Pre-existing test failures discovered during 77-03 execution. These were
failing BEFORE this plan's changes (verified via `git stash` baseline) and are
unrelated to the notification subsystem.

## Test files failing in baseline (pre-existing)

- tests/unit/admin-actions.test.ts (6 cases) — admin add/remove admin mocks broken
- tests/unit/admin-dashboard.test.ts (4 cases) — DASH-01 stat mocks broken
- tests/unit/admin-gate.test.ts (4 cases) — admin context mocks broken
- tests/unit/blog-actions.test.ts (7 cases) — BLOG-01 supabase mocks broken
- tests/unit/cleanup-route-auth.test.ts (1 case)
- tests/unit/landing-actions.test.ts (5 cases) — LP-01 mocks broken
- tests/unit/seo-actions.test.ts (4 cases) — SEO-01 mocks broken
- tests/unit/wizard-client-only.test.ts (2 cases)
- tests/unit/dashboard/stat-cards.test.tsx (1 case)
- tests/unit/queries/auth.test.ts (2 cases) — `vi.mock` typing changed in vitest 4

All fail in isolation with messages like:

> No "requireServiceClient" export is defined on the "@/lib/supabase/service" mock.
> Did you forget to return it from "vi.mock"?

Looks like a vitest 4 upgrade requires `importOriginal` for partial mocks.
Future plan should sweep all these test files and apply the new pattern.

Baseline: 11 failed files / 46 failed cases.
After 77-03: 10 failed files / 36 failed cases (event-sources adds 10 passing).
Net delta: 0 regressions, +10 passing.
