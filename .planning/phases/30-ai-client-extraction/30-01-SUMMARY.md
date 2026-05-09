---
phase: 30-ai-client-extraction
plan: "01"
subsystem: ai
tags: [client-suggestion, estimate-generation, toast, ai-output]

# Dependency graph
requires:
  - phase: 28-unified-capture-screen
    provides: estimate generation can run from audio, text, or photos
  - phase: 29-frictionless-project-creation-client-linking
    provides: explicit project-to-client linking action
provides:
  - Optional AI-detected client name in estimate output
  - Conservative existing-client matching in generate-estimate response
  - Non-blocking client suggestion toast after generation
  - Accept action that explicitly links matched clients
affects:
  - v1.5 milestone completion

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Optional AI output fields normalized to null when absent/blank"
    - "SessionStorage handoff for capture-route redirect toast"
    - "Explicit user action required before project.client_id mutation"

key-files:
  created:
    - components/workspace/estimate/client-suggestion-toast.ts
  modified:
    - lib/ai/types.ts
    - lib/ai/normalize.ts
    - lib/ai/providers/anthropic.ts
    - lib/ai/providers/gemini.ts
    - app/api/generate-estimate/route.ts
    - components/capture/capture-recorder.tsx
    - components/workspace/estimate/estimate-tab.tsx
    - components/workspace/estimate/estimate-editor.tsx

key-decisions:
  - "suggested_client_name is optional and normalized to null unless it is a non-empty trimmed string"
  - "Existing-client matching is conservative normalized exact-name matching only; fuzzy matching remains deferred"
  - "Generate-estimate returns clientSuggestion metadata but never creates clients or updates projects.client_id"
  - "Capture flow uses sessionStorage to carry the suggestion across redirect into the workspace"

requirements-completed:
  - CLIENTASSOC-03

# Metrics
duration: 8min
completed: 2026-05-09
---

# Phase 30: AI Client Extraction Summary

**AI-detected client suggestions after estimate generation**

## Performance

- **Duration:** 8 min
- **Completed:** 2026-05-09
- **Tasks:** 3
- **Files modified:** 10

## Accomplishments

- Extended `EstimateOutput` with optional `suggested_client_name`
- Added `suggested_client_name` to both Anthropic and Gemini structured-output schemas without making it required
- Normalized blank or missing suggested client names to `null`
- Added conservative existing-client matching in `/api/generate-estimate`
- Returned `clientSuggestion` metadata from estimate generation without mutating client records
- Added shared toast helper for matched and unmatched client suggestions
- Wired workspace generation and estimate regeneration to show non-blocking suggestion toasts
- Added capture-route `sessionStorage` handoff so suggestions survive redirect into the estimate workspace

## Verification

- `npm run build` passed
- Plan artifact check passed for all declared existing artifacts
- CLIENTASSOC-03 behavior is covered by implementation:
  - detected name -> `clientSuggestion`
  - existing match -> Link toast action
  - no match -> Review toast action
  - no detection or already-linked project -> `clientSuggestion: null`
  - no silent client creation or project linking

## Issues Encountered

None.

## Next Phase Readiness

Phase 30 completes the planned v1.5 implementation scope. Remaining work is verification/UAT and milestone completion.

---
*Phase: 30-ai-client-extraction*
*Completed: 2026-05-09*
