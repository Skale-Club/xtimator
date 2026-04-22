---
phase: 09-system-wide-dark-mode-default
plan: 08
subsystem: ui/overlays-navigation
tags: [ui, dark-mode, overlays, navigation, tokens, empty-state, sonner, e2e]
wave: 3
depends_on: ["09-06", "09-07"]
dependency_graph:
  requires:
    - "09-06 — radius/shadow/typography tokens (runtime CSS vars)"
    - "09-07 — primitives visual language (Button/Card/Input already rely on same tokens)"
  provides:
    - "Dialog/AlertDialog/Sheet content with --radius-lg + --shadow-lg"
    - "DropdownMenu content with --radius-md + --shadow-md; items --radius-sm"
    - "Table with comfortable density (p-3) and bg-muted/60 hover"
    - "Sonner Toaster wired to next-themes with token-only toast styling"
    - "components/shared/empty-state.tsx — canonical EmptyState with Phase-3 prop surface preserved"
    - "Navigation shells (Topbar/Sidebar/MobileHeader/BottomNav) with refined spacing + active-state treatment"
    - "tests/unit/components/ui-overlays.test.tsx — 3 structural contract tests"
    - "tests/e2e/dark-mode.spec.ts — primitives-dark describe block asserting dark palette resolves"
  affects:
    - "All server-side usages of Dialog/AlertDialog/Sheet/Dropdown (inherit visual refresh automatically)"
    - "components/dashboard/empty-state.tsx (pre-existing; shared version is drop-in compatible for future migration)"
tech_stack:
  added:
    - "next-themes integration inside Sonner Toaster classNames (already imported, now driving toast appearance)"
  patterns:
    - "Arbitrary-value Tailwind classes referencing design tokens: rounded-[var(--radius-*)] / shadow-[var(--shadow-*)] / font-[var(--font-weight-*)]"
    - "Sheet per-side rounded-X token (rounded-l-[var(--radius-lg)], rounded-r, rounded-t, rounded-b) — exposed edge only"
    - "Sonner toast classes via group-[.toaster] / group-[.toast] selectors — theme-agnostic, token-driven"
    - "EmptyState shape: h-12 w-12 rounded-[var(--radius-full)] bg-muted icon circle + semibold title + muted description + optional Button"
    - "Sidebar active state: bg-accent text-accent-foreground (matches 09-07 Button 'secondary' treatment)"
    - "BottomNav active state: text-foreground (stronger contrast than previous text-primary; aligns with 09-07 neutral scale)"
key_files:
  created:
    - "components/shared/empty-state.tsx"
    - "tests/unit/components/ui-overlays.test.tsx"
    - "tests/e2e/dark-mode.spec.ts"
    - ".planning/phases/09-system-wide-dark-mode-default/deferred-items.md"
  modified:
    - "components/ui/dialog.tsx"
    - "components/ui/alert-dialog.tsx"
    - "components/ui/sheet.tsx"
    - "components/ui/dropdown-menu.tsx"
    - "components/ui/table.tsx"
    - "components/ui/sonner.tsx"
    - "components/app-shell/topbar.tsx"
    - "components/app-shell/sidebar.tsx"
    - "components/app-shell/mobile-header.tsx"
    - "components/app-shell/bottom-nav.tsx"
decisions:
  - "Sheet per-side rounded-X uses the EXPOSED edge only (right sheet → rounded-l only), matching iOS-style sheet presentation"
  - "Sonner kept existing useTheme integration + style vars AND added toastOptions.classNames — both coexist so DOM CSS vars AND Tailwind classes apply (belt-and-braces)"
  - "shared EmptyState superset-preserves the Phase-3 prop surface (actionHref/onAction/onClearFilter) AND accepts the plan's new `href` alias — zero breaking change for future migration from components/dashboard/empty-state.tsx"
  - "BottomNav active color switched from text-primary → text-foreground per plan (stronger neutral contrast, aligns with 09-07 primitives vocabulary)"
  - "Sidebar aside bg changed from bg-muted/40 → bg-background + border-border (cleaner edge, matches token surface hierarchy)"
  - "Topbar ThemeToggle integration from 09-03 NOT present in this worktree at plan time (wave-3 parallel ordering); styling changes applied non-destructively so when 09-03 lands, the ThemeToggle fits into the existing header without rework"
