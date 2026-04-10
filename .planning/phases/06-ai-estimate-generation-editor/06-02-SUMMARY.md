---
phase: 06-ai-estimate-generation-editor
plan: 02
subsystem: ai-estimate-generation
tags: [api, ai, claude, estimate, server-actions, math-validation]
dependency_graph:
  requires: ["@anthropic-ai/sdk", "lib/supabase/server", "lib/queries/recording", "lib/queries/photo"]
  provides: ["POST /api/generate-estimate", "saveEstimate", "createBlankEstimate", "deleteEstimateSection", "deleteEstimateItem"]
  affects: ["estimates", "estimate_sections", "estimate_items", "projects"]
tech_stack:
  added: ["@anthropic-ai/sdk (Claude tool_use for structured output)"]
  patterns: ["Server-side math validation", "Version management with is_current flag", "tool_use forced function calling", "Upsert with temp-id convention"]
key_files:
  created:
    - app/api/generate-estimate/route.ts
    - lib/actions/estimate.ts
  modified: []
decisions:
  - "Claude tool_use with tool_choice forced to create_estimate -- guarantees structured JSON output"
  - "All math calculated server-side with roundCents helper -- never trust client numbers"
  - "Version management: mark all existing is_current=false before inserting new version"
  - "temp- prefix convention for new section/item IDs in saveEstimate upsert logic"
  - "Orphan cleanup: delete sections/items in DB that are missing from incoming save data"
  - "getAuthContext in estimate actions fetches company defaults (tax_rate, payment_terms, warranty_terms) in initial query"
metrics:
  duration: "3min"
  completed: "2026-04-10"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
---

# Phase 6 Plan 02: AI Estimate Generation API & Server Actions Summary

Claude tool_use forced-function API route that builds prompts from transcripts + photos + project metadata, validates all math server-side, persists estimate tree with version management, plus 4 server actions for save/create/delete operations.

## What Was Built

### Task 1: POST /api/generate-estimate route
- Auth via getClaims() + company lookup pattern
- Parallel fetch of project, recordings, photos, company data
- Prerequisite check: requires at least one transcript or analyzed photo
- System prompt with company industry context, user prompt with project info + transcripts + photo descriptions
- Claude claude-sonnet-4-20250514 call with tool_use schema (create_estimate tool) and forced tool_choice
- Server-side math: item total = qty * unit_price, section subtotal = sum of items, overall subtotal, tax from company defaults, grand total
- Version management: marks all existing estimates is_current=false, increments version
- Sequential DB inserts: estimate -> sections -> items (each with company_id for RLS)
- Project status updated to estimate_ready, project.total updated to grand total
- Activity logging with estimate_generated event
- Full try/catch with user-friendly error message on AI failure

### Task 2: Estimate server actions (lib/actions/estimate.ts)
- **saveEstimate**: Full editor auto-save with server-side math recalculation, upsert logic (temp- prefix for new items/sections), orphan cleanup for deleted sections/items, project total sync
- **createBlankEstimate**: Manual fallback with company defaults (tax_rate, payment_terms, warranty_terms), one default "General" section with one empty item, version management, activity logging
- **deleteEstimateSection**: Deletes section (items cascade via FK), recalculates estimate totals
- **deleteEstimateItem**: Deletes item, recalculates parent section subtotal and estimate totals
- Shared recalculateEstimateTotals helper handles discount (percentage/fixed) and tax recalc

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all functions are fully implemented with real logic.

## Verification

- `npx tsc --noEmit` passes for both files (0 errors specific to created files)
- POST export confirmed in route.ts
- All 4 action exports confirmed: saveEstimate, createBlankEstimate, deleteEstimateSection, deleteEstimateItem
- Math validation present in both generation route (Step 4) and saveEstimate action
- Version management present in both generation route and createBlankEstimate

## Self-Check: PASSED

- FOUND: app/api/generate-estimate/route.ts
- FOUND: lib/actions/estimate.ts
- Commits: skipped (git permissions blocked by orchestrator sandbox -- orchestrator will handle)
