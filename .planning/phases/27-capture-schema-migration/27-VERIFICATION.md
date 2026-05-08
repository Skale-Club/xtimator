---
phase: 27-capture-schema-migration
verified: 2026-05-08T20:30:00Z
status: passed
score: 4/4 must-haves verified
re_verification: false
---

# Phase 27: Capture Schema Migration Verification Report

**Phase Goal:** The database schema supports text-only recordings (no audio file) and projects without a linked client
**Verified:** 2026-05-08T20:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A recording row with null storage_path and a non-null transcript can be inserted without a DB constraint violation | VERIFIED | Migration `20260508000002_phase27_nullable_storage_path.sql` contains `ALTER TABLE recordings ALTER COLUMN storage_path DROP NOT NULL`; Row type is `string \| null`; Insert type is `string? \| null` |
| 2 | A project can be created without a clientId and no Zod validation error is thrown | VERIFIED | `lib/schemas/project.ts` has `clientId: z.string().optional()`; `STEP_FIELDS[1] = []`; `createProjectAction` uses `formData.clientId ?? null` |
| 3 | Existing audio recordings (non-null storage_path) still render the play button and signed URL is fetched | VERIFIED | `recording-item.tsx` guards `if (!recording.storage_path) return` — only skips signed URL fetch when null; play button already gated by `disabled={!audioUrl}` so non-null path recordings are unaffected |
| 4 | TypeScript compilation passes with no errors on all modified files | VERIFIED | `npx tsc --noEmit` exits with zero output (0 errors) |

**Score:** 4/4 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/20260508000002_phase27_nullable_storage_path.sql` | DROP NOT NULL on recordings.storage_path | VERIFIED | File exists; contains exact SQL `ALTER TABLE recordings ALTER COLUMN storage_path DROP NOT NULL` |
| `lib/queries/recording.ts` | Recording interface with nullable storage_path | VERIFIED | Line 7: `storage_path: string \| null` |
| `types/database.types.ts` | Generated types updated for nullable storage_path | VERIFIED | Row (line 703): `storage_path: string \| null`; Insert (line 712): `storage_path?: string \| null` |
| `lib/schemas/project.ts` | Optional clientId in project Zod schema | VERIFIED | `clientId: z.string().optional()`; `STEP_FIELDS[1] = []` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `lib/queries/recording.ts` | `components/workspace/audio/recording-item.tsx` | `Recording` interface import | WIRED | `import type { Recording } from '@/lib/queries/recording'` on line 12; `recording.storage_path` used with null guard inside `fetchSignedUrl` |
| `lib/schemas/project.ts` | `lib/actions/project.ts` | `ProjectFormValues` type | WIRED | `import type { ProjectFormValues } from '@/lib/schemas/project'`; `client_id: formData.clientId ?? null` on line 37 |
| `lib/actions/recording.ts` | supabase storage | null guard before `.download()` and `.remove()` | WIRED | `if (!recording.storage_path) { return { error: '...' } }` at line 88 in `transcribeRecording`; `if (recording.storage_path) { ... .remove([recording.storage_path]) }` at lines 168-177 in `deleteRecording` |

### Data-Flow Trace (Level 4)

Not applicable. Phase 27 contains no components that render dynamic data — all changes are type definitions, schema constraints, and null guards. No data-flow trace required.

### Behavioral Spot-Checks

Not applicable for this phase. Phase 27 is a pure infrastructure migration with no runnable entry points introduced. The verification criteria are type-level and SQL-level; TypeScript compilation (0 errors) serves as the behavioral check.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| CAPTURE-02 | 27-01-PLAN.md | Capture screen text description field (prerequisite: nullable storage_path) | SATISFIED (infrastructure) | `storage_path: string \| null` in DB and types unblocks Phase 28 text-path recordings |
| CAPTURE-04 | 27-01-PLAN.md | Generate Estimate enabled when any input present (prerequisite: nullable storage_path) | SATISFIED (infrastructure) | Same as CAPTURE-02 — DB constraint removed |
| CLIENTASSOC-01 | 27-01-PLAN.md | Project can be created without a client upfront | SATISFIED (infrastructure) | `clientId: z.string().optional()` + `STEP_FIELDS[1] = []` means wizard step 1 has no required fields; `createProjectAction` accepts null client_id |
| CLIENTASSOC-04 | 27-01-PLAN.md | Projects without linked client show "Link client" card | SATISFIED (infrastructure) | Optional clientId accepted in schema — UI implementation deferred to Phase 29 as intended |

Note: REQUIREMENTS.md checkbox markers show CAPTURE-02, CAPTURE-04, CLIENTASSOC-01, CLIENTASSOC-04 as `[x]` (completed) while the phase tracking table still shows them as "Pending" for Phases 28/29. The checkbox completion is premature — these requirements are only infrastructurally unblocked by Phase 27; full satisfaction requires Phases 28 and 29 UI work. This is a documentation inconsistency, not a code gap.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `types/database.types.ts` | 721 | `Update.storage_path?: string` (missing `\| null` vs Row/Insert) | Info | Update type is more restrictive than Row/Insert — passing `null` to an Update call would be a TypeScript error. Plan stated this field was already `string?` and required no change. This is a pre-existing gap unrelated to Phase 27 scope. |

No blockers or warnings. The Update type inconsistency is pre-existing and out of scope for this phase.

### Human Verification Required

#### 1. DB Constraint Verification

**Test:** In Supabase Studio or via a direct DB connection, attempt to INSERT a row into `recordings` with `storage_path = NULL` and a non-null `transcript`. Verify the insert succeeds without a constraint violation.
**Expected:** Row inserted successfully with `id`, `project_id`, `company_id`, `transcript` populated and `storage_path = NULL`.
**Why human:** Cannot execute DML against the remote Supabase database from this environment. Migration was applied by the executor via `npx supabase db push` during plan execution.

#### 2. Wizard Step 1 Navigation

**Test:** Open the new project wizard in a browser. Verify that clicking "Next" on Step 1 (client selection) without selecting a client advances to Step 2 without any validation error message.
**Expected:** Step 1 advances without showing "Please select a client" or any similar error.
**Why human:** Wizard behavior requires a running Next.js dev server and browser interaction.

### Gaps Summary

No gaps. All must-have truths are verified at the code level. The migration file exists with the correct SQL, all TypeScript types propagate `string | null` through the Recording interface and database types, the Zod schema accepts optional clientId, and all three storage callers have null guards that prevent crashes on text-only recordings.

The two items flagged for human verification are confirmatory checks, not gaps — the code evidence strongly supports both behaviors.

---

_Verified: 2026-05-08T20:30:00Z_
_Verifier: Claude (gsd-verifier)_
