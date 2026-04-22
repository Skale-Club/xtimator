---
phase: 10-global-brand-tokens
plan: "01"
subsystem: ui
tags: [css-variables, tailwind, design-tokens, brand-identity, shadcn-ui]

# Dependency graph
requires:
  - phase: 08-platform-admin-panel-for-centralized-api-integrations
    provides: var(--platform-primary) runtime override path in globals.css and layout files
  - phase: 09-system-wide-dark-mode-default
    provides: CSS scope structure (.dark, [data-theme=...]) consumed by token changes
provides:
  - BRAND-01: #406EF1 (224 86% 60%) as --primary and --ring in :root and .dark
  - BRAND-02: #406EF1 as default --platform-primary fallback in admin layout and globals.css admin-dark scope
  - BRAND-03: #406EF1 as default --platform-primary fallback in auth layout and globals.css dark-auth scope
  - Automated regression test suite (10 tests) locking all three brand requirements
affects: [11-landing-page, any phase touching button/link/focus-ring colors]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS token update: edit globals.css scopes (:root, .dark, [data-theme=...]) to change brand color globally — no component edits needed since all components consume hsl(var(--primary))"
    - "Layout fallback: layout.tsx files hold var(--platform-primary, TRIPLET) where TRIPLET must match :root --primary value so unbranded instances use the same color"

key-files:
  created:
    - tests/unit/globals-brand-tokens.test.ts
  modified:
    - app/globals.css
    - app/(auth)/layout.tsx
    - app/admin/layout.tsx

key-decisions:
  - "224 86% 60% HSL triplet locked as global brand primary (#406EF1) — used in :root, .dark, [data-theme=light], and as the var(--platform-primary, ...) fallback in both scoped dark themes"
  - "BRAND-01 dark foreground changed from 240 5.9% 10% to 0 0% 100% (pure white) to ensure contrast on blue primary background"
  - "Pre-existing missing-key-ux.test.ts failure (@react-pdf/renderer not installed) is out of scope and deferred"

patterns-established:
  - "Brand token test pattern: readFileSync-based snapshot tests that count regex matches across CSS scopes and assert layout fallback string literals — no mocking, pure file reads"

requirements-completed: [BRAND-01, BRAND-02, BRAND-03]

# Metrics
duration: 8min
completed: 2026-04-22
---

# Phase 10 Plan 01: Global Brand Tokens Summary

**#406EF1 set as the universal primary color via 9 CSS token value changes across 4 CSS scopes and 2 layout fallback strings, with 10 automated regression tests locking all three BRAND requirements**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-22T12:41:00Z
- **Completed:** 2026-04-22T12:49:23Z
- **Tasks:** 2 (TDD: RED + GREEN)
- **Files modified:** 4 (1 created, 3 edited)

## Accomplishments

- Established `224 86% 60%` (HSL for #406EF1) as the brand primary across all CSS scopes: `:root`, `.dark`, `[data-theme="admin-dark"]`, `[data-theme="dark-auth"]`, `[data-theme="light"]`
- Updated `--primary-foreground` in `.dark` from `240 5.9% 10%` (dark) to `0 0% 100%` (white) for proper contrast on the blue primary
- Updated `var(--platform-primary, ...)` fallback to `224 86% 60%` in both `app/(auth)/layout.tsx` and `app/admin/layout.tsx` so unbranded instances default to the brand blue
- Created 10-test regression suite that locks BRAND-01, BRAND-02, BRAND-03 requirements against future drift
- Verified runtime admin branding override path (`var(--platform-primary, ...)`) is fully preserved

## Task Commits

Each task was committed atomically:

1. **Task 1: Write failing test scaffold (RED)** - `81a4c5f` (test)
2. **Task 2: Apply brand token values (GREEN)** - `6aa94eb` (feat)

## Files Created/Modified

- `tests/unit/globals-brand-tokens.test.ts` - 10-test file-snapshot suite for BRAND-01/02/03 requirements
- `app/globals.css` - 9 token value changes across 4 CSS scopes (:root, .dark, scoped dark themes, [data-theme=light])
- `app/(auth)/layout.tsx` - Fallback triplet updated from `220 91% 60%` to `224 86% 60%`
- `app/admin/layout.tsx` - Fallback triplet updated from `220 91% 60%` to `224 86% 60%`

## Decisions Made

- `224 86% 60%` (HSL equivalent of #406EF1) adopted as the canonical brand primary triplet — must be kept in sync across globals.css scopes and layout fallback strings
- `.dark --primary-foreground` changed to `0 0% 100%` (pure white) for correct contrast on the brand blue primary background
- `:root --primary-foreground` left at `0 0% 98%` (near-white) — plan explicitly required leaving it unchanged (4.36:1 contrast is acceptable)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

- `tests/integration/missing-key-ux.test.ts` fails due to `@react-pdf/renderer` not being installed. This is a pre-existing issue (confirmed by running test suite before applying changes). Deferred — out of scope for this plan.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- Brand token baseline established: Phase 11 (landing page) and all subsequent phases can build on `hsl(var(--primary))` resolving to #406EF1 across light, dark, and scoped themes
- Runtime admin branding override path preserved: operators can still override `--platform-primary` from the admin panel at any time
- All 10 regression tests green: brand token values are protected against accidental resets

---
*Phase: 10-global-brand-tokens*
*Completed: 2026-04-22*
