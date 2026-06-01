# Deferred Items — quick-260531-mlx

Out-of-scope discoveries found during execution. NOT fixed (pre-existing, unrelated to this task).

## Pre-existing `tsc --noEmit` errors (verified present on baseline before this change)

These 6 errors exist on the pre-change commit and are unrelated to the OAuth redirect fix.
They concern a `subdomain` field on the onboarding/company form schema:

- `components/landing/auth-dialog.tsx:550` — TS2322 Control resolver mismatch (react-hook-form generic inference)
- `components/landing/auth-dialog.tsx:572` — TS2322 same
- `components/onboarding/onboarding-survey.tsx:13` — TS2741 Property 'subdomain' is missing
- `tests/unit/components/onboarding-survey.test.tsx:8` — TS2741 Property 'subdomain' is missing

The files changed in this task (`lib/utils/site-url.ts`, `app/(auth)/callback/route.ts`) introduce
zero new type errors and the new unit tests pass. These deferred errors should be addressed by the
team that owns the subdomain/onboarding schema work.
