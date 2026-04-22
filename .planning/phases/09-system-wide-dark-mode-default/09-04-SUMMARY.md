---
phase: 09-system-wide-dark-mode-default
plan: 04
subsystem: theming
tags: [theme, dark-mode, semantic-tokens, status-palette, tier-1-migration, e2e]
dependency-graph:
  requires:
    - Plan 09-02 [data-theme="light"] forced-light wrapper (status tokens added inside the same block)
    - Phase 8 scoped [data-theme="dark-auth"] / [data-theme="admin-dark"] wrappers (tokens added there too — preserved unchanged)
    - Existing semantic baseline (--background, --foreground, --muted, --accent, --destructive in app/globals.css)
  provides:
    - Semantic status-color palette (--success / --warning / --info / --danger trios) available in :root, .dark, scoped-dark, and forced-light
    - Hardcoded-color-free Tier-1 components (status-badge, project-actions, audio-recorder info banner, transcript-editor, estimate-editor)
    - Locked status-token contract via vitest unit suite
    - Dark-mode public-route smoke sweep (routes-render-dark) for /auth/login, /auth/signup, /auth/reset-password
  affects:
    - app/globals.css
    - components/dashboard/status-badge.tsx
    - components/dashboard/project-actions.tsx
    - components/workspace/audio/audio-recorder.tsx
    - components/workspace/audio/transcript-editor.tsx
    - components/workspace/estimate/estimate-editor.tsx
    - tests/unit/components/status-badge.test.tsx
    - tests/e2e/dark-mode.spec.ts
tech-stack:
  added: []
  patterns:
    - Semantic CSS-var trios (base / foreground / muted) added to all four theme blocks for cascade-correct rendering
    - Tailwind arbitrary-value class `bg-[hsl(var(--token))]` to consume HSL CSS-vars without extending tailwind config
    - Intentional hardcoded color preserved with explanatory comment (record button bg-red-500 — UI convention for "recording")
key-files:
  created:
    - .planning/phases/09-system-wide-dark-mode-default/09-04-SUMMARY.md
  modified:
    - app/globals.css
    - components/dashboard/status-badge.tsx
    - components/dashboard/project-actions.tsx
    - components/workspace/audio/audio-recorder.tsx
    - components/workspace/audio/transcript-editor.tsx
    - components/workspace/estimate/estimate-editor.tsx
    - tests/unit/components/status-badge.test.tsx
    - tests/e2e/dark-mode.spec.ts
    - .planning/phases/09-system-wide-dark-mode-default/deferred-items.md
decisions:
  - Added the new --success/--warning/--info/--danger trios to ALL FOUR theme blocks (`:root`, `.dark`, the combined scoped-dark `[data-theme="admin-dark"], [data-theme="dark-auth"]` selector, and the `[data-theme="light"]` forced-light scope from 09-02). This matches the cascade rules: components inside scoped wrappers get the locally-redeclared values, components in unscoped surfaces follow `:root`/`.dark` per next-themes' root class.
  - Kept the record-button `bg-red-500 animate-pulse hover:bg-red-600` literal hex family — added a `{/* Intentional: ... */}` comment above it. Red-on-pulse is a hard UI convention for "recording" that should not flip with theme; converting it to a token would require a one-off `--recording` token used in exactly one place.
  - Followed the plan's `for ... it()` test pattern verbatim (3 source-level `it(` literals, 9 runtime tests). The plan's acceptance criterion text "at least 8 `it(` blocks (grep)" was inconsistent with the action's loop pattern; runtime test count satisfies the spirit (7 statuses + fallback + no-hardcoded = 9 ≥ 8).
metrics:
  duration: "~3min"
  tasks_completed: 2
  files_modified: 8
  files_created: 1
  completed-date: "2026-04-22"
---

# Phase 9 Plan 4: Tier-1 Hardcoded-Color Migration + Semantic Status Palette Summary

One-liner: Added a complete `--success / --warning / --info / --danger` trio (base + foreground + muted) to all four theme blocks in `app/globals.css`, migrated the five Tier-1 violator files (status-badge, project-actions, audio-recorder info banner, transcript-editor, estimate-editor) to consume those tokens, and locked the contract with a rewritten vitest unit suite plus a `routes-render-dark` Playwright sweep over the three public auth routes.

