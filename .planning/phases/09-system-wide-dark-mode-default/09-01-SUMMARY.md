---
phase: 09-system-wide-dark-mode-default
plan: 01
subsystem: theme-persistence
tags: [dark-mode, theme, persistence, supabase, cookies, server-action]
dependency-graph:
  requires:
    - companies table (from 20260409000001_initial_schema.sql)
    - supabase server client (lib/supabase/server.ts)
  provides:
    - companies.theme_preference column (dark|light|system|NULL)
    - saveThemePreference server action (lib/actions/theme.ts)
    - readThemeCookie, writeThemeCookie, isValidTheme, THEME_COOKIE_NAME (lib/theme/cookie.ts)
  affects:
    - Plan 09-02 (root layout flip) consumes readThemeCookie for SSR hydration
    - Plan 09-03 (ThemeToggle UI) consumes saveThemePreference for cross-device persistence
tech-stack:
  added: []
  patterns:
    - Server action with discriminated-union { ok: true } | { ok: false, message } result
    - next/headers cookies() async API for Next 16
    - CHECK constraint on nullable column for enum-like validation
    - Vitest vi.mock + dynamic import + vi.resetModules for per-test module isolation
key-files:
  created:
    - supabase/migrations/20260422000001_theme_preference.sql
    - lib/theme/cookie.ts
    - lib/actions/theme.ts
    - tests/integration/theme-action.test.ts
  modified: []
decisions:
  - "[09-01] theme_preference stored as nullable TEXT on companies (1:1 with auth.users) with CHECK constraint (NULL | dark | light | system) — NULL means 'use system' at runtime"
  - "[09-01] eb-theme cookie httpOnly:false so next-themes can read it pre-hydration via document.cookie"
  - "[09-01] Server action validates theme BEFORE auth check so invalid input short-circuits without a Supabase round-trip"
  - "[09-01] Cookie written AFTER successful DB update so a failed persist does not desync cookie from DB"
metrics:
  duration: "7min"
  tasks: 2
  files: 4
  completed: "2026-04-22"
---

# Phase 9 Plan 01: Theme persistence foundation Summary

Per-user theme preference persistence via `companies.theme_preference` column + `eb-theme` cookie for SSR hydration, with a validated server action that writes both in one call.

## What was built

**Task 1 — Migration + cookie helpers** (commit `355c2bc`)
- `supabase/migrations/20260422000001_theme_preference.sql`: adds nullable `theme_preference TEXT` column to `companies` with `CHECK (theme_preference IS NULL OR theme_preference IN ('dark','light','system'))`. NULL resolves to "use system" at runtime.
- `lib/theme/cookie.ts`: exports `THEME_COOKIE_NAME = 'eb-theme'`, `THEME_COOKIE_MAX_AGE = 31536000`, `ThemePreference` type, `isValidTheme` type guard, `readThemeCookie` (returns `'dark' | 'light' | 'system' | null`), `writeThemeCookie` (sets with `path:'/'`, `sameSite:'lax'`, `httpOnly:false`).

**Task 2 — `saveThemePreference` server action + integration test** (commits `dee1a26` RED, `5a1bd13` GREEN)
- `lib/actions/theme.ts`: `'use server'` module exporting `saveThemePreference(theme)`. Flow: validate → `getClaims()` auth → `supabase.from('companies').update({ theme_preference }).eq('user_id', claims.sub)` → on success `writeThemeCookie(theme)` → return `{ ok: true }`. On validation fail: `{ ok: false, message: 'Invalid theme preference' }` (no DB, no cookie). On unauth: `{ ok: false, message: 'Not authenticated' }`. On supabase error: `{ ok: false, message: <supabase message> }` (no cookie write).
- `tests/integration/theme-action.test.ts`: 5 test cases covering invalid input / unauthenticated / authenticated dark / authenticated system / supabase error. All passing.

## Verification

