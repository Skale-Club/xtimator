---
phase: 129-pricing-schema-engine-scaffold
plan: 02
subsystem: estimate-engine
tags: [eng-02, guard-03, totals, scaffold, retrocompat, v4.11]
requires:
  - lib/services/generate-estimate.ts (GUARD-03 default-path block)
  - lib/estimate/totals.ts (round2, assertFinitePositive, TOTALS_EPSILON — referenced, not modified)
provides:
  - lib/estimate/compute-totals.ts (computeEstimateTotals pure helper)
  - tests/unit/services/pricing-retrocompat.test.ts (ENG-02 standing golden guard)
affects:
  - lib/services/generate-estimate.ts (now calls the pure helper instead of inline math)
tech-stack:
  added: []
  patterns:
    - "Default-coalescing scaffold: dormant seams (discount ?? 0, taxable, taxConfig) collapse to today's flat math"
    - "Golden-numbers regression over the REAL production helper (not a copy)"
key-files:
  created:
    - lib/estimate/compute-totals.ts
    - tests/unit/services/pricing-retrocompat.test.ts
  modified:
    - lib/services/generate-estimate.ts
decisions:
  - "Helper keeps inline Math.round(x*100)/100 expressions (NOT round2) to preserve byte-identity (Pitfall 2)"
  - "Line discount / taxable / taxConfig are dormant params only — no active math until Phases 130-132"
metrics:
  duration: 3m
  completed: 2026-06-25
  tasks: 2
  files: 3
---

# Phase 129 Plan 02: GUARD-03 Totals Scaffold (ENG-02) Summary

Extracted the GUARD-03 default-path totals math into a pure `computeEstimateTotals` helper with dormant default-coalescing seams (line discount, taxability, tax_config branch) that collapse to today's flat-rate computation byte-for-byte, wired it back into `generate-estimate.ts`, and locked the retrocompat numbers (subtotal 850.99 / tax 85.1 / grand 936.09) as the standing v4.11 milestone golden guard.

## What Was Built

- **`lib/estimate/compute-totals.ts`** — pure `computeEstimateTotals(sections, { taxRate })` reproducing the L328-346 default-path math exactly. Seams: `item.discount ?? 0` (line discount defaults to 0 → lineNet == lineGross), `taxable`/`taxConfig` dormant params, and the flat `subtotal × taxRate` retrocompat tax branch. Uses the literal `Math.round(x*100)/100` expressions (no round2 substitution) to preserve evaluation order and byte-identity.
- **`lib/services/generate-estimate.ts`** — the inline `researchedSections.map(...)` totals block (and the subtotal/taxAmount/grandTotal lines) replaced by a single destructured call to `computeEstimateTotals`. The helper returns the same shape (`calculatedSections` with per-item `total` + per-section `subtotal`, plus `subtotal`/`taxAmount`/`grandTotal`), so every downstream consumer (`assertFinitePositive` guards, `totalsSane` invariant, discrepancy metric, persistence insert, section/item loop) is byte-unchanged.
- **`tests/unit/services/pricing-retrocompat.test.ts`** — ENG-02 golden regression over the REAL helper: pins subtotal 850.99 / taxAmount 85.1 / grandTotal 936.09, the per-item + per-section flat math, the zero-line-discount collapse, and the flat-tax retrocompat branch.

## Verification

- `npx vitest run tests/unit/estimate tests/unit/services` → 30 files / 202 tests passed.
- `tests/unit/services/pricing-retrocompat.test.ts` → 4/4 green (golden locked).
- `tests/unit/services/generate-estimate.test.ts` → green (no full-service totals drift).
- `tests/unit/estimate/totals-authority.test.ts` → green (GUARD-03 runtime authority intact).
- `npx tsc --noEmit` → no errors in compute-totals.ts or generate-estimate.ts.
- Persistence block byte-stable: `discount_type: null`, `discount_value: 0`, `discount_amount: 0` all still present (1 each). Old inline `total: Math.round(item.quantity * item.unit_price` removed from generate-estimate.ts (0).

## Deviations from Plan

None - plan executed exactly as written. The plan placed the regression test creation in Task 2 Part B; because Task 1 was `tdd="true"` and its `<verify>` runs `pricing-retrocompat.test.ts`, the test was authored in the RED phase of Task 1 (verbatim plan content) and committed with the helper. Task 2 then only carried the engine wiring. No behavior or content difference.

## Known Stubs

The dormant seams (`item.discount ?? 0`, `taxable`, `taxConfig`) are intentional scaffold — they compute byte-identically to today and are activated in Phases 130-132 (per-item tax / discount / deposit / markup). This is by design per the SCOPE FENCE, not an incomplete stub blocking the plan goal.

## Commits

- `a27ec20b` feat(129-02): extract computeEstimateTotals pure helper with default-coalescing scaffold
- `12138d5f` refactor(129-02): wire computeEstimateTotals into GUARD-03 block (byte-identical)

## Self-Check: PASSED
