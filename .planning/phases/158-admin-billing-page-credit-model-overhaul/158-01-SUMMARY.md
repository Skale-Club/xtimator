---
phase: 158-admin-billing-page-credit-model-overhaul
plan: 01
subsystem: admin
tags: [billing, credits, admin-ui, react-server-components, supabase]

# Dependency graph
requires:
  - phase: 110-116 (v4.7 credit-ledger + cost-visibility stack)
    provides: aggregateAiCostByOperation(), getBillingConfig(), ai_cost_events table
  - phase: 152 (Usage Progress Bar + Super-Admin Cost Visibility)
    provides: getCompanyCostOverview pattern, auto_topup_enabled column precedent
provides:
  - "Admin /admin/billing page with platform-wide real-cost/credit summary card"
  - "Per-company credit balance / real cost / auto-top-up as primary table columns"
  - "Force tier / Grant credits collapsed into a per-row Manage disclosure"
affects: [159-inbox-visual-redesign, future admin billing panel work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Batched N+1 avoidance: single .in('company_id', ids) query instead of per-row aggregateAiCostByOperation(companyId) calls"
    - "Collapsible per-row 'Manage' disclosure (local useState toggle) to de-emphasize secondary admin actions without removing them"

key-files:
  created: []
  modified:
    - app/admin/billing/page.tsx
    - app/admin/billing/billing-table.tsx

key-decisions:
  - "Batched per-company real cost via a single ai_cost_events query scoped to fetched company IDs (.in('company_id', companyIds)), instead of 200 sequential getCompanyCostOverview calls — resolves the N+1 risk CONTEXT.md flagged as Claude's Discretion"
  - "Dropped Trial ends / Stripe sub as standalone table columns, preserved them inside the expandable Manage row detail — keeps the primary row width reasonable while not deleting the info (CONTEXT.md Claude's Discretion)"
  - "Summary card heading 'Platform AI Cost' (not 'Monthly Recurring Revenue' or 'Real Usage Cost') — avoids implying subscription revenue, matches CONTEXT.md naming guidance"

patterns-established:
  - "Manage disclosure pattern: per-row collapsed secondary-actions section (TableRow with colSpan matching header count) toggled by local useState — reusable for future admin tables that need primary/secondary column de-emphasis"

requirements-completed: [BILLADMIN-01, BILLADMIN-02, BILLADMIN-03]

# Metrics
duration: 12min
completed: 2026-07-06
---

# Phase 158 Plan 01: Admin Billing Page Credit Model Overhaul Summary

**Replaced the admin `/admin/billing` page's hardcoded `pro*29 + business*99` MRR card and tier-centric table with a credit-model-centric view sourced from the already-shipped `aggregateAiCostByOperation()` / `getBillingConfig()` stack — zero new backend logic.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-06T04:41:00Z
- **Completed:** 2026-07-06T04:53:00Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- Platform-wide summary card now shows real AI cost (`$X.XX`) plus a credits-equivalent caption at the current markup, computed from `aggregateAiCostByOperation()` (no-arg, platform-wide) and `getBillingConfig()` — replacing the hardcoded MRR math entirely.
- Per-company table now leads with Credit balance / Real cost / Auto-top-up as primary columns, with Tier as secondary context and Force tier / Grant credits moved behind a collapsible "Manage" row disclosure — both actions remain fully functional, unchanged.
- Per-company real cost computed via a single batched query (`ai_cost_events` filtered by `.in('company_id', ids)`) rather than one `getCompanyCostOverview` call per row, keeping the page at 3 total queries regardless of row count (up to 200 companies).

## Task Commits

Each task was committed atomically:

1. **Task 1: Rewrite page.tsx — platform-wide summary card + batched per-company query** - `f4806104` (feat)
2. **Task 2: Restructure billing-table.tsx — credit-model columns primary, Manage disclosure** - `3f050f59` (feat)

_No TDD tasks in this plan (tdd="false" on both)._

## Files Created/Modified
- `app/admin/billing/page.tsx` - Replaced hardcoded MRR calc with `aggregateAiCostByOperation()` + `getBillingConfig()` platform summary; extended companies query with `credit_balance`/`auto_topup_enabled`; added batched per-company real-cost query; passes `markup`/`creditUnitUsd` to `BillingTable`.
- `app/admin/billing/billing-table.tsx` - Extended `Company` type with `credit_balance`/`auto_topup_enabled`/`realCostUsd`; new column order (Company/Credit balance/Real cost/Auto-top-up/Tier/Manage-toggle); Force tier + Grant credits now live inside a per-row collapsible Manage section that also preserves Trial ends/Stripe sub detail.

## Decisions Made
- Batching strategy for per-company cost: single `.in('company_id', ids)` query over `ai_cost_events`, grouped client-side in `page.tsx` — avoids N+1 against up to 200 rows (CONTEXT.md left this as Claude's Discretion).
- Dropped `Trial ends`/`Stripe sub` as standalone columns; preserved inside the Manage disclosure detail rather than deleted (CONTEXT.md Claude's Discretion).
- Summary card heading: "Platform AI Cost" — avoids the misleading "Monthly Recurring Revenue" framing per CONTEXT.md's explicit naming guidance.

## Deviations from Plan

None - plan executed exactly as written. All acceptance-criteria greps and `npx tsc --noEmit` checks pass for both modified files.

## Issues Encountered

Two pre-existing, unrelated TypeScript errors were observed in `tests/unit/billing/calibration.test.ts` and `tests/unit/billing/seat-billing.test.ts` during `npx tsc --noEmit` — confirmed via `git stash` to pre-exist before this plan's changes (out of scope per the deviation-rules scope boundary; not touched, not part of this plan's file set).

A `gsd-tools state advance-plan` invocation was found to mutate Phase 157's "Current Position" fields (the concurrently-executing plan's territory) instead of Phase 158's, because STATE.md's position pointer was still on Phase 157 at invocation time. The mutation was immediately reverted via `git checkout -- .planning/STATE.md` and STATE.md was instead hand-edited to avoid clobbering the concurrent 157-03 executor's writes (see STATE.md update below).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- BILLADMIN-01/02/03 all complete; Phase 158 (single-plan phase) is fully shipped.
- No blockers for Phase 159 (Inbox visual redesign) — zero file overlap, already progressing concurrently.

---
*Phase: 158-admin-billing-page-credit-model-overhaul*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: app/admin/billing/page.tsx
- FOUND: app/admin/billing/billing-table.tsx
- FOUND: commit f4806104
- FOUND: commit 3f050f59
