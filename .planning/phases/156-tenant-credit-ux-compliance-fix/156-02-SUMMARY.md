---
phase: 156-tenant-credit-ux-compliance-fix
plan: 02
subsystem: ui
tags: [billing, pricing, react, vitest, static-contract-test]

# Dependency graph
requires:
  - phase: 145-pricing-ui-toggle
    provides: "monthlyPricesCents/annualPrices props on TierCardsGrid, getAnnualDisplay pattern"
provides:
  - "TierCardsGrid monthly price sourced from billing_config.tiers[tier].subscriptionPriceCents at render time (via existing monthlyPricesCents prop), matching the annual-price sourcing pattern"
  - "Feature-bullet accuracy pass against lib/entitlements.ts — 5 factually-wrong bullets corrected, 2 unverifiable bullets documented in-code"
  - "Static-contract test guarding the monthly-price fix against regression, mirroring the existing annual-price guard"
affects: [158-admin-billing-overhaul]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "getMonthlyPriceDisplay(tier, fallback) helper mirrors getAnnualDisplay(tier) — config-sourced price with a defensive static fallback, never a bare hardcoded literal"

key-files:
  created: []
  modified:
    - components/billing/tier-cards-grid.tsx
    - tests/unit/billing/pricing-ui-no-hardcode.test.ts

key-decisions:
  - "Free tier's '$0' price stays a static literal (structurally can never be non-zero); pro/business price fields removed entirely from TIERS and derived at render time via monthlyPricesCents"
  - "Free 'estimates' bullet reworded to qualitative 'Estimates until your free credits run out' instead of inventing an unbacked numeric cap, consistent with the CREDITFIX-01 no-raw-numbers spirit"
  - "'WhatsApp delivery' removed from Pro's feature list — whatsappEnabled is true for all 3 tiers in lib/entitlements.ts, so listing it as a Pro differentiator was misleading"
  - "'Custom branding' and 'Stripe Connect payments' left unchanged but flagged in a code comment as unverifiable against any code-level gate (zero grep matches) — new gating logic is out of scope for this phase"

patterns-established:
  - "In-code verification-pass comment above a hardcoded marketing-copy array documents what was checked against ground-truth code and why remaining items stay static — reusable pattern for future audits of TierCardsGrid or similar copy blocks"

requirements-completed: [CREDITFIX-03]

# Metrics
duration: 12min
completed: 2026-07-06
---

# Phase 156 Plan 02: Tier Pricing/Feature Reconciliation Summary

**TierCardsGrid's monthly price now reads live from billing_config via the existing monthlyPricesCents prop (closing the same drift risk already closed for annual prices), and 5 factually-wrong feature bullets were corrected against lib/entitlements.ts ground truth.**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-06T04:06:00Z (approx, plan execution start)
- **Completed:** 2026-07-06T04:18:56Z
- **Tasks:** 3 completed
- **Files modified:** 2

## Accomplishments
- Monthly price for Pro/Business tiers is now derived from `billing_config.tiers[tier].subscriptionPriceCents` at render time via a new `getMonthlyPriceDisplay` helper, mirroring the existing `getAnnualDisplay` pattern — an admin-panel price edit can no longer silently desync the Plans page.
- Verified every feature bullet in `TIERS` against `lib/entitlements.ts`'s actual tier-gating code; corrected the 5 bullets found to be factually wrong (free estimates count, free photos, pro photos, pro WhatsApp-exclusivity claim, business "unlimited" photos).
- Documented the 2 unverifiable bullets (Custom branding, Stripe Connect payments — no code-level gate exists for either) in a code comment as checked-but-flagged, so a future phase can decide whether to implement the gate or soften the copy.
- Added a static-contract test (`pricing-ui-no-hardcode.test.ts`) guarding the monthly-price fix, mirroring the existing annual-price guard — 7 tests now pass in that file (5 existing + 2 new).

## Task Commits

Each task was committed atomically (Tasks 1 and 2 landed in a single commit since both edits were applied to the same contiguous block of `tier-cards-grid.tsx` in one pass — the diff is coherent and independently reviewable):

1. **Task 1 + Task 2: Source monthly price from billing_config + correct feature bullets** - `e176be2b` (feat)
2. **Task 3: Add static-contract test for monthly-price sourcing** - `97ec52d9` (test)

