---
phase: quick-260718-w4k
plan: 01
status: complete
subsystem: workspace-ui
tags: [estimate, view-mode, print-preview, zoom, floating-pill, collapse]

# Dependency graph
requires:
  - phase: quick-260718-p3v
    provides: "The letter-sheet page mode this fits to the viewport"
provides:
  - "Page mode fit-to-viewport: CSS zoom scales the 816×1056 sheet so the whole page is visible (print-preview fit), clamped 0.45–1, resize-reactive"
  - "Collapsible floating pill: chevron after Send collapses to a single round Show-actions button"
affects: [estimate-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CSS zoom (not transform:scale) for fit-to-viewport scaling — zoom affects layout so no phantom scroll area, and mx-auto still centers the shrunken box"
    - "Measured fit clamped to the scroll container's top (el.closest('main')) so mid-scroll toggles don't measure negative offsets"

key-files:
  created:
    - .planning/quick/260718-w4k-full-page-fit-viewport-collapsible-pill/260718-w4k-PLAN.md
    - .planning/quick/260718-w4k-full-page-fit-viewport-collapsible-pill/260718-w4k-SUMMARY.md
  modified:
    - components/workspace/estimate/estimate-editor.tsx
    - components/workspace/estimate/estimate-floating-actions.tsx
    - tests/unit/components/estimate-floating-actions.test.tsx

key-decisions:
  - "Fit math: zoom = clamp((innerHeight − max(sheetTop, mainTop) − 84px pill clearance) / 1056, 0.45, 1); recomputed on entering page mode + window resize; reset to 1 on leaving"
  - "Zoom applied to the existing page wrapper (mx-auto max-w-[816px]) so IssuedInvoicesPanel + Generate-invoice row scale with the sheet (m2q's nothing-pokes-past-the-edge invariant)"
  - "Pill collapse is session-local useState (no persistence) — a fresh visit should always show the actions; chevron placed AFTER Send so the gear-leftmost order tests stay valid"
  - "'Menubar' interpreted as the floating pill: the left nav sidebar is ALREADY collapsible (sidebar.tsx footer chevron, localStorage sidebar_collapsed_desktop) — noted to user instead of duplicating"

patterns-established: []

requirements-completed: []

# Metrics
duration: ~10min
completed: 2026-07-18
---

# Quick 260718-w4k: Full page fit-to-viewport + collapsible pill Summary

**'Full page' now shows the ENTIRE letter sheet in the visible space — scaled like a real print preview instead of a full-size page you must scroll — and the floating action pill collapses to a small chevron button so it stops covering the document.**

## Accomplishments

- `estimate-editor.tsx` — `LETTER_PAGE_HEIGHT`/`PAGE_FIT_CLEARANCE` consts, `pageWrapRef` + `pageZoom` state, measurement effect (page mode only, resize listener, cleanup); wrapper gets `style={{ zoom }}` when < 1.
- `estimate-floating-actions.tsx` — `collapsed` state; expanded pill gains a ChevronDown "Hide actions" ghost button after Send; collapsed pill is a single ChevronUp "Show actions" round button in the same fixed position.
- 3 new tests (default expanded + chevron after Send; collapse hides all actions; expand restores them).

## Task Commits

1. **Task 1: fit zoom + collapsible pill + tests** — `5dba788a` (fix)

## Verification (actual observed output)

| Check | Expected | Actual |
| --- | --- | --- |
| `npx tsc --noEmit -p tsconfig.ci.json` | 0 errors | exit 0, no output |
| `npx vitest run` (pill + page-view files) | 17 pass | **17 passed (17)** |
| Width mode | no zoom style | style only applied when `viewMode === 'page' && pageZoom < 1` |
| Live visual check | whole sheet visible in page mode | Blocked (standing k3f/h4l/p3v blockers: auth-gated page + second `next dev` dies on shared `.next` while the other chat's server runs). User's browser gets it via that server's HMR. |

## Deviations from Plan

None.

## Next Phase Readiness

- Commits LOCAL on `dev` (standing directive: do not push).
- jsdom can't exercise the zoom measurement (no real layout); if a regression appears, verify fit math in a real browser.
