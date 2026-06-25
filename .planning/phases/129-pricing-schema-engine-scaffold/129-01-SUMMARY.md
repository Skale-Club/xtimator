---
phase: 129-pricing-schema-engine-scaffold
plan: 01
subsystem: pricing-schema
tags: [migration, tax, schema, ai-fence, regression-test]
requires: []
provides:
  - "Dormant v4.11 advanced-pricing columns (estimate_items + estimates + companies)"
  - "ENG-01 standing no-AI-calculator regression fence"
  - "TAX-01 static SQL-contract test"
affects:
  - supabase/migrations/20260627000001_phase129_advanced_pricing_schema.sql
  - lib/ai/providers/anthropic.ts
  - lib/ai/providers/gemini.ts
tech-stack:
  added: []
  patterns:
    - "Authored-only idempotent migration (ADD COLUMN IF NOT EXISTS + DROP/ADD named CHECK)"
    - "readFileSync + grep static-source contract test (no DB / no secret / no mock)"
key-files:
  created:
    - supabase/migrations/20260627000001_phase129_advanced_pricing_schema.sql
    - tests/unit/estimate/advanced-pricing-migration.test.ts
    - tests/unit/ai/no-ai-calculator.test.ts
  modified: []
decisions:
  - "Global discount REUSES existing estimates.discount_* columns — no new estimates.discount column added (Research Open Q1)"
  - "All columns land DORMANT with retrocompat defaults; nothing reads them until Phases 130-132"
  - "Migration is authored-only — never applied on the VPS (CI->GHCR->Coolify carries it)"
metrics:
  duration: ~9m
  completed: 2026-06-25
  tasks: 2
  files: 3
---

# Phase 129 Plan 01: Pricing Schema + No-AI-Calculator Fence Summary

Landed the TAX-01 dormant advanced-pricing schema (one idempotent, authored-only migration adding 9 columns with retrocompat defaults + 2 named CHECKs) and the ENG-01 static fence proving the AI's only tool is `create_estimate` with no calculator and no server-trusted computed-total item field.

## What Shipped

- **TAX-01 migration** `20260627000001_phase129_advanced_pricing_schema.sql`:
  - `estimate_items`: `taxable BOOLEAN NOT NULL DEFAULT true`, `tax_category TEXT` (nullable), `discount NUMERIC(12,2) NOT NULL DEFAULT 0`, `cost NUMERIC(12,2)`, `markup_pct NUMERIC(7,4)`
  - `estimates`: `deposit_type TEXT NOT NULL DEFAULT 'none'`, `deposit_value NUMERIC(12,2)`, `balance_due NUMERIC(12,2)`
  - `companies`: `tax_config JSONB` (nullable; NULL = flat default_tax_rate retrocompat path)
  - Named CHECKs: `estimate_items_tax_category_check` (labor/materials/other), `estimates_deposit_type_check` (none/percent/amount), both DROP-IF-EXISTS-then-ADD idempotent
  - Reuses existing `estimates.discount_type/discount_value/discount_amount` for the global discount — no new `estimates.discount` column
- **TAX-01 contract test** `tests/unit/estimate/advanced-pricing-migration.test.ts`: static `readFileSync` + grep over the migration — 9 columns, types, defaults, both named CHECKs, the no-new-estimates.discount reuse.
- **ENG-01 fence** `tests/unit/ai/no-ai-calculator.test.ts`: static assertion over `anthropic.ts` + `gemini.ts` — only `create_estimate` tool, no calculator tool, no computed-total numeric item property (`total`/`tax`/`tax_amount`/`subtotal`/`grand_total`/`grandTotal`), and `tool_choice`/`allowedFunctionNames` target `create_estimate`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Migration-idempotency test counted a comment occurrence**
- **Found during:** Task 2 (first test run)
- **Issue:** `src.match(/ADD COLUMN IF NOT EXISTS/g)` returned 10, not 9 — the migration header comment line also contains the literal phrase `ADD COLUMN IF NOT EXISTS`.
- **Fix:** Scoped the regex to actual statements: `/ALTER TABLE \w+ ADD COLUMN IF NOT EXISTS/g`, which matches exactly the 9 ALTER statements. Preserves the plan's stated intent (9 new columns) and the per-column `toContain` assertions are unchanged.
- **Files modified:** tests/unit/estimate/advanced-pricing-migration.test.ts
- **Commit:** 896e113c

## Migration Not Applied

The migration is authored-only. No `supabase db push` and no MCP `apply_migration` were run. It is carried to remote by CI->GHCR->Coolify alongside the other Phase 12x migrations.

## Test Results

`npx vitest run tests/unit/estimate/advanced-pricing-migration.test.ts tests/unit/ai/no-ai-calculator.test.ts` → 2 files, 9 tests, all green.

## Known Stubs

None. The columns are intentionally dormant (no reader this phase) — this is the documented v4.11 foundation, activated in Phases 130-132, not an unwired stub.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260627000001_phase129_advanced_pricing_schema.sql
- FOUND: tests/unit/estimate/advanced-pricing-migration.test.ts
- FOUND: tests/unit/ai/no-ai-calculator.test.ts
- FOUND commit b3db3c7c (migration)
- FOUND commit 896e113c (tests)
