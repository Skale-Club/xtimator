# Deferred Items — Phase 09

## Pre-existing TypeScript errors (NOT caused by Phase 9 plans)

Discovered during `bunx tsc --noEmit` while verifying Tasks 1 of 09-01 and 09-06. Confirmed pre-existing on HEAD (reproduced with `git stash && bunx tsc --noEmit`).

- `tests/e2e/auth.spec.ts(65,8)` and `(69,8)`: `Property 'todo' does not exist on type 'TestType<...>'` — Playwright `test.todo` usage issue
- `tests/unit/env.test.ts(14,16)`: `Property 'startsWith' does not exist on type 'keyof ProcessEnv'` — type narrowing issue

Scope: unrelated to Phase 9 work. Candidate for a dedicated `/gsd:quick` fix.

## Pre-existing `next build` prerender failure (NOT caused by 09-06)

- `Error: supabaseUrl is required. ... at Module.h [as generateMetadata]` during `/_not-found` static prerender.
- Root cause: no `.env.local` in worktree environments; `NEXT_PUBLIC_SUPABASE_URL` unset at build time. `generateMetadata()` in `app/layout.tsx` (added in 08-01) invokes `getBranding()` which reaches Supabase.
- Verified via: `✓ Compiled successfully in 3.0s` and `Finished TypeScript in 4.4s` — code + CSS compile cleanly. Only the prerender step fails, and only because env vars are absent.
- Scope: environmental, not a code regression.

## Operator action required before 09-02 goes live

- Plan 09-01 added `supabase/migrations/20260422000001_theme_preference.sql` but the migration was NOT auto-applied (DATABASE_URL not exported in the worktree).
- Before production runtime reads `companies.theme_preference`, operator must run: `bunx supabase db push --db-url $DATABASE_URL`.
