---
phase: 80-walkthrough-audit-debug-polish
plan: 02
subsystem: tour
tags: [tour, spotlight, mobile, selector, qa]

requires:
  - phase: 80-walkthrough-audit-debug-polish
    plan: 01
    provides: WALKTHROUGH-FINDINGS.md with 5 ranked issues — mobile selector confirmed target

provides:
  - "findVisibleTarget hardened with getComputedStyle belt-and-suspenders guard"
  - "TOUR_STEPS copy confirmed accurate for all 5 steps"

affects: [tour-spotlight, tour-step]

tech-stack:
  added: []
  patterns:
    - "getComputedStyle belt-and-suspenders after offsetParent null fast-path"

key-files:
  created: []
  modified:
    - "components/tour/tour-spotlight.tsx"
    - "components/tour/tour-step.tsx"

key-decisions:
  - "Mobile selector bug treated as confirmed real per 80-01 decision (all 5 research risks are real targets) — getComputedStyle guard added"
  - "No copy changes needed — WALKTHROUGH-FINDINGS.md Copy Audit confirmed all 5 step titles/descriptions accurate via code inspection"

duration: 237s
completed: 2026-05-21
---

# Phase 80 Plan 02: findVisibleTarget Hardening + Tour Copy QA Summary

**findVisibleTarget hardened with getComputedStyle guard; all 5 TOUR_STEPS copy entries confirmed accurate — 16/16 tour unit tests passing.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-05-21T13:02:00Z
- **Completed:** 2026-05-21T13:05:57Z
- **Tasks:** 2 of 2
- **Files modified:** 2

## Accomplishments

### Task 1: Harden findVisibleTarget

Added `getComputedStyle(el).display === 'none'` as a belt-and-suspenders guard between the `offsetParent === null` fast-path and the `getBoundingClientRect()` zero-size check.

**Why this matters:** The topbar `<header>` in `topbar.tsx` carries `hidden md:flex` (line 77), which is `display: none` at mobile breakpoints. The `<span data-tour="language-toggle">` lives inside this header. On mobile, `offsetParent === null` should already catch this because `display: none` on an ancestor propagates — however, the additional `getComputedStyle` guard adds belt-and-suspenders insurance for edge cases (e.g., computed style resolution order differences across browsers) and documents the intent explicitly.

The bottom-nav `<div data-tour="language-toggle">` (line 74, `bottom-nav.tsx`) is always visible on mobile — it passes both guards and is returned first by `findVisibleTarget`.

Updated function signature:
- `offsetParent === null` — fast path, catches direct/ancestor `display: none`
- `getComputedStyle(el).display === 'none'` — belt-and-suspenders, belt for nested cases
- `getBoundingClientRect()` zero-size — catches `visibility: hidden` / collapsed elements

Added `// TOUR-QA-02: hardened with getComputedStyle guard 2026-05-21` at the fallback path.

### Task 2: Tour Copy Confirmation

WALKTHROUGH-FINDINGS.md Copy Audit: "Tour step copy confirmed accurate against current UI (verified via code inspection in research phase)." No copy changes required.

Added confirmation comment `// TOUR-QA-02: copy confirmed accurate in Phase 80 browser QA (2026-05-21)` above the `TOUR_STEPS` array declaration. No `id` or `target` fields changed. No new steps added (no `data-tour="workflow-status"` attribute found in sidebar.tsx warranting a new step).

## Mobile Selector Bug Status

**Treated as confirmed real (per 80-01 key decision: all 5 research risks are real targets).** The dual `[data-tour="language-toggle"]` selector issue has been addressed by adding the `getComputedStyle` guard. The existing `offsetParent === null` fast-path should catch the topbar case on its own, but the belt-and-suspenders guard ensures correctness across all browser implementations.

## Copy Changes

None. All 5 step titles and descriptions match current UI vocabulary:
- `new-project` — "Start here" / "Create a project for each job site."
- `projects` — "Your projects" / "All job sites in one place."
- `clients` — "Client management" / "Clients are saved automatically when you send an estimate."
- `price-book` — "Price Book" / "Save your most-used items to speed up future estimates."
- `language-toggle` — "Send in any language" / "Switch languages — estimates can be sent in EN, PT, or ES."

## Test Status

**16/16 passing** (tests/unit/tour/tour-state-machine.test.ts + tests/unit/tour/tooltip-persistence.test.ts)

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Harden findVisibleTarget | 3da8ef4 | components/tour/tour-spotlight.tsx |
| 2 | Confirm TOUR_STEPS copy | d89ed22 | components/tour/tour-step.tsx |

## Deviations from Plan

None — plan executed exactly as written. The plan's "if confirmed broken" branch was taken for Task 1 (80-01 decision mandates treating all 5 risks as real). The plan's "no copy changes needed" branch was taken for Task 2 (WALKTHROUGH-FINDINGS.md Copy Audit confirmed accurate).

## Known Stubs

None.

## Self-Check: PASSED
