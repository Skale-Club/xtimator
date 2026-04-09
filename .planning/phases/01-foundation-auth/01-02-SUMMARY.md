---
phase: 01-foundation-auth
plan: "02"
subsystem: auth
tags: [supabase, ssr, middleware, session, route-protection]
dependency_graph:
  requires: [01-01]
  provides: [supabase-ssr-clients, session-refresh, route-protection]
  affects: [all-server-components, all-api-routes, auth-ui]
tech_stack:
  added: ["@supabase/ssr"]
  patterns: [browser-client, server-client, middleware-proxy, getClaims-validation]
key_files:
  created:
    - lib/supabase/client.ts
    - lib/supabase/server.ts
    - lib/supabase/proxy.ts
    - middleware.ts
  modified:
    - tests/unit/supabase.test.ts
    - tests/unit/middleware.test.ts
decisions:
  - getClaims() used instead of getSession() for JWT signature validation (SEC-03, AUTH-04)
  - data?.claims ?? null pattern handles nullable data from getClaims() return type
  - Supabase response cookies preserved on redirect to avoid dropping set-cookie headers
metrics:
  duration: 8min
  completed: 2026-04-09
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 2
---

# Phase 01 Plan 02: Supabase SSR Wiring + Middleware Summary

**One-liner:** Supabase SSR clients (browser/server/proxy) wired with getClaims() session validation and middleware protecting all routes except /auth/* and /estimate/*.

## What Was Built

Three Supabase utility files and root middleware that form the session layer for the entire application:

- `lib/supabase/client.ts` — `createBrowserClient` wrapper for use in Client Components
- `lib/supabase/server.ts` — async `createServerClient` with `await cookies()` for Server Components, Actions, and Route Handlers
- `lib/supabase/proxy.ts` — `updateSession` for middleware; uses `getClaims()` (not `getSession()`) for secure JWT validation
- `middleware.ts` — Routes all requests through `updateSession`; matcher excludes static assets

## Verification Results

- `bun run test` — 11 tests passed (3 env + 3 supabase export + 5 middleware route)
- `bun run build` — TypeScript compiled without errors
- No `getSession` calls in proxy code (only in comments)
- No `SERVICE_ROLE` references in browser-facing files (SEC-03 compliant)
- `middleware.ts` imports and calls `updateSession` from `@/lib/supabase/proxy`

## Commits

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Create Supabase client utilities (browser, server, proxy) | 8281f62 |
| 2 | Wire middleware and implement unit tests | 054128d |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed getClaims() return type destructuring**
- **Found during:** Task 1 — build verification
- **Issue:** `const { data: { claims } } = await supabase.auth.getClaims()` failed TypeScript check because `data` can be `null` when no session exists. The return type is `{ data: { claims, header, signature } } | { data: null }`.
- **Fix:** Changed to `const { data } = await supabase.auth.getClaims(); const claims = data?.claims ?? null` to safely handle the nullable data shape.
- **Files modified:** `lib/supabase/proxy.ts`
- **Commit:** 8281f62

## Known Stubs

None — all session logic is wired to real Supabase getClaims() calls. Route protection is live and functional.

## Self-Check: PASSED
