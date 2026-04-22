---
phase: quick
plan: 260421-tqz
subsystem: auth
tags: [logging, auth, observability, server-side]
dependency_graph:
  requires: []
  provides: [logAuthEvent, auth-event-logging]
  affects: [lib/actions/auth.ts, app/(auth)/callback/route.ts]
tech_stack:
  added: []
  patterns: [structured-json-console-log, server-side-only-guard, discriminated-union-payload]
key_files:
  created:
    - lib/auth-logger.ts
  modified:
    - lib/actions/auth.ts
    - app/(auth)/callback/route.ts
decisions:
  - logAuthEvent uses typeof window guard — safe to import from any server file without risk of browser emission
  - email logged on attempt/failure events as the primary auth identifier; passwords and tokens never logged
  - error.message only (never raw Supabase error objects) prevents schema info leakage in log lines
metrics:
  duration: 4min
  completed: 2026-04-22
---

# Quick Task 260421-tqz: Add Login Event Logging Summary

**One-liner:** Structured JSON auth-event logging via `logAuthEvent()` wired into all six auth event types across server actions and OAuth callback route.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create lib/auth-logger.ts helper | 8dfd2b8 | lib/auth-logger.ts (created) |
| 2 | Instrument auth actions and OAuth callback | 7fbf1a2 | lib/actions/auth.ts, app/(auth)/callback/route.ts |

## What Was Built

### lib/auth-logger.ts

A minimal, zero-dependency helper that emits structured JSON log lines to stdout (Vercel log pipeline). Key properties:

- `typeof window !== 'undefined'` guard: no-op in browser context; function can safely be imported from files that might be evaluated client-side without causing browser emissions
- `AuthEventName` union type covers all six event types: `sign_in_attempt`, `sign_up_attempt`, `sign_out`, `oauth_callback`, `password_reset_request`, `password_update`
- Every log line includes `timestamp` (ISO 8601) and `service: 'auth'` for log filtering
- `email` field acceptable (auth identifier); passwords and tokens explicitly excluded by convention

### lib/actions/auth.ts callsites

| Function | Events logged |
|----------|--------------|
| signUp | sign_up_attempt failure (before early return) + success (before redirect) |
| signIn | sign_in_attempt failure (single branch, covers all error types) + success with userId + claims-unavailable fallback |
| signOut | sign_out success |
| resetPassword | password_reset_request failure + success |
| updatePassword | password_update failure (covers both error branches) + success |

### app/(auth)/callback/route.ts callsites

| Path | Event |
|------|-------|
| type === 'recovery' | oauth_callback success, provider: 'recovery', redirectTo logged |
| claims present | oauth_callback success, provider: 'google', userId + redirectTo logged |
| no code or no claims | oauth_callback failure, provider: 'google', error: 'no_code_or_claims' |

## Deviations from Plan

None — plan executed exactly as written.

## Verification Results

1. TypeScript compiles without errors in lib/ and app/ — pre-existing errors in tests/e2e/auth.spec.ts and tests/unit/env.test.ts are unrelated to this task and pre-date it
2. lib/auth-logger.ts exports `logAuthEvent`, has `typeof window` guard, no external imports confirmed
3. lib/actions/auth.ts: all five functions have logAuthEvent on both success and failure paths confirmed
4. app/(auth)/callback/route.ts: logAuthEvent called for recovery, google oauth success, and fallback failure confirmed
5. No logAuthEvent calls in any client component (grep across all .tsx/.ts files confirmed zero results outside the three modified files)

## Known Stubs

None.

## Self-Check: PASSED

- lib/auth-logger.ts: FOUND
- lib/actions/auth.ts: modified with logAuthEvent calls
- app/(auth)/callback/route.ts: modified with logAuthEvent calls
- Commit 8dfd2b8: FOUND
- Commit 7fbf1a2: FOUND