## What Changed

**Task 1 (commit `ed11146`)** — `feat(09-04): add semantic status tokens + migrate Tier-1 hardcoded colors`

- `app/globals.css`
  - `:root` block: appended 12 lines (4 token trios) right after `--radius`. Light-theme HSL values: success=142/76%/36%, warning=38/92%/50%, info=221/83%/53%, danger=0/84%/60%, with light-bg `*-muted` variants.
  - `.dark` block: appended 12 lines after `--ring`. Dark-theme values: success=142/70%/45%, warning=38/92%/60%, info=217/91%/60%, danger=0/72%/55%, with dark-bg `*-muted` variants (low-lightness backgrounds for legibility against bright foregrounds).
  - `[data-theme="admin-dark"], [data-theme="dark-auth"]` block: appended the same dark-theme values (matches `.dark` so scoped-dark surfaces render identically to root-dark for status colors).
  - `[data-theme="light"]` block (Phase 9 forced-light scope from 09-02): appended the same light values as `:root` so the public estimate share view + PDF preview render status colors on light no matter the parent `<html>` class.

- `components/dashboard/status-badge.tsx`
  - Rewrote `STATUS_STYLES` map: replaced every `bg-{color}-100 text-{color}-700` pair with semantic tokens. Five statuses now reference the new tokens (`processing`→warning, `ready`→info, `accepted`→success, `declined`→danger, plus `sent`→accent, `draft`/`archived`→muted).
  - Replaced `'capitalize'` className addition with `'capitalize hover:opacity-90'` (per plan — drops the per-status `hover:bg-*` classes since hover is now uniformly an opacity dim).

- `components/dashboard/project-actions.tsx`
  - Line 82: `className="text-red-600"` → `className="text-destructive focus:text-destructive"`. Matches the shadcn dropdown destructive-item convention (dropdown-menu.tsx line 77).

- `components/workspace/audio/audio-recorder.tsx`
  - Line 301: added `{/* Intentional: red signals "recording" regardless of theme (UI convention). */}` comment above the record button.
  - Lines 307-308: kept `bg-red-500 animate-pulse hover:bg-red-600` exactly as-is by design.
  - Line 376: replaced `bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300` (which would NOT fire inside scoped-dark wrappers per Pitfall 4) with `bg-[hsl(var(--info-muted))] text-[hsl(var(--info))]`. Now renders correctly in `.dark`, `[data-theme="dark-auth"]`, AND `[data-theme="light"]` because the tokens are redeclared in each block.

- `components/workspace/audio/transcript-editor.tsx`
  - Line 74: `text-green-600` → `text-[hsl(var(--success))]` on the "Saved" indicator.

- `components/workspace/estimate/estimate-editor.tsx`
  - Line 294: `text-green-600` → `text-[hsl(var(--success))]` on the saved-status `CheckCircle2`.
  - Line 300: `text-yellow-600` → `text-[hsl(var(--warning))]` on the dirty-status `AlertCircle`.

**Task 2 (commit `4a0760b`)** — `test(09-04): rewrite status-badge unit test for semantic tokens + add routes-render-dark E2E sweep`

- `tests/unit/components/status-badge.test.tsx` — full rewrite:
  - Defines `EXPECTED` map: 7 statuses → array of expected semantic class substrings.
  - Loops `for (const [status, classes] of Object.entries(EXPECTED))` to generate a per-status `it()` test that renders `<StatusBadge>`, locates the badge via `screen.getByText(status)`, and asserts every expected class appears in `el.className`.
  - Adds `falls back to draft styling for unknown status` test (asserts `bg-muted` on `xyz-unknown`).
  - Adds `has no hardcoded color classes` regression guard test (regex-asserts no `bg-/text-{color}-{NNN}` slips through).
  - Runtime: 9 tests total (7 statuses + fallback + guard). All green: `Tests 9 passed (9)`.
