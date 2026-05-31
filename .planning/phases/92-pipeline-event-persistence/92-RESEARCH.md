# Phase 92: Pipeline Event Persistence - Research

**Researched:** 2026-05-29
**Domain:** Supabase migration mechanics + server-side instrumentation seam (Next.js 16 App Router + Inngest v4)
**Confidence:** HIGH (all findings verified against in-repo source; no external API surface to validate)

## Summary

This phase adds a service-role-only `pipeline_events` table and best-effort instrumentation across the recording→estimate pipeline. The codebase is already fully mapped (CONTEXT.md `<canonical_refs>`), so this research focuses on the five planning gaps: migration mechanics, the exact instrumentation seam (file:line + in-scope fields), attemptId threading for photo/manual entrypoints, `retry_count` mechanics, and the Nyquist validation architecture.

The dominant constraint is the **Windows + no-Docker reality**: `supabase gen types` cannot run via the local DB path here. The established project pattern (since Phase 19, reconfirmed Phase 70) is to regenerate types from the live project via a stored `SUPABASE_ACCESS_TOKEN` PAT, OR hand-edit `types/database.types.ts` when even that is unavailable. The migration SQL itself is applied via `bunx supabase db push --db-url $DATABASE_URL` against the remote DB (the local Supabase stack is not run on this machine). **Type regeneration is the one step the planner cannot assume is runnable in-environment** — plan for hand-editing the `pipeline_events` type block as the reliable fallback, exactly as Phases 19/24/38/70 did.

**Primary recommendation:** Ship the migration with the DDL in §"Recommended DDL", add `lib/observability/pipeline-events.ts` with a single best-effort `recordPipelineEvent()` using `requireServiceClient()`, instrument the three Inngest functions + three routes at the file:line sites listed in §"Instrumentation Seam", thread `attemptId`+`inputType` through the three entrypoints (photo and manual-text currently mint NOTHING), and compute `retry_count` inside the helper via a count query. Test entirely at the vitest unit level using the existing static-source-read + mocked-Supabase patterns.

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Append-only event log — one row per step execution (not one mutable row per attempt).
- **D-02:** Columns: `id` (uuid pk), `attempt_id` (NOT NULL), `project_id`, `estimate_id` (nullable), `user_id`, `company_id`, `input_type` (recording|photo|manual_text), `step` (save_recording|transcribe|analyze|generate_estimate|preview_redirect), `status` (started|succeeded|failed), `error_message` (nullable), `error_code` (nullable), `provider` (nullable openai|openrouter|anthropic), `duration_ms` (nullable int), `retry_count` (int default 0), `created_at` (timestamptz default now()). Indexes on `attempt_id`, `company_id`, `created_at desc`, `status`.
- **D-03:** Status model — `started` at entry + terminal `succeeded`/`failed` at exit; `duration_ms` on terminal row. Planner MAY collapse to a single terminal row + `duration_ms` (terminal-row-with-duration is the non-negotiable minimum).
- **D-04:** Single thin helper `recordPipelineEvent(event)` in `lib/inngest/` or `lib/observability/`, using `requireServiceClient()`. Called server-side only. `capture-recorder.tsx` is NOT a write site.
- **D-05:** Failure capture via existing Inngest `onFailure` handlers + route-level try/catch for save-recording.
- **D-06:** Event writes are best-effort: wrap insert in try/catch, never throw, console.warn on failure.
- **D-07:** `input_type` derived at entrypoint: transcribe→recording, analyze-photos→photo, text/manual generate→manual_text. Thread explicit `inputType` on the attempt payload.
- **D-08:** Reuse Phase 91 `attemptId`. Photo + manual-text entrypoints must mint one (client `crypto.randomUUID()`, once, reused on retry). Server steps lacking one generate a fallback uuid.
- **D-09:** `retry_count` — count prior events for `attempt_id + step` at write time, OR carry a client counter. Planner picks the simpler reliable option.
- **D-10:** Do NOT touch the `estimate_activity` `recording_added` insert at `lib/actions/recording.ts:105-110`. Regression test must confirm it still fires.
- **D-11:** Deny-all client RLS (no client policies) + single super-admin SELECT policy: `EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = (SELECT auth.uid()))`.

### Claude's Discretion
- Helper file location (`lib/observability/pipeline-events.ts` vs `lib/inngest/pipeline-events.ts`), `attempt_id` column type (uuid vs text), started/terminal vs single-row modeling (D-03), precise `retry_count` computation (D-09).

