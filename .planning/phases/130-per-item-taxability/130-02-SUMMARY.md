---
phase: 130-per-item-taxability
plan: 02
subsystem: estimate-totals-engine
tags: [tax, per-category, guard-03, retrocompat, eng-02]
requires:
  - "129: estimate_items.taxable/tax_category + companies.tax_config columns (dormant)"
  - "130-01: AI output carries taxable/tax_category (TAX-02)"
provides:
  - "computeEstimateTotals active per-category tax branch keyed on companies.tax_config (TAX-03)"
  - "engine reads tax_config + persists per-item taxable/tax_category to estimate_items"
affects:
  - lib/estimate/compute-totals.ts
  - lib/services/generate-estimate.ts
tech-stack:
  added: []
  patterns:
    - "Byte-identical retrocompat fallthrough: Math.round(subtotal*taxRate*100)/100 untouched when tax_config null/malformed"
    - "Per-category tax accumulation: Σ(categoryBase × rate); rate resolution rates[cat] → default_rate → option taxRate"
    - "GUARD-03 never-throw: malformed tax_config coerced to null (flat path) via isTaxConfig guard"
key-files:
  created:
    - tests/unit/estimate/per-category-tax.test.ts
  modified:
    - lib/estimate/compute-totals.ts
    - lib/services/generate-estimate.ts
    - tests/unit/services/pricing-retrocompat.test.ts
decisions:
  - "TaxConfig shape = { rates: { labor?, materials?, other? }; default_rate? } — a per-category rate map; 'labor exempt' expressed as { rates: { labor: 0, materials: <rate> } }"
  - "Null/unknown tax_category for a taxable item falls back to config.default_rate then option taxRate (no silent tax escape)"
  - "Both tax branches use Math.round(x*100)/100 (NOT round2) for byte-consistency with the flat path"
metrics:
  duration: ~6m
  completed: 2026-06-25
  tasks: 2
  files: 4
---

# Phase 130 Plan 02: Per-Category Tax Activation Summary

Activated the dormant TAX-03 per-category tax branch in the deterministic GUARD-03 totals engine: `computeEstimateTotals` now computes `taxAmount = Σ(taxable_base_per_category × rate_category)` from `companies.tax_config`, while the flat-rate path stays byte-identical (850.99 / 85.1 / 936.09) when `tax_config` is absent. The engine reads `tax_config` and persists the AI's per-item `taxable`/`tax_category` classification into the dormant Phase 129 `estimate_items` columns.

## What Was Built

**Task 1 — compute-totals.ts active branch (TDD):**
- Replaced the `unknown` taxConfig seam with a concrete `TaxConfig` interface (`{ rates: { labor?; materials?; other? }; default_rate? }`) plus an `isTaxConfig` guard.
- `taxConfig` null / absent / malformed → byte-identical flat fallthrough `Math.round(subtotal * taxRate * 100) / 100` (the expression is unchanged).
- `taxConfig` present → activated `item.taxable ?? true`, accumulate each taxable item's `lineNet` into its `tax_category` base, then `taxAmount = Math.round(Σ(base × rate) * 100) / 100`. Non-taxable items accrue zero base.
- Rate resolution: `rates[category]` → `config.default_rate` → option `taxRate` (no taxable item silently escapes tax).
- Tests: extended `pricing-retrocompat.test.ts` with the omitted-vs-explicit-null byte-identical guard; created `per-category-tax.test.ts` with the labor-exempt golden (40 / 1540), non-taxable→0, null-category default_rate fallback (10), null-category taxRate fallback (7), and a multi-section per-category sum (30).

**Task 2 — engine wire (generate-estimate.ts):**
- Added `tax_config` to the `companies.select(...)`.
- Threaded `taxConfig` into `computeEstimateTotals(...)`; malformed values coerced to `null` (GUARD-03 never-throw) → flat retrocompat path.
- Persisted `taxable: item.taxable ?? true` and `tax_category: item.tax_category ?? null` into the `estimate_items` insert rows (the fields survive AI → anchoring → research → compute via the `...item` spreads).
- The `estimates` insert is unchanged (discount/deposit columns stay dormant).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] TypeScript literal widening in the new test fixtures**
- **Found during:** Task 2 (`npx tsc --noEmit`)
- **Issue:** `tax_category: 'labor'` in the per-category test inferred as `string`, not the `'labor'|'materials'|'other'|null` union, so the section literals were not assignable to `ComputeTotalsSection[]`.
- **Fix:** Added `as const` to each `tax_category` literal in `tests/unit/estimate/per-category-tax.test.ts`.
- **Files modified:** tests/unit/estimate/per-category-tax.test.ts
- **Commit:** 5f6f8e79

Otherwise the plan executed as written.

## Deferred / Out-of-Scope

A set of pre-existing `tsc --noEmit` errors in UNRELATED test files (refine-shared-prompt, observability es2018 regex flags, step-runner mock, generate-estimate-job mock, whatsapp `Entitlements` fixtures missing `chatEnabled`) were re-confirmed pre-existing by stashing the 130-02 changes. They live in files this plan did not touch and are logged in `deferred-items.md`. The four plan-touched files are tsc-clean.

## Verification

- `npx vitest run tests/unit/services/pricing-retrocompat.test.ts tests/unit/estimate/per-category-tax.test.ts tests/unit/estimate/totals-authority.test.ts tests/unit/services/generate-estimate-research.test.ts` → 23 passed.
- `npx vitest run tests/unit/estimate tests/unit/services` → 208 passed (31 files), includes the 130-01 no-AI-calculator fence.
- ENG-02 retrocompat golden 850.99 / 85.1 / 936.09 byte-identical (omitted AND explicit-null).
- GUARD-03 totals-authority suite green.
- The four plan-touched files are tsc-clean (verified by filtering tsc output and by stash-diff).

## Self-Check: PASSED
