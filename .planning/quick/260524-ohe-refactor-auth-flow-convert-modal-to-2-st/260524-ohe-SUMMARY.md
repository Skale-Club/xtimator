---
phase: quick-260524-ohe
plan: 01
subsystem: auth
type: summary
tags: [auth, refactor, modal, landing-page, e2e]
requires: []
provides:
  - "Single in-modal 2-step auth flow (email -> password) for login/signup"
  - "Reset password as in-modal mode with inline 'Check your inbox' confirmation"
  - "?auth=login|signup deep-link on landing that auto-opens AuthDialog"
  - "Authenticated /update-password landing for Supabase type=recovery flow"
affects:
  - "All server-component auth guards (now redirect to /?auth=login)"
  - "Stripe Connect routes (auth fallback)"
  - "Proxy middleware (unauthenticated protected-route redirect target)"
  - "All e2e specs that previously visited /login, /signup, /reset-password"
tech-stack:
  added: []
  patterns:
    - "AuthDialog as a (mode x step) state machine with email carried across steps"
    - "TurnstileWidget remount on context change via React `key` prop"
    - "useSearchParams + router.replace pattern for deep-link query stripping"
key-files:
  created:
    - "app/(auth)/update-password/page.tsx"
    - "app/(auth)/update-password/update-password-form.tsx"
    - "tests/e2e/auth-modal.spec.ts"
  modified:
    - "components/landing/auth-dialog.tsx"
    - "components/landing/landing-page.tsx"
    - "app/page.tsx"
    - "lib/actions/auth.ts"
    - "lib/supabase/proxy.ts"
    - "app/(auth)/callback/route.ts"
    - "lib/actions/settings.ts"
    - "components/settings/account-section.tsx"
    - "app/api/stripe/connect/initiate/route.ts"
    - "app/api/stripe/connect/callback/route.ts"
    - "18 server-component guard files (app/(app)/**, app/onboarding, app/(capture)/layout.tsx)"
    - "tests/unit/middleware.test.ts"
    - "tests/unit/components/landing-page.test.tsx"
    - "tests/e2e/dark-mode.spec.ts + 8 admin/notifications/capture/tour specs + globalSetup.ts"
  deleted:
    - "app/(auth)/login/, app/(auth)/signup/, app/(auth)/reset-password/, app/(auth)/layout.tsx"
    - "tests/e2e/auth.spec.ts, tests/e2e/auth-dark.spec.ts, tests/e2e/visual/auth.spec.ts (+ snapshots)"
decisions:
  - "Locked Option B: no email-existence lookup endpoint; mode determined solely by which CTA opens the dialog and by in-modal footer toggles"
  - "Suspense boundary added in app/page.tsx because Next 16 requires it for client useSearchParams"
  - "(auth)/layout.tsx deleted (it only existed for the now-removed pages; callback is a Route Handler and update-password uses AuthCard chrome directly)"
metrics:
  duration: "~18m"
  completed: 2026-05-24
  tasks: 3
  commits: 3
---

# Quick Task 260524-ohe: Refactor auth flow to single in-modal 2-step on the landing page

One-liner: Collapsed `/login`, `/signup`, `/reset-password` standalone pages into a single 3-mode × 2-step `AuthDialog` on the landing page, retargeted every unauthenticated redirect to `/?auth=login`, and added a new authenticated `/update-password` surface for Supabase `type=recovery` code exchange.

## Final shape of AuthDialog

```
state:
  mode:         'login' | 'signup' | 'reset'
  step:         'email' | 'password'         // 'password' unused in reset mode
  email:        string                        // carried across all step/mode switches
  captchaToken: string | null
  resetSent:    boolean                       // true after successful resetPassword server-action call
  topLevelError: string | null                // surface from Step 2 errors back into Step 1 banner

components:
  Step1Form    — email + Turnstile + Continue/Send-reset-link button (login/signup show Google + OrDivider; reset hides them)
  LoginStep2   — read-only email summary + password + Eye toggle + Forgot link + Sign in + Back
  SignupStep2  — read-only email summary + password + confirmPassword + Eye toggles + Create account + Back
  ResetSentPanel — inline check-circle + 'Check your inbox' heading + 'Back to sign in' button (renders inside the card; no footer in this state)

footer (outside card):
  login + email:    'Forgot your password?' + 'Don't have an account? Sign up'
  login + password: 'Don't have an account? Sign up'  (Forgot lives inside the form on Step 2)
  signup + any:     'Already have an account? Sign in'
  reset + email:    'Back to sign in'
  reset + sent:     (no footer)
```

TurnstileWidget is keyed on `${mode}-step1-${resetSent ? 'sent' : 'form'}` so it remounts and issues a fresh token whenever the user moves between contexts.

## (auth) tree after this refactor

| Path | Status | Reason |
| ---- | ------ | ------ |
| `app/(auth)/callback/route.ts` | KEPT | Supabase OAuth route handler — layouts don't apply |
| `app/(auth)/update-password/page.tsx` | NEW | Authenticated landing for `type=recovery` code exchange |
| `app/(auth)/update-password/update-password-form.tsx` | NEW | Copied from old `reset-password-form.tsx` UpdatePasswordForm; "Back to home" links to `/` |
| `app/(auth)/login/`, `app/(auth)/signup/`, `app/(auth)/reset-password/` | DELETED | Collapsed into LP modal |
| `app/(auth)/layout.tsx` | DELETED | Only consumers would be a route handler (no layout) and `/update-password` (uses AuthCard chrome directly). Build passes without it. |

