# Phase 27: Capture Schema Migration — Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Pure infrastructure prerequisite for v1.5. Two schema changes:

1. `recordings.storage_path` — remove `NOT NULL` constraint so text-path recordings can be inserted with a transcript but no audio file
2. `lib/schemas/project.ts` + `lib/actions/project.ts` — make `clientId` optional so projects can be created without a client

No UI changes. No new routes. No new components. Every other phase in v1.5 depends on this one.

Requirements: infrastructure prerequisite — unblocks CAPTURE-02, CAPTURE-04, CLIENTASSOC-01, CLIENTASSOC-04.

</domain>

<decisions>
## Implementation Decisions

### D-01: recordings.storage_path — DB Migration
- New migration: `supabase/migrations/20260508000002_phase27_nullable_storage_path.sql`
- SQL: `ALTER TABLE recordings ALTER COLUMN storage_path DROP NOT NULL;`
- No backfill needed — existing rows already have storage_path values; removing the constraint is non-destructive
- Migration filename continues the Phase 24 sequence (20260508000001 was Phase 24)

### D-02: Recording TypeScript Type
- `lib/queries/recording.ts` — `storage_path: string` → `storage_path: string | null`
- All callers that use `recording.storage_path` must handle null (e.g., skip audio playback when null)
- `lib/database.types.ts` — regenerate after migration OR manually update `recordings.Row.storage_path` to `string | null`
- The `Recording` interface exported from `lib/queries/recording.ts` is the canonical type used by the workspace

### D-03: Project clientId — Application Schema Only (no DB migration)
- `projects.client_id` is already nullable in the DB (`UUID REFERENCES clients(id) ON DELETE SET NULL` — no NOT NULL constraint in `20260409000001_initial_schema.sql`)
- No DB migration needed for `projects.client_id`
- Change is purely in: `lib/schemas/project.ts` — `clientId: z.string().min(1, ...)` → `clientId: z.string().optional()`
- `lib/actions/project.ts` — `client_id: formData.clientId` — already handles optional since `client_id` column accepts null; no change needed if schema uses `.optional()`
- `lib/schemas/project.ts` step validation: `STEP_FIELDS[1]: ['clientId']` — remove `clientId` from required step fields since it's now optional

### D-04: Orphan Cron Safety
- The pg_cron orphan cleanup deletes `draft` projects with no recordings after 24h
- For v1.5, text-path recordings are inserted immediately when the user submits text (same as audio) — the orphan predicate `projects with no recordings` will not apply to text-path projects that have completed submission
- No cron changes needed in this phase; the text-path implementation (Phase 28) is responsible for inserting the recording row atomically

### Claude's Discretion
- Whether to regenerate `lib/database.types.ts` via `npx supabase gen types` or manually update the `storage_path` field — manual update is acceptable for a single nullable change; regenerate is cleaner but requires Supabase CLI
- Whether to add a migration comment explaining the business reason (`-- Phase 27: Enable text-only recordings for v1.5 multi-modal capture`)
- Test coverage: add integration test for nullable storage_path insert, or rely on TypeScript type check + existing recording RLS tests

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Database Schema
- `supabase/migrations/20260409000001_initial_schema.sql` — original schema; `recordings` table at line 67-74 (storage_path TEXT NOT NULL), `projects.client_id` at line 57 (already nullable)
- `lib/queries/recording.ts` — `Recording` interface with `storage_path: string` — must become `string | null`
- `lib/schemas/project.ts` — `clientId: z.string().min(1)` and `STEP_FIELDS[1]: ['clientId']` — must become optional

### Existing Patterns to Follow
- `supabase/migrations/20260508000001_phase24_estimate_templates.sql` — most recent migration, follow this naming convention
- `lib/database.types.ts` — generated types; `recordings.Row.storage_path` field to update

### Callers of storage_path (must handle null after this change)
- `components/workspace/audio/audio-recorder.tsx` — uses recording data; check if storage_path is accessed
- `components/workspace/audio/recording-list.tsx` — renders recordings; storage_path used for playback
- `app/api/transcribe/route.ts` (or equivalent) — may read storage_path to fetch audio from storage

</canonical_refs>

<code_context>
## Existing Code Insights

### Exact Changes Required

**File 1: `supabase/migrations/20260508000002_phase27_nullable_storage_path.sql`** (new)
```sql
-- Phase 27: Enable text-only recordings for v1.5 multi-modal capture
ALTER TABLE recordings ALTER COLUMN storage_path DROP NOT NULL;
```

**File 2: `lib/queries/recording.ts`**
- Change: `storage_path: string` → `storage_path: string | null`

**File 3: `lib/schemas/project.ts`**
- Change: `clientId: z.string().min(1, 'Please select a client')` → `clientId: z.string().optional()`
- Change: remove `clientId` from step validation in `STEP_FIELDS` (or keep it but not require it)

**File 4: `lib/database.types.ts`** (if manually updated)
- Change: `recordings` Row type `storage_path: string` → `storage_path: string | null`

### Integration Points
- After `storage_path` becomes nullable, callers that pass it to Supabase Storage `download` must guard against null
- `projectSchema.clientId` becoming optional propagates to `createProjectAction` — `client_id: formData.clientId` becomes `client_id: formData.clientId ?? null` (or just `formData.clientId` since undefined is coerced to null by Postgres)

</code_context>

<specifics>
## Specific Ideas

- This phase has zero user-visible changes — success is measured entirely by tests and TypeScript compilation
- The migration should be run via `bunx supabase db push` (established project pattern from STATE.md)
- Existing audio recordings will continue to work exactly as before — the constraint removal is backward-compatible

</specifics>

<deferred>
## Deferred Ideas

- Full regeneration of `lib/database.types.ts` via `npx supabase gen types` — would catch all type drifts across the codebase but requires Supabase CLI configured; defer to a tech-debt phase
- `projects.input_mode` TEXT column (`audio | text | photos | mixed`) for usage analytics — deferred to v2 per REQUIREMENTS.md

</deferred>

---

*Phase: 27-capture-schema-migration*
*Context gathered: 2026-05-08*
