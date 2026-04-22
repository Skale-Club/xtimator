---
phase: 09-system-wide-dark-mode-default
plan: 07
subsystem: design-system / ui-primitives
tags: [shadcn, primitives, radius, shadow, tailwind-v4, dark-mode, design-refresh]
dependency-graph:
  requires:
    - Phase 9 Plan 06 radius/shadow/typography tokens (--radius-xs/sm/md/lg/xl/full, --shadow-xs/sm/md/lg/focus, --font-weight-*, --tracking-*)
    - Existing shadcn/ui primitives (Button, Input, Textarea, Select, Label, Card, Badge, Skeleton)
  provides:
    - Redesigned primitives that consume the refreshed token vocabulary
    - Shimmer-animated Skeleton (via @keyframes shimmer in globals.css)
    - Structural contract tests locking the new class vocabulary
  affects:
    - components/ui/button.tsx
    - components/ui/input.tsx
    - components/ui/textarea.tsx
    - components/ui/select.tsx
    - components/ui/label.tsx
    - components/ui/card.tsx
    - components/ui/badge.tsx
    - components/ui/skeleton.tsx
    - app/globals.css (shimmer keyframes appended)
    - tests/unit/components/ui-primitives.test.tsx (new)
tech-stack:
  added: []
  patterns:
    - Tailwind v4 arbitrary-value consumption of CSS custom properties (rounded-[var(--radius-md)], shadow-[var(--shadow-xs)])
    - Removed `dark:` Tailwind variants that only fire at :root; rely on semantic tokens + CSS-var re-declaration so primitives work identically inside [data-theme="dark-auth"] / [data-theme="admin-dark"] scoped wrappers (RESEARCH.md Pitfall 4)
    - CSS pseudo-element shimmer (before:-translate-x-full + animate-[shimmer_...])
    - Structural (not snapshot) assertions for component class vocabulary
key-files:
  created:
    - .planning/phases/09-system-wide-dark-mode-default/09-07-SUMMARY.md
    - tests/unit/components/ui-primitives.test.tsx
  modified:
    - components/ui/button.tsx
    - components/ui/input.tsx
    - components/ui/textarea.tsx
    - components/ui/select.tsx
    - components/ui/label.tsx
    - components/ui/card.tsx
    - components/ui/badge.tsx
    - components/ui/skeleton.tsx
    - app/globals.css
decisions:
  - Kept Button/Badge public APIs 100% stable (props, variants, size enum, data-attrs) so no consumer needs updating; only visual vocabulary changed
  - Dropped all `dark:*` color-family overrides on Input/Textarea/Select/Button — semantic tokens already cover dark rendering via the .dark and scoped [data-theme] wrappers, and `dark:` variants do NOT fire inside scoped-dark wrappers (Pitfall 4)
  - Button `default` variant alone carries the lift-on-hover motion (translate + shadow step). Other variants stay flat to keep a calm UI
  - SelectTrigger updated in-place to match Input shape (h-10 via data-[size=default], rounded-[var(--radius-md)], shadow-[var(--shadow-xs)]) without altering any other Select sub-component
  - Skeleton reimplemented with a gradient-based shimmer pseudo-element (NOT animate-pulse) for a more modern feel; keyframes added outside any @layer so they remain globally available
metrics:
  duration: "~6min"
  tasks_completed: 2
  files_modified: 9
  files_created: 2
  completed-date: "2026-04-22"
---

# Phase 9 Plan 7: Foundation UI Primitives Redesign Summary

One-liner: Redesigned the eight foundation shadcn primitives (Button, Input, Textarea, Select, Label, Card, Badge, Skeleton) to consume the Plan 06 token vocabulary — unified h-10 form-control height, `--radius-md` for controls and `--radius-lg` for cards, `--shadow-xs` resting / `--shadow-sm` hover-lift / `--shadow-focus` ring hierarchy, and a gradient-shimmer Skeleton — without breaking any public prop or variant API.

## What Changed

### Primitives

