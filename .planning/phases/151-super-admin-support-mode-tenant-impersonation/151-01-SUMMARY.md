---
phase: 151-super-admin-support-mode-tenant-impersonation
plan: 01
subsystem: auth
tags: [hmac, cookies, server-actions, audit-log, next-navigation]

# Dependency graph
requires:
  - phase: 146-149 (v4.14 Admin Sales Mode)
    provides: requireAdmin()/getAdminContext() DB-driven platform_admins gate; logAdminAction()/admin_audit_log
provides:
  - "startSupportSession(companyId) — requireAdmin()-gated, mints a signed httpOnly cookie session claim"
  - "getSupportModeSession() — verifies signature, expiry, and live platform_admins membership on every read"
  - "endSupportSession() — reads issuedAt before clearing, logs duration, redirects to /admin/companies"
  - "AuditAction union extended with company.support_mode_start / company.support_mode_end"
affects: [151-02 (banner + layout wiring), 151-03 (Companies-list entry point)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "HMAC-SHA256 signed cookie claim (payloadB64.signature), mirroring lib/whatsapp/verify.ts's timingSafeEqual pattern"
    - "Length-guard-before-timingSafeEqual convention from lib/auth/cron-auth.ts"
    - "Never trust a cached/cookie-carried claim of authority — re-verify platform_admins on every read, mirroring getAdminContext()'s own warning"
    - "redirect() called directly inside a server action (mirrors lib/demo/actions.ts's exitDemoToSignup) so a bare <form action={fn}> binding navigates"

key-files:
  created:
    - lib/auth/support-mode.ts
    - tests/unit/support-mode.test.ts
    - .planning/phases/151-super-admin-support-mode-tenant-impersonation/deferred-items.md
  modified:
    - lib/admin/audit-log.ts

key-decisions:
  - "2-hour session TTL (SESSION_TTL_MS), the middle of CONTEXT.md's recommended 1-4h range"
  - "Cookie format is payloadB64.signature (base64url JSON payload + hex HMAC-SHA256 signature), not JWT — reuses APP_ENCRYPTION_KEY, no new dependency"
  - "getSupportModeSession() explicitly checks expiresAt against Date.now() rather than relying on cookie maxAge alone (maxAge is client-trusted, in-payload expiry is not)"
  - "endSupportSession() logs company.support_mode_end using the cookie-carried adminUserId (not a fresh requireAdmin() call) since the admin's own browser session may have separately expired; email is best-effort via requireAdmin(), falling back to empty string"

patterns-established:
  - "Support Mode session claim is a distinct, parallel authority from getActiveCompanyId() — completely untouched by this plan, per the plan's explicit non-goal"

requirements-completed: [SUPPORT-01, SUPPORT-03, SUPPORT-04]

# Metrics
duration: 12min
completed: 2026-07-05
---

# Phase 151 Plan 01: Support Mode Session-Claim Module Summary

**HMAC-signed, time-boxed Support Mode cookie session (`lib/auth/support-mode.ts`) that re-verifies `platform_admins` on every read, never trusting the cookie's claim of adminhood alone, with full audit logging via the existing `logAdminAction()`.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-05T18:36:00Z
- **Completed:** 2026-07-05T18:44:22Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified) + 1 deferred-items note

## Accomplishments
- `startSupportSession(companyId)` is `requireAdmin()`-gated; a non-admin caller cannot mint a session (SUPPORT-01)
- `getSupportModeSession()` rejects tampered signatures, expired sessions (checked explicitly against `Date.now()`, independent of cookie `maxAge`), and sessions whose admin was removed from `platform_admins` mid-session — even with a validly-signed, unexpired cookie (SUPPORT-04)
- `endSupportSession()` reads `issuedAt` before clearing the cookie, computes `durationSeconds`, logs `company.support_mode_end`, clears the cookie, then calls `redirect('/admin/companies')` as its last statement — proven via `invocationCallOrder` comparison in the test, not just duration correctness (SUPPORT-03 + exit-navigation contract)
- `AuditAction` union extended with `company.support_mode_start` / `company.support_mode_end`, no parallel logging mechanism introduced (SUPPORT-03)
- `lib/queries/active-company.ts` and `getActiveCompanyId()`/`getActiveCompany()` remain completely untouched

