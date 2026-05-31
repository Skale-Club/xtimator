---
phase: quick-260529-jo8
plan: 01
subsystem: auth / landing
tags: [auth, landing, oauth, mobile, supabase]
dependency_graph:
  requires:
    - components/landing/landing-page.tsx
    - app/page.tsx
    - components/landing/auth-dialog.tsx
  provides:
    - "Landing CTA always opens auth dialog regardless of session state"
    - "Google OAuth forces account selector (prompt=select_account)"
  affects:
    - components/landing/landing-page.tsx
    - app/page.tsx
    - components/landing/auth-dialog.tsx
    - tests/unit/components/landing-page.test.tsx
tech_stack:
  added: []
  patterns:
    - "signInWithOAuth queryParams prompt=select_account to force Google chooser"
key_files:
  created: []
  modified:
    - components/landing/landing-page.tsx
    - app/page.tsx
    - components/landing/auth-dialog.tsx
    - tests/unit/components/landing-page.test.tsx
decisions:
  - "Removed isAuthenticated prop entirely (interface + signature + call site) rather than just bypassing it — keeps no dead prop and removes the now-unused getAuthClaims fetch"
  - "Updated landing-page.test.tsx to drop isAuthenticated={false}; behavior asserted is unchanged because false was already the non-short-circuit path"
metrics:
  duration: "~3 min"
  completed: "2026-05-29"
  tasks: 2
  files: 4
requirements: [JO8-01, JO8-02]
---

# Phase quick-260529-jo8 Plan 01: Fix Mobile Auth Start Always Opens Login Summary

Removed the `isAuthenticated` short-circuits so the landing Start/CTA buttons and `?auth=login|signup` always open the auth dialog even with a persisted Supabase session, and added `prompt=select_account` to the Google OAuth call so re-authentication shows the account chooser instead of silently looping the same account.

## What Was Built

### Task 1: Remove isAuthenticated short-circuits (commit 242dd32)
- `components/landing/landing-page.tsx`:
  - `openAuth(mode)` now unconditionally runs `setAuthMode(mode); setAuthOpen(true)` — removed the `if (isAuthenticated) router.push('/dashboard')` block.
  - `?auth=` `useEffect` removed the `if (isAuthenticated) router.replace('/dashboard')` branch; still sets mode, opens the dialog, and strips the param via `router.replace('/', { scroll: false })`. `useRouter` import retained (effect still uses `router`).
  - Removed `isAuthenticated` from `LandingPageProps`, the destructured signature, and its JSDoc; updated the stale auto-open comment.
- `app/page.tsx`:
  - Dropped `isAuthenticated={!!claims}` from `<LandingPage />`.
  - Removed the now-unused `getAuthClaims` import and its entry in `Promise.all`; `claims` destructure removed.
- `tests/unit/components/landing-page.test.tsx`: dropped `isAuthenticated={false}` from both `<LandingPage />` render call sites (in-scope fix — the prop no longer exists). Assertions unchanged.

### Task 2: Force Google account selector (commit 4726fe9)
- `components/landing/auth-dialog.tsx` `XphereGoogleButton.handleClick`: added `queryParams: { prompt: 'select_account' }` to `signInWithOAuth` `options` alongside the unchanged `redirectTo`.

## Verification

- `npx tsc --noEmit`: no errors from touched files. (Pre-existing `@modelcontextprotocol/sdk` module errors remain — out of scope, logged in deferred-items.md.)
- `npx eslint components/landing/landing-page.tsx app/page.tsx`: clean (no unused-var/prop errors).
- `npx vitest run tests/unit/components/landing-page.test.tsx`: 5/5 passing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Updated landing-page.test.tsx for removed prop**
- **Found during:** Task 1 verification (tsc)
- **Issue:** `tests/unit/components/landing-page.test.tsx` passed `isAuthenticated={false}` at two `<LandingPage />` render call sites, causing TS2322 after the prop was removed from `LandingPageProps`.
- **Fix:** Removed `isAuthenticated={false}` from both render calls. The asserted behavior (open dialog on `?auth=login`, do not open without param) is preserved — `false` was already the non-short-circuit path.
- **Files modified:** tests/unit/components/landing-page.test.tsx
- **Commit:** 242dd32

**Plan-file note:** The plan's verify step specified `npx next lint --file ...`, which this toolchain rejects (`unknown option '--file'`). Ran `npx eslint <files>` directly instead — equivalent coverage, clean result.

## Deferred Issues (Out of Scope)

Logged to `deferred-items.md`:
- Pre-existing `@modelcontextprotocol/sdk` "Cannot find module" tsc errors (MCP files; dependency not installed in this tree).
- Pre-existing `react-hooks/set-state-in-effect` eslint errors in `auth-dialog.tsx` lines 561/573 (dialog state-reset effects — not the code modified by this plan).

## Self-Check: PASSED

- FOUND: commit 242dd32
- FOUND: commit 4726fe9
- components/landing/landing-page.tsx — `setAuthOpen(true)` present, `isAuthenticated` absent
- app/page.tsx — no `isAuthenticated` prop, `getAuthClaims` import removed
- components/landing/auth-dialog.tsx — `prompt: 'select_account'` present, `redirectTo` unchanged