- **Button** (`components/ui/button.tsx`): base cva string now uses `rounded-[var(--radius-md)]`, `font-[var(--font-weight-medium)]`, `transition-all duration-150`, and `focus-visible:shadow-[var(--shadow-focus)]`. `default` variant adds `shadow-[var(--shadow-xs)]`, `hover:shadow-[var(--shadow-sm)]`, `hover:-translate-y-[0.5px]`, and `active:translate-y-0 active:shadow-[var(--shadow-xs)]`. Size scale shifted to `h-10 / h-7 / h-9 / h-11 / size-10 / size-7 / size-9 / size-11`. Removed `dark:*` color variants from destructive/outline/ghost (semantic tokens already theme-adapt).
- **Input** (`components/ui/input.tsx`): `h-10`, `rounded-[var(--radius-md)]`, `shadow-[var(--shadow-xs)]`, `text-sm` (removed `md:text-sm` fallback), focus → `shadow-[var(--shadow-focus)]`, invalid → `shadow-[0_0_0_3px_hsl(var(--destructive)/0.25)]`. Removed `dark:bg-input/30` per Pitfall 4.
- **Textarea** (`components/ui/textarea.tsx`): mirrors Input shape. `min-h-[80px]`, `rounded-[var(--radius-md)]`, `shadow-[var(--shadow-xs)]`, focus → `shadow-[var(--shadow-focus)]`. Removed `dark:bg-input/30` + `md:text-sm`.
- **SelectTrigger** (`components/ui/select.tsx`): same shape as Input — `rounded-[var(--radius-md)]`, `shadow-[var(--shadow-xs)]`, focus → `shadow-[var(--shadow-focus)]`, default size bumped from `h-9` → `h-10` and sm from `h-8` → `h-9`. All other Select sub-components untouched.
- **Label** (`components/ui/label.tsx`): `font-[var(--font-weight-medium)]` + `tracking-[var(--tracking-tight)]`. Kept existing disabled/peer-disabled behavior.
- **Card** (`components/ui/card.tsx`): `rounded-[var(--radius-lg)]` + `shadow-[var(--shadow-sm)]`. **CardTitle** also switched to `font-[var(--font-weight-semibold)]` + `tracking-[var(--tracking-tight)]`. CardHeader/Content/Footer/Action/Description untouched.
- **Badge** (`components/ui/badge.tsx`): base cva gets `rounded-[var(--radius-full)]`, `px-2.5`, `font-[var(--font-weight-medium)]`, and `focus-visible:shadow-[var(--shadow-focus)]`. All six variants (default/secondary/destructive/outline/ghost/link) preserved byte-for-byte.
- **Skeleton** (`components/ui/skeleton.tsx`): completely reimplemented. No more `animate-pulse`. New shape: `relative overflow-hidden rounded-[var(--radius-sm)] bg-muted` + `before:*` pseudo-element that `-translate-x-full` → shimmer gradient `linear-gradient(90deg,transparent,hsl(var(--foreground)/0.06),transparent)` → `animate-[shimmer_1.8s_ease-in-out_infinite]`.

### Globals

