---
phase: 139-seat-billing
plan: 01
subsystem: billing
tags: [billing, seat-billing, config, admin-panel, SEAT-06]
requires: []
provides:
  - "BillingConfig.seatPriceCents (global) + TierBilling.includedSeats (per-tier) with calibration-placeholder defaults"
  - "billingConfigSchema validates seatPriceCents + per-tier includedSeats"
  - "super-admin billing form edits + saves both seat fields"
  - "static no-hardcode guard: seat numbers live only in billing-config.ts"
affects:
  - lib/billing/billing-config.ts
  - lib/schemas/admin.ts
  - app/admin/integrations/billing-config-form.tsx
tech-stack:
  added: []
  patterns:
    - "calibration-placeholder defaults (CALIBRATE BEFORE CHARGING) mirroring markup/estimateFeePct discipline"
    - "static source-grep invariant (readFileSync, no DB/secrets) modeled on neutrality.test.ts"
key-files:
  created:
    - tests/unit/billing/seat-config-no-hardcode.test.ts
  modified:
    - lib/billing/billing-config.ts
    - lib/schemas/admin.ts
    - app/admin/integrations/billing-config-form.tsx
    - tests/unit/billing/billing-config.test.ts
decisions:
  - "seatPriceCents is GLOBAL on BillingConfig; includedSeats is PER-TIER on TierBilling — placeholders only (seatPriceCents: 1500, each tier includedSeats: 1, owner seat bundled)"
  - "deep-merge block left byte-identical: a pre-existing row with no tiers key falls through to DEFAULT.tiers which now carries includedSeats (Pitfall-6 tolerance)"
  - "no-hardcode test forbids numeric-literal ASSIGNMENT to seat fields in consumers (seatPriceCents=N, includedSeats=N, includedSeats:N); config READS are allowed; non-existent seat-billing.ts skipped via existsSync so the test is green in Wave 1"
metrics:
  duration: ~12m
  completed: 2026-06-25
  tasks: 4
  files: 5
---

# Phase 139 Plan 01: billing_config seat fields (SEAT-06) Summary

Extended `BillingConfig`/`DEFAULT_BILLING_CONFIG` with a global `seatPriceCents` and a per-tier `includedSeats`, both as documented calibration placeholders, mirrored the shape in `billingConfigSchema`, surfaced both as editable fields in the super-admin billing panel, and locked the no-hardcode invariant with a static source-grep test — every seat-billing number now lives in exactly one place (billing-config.ts), read at runtime via `getBillingConfig()`.

## What shipped

- **lib/billing/billing-config.ts** — `TierBilling` gains `includedSeats: number`; `BillingConfig` gains `seatPriceCents: number`. `DEFAULT_BILLING_CONFIG` sets `seatPriceCents: 1500` and `includedSeats: 1` on each of the four tiers, all commented as CALIBRATE-BEFORE-CHARGING placeholders. The `getBillingConfig` deep-merge block is byte-unchanged.
- **lib/schemas/admin.ts** — `tierBillingSchema` gains `includedSeats: z.number().int().min(0)`; `billingConfigSchema` gains `seatPriceCents: z.number().int().min(0)`. `DEFAULT_BILLING_CONFIG` still round-trips through `safeParse`.
- **app/admin/integrations/billing-config-form.tsx** — new "Seat billing" fieldset with a per-seat-price input; per-tier "Included seats" input (grid widened to 4 cols, mobile-safe stacking); both wired into the typed `BillingConfig` payload (`seatPriceCents` top-level, `includedSeats` per tier) so the build fails unless both are present.
- **tests/unit/billing/billing-config.test.ts** — added `SEAT-06: seat config deep-merge` describe (default resolution, pre-existing-row tolerance via `{ markup: 5 }`, `seatPriceCents` override, partial-tiers `includedSeats` fallthrough) + two schema rejections (negative `seatPriceCents`, non-integer `includedSeats`).
- **tests/unit/billing/seat-config-no-hardcode.test.ts** (new) — pure static guard asserting only billing-config.ts holds the seat literals and no consumer (team.ts, invite-accept.ts, future seat-billing.ts) assigns a seat numeric literal.

## Verification

- `npx vitest run tests/unit/billing/billing-config.test.ts tests/unit/billing/seat-config-no-hardcode.test.ts` → 25 passed (2 files). The existing BILLCFG-03 dormancy/symbol-allowlist test stays green (this plan added no new `getBillingConfig` consumer).
- `npx tsc --noEmit` → no new errors in billing-config.ts, admin.ts, billing-config-form.tsx, or the new test.
- Deep-merge block in `getBillingConfig` confirmed byte-unchanged.
- No secrets touched.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. The `seatPriceCents: 1500` and per-tier `includedSeats: 1` are intentional CALIBRATE-BEFORE-CHARGING placeholders (same discipline as the existing markup/estimateFeePct defaults), documented in-code and editable in the admin panel without a deploy. Calibration of final numbers is a downstream concern, not a stub.

## Commits

- 2ba4de60 feat(139-01): add seatPriceCents + per-tier includedSeats to BillingConfig
- 42ff883c feat(139-01): mirror seatPriceCents + includedSeats in billingConfigSchema
- a4904e37 feat(139-01): editable seat price + per-tier included seats in billing form
- a4498629 test(139-01): seat config deep-merge + no-hardcode static guards

## Self-Check: PASSED

All 5 plan files + SUMMARY exist on disk; all 4 task commits present in git history.
