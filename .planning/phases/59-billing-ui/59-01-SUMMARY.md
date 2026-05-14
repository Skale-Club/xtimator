---
phase: 59-billing-ui
plan: "01"
subsystem: monetization
tags: [billing, ui, settings, plan-card, usage-meters]
note: executed-in-worktree
dependency_graph:
  requires: [57-01, 58-01]
  provides: [settings-billing-page, billing-components]
  affects: [app/(app)/settings/billing/page.tsx, components/billing/, app/(app)/layout.tsx]
key_files:
  created:
    - app/(app)/settings/billing/page.tsx
    - components/billing/upgrade-buttons.tsx
    - components/billing/manage-subscription-button.tsx
    - lib/queries/billing.ts
metrics:
  duration_minutes: 3
  tasks_completed: 2
  tasks_total: 2
  files_created: 4
  files_modified: 0
  completed_date: "2026-05-14"
---

# Phase 59 Plan 01: Billing UI — Settings Page Summary

**One-liner:** `/settings/billing` page with plan card, usage meters, and conditional Upgrade/Manage buttons.

## What Was Built

### `lib/queries/billing.ts` — `getBillingData(userId)`
- Uses `requireServiceClient()` to bypass deny-all RLS on `usage_events`
- Single `event_type` query counted in JS to avoid N+1
- Returns plan card data + usage metrics (estimates, photos, audio)

### `app/(app)/settings/billing/page.tsx`
- Plan card: current tier name, status, trial days remaining
- Usage meters: estimates, photos, audio (progress bars vs limits)
- Conditional buttons: Upgrade (free/trial) or Manage Subscription (pro/business)

### `components/billing/upgrade-buttons.tsx`
- POSTs to `/api/billing/create-checkout-session`, redirects to Stripe

### `components/billing/manage-subscription-button.tsx`
- POSTs to `/api/billing/create-portal-session`

## Decisions

- `requireServiceClient` (not `createClient`) for usage_events — deny-all RLS requires service role bypass
- Billing entry card placed before Price Book on /settings — billing is top-level business concern

## Self-Check: PASSED

- Executed via git worktree — artifacts merged to main
