# Deferred Items — quick-260531-rqa

Out-of-scope discoveries found during execution. NOT fixed by this plan (not in the
PLAN's Part-2 / Part-3 file lists).

## Bare `process.env.NEXT_PUBLIC_APP_URL` base-URL usages still present (out of scope)

These two billing routes interpolate `process.env.NEXT_PUBLIC_APP_URL` directly into
Stripe return/success/cancel URLs with no fallback. They are NOT in this plan's file
list, so they were left untouched. A future task could route them through
`getCanonicalBaseUrl()` (or `resolveBaseUrl(req)` since they have a request in scope)
to avoid an `undefined`-prefixed URL when the env var is unset:

- `app/api/billing/create-portal-session/route.ts:35` — `return_url: ${process.env.NEXT_PUBLIC_APP_URL}/settings/billing`
- `app/api/billing/create-checkout-session/route.ts:50-51` — `success_url` / `cancel_url`

## Pre-existing tsc errors (unrelated to this plan)

`npx tsc --noEmit` reports errors in onboarding survey files unrelated to base-URL work:
- `components/onboarding/onboarding-survey.tsx` (missing `subdomain` field)
- `tests/unit/components/onboarding-survey.test.tsx`

These predate this plan and are out of scope (no base-URL changes touch them).