### Deferred Ideas (OUT OF SCOPE)
- Super Admin event-log UI (Phase 93 / ADMINLOG-01..05).
- Retention / TTL / archival cleanup.
- External APM / Sentry export.
- Alerting on failure spikes.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| EVENT-01 | New events store persists per-attempt, per-step records; RLS deny-all + service writes + super-admin read | §"Recommended DDL" (full CREATE TABLE + RLS + indexes), modeled on `usage_events`/`processed_stripe_events` + `platform_admins` predicate |
| EVENT-02 | Backend instrumentation writes an event at each step transition (save/transcribe/analyze/generate/preview) with timing | §"Instrumentation Seam" (exact file:line sites + in-scope fields per step) |
| EVENT-03 | All input types captured (recording/photo/manual_text); retries increment retry_count + link to attempt | §"attemptId & inputType Threading" (photo/manual entrypoints mint nothing today) + §"retry_count Mechanics" |
| EVENT-04 | Existing `recording_added` write preserved (no regression); store is additive | §"EVENT-04 Preservation" + a regression test asserting the insert still fires |

## Standard Stack

No new libraries. Everything required is already installed and in use.

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@supabase/supabase-js` | ^2.103.0 | service-role insert into `pipeline_events` | `requireServiceClient()` already wraps it (`lib/supabase/service.ts:25`) |
| `inngest` | ^4.4.0 | step boundaries + `onFailure` hooks for failed events | already the pipeline backbone (D-05) |
| `vitest` | ^4.1.4 | unit tests for helper/RLS/instrumentation | `npm test` → `vitest run`; all phase tests are unit-level |

**Installation:** none. `package.json` already has every dependency.

## Migration Mechanics (THIS project)

### How migrations are applied here
- **Migration files:** `supabase/migrations/YYYYMMDDHHMMSS_<desc>.sql`. Most recent on disk: `20260528000002_security_tighten_public_bucket_mime.sql`. **Pick a timestamp strictly greater**, e.g. `20260529000001_phase92_pipeline_events.sql`.
- **Application command:** `bunx supabase db push --db-url $DATABASE_URL` (documented in `20260513000001_phase55_subscription_tiers.sql:4` header and STATE.md Decision `[Phase 01-foundation-auth 01-03]`). This pushes against the **remote** DB; the local Supabase stack (`config.toml` exists but `supabase/.gitignore` + `.temp/` linked-project indicate a linked remote project, not a running local DB).
- **`config.toml`:** `project_id = "xtimator"`, `[db] major_version = 17`, `[db.migrations] enabled = true`. Linked remote project ref lives in `supabase/.temp/project-ref` (`prmqgcrnpuvpzruyzvuv` per the Phase 70 types todo).
- There is precedent for a manual one-off applier script (`scripts/apply-migration-76-01.mjs`) using `pg`, but the canonical path for a new table is `supabase db push`.

### Types regeneration (the environment caveat — FLAG)
- `npm` has **no** `gen:types` script. There is no automated hook.
- **Docker is unavailable on this Windows machine** (`.planning/todos/done/2026-05-17-regenerate-database-types-via-supabase-cli.md` documents Docker Desktop crashing). So `supabase gen types typescript --db-url …` (which spawns a `postgres-meta` container) **cannot run here**.
- **Working path (verified Phase 70):** a `SUPABASE_ACCESS_TOKEN` PAT is persisted in `.env.local`, enabling the no-Docker project-id path:
  ```bash
  supabase gen types typescript --project-id prmqgcrnpuvpzruyzvuv --schema public > types/database.types.ts
  ```
  This requires the migration to already be pushed to the remote (so the live schema includes `pipeline_events`).
- **Reliable fallback (used in Phases 19/24/38):** hand-edit `types/database.types.ts` to add the `pipeline_events` `Row`/`Insert`/`Update` block. STATE.md has multiple decisions confirming this is an accepted convention ("Manual TypeScript type extension (not regeneration) … Docker unavailable on Windows, established since Phase 19").
- **Planner action:** plan a task that (1) attempts `supabase gen types … --project-id` after push, and (2) explicitly falls back to a hand-edited type block if the CLI/PAT is unavailable. Do **not** assume regeneration is runnable. The helper's `Insert` payload only needs the 14 columns in D-02, so a hand-edit is small and safe.

### Recommended DDL

Modeled on `usage_events` (`20260513000001`, deny-all RLS) + `platform_admins` super-admin predicate (`20260419000001:108`). Recommend **`attempt_id uuid`** — every minter is `crypto.randomUUID()` (verified: capture-recorder L136, and the photo/manual entrypoints will use the same), so uuid is safe and gives Phase 93 indexed equality. Use **TEXT + CHECK** for the enum-like columns (`input_type`/`step`/`status`/`provider`) — the project explicitly avoids Postgres enums (STATE.md D-07/D-08, Phase 55/19).

```sql
-- supabase/migrations/20260529000001_phase92_pipeline_events.sql
-- Phase 92: Pipeline Event Persistence (EVENT-01)
-- Append-only, one row per step execution. Service-role writes only.
-- Deny-all client RLS (model: usage_events / processed_stripe_events).
-- Super-admin SELECT for Phase 93 (model: platform_admins predicate).
-- Applied via: bunx supabase db push --db-url $DATABASE_URL

