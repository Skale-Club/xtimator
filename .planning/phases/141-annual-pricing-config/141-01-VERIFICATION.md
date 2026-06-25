---
phase: 141-annual-pricing-config
verified: 2026-06-25T18:00:00Z
status: gaps_found
score: 4/5 must-haves verified
gaps:
  - truth: "Existing billing/admin tests stay green after the schema change"
    status: failed
    reason: >
      Phase 141 made `subscriptionPriceAnnualCents` a REQUIRED field on
      `tierBillingSchema` (lib/schemas/admin.ts). The pre-existing test
      tests/unit/admin/charge-on-gate.test.ts builds a `PASSING_ON` fixture
      whose `pro`/`business` tier objects are constructed by hand (NOT spread
      from DEFAULT) and therefore omit the new required field. `saveBillingConfig`
      now fails zod safeParse on that payload and returns ok:false, so
      `expect(res.ok).toBe(true)` fails. Reproduces in isolation (NOT a flake),
      and the test file was not touched by this phase — a real regression
      introduced by the phase's schema change.
    artifacts:
      - path: "tests/unit/admin/charge-on-gate.test.ts"
        issue: >
          PASSING_ON fixture (lines 88-92) overrides tiers.pro and tiers.business
          with literals lacking subscriptionPriceAnnualCents; now rejected by the
          tightened tierBillingSchema. Test asserts res.ok === true and fails.
    missing:
      - "Add subscriptionPriceAnnualCents to the hand-built pro/business tier objects in the PASSING_ON fixture (e.g. subscriptionPriceAnnualCents: 0 or 29000/99000), OR spread ...DEFAULT_BILLING_CONFIG.tiers.pro / .business so all required tier fields are present."
---

# Phase 141: Configurable Annual Pricing Verification Report

**Phase Goal:** ANN-01 — make the per-tier ANNUAL subscription price and the global ANNUAL per-seat price fully configurable in the super-admin billing panel, with zero hardcoded billing numbers; deep-merge tolerant for pre-existing rows; discount NOT stored.
**Verified:** 2026-06-25T18:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | getBillingConfig() resolves seatPriceAnnualCents (global) + tiers[tier].subscriptionPriceAnnualCents (per-tier) with placeholder defaults | ✓ VERIFIED | billing-config.ts: type fields at L27 (TierBilling) + L41 (BillingConfig); DEFAULTs L70 seatPriceAnnualCents:15000, L77-80 per-tier (free/trial 0, pro 29000, business 99000) |
| 2 | A row written BEFORE these fields existed still deep-merges to placeholder defaults (Pitfall-6 tolerance) | ✓ VERIFIED | Deep-merge block L130-134 byte-unchanged vs parent (git diff empty); ANN-01 deep-merge describe in billing-config.test.ts passes (4 cases incl. pre-existing row + override + partial tiers) |
| 3 | A super-admin can edit seatPriceAnnualCents + each tier's subscriptionPriceAnnualCents in the panel and save | ✓ VERIFIED | billing-config-form.tsx: state L41-43 + L52, updateTier union L91, typed BillingConfig payload L122 + L128, two new inputs (Seat billing 2-col L255-265, per-tier 5-col L304-318) |
| 4 | No annual price is hardcoded outside billing-config.ts | ✓ VERIFIED | grep for `(seat\|subscription)PriceAnnualCents\s*[:=]\s*\d` outside billing-config.ts finds only test fixtures + planning docs; annual-config-no-hardcode.test.ts green |
| 5 | Existing billing/admin tests stay green; monthly path byte-identical | ✗ FAILED | charge-on-gate.test.ts fails (ok:false) — required new field breaks an untouched fixture; fails in isolation, not a flake |