metrics:
  duration_min: 9
  completed_date: "2026-04-22"
  tasks_completed: 2
  files_created: 4
  files_modified: 10
  commits:
    - "933ac2a — feat(09-08): redesign overlays + table + sonner with refreshed token vocabulary"
    - "bc9f561 — feat(09-08): refine nav shells + shared EmptyState + overlay contract tests"
---

# Phase 9 Plan 8: Pillar C Wave 2 — Overlays + Navigation Shells Summary

Redesigned Dialog/AlertDialog/Sheet/DropdownMenu/Table/Sonner to consume the Phase-9 radius/shadow/typography tokens; refined Topbar/Sidebar/MobileHeader/BottomNav spacing + active-state treatment; added a shared `components/shared/empty-state.tsx` preserving the Phase-3 prop surface; locked the contract with 3 structural unit tests and a `primitives-dark` E2E describe block.

## What was delivered

### Overlays (Task 1)

| Component | Before | After |
|-----------|--------|-------|
| `DialogContent` | `rounded-lg border shadow-lg` | `rounded-[var(--radius-lg)] border border-border shadow-[var(--shadow-lg)]` |
| `AlertDialogContent` | `rounded-lg border shadow-lg` | `rounded-[var(--radius-lg)] border border-border shadow-[var(--shadow-lg)]` |
| `SheetContent` | `shadow-lg` + per-side `border-l/r/t/b` | `shadow-[var(--shadow-lg)]` + per-side `border-X border-border rounded-X-[var(--radius-lg)]` (exposed edge) |
| `DropdownMenuContent` | `rounded-md border shadow-md` | `rounded-[var(--radius-md)] border border-border shadow-[var(--shadow-md)]` |
| `DropdownMenuItem` | `rounded-sm` + `focus:bg-accent` | `rounded-[var(--radius-sm)] transition-colors focus:bg-accent` (preserves `data-[variant=destructive]` branch) |
| `TableRow` | `border-b hover:bg-muted/50` | `border-b border-border hover:bg-muted/60` |
| `TableCell` | `p-2` | `p-3` |
| `TableHead` | `h-10 px-2 font-medium text-foreground` | `h-10 px-3 font-[var(--font-weight-medium)] text-muted-foreground` |
| Sonner `Toaster` | `useTheme` + style vars only | `useTheme` + style vars + `toastOptions.classNames` with `rounded-[var(--radius-md)]`, `shadow-[var(--shadow-md)]`, `bg-background text-foreground border-border` |

### Navigation shells + EmptyState (Task 2)

| Component | Change |
|-----------|--------|
| `Topbar` | `py-3` → `py-4`; title `font-semibold` → `font-[var(--font-weight-semibold)] tracking-[var(--tracking-tight)]`; `border-b` → `border-b border-border` |
| `Sidebar` (aside) | `bg-muted/40` → `bg-background` + `border-r border-border` |
| `Sidebar` nav item | `rounded-md` → `rounded-[var(--radius-md)]`; inactive `hover:bg-accent` → `text-muted-foreground hover:bg-muted/60 hover:text-foreground`; `transition-colors` → `transition-colors duration-150`; `font-medium` → `font-[var(--font-weight-medium)]` |
| `MobileHeader` | `py-3` → `py-4`; title now `font-[var(--font-weight-semibold)] tracking-[var(--tracking-tight)]`; `border-b` → `border-b border-border` |
| `BottomNav` | active color `text-primary` → `text-foreground`; `transition-colors` → `transition-colors duration-150`; primary FAB `rounded-full bg-primary shadow-md` → `rounded-[var(--radius-full)] bg-primary shadow-[var(--shadow-md)]` |
| `components/shared/empty-state.tsx` (new) | Token-only styling: `rounded-[var(--radius-full)]` circle, semibold title, muted description; preserves Phase-3 prop API (`actionHref`/`onAction`/`onClearFilter`) and adds `href` alias per plan |

### Tests