**Plan metadata:** (pending — see final commit below)

## Files Created/Modified
- `components/billing/tier-cards-grid.tsx` - Removed hardcoded `price: '$29'/'$99'` literals; added `getMonthlyPriceDisplay(tier, fallback)` helper deriving the monthly price from the `monthlyPricesCents` prop; corrected 5 feature bullets against `lib/entitlements.ts`; added a verification-pass doc comment above `TIERS`.
- `tests/unit/billing/pricing-ui-no-hardcode.test.ts` - Added 2 new tests: one asserting no hardcoded `$29`/`$99` price literals remain, one asserting the monthly price is derived from `monthlyPricesCents` via `getMonthlyPriceDisplay`.

## Decisions Made
- Free tier's `price: '$0'` stays a static literal by design (per the plan's explicit guidance) — it is structurally always `$0`, not a config-driven value that could legitimately drift.
- For pro/business, the `price` field was removed from `TIERS` entirely (not left as an unused fallback) — the fallback passed to `getMonthlyPriceDisplay` at the call site is `tierItem.price ?? '$0'`, which resolves to `'$0'` for those tiers only in the defensive case where `monthlyPricesCents` is absent (e.g. an isolated test render).
- The free "estimates" bullet was reworded to a qualitative claim rather than inventing a new unbacked numeric cap — consistent with the phase's broader "never show a raw/invented number" principle (CREDITFIX-01).
- `'WhatsApp delivery'` was removed from Pro's list rather than added to Free's list — minimal-diff fix per the plan's explicit guidance, since WhatsApp is enabled for all tiers and this phase's scope is correcting wrong claims, not redesigning marketing copy.
- `'Custom branding'` and `'Stripe Connect payments'` were left unchanged (not removed, not gated) since no code-level gate exists to verify against and adding new gating logic is out of scope this phase — flagged via code comment instead, per the plan's explicit "verified-and-flagged, not silently left wrong" instruction.

## Deviations from Plan

None - plan executed exactly as written. The `app/(app)/settings/billing/page.tsx` file required no changes: on inspection, it already computed `monthlyPricesCents` correctly from `cfg.tiers.pro.subscriptionPriceCents` / `cfg.tiers.business.subscriptionPriceCents` and passed it as a prop to `TierCardsGrid` (confirmed via grep before making any edit), exactly matching what the plan's Task 1 step 2 anticipated as the "no change needed" branch.

## Issues Encountered

While running the plan's full-suite verification (`npx vitest run tests/unit/billing/`), 2 test files failed (`auto-topup-dialog.test.tsx`, `credit-history-list.test.tsx`) with assertions unrelated to this plan's changes. Investigation via `git status` confirmed these are uncommitted, in-progress modifications from the concurrently-running 156-01 executor (touching `auto-topup-dialog.tsx`, `credit-history-list.tsx`, `topup-pack-card.tsx` — fully disjoint from this plan's scope of `tier-cards-grid.tsx`/`billing/page.tsx`). Confirmed out of scope per the plan-checker's disjoint-files clearance; not investigated or fixed here. Scoped verification (`pricing-ui-no-hardcode.test.ts`, `annual-config-no-hardcode.test.ts`, `entitlements.test.ts` — 34 tests) and `npx tsc --noEmit` (no errors in either file this plan touched) both pass cleanly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `TierCardsGrid` is now fully config-driven for both annual and monthly pricing views — no further pricing-drift risk remains in this component.
- The 2 flagged-but-unverifiable bullets (Custom branding, Stripe Connect payments) are documented in-code for Phase 158 (Admin Billing page overhaul) or a later phase to decide whether to implement real gating or soften the copy.
- No blockers for the rest of Phase 156 (156-01 running concurrently, confirmed disjoint) or subsequent phases.

---
*Phase: 156-tenant-credit-ux-compliance-fix*
*Completed: 2026-07-06*

## Self-Check: PASSED

- FOUND: components/billing/tier-cards-grid.tsx
- FOUND: tests/unit/billing/pricing-ui-no-hardcode.test.ts
- FOUND: .planning/phases/156-tenant-credit-ux-compliance-fix/156-02-SUMMARY.md
- FOUND commit: e176be2b
- FOUND commit: 97ec52d9
