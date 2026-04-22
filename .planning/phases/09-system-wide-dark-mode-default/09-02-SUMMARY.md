---
phase: 09-system-wide-dark-mode-default
plan: 02
subsystem: theming
tags: [theme, dark-mode, ssr-hydration, next-themes, forced-light, e2e]
dependency-graph:
  requires:
    - Plan 09-01 cookie helpers (readThemeCookie, writeThemeCookie, isValidTheme)
    - Plan 09-01 companies.theme_preference column
    - Phase 8 scoped [data-theme="dark-auth"] and [data-theme="admin-dark"] wrappers (preserved unchanged)
    - Plan 09-06 [data-theme="light"] shadow overrides (already landed; color-palette redeclaration added here)
  provides:
    - Root ThemeProvider wired to cookie (defaultTheme={saved ?? 'dark'}, enableSystem)
    - (app)/layout cookie sync from companies.theme_preference
    - [data-theme="light"] forced-light scope for /estimate/[token] public share view
    - tests/e2e/dark-mode.spec.ts — contract tests for default-dark + forced-light + scoped-wrappers
  affects:
    - app/layout.tsx
    - app/(app)/layout.tsx
    - app/estimate/[token]/layout.tsx
    - app/globals.css
    - tests/e2e/dark-mode.spec.ts
tech-stack:
  added: []
  patterns:
    - SSR cookie read in async RootLayout (Next 16 `next/headers` cookies() + await)
    - DB-to-cookie sync in authenticated server layout (writes only on mismatch — avoids redundant Set-Cookie)
    - Forced-theme scope via `[data-theme="X"]` attribute selector that redeclares CSS vars (matches Phase 8 dark-auth / admin-dark pattern — avoids nested ThemeProvider which next-themes does not support)
key-files:
  created:
    - tests/e2e/dark-mode.spec.ts
    - .planning/phases/09-system-wide-dark-mode-default/09-02-SUMMARY.md
  modified:
    - app/layout.tsx
    - app/(app)/layout.tsx
    - app/estimate/[token]/layout.tsx
    - app/globals.css
    - .planning/phases/09-system-wide-dark-mode-default/deferred-items.md
decisions:
  - Kept `[data-theme="light"]` palette redeclaration additive (inside @layer base, immediately after admin-dark/dark-auth block) — preserves every existing rule and wins over `.dark` via CSS cascade because the attribute wrapper is a nearer ancestor than `<html class="dark">`.
  - Sync the cookie from DB on every authenticated request in `(app)/layout.tsx`, but only call `writeThemeCookie` when the value actually differs — keeps the Set-Cookie header off the hot path.
  - For the estimate forced-light wrapper, chose the `data-theme="light"` + CSS-var redeclare path (not `<ThemeProvider forcedTheme>`) to match the existing scoped-dark wrappers and avoid the officially-unsupported nested-provider pattern.
metrics:
  duration: "~3min"
  tasks_completed: 2
  files_modified: 5
  files_created: 2
  completed-date: "2026-04-22"
---

# Phase 9 Plan 2: Flip Root Default to Dark + Forced-Light Estimate Scope Summary

One-liner: Flipped `defaultTheme="light"` → cookie-hydrated `defaultTheme={saved ?? 'dark'} enableSystem` in the root layout, added per-request DB→cookie sync in the authenticated shell, wrapped `/estimate/[token]` in a `[data-theme="light"]` forced-light scope with a full light-palette CSS rule, and locked all three contracts with an E2E spec.

## What Changed

**Task 1 (commit `24d62b8`)** — `feat(09-02): flip root default to dark + SSR cookie hydration + forced-light estimate scope`

- `app/layout.tsx`
  - Converted `RootLayout` to `async`.
  - Imported `readThemeCookie` from `@/lib/theme/cookie` (Plan 09-01).
  - Read `saved = await readThemeCookie()` at the top.
  - Replaced `defaultTheme="light"` → `defaultTheme={saved ?? 'dark'}` and added `enableSystem`.
  - Kept `suppressHydrationWarning`, `attribute="class"`, `disableTransitionOnChange`, Inter font wiring, `generateMetadata` branding, Toaster — all untouched.

- `app/(app)/layout.tsx`
  - Extended the `companies` SELECT from `id, name, logo_url, owner_name` to `id, name, logo_url, owner_name, theme_preference`.
  - After the company null-check, read the cookie via `readThemeCookie()` and, when `isValidTheme(company.theme_preference)` and the cookie value differs, call `writeThemeCookie(company.theme_preference)`.
  - Imported `readThemeCookie, writeThemeCookie, isValidTheme` from `@/lib/theme/cookie`.
  - Sidebar/Topbar/BottomNav/MobileHeader rendering left exactly as-is.

- `app/estimate/[token]/layout.tsx`
  - Replaced the `<div className="min-h-screen bg-white">` wrapper with `<div data-theme="light" className="min-h-screen bg-background text-foreground">`. This lets the wrapper redeclare CSS vars inline, so the share view renders on the light palette regardless of `<html class>` state.