## Task Commits

1. **Task 1: Write Wave 0 failing unit tests for support-mode session lifecycle** - `a5173580` (test)
2. **Task 2: Extend AuditAction union and implement lib/auth/support-mode.ts** - `93aa713d` (feat)

**Plan metadata:** (this commit, following)

## Files Created/Modified
- `lib/auth/support-mode.ts` - `startSupportSession`/`getSupportModeSession`/`endSupportSession` HMAC-signed cookie session-claim module
- `lib/admin/audit-log.ts` - `AuditAction` union +2 literals (`company.support_mode_start`, `company.support_mode_end`)
- `tests/unit/support-mode.test.ts` - Wave 0 unit coverage: requireAdmin gate, tamper/expiry/revocation rejection, read-before-clear ordering, redirect assertion, static-source AuditAction check
- `.planning/phases/151-super-admin-support-mode-tenant-impersonation/deferred-items.md` - logs pre-existing, out-of-scope `tsc --noEmit` errors found in unrelated files (not fixed, per scope-boundary rule)

## Decisions Made
- 2-hour TTL for the signed session, per CONTEXT.md's 1-4h guidance
- Cookie value is `base64url(JSON).hexHMAC`, keyed by the existing `APP_ENCRYPTION_KEY` (no new secret/dependency)
- `endSupportSession()`'s audit log uses the cookie's `adminUserId` directly (not a fresh `requireAdmin()` lookup) for `actorId`, since the flow must still log correctly even if the admin's own auth session has separately expired by the time they exit Support Mode

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed test call-index bug in the `endSupportSession` ordering assertion**
- **Found during:** Task 2 (implementation + GREEN pass)
- **Issue:** The `endSupportSession` test calls `startSupportSession` first to mint a session (which itself calls `logAdminAction` for `company.support_mode_start`), then calls `endSupportSession`. The test's original assertion read `mock.calls[0]` on `logAdminAction`, which is the START call, not the END call — asserting `durationSeconds` against the wrong invocation and failing.
- **Fix:** Changed the assertion to read the last (`length - 1`) call instead of the first, and added an explicit `action === 'company.support_mode_end'` check for clarity.
- **Files modified:** `tests/unit/support-mode.test.ts`
- **Verification:** `npx vitest run tests/unit/support-mode.test.ts` — all 10 tests GREEN
- **Committed in:** `93aa713d` (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug in test logic, not implementation)
**Impact on plan:** No scope creep — the fix was internal to the test file this same plan created; implementation matches the plan's reference shape.

## Issues Encountered
- `npx tsc --noEmit` reports 42 lines of pre-existing type errors in unrelated test files (billing calibration/seat-billing fixtures, whatsapp handler fixtures missing `chatEnabled`, a couple of regex-target flags). Confirmed via `git stash` that these exist on the tree independent of this plan's changes — none reference `lib/auth/support-mode.ts` or `lib/admin/audit-log.ts`. Logged in `deferred-items.md`, not fixed (out of scope per the scope-boundary rule).

## User Setup Required

None - no external service configuration required. `APP_ENCRYPTION_KEY` is an existing env var already required by `lib/crypto/aes.ts`; support-mode reuses it, no new secret to provision.

## Next Phase Readiness
- Plan 02 (banner + layout wiring) and Plan 03 (Companies-list entry point) can now import `startSupportSession`/`getSupportModeSession`/`endSupportSession` from `lib/auth/support-mode.ts` directly.
- The bare `<form action={endSupportSession}>` binding Plan 02 needs will navigate correctly because `endSupportSession()` calls `redirect('/admin/companies')` internally.
- No blockers.

---
*Phase: 151-super-admin-support-mode-tenant-impersonation*
*Completed: 2026-07-05*

## Self-Check: PASSED

- FOUND: lib/auth/support-mode.ts
- FOUND: tests/unit/support-mode.test.ts
- FOUND: lib/admin/audit-log.ts
- FOUND: .planning/phases/151-super-admin-support-mode-tenant-impersonation/151-01-SUMMARY.md
- FOUND: a5173580 (test commit)
- FOUND: 93aa713d (feat commit)
