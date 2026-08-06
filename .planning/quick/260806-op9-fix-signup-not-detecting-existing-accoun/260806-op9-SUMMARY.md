---
phase: 260806-op9-fix-signup-not-detecting-existing-accoun
plan: 01
subsystem: auth
tags: [supabase-auth, gotrue, anti-enumeration, server-actions, vitest]

requires: []
provides:
  - "signUp() empty-identities guard that detects GoTrue's anti-user-enumeration response (email confirmation enabled) and returns a sign-in-instead error instead of redirecting to /onboarding"
  - "Regression tests for all three signUp response shapes (already-registered, genuinely-new, legacy no-data mock)"
affects: [auth, onboarding, signup-flow]

tech-stack:
  added: []
  patterns:
    - "GoTrue anti-enumeration detection via data.user.identities.length === 0 (no error, fabricated user, null session) rather than parsing error.message"

key-files:
  created: []
  modified:
    - lib/actions/auth.ts
    - tests/unit/auth-actions.test.ts

key-decisions:
  - "Guard placed after the existing if (error) block and before safeInviteNext()/redirect(), per the plan's ordering — an invited user with an existing account is told to sign in rather than dropped into /invite/accept with no session"
  - "Kept the pre-existing error.message.includes('already registered') branch untouched — it's dead with email confirmation ON but harmless and could matter if config changes"
  - "Used data?.user / identities?.length ?? 0 optional chaining so the guard is inert against existing test mocks that return { error: null } with no data key"

requirements-completed: [SIGNUP-EXISTS-01]

duration: 25min
completed: 2026-08-06
---

# Quick Task 260806-op9: Fix signup not detecting existing account Summary

**Added an `identities`-length guard to `signUp()` that catches Supabase GoTrue's anti-user-enumeration response (empty `identities`, null session, no error) for an already-registered confirmed email, returning "An account with this email already exists. Sign in instead." instead of silently redirecting to `/onboarding`.**

## Performance

- **Duration:** ~25 min
- **Tasks:** 3 completed
- **Files modified:** 2 (lib/actions/auth.ts, tests/unit/auth-actions.test.ts)

## Accomplishments
- Reproduced the bug as a failing test first (RED): submitting signup with an email that already has a confirmed account previously fell through to `redirect('/onboarding')` because `lib/actions/auth.ts` only destructured `{ error }` from `supabase.auth.signUp()`, discarding the `data` object that carries GoTrue's anti-enumeration signal (empty `identities` array).
- Fixed `signUp()` to destructure `data` too and short-circuit with the existing-account error before any redirect, emitting a `sign_up_attempt` / `success:false` / `error:'email_already_registered'` log line for observability.
- Verified the fix does not regress the two other response shapes already relied upon elsewhere: a genuinely new signup (non-empty `identities`) still redirects to `/onboarding`, and the legacy `{ error: null }`-with-no-`data` mock shape (used by `tests/unit/actions/auth-invite-redirect.test.ts` and `tests/unit/demo/auth-action-boundaries.test.ts`) remains inert.

## Task Commits

1. **Task 1: Add RED behavior tests for the three signUp response shapes** - `02374928` (test)
2. **Task 2: Guard signUp() on GoTrue's empty-identities anti-enumeration response** - `b0c9421f` (fix)
3. **Task 3: Run both CI gates and report real numbers** - no source changes (verification only)

**Plan metadata:** (this summary's commit, see below)

## Files Created/Modified
- `lib/actions/auth.ts` - `signUp()` now destructures `data` from `supabase.auth.signUp()` and returns the existing-account error when `data.user.identities` is empty, before `safeInviteNext()`/`redirect()`.
- `tests/unit/auth-actions.test.ts` - Added mock scaffolding (redirect-throws, auth-logger, site-url, supabase `signUp`) and a `describe('signUp: GoTrue anti-enumeration (existing confirmed account)')` block with 3 tests covering the already-registered, genuinely-new, and legacy-no-`data`-mock shapes. Pre-existing 6 export-shape tests untouched.

## Decisions Made
- See `key-decisions` in frontmatter above.

## Deviations from Plan

None — plan executed exactly as written. Task 1 produced the expected RED (1 failing / 8 passing), Task 2 turned it GREEN (24/24 across the three target test files), and Task 3's CI gates ran as specified.

## Issues Encountered

**Pre-existing, out-of-scope test failures found during Task 3's full-suite CI gate.** Running `npx vitest run tests/unit tests/eval` showed 53 failed / 5086 passed / 20 todo (612 test files: 599 passed, 12 failed, 1 skipped) — well above the 4-item known-benign baseline provided for this task. Investigation showed:
- 2 of the 53 are the documented CRLF migration-shape tests (benign, green in CI).
- The other 51 are `[lib/storage/server] this module is server-only …` throws from `assertServer()` in `lib/storage/server.ts`, spread across 10 unrelated test files (save-seo, branding-actions, seo-actions, landing-actions, share-query, public-token, delete-photo-lock-guard, cleanup-audio-job, render-estimate-pdf-resolver, whatsapp/pdf-delivery) — none touch `lib/actions/auth.ts` or auth tests.
- Critically, `git status --short` during this run showed **uncommitted, unstaged edits from a different, concurrently-running session** on several of those exact files (`delete-photo-lock-guard.test.ts`, `save-seo.test.ts`, `cleanup-audio-job.test.ts`, `storage-orphan-cleanup.test.ts`, `landing-actions.test.ts`, `whatsapp/pdf-delivery.test.ts`, and `demo/auth-action-boundaries.test.ts`) — files this task never touched. That session appears to be actively fixing this exact `lib/storage/server.ts` regression (introduced by the recently-merged 188-01 storage-provider-seam commits `4d160ef9`/`1dcde6ed`) in real time, so the 51-failure count reflects an in-flux working tree, not a stable read of `main`.
- This task's own scope (`lib/actions/auth.ts`, `tests/unit/auth-actions.test.ts`) is fully unaffected: `npx tsc -p tsconfig.ci.json` exits 0 with zero errors, and the 3 targeted test files (`tests/unit/auth-actions.test.ts`, `tests/unit/actions/auth-invite-redirect.test.ts`, `tests/unit/demo/auth-action-boundaries.test.ts`) pass 24/24 in isolation.
- Per the deviation rules' scope boundary, this was logged (not fixed) to [deferred-items.md](./deferred-items.md) rather than touched, since it's outside this task's file-change constraint and not caused by this task's diff. A blocker could not be recorded to `STATE.md` via `gsd-tools state add-blocker` (no "Blockers" section present in this project's STATE.md); flagging here instead. **Recommend re-running the full suite once the concurrent session's work lands, and following up with `/gsd:debug` if failures persist on a clean tree** — CI red here blocks all deploys per this project's CLAUDE.md pipeline notes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The signup anti-enumeration fix is complete, tested, and isolated (tsc clean, 24/24 targeted tests green).
- **Not yet safe to merge/deploy against a fully green CI** until the concurrent session's `lib/storage/server.ts` test-mocking fix lands and the full suite is re-verified — see Issues Encountered above and `deferred-items.md`.

---
*Task: 260806-op9-fix-signup-not-detecting-existing-accoun*
*Completed: 2026-08-06*

## Self-Check: PASSED

- FOUND: lib/actions/auth.ts
- FOUND: tests/unit/auth-actions.test.ts
- FOUND: commit 02374928 (Task 1)
- FOUND: commit b0c9421f (Task 2)
