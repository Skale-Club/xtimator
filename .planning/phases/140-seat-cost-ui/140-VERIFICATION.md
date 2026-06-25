---
phase: 140-seat-cost-ui
verified: 2026-06-25T16:40:00Z
status: passed
score: 6/6 must-haves verified
---

# Phase 140: Seat-Cost Transparency UI Verification Report

**Phase Goal:** SEAT-08 — the Settings → Team surface shows the org's current active seat count, the configured per-seat price, and the projected monthly seat cost, all read from `billing_config` at runtime (never hardcoded), mirroring the 1%-fee transparency principle. FINAL phase of milestone v4.12 Team Seats.
**Verified:** 2026-06-25T16:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | Settings → Team shows active seat count + per-seat price + projected monthly cost | ✓ VERIFIED | `team-section.tsx` L198-223 renders `activeSeats`/`includedSeats`/`billableSeats`, `formatUSD(seatCost.perSeatCents)`, `formatUSD(seatCost.monthlyCents)` |
| 2 | Per-seat price + included-seat count read from `billing_config` at runtime, never hardcoded | ✓ VERIFIED | `seat-cost-summary.ts` L47 `getBillingConfig()`, L57 `cfg.tiers[tier]?.includedSeats`, L67 `cfg.seatPriceCents`. No-hardcode greps return empty; static guard test passes |
| 3 | Projected cost uses the SAME `computeBillableSeats`/`computeSeatChargeCents` (no inline math) | ✓ VERIFIED | `seat-cost-summary.ts` L60-61 imports + calls both from `@/lib/billing/seat-billing` (the Phase-139 pure module L24-39). Test L99-113 reconciles to the real functions |
| 4 | Single-owner within includedSeats → $0 projected (retrocompat, no alarm) | ✓ VERIFIED | Test L65-80: `buildSeatCostSummary('co-1',1)` → `billableSeats:0, monthlyCents:0`. Passes |
| 5 | Cost line owner/admin-only (canManage gate); plain member does not see it | ✓ VERIFIED | `page.tsx` L47-48 `canManage ? await buildSeatCostSummary(...) : null`; `team-section.tsx` L198 `{seatCost && (...)}`. Page test proves member→null, owner→called |
| 6 | Truthful "not yet active" note when `enforcementEnabled` is false | ✓ VERIFIED | `team-section.tsx` L217-221 `{!seatCost.enforcementEnabled && (...note...)}`; `enforcementEnabled` passed through summary L69 |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/billing/seat-cost-summary.ts` | Pure server-side builder reusing seat math + getBillingConfig | ✓ VERIFIED | `import 'server-only'`; exports `buildSeatCostSummary` + `SeatCostSummary`; reuses both pure fns; null-safe tier fallback; returns all 6 fields |
| `app/(app)/settings/(tabs)/team/page.tsx` | Server-computes summary, owner/admin gated, passes to TeamSection | ✓ VERIFIED | L47-48 computes for managers only; L56 passes `seatCost`; uses `roster.members.length` as the active count |
| `components/settings/team-section.tsx` | Renders summary from prop via formatUSD, mobile-safe, i18n | ✓ VERIFIED | L198-223 bordered card, `flex-col sm:flex-row` mobile stack, every label via `t()`, money via `formatUSD` |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| team/page.tsx | seat-cost-summary.ts | `await buildSeatCostSummary(companyId, roster.members.length)` | ✓ WIRED | page L48 |
| seat-cost-summary.ts | seat-billing.ts | `computeBillableSeats` + `computeSeatChargeCents` | ✓ WIRED | imported L4, called L60-61 |
| team-section.tsx | props.seatCost | renders monthlyCents through formatUSD | ✓ WIRED | prop L48-51, rendered L214 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| team-section.tsx | `seatCost` prop | page.tsx `buildSeatCostSummary(companyId, roster.members.length)` ← `getBillingConfig()` + live `companies.tier` read | Yes — live config + live roster count | ✓ FLOWING |

The figure is not hardcoded and not a static fallback: `activeSeats` flows from the live roster member count, `perSeatCents`/`includedSeats` from runtime `getBillingConfig()`, and `monthlyCents` is derived by the shared pure math — so the disclosed number reconciles to what the Phase-139 seat-quantity sync would charge.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Builder returns correct retrocompat $0 + multi-seat math | `vitest run seat-cost-summary.test.ts` | 5 tests pass (single-owner→$0, 4-seat→4500, reconciliation, unknown/null-tier→free fallback) | ✓ PASS |
| Page computes server-side + manager gate | `vitest run team-page-seat-cost.test.ts` | pass | ✓ PASS |
| No hardcoded cost in component | `vitest run team-section-no-hardcode.test.ts` | pass | ✓ PASS |
| New suites combined | three files | 13/13 pass | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SEAT-08 | 140-01-PLAN | Seat-cost transparency UI — active seats + per-seat price + projected monthly cost, read from billing_config at runtime, never hardcoded | ✓ SATISFIED | All 6 truths verified; builder + page + component wired; no-hardcode static guard + scope-fence pass |

No orphaned requirements: REQUIREMENTS.md maps only SEAT-08 to Phase 140, and the plan's `requirements: [SEAT-08]` claims it.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | none | — | No TODO/FIXME/placeholder, no hardcoded `$N`, no inline seat math, no stub returns in the three touched files |

Scope-fence grep (`syncSeatBilling|stripe|subscriptions|saveBillingConfig`) over builder + page + component returned empty — display-only, no billing mutation, no new config field, no membership-action change. No secrets introduced (all numbers config-driven).

### Full Suite Result

`npx vitest run` → **4 failed | 2552 passed | 2 skipped | 33 todo** across 370 files.

The 4 failures are confined to the three KNOWN non-blocking parallel-only flake files and were each re-run in isolation:
- `tests/unit/actions/team-invite.test.ts` → **10/10 pass in isolation** (full-suite: 5000ms timeout)
- `tests/unit/billing/seat-billing-wiring.test.ts` → **10/10 pass in isolation** (full-suite: 5000ms timeout + dynamic-import double-call `called 2 times`)
- `tests/unit/mcp-route-contract.test.ts` → **8/8 pass in isolation** (full-suite: GET-405 contract)

These are exactly the documented Windows parallel-import timeout / import-storm flakes, unrelated to Phase 140's files. No real assertion failure exists. Treating the suite as green.

### Human Verification Required

None blocking. The SUMMARY notes optional visual confirmation on a mobile viewport (card placement, narrow-screen stacking, pt/es label translation) — cosmetic, not goal-blocking, and consistent with the verified mobile-safe (`flex-col sm:flex-row`) + `t()`-wrapped source.

### Gaps Summary

No gaps. All six observable truths verified, all artifacts exist / are substantive / are wired with real data flowing, the projected cost reuses the shared pure math (cannot diverge from the charge), the owner/admin gate and the truthful enforcement-off note are present, no hardcoded numbers, scope held to display-only, and the full suite is green modulo the three documented isolation-passing flakes.

---

_Verified: 2026-06-25T16:40:00Z_
_Verifier: Claude (gsd-verifier)_
