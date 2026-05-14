---
phase: 59-billing-ui
plan: 01
subsystem: ui
tags: [billing, supabase, server-component, shadcn-ui, usage-events, entitlements]

requires:
  - phase: 55-schema-tier-definitions
    provides: tier column on companies, usage_events table, getEntitlements()
  - phase: 56-usage-tracking
    provides: usage_events rows with estimate_generated / photo_analyzed event types

provides:
  - lib/queries/billing.ts — getBillingData(userId) query using requireServiceClient
  - BillingData interface (tier, dates, stripeSubscriptionId, usage counts, entitlements)
  - app/(app)/settings/billing/page.tsx — server component plan card + usage meters
  - Billing entry card on /settings page (above Price Book)

affects:
  - 59-02 (Plan 02 adds interactive checkout/portal buttons to this page)

tech-stack:
  added: []
  patterns:
    - "requireServiceClient for deny-all RLS tables (usage_events)"
    - "JS filter instead of N+1 queries — fetch all event_types, count in JS"
    - "settings sub-page layout: mx-auto max-w-xl space-y-6 (matches appearance page)"

key-files:
  created:
    - lib/queries/billing.ts
    - app/(app)/settings/billing/page.tsx
    - tests/unit/billing/billing-data.test.ts
  modified:
    - app/(app)/settings/page.tsx

key-decisions:
  - "requireServiceClient (not createClient) for usage_events because deny-all RLS requires service role bypass"
  - "Single usage_events query selecting all event_types, counting in JS — avoids N+1 per event type"
  - "Billing entry card placed BEFORE Price Book on /settings (billing is a top-level business concern)"
  - "Plan 02 owns interactive buttons (checkout/portal links); Plan 01 page shows placeholder text only to avoid client components"

patterns-established:
  - "getBillingData(userId) pattern — takes userId string, returns BillingData | null"
  - "Usage count via JS filter on a single .select('event_type') query"

requirements-completed:
  - BILLING-01

duration: 4min
completed: 2026-05-14
---

# Phase 59 Plan 01: Billing UI — Data Query + Settings Page Summary

**getBillingData() query using requireServiceClient for usage_events + /settings/billing server component showing plan card and usage meters**

## Performance

- **Duration:** 4 min
- **Started:** 2026-05-14T13:27:45Z
- **Completed:** 2026-05-14T13:31:45Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Created `lib/queries/billing.ts` with `BillingData` interface and `getBillingData(userId)` that reads tier, trial/renewal dates, Stripe subscription ID, and usage event counts via the service-role client
- Created `app/(app)/settings/billing/page.tsx` — async server component showing plan card (with trial/renewal date), usage meters (estimates + photos this month), and placeholder action area for Plan 02 buttons
- Added Billing entry card to `/settings/page.tsx` above Price Book with CreditCard icon
- Wrote 4 unit tests (TDD RED then GREEN) covering tier/entitlements, estimate count, photo count, and date pass-through

## Task Commits

Each task was committed atomically:

1. **Task 1: Wave 0 test stub + lib/queries/billing.ts** - `9d79dc8` (feat)
2. **Task 2: /settings/billing page + /settings entry card** - `538e1db` (feat)

## Files Created/Modified
- `lib/queries/billing.ts` — exports `BillingData` interface and `getBillingData(userId)` using `requireServiceClient`
- `tests/unit/billing/billing-data.test.ts` — 4 unit tests (all passing)
- `app/(app)/settings/billing/page.tsx` — server component: plan card + usage meters + placeholder action area
- `app/(app)/settings/page.tsx` — added Billing entry card before Price Book

## Decisions Made
- Used `requireServiceClient` (non-nullable variant) for all DB queries in `getBillingData` because `usage_events` has deny-all RLS — consistent with quota.ts and Phase 41 patterns
- Single `usage_events` query selecting all `event_type` rows, counting `estimate_generated` and `photo_analyzed` via JS filter — avoids N+1 queries for each event type
- Billing entry card placed before Price Book on `/settings` page — billing is a top-level business concern, should appear high in the list
- Plan 01 page uses placeholder text ("Subscription management available below" / "Upgrade your plan") without interactive client components — Plan 02 adds the checkout/portal button as a `'use client'` component to avoid complicating this server-only page

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Merged main into worktree branch to resolve missing lib/entitlements.ts**
- **Found during:** Task 1 (running tests after creating billing.ts)
- **Issue:** `lib/entitlements.ts` did not exist in the worktree branch (branch was based on commit `d4e1323` from v2.1 milestone, missing Phases 55-58 which added entitlements, quota, and Stripe files)
- **Fix:** Ran `git merge main` — worktree had no commits ahead of main, so merge was safe and conflict-free
- **Files modified:** ~30 files from Phases 55-58 merged in (entitlements.ts, quota.ts, stripe/, usage_events, etc.)
- **Verification:** `lib/entitlements.ts` confirmed present; all 4 billing tests pass
- **Committed in:** Merge commit from `git merge main`

---

**Total deviations:** 1 auto-fixed (blocking)
**Impact on plan:** Merge was necessary — the worktree branch lacked prerequisite files. No scope creep; merge was clean with no conflicts.

## Issues Encountered
- Pre-existing TypeScript errors in merged test files (`analyze-photos-quota.test.ts`, `generate-estimate-quota.test.ts`, `pdf-delivery.test.ts`) — 4 errors in files not related to this plan. Out-of-scope per deviation rules. No billing-file TS errors.

## Known Stubs
- Action area in `/settings/billing/page.tsx` shows placeholder text instead of interactive checkout/portal buttons — intentional stub for Plan 02. The page goal (showing plan info and usage) is fully achieved; interactive billing actions are Plan 02's scope.

## Next Phase Readiness
- `getBillingData` and `BillingData` interface are ready for Plan 02 to import and extend
- `/settings/billing` page exists and renders; Plan 02 adds a `'use client'` checkout/portal action component below the usage meters
- No blockers for Plan 02

---
*Phase: 59-billing-ui*
*Completed: 2026-05-14*
