---
phase: 74-post-onboarding-app-feature-tour
plan: "04"
subsystem: ui
tags: [react, tour, floating-button, context, ref, tailwind]

requires:
  - phase: 74-post-onboarding-app-feature-tour
    provides: TourProvider context (showWelcome, setShowWelcome, showSpotlight, setShowSpotlight), WelcomeModal, TourSpotlight from plans 74-01..74-03

provides:
  - TourHelpButton: fixed bottom-right floating '?' button that reopens tour in review mode
  - WelcomeModal review mode: 'Close' CTA replaces 'Start estimating' — no localStorage side-effects
  - isReviewModeRef + setIsReviewMode added to TourContext (useRef, not useState, to avoid closure issues)
  - Full tour system complete: welcome modal → spotlight (5 steps) → contextual tooltips → help button

affects: [app-shell, tour-system, phase-75-onwards]

tech-stack:
  added: []
  patterns:
    - "useRef for synchronous boolean flag in context — avoids stale closure in onOpenChange without triggering re-renders"
    - "Review mode via context ref: setIsReviewMode(true) before setShowWelcome(true) — ref read at render time is always current"
    - "Conditional CTA based on ref value at render time — isReviewModeRef.current read in JSX synchronously"

key-files:
  created:
    - components/tour/tour-help-button.tsx
  modified:
    - components/tour/tour-provider.tsx
    - components/tour/welcome-modal.tsx
    - app/(app)/layout.tsx

key-decisions:
  - "isReviewModeRef is useRef (not useState) — ref avoids stale closure in onOpenChange while still being current at render time since showWelcome state change triggers the re-render"
  - "handleClose in review mode calls ONLY setIsReviewMode(false) + setShowWelcome(false) — completeTour() is deliberately absent to keep localStorage clean"
  - "TourHelpButton returns null when showSpotlight=true — prevents z-index conflicts with spotlight overlay"
  - "bottom-24 right-4 on mobile (above 64px bottom-nav), bottom-6 right-6 on desktop — follows plan interface spec"

requirements-completed:
  - TOUR-05

duration: 4min
completed: 2026-05-19
---

# Phase 74 Plan 04: Post-Onboarding App Feature Tour — Help Button + Review Mode Summary

**Fixed '?' floating help button (bottom-right) with WelcomeModal review mode — users can always re-open the tour without touching localStorage, completing the full phase-74 tour system**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-19T11:28:47Z
- **Completed:** 2026-05-19T11:32:00Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Created `TourHelpButton`: fixed bottom-right `?` button (bottom-24/right-4 mobile, bottom-6/right-6 desktop), hidden during spotlight, opens WelcomeModal in review mode
- Added `isReviewModeRef` (useRef) + `setIsReviewMode` to TourContext — ref pattern prevents stale closures in Dialog's `onOpenChange` without extra re-renders
- Updated WelcomeModal to support review mode: shows `Close` CTA instead of `Start estimating`, X button respects `isReviewModeRef.current`, `handleClose` never calls `completeTour()`
- Wired `TourHelpButton` into `app/(app)/layout.tsx` after `TourSpotlight` — phase-74 tour system fully complete

## Task Commits

Each task was committed atomically:

1. **Task 1: TourHelpButton + WelcomeModal review mode** - `1271cc3` (feat)
2. **Task 2: Wire TourHelpButton into layout + final verification** - `74502f7` (feat)

## Files Created/Modified

- `components/tour/tour-help-button.tsx` — New: fixed bottom-right '?' button component
- `components/tour/tour-provider.tsx` — Added `isReviewModeRef` (useRef), `setIsReviewMode`, updated TourContextValue interface and Provider value
- `components/tour/welcome-modal.tsx` — Added review mode: conditional CTA (Close vs Start estimating), `handleClose` (no localStorage), `onOpenChange` respects ref
- `app/(app)/layout.tsx` — Added TourHelpButton import + JSX after TourSpotlight

## Decisions Made

- `isReviewModeRef` uses `useRef` (not `useState`) so the dialog's `onOpenChange` closure always reads the current value without needing to capture state — the `showWelcome` state change that triggers the re-render ensures `isReviewModeRef.current` is fresh at render time
- `handleClose` in review mode is deliberately localStorage-clean: only `setIsReviewMode(false)` + `setShowWelcome(false)`, never `completeTour()`
- `TourHelpButton` returns `null` during spotlight (`showSpotlight === true`) to avoid z-index battles with the spotlight overlay backdrop

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

TypeScript check (`npx tsc --noEmit`) reported 2 pre-existing errors unrelated to this plan:
1. `.next/dev/types/validator.ts` missing `app/(app)/settings/appearance/page.js` type declarations
2. `components/auth/turnstile-widget.tsx` missing `@marsidev/react-turnstile` module

Both errors existed before this plan's changes (confirmed via git stash test). No new type errors introduced.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 74 is fully complete: welcome modal (74-01) → spotlight walkthrough (74-02) → contextual tooltips (74-03) → help button + review mode (74-04)
- Full tour system is live: users see welcome modal after onboarding, can take the spotlight tour, contextual tooltips appear on key surfaces, and the '?' button always allows re-opening the tour
- No blockers for subsequent phases

---
*Phase: 74-post-onboarding-app-feature-tour*
*Completed: 2026-05-19*