- `node -e "fs.accessSync(...)"` + `grep` on migration + cookie helper contents → PASS
- `npm test -- --run tests/integration/theme-action.test.ts` → **5/5 tests pass** (1.6s)
- `grep -c "export async function saveThemePreference" lib/actions/theme.ts` → 1
- `grep -c "from '@/lib/theme/cookie'" lib/actions/theme.ts` → 1
- First line of `lib/actions/theme.ts` is `'use server'` → verified
- 5 `it(` matches in test file

## Acceptance criteria met

- [x] `supabase/migrations/20260422000001_theme_preference.sql` contains `ALTER TABLE companies`, `theme_preference`, `CHECK`, `'dark','light','system'`
- [x] `lib/theme/cookie.ts` exports `THEME_COOKIE_NAME`, `readThemeCookie`, `writeThemeCookie`, `isValidTheme`
- [x] `lib/theme/cookie.ts` sets cookie with `sameSite: 'lax'` and `path: '/'`
- [x] `lib/actions/theme.ts` starts with `'use server'` directive
- [x] `lib/actions/theme.ts` exports `saveThemePreference`
- [x] `lib/actions/theme.ts` imports `writeThemeCookie` from `@/lib/theme/cookie`
- [x] 5 test cases covering invalid / unauth / dark / system / supabase-error
- [x] `npx vitest run tests/integration/theme-action.test.ts` exits 0

## Deviations from Plan

### Not applied automatically: Supabase migration push

The plan's action step includes `bunx supabase db push --db-url "$DATABASE_URL"`. This worktree environment does not have `DATABASE_URL` exported and no `.env*` files beyond `.env.example`. The migration file is committed and ready; applying it to the hosted Supabase instance is an operator step (matches Phase 1 pattern where the user ran `bunx supabase db push` against their own `DATABASE_URL`). No auto-fix possible — environment-scoped, not a code issue.

**Follow-up:** before Plan 09-02 uses `readThemeCookie` in the authenticated layout, the migration should be applied so the companies select-list includes `theme_preference` and downstream code can read it.

### Deferred items (out of scope — Rule SCOPE BOUNDARY)

`bunx tsc --noEmit` surfaced three pre-existing TypeScript errors in unrelated files:
- `tests/e2e/auth.spec.ts:65,69` — `Property 'todo' does not exist on type 'TestType<...>'`
- `tests/unit/env.test.ts:14` — `Property 'startsWith' does not exist on type 'keyof ProcessEnv'`

Not introduced by this plan; logged to `.planning/phases/09-system-wide-dark-mode-default/deferred-items.md`. Unit/integration suite for this plan (via `npm test`) is unaffected and passes clean.

### Auto-fixed issues

None. Plan executed exactly as written.

## Key decisions

- Validate theme BEFORE `createClient()` / auth check so invalid input never opens a DB connection
- Write cookie AFTER successful DB update so cookie never drifts ahead of DB
- `httpOnly: false` so `next-themes` can read the cookie during pre-hydration (required by the `<script>` FOUC guard it injects)
- Cookie `maxAge` set to 365 days — preference should persist indefinitely across sessions

## Known stubs

None. All helpers are fully implemented and exercised by tests.

## Files

- Created: `supabase/migrations/20260422000001_theme_preference.sql`, `lib/theme/cookie.ts`, `lib/actions/theme.ts`, `tests/integration/theme-action.test.ts`
- Modified: none

## Commits

- `355c2bc` feat(09-01): add theme_preference migration + cookie helpers
- `dee1a26` test(09-01): add failing tests for saveThemePreference action (RED)
- `5a1bd13` feat(09-01): implement saveThemePreference server action (GREEN)

## Self-Check: PASSED

- supabase/migrations/20260422000001_theme_preference.sql — FOUND
- lib/theme/cookie.ts — FOUND
- lib/actions/theme.ts — FOUND
- tests/integration/theme-action.test.ts — FOUND
- commit 355c2bc — FOUND
- commit dee1a26 — FOUND
- commit 5a1bd13 — FOUND
