---
phase: quick-260718-m2q
plan: 01
status: complete
subsystem: workspace-ui
tags: [estimate, floating-actions, view-mode, localStorage, letter-width]

# Dependency graph
requires:
  - phase: quick-260718-k3f
    provides: "The viewport-centered fixed pill this toggle lives on"
provides:
  - "EstimateViewMode ('width' | 'page') type + toggle button on the floating pill"
  - "'Full page' view: document + invoice surfaces centered at max-w-[816px] (US Letter @96dpi)"
  - "Preference persisted in localStorage key 'estimate-view-mode' (effect-initialized, hydration-safe)"
affects: [estimate-page]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional-prop-gated pill affordance (render only when viewMode AND onViewModeChange provided) — same backward-compat pattern as onOpenSettings"
    - "Toggle labeled with the TARGET mode (action semantics), not the current mode"

key-files:
  created:
    - .planning/quick/260718-m2q-estimate-view-mode-full-page-toggle/260718-m2q-PLAN.md
    - .planning/quick/260718-m2q-estimate-view-mode-full-page-toggle/260718-m2q-SUMMARY.md
  modified:
    - components/workspace/estimate/estimate-floating-actions.tsx
    - components/workspace/estimate/estimate-editor.tsx
    - tests/unit/components/estimate-floating-actions.test.tsx

key-decisions:
  - "State lives in EstimateEditor (pill's only consumer), not context — same ownership as settingsOpen"
  - "localStorage read happens in a mount effect, NOT the useState initializer — reading storage during render desyncs SSR hydration"
  - "816px = 8.5in US Letter at 96dpi; the wrapper also encloses IssuedInvoicesPanel + GenerateInvoiceDialog row so nothing pokes past the page edge in page mode"
  - "Read-only versions have no pill (isCurrent gate) but still honor the persisted width preference via the wrapper — consistent, no orphan control"
  - "Labels untranslated English ('Full page'/'Full width'), matching the pill's existing 'Photos'/'Send'"

patterns-established: []

requirements-completed: []

# Metrics
duration: ~15min
completed: 2026-07-18
---

# Quick 260718-m2q: Full width / Full page view mode toggle Summary

**The estimate pill gained a view-mode toggle: 'Full page' renders the document as a centered letter-width page (like the PDF), 'Full width' (default) fills the column as before. The choice persists across reloads.**

## Accomplishments

- `estimate-floating-actions.tsx` — exported `EstimateViewMode`, added `viewMode`/`onViewModeChange` optional props, toggle button between the gear and linkClientSlot. Button shows the mode it switches TO (`File` icon + "Full page" in width mode; `StretchHorizontal` icon + "Full width" in page mode).
- `estimate-editor.tsx` — `viewMode` state + `VIEW_MODE_KEY` localStorage persistence (mount-effect init, try/catch for private mode); the document, IssuedInvoicesPanel, and GenerateInvoiceDialog row are wrapped in a conditional `mx-auto w-full max-w-[816px]` container.
- 5 new tests (target-label in both modes, hidden when props omitted, click emits the other mode, gear-leftmost order preserved).

## Task Commits

1. **Task 1+2: toggle + wrapper + tests** — `2f00a6e4` (feat)

## Verification (actual observed output)

| Check | Expected | Actual |
| --- | --- | --- |
| `npx tsc --noEmit -p tsconfig.ci.json` | 0 errors | exit 0, no output |
| `npx vitest run tests/unit/components/estimate-floating-actions.test.tsx` | 11 pass (6 old + 5 new) | **11 passed (11)** |
| Default render | unchanged vs before | viewMode 'width' → wrapper stays `space-y-3` only; document markup untouched |
| Live visual check | toggle visible, page mode centers | Blocked on auth in agent-reachable browsers (same as k3f); user is logged in in their own browser where HMR delivers the change. |

## Deviations from Plan

One micro-deviation: the wrapper div carries `space-y-3` in both modes (the outer div previously provided spacing for these children; moving them into a nested div required re-applying it). No visual change in width mode.

## Next Phase Readiness

- Commits LOCAL on `dev` (user directive: keep local, do not push).
