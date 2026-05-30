# Phase 92: Pipeline Event Persistence - Context

**Gathered:** 2026-05-29
**Status:** Ready for planning
**Mode:** Auto (--auto) — recommended defaults selected per gray area, logged below

<domain>
## Phase Boundary

Deliver a new, **service-role-only `pipeline_events` store** plus **backend instrumentation** that durably records every step transition of the recording→estimate pipeline (save recording, transcribe, analyze, generate estimate, preview redirect) for all input types (recording / photo / manual text), capturing success and failure with timing and retry linkage.

This phase is **additive observability only**. It does NOT change pipeline behavior, does NOT alter the existing `estimate_activity` `recording_added` write (EVENT-04), and does NOT build any UI (that is Phase 93). It builds on the `attemptId` lineage shipped in Phase 91.

In scope: the events table + RLS, a write helper, instrumentation calls at each step boundary, input-type capture, retry_count linkage, TypeScript types regeneration.
Out of scope: the Super Admin event-log UI, search/filter/pagination, any read API for admins (Phase 93), retention/TTL cleanup (deferred).
</domain>

<decisions>
## Implementation Decisions

### Table shape & granularity
- **D-01:** Append-only event log — **one row per step execution** (not one mutable row per attempt). Each step transition writes its own row. This makes the per-attempt step timeline (Phase 93 ADMINLOG-04) a simple ordered SELECT.
  - `[auto] Table shape — Q: "One row per attempt (mutated) or one row per step execution (append-only)?" → Selected: "Append-only, one row per step execution" (recommended: matches EVENT-01 'per-attempt, per-step records' + EVENT-04 additive posture; trivial timeline read in Phase 93)`
- **D-02:** Columns (EVENT-01): `id` (uuid pk), `attempt_id` (uuid/text, NOT NULL), `project_id`, `estimate_id` (nullable), `user_id`, `company_id`, `input_type` (recording|photo|manual_text), `step` (save_recording|transcribe|analyze|generate_estimate|preview_redirect), `status` (started|succeeded|failed), `error_message` (nullable text), `error_code` (nullable text — HTTP/provider code), `provider` (nullable — openai|openrouter|anthropic), `duration_ms` (nullable int), `retry_count` (int default 0), `created_at` (timestamptz default now()). Indexes on `attempt_id`, `company_id`, `created_at desc`, and `status`.
- **D-03:** Status model — write a `started` row at step entry and a terminal `succeeded`/`failed` row at step exit; `duration_ms` computed on the terminal row (entry timestamp held in-memory across the step). Planner may collapse to a single terminal row + `duration_ms` if a started/terminal pair proves redundant for a given step — terminal-row-with-duration is the non-negotiable minimum.

### Instrumentation strategy
- **D-04:** A single thin helper `recordPipelineEvent(event)` in `lib/inngest/` (or `lib/observability/`) using `requireServiceClient()` (`lib/supabase/service.ts`) to bypass RLS. Called at each step boundary inside the **server-side** routes (`app/api/transcribe`, `analyze-photos`, `generate-estimate`) and Inngest functions (`lib/inngest/functions/*`). Client-side `capture-recorder.tsx` is NOT a write site — all event writes happen server-side where the service role and the lineage fields are available.
  - `[auto] Instrumentation — Q: "Centralized helper vs inline inserts per step?" → Selected: "Single recordPipelineEvent() helper" (recommended: one shape, one place to harden, reusable across routes + inngest)`
- **D-05:** Failure capture uses the existing Inngest `onFailure` handlers (transcribe/analyze/generate already have them) plus route-level try/catch for the synchronous save-recording step. Both success and failure paths emit an event.

### Failure isolation (instrumentation must never break the pipeline)
- **D-06:** Event writes are **best-effort**: `recordPipelineEvent` wraps its insert in try/catch and never throws / never rejects the caller. A failure to log an event must never fail or alter the user's pipeline. Log a console.warn on write failure and move on.
  - `[auto] Failure isolation — Q: "Should a logging failure surface to the pipeline?" → Selected: "No — swallow and warn" (recommended: observability is additive, must not regress reliability just hardened in Phase 91)`

### Input-type & attempt lineage
- **D-07:** `input_type` is derived at the entrypoint: transcribe dispatch → `recording`, analyze-photos dispatch → `photo`, text-describe/manual generate → `manual_text`. Thread an explicit `inputType` field on the attempt payload (alongside the Phase 91 `attemptId`) so every downstream event row carries it.
- **D-08:** Reuse Phase 91's `attemptId` as the lineage key. The recording flow already mints it (`capture-recorder.tsx` ~L136). Photo and manual-text entrypoints must mint an `attemptId` the same way (client `crypto.randomUUID()`, minted once, reused on retry) and thread it through their dispatch payloads. Server steps that still lack one generate a fallback uuid so an event is never dropped.
- **D-09:** `retry_count` — on Retry (same `attemptId`, same `step` re-executed), increment `retry_count` on the new event row. Compute as `(count of prior events for this attempt_id + step) ` at write time, or carry an explicit retry counter from the client. Planner picks the simpler reliable option; the requirement (EVENT-03) is only that retries are visibly counted and linked to the originating attempt.

### EVENT-04 preservation (non-negotiable)
- **D-10:** Do NOT touch the `estimate_activity` `recording_added` insert at `lib/actions/recording.ts:105-110`. The new `pipeline_events` table is strictly additive. A regression test/assertion should confirm that write still fires unchanged.

