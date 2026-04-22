# Deferred Items - Phase 09

## Pre-existing TypeScript errors (not caused by Plan 09-01)

Discovered during `bunx tsc --noEmit` while verifying Task 1:

- `tests/e2e/auth.spec.ts(65,8)` and `(69,8)`: `Property 'todo' does not exist on type 'TestType<...>'` — Playwright test.todo usage issue
- `tests/unit/env.test.ts(14,16)`: `Property 'startsWith' does not exist on type 'keyof ProcessEnv'` — type narrowing issue

Out of scope for Plan 09-01. Not regressions introduced by this plan.
