---
phase: 74-post-onboarding-app-feature-tour
plan: 02
subsystem: ui
tags: [tour, spotlight, overlay, localStorage, i18n, rAF, data-attributes]

# Dependency graph
requires:
  - phase: 74-01
    provides: TourProvider context, useTour hook, showSpotlight state, isSpotlightPending

provides:
  - TourSpotlight: 5-step overlay using box-shadow dim + rAF-tracked BoundingClientRect tooltip
  - TOUR_STEPS config: 5-element array with id, target, title, description
  - data-tour attributes on sidebar, topbar, and bottom-nav targets
  - Page-refresh resilience: TourProvider restores spotlight if tour_spotlight_pending set on reload

affects:
  - 74-03 (contextual tooltips — reads isTourCompleted; spotlight targets already available)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "rAF loop for spotlight position tracking — keeps BoundingClientRect in sync with scroll/resize without ResizeObserver complexity"
    - "box-shadow: 0 0 0 9999px rgba(0,0,0,0.65) spotlight — works on iOS Safari and Android Chrome without canvas/SVG"
    - "TOUR_TARGET Record<href, data-tour> collocated in each nav component — lookup at render, not at mount"
    - "data-tour attributes on DOM elements — CSS selector bridge between TOUR_STEPS config and DOM targeting"

key-files:
  created:
    - components/tour/tour-step.tsx
    - components/tour/tour-spotlight.tsx
  modified:
    - components/app-shell/sidebar.tsx
    - components/app-shell/topbar.tsx
    - components/app-shell/bottom-nav.tsx
    - app/(app)/layout.tsx
    - components/tour/tour-provider.tsx

key-decisions:
  - "TOUR_TARGET Record in each nav component (not imported from tour-step.tsx) — avoids coupling nav components to tour internals; map is trivial to duplicate"
  - "rAF loop (not IntersectionObserver or ResizeObserver) — simpler cross-browser support, sub-frame latency for smooth transition"
  - "window.innerWidth guarded with typeof check — prevents SSR crash since TourSpotlight is use client but JSX still evaluated in RSC tree"
  - "isSpotlightPending destructured at component scope (not inside useEffect) — useTour() is a plain function call, not a hook with subscriptions; safe to call at top level per plan note"

# Metrics
duration: ~3 min
completed: 2026-05-19
---

# Phase 74 Plan 02: Post-Onboarding App Feature Tour — Wave 2 Summary

**5-step spotlight overlay with box-shadow dim, rAF-tracked BoundingClientRect positioning, and data-tour attributes bridging TOUR_STEPS config to DOM targets across sidebar, topbar, and mobile bottom-nav**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-19T11:25:15Z
- **Completed:** 2026-05-19T11:28:00Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- `components/tour/tour-step.tsx` — `TourStep` interface + `TOUR_STEPS` array with 5 steps (new-project, projects, clients, price-book, language-toggle)
- `components/app-shell/sidebar.tsx` — `TOUR_TARGET` map + `data-tour` prop on each nav `Link` (4 items matched)
- `components/app-shell/topbar.tsx` — `<span data-tour="language-toggle">` wrapping `LanguageToggle`
- `components/app-shell/bottom-nav.tsx` — `TOUR_TARGET` map + `data-tour` on nav links; `data-tour="language-toggle"` on the standalone language-toggle div
- `components/tour/tour-spotlight.tsx` — `TourSpotlight` client component: rAF loop tracks target element position, box-shadow spotlight dims backdrop, tooltip card shows step index/title/description with Back/Next/Done/Skip controls — all strings through `t()`
- `app/(app)/layout.tsx` — import + `<TourSpotlight />` added after `<WelcomeModal />`
- `components/tour/tour-provider.tsx` — `isSpotlightPending` added to destructuring; `else if` branch restores spotlight on page refresh mid-tour

## Task Commits

1. **Task 1: Tour step config + data-tour attributes on targets** — `5f264a5` (feat)
2. **Task 2: TourSpotlight overlay + layout wiring + page-refresh resilience** — `e905f81` (feat)

## Files Created/Modified

- `components/tour/tour-step.tsx` — TourStep interface + TOUR_STEPS[5] config array
- `components/tour/tour-spotlight.tsx` — TourSpotlight overlay (rAF + box-shadow + tooltip card)
- `components/app-shell/sidebar.tsx` — TOUR_TARGET map + data-tour on Link elements
- `components/app-shell/topbar.tsx` — data-tour="language-toggle" span wrapper
- `components/app-shell/bottom-nav.tsx` — TOUR_TARGET map + data-tour on Link + language-toggle div
- `app/(app)/layout.tsx` — TourSpotlight import + JSX placement
- `components/tour/tour-provider.tsx` — isSpotlightPending + refresh resilience else-if branch

## Decisions Made

- `TOUR_TARGET` Record collocated in each nav component rather than imported from tour — keeps nav components decoupled from tour internals; map is trivial at 4 entries
- rAF loop chosen over IntersectionObserver/ResizeObserver for simplicity and broad mobile browser support
- `window.innerWidth` guarded with `typeof window !== 'undefined'` — safe in RSC-adjacent tree even though component is `'use client'`

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — spotlight is fully wired: BoundingClientRect targeting, box-shadow dim, step navigation, tour completion, and localStorage state management all implemented.

## Self-Check: PASSED

- `components/tour/tour-step.tsx` — FOUND
- `components/tour/tour-spotlight.tsx` — FOUND
- Commit `5f264a5` — FOUND
- Commit `e905f81` — FOUND
- `grep "data-tour" sidebar.tsx` — 4+ lines (FOUND)
- `grep "data-tour=\"language-toggle\"" topbar.tsx` — 1 line (FOUND)
- `grep "TourSpotlight" layout.tsx` — 2 lines import + JSX (FOUND)
- `grep "9999px" tour-spotlight.tsx` — box-shadow line (FOUND)
- `grep "isSpotlightPending" tour-provider.tsx` — refresh resilience line (FOUND)