## Whether `app/page.tsx` needed Suspense

**Yes** — wrapped `<LandingPage />` in `<Suspense fallback={null}>`. `LandingPage` is now a `'use client'` component that calls `useSearchParams`, and Next 16 requires the parent server component to provide a Suspense boundary.

## Tests that needed deeper rewrites beyond mechanical changes

- `tests/unit/components/landing-page.test.tsx` — the two old tests `renders a link to /login|/signup` were testing the previous contract where Hero CTAs were `<Link>` elements. With the modal refactor they are `<Button onClick={() => onOpenAuth(...)}>` buttons, so those tests were dropped and a new `LandingPage modal auto-open` describe was added that mocks `useSearchParams` + `useRouter` and asserts the dialog heading + `router.replace('/')` call.
- `tests/unit/middleware.test.ts` — flipped the `/login`/`/signup`/`/reset-password` assertions to `toBe(false)`, narrowed the inline `isAuthRoute` regex in the Landing-root describe to test only `/callback`, and added a new test asserting the constructed redirect URL has `pathname === '/'` and `searchParams.get('auth') === 'login'`.
- `tests/e2e/landing-page.spec.ts` — primary-CTA assertions switched from `getByRole('link', { name: 'Start free' })` to `getByRole('button', { name: 'Start free' }).first()` (multiple matches: TopNav + Hero); removed the dual-CTA mobile-fold test (only the primary CTA stays in the band now). The authenticated-root-redirect test was rewired to drive the LP modal (Continue, then Sign in).
- `tests/e2e/dark-mode.spec.ts` — old `PUBLIC_ROUTES = ['/login', '/signup', '/reset-password']` re-pointed to `['/', '/?auth=login', '/?auth=signup']`; scoped-wrappers-intact test now asserts the `[data-testid="landing-shell"]` container instead of `[data-theme="dark-auth"]` (which lived on the now-deleted auth layout).
- Six admin/notifications/branding specs rewired to the two-step modal sign-in shape.
- `tests/e2e/globalSetup.ts` rewired the storageState bootstrap to go via `/?auth=login` + the two-step modal flow.
- `tests/e2e/onboarding-survey.spec.ts` + `tests/e2e/tour-flow.spec.ts` — skip predicate switched from `url().includes('/login')` to `url().includes('auth=login')`.

## Leftover follow-ups

- Visual screenshot snapshots for the new modal were not minted — the old `tests/e2e/visual/auth.spec.ts` + 27 PNG baselines were deleted as part of Task 3. A future pass can add a `tests/e2e/visual/auth-modal.spec.ts` that mints baselines via `--update-snapshots` for the 3 modes × 3 viewports × 3 langs grid.
- Intentionally rejected: an "is this email registered?" lookup before advancing to Step 2. Per the locked Option B, mode is determined solely by which CTA opens the dialog — no email-existence leak.
- 38 pre-existing unit-test failures (admin-actions, blog-actions, ai/provider-factory, seo-actions, etc.) were observed during the `npx vitest run` full-suite verification. **None are caused by this refactor** — confirmed by stashing the working tree and re-running. All failures share the same root cause: `vi.mock` declarations missing exports the production module now provides (e.g. `requireServiceClient`, `getServiceClient`). Logged in `deferred-items.md`.

## Verification

- `npx tsc --noEmit` — clean (after `.next/dev/types` cache cleared post auth-route deletion)
- `npx vitest run tests/unit/middleware.test.ts tests/unit/auth-actions.test.ts tests/unit/components/landing-page.test.tsx` — 24/24 passed
- `npx playwright test --list` — 675 tests across 26 files all parse
- All 9 grep sweeps from `<verification>` returned zero matches (excluding `.planning/**`)
- All 9 contract markers from `<verification>` present and locatable in the right files

## Deviations from Plan

None requiring a Rule-4 decision.

Auto-applied:
- **[Rule 3 — Blocking]** Stale `.next/dev/types/validator.ts` generated file referenced the deleted `app/(auth)/login/page.js` etc., breaking `tsc --noEmit`. Cleaned the cache (`rm -rf .next/dev/types .next/types`); tsc passes. Documented here only because the plan didn't anticipate it.
- **[Rule 3 — Blocking]** Test contract migration for `tests/unit/components/landing-page.test.tsx` was assigned to Task 3 in the plan but had to land in Task 1 because the Task 1 verify command runs that file. Moved the migration up; Task 3 still does the rest of the test-suite migration as planned.
- Plan-cited `app/onboarding/page.tsx` had a `redirect('/login')` (line 12) — updated successfully. The plan note about "may or may not have" was conservative; it did.
- Plan-cited `lib/actions/settings.ts:285` and `components/settings/account-section.tsx:109` line numbers matched the actual file — no offset correction needed.

## Commits

- `2306a84` refactor(quick-260524-ohe): rewrite AuthDialog into 3-mode x 2-step state machine
- `e7d841f` refactor(quick-260524-ohe): retarget auth redirects + add /update-password page
- `02b4959` refactor(quick-260524-ohe): delete legacy auth pages + migrate e2e to modal flow

## Self-Check: PASSED

- All 11 created/modified files verified present on disk
- All 3 commits verified present in `git log --all`
- All 4 legacy auth paths verified deleted (`app/(auth)/login`, `app/(auth)/signup`, `app/(auth)/reset-password`, `app/(auth)/layout.tsx`)
- `app/(auth)/callback/route.ts` and `app/(auth)/update-password/` survive as expected
