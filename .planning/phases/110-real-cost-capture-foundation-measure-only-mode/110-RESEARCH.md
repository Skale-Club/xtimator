# Phase 110: Real Cost Capture Foundation + Measure-Only Mode - Research

**Researched:** 2026-06-24
**Domain:** AI cost instrumentation (OpenRouter cost capture + computed Whisper cost) correlated to existing `usage_events`/`pipeline_events`, persisted measure-only (no charging)
**Confidence:** HIGH (the load-bearing OpenRouter cost mechanism is verified against current official docs; the codebase wiring is read directly)

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| COST-01 | Capture the real USD cost of every OpenRouter AI call (today only tokens captured for Langfuse) | OpenRouter now returns `usage.cost` (USD) on EVERY chat-completion response automatically — no request flag, no second API call. Parse it in the three `fetch`-based call sites (`openrouter.ts` callTool, `openrouter-client.ts` analyzePhotoOR + translateTextsOR) + the price-research adapters. See §Standard Stack, §Code Examples. |
| COST-02 | Compute Whisper/STT cost from audio minutes × a configurable rate (provider returns no cost) | Whisper (OpenAI `whisper-1`) returns ONLY text. Audio duration already exists as `recordings.duration_seconds` (written by `createRecording`). cost = `(duration_seconds / 60) × rate`. Rate is a module const this phase (`billing_config` arrives in Phase 111). See §Code Examples, §Architecture Patterns. |
| COST-03 | Real cost per AI operation recorded + correlated to existing attempt/usage instrumentation, available for calibration | Persist in a NEW append-only `ai_cost_events` table keyed by `attempt_id` (the existing Phase-92 correlation id) + `operation_type`. Mirrors the `pipeline_events` service-role/deny-all RLS posture. Aggregatable per operation_type for CALIB-01/02. See §Architecture Patterns. |
| CALIB-01 | Cost capture runs in production measure-only (instrumented, no charging) before any billing | This phase is PURELY additive instrumentation: no `credit_ledger`, no debit, no balance check, no gating. Capture + persist only. The `recordAICost` helper has NO credit logic (that is Phase 112). See §Architecture Patterns "Measure-Only invariant". |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **No secrets in code/docs** — never write real `sk-or-*` / `sk-ant-*` / `whsec_*` / `sk_live_*` values into migrations, comments, planning docs, or test fixtures. Use placeholders. A `gitleaks` pre-commit hook blocks these patterns.
- **GSD workflow** — file-changing work goes through a GSD command (this is plan/execute, already in-flow).
- **Deploy via CI→GHCR→Coolify, never build on the VPS** — a migration in this phase is NOT applied to remote by the executor; the deploy pipeline owns it (operational deferral, consistent with phases 106/108).
- **Idempotent migrations** — every migration uses `CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`, `DROP ... IF EXISTS` (project pattern, see phase108 CHECK-widen migration).
- **Tech stack** — Next.js 14 App Router, TypeScript strict, Supabase PostgreSQL with RLS, service-role key never in the browser.
- **Channel-neutral domain** — cost-capture lives in `lib/ai/*` / `lib/observability/*` / a new `lib/billing/*`; it must NOT import from `lib/whatsapp/*`. (Consistent with the v4.6 channel-neutral guardrail.)

## Summary

OpenRouter's API changed materially since this codebase's Langfuse instrumentation was written: the **per-request USD cost is now returned automatically on every chat-completion response** under `usage.cost` (plus `usage.cost_details`), and the previously-required `usage: { include: true }` request flag is **deprecated and has no effect**. OpenRouter credits are denominated 1:1 in US dollars, so `usage.cost` is directly the real USD spend for that call. This means COST-01 needs NO second `GET /api/v1/generation` round-trip and NO request-body change — just parse a field the response already carries at all four OpenRouter `fetch` call sites. This is the cleanest path and avoids the async-lag caveat of the generation-stats endpoint.

