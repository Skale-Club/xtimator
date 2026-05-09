---
phase: "31-wizard-modality-selection"
plan: "31-01"
subsystem: "projects"
tags:
  - "wizard"
  - "modality-selection"
  - "input-mode"
  - "project-creation"
requires:
  - "WIZARD-01"
  - "WIZARD-02"
  - "WIZARD-03"
  - "WIZARD-04"
provides:
  - "input_mode field on projects table"
  - "2-step project creation wizard"
  - "Modality selection UI (Audio/Text/Photos)"
depends_on:
  - "29-frictionless-project-creation-client-linking"
  - "28-unified-capture-screen"
affects:
  - "components/projects/new-project-wizard.tsx"
  - "components/projects/step-modality-select.tsx"
  - "lib/schemas/project.ts"
  - "lib/actions/project.ts"
  - "types/database.types.ts"
tech_stack:
  added:
    - "inputModeEnum (z.enum)"
    - "StepModalitySelect component"
  patterns:
    - "2-step wizard with step indicator"
    - "Modality-based routing"
    - "Form state across wizard steps"
key_files:
  created:
    - "components/projects/step-modality-select.tsx"
  modified:
    - "types/database.types.ts"
    - "lib/schemas/project.ts"
    - "components/projects/new-project-wizard.tsx"
    - "lib/actions/project.ts"
decisions: []
metrics:
  duration: 1
  completed: "2026-05-09"
  tasks_completed: 5
  files_created: 1
  files_modified: 4
---

# Phase 31 Plan 01 Summary: Wizard Modality Selection

## One-liner

2-step project creation wizard (client → modality) with 3-card modality selector and conditional routing to /capture, /describe, or /photos-input.

## What Was Built

Added a second step to the new project wizard where users choose between Audio, Text, or Photos as their input modality, then are routed to the appropriate capture route with `input_mode` stored on the project record.

## Completed Tasks

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Database migration + TypeScript types | a49f637 | types/database.types.ts |
| 2 | Update project schema with inputMode field | 0ce35e9 | lib/schemas/project.ts |
| 3 | Create StepModalitySelect component | 919dfc7 | components/projects/step-modality-select.tsx |
| 4 | Update NewProjectWizard 2-step flow + routing | 0b6a025 | components/projects/new-project-wizard.tsx |
| 5 | Update createProjectAction input_mode storage | e807ce9 | lib/actions/project.ts |

## Deviations from Plan

None — plan executed exactly as written.

## Artifacts

### types/database.types.ts
- Added `input_mode: 'audio' | 'text' | 'photos' | 'mixed' | null` to projects Row/Insert/Update types

### lib/schemas/project.ts
- Added `inputModeEnum` as `z.enum(['audio', 'text', 'photos', 'mixed'])`
- Exported `InputMode` type for downstream use
- Updated `STEP_FIELDS`: Step 1 = `[]`, Step 2 = `['inputMode']`
- `ProjectFormValues` now includes `inputMode?: InputMode`

### components/projects/step-modality-select.tsx
- New component with 3 large clickable cards
- Icons: Mic (Audio), FileText (Text), Camera (Photos)
- Visual selection highlight with `border-primary` and ring
- Hover states with `border-primary/50`
- Uses `form.setValue('inputMode', value, { shouldValidate: true })` pattern

### components/projects/new-project-wizard.tsx
- Added `currentStep` state (1 = client, 2 = modality)
- Visual step indicator (numbered circles with connector line)
- Step 1 → "Continue to modality" button advances to step 2
- Step 2 → "Back" button returns to step 1, "Start [X] capture" submits
- Routes based on inputMode:
  - `audio` → `/projects/[id]/capture`
  - `text` → `/projects/[id]/describe`
  - `photos` → `/projects/[id]/photos-input`
  - `mixed` → `/projects/[id]/capture`

### lib/actions/project.ts
- `createProjectAction` now includes `input_mode: formData.inputMode ?? null` in projects insert

## Verification

- [x] `npm run build` succeeds
- [x] TypeScript types compile without errors
- [x] All 5 tasks committed with atomic commits
- [x] Wizard shows step 1 (client select) then step 2 (modality cards)
- [x] `input_mode` stored in project record via `createProjectAction`

## Self-Check

- [x] All modified files exist and contain correct changes
- [x] All commits verified in git log
- [x] Build output shows all expected routes including new wizard page