---
phase: 60-trial-automation-admin-tooling
plan: "02"
subsystem: admin
tags: [admin, billing, tier-management, quota, mrr]
dependency_graph:
  requires:
    - lib/auth/admin-context (requireAdmin)
    - lib/supabase/service (requireServiceClient)
    - lib/entitlements (TierName)
    - supabase/migrations/20260513000001_phase55_subscription_tiers.sql (companies.tier + usage_events schema)
  provides:
    - app/admin/billing/actions.ts (forceTier, grantBonusCredits)
    - app/admin/billing/page.tsx (AdminBillingPage)
    - app/admin/billing/billing-table.tsx (BillingTable client component)
  affects:
    - components/admin/admin-nav.tsx (Billing nav entry added)
tech_stack:
  added: []
  patterns:
    - requireAdmin() first-line gate on all admin server actions
    - revalidatePath('/admin/billing') on success
    - ActionResult discriminated union { ok: boolean; message?: string }
    - event_type='estimate_generated' with negative units for bonus credits (CHECK constraint workaround)
    - Promise.all for parallel server queries (proCount + bizCount + companies)
    - useTransition for non-blocking server action calls in client component
key_files:
  created:
    - app/admin/billing/actions.ts
    - app/admin/billing/page.tsx
    - app/admin/billing/billing-table.tsx
  modified:
    - components/admin/admin-nav.tsx
decisions:
  - event_type='estimate_generated' with negative units used for bonus credits — CHECK constraint on usage_events.event_type only allows 'estimate_generated'|'photo_analyzed'|'audio_transcribed', not 'bonus_credits'; service role bypasses RLS but not CHECK constraints
  - BillingTable extracted as separate 'use client' file (billing-table.tsx) — server component page cannot contain client hooks directly
  - lib/entitlements.ts copied from main repo (Rule 3 deviation) — Phase 55 file was absent from worktree, required for TierName type
metrics:
  duration: 8min
  completed: "2026-05-13"
  tasks_completed: 2
  files_created: 3
  files_modified: 1
---

# Phase 60 Plan 02: Admin Billing Page Summary

**One-liner:** Admin billing panel with MRR stat card, per-company force-tier + grant-credits forms, and nav entry using requireAdmin + revalidatePath pattern.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | billing server actions (forceTier + grantBonusCredits) | 063afc5 | app/admin/billing/actions.ts |
| 2 | /admin/billing page + BillingTable + nav entry | 051cafe | app/admin/billing/page.tsx, app/admin/billing/billing-table.tsx, components/admin/admin-nav.tsx |

## What Was Built

### app/admin/billing/actions.ts
Two server actions behind `requireAdmin()`:
- **`forceTier(companyId, tier, expiresAt?)`** — updates `companies.tier`, optionally sets `tier_renews_at`, clears `tier_trial_ends_at` when forcing to `'free'`
- **`grantBonusCredits(companyId, units)`** — inserts a negative-units `usage_events` row with `event_type='estimate_generated'` and `metadata: { bonus: true, granted_by: adminEmail }`

### app/admin/billing/page.tsx
Server component with `dynamic = 'force-dynamic'`:
- Parallel queries via `Promise.all`: `proCount`, `bizCount`, full company list (limit 200)
- MRR calculated as `(proCount × 29) + (bizCount × 99)`
- MRR stat card + `<BillingTable>` rendered

### app/admin/billing/billing-table.tsx
Client component with per-row interactivity:
- `TierBadge` component with color coding per tier (free/trial/pro/business)
- `CompanyRow` with `useTransition` for non-blocking actions
- Force Tier: Select (free/trial/pro/business) + date input (tier_renews_at) + Force button
- Grant Credits: number input + Grant button
- Inline feedback message per row

### components/admin/admin-nav.tsx
Added `CreditCard` to lucide-react imports and `{ href: '/admin/billing', label: 'Billing', Icon: CreditCard }` between Integrations and Admins.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Missing lib/entitlements.ts in worktree**
- **Found during:** Task 1 TypeScript verification
- **Issue:** `lib/entitlements.ts` (Phase 55 file) was absent from this worktree; `import type { TierName } from '@/lib/entitlements'` failed with TS2307
- **Fix:** Copied `lib/entitlements.ts` from main repo to worktree
- **Files modified:** lib/entitlements.ts (created in worktree)
- **Commit:** 5b13f84

**2. [Decision] event_type='estimate_generated' for bonus credits**
- **Found during:** Task 1 implementation (reading Phase 55 migration)
- **Issue:** `usage_events.event_type` CHECK constraint only allows `'estimate_generated' | 'photo_analyzed' | 'audio_transcribed'` — not `'bonus_credits'`; service role bypasses RLS but not CHECK constraints
- **Fix:** Used `event_type='estimate_generated'` with `units=-N` and `metadata: { bonus: true, granted_by: adminEmail }` as specified in the plan's context note
- **Files modified:** app/admin/billing/actions.ts

## Success Criteria Verification

- ADMIN-BILLING-01: `forceTier()` updates `companies.tier`; page has Force Tier select + date + button per company
- ADMIN-BILLING-02: `grantBonusCredits()` inserts negative-units `usage_events` row; page has Grant Credits input + button per company
- ADMIN-BILLING-03: MRR = `(proCount × 29) + (bizCount × 99)` in header stat card with breakdown text
- `/admin/billing` gated behind `requireAdmin()`
- Billing entry in admin sidebar between Integrations and Admins
- TypeScript: `npx tsc --noEmit` exits 0 (no errors)

## Known Stubs

None — all data is wired from live Supabase queries.

## Self-Check: PASSED

Files exist:
- app/admin/billing/actions.ts — FOUND
- app/admin/billing/page.tsx — FOUND
- app/admin/billing/billing-table.tsx — FOUND
- components/admin/admin-nav.tsx — FOUND (modified)

Commits:
- 063afc5 — FOUND
- 051cafe — FOUND
- 5b13f84 — FOUND
