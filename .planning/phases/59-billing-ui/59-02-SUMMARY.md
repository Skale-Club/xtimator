---
phase: 59-billing-ui
plan: "02"
subsystem: monetization
tags: [billing, trial-banner, upgrade-modal, layout, 402-intercept]
note: executed-in-worktree
dependency_graph:
  requires: [59-01]
  provides: [trial-banner, upgrade-modal, layout-billing-wiring]
  affects: [app/(app)/layout.tsx, components/billing/trial-banner.tsx, components/billing/upgrade-modal.tsx]
key_files:
  created:
    - components/billing/trial-banner.tsx
    - components/billing/upgrade-modal.tsx
  modified:
    - app/(app)/layout.tsx
metrics:
  duration_minutes: 3
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
  completed_date: "2026-05-14"
---

# Phase 59 Plan 02: Billing UI — Trial Banner + Upgrade Modal Summary

**One-liner:** `TrialBanner` (amber strip when trial < 3 days) + `UpgradeModal` (intercepts 402 from AI routes) mounted globally in app layout.

## What Was Built

### `components/billing/trial-banner.tsx`
- Server component (no 'use client') accepting `daysRemaining` prop
- Amber strip shown when trial expires in < 3 days
- Layout server component does inline Supabase query for tier + tier_trial_ends_at only — keeps layout fast

### `components/billing/upgrade-modal.tsx`
- `window.fetch` monkey-patch returning null — invisible effect-only component
- Intercepts 402 from AI routes and shows sonner toast with upgrade CTA
- No modifications needed at call sites — invisible interceptor pattern

### `app/(app)/layout.tsx`
- `billingRow` added to existing `Promise.all` (branding + adminRow + billingRow) — no sequential blocking
- `TrialBanner` + `UpgradeModal` mounted globally

## Decisions

- `TrialBanner` is a server component — no 'use client', accepts daysRemaining as prop
- `UpgradeModal` uses window.fetch monkey-patch returning null — invisible; doesn't modify AI route call sites
- `billingRow` in existing Promise.all — no blocking

## Self-Check: PASSED

- Executed via git worktree — artifacts merged to main
