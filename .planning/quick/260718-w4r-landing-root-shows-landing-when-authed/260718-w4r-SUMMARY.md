---
phase: quick-260718-w4r
status: complete
commit: 98cfb8fd
files_modified:
  - proxy.ts
  - tests/unit/middleware.test.ts
  - tests/e2e/landing-page.spec.ts
---

# Quick 260718-w4r — Authed / renders landing page

## What changed

- **proxy.ts**: removed the `claims && pathname === '/'` → 307 `/dashboard`
  block. An authenticated GET / now falls through to the landing route. The
  perf comment on the claim-free short-circuit no longer references the removed
  redirect; a replacement comment at the old site documents why the hop is gone.
  getClaims() still runs on / so the Supabase session-cookie refresh and the
  anonymous protected-route gating are untouched.
- **tests/unit/middleware.test.ts**: the two inline-replica tests of the old
  redirect rule ("authenticated GET / triggers redirect to /dashboard" and its
  /dashboard companion) were replaced with one test asserting / is public and
  never anonymous-redirected (21 tests green).
- **tests/e2e/landing-page.spec.ts**: "authenticated root redirect" became
  "authenticated root stays on landing" — after login, goto('/') expects URL '/'
  and the landing shell visible (still env-gated on TEST_ADMIN_EMAIL/PASSWORD).

## Why nothing else broke

Password sign-in (lib/actions/auth.ts) and the OAuth callback
(app/(auth)/callback/route.ts) redirect to /dashboard or /onboarding explicitly
on their own — neither relied on the proxy hop. The landing TopNav
(top-nav-auth.tsx) resolves the session client-side and shows the avatar +
Dashboard link for logged-in visitors.

## Verification

- `npx tsc --noEmit -p tsconfig.ci.json` → 0 errors
- `npx vitest run tests/unit/middleware.test.ts` → 21/21 pass
- Live dev server (middleware hot-reloaded): anon GET / → 200; anon GET
  /dashboard → 307 `/?auth=login`. Authed-path login not drivable (no test
  credentials in env); covered by unit tests + removal of the only redirect.