CREATE TABLE IF NOT EXISTS public.pipeline_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id    UUID NOT NULL,
  company_id    UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id    UUID,            -- not FK-constrained: events must survive project deletion for forensics
  estimate_id   UUID,            -- nullable: most steps run before an estimate row exists
  user_id       UUID,            -- nullable: derived best-effort; never block an event on a missing user
  input_type    TEXT NOT NULL
    CHECK (input_type IN ('recording', 'photo', 'manual_text')),
  step          TEXT NOT NULL
    CHECK (step IN ('save_recording', 'transcribe', 'analyze', 'generate_estimate', 'preview_redirect')),
  status        TEXT NOT NULL
    CHECK (status IN ('started', 'succeeded', 'failed')),
  error_message TEXT,
  error_code    TEXT,
  provider      TEXT
    CHECK (provider IS NULL OR provider IN ('openai', 'openrouter', 'anthropic')),
  duration_ms   INTEGER,
  retry_count   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Deny-all for anon/authenticated; service role bypasses RLS for writes.
ALTER TABLE public.pipeline_events ENABLE ROW LEVEL SECURITY;

-- Phase 93 read contract: super-admins only (no client INSERT/UPDATE/DELETE policies).
CREATE POLICY "pipeline_events_select_super_admin"
  ON public.pipeline_events
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = (SELECT auth.uid())));

-- Phase 93 per-attempt timeline (ordered SELECT) + admin filters.
CREATE INDEX pipeline_events_attempt_id     ON public.pipeline_events(attempt_id);
CREATE INDEX pipeline_events_company_created ON public.pipeline_events(company_id, created_at DESC);
CREATE INDEX pipeline_events_created_at      ON public.pipeline_events(created_at DESC);
CREATE INDEX pipeline_events_status          ON public.pipeline_events(status);

COMMENT ON TABLE public.pipeline_events IS
  'Append-only per-step pipeline event log. Service-role writes only; super-admin read only. Phase 92.';
