---
phase: 01-foundation-auth
plan: "04"
subsystem: auth
tags: [supabase, next-auth, oauth, react-hook-form, zod, shadcn, playwright]

# Dependency graph
requires:
  - phase: 01-foundation-auth/01-02
    provides: Supabase client/server factories (createClient browser + server)
  - phase: 01-foundation-auth/01-03
    provides: companies table and RLS policies for post-auth redirect logic
provides:
  - Complete auth UI: /auth/login, /auth/signup, /auth/reset-password pages
  - Server actions: signUp, signIn, signOut, resetPassword, updatePassword
  - OAuth callback route with companies table check (AUTH-06)
  - Placeholder /dashboard and /onboarding with auth guards
  - SignOutButton reusable component
  - Real E2E Playwright tests for auth pages and redirect protection
affects:
  - phase-02-onboarding (redirected here after signup)
  - phase-03-dashboard (redirected here after login with company)
  - all-phases (middleware auth protection established)

# Tech tracking
tech-stack:
  added: [sonner (toast notifications)]
  patterns:
    - useTransition for async server action calls from client components
    - Suspense boundary wrapping useSearchParams to satisfy Next.js SSG requirements
    - getClaims() pattern (not getSession()) consistent with Plans 02 and 03
    - data?.claims ?? null null-safe destructuring in server components

key-files:
  created:
    - lib/actions/auth.ts
    - app/(auth)/callback/route.ts
    - app/(auth)/login/page.tsx
    - app/(auth)/signup/page.tsx
    - app/(auth)/reset-password/page.tsx
    - app/dashboard/page.tsx
    - app/onboarding/page.tsx
    - components/auth/auth-card.tsx
    - components/auth/google-oauth-button.tsx
    - components/auth/sign-out-button.tsx
    - tests/unit/auth-actions.test.ts
  modified:
    - tests/e2e/auth.spec.ts

key-decisions:
  - "useSearchParams wrapped in Suspense boundary in reset-password page — Next.js requires this for static generation"
  - "AuthCard component shared by all three auth pages — contains logo SVG + wordmark above Card"
  - "GoogleOAuthButton uses window.location.origin for dynamic redirectTo (works on localhost and production)"

patterns-established:
  - "AuthCard: shared wrapper with logo/wordmark above card — all auth pages use this"
  - "Server actions return { error: string } | { success: string } | void (redirect)"
  - "TDD: unit test module exports first, then implement, then E2E tests as integration verification"

requirements-completed:
  - AUTH-01
  - AUTH-02
  - AUTH-03
  - AUTH-04
  - AUTH-05
  - AUTH-06
  - AUTH-07

# Metrics
duration: 12min
completed: 2026-04-09
---

# Phase 01 Plan 04: Auth UI Summary

**Supabase auth UI with Google OAuth + email/password using shadcn/ui — login, signup, reset-password pages with callback route, server actions, and Playwright E2E tests**

## Performance

- **Duration:** ~12 min
- **Started:** 2026-04-09T22:49:33Z
- **Completed:** 2026-04-09T23:01:00Z
- **Tasks:** 3 of 3 (complete — checkpoint approved)
- **Files modified:** 12

## Accomplishments
- All Supabase auth server actions (signUp, signIn, signOut, resetPassword, updatePassword) with proper error messages from UI-SPEC.md
- OAuth callback route that checks companies table and routes new vs returning users (AUTH-06)
- Three auth pages with Google OAuth button above "or" separator (D-03), password show/hide toggles, 44px min-height buttons (UX-02)
- Placeholder /dashboard and /onboarding pages with auth guards (redirect to /auth/login if no claims)
- 17 unit tests passing; E2E test stubs replaced with real Playwright rendering + redirect tests

## Task Commits

Each task was committed atomically:

1. **Task 1: Server actions, callback route, and placeholder protected pages** - `f67a1f7` (feat)
2. **Task 2: Auth pages UI — login, signup, reset-password** - `cc030f3` (feat)

## Files Created/Modified
- `lib/actions/auth.ts` — signUp, signIn, signOut, resetPassword, updatePassword server actions
- `app/(auth)/callback/route.ts` — GET handler: code exchange, recovery redirect, companies check (AUTH-06)
- `app/(auth)/login/page.tsx` — Google OAuth + email/password form with show/hide toggle
- `app/(auth)/signup/page.tsx` — Google OAuth + email/password/confirm form (min 8 chars)
- `app/(auth)/reset-password/page.tsx` — request mode + update mode (Suspense-wrapped)
- `app/dashboard/page.tsx` — Placeholder: auth guard + SignOutButton (Phase 3 builds this)
- `app/onboarding/page.tsx` — Placeholder: auth guard + SignOutButton (Phase 2 builds this)
- `components/auth/auth-card.tsx` — Shared wrapper: SVG logo + "Xtimator" wordmark above Card (D-02)
- `components/auth/google-oauth-button.tsx` — Google G SVG inline, signInWithOAuth with dynamic redirectTo
- `components/auth/sign-out-button.tsx` — useTransition + signOut server action + LogOut icon
- `tests/unit/auth-actions.test.ts` — TDD RED tests for module exports (6 export assertions)
- `tests/e2e/auth.spec.ts` — Real Playwright tests replacing todo stubs

## Decisions Made
- `useSearchParams` wrapped in `Suspense` boundary in reset-password page — Next.js requires this for pages using client-side search params in a statically generated route. Without it, the build fails with prerender error.
- `AuthCard` extracts the shared layout (logo + wordmark + Card wrapper) to a single component used by all three auth pages, ensuring D-02 consistency.
- `GoogleOAuthButton` uses `window.location.origin` for the `redirectTo` URL to work on both localhost and any production domain without hardcoding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added Suspense boundary around useSearchParams in reset-password page**
- **Found during:** Task 2 (Auth pages UI)
- **Issue:** Next.js build failed with "useSearchParams() should be wrapped in a suspense boundary at page /reset-password" — the build cannot statically prerender the page without it
- **Fix:** Extracted `ResetPasswordContent` component that contains `useSearchParams`, wrapped it in `<Suspense>` in the default export `ResetPasswordPage`
- **Files modified:** app/(auth)/reset-password/page.tsx
- **Verification:** `bun run build` exits 0, page listed as `○ (Static)` in build output
- **Committed in:** cc030f3 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Required fix for Next.js static generation. No scope creep.

## Issues Encountered
- None beyond the Suspense auto-fix.

## User Setup Required
Before testing Google OAuth:
1. Enable Google provider in Supabase Dashboard → Authentication → Providers
2. Add to Google Cloud Console → Credentials → Authorized redirect URIs:
   - `http://localhost:3000/auth/callback`
   - `https://{vercel-domain}/auth/callback`
   - `https://prmqgcrnpuvpzruyzvuv.supabase.co/auth/v1/callback`

Email/password auth works without additional configuration.

## Known Stubs
- `app/dashboard/page.tsx` — Placeholder with "Phase 3 will build this out." text. No real dashboard content. Intentional — Phase 3 builds this.
- `app/onboarding/page.tsx` — Placeholder with "Phase 2 will build this wizard." text. No onboarding flow. Intentional — Phase 2 builds this.

## Next Phase Readiness
- Auth foundation complete: all three auth pages render, server actions wired, callback route handles OAuth + post-auth routing
- Checkpoint human-verify APPROVED — plan 04 is complete
- Phase 2 (onboarding) can start: /onboarding page exists as placeholder, companies table is ready (Plan 03)
- E2E tests ready to run against live dev server

---
*Phase: 01-foundation-auth*
*Completed: 2026-04-09*
