# Deferred Items — Phase 09

## From 09-06 (plan start)

- Pre-existing `tsc --noEmit` errors (NOT caused by 09-06):
  - `tests/e2e/auth.spec.ts(65,8)` + `(69,8)`: `Property 'todo' does not exist on type 'TestType'`
  - `tests/unit/env.test.ts(14,16)`: `Property 'startsWith' does not exist on type 'keyof ProcessEnv'`
  - Status: confirmed pre-existing on HEAD (reproduced with `git stash && bunx tsc --noEmit`).
  - Scope: unrelated to globals.css changes. Leave for a dedicated quick-fix.

- Pre-existing `next build` prerender failure (NOT caused by 09-06):
  - `Error: supabaseUrl is required. ... at Module.h [as generateMetadata]` during `/_not-found` static prerender.
  - Root cause: no `.env.local` in worktree; `NEXT_PUBLIC_SUPABASE_URL` unset at build time. `generateMetadata()` in `app/layout.tsx` (added in 08-01) invokes `getBranding()` which reaches Supabase.
  - Verified via: `✓ Compiled successfully in 3.0s` and `Finished TypeScript in 4.4s` — code + CSS compile cleanly. Only the prerender step fails, and only because env vars are absent.
  - Scope: environmental, not caused by globals.css additions.