```

**Notes / tradeoffs:**
- `company_id` is FK'd (matches `usage_events`); `project_id`/`estimate_id`/`user_id` are **deliberately NOT FK'd** — forensic rows must outlive deleted entities, and a broken FK must never fail a best-effort insert. (If the planner prefers symmetry with `usage_events`, FK only `company_id`.)
- `attempt_id` NOT NULL is enforceable because every write site has an attemptId or mints a fallback uuid (D-08).
- No `updated_at` despite REQUIREMENTS.md mentioning "created/updated timestamps" — append-only rows are never updated (D-01), so `updated_at` would always equal `created_at`. Omitting it is correct; if the planner wants literal EVENT-01 compliance, add `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` (harmless, unused).

## Instrumentation Seam (EVENT-02)

The helper (recommend `lib/observability/pipeline-events.ts` — observability is a distinct concern from the Inngest plumbing) is called at these exact sites. **Server-side only.** For each step, the table shows which D-02 fields are in scope.

### Step `save_recording` — route-level try/catch (D-05)
| Site | File:line | In scope | NOT in scope → how to get |
|------|-----------|----------|---------------------------|
| audio recording | `lib/actions/recording.ts:67-114` `createRecording()` | `company.id` (companyId), `projectId`, recording row (`recording.id`), `duration_seconds` | `attemptId`/`inputType` — must be added as params (caller `capture-recorder.tsx:373` passes them); `user_id` — `getActiveCompanyId()` context has claims via `getAuthContext()`; add a `select('id, user_id')` or read `claims.sub` |
| text recording | `lib/actions/recording.ts:31-65` `createTextRecording()` | same shape, `input_type=manual_text` | same; this is the manual-text save site |

`save_recording` is synchronous and has no provider call — emit a single terminal `succeeded` row after the insert, `failed` in the existing error branches (L51, L87). `duration_ms` is the wall-clock of the insert (small; optional). `provider=null`.

### Step `transcribe` — Inngest function (D-05)
| Site | File:line | In scope | NOT in scope → how to get |
|------|-----------|----------|---------------------------|
| started | `lib/inngest/functions/transcribe-audio.ts:70` (top of handler) | `recordingId`, `storagePath`, `companyId`, `attemptId` (on `TranscribeAudioPayload` — already threaded, L44) | `projectId`/`estimateId`/`userId` — `loadCompanyForRecording()` (L19-38) already joins `companies(user_id)`; extend its select to `company_id, project_id, companies(user_id)` via the recordings row |
| succeeded | after `save-transcript` step, L97-98 | same + `duration_ms` (measure `Date.now()` at L70 vs here) | `provider='openrouter'` (transcription goes through `transcribeAudioOR`, OpenRouter-routed OpenAI) |
| failed | `onFailure` handler L47-67 (already loads companyId/userId) | `error` (→ error_message), `payload.recordingId`, `payload.attemptId` | `error_code` — parse from error if HTTP-shaped, else null; `input_type='recording'` |

### Step `analyze` — Inngest function (D-05)
| Site | File:line | In scope | NOT in scope → how to get |
|------|-----------|----------|---------------------------|
| started | `lib/inngest/functions/analyze-photos.ts:80-82` (top of handler) | `companyId`, `projectId`, `requestId` | **`attemptId` is NOT on `AnalyzePhotosPayload`** (`lib/inngest/events.ts:47-51`) — must be ADDED to the type + dispatch; `userId` via existing `loadOwnerUserId()` (L21-33) |
| succeeded | after `record-usage` step, L136 | same + `duration_ms`, `photos.length` | `provider='openrouter'` (`analyzePhotoOR`); `input_type='photo'` |
| failed | `onFailure` L58-78 (already loads userId) | `error`, `payload.projectId/companyId/requestId` | `attemptId` (after type extension) |

### Step `generate_estimate` — Inngest function (D-05)
| Site | File:line | In scope | NOT in scope → how to get |
|------|-----------|----------|---------------------------|
| started | `lib/inngest/functions/generate-estimate.ts:64-66` | `companyId`, `projectId`, `requestId`, `attemptId` (already on `EstimateGeneratePayload` L33), `prompts`, `language` | `userId` via `loadOwnerUserId()` (L21); `estimateId` not yet known at start |
| succeeded | after `record-usage` step, L82 | `result` (the generated estimate; `result` may carry the new estimate id) | `estimate_id` — read from `result`, OR query `estimates` where `project_id` + `is_current=true` (same query capture-recorder uses, L453-458); `provider='anthropic'`/`'openrouter'` per `generateEstimateForProject` config |
| failed | `onFailure` L42-62 | `error`, `payload.*` | `error_code`, `attemptId` (present) |

### Step `preview_redirect`
This is the **terminal success** of the whole attempt (user lands on the estimate). There is no server-side redirect — the client does `router.push('…?tab=estimate&estimate=…')` (capture-recorder L333/L468/L541, text-describe L84, photos-input L81). Per D-04, the client is **not** a write site.

**Recommendation:** Emit `preview_redirect / succeeded` from the **server-side `generate_estimate` succeeded path** (immediately after the generate event, same site as above, once the `estimate_id` is resolved). The redirect is the deterministic consequence of a successful generate; modeling it as a paired server event keeps the write off the client and still gives Phase 93 a "reached preview" terminal marker. `provider=null`, `duration_ms=null`. (Tradeoff: it's a logical, not literal, redirect event — acceptable since the client redirect is non-instrumentable per D-04. Document this in the plan.)

### Helper shape (recommended)
```ts
// lib/observability/pipeline-events.ts
import { requireServiceClient } from '@/lib/supabase/service'

export type PipelineStep =
  | 'save_recording' | 'transcribe' | 'analyze' | 'generate_estimate' | 'preview_redirect'
export type PipelineStatus = 'started' | 'succeeded' | 'failed'
export type PipelineInputType = 'recording' | 'photo' | 'manual_text'

export interface PipelineEventInput {
  attemptId: string
  inputType: PipelineInputType
  step: PipelineStep
  status: PipelineStatus
  companyId?: string | null
  projectId?: string | null
  estimateId?: string | null
  userId?: string | null
  provider?: 'openai' | 'openrouter' | 'anthropic' | null
  errorMessage?: string | null
  errorCode?: string | null
  durationMs?: number | null
}

