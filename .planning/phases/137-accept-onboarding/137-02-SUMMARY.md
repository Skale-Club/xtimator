---
phase: 137-accept-onboarding
plan: 02
subsystem: team-seats
tags: [invites, auth, routing, open-redirect-guard, onboarding-skip]
requires:
  - acceptInvite(token) server action (Plan 01, SEAT-04 action half)
  - signUp / signIn server actions (lib/actions/auth.ts)
  - AuthDialog / landing-page auth modal (?auth=signup|login)
  - (app) layout onboarding guard (getActiveCompany() == null → /onboarding)
provides:
  - /invite/accept route (app/invite/accept/page.tsx) — the SEAT-04 JOIN authority
  - signUp/signIn next-param honoring with open-redirect guard (safeInviteNext)
affects:
  - Phase 138 Team UI builds on the accept handoff; the invite email (Phase 136) links here
tech-stack:
  added: []
  patterns:
    - route-outside-(app)-group to sidestep the onboarding create-company guard
    - open-redirect guard: only honor a relative '/invite/accept...' next path
    - thread next through landing-page (captured pre router.replace) → AuthDialog → formData
key-files:
  created:
    - app/invite/accept/page.tsx
    - tests/unit/actions/auth-invite-redirect.test.ts
  modified:
    - lib/actions/auth.ts
    - components/landing/auth-dialog.tsx
    - components/landing/landing-page.tsx
decisions:
  - "SEAT-04 create-company skip is achieved purely by ROUTING — lib/actions/company.ts is untouched"
  - "The accept route lives OUTSIDE the (app) group so the no-company → /onboarding guard never fires"
  - "Unauthenticated accept visitors are sent signup-first (?auth=signup); the dialog lets an existing user switch to login carrying the same next"
  - "safeInviteNext only honors paths starting with '/invite/accept' — absolute/other paths fall through to the existing destination (open-redirect prevention)"
  - "next is captured in landing-page before router.replace('/') strips the query, then passed as a prop into AuthDialog"
metrics:
  duration: ~4m
  completed: 2026-06-25
  tasks: 2
  files: 5
---

# Phase 137 Plan 02: /invite/accept Route + Signup-Skips-Create Summary

The `/invite/accept` route (the link the Phase-136 invite email points at) plus a `next`-param redirect in the auth actions, closing SEAT-04 end-to-end: an invited person — already a user OR brand new — lands inside the existing company as a member, never creating their own. The skip of the onboarding create-company path is achieved purely by ROUTING invited signups to the accept route (which JOINs) instead of `/onboarding` (which CREATEs); `lib/actions/company.ts` is untouched.

## What Was Built

**Task 1 — `/invite/accept` route** (`app/invite/accept/page.tsx`, commit `9582d945`)
Async server component, top-level under `app/invite/accept` (deliberately OUTSIDE the `(app)` group so the `getActiveCompany() == null → /onboarding` guard never fires). Reads the awaited `searchParams.token`:
- No token → renders a minimal "missing its token" card (no redirect loop).
- Unauthenticated (no claims) → `redirect('/?auth=signup&next=<encoded /invite/accept?token=...>')`. Signup-first since most invitees are new; the dialog lets an existing user switch to login carrying the same next. The user is NEVER sent to `/onboarding`.
- Authenticated → `acceptInvite(token)`; on success `redirect('/dashboard')` (acceptInvite already switched the active company); on error renders a clear card with the message and a "Back to dashboard" link — never creates a company, never routes to `/onboarding`.
- The raw token is never logged; it only appears inside the resume link itself.

**Task 2 — auth actions honor a safe `next`** (`lib/actions/auth.ts` + dialog wiring + test, commit `8df5015d`)
- Added `safeInviteNext(next)`: returns `next` only when it starts with `/invite/accept`, else `null` — the open-redirect guard.
- `signUp`: after a successful signup, if `safeInviteNext(next)` → `redirect(next)` (invited new user JOINs via accept); otherwise the unchanged `redirect('/onboarding')`.
- `signIn`: after success, if `safeInviteNext(next)` → `redirect(next)` (invited existing user resumes accept) before the existing `company ? '/dashboard' : '/onboarding'` choice.
- `components/landing/landing-page.tsx`: captures the `next` query param before `router.replace('/')` strips it, stores it in state, and passes it as a `next` prop into `AuthDialog`.
- `components/landing/auth-dialog.tsx`: new `next` prop threaded into `LoginStep2` (signIn) and `SignupCompanyStep` (signUp); each appends `formData.append('next', next)` when present.
- `tests/unit/actions/auth-invite-redirect.test.ts`: 5 tests — invited signup → accept (not `/onboarding`), plain signup → `/onboarding` (retrocompat), hostile `next='https://evil.com'` → `/onboarding` (guard), invited signin → accept (not dashboard/onboarding), hostile signin next → dashboard.

## Verification

- `npx vitest run tests/unit/actions/auth-invite-redirect.test.ts` → 5 passed.
- `npx vitest run tests/unit/actions` → 44 passed across 7 files (no regressions; plain-signup → `/onboarding` preserved).
- `npx tsc --noEmit` → no errors in any touched file (auth.ts, auth-dialog.tsx, landing-page.tsx, invite/accept, the new test). Pre-existing tsc errors exist in unrelated test files (estimate/whatsapp/ai suites) — out of scope, logged to deferred-items.md.
- Done-greps confirmed: `app/invite/accept/page.tsx` contains `acceptInvite`, `auth=signup`, `/dashboard`; `lib/actions/auth.ts` contains `safeInviteNext`, both `/invite/accept` redirects, and the `next` reads.

### Headless note (live route)
This was a headless run; no dev server was started. The accept route's runtime redirects (unauthed → signup, authed-success → /dashboard) are covered indirectly by the action/redirect unit tests and tsc. A live manual check of `/invite/accept?token=...` against a real pending invite (both logged-out and logged-in) is recommended before shipping the Phase-138 Team UI.

## Deviations from Plan

None of substance. The plan's `<read_first>` referenced `app/(auth)/callback/route.ts` for the redirect idiom (used as reference only). One implementation detail not spelled out in the plan: the landing page's existing `router.replace('/')` strips the `next` query param, so `next` is captured into component state in `landing-page.tsx` and passed as a prop to `AuthDialog` rather than read via `useSearchParams` inside the dialog — this is the reliable place to thread it given the existing modal-open flow. Tracked here as a wiring decision, not a behavioral deviation.

## Out-of-Scope / Deferred

Pre-existing `tsc --noEmit` errors in unrelated test suites (`tests/unit/ai/refine-shared-prompt`, `tests/unit/estimate/*`, `tests/unit/inngest/*`, `tests/unit/whatsapp/*`) are NOT caused by this plan and were left untouched. Logged to `.planning/phases/137-accept-onboarding/deferred-items.md`.

## Known Stubs

None. The route and auth wiring are fully functional; no placeholder data sources or hardcoded empties were introduced.

## Self-Check: PASSED

All created/modified files exist on disk; both task commits (9582d945, 8df5015d) are present in git history.
