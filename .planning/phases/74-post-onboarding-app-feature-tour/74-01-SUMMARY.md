---
phase: 74-post-onboarding-app-feature-tour
plan: 01
subsystem: ui
tags: [react-context, localStorage, cookies, tour, onboarding, i18n, dialog]

# Dependency graph
requires:
  - phase: 02-company-onboarding
    provides: createOrUpdateCompany server action that calls redirect('/dashboard') after saving
  - phase: 12-i18n-translation-system
    provides: useTranslation() hook and t() function for multi-language support

provides:
  - useTour hook with TOUR_KEYS, isTourCompleted, completeTour, startTour, isSpotlightPending, clearSpotlightPending
  - TourProvider context with showWelcome/showSpotlight state, auto-opens on onboarding_complete cookie detection
  - WelcomeModal with two CTAs: "Show me around" (sets tour_spotlight_pending) and "Start estimating" (marks complete)
  - onboarding_complete non-httpOnly cookie set by createOrUpdateCompany before redirect — bridges server action to client tour detection

affects:
  - 74-02 (spotlight tour — reads tour_spotlight_pending via useTour().isSpotlightPending())
  - 74-03 (contextual tooltips — reads isTourCompleted via useTour)
  - 74-04 (any downstream tour state consumers)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cookie bridge pattern: server action sets non-httpOnly short-TTL cookie; client provider reads and immediately clears it to prevent re-trigger on reload"
    - "Tour state machine in localStorage: tour_completed + tour_spotlight_pending as boolean flags"
    - "Wave architecture: TourProvider (Wave 1) → spotlight (Wave 2) → tooltips (Wave 3)"

key-files:
  created:
    - components/tour/use-tour.ts
    - components/tour/tour-provider.tsx
    - components/tour/welcome-modal.tsx
  modified:
    - lib/actions/company.ts
    - app/(app)/layout.tsx

key-decisions:
  - "onboarding_complete cookie is httpOnly:false with 60s maxAge — TourProvider reads via document.cookie, cleared immediately after detection to prevent retrigger on page reload"
  - "Cookie cleared client-side (max-age=0) not server-side — avoids extra server round-trip; race condition window is negligible given 60s TTL"
  - "startTour() calls completeTour() internally so tour_completed=true regardless of which CTA the user clicks"
  - "X button (onOpenChange) delegates to handleStartEstimating — consistent behavior with primary CTA, no orphaned modal state"

patterns-established:
  - "Tour files live in components/tour/ — co-located hook, provider, and modal in one directory"
  - "TourContext exposed via useTourContext() — Wave 2/3 components import only what they need"

requirements-completed: [TOUR-01]

# Metrics
duration: 5min
completed: 2026-05-19
---

# Phase 74 Plan 01: Post-Onboarding App Feature Tour — Wave 1 Summary

**Cookie-bridged welcome modal that auto-fires once after onboarding via TourProvider context, persists dismissal in localStorage, and exposes showSpotlight for Wave 2 spotlight steps**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-05-19T11:13:00Z
- **Completed:** 2026-05-19T11:15:07Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- `useTour` hook centralizes all localStorage state for the tour state machine (TOUR_KEYS, isTourCompleted, completeTour, startTour, isSpotlightPending, clearSpotlightPending)
- `TourProvider` detects the onboarding_complete cookie on mount, clears it immediately, and sets showWelcome=true — modal fires exactly once per completed onboarding, never on reload
- `WelcomeModal` renders a Dialog with icon list and two CTAs; all strings pass through t() for PT-BR/ES support; primary CTA uses gradient-brand
- `createOrUpdateCompany` now sets a 60s non-httpOnly cookie before redirect, bridging the server action to the client-side tour detection without polling or DB reads

## Task Commits

1. **Task 1: Tour hook + TourProvider context** - `aa11f5c` (feat)
2. **Task 2: WelcomeModal + onboarding cookie + layout wiring** - `729860a` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `components/tour/use-tour.ts` — useTour hook + TOUR_KEYS constants
- `components/tour/tour-provider.tsx` — TourContext + TourProvider (auto-detect cookie on mount) + useTourContext()
- `components/tour/welcome-modal.tsx` — WelcomeModal Dialog with two CTAs and i18n t() strings
- `lib/actions/company.ts` — added `import { cookies } from 'next/headers'`; sets onboarding_complete cookie before redirect
- `app/(app)/layout.tsx` — added TourProvider wrapper + WelcomeModal after UpgradeModal

## Decisions Made
- `httpOnly: false` is required on the cookie so document.cookie can read it client-side (mirrors the eb-theme cookie precedent from Phase 09)
- 60s maxAge is enough for redirect + Next.js hydration on any device; cookie never persists into a second session
- startTour() internally calls completeTour() so tour_completed=true regardless of which CTA path the user takes — prevents edge case where user clicks "Show me around" but spotlight never activates

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None — no external service configuration required.

## Next Phase Readiness
- Wave 1 foundation complete; Wave 2 (spotlight) can now read `useTour().isSpotlightPending()` and `useTourContext().showSpotlight` to launch the guided tour steps
- Wave 3 (contextual tooltips) can read `useTour().isTourCompleted()` to conditionally show one-time tips
- No blockers

---
*Phase: 74-post-onboarding-app-feature-tour*
*Completed: 2026-05-19*