/** Best-effort (D-06): never throws, never rejects the caller. */
export async function recordPipelineEvent(ev: PipelineEventInput): Promise<void> {
  try {
    const svc = requireServiceClient()
    const retryCount = await computeRetryCount(svc, ev)   // see §retry_count
    await svc.from('pipeline_events').insert({
      attempt_id: ev.attemptId,
      input_type: ev.inputType,
      step: ev.step,
      status: ev.status,
      company_id: ev.companyId ?? null,
      project_id: ev.projectId ?? null,
      estimate_id: ev.estimateId ?? null,
      user_id: ev.userId ?? null,
      provider: ev.provider ?? null,
      error_message: ev.errorMessage ?? null,
      error_code: ev.errorCode ?? null,
      duration_ms: ev.durationMs ?? null,
      retry_count: retryCount,
    })
  } catch (err) {
    console.warn('[recordPipelineEvent] swallowed write failure:', err)
  }
}
```
Mirrors the existing best-effort `void notify(...)` pattern already used in all three Inngest functions (e.g. `transcribe-audio.ts:100-119`). Call sites should `void recordPipelineEvent(...)` to avoid awaiting the observability write on the hot path.

## attemptId & inputType Threading (EVENT-03)

EVENT-03 requires **all three input types** captured. The current state per entrypoint:

| Input type | Entrypoint(s) | attemptId today | inputType today | Action |
|------------|---------------|-----------------|-----------------|--------|
| `recording` | `capture-recorder.tsx` (mints L136 `ensureAttempt`), threads to transcribe (L388) + generate (L294/L432) | ✅ minted + threaded | ❌ none | add `inputType:'recording'` to transcribe + generate payloads |
| `photo` | `components/projects/photos-input.tsx:46` (dispatches `/api/generate-estimate` with **only** `{projectId}`), and `capture-recorder.tsx:499` photos path | ❌ **mints nothing** | ❌ none | mint `attemptId` (client `crypto.randomUUID()`, in a ref so Retry reuses it) + send `inputType:'photo'`; **analyze-photos has its own dispatch** — `AnalyzePhotosPayload` needs `attemptId` added |
| `manual_text` | `components/projects/text-describe.tsx:48`, `capture-recorder.tsx:288` (`triggerEstimateGeneration`/`handleGenerate`), `use-ai-input-submit.ts:65` (`runGenerate`), MCP `lib/mcp/tools/write.ts` | ❌ **mints nothing** (except capture-recorder which mints but uses for audio) | ❌ none | mint `attemptId` + send `inputType:'manual_text'` |

**Concrete threading changes the planner must scope:**
1. **`lib/inngest/events.ts`:** add `attemptId?: string` + `inputType?: 'recording'|'photo'|'manual_text'` to `AnalyzePhotosPayload` (L47-51); add `inputType?` to `TranscribeAudioPayload` (L36-45) and `EstimateGeneratePayload` (L15-34). All optional so older callers compile (matches the Phase 91 `attemptId?` convention).
2. **Routes derive `inputType` at the boundary (D-07):**
   - `app/api/transcribe/route.ts:102` → `inputType:'recording'`.
   - `app/api/analyze-photos/route.ts:89` → `inputType:'photo'`; also read `attemptId` from the body (currently not read).
   - `app/api/generate-estimate/route.ts:113` → derive: if `prompts`/text origin → `manual_text`, if photos-only → `photo`, else `recording`. **The route cannot reliably infer this** — recommend the **client sends an explicit `inputType`** in the POST body (each entrypoint knows its own type) and the route forwards it. This is cleaner than server-side inference. The route falls back to `manual_text` if absent (safest default for the text/MCP path).
3. **Client entrypoints** (`photos-input.tsx`, `text-describe.tsx`, `use-ai-input-submit.ts`, capture-recorder photo/text paths) add an `attemptIdRef` (mint once via `crypto.randomUUID()`, reuse on retry — copy the `ensureAttempt` pattern from capture-recorder L135-138) and send `{ attemptId, inputType }` in their fetch bodies.
4. **Server fallback (D-08):** in each instrumentation site, `const attemptId = payload.attemptId ?? crypto.randomUUID()` so an event is never dropped for a legacy caller (e.g. MCP `write.ts`).

**Cite:** photo entrypoints `components/projects/photos-input.tsx:46-51`, `components/capture/capture-recorder.tsx:499-509`; manual-text `components/projects/text-describe.tsx:48-53`, `components/workspace/ai-input-group/use-ai-input-submit.ts:65-69`, `components/capture/capture-recorder.tsx:288-296`; MCP `lib/mcp/tools/write.ts` (dispatches `EVENT_ESTIMATE_GENERATE`).

## retry_count Mechanics (D-09)

**Recommendation: compute inside the helper via a count query** — `retry_count = count(prior pipeline_events rows WHERE attempt_id = ev.attemptId AND step = ev.step AND status = ev.status)` (or just `attempt_id + step` for terminal rows).

```ts
async function computeRetryCount(svc, ev: PipelineEventInput): Promise<number> {
  if (ev.status === 'started') return 0   // only count terminal re-executions, or count all — see note
  const { count } = await svc
    .from('pipeline_events')
    .select('id', { count: 'exact', head: true })
    .eq('attempt_id', ev.attemptId)
    .eq('step', ev.step)
    .eq('status', ev.status)
  return count ?? 0   // 0 on first execution, 1 on first retry, …
}
```

**Why this over a client counter:**
- The client (`capture-recorder.tsx`) already tracks `retriesUsed` (L100), but it's per-capture-session and not available to the photo/manual entrypoints, the MCP path, or Inngest's *internal* retries (`retries: 2`). A DB count captures **every** re-execution of the same `attempt_id + step`, including Inngest auto-retries that never touch the client.
- It's self-correcting and stateless across the distributed Inngest workers (no shared counter to thread).

**Tradeoff / race consideration:** Under concurrent retries of the same step there's a TOCTOU window — two writes could both read `count=0` and both store `retry_count=0`. This is **acceptable** for observability (it's a diagnostic hint, not a billing key, per EVENT-03 "visibly counted"). It is NOT idempotent/exact. If the planner wants exactness, defer to Phase 93 to compute ordinal at read time (`ROW_NUMBER() OVER (PARTITION BY attempt_id, step ORDER BY created_at)`) — but D-09 only requires "visibly counted + linked," which the count query satisfies. The count query adds one cheap indexed read (`pipeline_events_attempt_id`) per terminal event — negligible and off the user hot path (`void`-ed).

## EVENT-04 Preservation (D-10)

The `estimate_activity` `recording_added` insert at `lib/actions/recording.ts:105-110` is in a **different function** (`createRecording`) than any new instrumentation needs to touch. The new `save_recording` event is an **additional** insert into a **different table** (`pipeline_events`), added alongside — not replacing — the existing `estimate_activity` write. There is zero overlap. The regression guard is a static-source assertion (see Validation Architecture) that the `recording_added` insert literal still exists, plus a behavioral test that `createRecording` still calls `.from('estimate_activity').insert(...)`.

## Common Pitfalls

### Pitfall 1: Awaiting the observability write on the hot path
**What goes wrong:** `await recordPipelineEvent()` adds a DB round-trip (plus the retry-count read) to the user-facing latency, and a slow/hanging insert delays the pipeline.
**How to avoid:** `void recordPipelineEvent(...)` (fire-and-forget) — exactly how `void notify(...)` is already used in all three Inngest functions. The helper's internal try/catch (D-06) guarantees an unhandled rejection can't crash the worker.

### Pitfall 2: Forgetting `attemptId` on the analyze-photos payload
**What goes wrong:** `AnalyzePhotosPayload` (unlike Transcribe/Generate) has NO `attemptId` field today (`lib/inngest/events.ts:47-51`). Instrumenting analyze without adding it produces a fallback-uuid per run, breaking the per-attempt timeline (Phase 93 ADMINLOG-04) for the photo path.
**How to avoid:** add `attemptId?` + `inputType?` to `AnalyzePhotosPayload` and thread from `app/api/analyze-photos/route.ts:89` + the client.

### Pitfall 3: Hand-editing types then assuming `db push` ran the migration
**What goes wrong:** the type block compiles but the table doesn't exist on the remote → every `recordPipelineEvent` swallows a "relation does not exist" error silently (D-06), and no events are ever recorded. The best-effort design HIDES this failure.
**How to avoid:** the migration push is a hard prerequisite. Add a Wave-0 / post-migration smoke check (a query against `pipeline_events` from a service-role script, or the `supabase/audits/check-tables.mjs` pattern) confirming the table exists before relying on instrumentation. Do not let the swallow-and-warn helper mask a missing-table deploy.

### Pitfall 4: `provider` mislabeling
**What goes wrong:** transcription and photo analysis route through `lib/ai/openrouter-client.ts` (`transcribeAudioOR`/`analyzePhotoOR`) — the provider is `openrouter`, not `openai`, even though Whisper is an OpenAI model. Generate uses `generateEstimateForProject` which may use anthropic or openrouter per company config.
**How to avoid:** set `provider='openrouter'` for transcribe/analyze; for generate, read the actual provider from the AI config rather than hardcoding (or leave null if not readily in scope — `provider` is nullable).

### Pitfall 5: Migration timestamp collision / ordering
**What goes wrong:** a timestamp ≤ the latest existing migration (`20260528000002`) breaks ordering on `db push`.
**How to avoid:** use `20260529000001_phase92_pipeline_events.sql` (today, 2026-05-29) or later.

## Runtime State Inventory

Not a rename/refactor/migration-of-data phase — this is additive greenfield (new table + new writes). No existing stored data, OS-registered state, or secrets are renamed. The only runtime-state concern is the **remote DB schema** (must receive the new migration) and **`types/database.types.ts`** (must gain the new type block) — both covered in §"Migration Mechanics". No other categories apply.

## Validation Architecture

> nyquist_validation is `true` in `.planning/config.json` → this section is required.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^4.1.4 |
| Config file | `vitest.config.*` (include pattern scoped to `tests/unit/**` per STATE.md decision) |
| Quick run command | `npm test` (`vitest run`) |
| Full suite command | `npm test` |

All phase seams are unit-testable. Supabase and Inngest are **mocked** in this repo (verified: `tests/unit/api/transcribe-dispatch.test.ts` mocks `@/lib/supabase/server` + `@/lib/inngest/client`; `tests/unit/inngest/transcribe-audio-job.test.ts` reads source statically to assert `step.run` boundaries; `tests/setup/inngest-mocks.ts` provides `mockInngestSend`). Follow these exact patterns — no live DB, no real Inngest.

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EVENT-01 | Migration has deny-all RLS + super-admin SELECT + required columns/indexes | unit (static SQL contract) | `npx vitest run tests/unit/observability/pipeline-events-migration.test.ts` | ❌ Wave 0 |
| EVENT-01/06 | `recordPipelineEvent` inserts the D-02 shape via `requireServiceClient()` | unit (mocked service client) | `npx vitest run tests/unit/observability/record-pipeline-event.test.ts` | ❌ Wave 0 |
| EVENT-02 (D-06) | helper SWALLOWS insert errors (never throws) | unit | same file | ❌ Wave 0 |
| EVENT-02 | each instrumented site calls `recordPipelineEvent` for started/succeeded/failed | unit (static source read, like transcribe-audio-job.test.ts) | `npx vitest run tests/unit/observability/instrumentation-presence.test.ts` | ❌ Wave 0 |
| EVENT-03 | photo + manual entrypoints mint/thread `attemptId` + `inputType` | unit (mocked fetch/dispatch) | `npx vitest run tests/unit/observability/input-type-threading.test.ts` | ❌ Wave 0 |
| EVENT-03 | `retry_count` increments on repeat `attempt_id+step` | unit (mocked count query) | record-pipeline-event.test.ts | ❌ Wave 0 |
| EVENT-04 | `createRecording` still inserts `estimate_activity recording_added` | unit (mocked supabase, assert `.from('estimate_activity').insert`) | `npx vitest run tests/unit/observability/event04-regression.test.ts` | ❌ Wave 0 |

### How to assert each tricky seam
- **Best-effort (D-06):** mock `requireServiceClient` to return a client whose `.insert()` rejects; assert `await recordPipelineEvent(...)` resolves (does not throw) and `console.warn` was called. Pattern: `vi.mock('@/lib/supabase/service')`.
- **EVENT-04 still fires:** reuse the `makeSupabaseMock` table-switch pattern from `tests/unit/api/transcribe-dispatch.test.ts:52-103`; spy on the `estimate_activity` insert and assert it's called with `event_type:'recording_added'` after instrumentation is added to `createRecording`.
- **RLS posture (static contract):** `readFileSync` the migration SQL and assert it contains `ENABLE ROW LEVEL SECURITY`, a `FOR SELECT` policy with the `platform_admins … auth.uid()` predicate, and NO `FOR INSERT/UPDATE/DELETE … TO authenticated` policy (deny-all). Mirrors how `transcribe-audio-job.test.ts` asserts `step.run` names from source.
- **Instrumentation presence (static):** `readFileSync` each of the 3 functions + 3 routes and assert `recordPipelineEvent` appears with the expected `step`/`status` literals. Cheap, deterministic, no mocking the whole Inngest runtime.

### Sampling Rate
- **Per task commit:** `npm test` (fast; whole suite is unit-level).
- **Per wave merge:** `npm test`.
- **Phase gate:** full suite green + `tsc` clean before `/gsd:verify-work`. Manual UAT: trigger one capture per input type, then query `pipeline_events` as a super-admin to confirm rows landed (this is the only non-automatable check — DB inspection).

### Wave 0 Gaps
- [ ] `tests/unit/observability/pipeline-events-migration.test.ts` — RLS/columns/indexes static contract (EVENT-01)
- [ ] `tests/unit/observability/record-pipeline-event.test.ts` — helper shape + best-effort + retry_count (EVENT-01/02/03)
- [ ] `tests/unit/observability/instrumentation-presence.test.ts` — call-site presence (EVENT-02)
- [ ] `tests/unit/observability/input-type-threading.test.ts` — attemptId+inputType on photo/manual dispatch (EVENT-03)
- [ ] `tests/unit/observability/event04-regression.test.ts` — `recording_added` preserved (EVENT-04)
- [ ] Migration file `supabase/migrations/20260529000001_phase92_pipeline_events.sql`
- [ ] `types/database.types.ts` `pipeline_events` block (regen via PAT or hand-edit fallback)
- Framework install: none (vitest already present).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Supabase CLI (`bunx supabase db push`) | applying the migration to remote | ✓ (used through Phase 91) | linked project `prmqgcrnpuvpzruyzvuv` | `scripts/apply-migration-*.mjs` (`pg`) one-off applier |
| `SUPABASE_ACCESS_TOKEN` PAT | `supabase gen types --project-id` (no-Docker type regen) | ✓ (persisted to `.env.local`, Phase 70) | — | hand-edit `types/database.types.ts` |
| Docker | `supabase gen types --db-url` / local stack | ✗ (Docker Desktop crashes on this Windows box) | — | use `--project-id` PAT path; or hand-edit types |
| vitest | all phase tests | ✓ | ^4.1.4 | — |
| `DATABASE_URL` | `db push` target | ✓ (in `.env.local`) | — | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Docker (→ PAT-based type regen or hand-edit). This is the established workflow since Phase 19; not a blocker.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `recording_added` row in `estimate_activity` | Per-step `pipeline_events` (this phase) | Phase 92 | additive; old write preserved (D-10) |
| `attemptId` in-flight only (Phase 91) | `attemptId` durably persisted per step | Phase 92 | the store this phase delivers |

Nothing deprecated. The Inngest v4 `onFailure` + `step.run` API and the deny-all-RLS-by-omission convention are both current and in active use.

## Open Questions

1. **`generate-estimate` route inputType derivation**
   - What we know: the route serves all three input types (recording via capture-recorder, photo via photos-input/capture, manual via text-describe/MCP).
   - What's unclear: the route body alone can't always tell photo-vs-text-vs-recording.
   - Recommendation: have each client send an explicit `inputType` in the POST body (each knows its own); route forwards it, defaulting to `manual_text`. Avoids brittle server inference. (Covered in §"attemptId & inputType Threading".)

2. **`provider` for generate_estimate**
   - What we know: `generateEstimateForProject` picks provider from company AI config (anthropic / openrouter).
   - What's unclear: whether the provider string is readily in scope at the instrumentation site without an extra query.
   - Recommendation: if not trivially available, store `null` (column is nullable) — provider is a nice-to-have for generate, not load-bearing for EVENT-02.

3. **`preview_redirect` as a server-side logical event**
   - Resolved recommendation: emit it from the generate_estimate succeeded path (client redirect is non-instrumentable per D-04). Planner should confirm this satisfies the Phase 93 timeline expectation (it gives a terminal "reached preview" marker per attempt).

## Sources

### Primary (HIGH confidence — in-repo source, read directly)
- `lib/supabase/service.ts:25-34` — `requireServiceClient()`
- `lib/inngest/events.ts` — payload types (attemptId present on Transcribe/Generate, ABSENT on AnalyzePhotos)
- `lib/actions/recording.ts:31-114` — `createTextRecording` / `createRecording` (EVENT-04 site L105-110)
- `app/api/transcribe/route.ts`, `app/api/analyze-photos/route.ts`, `app/api/generate-estimate/route.ts` — dispatch sites
- `lib/inngest/functions/{transcribe-audio,analyze-photos,generate-estimate}.ts` — handlers + onFailure
- `components/capture/capture-recorder.tsx:135-138,288-548` — attemptId mint + all dispatch paths
- `components/projects/photos-input.tsx:46`, `components/projects/text-describe.tsx:48`, `components/workspace/ai-input-group/use-ai-input-submit.ts:65` — entrypoints that mint NOTHING today
- `supabase/migrations/20260513000001_phase55_subscription_tiers.sql` (usage_events deny-all), `20260514000001_phase58_stripe_processed_events.sql`, `20260419000001_platform_admin.sql:108` (super-admin predicate)
- `supabase/config.toml`, `.planning/todos/done/2026-05-17-regenerate-database-types-via-supabase-cli.md` — migration + type-gen mechanics
- `tests/unit/api/transcribe-dispatch.test.ts`, `tests/unit/inngest/transcribe-audio-job.test.ts`, `tests/setup/inngest-mocks.ts`, `tests/unit/capture/capture-attempt-lineage.test.ts` — mocking patterns
- `package.json` — scripts/deps; `.planning/config.json` — nyquist_validation true
- `.planning/STATE.md` — type-regen + TEXT+CHECK + db-push conventions

### Secondary / Tertiary
- None required — phase is fully internal; no external API surface to verify.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; all from `package.json`.
- Migration mechanics: HIGH — verified against config.toml, migration headers, and the documented type-regen todo.
- Instrumentation seam: HIGH — every file:line read directly; in-scope fields confirmed from source.
- attemptId threading: HIGH — confirmed photo/manual entrypoints mint nothing; AnalyzePhotosPayload lacks attemptId.
- retry_count: MEDIUM — recommendation is sound but the race tradeoff is a judgment call the planner should ratify.
- Validation architecture: HIGH — mirrors existing, passing test patterns in the repo.

**Research date:** 2026-05-29
**Valid until:** 2026-06-28 (stable internal codebase; re-verify if Phase 91 payloads or the AI client provider routing change).

## RESEARCH COMPLETE
