---
phase: 24-estimate-template-engine-settings-page
plan: 01
subsystem: database, utils, schemas
tags: [estimate-template, supabase, migration, zod, vitest, tdd, plain-text]

# Dependency graph
requires:
  - phase: 19-price-book-db-foundation
    provides: migration pattern, companies table context, price_source column
provides:
  - supabase/migrations/20260508000001_phase24_estimate_templates.sql — 4 nullable TEXT columns on companies
  - lib/utils/estimate-template.ts — resolveTemplate() pure utility + TEMPLATE_DEFAULTS
  - lib/schemas/estimate-template.ts — estimateTemplateSchema zod schema
  - lib/queries/company.ts — extended CompanySettings + getEstimateTemplateSettings()
  - tests/unit/utils/estimate-template.test.ts — 6 GREEN unit tests
affects: [25-plain-text-estimate-output, 24-02, 24-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "TDD RED-GREEN: write failing tests first, then implement to make them pass"
    - "Pure utility pattern: lib/utils/*.ts has no DB calls, no React, fully unit-testable"
    - "Empty string = NULL convention: falsy check (|| null) makes '' revert to default"
    - "No DEFAULT clause migration: NULL is intentional initial state; defaults resolved at render time"

key-files:
  created:
    - supabase/migrations/20260508000001_phase24_estimate_templates.sql
    - lib/utils/estimate-template.ts
    - lib/schemas/estimate-template.ts
    - tests/unit/utils/estimate-template.test.ts
  modified:
    - lib/queries/company.ts

key-decisions:
  - "Template columns added to companies table (not a separate table) — 4 text fields don't warrant a join"
  - "NULL initial state with no SQL DEFAULT — defaults resolved at render time in pure utility, not at insert time"
  - "Empty string treated same as NULL in resolveTemplate() — (field || null) ?? default pattern"
  - "items_breakdown position fixed by resolveTemplate(), not by any stored template string"

patterns-established:
  - "resolveTemplate(template, data) — compose stored template + render-time data into final plain-text string"
  - "TEMPLATE_DEFAULTS as const — single source of truth for all default template content"
  - "getEstimateTemplateSettings() — narrow query selecting only id + 4 template columns, not using getCachedCompany"

requirements-completed: [PLAINTEXT-03, PLAINTEXT-05]

# Metrics
duration: 10min
completed: 2026-05-08
---

# Phase 24 Plan 01: Estimate Template Engine + Settings Page — Data Foundation Summary

**SQL migration + resolveTemplate() pure utility + zod schema + CompanySettings extension establish the complete data layer for plain-text estimate templates with TDD (6 RED → GREEN tests).**

## Performance

- **Duration:** ~10 min
- **Started:** 2026-05-08T14:51:49Z
- **Completed:** 2026-05-08T15:01:00Z
- **Tasks:** 2/2
- **Files modified:** 5

## Accomplishments

- Applied migration adding 4 nullable TEXT columns to companies (no DEFAULT — NULL = "use app default")
- Built resolveTemplate() pure utility with {variable} substitution, null/empty fallback to TEMPLATE_DEFAULTS, and fixed section order (greeting → opener → items → closer → signature)
- Created estimateTemplateSchema zod schema with optional+empty-string-bypass pattern for all 4 fields
- Extended CompanySettings interface and added getEstimateTemplateSettings() narrow query function
- 6 unit tests all GREEN; 73/73 test files pass; tsc --noEmit exits 0

## Task Commits

1. **Task 1 (RED): Write failing unit tests for resolveTemplate** - `256fbf1` (test)
2. **Task 2 (GREEN): Implement migration, utility, schema, and extended types** - `64bfb64` (feat)

## Files Created/Modified

- `supabase/migrations/20260508000001_phase24_estimate_templates.sql` — 4 nullable TEXT columns on companies, applied to Supabase
- `lib/utils/estimate-template.ts` — resolveTemplate(), TEMPLATE_DEFAULTS, TemplateData, EstimateTemplate interfaces
- `lib/schemas/estimate-template.ts` — estimateTemplateSchema zod schema + EstimateTemplateFormValues type
- `lib/queries/company.ts` — CompanySettings extended with 4 estimate_template_* fields + getEstimateTemplateSettings()
- `tests/unit/utils/estimate-template.test.ts` — 6 GREEN unit tests covering all resolveTemplate() behaviors

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all exported functions are fully implemented. No placeholder text or hardcoded empty values in created files.

## Self-Check: PASSED

- `supabase/migrations/20260508000001_phase24_estimate_templates.sql` — EXISTS
- `lib/utils/estimate-template.ts` — EXISTS, contains `export function resolveTemplate(`, `export const TEMPLATE_DEFAULTS`, `export interface TemplateData`, `export interface EstimateTemplate`
- `lib/schemas/estimate-template.ts` — EXISTS, contains `export const estimateTemplateSchema`, `export type EstimateTemplateFormValues`
- `lib/queries/company.ts` — MODIFIED, contains `estimate_template_greeting: string | null`, `export async function getEstimateTemplateSettings(`
- `tests/unit/utils/estimate-template.test.ts` — EXISTS, 6/6 tests GREEN
- Commits `256fbf1` and `64bfb64` exist in git history
