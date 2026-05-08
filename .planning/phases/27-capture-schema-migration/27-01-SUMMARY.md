---
phase: 27-capture-schema-migration
plan: 01
subsystem: database
tags: [supabase, postgresql, migrations, typescript, zod]

# Dependency graph
requires:
  - phase: 24-estimate-template-engine-settings-page
    provides: migration naming convention (20260508000001_phase24_*)
provides:
  - recordings.storage_path is nullable in DB (NOT NULL constraint dropped)
  - Recording interface with storage_path string | null
  - database.types.ts recordings Row/Insert with string | null
  - Optional clientId in projectSchema (z.string().optional())
  - STEP_FIELDS[1] cleared — wizard step 1 has no required fields
  - Null guards in transcribeRecording, deleteRecording, fetchSignedUrl
affects: [28-unified-capture-screen, 29-frictionless-project-creation, 30-ai-client-extraction]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Null guard pattern: if (!recording.storage_path) return before Storage API calls"
    - "Explicit null coercion: formData.clientId ?? null for optional FK fields"

key-files:
  created:
    - supabase/migrations/20260508000002_phase27_nullable_storage_path.sql
  modified:
    - lib/queries/recording.ts
    - types/database.types.ts
    - lib/schemas/project.ts
    - lib/actions/project.ts
    - components/workspace/audio/recording-item.tsx
    - lib/actions/recording.ts

key-decisions:
  - "recordings.storage_path DROP NOT NULL via migration — non-destructive, existing rows unaffected"
  - "projects.client_id already nullable in DB — only app-layer Zod schema change needed"
  - "Manual database.types.ts update (not supabase gen types) — single field change, Docker unavailable"
  - "STEP_FIELDS[1] emptied — clientId optional means no required field validation at wizard step 1"

patterns-established:
  - "Null guard before Storage API calls when field is nullable: if (!recording.storage_path) return"

requirements-completed: [CAPTURE-02, CAPTURE-04, CLIENTASSOC-01, CLIENTASSOC-04]

# Metrics
duration: 3min
completed: 2026-05-08
---

# Phase 27 Plan 01: Capture Schema Migration Summary

**recordings.storage_path made nullable via DB migration + TypeScript propagation; projectSchema.clientId made optional — unblocking all v1.5 phases**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-05-08T20:05:52Z
- **Completed:** 2026-05-08T20:08:00Z
- **Tasks:** 2
- **Files modified:** 6 (+ 1 created)

## Accomplishments
- Created and applied `20260508000002_phase27_nullable_storage_path.sql` — ALTER TABLE recordings ALTER COLUMN storage_path DROP NOT NULL
- Updated Recording interface and database.types.ts (Row + Insert) to `storage_path: string | null`
- Made `clientId` optional in projectSchema with `z.string().optional()`; cleared STEP_FIELDS[1] required array
- Added null guards in `transcribeRecording`, `deleteRecording`, and `fetchSignedUrl` to handle text-only recordings safely
- TypeScript compilation: 0 errors

## Task Commits

1. **Task 1: DB migration + TypeScript type propagation** - `cf550ef` (feat)
2. **Task 2: Optional clientId schema + caller null-guards** - `afd50cc` (feat)

## Files Created/Modified
- `supabase/migrations/20260508000002_phase27_nullable_storage_path.sql` - DROP NOT NULL on recordings.storage_path
- `lib/queries/recording.ts` - storage_path: string -> string | null
- `types/database.types.ts` - recordings.Row.storage_path and Insert.storage_path -> string | null
- `lib/schemas/project.ts` - clientId: z.string().optional(), STEP_FIELDS[1] = []
- `lib/actions/project.ts` - client_id: formData.clientId ?? null (explicit null coercion)
- `components/workspace/audio/recording-item.tsx` - null guard in fetchSignedUrl before createSignedUrl
- `lib/actions/recording.ts` - null guard before .download() in transcribeRecording; if (recording.storage_path) wrapping .remove() in deleteRecording

## Decisions Made
- Manual database.types.ts update preferred over `supabase gen types` — Docker not available, single field change is targeted and safe
- STEP_FIELDS[1] emptied (not removed) — preserves the Record structure, just makes step 1 have no required fields to validate
- Explicit `?? null` coercion in createProjectAction for clarity in TypeScript strict mode

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered
- `bunx` not available in bash environment — used `npx supabase db push` instead. Migration applied successfully to remote DB.
- DATABASE_URL not in shell environment — read from `.env.local` inline. Expected for Windows + Bash tool combination.

## User Setup Required
None — migration was applied directly to the remote Supabase database via `npx supabase db push`.

## Next Phase Readiness
- Phase 28 (Unified Capture Screen) is unblocked — text-path recordings can now be inserted with null storage_path
- Phase 29 (Frictionless Project Creation) is unblocked — projects can be created without a clientId
- Phase 30 (AI Client Extraction) is unblocked — depends on Phases 28/29 which are now unblocked
- Existing audio recordings continue to work: storage_path being non-null passes all existing guards

---
*Phase: 27-capture-schema-migration*
*Completed: 2026-05-08*
