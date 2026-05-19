---
phase: 73-language-onboarding-estimate-language-ui
plan: 01
subsystem: onboarding
tags: [i18n, onboarding, language, survey, LanguageContext]
dependency_graph:
  requires:
    - lib/i18n/language-context.tsx
    - lib/i18n/resolve-estimate-language.ts
    - components/app-shell/flags.tsx
    - components/ui/radio-group.tsx
    - companies.default_estimate_language (column, from Phase 52/SEED-016)
  provides:
    - components/onboarding/survey/steps/language-step.tsx
    - language field in OnboardingValues / onboardingSchema
    - default_estimate_language persistence in createOrUpdateCompany
  affects:
    - components/onboarding/survey/survey-config.ts (11 steps, language at index 5)
    - components/onboarding/survey/survey-shell.tsx (renderStep + handleSkip)
    - components/onboarding/onboarding-survey.tsx (INITIAL values)
    - tests/unit/components/onboarding-survey.test.tsx (step count + order)
tech_stack:
  added: []
  patterns:
    - Radio button group with flag icons for language selection
    - Immediate setLanguage() call on selection (instant UI preview)
    - English-first: EN maps to null in DB (default_estimate_language)
key_files:
  created:
    - components/onboarding/survey/steps/language-step.tsx
  modified:
    - components/onboarding/survey/survey-config.ts
    - lib/schemas/onboarding.ts
    - lib/actions/company.ts
    - components/onboarding/survey/survey-shell.tsx
    - components/onboarding/onboarding-survey.tsx
    - tests/unit/components/onboarding-survey.test.tsx
decisions:
  - English-first: language='en' maps to null in default_estimate_language (same as SEED-016 cascade)
  - setLanguage() called immediately on radio selection for live language preview during onboarding
  - language step is optional (required: false) so users can skip and stay in English
  - z.enum(['en','pt','es']).optional().default('en') — self-contained, no EstimateLanguage import needed in schema
metrics:
  duration: 4min
  completed: 2026-05-19
  tasks_completed: 2
  files_changed: 7
---

# Phase 73 Plan 01: Language Onboarding Step Summary

**One-liner:** Language selection step (FlagUS/FlagBR/FlagES radio group) inserted at onboarding survey position 5, with immediate LanguageContext update and default_estimate_language persistence on submit.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create LanguageStep component | b699b9c | components/onboarding/survey/steps/language-step.tsx |
| 2 | Wire LanguageStep into survey config + schema + company action | bc80684 | survey-config.ts, onboarding.ts, company.ts, survey-shell.tsx, onboarding-survey.tsx, onboarding-survey.test.tsx |

## What Was Built

### LanguageStep Component (`language-step.tsx`)
A `'use client'` radio button group with three options (English/Português BR/Español), each row showing the country flag SVG, the language label, and a radio indicator. When a language is selected:
1. `onChange(lang)` updates the react-hook-form value (via `setValue`)
2. `setLanguage(lang)` from `useLanguage()` immediately updates the dashboard language — giving a live preview effect mid-onboarding

Styling: selected rows get `border-primary bg-primary/5`; unselected get `border-[var(--glass-border)] hover:bg-muted/40` (glassmorphism tokens from Phase 71). English is pre-selected when no value is provided.

### Survey Config
Added `'language'` to `SurveyStepKey` union. Inserted the step definition at index 5 (between `industry` and `brandColor`). Survey now has 11 steps total. Step is `required: false` (skippable).

### Schema
Added `language: z.enum(['en', 'pt', 'es']).optional().default('en')` to `onboardingSchema`. Field flows through `OnboardingValues` and is passed automatically via `...state.values` in `createOrUpdateCompany`.

### Company Action
Added `language?: string` to `CompanyFormData`. In the `row` object:
```
default_estimate_language: data.language && data.language !== 'en' ? data.language : null
```
EN maps to `null` (English-first principle — null = default); PT → `'pt'`; ES → `'es'`.

### Tests Fixed (Auto-fix Rule 1)
`tests/unit/components/onboarding-survey.test.tsx` had stale assertions for 10 steps and the old step key order. Updated to 11 steps and the new order including `'language'` at index 5.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Test file had stale step count and key order assertions**
- **Found during:** Task 2 TypeScript check
- **Issue:** `onboarding-survey.test.tsx` declared `INITIAL: OnboardingValues` without `language` field (TS2741), and asserted `SURVEY_STEPS.toHaveLength(10)` + old key order
- **Fix:** Added `language: 'en'` to INITIAL, updated length assertion to 11, inserted `'language'` at index 5 in key order array
- **Files modified:** tests/unit/components/onboarding-survey.test.tsx
- **Commit:** bc80684

**2. [Rule 2 - Missing wiring] survey-shell.tsx and onboarding-survey.tsx needed wiring**
- **Found during:** Task 2 — plan listed 3 files to modify but `survey-shell.tsx` and `onboarding-survey.tsx` were also necessary for the feature to work end-to-end
- **Fix:** Added `LanguageStep` import + `case 'language'` in `renderStep()` + `case 'language'` in `handleSkip()` in survey-shell.tsx; added `language: 'en'` to INITIAL values in onboarding-survey.tsx
- **Files modified:** components/onboarding/survey/survey-shell.tsx, components/onboarding/onboarding-survey.tsx
- **Commit:** bc80684

## Known Stubs

None — the language step is fully wired from radio selection through LanguageContext to DB persistence.

## Self-Check: PASSED

- [x] `components/onboarding/survey/steps/language-step.tsx` exists
- [x] Commit `b699b9c` exists (Task 1)
- [x] Commit `bc80684` exists (Task 2)
- [x] `key: 'language'` at index 5 in survey-config.ts
- [x] `language:` field in onboarding schema
- [x] `default_estimate_language` in company action row
- [x] `setLanguage` called in language-step.tsx
- [x] TypeScript clean (zero new errors)
