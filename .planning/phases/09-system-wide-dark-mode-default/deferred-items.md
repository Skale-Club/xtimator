# Deferred Items (Phase 09)

Pre-existing issues discovered during 09-05 execution that are OUT OF SCOPE for
the onboarding-survey plan. These must not be auto-fixed by this plan.

## Pre-existing TS errors (unrelated to 09-05)

- `tests/e2e/auth.spec.ts:65,8` — `test.todo` not typed on Playwright TestType in this project config.
- `tests/e2e/auth.spec.ts:69,8` — same.
- `tests/unit/env.test.ts:14,16` — `startsWith` called on `keyof ProcessEnv` (typing mismatch).

These files were not modified by 09-05 and the errors exist on main prior to
this plan. Log for future cleanup; do not fix here.

## Pre-existing vitest failure (unrelated to 09-05)

- `tests/integration/missing-key-ux.test.ts:89` — assertion expects body to
  match /not configured/i but the actual copy reads "Email sending isn't
  available right now…". Pre-existing copy drift in error messaging; out of
  scope for the onboarding-survey plan.