**Score:** 4/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/billing/billing-config.ts` | annual fields on both types + DEFAULT placeholders + deep-merge untouched | ✓ VERIFIED | seatPriceAnnualCents x2, subscriptionPriceAnnualCents x6 (type + 4 tiers + comment), deep-merge unchanged, no discount field |
| `lib/schemas/admin.ts` | both annual fields `.int().min(0)`, reject negatives | ✓ VERIFIED | tierBillingSchema L145, billingConfigSchema L159; no discount field |
| `app/admin/integrations/billing-config-form.tsx` | both as editable fields, wired into typed payload | ✓ VERIFIED | state + updateTier union + payload + UI inputs all present; no discount input |
| `tests/unit/billing/annual-config-no-hardcode.test.ts` | static no-hardcode assertion | ✓ VERIFIED | created; mirrors seat version; FORBIDDEN_PATTERNS for both fields; green |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| billing-config-form.tsx | saveBillingConfig -> billingConfigSchema | payload includes both annual fields | ✓ WIRED | payload typed `BillingConfig` (L115) forces presence; TS-enforced |
| admin.ts tierBillingSchema | BillingConfig TierBilling type | subscriptionPriceAnnualCents on both | ✓ WIRED | field on schema L145 + type L27; DEFAULT round-trips through safeParse (test green) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Targeted phase tests | vitest billing-config + annual-no-hardcode | 31 passed | ✓ PASS |
| Deep-merge byte-unchanged | git diff bd17a7cc~1 HEAD on merge line | empty | ✓ PASS |
| Scope fence (only declared files) | git diff --name-only across phase commits | exactly 5 declared files | ✓ PASS |
| No discount stored | grep discountPct/annualDiscountPct in 3 source files | 0 matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| ANN-01 | 141-01 | Extend BillingConfig + DEFAULT with annual fields, mirror in zod, surface in panel, nothing hardcoded, deep-merge tolerant | ✓ SATISFIED (with side-effect) | All four artifacts verified; the ANN-01 feature itself is fully delivered. The regression is in an out-of-scope pre-existing test, not the ANN-01 deliverable. |

### Anti-Patterns Found

None in the phase source files. No TODO/FIXME/placeholder, no empty returns, no stubs. Annual defaults are documented CALIBRATE-BEFORE-CHARGING placeholders (intentional, mirror existing monthly defaults — not data stubs).

### Full Suite Result

`npx vitest run`: **5 failed | 2559 passed | 2 skipped | 33 todo** across 371 files.

Classification of the 5 failures:

| Test | File | Class |
| ---- | ---- | ----- |
| mcp-route GET-405 | tests/unit/mcp-route-contract.test.ts | KNOWN flake — passes in isolation (8/8) |
| removeMember timeout | tests/unit/billing/seat-billing-wiring.test.ts | KNOWN flake — passes in isolation (10/10) |
| removeMember double-call | tests/unit/billing/seat-billing-wiring.test.ts | KNOWN flake — passes in isolation (10/10) |
| upserts a calibrated PASSING config | tests/unit/admin/charge-on-gate.test.ts | **REAL regression** — fails in isolation (1 failed / 2 passed), caused by this phase |

The 3 allowlisted timeout-class flakes were re-run in isolation and ALL pass (confirmed green). The remaining failure is a real assertion failure introduced by phase 141.

### Gaps Summary

The ANN-01 feature is fully and correctly implemented — all five required artifacts exist, are substantive, are wired, and the no-hardcode/deep-merge/no-discount invariants hold. However, the phase tightened `tierBillingSchema` by adding `subscriptionPriceAnnualCents` as a required field, which silently broke a pre-existing, out-of-phase test: `tests/unit/admin/charge-on-gate.test.ts`. Its `PASSING_ON` fixture hand-builds `pro`/`business` tier objects (rather than spreading DEFAULT), so they now lack the required field and `saveBillingConfig` rejects them, failing `expect(res.ok).toBe(true)`. This reproduces in isolation, so it is not a flake. The plan's own success criterion "Existing billing-config tests stay green" is therefore not met for the full billing/admin test surface. Fix is a one-line fixture update (add `subscriptionPriceAnnualCents` to the two hand-built tiers, or spread DEFAULT tiers).

---

_Verified: 2026-06-25T18:00:00Z_
_Verifier: Claude (gsd-verifier)_


---
## Resolution
The charge-on-gate PASSING_ON fixture (missing subscriptionPriceAnnualCents after tierBilling schema widened) was fixed; charge-on-gate now 3/3 green. ANN-01 fully delivered.