Whisper (OpenAI `whisper-1`, called directly — NOT via OpenRouter) returns only text and no cost, so COST-02 is computed: `cost = (audio_minutes) × rate`. The audio duration already exists in the codebase as `recordings.duration_seconds` (written by `createRecording`), so no new measurement is needed — the rate is the only new input, and it's a module constant this phase (the configurable `billing_config` is Phase 111). Note the Gemini transcription/vision fallback path returns no cost either and should be recorded as `real_cost_usd = null` (provider known, cost unknown), never silently zeroed.

Persistence (COST-03) should be a NEW append-only `ai_cost_events` table keyed on the existing `attempt_id` correlation id (the Phase-92 lineage already threaded through every AI job) plus `operation_type` — this keeps cost out of the hot `usage_events`/`pipeline_events` write paths, supports clean per-operation-type aggregation for calibration, and mirrors the proven `pipeline_events` RLS posture (deny-all clients, service-role writes, super-admin SELECT). The capture helper (`recordAICost`) MUST be non-fatal/never-throw — an exact copy of the `recordPipelineEvent` contract (try/catch → `console.warn` → return; `void recordAICost(...)` on the hot path) — and contains ZERO credit logic, satisfying the measure-only invariant (CALIB-01).

**Primary recommendation:** Parse `usage.cost` (USD) from every OpenRouter response (no request flag, no generation lookup); compute Whisper cost from the existing `recordings.duration_seconds × rate` module const; persist both via a new never-throw `recordAICost()` into a new append-only service-role `ai_cost_events` table correlated by `attempt_id` + `operation_type`. No charging, no ledger, no gating — pure additive instrumentation.

## Standard Stack

### Core
| Mechanism | "Version"/Current state | Purpose | Why Standard |
|-----------|-------------------------|---------|--------------|
| OpenRouter `usage.cost` (response field) | Current API as of 2026-06 — returned **automatically**, no flag | Real per-request USD cost for chat/vision/translation/research calls | Authoritative cost computed by OpenRouter from provider native tokens; inline = no extra latency/round-trip |
| `usage.cost_details.upstream_inference_cost` | Current | Upstream provider cost detail (0/null for non-BYOK) | Optional finer breakdown; safe to store but not required |
| OpenAI Whisper `whisper-1` (direct, `response_format: text`) | Existing in `openrouter-client.ts` | Transcription — returns text ONLY, no cost/usage | Computed cost = minutes × rate (COST-02) |
| `recordings.duration_seconds` (existing column) | Existing schema | Audio minutes source for COST-02 | Written by `createRecording`; no new measurement needed |
| `attempt_id` (Phase 92 lineage, UUID) | Existing | Correlation key joining cost → pipeline_events → Langfuse trace | Already threaded through every AI Inngest job |

