---
phase: quick-260718-p3v
plan: 01
status: complete
subsystem: workspace-ui
tags: [estimate, view-mode, print-preview, letter-sheet, page-view]

# Dependency graph
requires:
  - phase: quick-260718-m2q
    provides: "viewMode state + toggle + 816px width wrapper this builds on"
provides:
  - "EstimateDocument `pageView?: boolean` prop — print-preview sheet styling for the root container"
  - "'Full page' mode now looks like the printed page: square corners, hairline border, paper shadow, US-Letter min-height"
affects: [estimate-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional boolean prop defaulting to current behavior (pageView=false → byte-identical classes) — same backward-compat approach as m2q's optional pill props"

key-files:
  created:
    - .planning/quick/260718-p3v-full-page-view-print-sheet-styling/260718-p3v-PLAN.md
    - .planning/quick/260718-p3v-full-page-view-print-sheet-styling/260718-p3v-SUMMARY.md
    - tests/unit/estimate/document-page-view.test.tsx
  modified:
    - components/workspace/estimate/estimate-document.tsx
    - components/workspace/estimate/estimate-editor.tsx

key-decisions:
  - "Sheet styling lives on EstimateDocument's root (className + inline borderColor are hardcoded there), driven by a `pageView` prop from the editor's existing viewMode state — not by wrapper CSS, which can't remove the card's own chrome"
  - "1056px min-height = 11in @96dpi, pairing m2q's 816px width → true US-Letter proportions; short estimates show a full empty page exactly like a print preview"
  - "Page-mode border is a hairline #d4d4d8 (zinc-300) instead of the 4px #3f3f46 card frame; shadow-2xl reads as a floating paper sheet"
  - "Read-only versions inherit the sheet look through the same editor path (consistent with m2q's persisted-preference decision)"

patterns-established: []

requirements-completed: []

# Metrics
duration: ~10min
completed: 2026-07-18
---

# Quick 260718-p3v: Full page mode renders as print-preview letter sheet Summary

**'Full page' now shows the estimate as a real print-preview page — square-cornered white US-Letter sheet with a hairline border, paper shadow, and full-page min-height — instead of the rounded app card merely squeezed to 816px. User report: "the full page needs to show the page like you see it when you want to print."**

## Accomplishments

- `estimate-document.tsx` — new optional `pageView` prop (default false); root container switches `rounded-3xl border-4 shadow-lg` + `#3f3f46` border → `min-h-[1056px] border shadow-2xl` + `#d4d4d8` when set. Everything inside (forced light paper tokens, brand bar, content) unchanged.
- `estimate-editor.tsx` — passes `pageView={viewMode === 'page'}`, so the persisted localStorage preference drives both the 816px width wrapper (m2q) and the sheet chrome (this task).
- 3 new tests pinning the exact root classes + inline border color in default, explicit-false, and pageView renders.

## Task Commits

1. **Task 1: pageView prop + sheet styling + wiring + tests** — `e3741144` (fix)

## Verification (actual observed output)

| Check | Expected | Actual |
| --- | --- | --- |
| `npx tsc --noEmit -p tsconfig.ci.json` | 0 errors | exit 0, no output |
| `npx vitest run tests/unit/estimate/ tests/unit/components/estimate-floating-actions.test.tsx` | all pass | **312 passed** (initial run; only the 3 new tests' hex-vs-rgb assertions failed, fixed to jsdom's `rgb()` form) |
| `npx vitest run tests/unit/estimate/document-page-view.test.tsx` | 3 pass | **3 passed (3)** |
| Default render | byte-identical to before | pageView=false → same classes `rounded-3xl border-4 shadow-lg overflow-hidden`, borderColor rgb(63,63,70) — asserted in tests |
| Live visual check | sheet look in page mode | Blocked: second `next dev` dies on the shared `.next` dir while the other chat's server runs (known h4l gotcha), and the editor is auth-gated for agent browsers (m2q). User's own browser gets it via the running server's HMR. |

## Deviations from Plan

- Test assertions use jsdom-normalized `rgb()` values instead of hex (jsdom normalizes inline colors); noted inline with the hex in comments.

## Next Phase Readiness

- Commits LOCAL on `dev` (standing directive: do not push).
- Possible follow-up if the user wants a fuller print-preview: hide edit-only affordances (add-item rows, drag handles) in page mode, and/or a muted backdrop behind the sheet.
