---
phase: 140-seat-cost-ui
plan: 01
subsystem: ui
tags: [billing, seats, transparency, i18n, next-rsc, server-only]

# Dependency graph
requires:
  - phase: 139-seat-billing
    provides: "pure computeBillableSeats/computeSeatChargeCents + getBillingConfig seat fields (seatPriceCents, per-tier includedSeats, enforcementEnabled)"
  - phase: 111-billing-config
    provides: "getBillingConfig() runtime reader — the one configurable home for seat numbers"
provides:
  - "buildSeatCostSummary — server-side seat-cost summary builder (lib/billing/seat-cost-summary.ts) reusing the Phase-139 pure seat math over getBillingConfig"
  - "Settings → Team seat-cost transparency line (active/included/billable seats · per-seat price · projected monthly cost), owner/admin-only, mobile-safe, i18n en/pt/es"
  - "Truthful 'not yet active' disclosure when enforcementEnabled is false"
affects: [billing, seats, settings-team, future-seat-calibration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Display-only summary builder reuses the same pure math the billing sync uses, so a disclosed number can never diverge from what would be charged"
    - "RSC computes the summary server-side and gates it by canManage (owner/admin) — null prop means do-not-render in the client component"
    - "Static readFileSync source guard asserts no hardcoded dollar/seat literal in the rendered copy"

key-files:
  created:
    - lib/billing/seat-cost-summary.ts
    - tests/unit/billing/seat-cost-summary.test.ts
    - tests/unit/settings/team-page-seat-cost.test.ts
    - tests/unit/settings/team-section-no-hardcode.test.ts
  modified:
    - app/(app)/settings/(tabs)/team/page.tsx
    - components/settings/team-section.tsx
    - tests/unit/billing/billing-config.test.ts

key-decisions:
  - "Seat-cost summary builder is a thin server-only wrapper that REUSES computeBillableSeats/computeSeatChargeCents — no inline arithmetic, so the disclosed monthly cost reconciles exactly to the Phase-139 seat-quantity sync"
  - "The cost line is owner/admin-only via the existing canManage gate; the page passes null for plain members so TeamSection renders nothing (consistent with the manage gate)"
  - "Every seat number comes from getBillingConfig at runtime; the static no-hardcode test forbids any $-prefixed literal or seatPriceCents/monthlyCents numeric assignment in the component"

patterns-established:
  - "Transparency surface = pure-math reuse + runtime config read + static no-hardcode guard"
  - "billing-config BILLCFG-03 boundary guard gets an explicit allowlist entry per sanctioned new getBillingConfig consumer"

requirements-completed: [SEAT-08]

# Metrics
duration: 20min
completed: 2026-06-25
---

# Phase 140 Plan 01: Seat-Cost Transparency UI Summary

**Owner/admin Settings → Team line showing active/included/billable seats, the configured per-seat price, and the projected monthly seat cost — all read from billing_config at runtime via a server-side builder that reuses the Phase-139 pure seat math, with a truthful "not yet active" note while enforcement is off.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-06-25T20:08:53Z
- **Completed:** 2026-06-25T20:28:33Z
- **Tasks:** 3
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments
- `buildSeatCostSummary(companyId, activeMembers)` — server-only summary builder that reads `getBillingConfig()` + the company tier and reuses `computeBillableSeats`/`computeSeatChargeCents` (no inline math), returning `{ activeSeats, includedSeats, billableSeats, perSeatCents, monthlyCents, enforcementEnabled }`. Null-safe on a bad/null tier (falls back to free `includedSeats`, never throws).
- Team server page computes the summary from `roster.members.length` for owner/admin only (single-line `canManage ? await buildSeatCostSummary(...) : null`) and passes `seatCost` to `TeamSection`.
- `TeamSection` renders a mobile-safe, i18n (en/pt/es via `t()`) seat-cost card from the prop through `formatUSD`, with a muted "Seat billing is not yet active — this is an estimate." note when `enforcementEnabled` is false. Plain members never see the line.
- Retrocompat preserved: a single-owner org within `includedSeats` shows billable 0 / `$0.00` (no alarming charge).

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure server-side seat-cost summary builder + unit test (TDD)** - `1d364324` (feat) — RED+GREEN combined; the test file is a plan deliverable
2. **Task 2: Wire the summary into the team server page + server-compute test** - `4e57bf68` (feat)
3. **Task 3: Render the seat-cost summary line in TeamSection + no-hardcode static test** - `97da2c62` (feat)
4. **Deviation fix: allowlist seat-cost-summary in the getBillingConfig boundary guard** - `178392f1` (fix)

_Plan metadata commit follows this summary._

## Files Created/Modified
- `lib/billing/seat-cost-summary.ts` (created) - `buildSeatCostSummary` + `SeatCostSummary` type; server-only; reuses the pure seat math over runtime config.
- `tests/unit/billing/seat-cost-summary.test.ts` (created) - unit test: single-owner→$0 retrocompat, multi-seat→4500, pure-function reconciliation, unknown/null-tier→free fallback.
- `app/(app)/settings/(tabs)/team/page.tsx` (modified) - computes `seatCost` for owner/admin only; passes it to `TeamSection`.
- `tests/unit/settings/team-page-seat-cost.test.ts` (created) - RSC server-compute test proving call args + the manager gate (owner/admin vs member).
- `components/settings/team-section.tsx` (modified) - renders the seat-cost card from the prop via `formatUSD`, i18n, mobile-safe, truthful-when-off note.
- `tests/unit/settings/team-section-no-hardcode.test.ts` (created) - static readFileSync guard: prop-rendered money, no `$`-literal or numeric seat-field assignment in copy.
- `tests/unit/billing/billing-config.test.ts` (modified) - added `seat-cost-summary.ts` to the BILLCFG-03 `getBillingConfig` consumer allowlist (deviation fix).

## Decisions Made
- Reuse the Phase-139 pure seat functions rather than re-deriving the math, so the disclosed figure can never diverge from the seat-quantity sync charge.
- Gate the cost line at the page (null prop) rather than inside the client component, keeping the manage gate in one place.
- Use English source strings with the existing runtime `t()` translation pipeline (staticDict → /api/translate fallback); no manual locale-file edits needed for en/pt/es.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Stale BILLCFG-03 boundary guard rejected the new sanctioned consumer**
- **Found during:** Full-suite verification after Task 3
- **Issue:** `tests/unit/billing/billing-config.test.ts` enforces an explicit allowlist of files that may reference the `getBillingConfig` symbol. The new `lib/billing/seat-cost-summary.ts` (a legitimate, plan-sanctioned consumer) and a comment in the team page tripped it, failing the suite in isolation (a real regression, not a parallel-import flake).
- **Fix:** Added `lib/billing/seat-cost-summary.ts` to the guard's ALLOWLIST with a Phase-140 rationale comment (mirroring how Phase 139 added `seat-billing.ts`); reworded the team page comment so it no longer references the `getBillingConfig` symbol (the page calls `buildSeatCostSummary` transitively, never `getBillingConfig`), keeping the page off the allowlist.
- **Files modified:** tests/unit/billing/billing-config.test.ts, app/(app)/settings/(tabs)/team/page.tsx
- **Verification:** `npx vitest run tests/unit/billing/billing-config.test.ts` → 23 passed.
- **Committed in:** `178392f1`

---

**Total deviations:** 1 auto-fixed (1 bug — stale test allowlist).
**Impact on plan:** Necessary to keep the existing architectural-boundary guard green for a sanctioned new consumer. No scope creep — display-only, no billing mutation added.

## Issues Encountered
- Full `npx vitest run` shows 1 flaking file per run among `team-invite`, `seat-billing-wiring`, `mcp-route-contract` — the documented Windows parallel-import timeout flakes. All three pass in isolation and are unrelated to this plan's files. Confirmed by running each individually (all green).

## Verification
- `npx vitest run tests/unit/billing/seat-cost-summary.test.ts tests/unit/settings/team-page-seat-cost.test.ts tests/unit/settings/team-section-no-hardcode.test.ts` → all 3 suites pass (13 tests).
- `npx tsc --noEmit` → no type errors in the three touched source files (the 17 remaining errors are pre-existing in unrelated test files and out of scope).
- Scope-fence grep (`syncSeatBilling|stripe|subscriptions|saveBillingConfig`) over the builder + page + component → nothing; display-only, no mutation.
- No secrets introduced (all numbers are config-driven at runtime).

## Manual Verification Pending (headless)
Headless execution could not visually confirm the rendered UI. A human should verify on a mobile viewport (iOS Safari / Android Chrome):
- Owner/admin sees the seat-cost card below the Team header; a plain member does not.
- The card stacks correctly on narrow screens (flex-col → sm:flex-row) and figures are not clipped.
- The "Seat billing is not yet active — this is an estimate." note shows while `enforcementEnabled` is false.
- Labels translate under pt/es language toggles.

## User Setup Required
None - no external service configuration required. Seat price and included-seat counts are configured in `billing_config` (Phase 111 admin panel); this plan only displays them.

## Next Phase Readiness
- SEAT-08 complete. This is the FINAL plan of v4.12 — phase 140 is ready for verification.
- No blockers. Seat-cost disclosure now mirrors the SEED-036 1%-fee transparency principle; future seat calibration (flipping `enforcementEnabled` on, setting the real `seatPriceCents`) requires no UI change — the line updates from config at runtime.

## Self-Check: PASSED

All claimed files exist on disk and all task commits are present in history:
- Files: lib/billing/seat-cost-summary.ts, app/(app)/settings/(tabs)/team/page.tsx, components/settings/team-section.tsx, tests/unit/billing/seat-cost-summary.test.ts, tests/unit/settings/team-page-seat-cost.test.ts, tests/unit/settings/team-section-no-hardcode.test.ts — all FOUND.
- Commits: 1d364324, 4e57bf68, 97da2c62, 178392f1 — all FOUND.

---
*Phase: 140-seat-cost-ui*
*Completed: 2026-06-25*