- `tests/e2e/dark-mode.spec.ts` — appended a new `test.describe('Phase 9 — routes render in dark mode')` block:
  - Uses `test.beforeEach({ context, baseURL })` to inject `eb-theme=dark` cookie scoped to Playwright's configured `baseURL` (which is `http://localhost:9633`, NOT the plan's literal `http://localhost:3000` — adjusted per plan's "read playwright.config.ts first" note).
  - Iterates `PUBLIC_ROUTES = ['/auth/login', '/auth/signup', '/auth/reset-password']` and asserts `document.documentElement.className` matches `/(^|\s)dark(\s|$)/` after navigation.
- `.planning/phases/09-system-wide-dark-mode-default/deferred-items.md` — appended an entry documenting the pre-existing `tests/integration/missing-key-ux.test.ts` failure (unrelated email-error wording drift from Phase 8; out of scope per CLAUDE.md SCOPE BOUNDARY).

## Acceptance Criteria — Verified

Task 1:
- `app/globals.css` contains all four tokens — grep `--success:|--warning:|--info:|--danger:` returns 16 matches (4 tokens × 4 blocks).
- `app/globals.css` contains `--success:` in 4 distinct blocks (`:root`, `.dark`, scoped-dark, light) — grep count = 4. (Plan's "≥ 2" satisfied.)
- `grep -E "bg-(gray|yellow|blue|purple|green|red)-[0-9]{3}" components/dashboard/status-badge.tsx` returns 0 matches.
- `grep -E "text-(green|yellow)-[0-9]{3}" components/workspace/audio/transcript-editor.tsx` returns 0 matches.
- `grep -E "text-(green|yellow)-[0-9]{3}" components/workspace/estimate/estimate-editor.tsx` returns 0 matches.
- `grep -E "text-red-[0-9]{3}" components/dashboard/project-actions.tsx` returns 0 matches.
- `grep -E "dark:bg-blue-950|bg-blue-50" components/workspace/audio/audio-recorder.tsx` returns 0 matches.
- `grep "bg-red-500" components/workspace/audio/audio-recorder.tsx` returns 1 match — the documented record-button cue.
- `bunx tsc --noEmit` produces only the three pre-existing errors logged in `deferred-items.md`; no new errors introduced by 09-04.
- `npx next build`: not run in this worktree (pre-existing prerender failure documented in `deferred-items.md`).

Task 2:
- `tests/unit/components/status-badge.test.tsx` contains 0 occurrences of `bg-gray-100` or `text-gray-700` literals.
- Spec asserts `bg-[hsl(var(--success-muted))]` substring — grep OK.
- Spec contains 3 source `it(` literals (one inside the for-loop) → 9 runtime tests; satisfies "≥ 8" runtime acceptance.
- `tests/e2e/dark-mode.spec.ts` contains literal `routes-render-dark` — grep OK.
- Spec references all three auth routes — grep OK.
- `bunx vitest run tests/unit/components/status-badge.test.tsx` exits 0; **9/9 tests pass**.
- `npx playwright test tests/e2e/dark-mode.spec.ts`: not run — pre-existing Playwright runner environment issue inherited from 09-02 (logged in `deferred-items.md`). The spec compiles to valid Playwright shapes; `tsc` reports no errors in the appended block.

Plan-level verification:
- Full unit suite: `bunx vitest run` — 33 of 34 test files pass; the single failure is the unrelated `missing-key-ux.test.ts` Resend-error-wording drift (logged as deferred, out of scope per CLAUDE.md SCOPE BOUNDARY).
- No Tier-1 violations remain: grep across all 5 files for `bg-(gray|yellow|blue|purple|green|red)-[0-9]{3}` matches only the documented `bg-red-500` record button line in audio-recorder.tsx.

## Deviations from Plan

**1. [Rule 3 - Blocking] Adjusted Playwright baseURL**
- Found during: Task 2(b)
- Issue: Plan's literal cookie URL was `http://localhost:3000`, but `playwright.config.ts` defines `baseURL: 'http://localhost:9633'`.
- Fix: Used `baseURL` parameter from Playwright's `test.beforeEach({ context, baseURL })` fixture with a `?? 'http://localhost:9633'` fallback. Avoids the cookie being scoped to the wrong origin (which would silently no-op the test).
- Files modified: `tests/e2e/dark-mode.spec.ts`
- Commit: `4a0760b`
- Note: The plan explicitly anticipated this — "adjust `http://localhost:3000` to the project's Playwright `baseURL` if defined in `playwright.config.ts` (read first)."

**2. [Plan inconsistency — flagged, not auto-fixed] Test loop pattern vs. grep acceptance count**
- The plan's Task 2(a) `<action>` instructs writing the test as `for (const [status, classes] of Object.entries(EXPECTED)) { it(...) }` — yielding 3 source-level `it(` literals.
- The plan's `<acceptance_criteria>` says: "contains at least 8 `it(` blocks (grep, covering 7 statuses + fallback + no-hardcoded)" — which would require unrolling each test.
- Resolution: Followed the action verbatim (the operative directive). Runtime test count is 9 (7 statuses from the loop + fallback + no-hardcoded), satisfying the spirit of the criterion. Source `it(` count is 3.

No other deviations. Tasks executed as written.

## Auto-fixed Issues

None of Rules 1/2/3 were triggered other than the baseURL adjustment above (which the plan itself flagged as the expected adjustment).

## Deferred Issues

See `.planning/phases/09-system-wide-dark-mode-default/deferred-items.md`. New entry added in this plan:

- `tests/integration/missing-key-ux.test.ts` failing — unrelated wording drift in `/api/estimates/[id]/send` 503 response. The route returns `"Email sending isn't available right now. Use 'Download PDF' and send manually, or contact your platform administrator."` and the test still asserts `/not configured/i`. Out of scope per CLAUDE.md SCOPE BOUNDARY (not in any of the 5 files this plan touches; last touched on Phase 8 commit `a86dd16`). Candidate for a dedicated `/gsd:quick` fix.

Carried forward unchanged from prior plans:
- 3 pre-existing TypeScript errors (Playwright `test.todo`, env.test.ts `startsWith`).
- `next build` prerender failure (env-only, not a code regression).
- Playwright runner environment issue (duplicate resolver + missing `.env.local`).
- Operator action: apply `20260422000001_theme_preference.sql` migration (from 09-01).

## Commits

- `ed11146` — `feat(09-04): add semantic status tokens + migrate Tier-1 hardcoded colors`
- `4a0760b` — `test(09-04): rewrite status-badge unit test for semantic tokens + add routes-render-dark E2E sweep`

## Known Stubs

None. Every modified file participates in live data paths:
- `globals.css` tokens are consumed by the migrated components in this very plan.
- `status-badge.tsx`, `project-actions.tsx`, `audio-recorder.tsx`, `transcript-editor.tsx`, `estimate-editor.tsx` all render real user-facing content.
- The unit test suite asserts the live render output of `<StatusBadge />` against the new STATUS_STYLES map (no mocked data — uses the real component).
- The E2E sweep navigates real public routes and reads real DOM state.

No placeholder text, hardcoded empty arrays, or unwired components introduced.

## Self-Check: PASSED

Verified:
- FOUND: `app/globals.css` (contains 4 `--success:` declarations across `:root`, `.dark`, scoped-dark, light blocks)
- FOUND: `components/dashboard/status-badge.tsx` (0 hardcoded color classes; 4 `bg-[hsl(var(...))]` semantic references)
- FOUND: `components/dashboard/project-actions.tsx` (0 `text-red-{NNN}` matches; `text-destructive focus:text-destructive` present)
- FOUND: `components/workspace/audio/audio-recorder.tsx` (0 `bg-blue-50` / `dark:bg-blue-950` matches; 1 documented `bg-red-500` record-button match preserved)
- FOUND: `components/workspace/audio/transcript-editor.tsx` (0 `text-green-{NNN}` matches; `text-[hsl(var(--success))]` present)
- FOUND: `components/workspace/estimate/estimate-editor.tsx` (0 `text-green-{NNN}` / `text-yellow-{NNN}` matches; success + warning tokens present)
- FOUND: `tests/unit/components/status-badge.test.tsx` (semantic-token assertions; 9/9 vitest tests pass)
- FOUND: `tests/e2e/dark-mode.spec.ts` (`routes-render-dark` describe block + 3 auth routes)
- FOUND: `.planning/phases/09-system-wide-dark-mode-default/09-04-SUMMARY.md` (this file)
- FOUND: commit `ed11146` in `git log`
- FOUND: commit `4a0760b` in `git log`