- `app/globals.css`
  - Inside `@layer base`, immediately after the existing `[data-theme="admin-dark"], [data-theme="dark-auth"] { … }` block (and before `@theme inline`), added a new `[data-theme="light"] { … }` rule that redeclares the full light color palette (the 19 tokens from `:root`: background, foreground, card, card-foreground, popover, popover-foreground, primary, primary-foreground, secondary, secondary-foreground, muted, muted-foreground, accent, accent-foreground, destructive, destructive-foreground, border, input, ring).
  - Existing `:root`, `.dark`, `[data-theme="admin-dark"]`, `[data-theme="dark-auth"]`, and the 09-06 Pillar-C additions (radius/shadow/typography/spacing + `[data-theme="light"]` shadow overrides) all preserved verbatim.

**Task 2 (commit `eaef0b2`)** — `test(09-02): add dark-mode E2E spec (default-dark + forced-light + scoped-wrappers)`

- `tests/e2e/dark-mode.spec.ts` — new file with 3 Playwright tests:
  1. `default-dark`: clears cookies, visits `/auth/login`, polls `document.documentElement.className` and asserts it matches `/(^|\s)dark(\s|$)/`.
  2. `scoped-wrappers-intact`: asserts `/auth/login` still renders exactly one `[data-theme="dark-auth"]` element (Phase 8 contract preserved).
  3. `estimate-forced-light`: visits `/estimate/test-token-does-not-exist`, guards against 5xx, then asserts `[data-theme="light"]` wrapper is visible — proving the layout mounts around the 404 boundary.
- `.planning/phases/09-system-wide-dark-mode-default/deferred-items.md` — appended a note documenting the pre-existing Playwright runner environment failure (duplicate resolver + missing `.env.local`), confirmed reproducible on pre-09-02 HEAD.

## Acceptance Criteria — Verified

Task 1:
- `app/layout.tsx` contains `defaultTheme={saved ?? 'dark'}` — grep OK.
- `app/layout.tsx` contains `enableSystem` — grep OK.
- `app/layout.tsx` imports `readThemeCookie` — grep OK.
- `app/(app)/layout.tsx` `.select()` includes `theme_preference` — grep OK.
- `app/(app)/layout.tsx` calls `writeThemeCookie(` — grep OK.
- `app/estimate/[token]/layout.tsx` contains `data-theme="light"` — grep OK.
- `app/globals.css` contains a `[data-theme="light"]` rule with `--background: 0 0% 100%;` — grep OK (occurs twice now: once for the 09-06 shadow overrides, once for the 09-02 color palette).
- `.dark {` block preserved — grep OK (count = 1).
- `[data-theme="admin-dark"]` preserved — grep OK (count = 2: color + shadow blocks).
- `[data-theme="dark-auth"]` preserved — grep OK (count = 2).
- `bunx tsc --noEmit` produces only the three pre-existing errors logged in `deferred-items.md` (Playwright `test.todo` + env.test.ts `startsWith`); no new errors introduced.

Task 2:
- `tests/e2e/dark-mode.spec.ts` exists with 3 `test(` blocks — grep count = 3.
- Spec asserts `document.documentElement.className` — grep OK.
- Spec references `data-theme="light"` and `data-theme="dark-auth"` locators — grep OK.
- `npx playwright test` cannot run in this worktree due to the pre-existing environment blocker (duplicate resolver + missing `.env.local`). Documented in `deferred-items.md`; test contract is locked by grep + file presence. The spec compiles to valid Playwright shapes.

## Deviations from Plan

None. Both tasks executed exactly as written. No Rule 1/2/3 auto-fixes triggered — the plan's instructions were complete, and the only friction (Playwright runner environment + `.env.local`) is a pre-existing condition inherited from Wave 1 and documented in the shared `deferred-items.md`.

## Deferred Issues

See `.planning/phases/09-system-wide-dark-mode-default/deferred-items.md`. New entry added in Task 2:

- Playwright runner fails to list/run tests in the worktree because of a duplicate `@playwright/test` resolver and a missing `.env.local` (webServer can't boot). Reproducible on pre-09-02 HEAD. Out of scope for Plan 09-02.

No in-scope issues deferred. The three pre-existing TypeScript errors and the `next build` prerender failure are carried forward unchanged from 09-01 / 09-06.

## Commits

- `24d62b8` — `feat(09-02): flip root default to dark + SSR cookie hydration + forced-light estimate scope`
- `eaef0b2` — `test(09-02): add dark-mode E2E spec (default-dark + forced-light + scoped-wrappers)`

## Known Stubs

None. All four files that were modified participate in live data paths: root layout reads a real cookie, `(app)` layout syncs real DB preference, estimate layout applies a real CSS wrapper consumed by a real rule in `globals.css`, and the E2E spec asserts against the real wrappers. No placeholder text, hardcoded empty arrays, or unwired components introduced.

## Self-Check: PASSED

Verified:
- `FOUND: app/layout.tsx` (contains `defaultTheme={saved ?? 'dark'}`, `enableSystem`, `readThemeCookie`)
- `FOUND: app/(app)/layout.tsx` (contains `theme_preference` in SELECT, `writeThemeCookie(` call)
- `FOUND: app/estimate/[token]/layout.tsx` (contains `data-theme="light"`)
- `FOUND: app/globals.css` (contains two `[data-theme="light"]` rules — color palette from 09-02 + shadow overrides from 09-06)
- `FOUND: tests/e2e/dark-mode.spec.ts` (3 test blocks, all required locators)
- `FOUND: .planning/phases/09-system-wide-dark-mode-default/09-02-SUMMARY.md` (this file)
- `FOUND: 24d62b8` commit in `git log`
- `FOUND: eaef0b2` commit in `git log`