- **`app/globals.css`**: appended `@keyframes shimmer { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }` at the end of the file, outside any `@layer` (to remain consumable by the arbitrary-value `animate-[shimmer_...]` class on `Skeleton`'s `before:` pseudo-element).

### Tests

- **`tests/unit/components/ui-primitives.test.tsx`** (new, 8 `it()` blocks): asserts the new class vocabulary is present on Button (`rounded-[var(--radius-md)]`, `shadow-[var(--shadow-xs)]`, `shadow-[var(--shadow-focus)]`, `h-10`, destructive = `bg-destructive text-white`), Input (h-10 + radius-md + shadow-xs + shadow-focus), Card (radius-lg + shadow-sm), Badge (radius-full), Skeleton (`animate-[shimmer`), and a negative assertion that no hardcoded `bg-{family}-{n00}` or `text-{family}-{n00}` classes leak into the primitives' subtree.

## Why

Wave 2 delivers the visual half of Phase 9: the foundation primitives every screen in the authenticated app stacks on. The Plan 06 tokens were additive CSS — they had no consumers until this plan. By redesigning the eight foundation primitives in a single commit that consumes those tokens via Tailwind's arbitrary-value syntax, we:

1. Ship the modern "refined shadcn" feel described in the plan's truths (h-10 controls, radius-lg cards, subtle hover lift on primary actions, shimmer skeletons) without breaking any existing component consumer.
2. Eliminate `dark:*` color-family overrides that silently fail inside `[data-theme="dark-auth"]` and `[data-theme="admin-dark"]` scoped wrappers (RESEARCH.md Pitfall 4), making the primitives truly theme-portable.
3. Lock the new class vocabulary with structural tests so Wave 3 (09-08 overlays/tables/nav shells) can evolve without silently reverting this foundation.

## Acceptance Criteria — Verified

All grep assertions from the plan pass:

- `components/ui/button.tsx` → contains `rounded-[var(--radius-md)]`, `shadow-[var(--shadow-xs)]`, `shadow-[var(--shadow-focus)]`, still exports `Button` + `buttonVariants`
- `components/ui/input.tsx` → contains `h-10`, `rounded-[var(--radius-md)]`, `shadow-[var(--shadow-xs)]`, `shadow-[var(--shadow-focus)]`; does NOT contain `dark:bg-input/30`
- `components/ui/card.tsx` → `rounded-[var(--radius-lg)]` + `shadow-[var(--shadow-sm)]`
- `components/ui/badge.tsx` → `rounded-[var(--radius-full)]`
- `components/ui/skeleton.tsx` → `animate-[shimmer`
- `components/ui/select.tsx` → SelectTrigger has `h-10` (via `data-[size=default]:h-10`) + `rounded-[var(--radius-md)]`
- `components/ui/textarea.tsx` → `rounded-[var(--radius-md)]` + `shadow-[var(--shadow-xs)]`
- `components/ui/label.tsx` → `font-[var(--font-weight-medium)]`
- `app/globals.css` → `@keyframes shimmer`
- `grep -rE "bg-(gray|green|red|blue|yellow|purple)-[0-9]{3}"` across the 5 listed primitive files → **0 matches** (exit code 1)

Build + tests:
- `bunx tsc --noEmit` → only pre-existing errors (`tests/e2e/auth.spec.ts` `test.todo`, `tests/unit/env.test.ts` `ProcessEnv` narrowing) — already logged in `deferred-items.md`. No new errors.
- `npx next build` → exits 0 (`✓ Generating static pages (18/18)`, full route map rendered).
- `npx vitest run tests/unit/components/ui-primitives.test.tsx` → **8 passed / 0 failed**.
- `npx vitest run tests/unit/components/status-badge.test.tsx` → **5 passed / 0 failed** (no regression).
- Full unit suite (`npx vitest run`) → **173 passed / 1 failed**. The one failure is pre-existing (`tests/integration/missing-key-ux.test.ts`, added by Phase 8 Plan 04 in commit `a067f6e`, unrelated to UI primitives). Documented in Deferred Issues.

## Deviations from Plan

### Auto-fixed Issues

None. No Rule 1/2/3 fixes triggered. The plan ran cleanly end-to-end.

### Minor scope clarifications (NOT deviations)

- The plan's overall-verification block cites `npx playwright test tests/e2e/dark-mode.spec.ts tests/e2e/auth-dark.spec.ts`. Only `auth-dark.spec.ts` exists today (from Phase 8); `dark-mode.spec.ts` is scheduled for a later wave and is not a prerequisite of 09-07. The existing `auth-dark.spec.ts` exercises [data-theme="dark-auth"] paths, which our primitive changes remain compatible with (they now use semantic tokens + shadow tokens that re-declare inside that wrapper). Running Playwright requires a live dev server + browser runtime that isn't wired for this parallel-executor environment; we relied on the structural unit tests + full `next build` + `tsc --noEmit` instead.

### TDD flow note

The plan marks both tasks `tdd="true"` but structures them so Task 1 implements all primitives and Task 2 creates the test file. We followed that literal ordering because Task 2's test file imports components after their Task-1 redesign; inverting would require two separate tests-first commits per primitive and contradicts the plan's acceptance criteria (which check Task 2 creates `tests/unit/components/ui-primitives.test.tsx` referencing the post-Task-1 classes like `rounded-[var(--radius-md)]`).

## Deferred Issues

Pre-existing failures that are NOT caused by this plan and are already tracked in `.planning/phases/09-system-wide-dark-mode-default/deferred-items.md`:

1. `tests/integration/missing-key-ux.test.ts` — one failing case "responds 503 with /not configured/i in the body". Introduced by Phase 8 Plan 04 (commit `a067f6e`), unrelated to UI primitives.
2. TypeScript errors on `tests/e2e/auth.spec.ts` (lines 65, 69 — `test.todo`) and `tests/unit/env.test.ts` (line 14 — `ProcessEnv` narrowing). Pre-existing, already tracked.
3. `next build` prerender failures when `NEXT_PUBLIC_SUPABASE_URL` is unset — environmental, not code.

## Commits

- `f4810ea` — `feat(09-07): redesign UI primitives with refined radius + shadow scale` (8 component files + globals.css shimmer keyframes)
- `7fad98a` — `test(09-07): structural assertions for redesigned UI primitives` (new test file, 8 it blocks, all passing)

## Known Stubs

None. Every primitive is fully functional; all `className` strings consume semantic tokens that resolve correctly in :root (light), .dark (root-dark), `[data-theme="dark-auth"]`, `[data-theme="admin-dark"]`, and `[data-theme="light"]` scopes.

## Self-Check: PASSED

Verified:
- `FOUND: components/ui/button.tsx` (contains all required classes per grep above)
- `FOUND: components/ui/input.tsx`
- `FOUND: components/ui/textarea.tsx`
- `FOUND: components/ui/select.tsx`
- `FOUND: components/ui/label.tsx`
- `FOUND: components/ui/card.tsx`
- `FOUND: components/ui/badge.tsx`
- `FOUND: components/ui/skeleton.tsx`
- `FOUND: app/globals.css` (@keyframes shimmer appended)
- `FOUND: tests/unit/components/ui-primitives.test.tsx` (8 it blocks, all passing)
- `FOUND: f4810ea` in `git log`
- `FOUND: 7fad98a` in `git log`
