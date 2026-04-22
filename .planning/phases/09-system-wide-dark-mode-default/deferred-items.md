# Deferred Items — Phase 09

Pre-existing issues found while executing 09-08; out of scope for this plan.

## Pre-existing TypeScript errors (unrelated to 09-08)

- `tests/e2e/auth.spec.ts(65,8)` — `Property 'todo' does not exist on type 'TestType'` (Playwright type narrowing issue, predates 09-08)
- `tests/e2e/auth.spec.ts(69,8)` — same as above
- `tests/unit/env.test.ts(14,16)` — `Property 'startsWith' does not exist on type 'keyof ProcessEnv'` (predates 09-08)

Verified pre-existing via `git stash && bunx tsc --noEmit` — errors reproduce on clean tree.

## Pre-existing Next.js build error (unrelated to 09-08)

- `Error occurred prerendering page "/projects/new"` — `Invariant: Expected workStore to be initialized` during static export.
- Verified pre-existing by stashing all 09-08 changes and re-running `npx next build` — same error.
- TypeScript compilation completes successfully; only the static prerender phase fails.
- Likely a Next.js 16.2.4 / Turbopack issue with a server-action import path in `app/(app)/projects/new/page.tsx`.

## E2E not runnable in this worktree (env gate)

`npx playwright test tests/e2e/dark-mode.spec.ts` fails because the Playwright `webServer` (`bun run dev`) exits with `Error: Your project's URL and Key are required to create a Supabase client!` — there is no `.env.local` in the worktree. The test file itself is valid; it will run in the integrated tree where Supabase credentials are available.

Verified structurally:
- `tests/e2e/dark-mode.spec.ts` contains the `primitives-dark` describe block.
- The assertion contract (body bg ≠ white when eb-theme=dark cookie is set) holds given the Phase 8 `[data-theme="dark-auth"]` wrapper already present on `/auth/login`.

## Pre-existing unit-test failures (unrelated to 09-08)

Running `bunx vitest run` surfaces 33 failing tests across 6 files — all in Phase 8 admin territory:
- `tests/integration/platform-brand-rls.test.ts` (integration — needs live Supabase)
- `tests/integration/missing-key-ux.test.ts`
- `tests/unit/admin-gate.test.ts`
- `tests/unit/admin-test-button.test.ts`
- `tests/unit/crypto.aes.test.ts`
- `tests/unit/platform-config.test.ts`

All component unit tests (`tests/unit/components/*.test.tsx` — 8 tests across 2 files, including the new `ui-overlays.test.tsx`) pass. 09-08's scope is UI-only; admin failures are out of scope.

## Wave 3 token dependency note

09-08 emits `rounded-[var(--radius-md|lg|sm)]`, `shadow-[var(--shadow-md|lg)]`, `font-[var(--font-weight-medium|semibold)]`, `tracking-[var(--tracking-tight)]`, and `rounded-[var(--radius-full)]` classes. These tokens are owned by 09-06 (tokens) and become available when that wave lands. Until then, browsers fall back to the unset CSS-var default (browser default radius/shadow), which is visually acceptable but not the intended polished look. The Tailwind arbitrary-value classes themselves compile fine and do not break the build.
