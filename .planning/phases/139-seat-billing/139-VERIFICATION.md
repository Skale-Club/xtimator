---
phase: 139-seat-billing
verified: 2026-06-25T16:00:00Z
status: gaps_found
score: 7/8 must-haves verified
gaps:
  - truth: "Existing billing-config tests stay green (Plan 01 success criterion) — saveBillingConfig accepts a calibrated config and flips enforcementEnabled:true"
    status: failed
    reason: >
      Plan 01 Task 2 added `includedSeats` as a REQUIRED field to `tierBillingSchema`
      in lib/schemas/admin.ts, but the pre-existing test fixture in
      tests/unit/admin/charge-on-gate.test.ts (the PASSING_ON config, lines 88-92)
      builds its pro/business tier overrides WITHOUT includedSeats. The now-required
      field makes billingConfigSchema.safeParse reject the fixture
      (tiers.pro.includedSeats: invalid_type, tiers.business.includedSeats: invalid_type),
      so saveBillingConfig returns { ok: false } and the test's expect(res.ok).toBe(true)
      fails. This reproduces in ISOLATION (not a parallel-timeout flake) — it is a real
      regression introduced by this phase's schema tightening.
    artifacts:
      - path: "tests/unit/admin/charge-on-gate.test.ts"
        issue: "PASSING_ON fixture (lines 88-92) omits includedSeats on the pro/business tier overrides, which billingConfigSchema now requires"
    missing:
      - "Add includedSeats to the pro and business tier objects in the PASSING_ON fixture (e.g. includedSeats: 1), matching the new required schema field — this restores the calibrated-passing save assertion."
---

# Phase 139: Configurable Seat Billing Verification Report

**Phase Goal:** Make per-seat price + per-tier included-seat counts fully configurable (SEAT-06) and add gated, idempotent, never-throw seat-billing sync wired into membership mutations (SEAT-07), with nothing hardcoded.
**Verified:** 2026-06-25T16:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | getBillingConfig() resolves seatPriceCents + tiers[tier].includedSeats with calibration placeholders; pre-existing row deep-merges to defaults | ✓ VERIFIED | billing-config.ts L38/65 (seatPriceCents:1500), L69-72 (includedSeats:1 per tier), deep-merge L122-126 unchanged; billing-config.test.ts SEAT-06 deep-merge cases green |
| 2   | Super-admin can edit seatPriceCents + each tier's includedSeats and save | ✓ VERIFIED | admin.ts L145 (includedSeats z.int.min(0)), L155 (seatPriceCents); billing-config-form.tsx state L39/48, payload L107/113, inputs L232/282-283 — payload typed BillingConfig, compiles |
| 3   | No seat price / included-seat count hardcoded outside billing-config.ts (static test) | ✓ VERIFIED | seat-config-no-hardcode.test.ts forbidden patterns over seat-billing.ts + team.ts + invite-accept.ts; 2 tests green |
| 4   | computeBillableSeats = max(0, members−included); computeSeatChargeCents = seats × price (unit-tested goldens incl. members<=included → 0) | ✓ VERIFIED | seat-billing.ts L24-39 pure; seat-billing.test.ts goldens green |
| 5   | syncSeatBilling reads members+tier+config, gated by enforcementEnabled (false → NO Stripe write), idempotent, never-throws; unit_amount from seatPriceCents, no hardcoded Price ID | ✓ VERIFIED | seat-billing.ts L70-131 (try/catch swallow L127-130, gate L102, zero-billable L104, no-sub L106, idempotency L113-121); stripe-client.ts inline price_data L72-94 via ensureSeatProduct (no hardcoded Price ID); tests green |
| 6   | Wired into SUCCESS path of acceptInvite + removeMember + changeMemberRole; billing failure never fails membership change | ✓ VERIFIED | invite-accept.ts L112-116 (before return success), team.ts L253-257 (removeMember) + L318-322 (changeMemberRole), all guarded try/catch on success path only; wiring test green in isolation |
| 7   | Retrocompat: single-owner within includedSeats → zero billable, no write (tested) | ✓ VERIFIED | seat-billing.ts L104 short-circuit; seat-billing.test.ts retrocompat case green |
| 8   | Existing billing-config / admin tests stay green | ✗ FAILED | charge-on-gate.test.ts "ALLOW a passing enforcementEnabled flip" fails in ISOLATION — required includedSeats schema field rejects an unupdated fixture |