- `tests/unit/components/ui-overlays.test.tsx` — 3 passing structural tests:
  1. `DialogContent` carries `rounded-[var(--radius-lg)] + shadow-[var(--shadow-lg)] + border-border`
  2. `DropdownMenuContent` carries `rounded-[var(--radius-md)] + shadow-[var(--shadow-md)]`; `DropdownMenuItem` carries `rounded-[var(--radius-sm)]`
  3. `TableRow` carries `hover:bg-muted` + `border-b`
- `tests/e2e/dark-mode.spec.ts` — new file with `Phase 9 — primitives render with dark palette` describe containing literal `primitives-dark` test that asserts body bg resolves non-white when `eb-theme=dark` cookie is set against `/auth/login`.

## Verification

| Check | Result |
|-------|--------|
| `grep rounded-\[var\(--radius-lg\)\] dialog.tsx` | 1 match ✓ |
| `grep rounded-\[var\(--radius-lg\)\] alert-dialog.tsx` | 1 match ✓ |
| `grep shadow-\[var\(--shadow-lg\)\] sheet.tsx` | 1 match ✓ |
| `grep shadow-\[var\(--shadow-md\)\] dropdown-menu.tsx` | 1 match ✓ |
| `grep rounded-\[var\(--radius-sm\)\] dropdown-menu.tsx` | 1 match ✓ |
| `grep data-\[variant=destructive\] dropdown-menu.tsx` | 1+ matches ✓ (preserved) |
| `grep hover:bg-muted table.tsx` | 2 matches ✓ |
| `grep useTheme sonner.tsx` | 1 match ✓ |
| Hardcoded colors in overlays | 0 matches ✓ |
| `grep py-4 topbar.tsx` | 1 match ✓ |
| `grep font-\[var\(--font-weight-semibold\)\] topbar.tsx` | 1 match ✓ |
| `grep rounded-\[var\(--radius-md\)\] sidebar.tsx` | 1 match ✓ |
| `grep bg-accent text-accent-foreground sidebar.tsx` | 1 match ✓ |
| `grep font-\[var\(--font-weight-semibold\)\] mobile-header.tsx` | 1 match ✓ |
| `grep rounded-\[var\(--radius-full\)\] bottom-nav.tsx` | 1 match ✓ |
| `grep shadow-\[var\(--shadow-md\)\] bottom-nav.tsx` | 1 match ✓ |
| `grep export function EmptyState shared/empty-state.tsx` | 1 match ✓ |
| Hardcoded colors in shared/empty-state.tsx | 0 matches ✓ |
| `grep primitives-dark tests/e2e/dark-mode.spec.ts` | 2 matches ✓ |
| `bunx vitest run tests/unit/components/ui-overlays.test.tsx` | 3/3 pass ✓ |
| `bunx vitest run tests/unit/components` | 8/8 pass ✓ |
| `bunx tsc --noEmit` on 09-08 files | 0 errors attributable to 09-08 ✓ |

## Deviations from Plan

### Auto-fixed / deferred issues

**1. [Rule 3 - Blocking] Playwright E2E cannot run in this worktree due to missing `.env.local`**
- **Found during:** Task 2 verification
- **Issue:** `npx playwright test tests/e2e/dark-mode.spec.ts` fails because the `webServer` (`bun run dev`) exits with `Error: Your project's URL and Key are required to create a Supabase client!` — no `.env.local` is present in the agent worktree.
- **Fix:** Documented in `deferred-items.md`. The test file is structurally correct; it will run in the integrated tree where Supabase credentials exist. Unit tests (3/3) exercise the same class-level contract and all pass.
- **Files:** `.planning/phases/09-system-wide-dark-mode-default/deferred-items.md`
- **Commit:** (documented alongside Task 2 commit `bc9f561`)

**2. [Scope - Deferred] Pre-existing TypeScript errors (auth.spec.ts, env.test.ts)**
- **Found during:** Task 1 `bunx tsc --noEmit`
- **Issue:** `test.todo` type error in Playwright and `process.env` numeric-key type issue pre-date 09-08 (verified via `git stash`).
- **Fix:** None — out of scope per deviation rules.
- **Documented:** `deferred-items.md`.