### Supporting
| Component | Current state | Purpose | When to Use |
|-----------|---------------|---------|-------------|
| `recordPipelineEvent` (`lib/observability/pipeline-events.ts`) | Existing | The exact never-throw + service-role pattern to copy for `recordAICost` | Template for the new helper |
| `requireServiceClient()` (`lib/supabase/service`) | Existing | Service-role, RLS-bypassing writes | All `ai_cost_events` inserts |
| `getIntegrationKey('openrouter')` (`lib/platform-config`) | Existing | Already used in all OpenRouter call sites | No change needed for cost |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Parse inline `usage.cost` | `GET /api/v1/generation?id={id}` returning `total_cost` | The generation-stats endpoint is async and **lags the completion** (stats may not be ready immediately), and costs a second authenticated round-trip per call. The inline field is synchronous, free, and already in the response we parse. Use the generation endpoint ONLY if a future need arises for fields not in `usage` (we don't have one). **Recommendation: inline `usage.cost`.** |
| New `ai_cost_events` table | Add `real_cost_usd` column to `usage_events` | `usage_events` is on the hot quota path and keyed by `(company_id, idempotency_key)`, not by attempt; not every AI op records a usage_event (transcribe records none today), and photo records ONE event for N photos — so a per-call cost can't cleanly attach. A separate table avoids touching the metering hot path and gives a clean per-operation-type aggregate. |
| New `ai_cost_events` table | Add `real_cost_usd` column to `pipeline_events` | `pipeline_events` is keyed by step/status with started+succeeded rows per step — cost would attach ambiguously (which row?) and pollute the forensic log. A purpose-built cost table is cleaner and the attempt_id still joins them. |

**Installation:** No new npm dependencies. All mechanisms use the existing `fetch` adapters, existing Supabase service client, and a new SQL migration.

**Version verification:** No npm package version to verify — the load-bearing dependency is the OpenRouter HTTP API surface, verified against current official docs (2026-06): `usage.cost` is returned automatically; `usage: { include: true }` is deprecated/no-op (see §Sources). OpenRouter credits = USD 1:1 (base currency is US dollars), so no conversion is applied to `usage.cost`.

## Architecture Patterns

### Recommended Structure
```
lib/
├── billing/
│   └── record-ai-cost.ts      # NEW: recordAICost() — never-throw, service-role, ZERO credit logic
├── ai/
│   ├── providers/openrouter.ts    # EXTEND: parse usage.cost in callTool, thread out
│   └── openrouter-client.ts       # EXTEND: parse usage.cost in analyzePhotoOR + translateTextsOR
└── observability/pipeline-events.ts  # the copy-this template (never-throw + requireServiceClient)
supabase/migrations/
└── 2026MMDD000001_phase110_ai_cost_events.sql   # NEW: append-only, service-role-only RLS
```

### Pattern 1: Inline cost capture at the OpenRouter fetch boundary
**What:** Every OpenRouter `fetch` already does `await res.json()`. The response now carries `usage.cost` (USD). Extend the response type and read it where the call site already reads `usage.prompt_tokens`/`usage.completion_tokens`.
**When to use:** All four OpenRouter call sites — `openrouter.ts` `callTool` (generate/refine), `openrouter-client.ts` `analyzePhotoOR` (vision) + `translateTextsOR` (translation), and the price-research adapters (`openrouter-web.ts`).
**Example:**
```typescript
// Source: codebase lib/ai/providers/openrouter.ts (current shape) + OpenRouter usage-accounting docs
type OpenRouterChatResponse = {
  choices?: Array<{ message?: { content?: string | null; tool_calls?: /* … */ } }>
  error?: { message?: string }
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    cost?: number                 // NEW — USD, returned automatically (no request flag)
    cost_details?: { upstream_inference_cost?: number | null }
  }
}
// after `const json = (await res.json()) as OpenRouterChatResponse`
const realCostUsd = json.usage?.cost ?? null   // null when absent — never default to 0
```

### Pattern 2: Computed Whisper cost from existing duration
**What:** Whisper returns no cost. Compute it from the audio length already persisted on the recording row.
**When to use:** The transcribe-audio Inngest job (`lib/inngest/functions/transcribe-audio.ts`), after a successful transcript.
**Example:**
```typescript
// Source: codebase lib/inngest/functions/transcribe-audio.ts (duration available via recordings row)
// Whisper rate is a MODULE CONST this phase; Phase 111 moves it to billing_config.
const WHISPER_USD_PER_MINUTE = 0.006 // OpenAI whisper-1 list price; verify before charging (CALIB)
const minutes = (durationSeconds ?? 0) / 60
const realCostUsd = minutes > 0 ? minutes * WHISPER_USD_PER_MINUTE : null
// Gemini transcription fallback returns no cost → record provider:'gemini', realCostUsd:null
```

### Pattern 3: Never-throw persistence (copy recordPipelineEvent verbatim in spirit)
**What:** A single best-effort `recordAICost()` that writes one append-only row and NEVER throws/rejects the caller.
**When to use:** Every cost capture site, called as `void recordAICost(...)` on the hot path.
**Example:**
```typescript
// Source: codebase lib/observability/pipeline-events.ts (the proven never-throw contract)
export interface AICostInput {
  attemptId: string
  operationType: 'estimate' | 'photo_batch' | 'audio_minutes' | 'price_research' | 'translation' | 'vision'
  provider: 'openrouter' | 'openai' | 'anthropic' | 'gemini'
  realCostUsd: number | null          // null = provider gave no cost (e.g. Gemini fallback)
  companyId?: string | null
  projectId?: string | null
  estimateId?: string | null
  model?: string | null
  units?: number | null               // photos count, audio minutes, etc. (optional context)
}
export async function recordAICost(ev: AICostInput): Promise<void> {
  try {
    const svc = requireServiceClient()
    await svc.from('ai_cost_events').insert({ /* snake_case map */ })
  } catch (err) {
    console.warn('[recordAICost] swallowed write failure:', err) // never break generation
  }
}
```

### Pattern 4: Migration mirrors the pipeline_events / price_research_cache RLS posture
**What:** Append-only table, `ENABLE ROW LEVEL SECURITY`, **service-role writes only** (no client INSERT/UPDATE/DELETE policies), super-admin-only SELECT (for the calibration dashboard later), idempotent DDL, TEXT+CHECK for enum-like columns (project avoids Postgres enums).
**Example:**
```sql
-- Source: codebase supabase/migrations/20260529000001_phase92_pipeline_events.sql (posture to mirror)
CREATE TABLE IF NOT EXISTS public.ai_cost_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id     UUID NOT NULL,                              -- joins pipeline_events / Langfuse
  company_id     UUID REFERENCES public.companies(id) ON DELETE CASCADE,
  project_id     UUID,
  estimate_id    UUID,
  operation_type TEXT NOT NULL
    CHECK (operation_type IN ('estimate','photo_batch','audio_minutes','price_research','translation','vision')),
  provider       TEXT NOT NULL
    CHECK (provider IN ('openrouter','openai','anthropic','gemini')),
  model          TEXT,
  real_cost_usd  NUMERIC(12,6),     -- nullable: NULL = provider returned no cost (Gemini/whisper-unknown)
  units          NUMERIC(12,2),     -- optional: photos count / audio minutes
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.ai_cost_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ai_cost_events_select_super_admin" ON public.ai_cost_events
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = (SELECT auth.uid())));
CREATE INDEX IF NOT EXISTS ai_cost_events_attempt_id  ON public.ai_cost_events(attempt_id);
CREATE INDEX IF NOT EXISTS ai_cost_events_op_created  ON public.ai_cost_events(operation_type, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_cost_events_company     ON public.ai_cost_events(company_id, created_at DESC);
```

### Measure-Only invariant (CALIB-01)
This phase is purely additive. The plan MUST NOT introduce: a `credit_ledger`, any debit, any balance read/check, any pre-op gating, any user-facing balance, or any `companies.credit_balance` column. `recordAICost` writes a cost row and returns — nothing more. Phase 112 builds the ledger that reads these rows' aggregates. A verification step should assert no charging code exists (grep for `credit`, `debit`, `balance` in the new files → expect zero in production paths).

### Anti-Patterns to Avoid
- **Defaulting unknown cost to 0:** A Gemini fallback or a missing `usage.cost` must record `real_cost_usd = null`, never `0`. A zero pollutes the calibration average (CALIB-02 derives markup from the mean real cost); null is excludable in aggregation. NULL means "unknown", 0 means "free".
- **Adding `usage: { include: true }` to request bodies:** It is deprecated and a no-op; adding it is dead code and misleads the next reader into thinking it's load-bearing.
- **A second `GET /api/v1/generation` call per AI op:** Doubles request volume, adds latency, and the stats can lag the completion. Only the inline field is needed.
- **Making cost capture fatal:** A cost-write failure must never fail generation (mirror `recordPipelineEvent`'s D-06). Use `void recordAICost(...)` + internal try/catch.
- **Writing cost into `usage_events`/`pipeline_events`:** Pollutes hot/forensic paths and attaches ambiguously (photo = 1 usage_event for N calls; pipeline = multiple rows per step). Use the dedicated table joined by `attempt_id`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Per-request OpenRouter USD cost | A token-count × hard-coded price-table calculator | The inline `usage.cost` field | OpenRouter computes authoritative cost from the model's NATIVE tokenizer + the actual provider/route used (which varies per request via fallback/routing); a local price table drifts the moment a model price or route changes. |
| Cost correlation key | A new bespoke request id | The existing `attempt_id` (Phase 92) | Already generated, already threaded through every AI job, already on `pipeline_events` and the Langfuse trace metadata — reuse joins everything for free. |
| Never-throw best-effort write | A new try/catch convention | Copy `recordPipelineEvent`'s exact contract | The pattern (service-role client, swallow + `console.warn`, `void` on hot path) is proven in production since Phase 92. |
| Audio duration | Re-measure audio length server-side | `recordings.duration_seconds` | Already captured by `createRecording` at upload time. |

**Key insight:** Almost everything this phase needs already exists — the correlation id, the duration, the never-throw pattern, the service client, the RLS posture. The genuinely NEW facts are (a) OpenRouter now hands you `usage.cost` for free, and (b) one new append-only table. Resist rebuilding what's there.

## Common Pitfalls

### Pitfall 1: Assuming `usage: { include: true }` is still required
**What goes wrong:** Plan adds the flag to request bodies and treats it as the enabling switch for cost.
**Why it happens:** Older OpenRouter docs / training data (and SEED-035 line 87, written from that knowledge) describe the flag as the mechanism.
**How to avoid:** The flag is deprecated and has no effect — `usage.cost` is returned automatically. Just parse it. (Verified, current docs.)
**Warning signs:** A diff that modifies the request `body` object rather than the response-parsing type.

### Pitfall 2: Whisper has no cost field — silently recording 0
**What goes wrong:** A generic "parse usage.cost" approach applied to the Whisper path finds nothing and records 0 (or crashes).
**Why it happens:** Whisper goes to OpenAI directly (`api.openai.com/v1/audio/transcriptions`, `response_format: text`) — the response is plain text, no JSON usage at all.
**How to avoid:** Whisper cost is COMPUTED (minutes × rate), never parsed. The transcribe path needs `durationSeconds` threaded into the cost record (load it from the `recordings` row — it's already fetched in `loadCompanyForRecording`-adjacent queries; add `duration_seconds` to that select).
**Warning signs:** A `usage.cost` read in `transcribeAudioOR`.

### Pitfall 3: The transcribe path currently records NO usage_event at all
**What goes wrong:** Plan assumes `audio_minutes`/`audio_transcribed` usage events already exist to attach cost to. They DON'T — `recordUsage(..., 'audio_transcribed', ...)` is never called anywhere (verified by grep: `audio_transcribed` appears only in `lib/quota.ts` type/map definitions, never at a call site). `checkQuota('audio_minutes')` also early-returns `{allowed:true}` without counting.
**Why it happens:** SEED-035's table implies `audio_minutes` is "already instrumented"; it's defined but not wired.
**How to avoid:** Cost capture for transcription stands on its own via `recordAICost` keyed by `attempt_id` — it does NOT depend on a usage_event existing. (Whether to ALSO start recording `audio_transcribed` usage_events is a Phase-112 metering decision, not required for COST-02/measure-only. Flag as an open question, don't expand scope here.)
**Warning signs:** A plan task that says "attach cost to the existing audio usage_event."

### Pitfall 4: Cost present on the response but the call site discards the parsed JSON early
**What goes wrong:** `callTool` returns `parsed` (the tool-call arguments), not the usage. To capture cost you must read `json.usage.cost` BEFORE returning and thread it out — but the method's return type is `Record<string, unknown>` (the estimate), with no place for cost.
**Why it happens:** The adapter interface (`AIProvider.generateEstimate`) returns `EstimateOutput`, not a `{ output, cost }` envelope. Threading cost out without breaking the interface needs a decision.
**How to avoid:** Recommended — capture cost INSIDE the adapter/client (where `json.usage.cost` is in scope) via `void recordAICost(...)`, exactly like the Langfuse `gen.end(...)` block already does there. The cost record is a side effect at the boundary; the method's return signature stays unchanged. This avoids refactoring `AIProvider`/`callWithFallback`/`provider-with-fallback`. The `attemptId`/`companyId` needed for the record must be threaded INTO the adapter call (today they aren't passed to `generateEstimate`) — see Open Question 1.
**Warning signs:** A plan that widens `EstimateOutput` or `AIProvider` to carry cost.

### Pitfall 5: Multi-tenant invariant — companyId/attemptId never from model output
**What goes wrong:** Reading `companyId` from anything the LLM produced.
**Why it happens:** Convenience.
**How to avoid:** `companyId`/`attemptId`/`projectId` are caller-supplied params/closures threaded from the Inngest job payload (the codebase already enforces this — see `provider-with-fallback.ts` comment "companyId stays a param/closure — NEVER read from LLM output"). The cost record inherits the same discipline.
**Warning signs:** Any cost field derived from `parsed`/`json.choices`.

## Code Examples

### OpenRouter cost capture inside the existing Langfuse block (generate/refine)
```typescript
// Source: codebase lib/ai/providers/openrouter.ts callTool (extend the existing post-parse block)
const json = (await res.json()) as OpenRouterChatResponse   // type extended with usage.cost
// ... existing tool-call parse → `parsed` ...
const realCostUsd = json.usage?.cost ?? null   // USD; null when absent (never 0)
// existing Langfuse gen.end(...) block stays; ADD alongside it:
void recordAICost({
  attemptId,                 // must be threaded into callTool — see Open Question 1
  operationType: 'estimate', // or 'translation'/'vision' at the other call sites
  provider: 'openrouter',
  model: this.model,
  realCostUsd,
  companyId,                 // threaded param, never from `parsed`
})
```

### Whisper computed cost (transcribe job)
```typescript
// Source: codebase lib/inngest/functions/transcribe-audio.ts (after save-transcript succeeds)
// loadCompanyForRecording already SELECTs the recordings row — add duration_seconds to that select.
const minutes = (durationSeconds ?? 0) / 60
void recordAICost({
  attemptId,
  operationType: 'audio_minutes',
  provider: 'openai',                 // or 'gemini' on the fallback path
  model: 'whisper-1',
  realCostUsd: minutes > 0 ? minutes * WHISPER_USD_PER_MINUTE : null,
  companyId: ident.companyId,
  projectId: ident.projectId,
  units: minutes,
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `usage: { include: true }` in request to opt into usage/cost | Usage (incl. `usage.cost`) returned **automatically** on every response; the flag is deprecated/no-op | OpenRouter API update (current as of 2026-06) | COST-01 needs NO request change and NO generation-endpoint call — just parse the response field. SEED-035's "via `usage.include` OR `/api/v1/generation`" is now "just read `usage.cost`". |
| `stream_options: { include_usage: true }` to get usage on streams | Deprecated/no-op; usage is in the final SSE chunk automatically | Same update | N/A here (codebase uses non-streaming chat completions). |

**Deprecated/outdated:**
- `usage: { include: true }` request flag — deprecated, no effect. Do not add it.
- Relying on `GET /api/v1/generation?id={id}` for cost — still works but is async (stats can lag the completion) and a redundant round-trip when `usage.cost` is inline.

## Open Questions

1. **Threading `attemptId`/`companyId` into the OpenRouter ADAPTER (`generateEstimate`/`refineEstimate`).**
   - What we know: The transcribe/photo Inngest jobs already have `attemptId` + `companyId` in scope and call `recordPipelineEvent` with them. But the estimate ADAPTER (`OpenRouterAdapter.callTool`) receives only `EstimateInput` (system/user content) — it has no `attemptId`/`companyId` today. The generate job builds the graph (`buildEstimateGraph`) which eventually calls the adapter; the correlation id lives in the job/graph, not the adapter.
   - What's unclear: The cleanest seam to pass these context fields into the adapter without polluting the `AIProvider` interface — options: (a) add an optional `costContext?: { attemptId; companyId; projectId }` to `EstimateInput` (threaded from the graph), (b) capture cost one layer up in the graph node that owns `attemptId`, reading a cost value the adapter returns via a side channel, or (c) capture in `provider-with-fallback.ts` where a `companyId` param already exists (but `attemptId` still isn't there, and the OpenRouter `usage.cost` is only visible inside the adapter).
   - Recommendation: Option (a) — add an optional, non-LLM `costContext` to `EstimateInput` threaded from the generate-estimate graph (where `attemptId`/`companyId`/`projectId` already exist). The adapter reads it for the side-effect `recordAICost` call; absent context → record with nulls (still captures cost). Vision/translation/research call sites are simpler — pass the context as new function args. The planner should confirm the exact graph wiring during planning (read `lib/estimate/graph.ts` + the generate node).

2. **Whisper rate source + value for the measure-only window.**
   - What we know: Rate must be configurable eventually (`billing_config`, Phase 111). For THIS phase a module const is acceptable (SEED-035 + phase description both say so). OpenAI `whisper-1` list price is ~$0.006/min (verify current).
   - What's unclear: Exact current OpenAI rate, and whether the Gemini transcription-fallback cost should be computed (Gemini audio pricing differs) or recorded as null.
   - Recommendation: Module const `WHISPER_USD_PER_MINUTE` (env-overridable mirroring the `MAX_RESEARCH_ITEMS_PER_ESTIMATE` pattern from Phase 109). Record the OpenAI path with the computed cost; record the Gemini fallback path with `provider:'gemini', realCostUsd:null` (don't guess Gemini audio pricing during measure-only — calibration will see the gap). Confirm the OpenAI rate at plan time.

3. **Should this phase ALSO start recording `audio_transcribed` usage_events?**
   - What we know: `audio_minutes`/`audio_transcribed` is defined in `quota.ts` but never recorded; transcription records no usage_event today.
   - What's unclear: Whether COST-03's "correlate to usage_events" requires the audio usage_event to exist.
   - Recommendation: NO — cost correlation is via `attempt_id`, which transcription already has. Starting to record audio usage_events is a metering decision for Phase 112 (CREDIT-02). Keep this phase scoped to cost capture; flag the gap but don't fix it here (avoid scope creep).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| OpenRouter API (`usage.cost` field) | COST-01 | ✓ (live, used in prod today) | Current HTTP API | — (the field is additive; absent → record null) |
| OpenAI Whisper (`whisper-1`) | COST-02 | ✓ (used in prod today) | `whisper-1` | Gemini transcription (already wired; cost recorded null) |
| Supabase service-role client | COST-03 persistence | ✓ | `requireServiceClient()` exists | — |
| `recordings.duration_seconds` column | COST-02 minutes | ✓ (existing schema, written by `createRecording`) | — | — |
| `attempt_id` correlation (Phase 92) | COST-03 | ✓ (threaded through all AI jobs) | — | server-side `randomUUID()` fallback already in place |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** OpenRouter `usage.cost` absent on a given response → record `real_cost_usd = null` (don't block); Gemini transcription/vision fallback → record `provider:'gemini', real_cost_usd:null`.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (project standard — `npx vitest run`; current suite ~275 files / ~1932 tests) |
| Config file | `vitest.config.*` (existing; project runs `npx vitest run`) |
| Quick run command | `npx vitest run tests/unit/billing tests/unit/observability` (scope to new + adjacent) |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| COST-01 | OpenRouter response `usage.cost` parsed → recordAICost called with that USD value; absent → null (not 0) | unit | `npx vitest run tests/unit/ai/openrouter-cost.test.ts` | ❌ Wave 0 |
| COST-02 | Whisper cost = minutes × rate; 0 duration → null; Gemini fallback → null | unit | `npx vitest run tests/unit/billing/whisper-cost.test.ts` | ❌ Wave 0 |
| COST-03 | recordAICost inserts an `ai_cost_events` row keyed by attempt_id + operation_type; never throws on DB failure (swallow + warn) | unit | `npx vitest run tests/unit/billing/record-ai-cost.test.ts` | ❌ Wave 0 |
| COST-03 | Migration static contract: table exists, append-only, RLS enabled, ZERO client policies, super-admin SELECT, CHECK enums, indexes on attempt_id/operation_type | unit (readFileSync regex, per project pattern) | `npx vitest run tests/unit/billing/ai-cost-events-migration.test.ts` | ❌ Wave 0 |
| CALIB-01 | Measure-only: no credit/debit/balance/gating code in the new paths (grep assertion); recordAICost has no return value consumed for charging | unit | `npx vitest run tests/unit/billing/measure-only-invariant.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/billing tests/unit/observability tests/unit/ai/openrouter-cost.test.ts`
- **Per wave merge:** `npx vitest run` (full suite — guard the ~1932-test baseline; expect +N new, 0 regressions)
- **Phase gate:** Full suite green + `tsc --noEmit` clean on changed files before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/billing/record-ai-cost.test.ts` — covers COST-03 (never-throw insert, snake_case map, null handling)
- [ ] `tests/unit/billing/whisper-cost.test.ts` — covers COST-02 (minutes×rate, 0→null, fallback→null)
- [ ] `tests/unit/ai/openrouter-cost.test.ts` — covers COST-01 (usage.cost parsed, absent→null, no request-body flag)
- [ ] `tests/unit/billing/ai-cost-events-migration.test.ts` — covers COST-03 migration static contract (mirror `pipeline-events-migration.test.ts`)
- [ ] `tests/unit/billing/measure-only-invariant.test.ts` — covers CALIB-01 (no charging code present)
- [ ] Framework install: none — Vitest already present.

## Sources

### Primary (HIGH confidence)
- OpenRouter Usage Accounting docs — https://openrouter.ai/docs/cookbook/administration/usage-accounting — confirmed: `usage.cost` (USD) + `usage.cost_details.upstream_inference_cost` returned automatically; `usage: { include: true }` and `stream_options: { include_usage: true }` are **deprecated and have no effect**; usage in the final SSE chunk for streaming.
- OpenRouter FAQ / Pricing — https://openrouter.ai/docs/faq , https://openrouter.ai/pricing — confirmed: OpenRouter credits are denominated in US dollars (base currency USD), so `usage.cost` is a direct USD value; the 5.5% / $0.80-min fee is a credit-purchase surcharge (top-up), NOT a per-request cost.
- Codebase (read directly): `lib/ai/providers/openrouter.ts`, `lib/ai/openrouter-client.ts`, `lib/ai/provider-with-fallback.ts`, `lib/quota.ts`, `lib/observability/pipeline-events.ts`, `lib/inngest/functions/{transcribe-audio,generate-estimate,analyze-photos}.ts`, `lib/actions/recording.ts`, `lib/platform-config.ts`, `supabase/migrations/20260529000001_phase92_pipeline_events.sql`, `supabase/migrations/20260513000002_phase56_usage_idempotency.sql` — establish the four OpenRouter call sites, the no-cost Whisper path, the existing `attempt_id` lineage, the `recordings.duration_seconds` source, the never-throw `recordPipelineEvent` pattern, and the service-role/deny-all RLS posture to mirror.

### Secondary (MEDIUM confidence)
- OpenRouter API Reference overview — https://openrouter.ai/docs/api/reference/overview — `GET /api/v1/generation` exists and exposes generation stats incl. cost; treated as the (unrecommended) async alternative.
- OpenAI Whisper pricing (~$0.006/min for `whisper-1`) — verify the exact current rate at plan time; rate is a config input, not a correctness contract for measure-only.

### Tertiary (LOW confidence)
- General OpenRouter pricing-guide blogs (costgoat / betonai / truefoundry, 2026) — cross-referenced only to confirm USD denomination; not authoritative for API field shapes.

## Metadata

**Confidence breakdown:**
- OpenRouter cost mechanism (COST-01): HIGH — verified against current official usage-accounting docs; the deprecation of the `include` flag is the one fact most likely to be stale in training data and it was explicitly confirmed.
- Whisper computed cost (COST-02): HIGH — provider returns no cost (read from code), duration source exists, only the rate value needs plan-time confirmation.
- Persistence + correlation (COST-03): HIGH — reuses the proven `pipeline_events` table pattern and the existing `attempt_id` lineage read directly from the codebase.
- Measure-only invariant (CALIB-01): HIGH — purely additive; no ledger exists until Phase 112.
- Adapter wiring seam (Open Question 1): MEDIUM — the exact threading of `attemptId`/`companyId` into the estimate adapter needs the planner to read `lib/estimate/graph.ts` + the generate node; the recommended approach (optional `costContext` on `EstimateInput`) is sound but the precise call chain should be confirmed at plan time.

**Research date:** 2026-06-24
**Valid until:** 2026-07-24 for the codebase facts (stable); ~2026-07-08 for the OpenRouter API field shapes (fast-moving vendor — re-verify `usage.cost` if planning slips materially).
