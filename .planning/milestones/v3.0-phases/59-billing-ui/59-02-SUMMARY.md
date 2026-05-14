---
phase: 59-billing-ui
plan: "02"
subsystem: payments
tags: [stripe, billing, react, sonner, fetch-interceptor]

# Dependency graph
requires:
  - phase: 59-01
    provides: getBillingData query, /settings/billing page shell with tier data

provides:
  - UpgradeButtons component: POSTs to /api/billing/create-checkout-session and redirects to Stripe Checkout
  - ManageSubscriptionButton component: POSTs to /api/billing/create-portal-session and redirects to Stripe Portal
  - TrialBanner component: persistent strip rendered in app layout when trial < 3 days remaining
  - UpgradeModal component: global window.fetch interceptor for 402 AI route responses with sonner toast CTA
  - /settings/billing page: conditional Plan Actions Card (upgrade vs manage based on tier)
  - app/(app)/layout.tsx: wired with TrialBanner + UpgradeModal for every authenticated page

affects:
  - any future plan that adds AI routes (should be aware of 402 interceptor pattern)
  - any plan touching app/(app)/layout.tsx (TrialBanner + UpgradeModal are mounted there)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "window.fetch monkey-patch in client effect component for silent 402 interception — restore original in cleanup"
    - "Invisible effect-only client component (returns null) mounted in layout for global side-effect coverage"
    - "Inline trial check via requireServiceClient in layout — separate from getCachedCompany since AppCompany lacks tier columns"

key-files:
  created:
    - components/billing/upgrade-buttons.tsx
    - components/billing/manage-subscription-button.tsx
    - components/billing/trial-banner.tsx
    - components/billing/upgrade-modal.tsx
  modified:
    - app/(app)/settings/billing/page.tsx
    - app/(app)/layout.tsx

key-decisions:
  - "TrialBanner is a server component (no 'use client') — accepts plain daysRemaining prop, purely presentational"
  - "UpgradeModal uses window.fetch monkey-patch (not Context/Event) — invisible effect-only component returning null, intercepts 402 from AI routes without requiring callers to change"
  - "Inline billing row query in layout.tsx (tier + tier_trial_ends_at only) rather than full getBillingData — keeps layout fast with minimal DB fields"
  - "All three billing row fetches in layout use Promise.all (branding + adminRow + billingRow) — single concurrent round-trip"

patterns-established:
  - "Invisible effect component: returns null, 'use client', mounts global side-effect, cleans up on unmount — for global 402 handling"
  - "Server component trial banner: layout server component does inline Supabase query, passes computed daysRemaining to pure display component"

requirements-completed:
  - BILLING-02
  - BILLING-03
  - BILLING-04
  - BILLING-05

# Metrics
duration: 3min
completed: 2026-05-14
---

# Phase 59 Plan 02: Billing UI Summary

**Interactive billing controls — UpgradeButtons + ManageSubscriptionButton in /settings/billing, TrialBanner strip + UpgradeModal 402 interceptor wired into every authenticated page via app layout**

## Performance

- **Duration:** 3 min
- **Started:** 2026-05-14T13:35:58Z
- **Completed:** 2026-05-14T13:38:51Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Free/trial users on /settings/billing now see "Upgrade to Pro" and "Upgrade to Business" buttons that POST to create-checkout-session and redirect to Stripe Checkout
- Pro/business users see "Manage Subscription" button that opens the Stripe Customer Portal
- App layout fetches trial data inline (3-field query) and renders TrialBanner when trial < 3 days away
- UpgradeModal patches window.fetch globally to silently intercept 402 responses from AI routes and display a sonner toast with an "Upgrade Plan" action routing to /settings/billing

## Task Commits

Each task was committed atomically:

1. **Task 1: Upgrade buttons + Manage Subscription button + wire into billing page** - `7b229f4` (feat)
2. **Task 2: Trial banner + 402 upgrade modal wired into app layout** - `dc502ae` (feat)

**Plan metadata:** (committed with docs commit below)

## Files Created/Modified

- `components/billing/upgrade-buttons.tsx` - 'use client'; two buttons (Pro + Business) with loading state, POST to create-checkout-session, window.location redirect
- `components/billing/manage-subscription-button.tsx` - 'use client'; single button with loading state, POST to create-portal-session, window.location redirect
- `components/billing/trial-banner.tsx` - Server component; full-width amber strip with AlertTriangle icon and Link to /settings/billing; accepts daysRemaining prop
- `components/billing/upgrade-modal.tsx` - 'use client'; returns null; useEffect patches window.fetch to intercept 402 from /api/generate-estimate and /api/analyze-photos, shows sonner toast
- `app/(app)/settings/billing/page.tsx` - Replaced placeholder AlertCircle div with Plan Actions Card; conditionally renders ManageSubscriptionButton or UpgradeButtons based on tier
- `app/(app)/layout.tsx` - Added TrialBanner + UpgradeModal imports; added billingRow to Promise.all; computed trialDaysRemaining; mounted TrialBanner conditionally in flex column; mounted UpgradeModal at layout bottom

## Decisions Made

- TrialBanner is a server component (no 'use client') — accepts plain `daysRemaining` prop, purely presentational. Consistent with the project's pattern of keeping display components as server components when no interactivity is needed.
- UpgradeModal uses window.fetch monkey-patch rather than Context or events — this lets it catch 402s from any caller anywhere in the app tree without modifying call sites. Returns null so it has no visual footprint.
- Inline billing query in layout.tsx selects only `tier, tier_trial_ends_at` — avoids importing getBillingData (which also queries usage_events) keeping layout latency minimal.
- billingRow added to existing Promise.all in layout — no sequential blocking; all three async fetches run concurrently.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. Pre-existing TypeScript errors in test files (analyze-photos-quota.test.ts, generate-estimate-quota.test.ts, pdf-delivery.test.ts) are unrelated to this plan and were present before execution.

## User Setup Required

None - no external service configuration required beyond what Phase 58 (Stripe integration) already established.

## Next Phase Readiness

Phase 59 billing UI is complete (both plans shipped):
- /settings/billing has full data display (Plan 01) + interactive controls (Plan 02)
- Trial banner is live in app layout
- 402 interception is global

No blockers. Next phases can rely on UpgradeModal being available on every authenticated page.

---
*Phase: 59-billing-ui*
*Completed: 2026-05-14*