**Score:** 7/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/billing/billing-config.ts` | seatPriceCents + per-tier includedSeats + deep-merge | ✓ VERIFIED | Fields + placeholders present; merge byte-unchanged |
| `lib/schemas/admin.ts` | seatPriceCents + includedSeats in schema | ✓ VERIFIED | L145, L155 — both `.int().min(0)`; includedSeats now REQUIRED (root of gap) |
| `app/admin/integrations/billing-config-form.tsx` | editable fields | ✓ VERIFIED | state/payload/inputs present, typed-BillingConfig payload compiles |
| `lib/billing/seat-billing.ts` | 3 exports, pure math + gated sync | ✓ VERIFIED | All present, no hardcoded numbers |
| `lib/billing/stripe-client.ts` | thin syncSubscriptionSeatItem, config-driven price | ✓ VERIFIED | Inline price_data, metadata-tagged item, no hardcoded Price ID |
| `tests/unit/billing/seat-config-no-hardcode.test.ts` | static no-hardcode assertion | ✓ VERIFIED | Green |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| billing-config-form | billingConfigSchema | seatPriceCents + includedSeats in payload | ✓ WIRED | Typed BillingConfig payload; tsc clean |
| seat-billing.syncSeatBilling | getBillingConfig + members + tier | service-client reads, gated by enforcementEnabled | ✓ WIRED | L72-104 |
| seat-billing.syncSeatBilling | Stripe seat item | syncSubscriptionSeatItem only when enforcement ON + qty changed | ✓ WIRED | L113-126 |
| acceptInvite / removeMember / changeMemberRole | syncSeatBilling | guarded call on success path | ✓ WIRED | invite-accept L112, team L253/L318 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase-139 targeted suites | `vitest run seat-billing*.test.ts seat-config-no-hardcode billing-config.test.ts` | 4 files, 57 tests passed | ✓ PASS |
| Production type-check | `tsc --noEmit` grep phase-139 source | NO type errors in production files | ✓ PASS |
| charge-on-gate (isolation) | `vitest run charge-on-gate.test.ts` | 1 failed / 22 passed — reproduces in isolation | ✗ FAIL |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| SEAT-06 | 139-01 | Configurable seatPriceCents + per-tier includedSeats, nothing hardcoded | ✓ SATISFIED | Config/schema/form/static-test all verified |
| SEAT-07 | 139-02, 139-03 | Seat math + gated never-throw sync, wired into membership mutations | ✓ SATISFIED | Pure math, gated sync, 3 wired call sites — all verified |

Note: REQUIREMENTS.md marks SEAT-06 as Pending and SEAT-07 Complete; the implementation evidence shows SEAT-06's deliverables are present. The phase status block should be reconciled after the gap below is closed.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| tests/unit/billing/seat-billing.test.ts | 92, 223, 291 | tsc TS2556/TS2352 in mock-spy arg assertions | ℹ️ Info | Test compiles loosely under vitest runtime and passes; not in production source. Cosmetic typing debt, non-blocking. |

### Human Verification Required

None — all gaps and passes determined programmatically.

### Gaps Summary

One real regression blocks goal completion. Phase 139 Plan 01 made `includedSeats` a
REQUIRED field on `tierBillingSchema`, but the pre-existing
`tests/unit/admin/charge-on-gate.test.ts` PASSING_ON fixture builds its `pro`/`business`
tier overrides without it. As a result `saveBillingConfig` now rejects that calibrated
config and the "ALLOW a passing enforcementEnabled flip" assertion fails — confirmed in
ISOLATION (parse errors: `tiers.pro.includedSeats: invalid_type`,
`tiers.business.includedSeats: invalid_type`), so it is NOT one of the documented
parallel-timeout flakes.

The phase's own success criterion "existing billing-config tests stay green" is therefore
not met. The fix is a one-line-per-tier fixture update (add `includedSeats: 1` to the
pro/business overrides in PASSING_ON). All other phase deliverables (SEAT-06 config/schema/form,
SEAT-07 math/sync/wiring/retrocompat) are fully verified and pass.

Full-suite run: 5 failures observed under parallel load; 4 are the documented
timeout-class flakes that pass in isolation (`team-invite.test.ts`,
`seat-billing-wiring.test.ts` removeMember timeout + a knock-on double-call assertion that
clears on isolated rerun). The 5th — `charge-on-gate.test.ts` — is the real regression above.

---

_Verified: 2026-06-25T16:00:00Z_
_Verifier: Claude (gsd-verifier)_


---
## Resolution (2026-06-25)
The blocking regression (charge-on-gate PASSING_ON fixture missing includedSeats after the tierBilling schema widened) was fixed by adding includedSeats:1 to the pro/business fixture tiers (commit follows). Re-ran: charge-on-gate + billing-config + seat-config-no-hardcode = 28/28 green. The 4 remaining full-suite failures (team-invite, seat-billing-wiring, mcp-route-contract) ALL pass in isolation (10/10, 10/10, 8/8) — documented Windows parallel-import-storm timeout class. Phase 139 goal achieved; SEAT-06 + SEAT-07 satisfied.