### RLS posture
- **D-11:** Follow the `usage_events` / `processed_stripe_events` pattern: `ENABLE ROW LEVEL SECURITY` with **no client policies** (deny-all; service role bypasses RLS for writes). Add a single **super-admin SELECT policy** so Phase 93 can read: `EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = (SELECT auth.uid()))`. No client INSERT/UPDATE/DELETE policies.
  - `[auto] RLS — Q: "Deny-all + super-admin read, or company-scoped read?" → Selected: "Deny-all client + super-admin SELECT only" (recommended: matches EVENT-01 'super-admin read only' + established deny-all convention)`

### Claude's Discretion
- Exact helper file location (`lib/observability/pipeline-events.ts` vs `lib/inngest/pipeline-events.ts`), `attempt_id` column type (uuid vs text — text is safer if client-minted ids aren't guaranteed uuid-shaped), started/terminal vs single-row event modeling (D-03), and the precise `retry_count` computation (D-09) are at the planner's discretion within the constraints above.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` §EVENT-01..04 — the four requirements this phase satisfies
- `.planning/ROADMAP.md` §"Phase 92: Pipeline Event Persistence" (~L996) — goal + success criteria

### Phase 91 lineage (the attemptId this store records)
- `lib/inngest/events.ts` — `TranscribeAudioPayload` (L36–45), `EstimateGeneratePayload` (L15–34); where `attemptId`/`requestId`/`recordingId` live on payloads
- `lib/actions/recording.ts` — `createRecording()` (L67–114, includes the EVENT-04 `recording_added` write at L105–110), `transcribeRecording(recordingId, attemptId?)` (L129)
- `components/capture/capture-recorder.tsx` — `attemptId` mint (~L136), `requestId` mint (~L137)

### Pipeline step sites to instrument
- `app/api/transcribe/route.ts` (POST L22–118) + `lib/inngest/functions/transcribe-audio.ts` (`transcribeAudioJob` L40–123; onFailure L47–67)
- `app/api/analyze-photos/route.ts` (POST L21–104) + `lib/inngest/functions/analyze-photos.ts` (`analyzePhotosJob` L51–161; onFailure L58–78)
- `app/api/generate-estimate/route.ts` (POST L34–124) + `lib/inngest/functions/generate-estimate.ts` (`generateEstimateJob` L35–109; onFailure L42–62)

### DB / RLS / service-role conventions
- `supabase/migrations/20260513000001_phase55_subscription_tiers.sql` — `usage_events` deny-all RLS pattern (model for this table)
- `supabase/migrations/20260514000001_phase58_stripe_processed_events.sql` — `processed_stripe_events` deny-all pattern
- `supabase/migrations/20260419000001_platform_admin.sql` — `platform_admins` table (L21–25) + super-admin predicate `EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = (SELECT auth.uid()))` (L105–109)
- `supabase/migrations/20260409000001_initial_schema.sql` — `estimate_activity` columns (EVENT-04 reference shape)
- `lib/supabase/service.ts` — `requireServiceClient()` (L25–34), the RLS-bypassing write client
- `types/database.types.ts` — generated types snapshot; regenerate after the migration

### Migration naming
- `supabase/migrations/YYYYMMDDHHMMSS_<description>.sql` (recent: `20260528000002_security_tighten_public_bucket_mime.sql`)
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `requireServiceClient()` (`lib/supabase/service.ts:25`) — RLS-bypassing service-role client; already used by all three Inngest functions for writes to deny-all tables.
- Inngest `onFailure` handlers already exist on transcribe/analyze/generate jobs — natural hook for emitting `failed` events.
- Phase 91 `attemptId`/`requestId` lineage already threaded through transcribe + generate payloads.

### Established Patterns
- Deny-all RLS by omission of policies (`usage_events`, `processed_stripe_events`); service role bypasses.
- Super-admin gating via `EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = (SELECT auth.uid()))`.
- Inngest step boundaries via `step.run('<name>', ...)`; idempotency keys per job (Phase 91).
- Types are generated into `types/database.types.ts` (no manual edits).

### Integration Points
- New table written from: 3 API routes + 3 Inngest functions (server-side only).
- Read by: Phase 93 Super Admin UI (super-admin SELECT policy is the contract this phase must expose).
- Must NOT alter: `lib/actions/recording.ts:105-110` (EVENT-04).
</code_context>

<specifics>
## Specific Ideas

- The events table is named `pipeline_events` unless the planner finds a stronger existing convention.
- The five canonical `step` enum values: `save_recording`, `transcribe`, `analyze`, `generate_estimate`, `preview_redirect`.
- The three `input_type` values: `recording`, `photo`, `manual_text`.
- The three `status` values: `started`, `succeeded`, `failed`.
- Modeled on the reference "Generations" panel concept — store only safe metadata; NO raw audio bytes, full transcripts, or API keys ever land in this table (forward-looking guard for ADMINLOG-05).
</specifics>

<deferred>
## Deferred Ideas

- Super Admin event-log UI (list, search, filters, counts, refresh, per-attempt timeline) — **Phase 93** (ADMINLOG-01..05).
- Retention / TTL / archival cleanup for `pipeline_events` — explicitly out of scope per REQUIREMENTS.md "Out of Scope".
- External APM / Sentry export — out of scope (in-app store only).
- Alerting on failure spikes — out of scope.

None of the above belong in Phase 92.
</deferred>

---

*Phase: 92-pipeline-event-persistence*
*Context gathered: 2026-05-29*
