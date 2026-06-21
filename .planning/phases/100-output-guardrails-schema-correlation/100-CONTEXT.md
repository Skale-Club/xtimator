# Phase 100: Output Guardrails — Schema Validation, Price Anchoring, Totals Authority, Correlation ID - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning
**Mode:** Smart discuss (autonomous — grey-area decisions at Claude's discretion, grounded in the live code map; no UI surface)

<domain>
## Phase Boundary

Make the estimate engine's AI output trustworthy and traceable: nothing malformed, hallucinated, or mis-totaled is ever persisted, and any single generation run is traceable end-to-end across pipeline_events, Langfuse, and Sentry. Guardrails land on the GENERATE path now so the refactored refine path (Phase 101) inherits them automatically. Scope = GUARD-01..04 only. Builds on Phase 99's typed `FailureReason` (the `'invalid_output'` reason was declared there; this phase produces it).

**Requirements:** GUARD-01 (zod validation + bounded retry), GUARD-02 (price-anchoring guardrails), GUARD-03 (server-side totals authority + discrepancy signal), GUARD-04 (one correlation ID across pipeline_events ↔ Langfuse ↔ Sentry).
</domain>

<decisions>
## Implementation Decisions

### GUARD-01 — zod schema validation + bounded retry
- **Define a zod schema for `EstimateOutput`** (mirror `lib/ai/types.ts`: sections[].items[] with `description: string`, `quantity: number >= 0`, `unit?: string`, `unit_price: number >= 0`, `price_source: 'price_book' | 'ai_estimate'`; top-level `suggested_project_name`, `summary`, optional `notes/timeline/payment_terms/warranty_terms`, `suggested_client_name?`). Place it near `lib/ai/types.ts` (e.g. `lib/ai/schema.ts`) and keep `EstimateOutput` the inferred type so types stay single-sourced.
- **Replace the unsafe casts in `lib/ai/normalize.ts`** (`item.description as string`, `item.quantity as number`, etc.) with `schema.safeParse(raw)`. On success, return the parsed+normalized output (keep the existing D-15 `price_source` defensive coercion and client-name trim as a zod transform or post-parse step).
- **Bounded retry lives at the provider/generate-node boundary, not in normalize**: when parsing fails, retry the AI call EXACTLY ONCE (re-prompt; optionally append a terse "return valid JSON matching the schema" hint). If the second attempt also fails validation → return `{ failure: { reason: 'invalid_output' } }` (Phase 99's typed reason) — never persist garbage, never 500. Retry cap = 1 (consistent with the auto-refine cap philosophy; no retry storm).
- The OpenRouter tool-call already forces a JSON shape via `estimateToolSchema`; zod is the SECOND, authoritative gate (the tool schema is advisory, models still drift). Both layers stay.

### GUARD-02 — price-anchoring guardrails (server-side enforcement)
- Today the price book is only injected into the prompt and the model self-tags `price_source`; there is NO server-side enforcement. Add it in the post-AI processing in `lib/services/generate-estimate.ts` (the loop that builds `calculatedSections`, ~lines 249-256).
- **Anchor:** for each line item, attempt a match against the company price book (`priceBookItems`, already loaded at ~line 102) by normalized name (reuse the existing name-normalization approach used for client auto-link; case/space/punct-insensitive). On a confident match, OVERRIDE `unit_price` with the price-book `unit_price` and set `price_source = 'price_book'` — the price book is authoritative over the AI number.
- **Bounds:** for `ai_estimate` items, clamp/flag unit prices that are non-finite, negative, or absurd (e.g. <= 0 or beyond a documented sane ceiling). Clamp to a safe value OR drop with a recorded flag — pick clamp-and-flag so the estimate still renders. Document the exact rule in the plan.
- Record an anchoring/clamp signal (count of anchored items, count of clamped items) for observability (feeds GUARD-04 / pipeline-events metadata). Non-fatal — anchoring failures never break generation.

### GUARD-03 — server-side totals authority + discrepancy signal
- The server ALREADY recalculates authoritatively (`generate-estimate.ts` ~249-310: per-item `total = round(qty*unit_price)`, section subtotal, `subtotal`, `taxAmount = subtotal*taxRate`, `grandTotal`). FORMALIZE this as the single source of truth and add sanity assertions:
  - Every persisted `total`/`subtotal`/`grandTotal` is finite and >= 0; reject/zero-out NaN.
  - Section subtotal == sum(item totals); grandTotal == subtotal + taxAmount (within rounding epsilon).
- **Discrepancy signal:** the AI tool schema returns NO explicit total today (totals are purely server-derived), so "assert against the AI-proposed total" = compare the server grandTotal against the naive sum the AI's own numbers imply BEFORE anchoring/clamping, and record a `totals_discrepancy` metric (delta + whether anchoring/clamping moved it). The AI's own total is never persisted as authoritative — only the server number is. If a future schema field carries an AI total, compare against it.
- All checks are server-side and never trust the model's arithmetic.

### GUARD-04 — one correlation ID across pipeline_events ↔ Langfuse ↔ Sentry
- **Reuse the existing `attemptId`/`requestId` lineage** (Phase 91/92) as the correlation ID rather than minting a new concept — it already threads route → Inngest payload → pipeline_events. Promote it to THE correlation id.
- Thread that id into: (a) `recordPipelineEvent()` metadata (already carries attemptId — ensure it's consistently the same id on every step of a run), (b) the Langfuse trace (set trace id / metadata `correlationId` on the generate trace in the Inngest job — coordinate with the pending Phase 97 Langfuse-v5 work; the `observability.test.ts` OBS-03 stub expects `langfuseSessionId`/`langfuseUserId` references in `generate-estimate.ts`), and (c) the Sentry scope (tag `correlation_id`) wherever estimate errors are captured (`asResponse` already tags error.code; add the correlation id when available).
- Goal: given one id, you can pull the pipeline_events timeline, the Langfuse trace, and any Sentry event for that exact run. Keep all of it best-effort/never-throw (the Phase 92 rule — observability must never regress reliability).

### Invariants to preserve (regression-gated)
- never-throw / always-finalize: validation failure → `{ failure }`, never a throw out of a node.
- Server totals remain authoritative (no regression to existing recalculation math).
- Multi-tenant `companyId` stays closure/param; price-book queried by companyId only.
- Happy path AI call count unchanged when output is valid first time (retry only fires on invalid output).
- Do NOT route refine through the graph yet (Phase 101) — but DO put the zod schema + guardrails where refine will inherit them (the shared normalize/generate path), so Phase 101 gets them for free.
</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lib/ai/normalize.ts` — `normalizeOutput(raw)`; the unsafe-cast site to replace with zod.
- `lib/ai/types.ts` — `EstimateOutput`, `LineItemOutput`, `PriceBookEntry` (zod schema target).
- `lib/ai/providers/openrouter.ts` — `callTool` already parses tool-call JSON + throws on malformed; the retry boundary wraps `generateEstimate`/`refineEstimate`.
- `lib/services/generate-estimate.ts` — post-AI processing: price-book load (~102), totals recalculation (~249-310), persistence (~289), version bump (~284). Anchoring + totals-authority land here.
- `lib/estimate/graph/nodes/generate.ts` — wraps the service; the `invalid_output` failure surfaces here.
- `lib/estimate/failure.ts` (Phase 99) — `FailureReason` includes `'invalid_output'`; reuse it.
- `lib/observability/pipeline-events.ts` — `recordPipelineEvent()` (best-effort) carries attemptId/metadata.
- `lib/observability/langfuse.ts` — langfuse client; trace tagging point (Phase 97 v5 migration is adjacent).
- `lib/errors/index.ts` — `asResponse` already sets Sentry tags; add correlation id.
- Existing name-normalization for client auto-link in `generate-estimate.ts` — reuse for price-book matching.

### Established Patterns
- Best-effort observability that never throws (Phase 92) — GUARD-04 bookkeeping must follow it.
- attemptId/requestId payload-only lineage (Phase 91) — the correlation-id backbone.
- Server-derived totals already authoritative — GUARD-03 formalizes, does not rebuild.

### Integration Points
- generate path: `nodes/generate.ts` → `generateEstimateForProject` (service) → `provider.generateEstimate` → `normalizeOutput`.
- Inngest `generate-estimate.ts` job: where the Langfuse trace + pipeline-events for a run are emitted (correlation id seam).
</code_context>

<specifics>
## Specific Ideas

- Single-source the schema: define zod first, `export type EstimateOutput = z.infer<typeof estimateOutputSchema>` so `lib/ai/types.ts` and the validator never drift.
- The bounded-retry contract should be expressed so Phase 101's refine inherits it unchanged (put it on the shared generate/normalize boundary, not in a channel).
- Correlation id = the existing attemptId promoted, NOT a new minted concept — minimizes churn and aligns with Phase 91/92 lineage.
- GUARD-04 should make the OBS-03 observability stub (`langfuseSessionId`/`langfuseUserId` in generate-estimate.ts) go green if cheap, closing a pre-existing RED test.
</specifics>

<deferred>
## Deferred Ideas

- Routing refine through the graph/Inngest + unified ingestion (HARD-01/02, UNIFY-01..03) — Phase 101. This phase only ensures refine will INHERIT the guardrails by placing them on the shared path.
- WhatsApp batch isolation, auto-refine cap, replay-safe TTL (HARD-05..07) — Phase 102.
- The eval harness that exercises these guardrails against golden fixtures (EVAL-01..04) — Phase 103.
- User-facing "why was this flagged" explanations (GUARD-05) — deferred per REQUIREMENTS.
- LLM-as-judge qualitative scoring — deferred (EVAL-05).
</deferred>
