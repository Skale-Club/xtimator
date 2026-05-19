---
phase: 73-language-onboarding-estimate-language-ui
plan: 03
subsystem: ui
tags: [i18n, language, estimate, cascade, dropdown]

# Dependency graph
requires:
  - phase: 52-per-estimate-language
    provides: resolveEstimateLanguageWithSource, LANGUAGE_LABELS, EstimateLanguage, CascadeSource types
  - phase: 73-01
    provides: LanguageStep onboarding wizard step
  - phase: 73-02
    provides: EstimateLanguageSelector component, language param wired through API + Inngest

provides:
  - Language dropdown in EstimateTab with resolveEstimateLanguageWithSource cascade resolution
  - Cascade source hint rendered below dropdown for user/company/client sources
  - selectedLanguage passed to POST /api/generate-estimate as body.language field
  - Flag components (FlagUS, FlagBR, FlagES) in language selector for visual language identification

affects: [estimate generation, estimate tab UI, language cascade]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "resolveEstimateLanguageWithSource({ userAppLanguage }) — cascade resolver used in UI for pre-fill + hint source"
    - "CASCADE_HINT module-level constant: Record<string, string> mapping cascade source to human-readable hint"
    - "FLAG_MAP: Record<EstimateLanguage, React.ComponentType> for inline flag rendering in Select options"
    - "cascadeResult.source guards hint render: source !== 'override' && source !== 'fallback'"

key-files:
  created: []
  modified:
    - components/workspace/estimate/estimate-tab.tsx

key-decisions:
  - "resolveEstimateLanguageWithSource used with userAppLanguage only — company/client layers need props not yet available (TODO LANG-ONBOARD-03 comment in code)"
  - "Inline Select with FLAG_MAP pattern (not EstimateLanguageSelector) — plan specifies inline JSX with flag icons for this surface"
  - "CASCADE_HINT defined as module-level constant (not inside component) — stable reference, no dependency on component state"
  - "selectedLanguage initialized from cascadeResult.language — useState is set once from cascade; user can override via Select"

requirements-completed:
  - LANG-ONBOARD-03

# Metrics
duration: 5min
completed: 2026-05-19
---

# Phase 73 Plan 03: Language Onboarding Step + Estimate Language UI Summary

**Language dropdown with resolveEstimateLanguageWithSource cascade resolution and source hint wired into EstimateTab, with selectedLanguage forwarded to the generate-estimate API call.**

## Performance

- **Duration:** 5 min
- **Completed:** 2026-05-19
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

### Task 1: Add language dropdown + cascade hint + wire to generate API

Modified `components/workspace/estimate/estimate-tab.tsx`:

- Added imports: `resolveEstimateLanguageWithSource`, `LANGUAGE_LABELS`, `EstimateLanguage` from resolve-estimate-language; `useLanguage` from language-context; `Select/SelectContent/SelectItem/SelectTrigger/SelectValue` from shadcn/ui; `FlagUS`, `FlagBR`, `FlagES` from flags component
- Added module-level `CASCADE_HINT` map (user/company/client/fallback/override sources)
- Added module-level `FLAG_MAP` mapping EstimateLanguage to flag SVG components
- Added `useLanguage()` call to get `appLanguage`
- Added `cascadeResult = resolveEstimateLanguageWithSource({ userAppLanguage: appLanguage as EstimateLanguage })` — runs cascade with app language layer (layer 4)
- Added `selectedLanguage` state initialized from `cascadeResult.language`
- Added language selector UI above the Generate button in the "no estimate" CTA card with flag icons and language labels
- Cascade hint renders when `cascadeResult.source` is `'user'`, `'company'`, or `'client'` (not `'override'` or `'fallback'`)
- Updated `handleGenerate()` fetch body: `JSON.stringify({ projectId, language: selectedLanguage })`

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash | Message |
|------|---------|
| cb3894c | feat(73-03): add language dropdown + cascade hint + wire to generate API |

## Self-Check: PASSED

- File exists: `components/workspace/estimate/estimate-tab.tsx` — FOUND
- Commit cb3894c exists in git history — FOUND
- `resolveEstimateLanguageWithSource` in estimate-tab.tsx — FOUND (lines 36, 81)
- `language: selectedLanguage` in fetch body — FOUND (line 128)
- `CASCADE_HINT` defined and used — FOUND (lines 51, 249)
- TypeScript: only pre-existing error in `turnstile-widget.tsx` (unrelated) — CLEAN for our changes
