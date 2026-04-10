---
phase: 02-company-onboarding
plan: 01
subsystem: onboarding-data-contracts
tags: [industries, zod, schema, validation, tdd]
dependency_graph:
  requires: []
  provides: [INDUSTRIES, Industry, onboardingSchema, OnboardingValues, STEP_FIELDS]
  affects: [components/onboarding/step-brand-identity.tsx, components/onboarding/onboarding-wizard.tsx]
tech_stack:
  added: []
  patterns: [zod-optional-with-empty-string-bypass, step-field-mapping, const-satisfies-pattern]
key_files:
  created:
    - lib/industries.ts
    - lib/schemas/onboarding.ts
    - tests/unit/industries.test.ts
    - tests/unit/onboarding-schema.test.ts
  modified: []
decisions:
  - "INDUSTRIES uses `as const satisfies Industry[]` for type safety with literal inference"
  - "Email/website use `.optional().or(z.literal(''))` pattern for empty string bypass"
  - "STEP_FIELDS typed as Record<number, (keyof OnboardingValues)[]> for type-safe step validation"
metrics:
  duration: 5min
  completed: "2026-04-10T10:14:12Z"
---

# Phase 02 Plan 01: INDUSTRIES Config & Types Summary

Typed data contracts for the onboarding wizard: 8-industry INDUSTRIES constant with Lucide icons and projectTypes, plus a 3-step Zod schema with optional field defaults and per-step field mapping.

## What Was Done

### Task 1: INDUSTRIES Config and Tests (TDD)
- Created `lib/industries.ts` with `Industry` interface and `INDUSTRIES` constant array
- 8 industries (cleaning, painting, landscaping, electrical, plumbing, handyman, roofing, hvac) each with Lucide icon name and 5 projectTypes
- "Other" option deliberately excluded from array (UI-only concept per D-07)
- 6 unit tests: array length, field presence, minimum projectTypes, uniqueness, known industries
- **Commit:** 31df2c2

### Task 2: Onboarding Zod Schema and Tests (TDD)
- Created `lib/schemas/onboarding.ts` with `onboardingSchema`, `OnboardingValues` type, and `STEP_FIELDS` mapping
- Step 1: companyName required (min 2), ownerName/phone/email/website optional with defaults
- Step 2: industry/customIndustry optional, brandPrimaryColor defaults to "#0D9488"
- Step 3: address fields optional, tax rate 0-100 defaulting to 0, payment terms "Net 30", warranty "1 year", validity 30 days
- Email/website validate format when non-empty but accept empty string via `.or(z.literal(""))`
- STEP_FIELDS maps step 1/2/3 to their respective field name arrays for `form.trigger()` per-step validation
- 21 unit tests covering all validation rules, defaults, and skip scenario
- **Commit:** 18fa8d2

## Verification

- `vitest run tests/unit/industries.test.ts` -- 6/6 passed
- `vitest run tests/unit/onboarding-schema.test.ts` -- 21/21 passed
- `vitest run` (full suite) -- 44/44 passed, no regressions

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None -- all exports are fully implemented with real data.

## Self-Check: PASSED

- All 4 created files exist on disk
- Both commits (31df2c2, 18fa8d2) found in git log
