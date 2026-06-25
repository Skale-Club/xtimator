---
phase: 141-annual-pricing-config
plan: 01
subsystem: payments
tags: [billing, stripe, annual-pricing, zod, admin-config, react]

# Dependency graph
requires:
  - phase: 139-seat-billing
    provides: "the proven configurable-field shape (seatPriceCents global + tiers[tier].includedSeats per-tier) mirrored verbatim here"
provides:
  - "BillingConfig.seatPriceAnnualCents (global annual per-seat price, integer cents, CALIBRATE-BEFORE-CHARGING placeholder)"
  - "TierBilling.subscriptionPriceAnnualCents (per-tier annual subscription price, integer cents, placeholder)"
  - "billingConfigSchema accepts both annual fields (.int().min(0)); rejects negative/non-integer"
  - "super-admin billing panel edits both annual fields and saves them"
  - "static no-hardcode guard: annual price literals live ONLY in billing-config.ts"
affects: [142-credit-grant-cron, 143-annual-checkout, 144-interval-aware-seat-billing, 145-pricing-ui-toggle]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Annual price fields mirror the Phase-139 seat-config idiom exactly (type + DEFAULT placeholder + zod .int().min(0) + admin-form string<->number wiring + deep-merge tolerance + static no-hardcode test)"
    - "Discount % is DERIVED at render (Phase 145), NEVER stored — only monthly + annual price fields exist in config"

key-files:
  created:
    - "tests/unit/billing/annual-config-no-hardcode.test.ts"
  modified:
    - "lib/billing/billing-config.ts"
    - "lib/schemas/admin.ts"
    - "app/admin/integrations/billing-config-form.tsx"
    - "tests/unit/billing/billing-config.test.ts"

key-decisions:
  - "No discountPct/annualDiscountPct stored anywhere — discount is derived (1 − annual/(12×monthly)) at render in Phase 145"
  - "Annual defaults are CALIBRATE-BEFORE-CHARGING placeholders ≈10× monthly (pro 29000, business 99000, free/trial 0, seat 15000) so the later-derived discount is visible"
  - "getBillingConfig deep-merge block left byte-unchanged — pre-existing rows with no tiers key fall through to DEFAULT.tiers (Pitfall-6 tolerance)"
  - "BILLCFG-03 getBillingConfig consumer allowlist untouched — this plan adds config FIELDS only, no new runtime consumer"

patterns-established:
  - "Annual-price configurability follows the seat-config (Phase 139) shape one-for-one"

requirements-completed: [ANN-01]

# Metrics
duration: 7min
completed: 2026-06-25
---

# Phase 141 Plan 01: Configurable Annual Pricing Summary

**Per-tier annual subscription price + global annual per-seat price are now fully configurable in the super-admin billing panel (integer-cents placeholders, zero hardcoded annual numbers), mirroring the Phase-139 seat-config shape; the discount % stays derived, never stored.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-06-25T17:45:00Z
- **Completed:** 2026-06-25T17:52:00Z
- **Tasks:** 4
- **Files modified:** 4 (3 source + 1 test) + 1 test created

## Accomplishments
- Extended `BillingConfig` with global `seatPriceAnnualCents` and `TierBilling` with per-tier `subscriptionPriceAnnualCents`, both as documented CALIBRATE-BEFORE-CHARGING placeholders in `DEFAULT_BILLING_CONFIG` (≈10× monthly for paid tiers, 0 for free/trial).
- Mirrored both fields in `billingConfigSchema` / `tierBillingSchema` as `z.number().int().min(0)` (no upper bound that would reject a sane annual price).
- Surfaced both as editable, mobile-safe inputs in the billing-config admin form, wired into the typed `BillingConfig` save payload (TS enforces presence).
- Locked the no-hardcode invariant: deep-merge tolerance tests for pre-existing rows + a new static source-grep test asserting annual price literals live only in `billing-config.ts`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend BillingConfig + DEFAULT with annual price fields** - `bd17a7cc` (feat)
2. **Task 2: Mirror annual fields in billingConfigSchema** - `a2ff4d2b` (feat)
3. **Task 3: Add editable annual fields to admin form** - `9d48cced` (feat)
4. **Task 4: Deep-merge + no-hardcode tests** - `43871b2e` (test)

## Files Created/Modified
- `lib/billing/billing-config.ts` - Added `seatPriceAnnualCents` (global) + `subscriptionPriceAnnualCents` (per-tier) to types + DEFAULT placeholders; deep-merge block unchanged.
- `lib/schemas/admin.ts` - Added both annual fields to `tierBillingSchema` + `billingConfigSchema` (`.int().min(0)`).
- `app/admin/integrations/billing-config-form.tsx` - Added annual-seat-price input (Seat billing → 2-col grid) + per-tier annual-subscription input (per-tier row → 5-col); wired state, `updateTier` union, and save payload.
- `tests/unit/billing/billing-config.test.ts` - Added `ANN-01: annual price deep-merge` describe (4 cases) + 2 schema-rejection cases.
- `tests/unit/billing/annual-config-no-hardcode.test.ts` - New static source guard (mirror of seat-config-no-hardcode).

## Decisions Made
- Discount % is never stored (derived in Phase 145); only price fields added.
- Annual defaults documented as calibration placeholders, not final pricing.
- Deep-merge block kept byte-identical to preserve pre-existing-row tolerance.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. The repo has 17 pre-existing `tsc` errors in unrelated test files (whatsapp/estimate/ai/calibration/seat-billing test mocks); confirmed identical count at the pre-change baseline (`bd17a7cc~1`), so this plan introduced zero new type errors. The 3 modified source files are tsc-clean; all 240 billing tests pass.

## Known Stubs
None. The annual defaults are intentional, documented calibration placeholders (not data stubs) — calibrated before charging in a later phase, exactly like the existing monthly defaults.

## User Setup Required
None - no external service configuration required this plan. (Calibration of the annual prices + flipping `enforcementEnabled` remains a milestone-level operational deferral, handled when the annual rail is wired in Phases 143–145.)

## Next Phase Readiness
- The annual price + annual seat price config foundation is in place for Phase 142 (credit-grant cron), Phase 143 (annual checkout — reads `subscriptionPriceAnnualCents`), Phase 144 (interval-aware seat billing — reads `seatPriceAnnualCents`), and Phase 145 (pricing UI toggle + derived discount).
- The `annual-config-no-hardcode` static test is GREEN now and will stay green once 143/144/145 wire their consumers to READ `getBillingConfig` rather than hardcode.

## Self-Check: PASSED

All 5 source/test files and the SUMMARY exist on disk; all 4 task commits (`bd17a7cc`, `a2ff4d2b`, `9d48cced`, `43871b2e`) are present in git history.

---
*Phase: 141-annual-pricing-config*
*Completed: 2026-06-25*
