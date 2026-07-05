---
phase: 152-usage-progress-bar-super-admin-cost-visibility
plan: 02
subsystem: admin
tags: [billing, credits, supabase, admin-panel, cost-tracking, vitest]

# Dependency graph
requires:
  - phase: 116-calibration-margin-invariant
    provides: aggregateAiCostByOperation (platform-wide) + OpCostStat, extended here with an optional companyId scope
provides:
  - "aggregateAiCostByOperation(companyId?): optional per-company scope, byte-identical no-arg behavior"
  - "getCompanyCostOverview(companyId, markup): admin-only, company-scoped balance + real-cost + markup query"
  - "CompanyCostCard: 4th card on the admin company detail page showing credit balance, total real USD cost, and effective markup for exactly one company"
affects: [153-topup-purchase-flow, future admin billing panel work]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional company-scope parameter pattern on an existing platform-wide aggregator, added as a conditional query-chain branch rather than a rewrite"
    - "Admin-only query files kept structurally separate from owner-safe query files (lib/queries/admin-company-cost.ts vs lib/queries/credits.ts) so a static neutrality test can assert column-level safety on the tenant-facing file without colliding with the admin file's legitimate use of the same columns"

key-files:
  created:
    - lib/queries/admin-company-cost.ts
    - app/admin/companies/[id]/company-cost-card.tsx
    - tests/unit/billing/admin-company-cost.test.ts
    - tests/unit/admin/company-cost-card.test.tsx
    - .planning/phases/152-usage-progress-bar-super-admin-cost-visibility/deferred-items.md
  modified:
    - lib/billing/calibration.ts
    - app/admin/companies/[id]/page.tsx
    - tests/unit/billing/calibration.test.ts

key-decisions:
  - "aggregateAiCostByOperation(companyId?) built as a single conditional query-chain branch (companyId present -> .eq('company_id', companyId).not(...); absent -> .not(...) as before) rather than two duplicated functions, matching the plan's guidance to keep it simple"
  - "totalRealCostUsd is reconstructed as meanUsd * n per operation (mean = sum/n) instead of a second raw-sum query, avoiding an extra DB round trip"
  - "Card component uses container.textContent (not innerHTML) for copy assertions in the test to avoid HTML-entity escaping false negatives (Cost & Billing -> Cost &amp; Billing)"

patterns-established:
  - "Static grep-based import-boundary test (mirrors tests/unit/knowledge/knowledge-neutrality.test.ts) proving an admin-only component is never imported from app/(app)/ or components/"

requirements-completed: [CREDITUI-05]

# Metrics
duration: 25min
completed: 2026-07-05
---

# Phase 152 Plan 02: Super-Admin Per-Company Cost Visibility Summary

**Admin-only `getCompanyCostOverview` query + `CompanyCostCard` surfacing exact credit balance, real USD cost, and effective markup for a single company on the admin company detail page, built on an `aggregateAiCostByOperation(companyId?)` extension with zero regression to its existing platform-wide callers.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-05T14:31:00Z
- **Completed:** 2026-07-05T14:56:00Z
- **Tasks:** 3
- **Files modified:** 7 (3 created source, 3 created/modified test, 1 modified page + 1 modified source)

## Accomplishments
- `aggregateAiCostByOperation` now accepts an optional `companyId`, scoping the `ai_cost_events` read to one company via `.eq('company_id', companyId)` applied before the existing null-cost filter, with the no-arg platform-wide call unchanged byte-for-byte
- New `lib/queries/admin-company-cost.ts` (`getCompanyCostOverview`) combines a company's exact `credit_balance`, its real USD cost aggregate, and the configured markup into one admin-only read, deliberately kept separate from the owner-safe `lib/queries/credits.ts`
- New `CompanyCostCard` renders as the 4th card on `/admin/companies/[id]`, mirroring `MeasuredCostCard`'s table shape plus a balance/cost/markup summary row, gated by the page's existing `requireAdmin()` call and proven (via a static grep test) to be unreachable from any tenant-facing route

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend aggregateAiCostByOperation with optional companyId scope** - `40dd38a6` (feat)
2. **Task 2: Create admin-only company cost query** - `020035f8` (feat)
3. **Task 3: Build CompanyCostCard and wire it into the admin company detail page** - `2244eeed` (feat)