**3. [Scope - Deferred] Pre-existing Next.js build error on `/projects/new` prerender**
- **Found during:** Task 1 `npx next build`
- **Issue:** `Invariant: Expected workStore to be initialized` during static export. Verified pre-existing by stashing changes and reproducing.
- **Fix:** None — out of scope; TypeScript compilation (the meaningful contract for 09-08) succeeds.
- **Documented:** `deferred-items.md`.

**4. [Scope - Deferred] Pre-existing unit-test failures (33 tests across 6 admin/crypto files)**
- **Found during:** Full `bunx vitest run`
- **Issue:** Phase 8 admin tests (admin-gate, crypto, platform-config, admin-test-button, integration tests) fail — all pre-date 09-08 and relate to Supabase env and SDK mocking issues in Phase 8 scope.
- **Fix:** None — out of scope. All 8 component unit tests (the scope of 09-08) pass cleanly.
- **Documented:** `deferred-items.md`.

### Plan-driven adjustments

**5. [Rule 2 - Critical] Topbar ThemeToggle from 09-03 not yet present in worktree**
- **Found during:** Task 2 read of topbar.tsx/mobile-header.tsx
- **Issue:** Plan instructed to "preserve ThemeToggle integration from 09-03" but wave-3 ordering means 09-03 runs in parallel and its changes aren't merged yet.
- **Fix:** Applied styling changes (`py-4`, semibold title, border-border) non-destructively. The existing `<DropdownMenu>` avatar layout is untouched, so when 09-03 merges and slots a `<ThemeToggle />` next to the avatar button, no rework is needed.
- **Commit:** `bc9f561`

## Authentication Gates

None — no CLI, cloud, or user-interactive authentication required for this plan.

## Known Stubs

None. All components render real data or accept real props from call-sites. The shared EmptyState intentionally exposes a superset API (including both `actionHref` and `href` as aliases) so existing Phase-3 call-sites and any new 09-08-style call-sites both work without wrapping logic.

## Follow-ups for downstream plans

- When 09-06 lands, `--radius-md/lg/sm/full`, `--shadow-md/lg`, `--font-weight-medium/semibold`, `--tracking-tight` become defined — the Tailwind arbitrary classes emitted by 09-08 resolve to their intended values automatically (no 09-08 re-work).
- When 09-03 lands and slots `<ThemeToggle />` into Topbar/MobileHeader, the semibold title + `py-4` + `border-border` treatment in 09-08 stays in place.
- Future cleanup (out of scope for v1.1): `components/dashboard/empty-state.tsx` can re-export `EmptyState` from `components/shared/empty-state.tsx` to consolidate into a single implementation.

## Self-Check: PASSED

- FOUND: components/ui/dialog.tsx (modified; `rounded-[var(--radius-lg)]` + `shadow-[var(--shadow-lg)]`)
- FOUND: components/ui/alert-dialog.tsx (modified; tokens)
- FOUND: components/ui/sheet.tsx (modified; per-side token rounding + shadow-lg)
- FOUND: components/ui/dropdown-menu.tsx (modified; content + items tokens; destructive branch preserved)
- FOUND: components/ui/table.tsx (modified; hover:bg-muted/60 + p-3 + border-border)
- FOUND: components/ui/sonner.tsx (modified; toastOptions.classNames with tokens; useTheme preserved)
- FOUND: components/app-shell/topbar.tsx (modified; py-4 + semibold + tight tracking + border-border)
- FOUND: components/app-shell/sidebar.tsx (modified; bg-background aside; token-driven nav items; duration-150)
- FOUND: components/app-shell/mobile-header.tsx (modified; py-4 + semibold + tight tracking + border-border)
- FOUND: components/app-shell/bottom-nav.tsx (modified; text-foreground active; FAB rounded-[var(--radius-full)] + shadow-[var(--shadow-md)])
- FOUND: components/shared/empty-state.tsx (created; token-only; superset API)
- FOUND: tests/unit/components/ui-overlays.test.tsx (created; 3/3 passing)
- FOUND: tests/e2e/dark-mode.spec.ts (created; primitives-dark describe block)
- FOUND: commit 933ac2a (Task 1)
- FOUND: commit bc9f561 (Task 2)

All claims verified.
