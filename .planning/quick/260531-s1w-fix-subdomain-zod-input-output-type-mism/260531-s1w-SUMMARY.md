---
type: quick
id: 260531-s1w
title: Fix subdomain zod input/output type mismatch breaking next build
status: complete
completed: 2026-06-01
key-files:
  modified:
    - components/landing/auth-dialog.tsx
    - components/onboarding/onboarding-survey.tsx
    - tests/unit/components/onboarding-survey.test.tsx
---

# Quick Task 260531-s1w: Fix subdomain zod input/output type mismatch Summary

Dropped `.optional().default('')` from the `subdomain` field in `companySchema`
so the zod input and output types align with `useForm<CompanyValues>` +
`zodResolver`, clearing the TypeScript error that was breaking `next build` and
blocking all production image builds (CI -> GHCR). Added the now-required
`subdomain: ''` key to the two `OnboardingValues` object literals.

## Changes

1. **components/landing/auth-dialog.tsx** — `companySchema.subdomain` changed
   from `z.string().regex(...).optional().default('')` to
   `z.string().regex(...)` (same regex + message). `defaultValues` and
   `values.subdomain ?? ''` left untouched.
2. **components/onboarding/onboarding-survey.tsx** — added `subdomain: '',` to
   the `INITIAL: OnboardingValues` object (after `companyName: ''`).
3. **tests/unit/components/onboarding-survey.test.tsx** — added `subdomain: '',`
   to the fixture `INITIAL: OnboardingValues` object.

`lib/schemas/onboarding.ts` was NOT modified, as instructed.

## Verification

- `npx tsc --noEmit` — exit code 0, no errors. The subdomain/companyName/
  Resolver errors in the three files are gone. No unrelated pre-existing errors
  surfaced.
- `npx vitest run tests/unit/components/onboarding-survey.test.tsx` — green
  (1 file passed, 10/10 tests passed).

## Deviations from Plan

None — executed exactly as written.

## Deploy / Push Note

Local commit only. **Did NOT git push.** Push is a human gate: pushing
re-triggers the on-VPS build risk and the GitHub Actions build needs
human-set repository Variables configured first. The human will push when ready.

## Self-Check: PASSED

- All 3 modified files present.
- PLAN.md and SUMMARY.md present.
- Commit hash recorded below in completion output.