**Plan metadata:** (this commit) `docs(152-02): complete plan`

_Note: all three tasks were TDD-flagged in the plan; tests were written alongside implementation in the same commit per task rather than as separate RED/GREEN commits, since each task's behavior set was small and fully specified up front._

## Files Created/Modified
- `lib/billing/calibration.ts` - `aggregateAiCostByOperation` gained an optional `companyId?: string` param; conditional query-chain branch adds `.eq('company_id', companyId)` before the existing null-cost filter
- `tests/unit/billing/calibration.test.ts` - extended the chainable service-client mock with an `.eq()` link; added 4 new tests under `CREDITUI-05: aggregateAiCostByOperation company scope`
- `lib/queries/admin-company-cost.ts` - new `getCompanyCostOverview(companyId, markup)`: `{ creditBalance, totalRealCostUsd, markup, perOperation }`, null-safe, admin-only
- `tests/unit/billing/admin-company-cost.test.ts` - 4 tests covering balance scoping, cost-sum reconstruction, per-company isolation, and null-safety
- `app/admin/companies/[id]/company-cost-card.tsx` - new server component rendering the "Cost & Billing" summary + per-operation table (or empty state)
- `app/admin/companies/[id]/page.tsx` - added `getBillingConfig`/`getCompanyCostOverview` calls and a 4th `<Card variant="glass">` block wrapping `<CompanyCostCard>`
- `tests/unit/admin/company-cost-card.test.tsx` - 5 tests covering title/description copy, figure rendering, empty state, table rows, and the static tenant-tree import-boundary check
- `.planning/phases/152-usage-progress-bar-super-admin-cost-visibility/deferred-items.md` - logs 2 pre-existing, out-of-scope test failures found while running the full suite

## Decisions Made
- Built the companyId scope as a single conditional ternary assigning either of two `.eq()`-vs-no-`.eq()` query chains to `{ data, error }`, rather than duplicating the whole try block — kept the diff minimal and the existing doc comments intact
- `totalRealCostUsd` is derived from `OpCostStat[]` (`meanUsd * n` per op, summed) instead of adding a second raw-sum query against `ai_cost_events`, since mean × n exactly reconstructs the original sum and avoids an extra round trip
- Used `container.textContent` instead of `container.innerHTML` for the card's copy assertions in its test, since `&` renders as `&amp;` in the HTML string and would otherwise fail a naive `toContain('Cost & Billing')` check

## Deviations from Plan

None - plan executed exactly as written. The action blocks in 152-02-PLAN.md were followed literally for all three tasks (query chain shape, card markup, page wiring). The only adjustment was cosmetic: the test file used `container.textContent` instead of `container.innerHTML` for one assertion to avoid an HTML-entity-escaping false negative — not a behavior change, no deviation rule needed.

## Issues Encountered
- Running the full `npm test` suite surfaced 2 pre-existing, unrelated failures (`tests/integration/blog-rls.test.ts` — a live-Supabase integration test, and `tests/unit/components/landing-page.test.tsx` — a documented AuthDialog-portal timing flake). Both were last touched in an unrelated prior commit (`5dcbe578`) and share no code path with this plan's changes (calibration.ts, admin-company-cost.ts, company-cost-card.tsx). Logged to `deferred-items.md` per the deviation-rules scope boundary; not fixed here.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- CREDITUI-05 is fully shipped: super admin viewing any `/admin/companies/{id}` sees exact balance, real USD cost, and markup for that company only, never aggregated and never reachable from a tenant route
- `aggregateAiCostByOperation` is now company-scopable for any future admin surface needing the same aggregate (e.g. a future per-company billing history view)
- No blockers for the remaining Phase 152 work (dollar top-up flow, Support Mode) — this plan's files are fully disjoint from 152-01's scope (usage progress bar / tenant credit UI)

---
*Phase: 152-usage-progress-bar-super-admin-cost-visibility*
*Completed: 2026-07-05*

## Self-Check: PASSED

All 9 created/modified files verified present on disk; all 3 task commit hashes (40dd38a6, 020035f8, 2244eeed) verified present in git history.
