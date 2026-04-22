---
phase: 09-system-wide-dark-mode-default
plan: 06
subsystem: design-system
tags: [css, tokens, radius, shadow, typography, design-foundation, tailwind-v4]
dependency-graph:
  requires:
    - Phase 8 scoped dark themes ([data-theme="admin-dark"], [data-theme="dark-auth"])
    - Existing :root + .dark semantic token vocabulary
  provides:
    - Radius scale (--radius-xs/sm/md/lg/xl/full) for primitive redesign
    - Shadow scale (--shadow-xs/sm/md/lg/focus) with dark-theme elevation variants
    - Typography scale (--font-size-*, --line-height-*, --font-weight-*, --tracking-*)
    - Semantic spacing hints (--space-stack-*)
  affects:
    - app/globals.css
tech-stack:
  added: []
  patterns:
    - Additive token extension (no existing tokens removed or renamed)
    - Per-theme shadow overrides re-declared inside .dark + scoped wrappers
    - Tailwind v4 arbitrary-value consumption pattern (rounded-[var(--radius-md)], shadow-[var(--shadow-sm)])
key-files:
  created:
    - .planning/phases/09-system-wide-dark-mode-default/09-06-SUMMARY.md
    - .planning/phases/09-system-wide-dark-mode-default/deferred-items.md
  modified:
    - app/globals.css
decisions:
  - Appended new token block at end of globals.css to avoid ordering conflicts with parallel-executing plans 09-02 ([data-theme="light"]) and 09-04 (status tokens)
  - Included [data-theme="light"] shadow overrides proactively, so the rule is harmless if the forced-light wrapper does not yet exist and correct once 09-02 lands it
  - Kept `--radius: 0.5rem` (original) intact — new `--radius-md` is an alias of the same value, providing a named token for downstream consumers
metrics:
  duration: "~3min"
  tasks_completed: 1
  files_modified: 1
  completed-date: "2026-04-22"
---

# Phase 9 Plan 6: Refined Design-Token Foundation Summary

One-liner: Added additive radius / shadow / typography token scales to `app/globals.css` so Wave 2 and Wave 3 primitive redesign (09-07, 09-08) can consume a shared token vocabulary without touching any existing tokens.

## What Changed

A single CSS-only edit: appended one new `@layer base { ... }` block at the bottom of `app/globals.css` (after the existing `body` rule). The block defines:

- Radius scale: `--radius-xs` (0.25rem), `--radius-sm` (0.375rem), `--radius-md` (0.5rem), `--radius-lg` (0.75rem), `--radius-xl` (1rem), `--radius-full` (9999px).
- Shadow scale on `:root`: `--shadow-xs`, `--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-focus` (light-theme RGBAs keyed to slate-900).
- Shadow overrides in the dark-surface selector group (`.dark`, `[data-theme="admin-dark"]`, `[data-theme="dark-auth"]`) using pure-black RGBAs at higher alpha for theme-appropriate elevation, plus a stronger `--shadow-focus` for dark contrast.
- Shadow overrides in `[data-theme="light"]` that mirror `:root` — so the forced-light scope (introduced in 09-02) renders with light-theme elevation even when `<html class="dark">`.
- Typography: `--font-size-xs`…`--font-size-3xl` with matching `--line-height-*`, `--font-weight-normal/medium/semibold/bold`, and `--tracking-tight/tighter/normal`.
- Semantic spacing hints: `--space-stack-xs/sm/md/lg/xl`.

Existing tokens preserved verbatim: the original `:root` block (including `--radius: 0.5rem`), `.dark` block, `[data-theme="admin-dark"] / [data-theme="dark-auth"]` scoped wrappers, and the `@theme inline` block are unchanged.

## Why

Primitive redesign plans 09-07 and 09-08 need a shared token vocabulary. Introducing it as a standalone additive commit in Wave 1 (this plan) decouples the CSS foundation from the primitive refactor and lets those downstream plans consume `rounded-[var(--radius-lg)]` / `shadow-[var(--shadow-md)]` etc. without re-declaring values component-by-component.

## Acceptance Criteria — Verified

- `app/globals.css` contains all six radius literals (`--radius-xs:` through `--radius-full:`) — confirmed via grep (lines 100-105).
- All five shadow literals (`--shadow-xs:` through `--shadow-focus:`) present — confirmed (lines 108-112).
- Typography literals (`--font-weight-medium:`, `--font-weight-semibold:`, `--tracking-tight:`, `--font-size-base:`) present — confirmed (lines 117, 125, 126, 128).
- Original `--radius: 0.5rem` preserved at line 24.
- `.dark {` (line 27), `[data-theme="admin-dark"]` (lines 50, 142), `[data-theme="dark-auth"]` (lines 51, 143), and `[data-theme="light"]` (line 152) all present.
- `next build` TypeScript phase exits cleanly (`✓ Compiled successfully in 3.0s`, `Finished TypeScript in 4.4s`). See "Deferred Issues" below for the prerender-env failure, which is pre-existing and unrelated.
- Existing unit test passes: `tests/unit/components/status-badge.test.tsx` → 5 passed.

## Deviations from Plan

### Auto-fixed Issues

None required. No Rule 1/2/3 fixes triggered; the plan is purely additive CSS.

### Plan-specified `bunx tsc --noEmit` behavior

The plan calls `bunx tsc --noEmit` as part of verification. Running it revealed three pre-existing TypeScript errors (`tests/e2e/auth.spec.ts` uses `test.todo` which isn't in this version of Playwright's types; `tests/unit/env.test.ts` has a ProcessEnv type mismatch). These errors reproduce on HEAD with the globals.css change reverted (confirmed via `git stash && bunx tsc --noEmit`), so they are out-of-scope pre-existing issues, not regressions introduced by this plan. Logged in `deferred-items.md` alongside the `next build` prerender-env failure (which is caused by the absence of `.env.local` in this worktree, not by any code change).

### Test runner note

Local `node_modules` inside the worktree does not contain vitest binaries (shared `node_modules` at the project root holds them). Verification ran via `../../../node_modules/.bin/vitest.exe run tests/unit/components/status-badge.test.tsx` — same behavior and exit code semantics as `npm test`.

## Deferred Issues

Logged to `.planning/phases/09-system-wide-dark-mode-default/deferred-items.md`:
1. `tests/e2e/auth.spec.ts(65,8)` + `(69,8)`: `Property 'todo' does not exist on type 'TestType'` — pre-existing.
2. `tests/unit/env.test.ts(14,16)`: `Property 'startsWith' does not exist on type 'keyof ProcessEnv'` — pre-existing.
3. `next build` prerender fails with `Error: supabaseUrl is required` during `/_not-found` static generation because `NEXT_PUBLIC_SUPABASE_URL` is unset in this worktree — environmental, not caused by CSS changes. Compilation itself succeeds.

## Commits

- `bac038f` — `feat(09-06): add radius, shadow, and typography token scales to globals.css`
- `e98c0ff` — `chore(09-06): track pre-existing build/test issues as deferred items`

## Known Stubs

None. This plan adds only CSS tokens; there are no component surfaces, no data pipelines, and no placeholder renderings.

## Self-Check: PASSED

Verified:
- `FOUND: app/globals.css` (contains all required tokens per grep output above)
- `FOUND: .planning/phases/09-system-wide-dark-mode-default/09-06-SUMMARY.md` (this file)
- `FOUND: .planning/phases/09-system-wide-dark-mode-default/deferred-items.md`
- `FOUND: bac038f` commit in `git log`
- `FOUND: e98c0ff` commit in `git log`
