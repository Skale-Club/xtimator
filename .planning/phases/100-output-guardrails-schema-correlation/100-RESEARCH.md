# Phase 100: Output Guardrails — Schema Validation, Price Anchoring, Totals Authority, Correlation ID - Research

**Researched:** 2026-06-21
**Domain:** Brownfield hardening of the AI estimate engine (zod validation, server-side price/totals authority, end-to-end observability correlation)
**Confidence:** HIGH

## Summary

CONTEXT.md already settles the design; this research de-risks the implementation by confirming exact signatures, the totals math, the price-book match seam, the installed Langfuse version/API, and the correlation-id seam against the live code. Every critical unknown is now resolved against the actual source tree (not training-data assumptions).

The four unknowns resolve cleanly: (1) **Langfuse v5 already landed** — `@langfuse/{tracing,otel,langchain}@5.5.3` are installed and `lib/observability/langfuse.ts` is the v5 OTel shim; the PROJECT.md "Phase 97 pending" note is stale. (2) **zod v4** (`zod@^4.3.6`) is present and already used by `lib/errors` (`ZodError`); there is no project schema convention yet, so this phase establishes one. (3) The totals math in `generate-estimate.ts:248-269` is a clean, enumerable per-item→section→subtotal→tax→grand chain that GUARD-03 formalizes (the AI tool schema returns **no** total field — "AI-proposed total" = the naive sum the AI's own `qty*unit_price` numbers imply *before* anchoring/clamping). (4) The bounded-retry belongs at the **provider boundary inside `OpenRouterAdapter`** (or a thin wrapper the adapter calls) so both `generateEstimate` and `refineEstimate` — which already share `callTool`+`normalizeOutput` — inherit it for free, exactly as Phase 101's refine needs.

**Primary recommendation:** Define `estimateOutputSchema` in a new `lib/ai/schema.ts` with `EstimateOutput = z.infer<...>` (single-source the type); make `normalizeOutput` do `safeParse` + the existing D-15 coercion as a post-parse transform; add a single `parseOrRetryOnce` seam at the `callTool` boundary so generate+refine inherit it; enforce price-book anchoring + clamp in `generate-estimate.ts` right where `calculatedSections` is built (~249); formalize the existing totals math with finite/≥0 sanity assertions and a `totals_discrepancy` metric; and promote the existing `attemptId` to THE correlation id, threading it into `recordPipelineEvent` metadata, the Langfuse trace (via `graph.invoke` config `metadata.langfuseSessionId/langfuseUserId` + optional deterministic `createTraceId(attemptId)`), and the Sentry scope in `asResponse`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**GUARD-01 — zod schema validation + bounded retry**
- Define a zod schema for `EstimateOutput` (mirror `lib/ai/types.ts`: sections[].items[] with `description: string`, `quantity: number >= 0`, `unit?: string`, `unit_price: number >= 0`, `price_source: 'price_book' | 'ai_estimate'`; top-level `suggested_project_name`, `summary`, optional `notes/timeline/payment_terms/warranty_terms`, `suggested_client_name?`). Place it near `lib/ai/types.ts` (e.g. `lib/ai/schema.ts`) and keep `EstimateOutput` the inferred type so types stay single-sourced.
- Replace the unsafe casts in `lib/ai/normalize.ts` with `schema.safeParse(raw)`. On success return parsed+normalized output (keep the existing D-15 `price_source` defensive coercion and client-name trim as a zod transform or post-parse step).
- Bounded retry lives at the provider/generate-node boundary, NOT in normalize: when parsing fails, retry the AI call EXACTLY ONCE (re-prompt; optionally append a terse "return valid JSON matching the schema" hint). If the second attempt also fails validation → return `{ failure: { reason: 'invalid_output' } }` — never persist garbage, never 500. Retry cap = 1 (no retry storm).
- The OpenRouter tool-call already forces a JSON shape via `estimateToolSchema`; zod is the SECOND, authoritative gate (the tool schema is advisory, models still drift). Both layers stay.

**GUARD-02 — price-anchoring guardrails (server-side enforcement)**
- Add server-side enforcement in the post-AI processing in `lib/services/generate-estimate.ts` (the loop that builds `calculatedSections`, ~lines 249-256).
- **Anchor:** for each line item, attempt a match against the company price book (`priceBookItems`, loaded at ~line 102) by normalized name (reuse the existing name-normalization approach used for client auto-link; case/space/punct-insensitive). On a confident match, OVERRIDE `unit_price` with the price-book `unit_price` and set `price_source = 'price_book'` — the price book is authoritative over the AI number.
- **Bounds:** for `ai_estimate` items, clamp/flag unit prices that are non-finite, negative, or absurd (<= 0 or beyond a documented sane ceiling). Pick clamp-and-flag so the estimate still renders. Document the exact rule in the plan.
- Record an anchoring/clamp signal (count anchored, count clamped) for observability. Non-fatal — anchoring failures never break generation.

**GUARD-03 — server-side totals authority + discrepancy signal**
- The server ALREADY recalculates authoritatively (`generate-estimate.ts` ~249-310). FORMALIZE as single source of truth and add sanity assertions: every persisted `total`/`subtotal`/`grandTotal` is finite and >= 0 (reject/zero-out NaN); section subtotal == sum(item totals); grandTotal == subtotal + taxAmount (within rounding epsilon).
- **Discrepancy signal:** the AI tool schema returns NO explicit total, so "assert against the AI-proposed total" = compare the server grandTotal against the naive sum the AI's own numbers imply BEFORE anchoring/clamping, and record a `totals_discrepancy` metric (delta + whether anchoring/clamping moved it). The AI's own total is never persisted as authoritative — only the server number is.
- All checks are server-side and never trust the model's arithmetic.

**GUARD-04 — one correlation ID across pipeline_events ↔ Langfuse ↔ Sentry**
- Reuse the existing `attemptId`/`requestId` lineage (Phase 91/92) as the correlation ID rather than minting a new concept — it already threads route → Inngest payload → pipeline_events. Promote it to THE correlation id.
- Thread it into: (a) `recordPipelineEvent()` metadata (already carries attemptId — ensure it's consistently the same id on every step), (b) the Langfuse trace (set trace id / metadata `correlationId` on the generate trace in the Inngest job — the `observability.test.ts` OBS-03 stub expects `langfuseSessionId`/`langfuseUserId` references in `generate-estimate.ts`), (c) the Sentry scope (tag `correlation_id`) wherever estimate errors are captured.
- Goal: given one id, pull the pipeline_events timeline, the Langfuse trace, and any Sentry event for that exact run. Keep all of it best-effort/never-throw.

**Invariants to preserve (regression-gated)**
- never-throw / always-finalize: validation failure → `{ failure }`, never a throw out of a node.
- Server totals remain authoritative (no regression to existing recalculation math).
- Multi-tenant `companyId` stays closure/param; price-book queried by companyId only.
- Happy path AI call count unchanged when output is valid first time (retry only fires on invalid output).
- Do NOT route refine through the graph yet (Phase 101) — but DO put the zod schema + guardrails where refine will inherit them.

### Claude's Discretion
- Smart-discuss mode: grey-area decisions at Claude's discretion, grounded in the live code map; no UI surface.
- Single-source the schema: define zod first, `export type EstimateOutput = z.infer<typeof estimateOutputSchema>`.
- The exact "sane ceiling" for unit-price clamping (document a concrete number in the plan).
- Whether to make the OBS-03 observability stub go green (cheap close of a pre-existing RED).
- Exact match-confidence rule for price-book anchoring (exact-normalized vs. fuzzy).

### Deferred Ideas (OUT OF SCOPE)
- Routing refine through the graph/Inngest + unified ingestion (HARD-01/02, UNIFY-01..03) — Phase 101.
- WhatsApp batch isolation, configurable auto-refine cap, replay-safe TTL (HARD-05..07) — Phase 102.
- The eval harness against golden fixtures (EVAL-01..04) — Phase 103.
- User-facing "why was this flagged" explanations (GUARD-05) — deferred.
- LLM-as-judge qualitative scoring (EVAL-05) — deferred.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GUARD-01 | AI estimate output (generate & refine) validated against a zod schema before persistence; invalid output triggers a structured bounded retry instead of persisting garbage or 500ing. | zod v4 confirmed installed (`zod@^4.3.6`, used by `lib/errors`). `estimateOutputSchema` shape + `safeParse` replacement for `normalize.ts` casts given below. Retry seam at `callTool` boundary (shared by generate+refine). `'invalid_output'` `FailureReason` already declared in `lib/estimate/failure.ts:33`, consumed at `nodes/generate.ts`. |
| GUARD-02 | Price-hallucination guardrails — matched item → anchored price; out-of-bounds unit prices flagged/clamped per documented rules. | Reuse `normalizeClientNameForMatch` (`generate-estimate.ts:53-59`, quoted below) for the price-book match. `priceBookItems` already loaded at `:102`, currency-filtered. Anchoring + clamp rules with concrete bounds given below; insertion point = `calculatedSections` build at `:251`. |
| GUARD-03 | Server-side totals recalculation is authoritative and asserted against the AI-proposed total with a recorded discrepancy signal. | Existing math at `generate-estimate.ts:248-269` enumerated below. AI schema has NO total field — "AI-proposed total" defined as the naive pre-anchor sum. `totals_discrepancy` metric defined. |
| GUARD-04 | One correlation ID links `pipeline_events`, the Langfuse trace, and any Sentry event end-to-end. | `attemptId` lineage confirmed: route → `EstimateGeneratePayload.attemptId` (`events.ts:46`) → Inngest fn (`:86`) → every `recordPipelineEvent` call. Langfuse v5 trace-attr API (`graph.invoke` config `metadata.langfuseSessionId/Id`, `createTraceId`) confirmed. Sentry seam in `asResponse` (`lib/errors/index.ts:88-96`). Closes the OBS-03 stub. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **GSD workflow enforcement:** all file edits go through a GSD command (already satisfied — this is plan-phase).
- **Secret handling (CRITICAL):** never commit secrets/keys in code, comments, or `.planning/` docs. Langfuse keys live in env only (`instrumentation.ts:60-62` reads `process.env`). This phase touches observability — do NOT introduce any key literal.
- **Tech stack:** Next.js (App Router), TypeScript strict, zod already adopted. Server-side only for all AI/observability work (`server-only` import present in `langfuse.ts:27`).
- **Multi-tenant:** all DB access is `companyId`-scoped via service-role client (`requireServiceClient()`); price-book is already loaded by `companyId` (`getPriceBookItems(supabase, companyId)`).

## Standard Stack

### Core (all already installed — verified against package.json)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `zod` | `^4.3.6` | Output schema validation (GUARD-01) | Already the project's validation lib; `ZodError` consumed by `asResponse`. No new dep. |
| `@langfuse/tracing` | `^5.5.3` | Trace/observation API (GUARD-04) | v5 OTel SDK already installed and shimmed in `lib/observability/langfuse.ts`. |
| `@langfuse/langchain` | `^5.5.3` | `CallbackHandler` attached at `graph.invoke` (GUARD-04 trace) | Already used in `lib/inngest/functions/generate-estimate.ts:23,115`. |
| `@langfuse/otel` | `^5.5.3` | `LangfuseSpanProcessor` (`instrumentation.ts`) | Span export; `forceFlush` already wired. |
| `@sentry/nextjs` | `^10.56.0` | Sentry scope/tagging (GUARD-04) | Already used in `asResponse` (`lib/errors/index.ts`). |

**No new packages required.** This is a pure brownfield hardening phase. `npm install` is NOT needed.

**Version verification (resolved against installed tree, not training data):**
- `zod@^4.3.6` — **zod v4**, not v3. Note: v4 changed some error APIs (`z.treeifyError`, `err.issues` still present; `error.format()` deprecated in favor of `z.treeifyError`). For this phase we use `safeParse` (stable across v3/v4) so the version delta is low-risk. `ZodError.issues` (used by `asResponse` at `lib/errors/index.ts:110`) is still valid in v4.
- `@langfuse/*@5.5.3` — **v5 (OTel-based)**. The v3 `new Langfuse().trace()/.generation()` client is gone; the shim in `lib/observability/langfuse.ts` recreates only the `.generation()/.end()/.flushAsync()` surface via `startObservation`. PROJECT.md's "Phase 97 pending" is STALE — the migration landed (commit `4365cbe fix(observability): complete Langfuse v5 migration so the production build passes`).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| zod `safeParse` in normalize | A separate validator module | Rejected — CONTEXT locks the schema next to types and `normalizeOutput` as the parse site. |
| New minted correlation UUID | Reuse `attemptId` | CONTEXT locks reuse of `attemptId` (Phase 91/92 lineage) — minimal churn, already threaded. |
| Fuzzy/Levenshtein price-book match | Exact-normalized match (reuse client matcher) | CONTEXT directs reuse of the existing exact-normalized matcher; fuzzy is out of scope (and a false-positive anchoring risk). Recommend exact-normalized for v1. |

## Architecture Patterns

### Recommended file layout (additive)
```
lib/ai/
├── types.ts          # CHANGE: re-export EstimateOutput from schema.ts (or keep as alias)
├── schema.ts         # NEW: estimateOutputSchema (zod), EstimateOutput = z.infer<...>
├── normalize.ts      # CHANGE: safeParse + D-15 coercion as post-parse transform
├── providers/
│   └── openrouter.ts # CHANGE: parseOrRetryOnce wraps callTool → normalize (generate + refine)
└── price-anchoring.ts # NEW (optional): pure anchorAndClamp(items, priceBook) helper + metrics
lib/services/
└── generate-estimate.ts # CHANGE: call anchorAndClamp before calculatedSections; totals assertions; discrepancy metric
lib/estimate/graph/nodes/
└── generate.ts       # CHANGE: map invalid_output failure (catch the typed signal)
lib/inngest/functions/
└── generate-estimate.ts # CHANGE: thread attemptId as correlation id into Langfuse trace metadata
```

### Pattern 1: zod schema as the single source of truth
**What:** Define the zod schema first; infer the TS type from it.
**When to use:** GUARD-01 schema.
**Recommended shape (`lib/ai/schema.ts`):**
```typescript
// Source: mirrors lib/ai/types.ts EstimateOutput + estimateToolSchema (openrouter.ts:20)
import { z } from 'zod'

const lineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().finite().nonnegative(),       // CONTEXT: >= 0
  unit: z.string().optional(),
  unit_price: z.number().finite().nonnegative(),      // CONTEXT: >= 0
  // D-15 defensive coercion: anything other than exact 'price_book' → 'ai_estimate'.
  // Express as a preprocess so a missing/garbage value never rejects the whole parse.
  price_source: z.preprocess(
    (v) => (v === 'price_book' ? 'price_book' : 'ai_estimate'),
    z.enum(['price_book', 'ai_estimate'])
  ),
})

const sectionSchema = z.object({
  title: z.string(),
  items: z.array(lineItemSchema),
})

export const estimateOutputSchema = z.object({
  suggested_project_name: z.string(),
  // existing normalize trims + nulls empty; mirror with transform:
  suggested_client_name: z
    .string()
    .optional()
    .nullable()
    .transform((v) => (typeof v === 'string' && v.trim().length > 0 ? v.trim() : null)),
  summary: z.string(),
  notes: z.string().optional(),
  timeline: z.string().optional(),
  payment_terms: z.string().optional(),
  warranty_terms: z.string().optional(),
  sections: z.array(sectionSchema),
})

export type EstimateOutput = z.infer<typeof estimateOutputSchema>
```
**Note on `unit_price >= 0` vs. clamp:** the schema rejects negative `unit_price` (GUARD-01 contract: invalid → retry). GUARD-02's clamp handles the *in-bounds-but-absurd* case (e.g. `0` or `> ceiling`) for `ai_estimate` items that pass schema but should be flagged. Keep these two layers distinct: schema = structural validity; clamp = business-plausibility. Decide in the plan whether `quantity`/`unit_price` of `0` should reject (schema) or clamp (GUARD-02) — recommendation: allow `>= 0` in schema (a `0` line is structurally valid) and let GUARD-02 flag-and-keep zero/absurd `ai_estimate` prices.

**`lib/ai/types.ts` reconciliation:** to keep the type single-sourced, re-export from schema:
```typescript
// lib/ai/types.ts
export type { EstimateOutput } from './schema'
// keep PriceBookEntry, LineItemOutput, EstimateInput, RefineEstimateInput here
```
`LineItemOutput`/`EstimateSectionOutput` can also be inferred from the sub-schemas if desired, but the minimal change is to re-export only `EstimateOutput` (which is what `normalize.ts` and all consumers import).

### Pattern 2: `normalizeOutput` becomes a `safeParse` site (current → target)
**Current** (`lib/ai/normalize.ts:4-33`) — unsafe casts:
```typescript
description: item.description as string,
quantity: item.quantity as number,
unit_price: item.unit_price as number,
```
**Target** — return a discriminated result so the caller can trigger the bounded retry without `normalize` throwing:
```typescript
// lib/ai/normalize.ts
import { estimateOutputSchema, type EstimateOutput } from './schema'

export type NormalizeResult =
  | { ok: true; value: EstimateOutput }
  | { ok: false; error: import('zod').ZodError }

export function normalizeOutput(raw: Record<string, unknown>): NormalizeResult {
  const parsed = estimateOutputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, error: parsed.error }
  // D-15 coercion + client-name trim now live IN the schema (preprocess/transform),
  // so parsed.data is already normalized.
  return { ok: true, value: parsed.data }
}
```
> Two callers exist: `openrouter.ts:95` (generate) and `openrouter.ts:128` (refine). Both must switch from `return normalizeOutput(raw)` to handling `NormalizeResult`. Putting the retry at `callTool` (Pattern 3) keeps both call sites identical and centralizes the change. **Tests `tests/unit/ai/price-source-tagging.test.ts` call `normalizeOutput(...)` and assert on `result.sections[0]...`** — changing the return shape to `{ ok, value }` BREAKS those 3 tests. Plan must update them (assert `result.value.sections[0]...`) — this is a known Wave-0/regression touch.

### Pattern 3: bounded-retry at the `callTool` boundary (one place generate + refine inherit)
**Insertion point: inside `OpenRouterAdapter`, wrapping the `callTool → normalizeOutput` sequence — NOT in `normalize`, NOT in the graph node.** Both `generateEstimate` (`openrouter.ts:89-96`) and `refineEstimate` (`:98-129`) already funnel through `callTool` then `normalizeOutput`. Add a private method they both call:
```typescript
// lib/ai/providers/openrouter.ts (private method)
private async callToolValidated(args: {
  system: string; user: string; operationName?: string
}): Promise<EstimateOutput> {
  const raw = await this.callTool(args)
  const first = normalizeOutput(raw)
  if (first.ok) return first.value

  // Bounded retry: EXACTLY ONCE, with a terse schema-repair hint appended.
  const retryRaw = await this.callTool({
    ...args,
    user: `${args.user}\n\nIMPORTANT: your previous response failed validation. Return valid JSON matching the create_estimate schema exactly (all required fields, numbers as plain numbers >= 0).`,
  })
  const second = normalizeOutput(retryRaw)
  if (second.ok) return second.value

  // Second failure → typed, never-throw-friendly signal.
  throw new InvalidEstimateOutputError(second.error)  // see wiring below
}
```
Then `generateEstimate`/`refineEstimate` call `this.callToolValidated(...)` instead of `callTool` + `normalizeOutput`.

**Why here and not the graph node:** the graph node (`nodes/generate.ts`) only wraps the *service* (`generateEstimateForProject`), which calls `provider.generateEstimate`. Refine (Phase 101) will route through the SAME provider methods. Placing the retry inside the adapter means Phase 101's refine inherits it with zero extra work — exactly the CONTEXT directive "put it on the shared generate/normalize boundary, not in a channel." The `getAIProviderWithFallback` wrapper (`provider-with-fallback.ts`) wraps these adapter methods in `callWithFallback`, so the order is: **provider fallback (OpenRouter→Gemini, once) → inside the served provider, schema-retry (once)**. These are orthogonal and both bounded — no storm.

> **Gemini adapter parity:** `getAIProviderWithFallback` can serve via `GeminiAdapter` on fallback. The retry+validation must live where BOTH adapters' outputs are validated. Cleanest: validate in the shared wrapper rather than per-adapter. RECOMMENDATION for the plan: either (a) add `callToolValidated` to both `OpenRouterAdapter` and `GeminiAdapter` (duplicated thin wrapper), or (b) move the `normalizeOutput` + retry into `provider-with-fallback.ts` so it wraps `getAIProvider(...).generateEstimate` once regardless of which provider served. Option (b) is the single-seam choice and is preferred — confirm Gemini adapter's generate path returns the same raw shape. (Read `lib/ai/providers/gemini.ts` generate method during planning to choose.)

### Pattern 4: the `'invalid_output'` failure wiring (exact)
`FailureReason` already includes `'invalid_output'` (`lib/estimate/failure.ts:33`, maps to `internal`→500 at `:46`). The producer is this phase. Wiring:
```typescript
// new typed error the adapter throws on second validation failure
export class InvalidEstimateOutputError extends Error {
  readonly invalidOutput = true as const
  constructor(readonly zodError: import('zod').ZodError) {
    super('Estimate output failed schema validation after one retry')
    this.name = 'InvalidEstimateOutputError'
  }
}
```
In `nodes/generate.ts` the `catch` block already maps `ProvidersUnavailableError` → `provider_unavailable` else `generation_failed` (`:46-51`). Add ONE branch BEFORE the else, mirroring the existing brand-check pattern:
```typescript
const reason: FailureReason =
  err instanceof ProvidersUnavailableError ||
  (err as { providerUnavailable?: unknown } | null)?.providerUnavailable === true
    ? 'provider_unavailable'
    : err instanceof InvalidEstimateOutputError ||
      (err as { invalidOutput?: unknown } | null)?.invalidOutput === true
      ? 'invalid_output'
      : 'generation_failed'
return { failure: { reason } }
```
> Use the same `instanceof` + brand-check duo as Phase 99 — it survives module-instance boundaries (the documented reason for the brand on `ProvidersUnavailableError`). Node still never throws (ENGINE-04 preserved). `failureReasonToChannelCopy('invalid_output')` already returns user copy (`failure.ts:80`); `failureReasonToXtimatorError('invalid_output')` already maps to 500 (`:46`). No new failure plumbing needed — only the producer.

### Anti-Patterns to Avoid
- **Throwing out of `normalizeOutput`.** Return a discriminated result; let the adapter decide retry vs. typed-error. A throw from normalize would bubble as `generation_failed`, losing the `invalid_output` signal.
- **Retrying inside `callTool`.** `callTool` is also the Langfuse generation-trace site; retrying there would double-trace. Retry at the `callToolValidated` layer above it.
- **Persisting before validation.** The retry/typed-error happens at the provider call, strictly before `generate-estimate.ts` ever builds `calculatedSections` or inserts rows — garbage never reaches persistence.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Output structural validation | Hand-rolled type guards / `as` casts | `zod` `safeParse` | Already adopted; gives field-level `issues` and a single schema-as-type source. |
| Name normalization for price-book match | A new normalizer | `normalizeClientNameForMatch` (`generate-estimate.ts:53-59`) | CONTEXT directs reuse; identical case/punct/space rules already battle-tested for client auto-link. |
| Deterministic trace id from correlation id | Hashing attemptId yourself | `createTraceId(attemptId)` from `@langfuse/tracing` | v5 ships a deterministic seed→traceId helper; hand-hashing risks an invalid 32-hex traceId. |
| Sentry tagging | Manual breadcrumb plumbing | `Sentry.withScope`/`scope.setTag` already in `asResponse` | The scope block exists (`lib/errors/index.ts:88-96`); add one `setTag('correlation_id', ...)`. |
| Best-effort observability writes | New try/catch wrappers | `recordPipelineEvent` (already swallows) | D-06 best-effort contract already enforced (`pipeline-events.ts:70-73`). |

**Key insight:** Every primitive this phase needs already exists in the tree — the work is *wiring and enforcement*, not net-new infrastructure. The single genuinely new artifact is `estimateOutputSchema`.

## The price-book match approach (GUARD-02)

**Reuse this exact function** (`lib/services/generate-estimate.ts:53-59`):
```typescript
function normalizeClientNameForMatch(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
}
```
Rename/generalize to `normalizeNameForMatch` (or add a sibling `normalizeItemNameForMatch` with the same body) and apply it to BOTH the AI item `description` and each `priceBookItem.name`. The price book is already loaded and currency-filtered at `:102`:
```typescript
const priceBookItems = (await getPriceBookItems(supabase, companyId)).filter(
  (item) => normalizeCurrencyCode(item.currency_code) === currencyCode
)
```
**Match rule (recommended, exact-normalized — confirm in plan):** build a `Map<normalizedName, PriceBookEntry>` once (first-wins on collision), then for each AI item look up `map.get(normalizeNameForMatch(item.description))`. On a hit: override `unit_price` with the price-book `unit_price` and set `price_source = 'price_book'`. This mirrors the client-auto-link `.find(...)` exact-normalized comparison (`:198-201`) but uses a Map for O(1) per-item (price books can be large). Fuzzy matching is explicitly out of scope for v1 (false-positive anchoring risk).

### Anchoring + clamp rules (concrete bounds)
Apply in `generate-estimate.ts` immediately BEFORE the `calculatedSections` map (~`:251`), per item, in this order:
1. **Anchor:** if a price-book match exists → `unit_price = match.unit_price`, `price_source = 'price_book'`. (Increment `anchoredCount`.)
2. **Clamp (only `ai_estimate` items that did NOT anchor):**
   - if `!Number.isFinite(unit_price)` or `unit_price < 0` → these are already rejected by the zod schema (`finite().nonnegative()`), so by the time we're here they're `>= 0` and finite. The remaining business-plausibility checks:
   - if `unit_price > CEILING` → clamp to `CEILING`, set a flag. **Recommended `CEILING = 1_000_000`** (USD per-unit; document as the "sane per-unit ceiling" — no single line-item unit price in this domain legitimately exceeds $1M). (Increment `clampedCount`.)
   - `unit_price === 0`: KEEP (a zero-priced line is legitimate, e.g. "included") — flag-only if you want a signal, do not drop.
   - **`quantity`** is schema-guaranteed finite `>= 0`; optionally clamp an absurd `quantity > QTY_CEILING` (recommend `100_000`) the same way. Decide in plan.
3. Clamp/anchor are **non-fatal** — wrap any anchoring lookup in a guard so a malformed price-book row never throws generation (best-effort). Record `{ anchoredCount, clampedCount }` for GUARD-04 metadata.

> The clamp uses `Math.min(unit_price, CEILING)` — never silently drops the item (CONTEXT: clamp-and-flag so the estimate still renders).

## Totals recalculation enumerated (GUARD-03)

**Exact current math** (`lib/services/generate-estimate.ts:248-269`), authoritative and to be PRESERVED:
```
taxRate         = Number(company.default_tax_rate) || 0           // :249
per item:  total      = round2(quantity * unit_price)             // :254  round2 = Math.round(x*100)/100
per section: subtotal  = round2(sum(item.total))                  // :256-260
subtotal        = round2(sum(section.subtotal))                   // :264-267
taxAmount       = round2(subtotal * taxRate)                      // :268
grandTotal      = round2(subtotal + taxAmount)                    // :269
```
These five lines are the single source of truth and persist to `estimates.{subtotal,tax_amount,total}` (`:304-310`). **GUARD-03 formalizes — does not rebuild.** Add, after computing `grandTotal`, these sanity assertions (zero-out + flag rather than throw, to honor never-throw + always-render):
- Every `item.total`, `section.subtotal`, `subtotal`, `taxAmount`, `grandTotal` must satisfy `Number.isFinite(x) && x >= 0`. If any is `NaN`/negative (should be impossible post-schema, but defensive), coerce to `0` and record a `totals_sanity_violation` flag.
- **Section invariant:** `Math.abs(section.subtotal - round2(sum(item.total))) <= EPSILON` (EPSILON = `0.01`). Already true by construction; assert as a regression guard.
- **Grand invariant:** `Math.abs(grandTotal - round2(subtotal + taxAmount)) <= EPSILON`. Already true by construction; assert.

### Discrepancy metric (concrete definition)
The AI tool schema returns **NO total field** (confirmed — `estimateToolSchema`, `openrouter.ts:20-68`, has no `total`/`subtotal`/`grand_total` property; totals are purely server-derived). So "AI-proposed total" is defined as **the naive sum the AI's own numbers imply, computed BEFORE anchoring/clamping**:
```
aiProposedSubtotal = round2( sum over all items of (item.quantity * item.unit_price_AS_RETURNED_BY_AI) )
aiProposedGrand    = round2( aiProposedSubtotal * (1 + taxRate) )
```
Then, after anchoring/clamping and the server recalc:
```
totals_discrepancy = {
  ai_grand:        aiProposedGrand,
  server_grand:    grandTotal,
  delta:           round2(grandTotal - aiProposedGrand),
  delta_pct:       aiProposedGrand > 0 ? round2((grandTotal - aiProposedGrand) / aiProposedGrand * 100) : null,
  anchored_count:  anchoredCount,    // from GUARD-02
  clamped_count:   clampedCount,     // from GUARD-02
  moved_by_guardrails: anchoredCount > 0 || clampedCount > 0,
}
```
Capture the AI's original `unit_price` values BEFORE the anchor/clamp mutation (snapshot the pre-mutation items, or compute `aiProposedSubtotal` first). Record `totals_discrepancy` as best-effort observability (pipeline_events metadata and/or Langfuse trace metadata — NOT a persisted estimate column unless the plan adds one). The AI's numbers are NEVER persisted as authoritative — only the server `grandTotal` writes to `estimates.total`.

> **Definition of "AI-proposed total" is the load-bearing clarification here:** there is no AI total field, so the metric compares server-vs-AI-implied. If a future schema adds an explicit AI total, swap `aiProposedGrand` for it (CONTEXT note).

## The Langfuse version + trace API (GUARD-04) — RESOLVED

**Installed: Langfuse v5** (`@langfuse/tracing`, `@langfuse/otel`, `@langfuse/langchain` all `^5.5.3`). The v3 client is gone. `lib/observability/langfuse.ts` is the v5 OTel shim (`startObservation` under the hood). **PROJECT.md "Phase 97 pending" is stale** — the v5 migration landed (commit `4365cbe`).

### How the generate trace is created today
The generate path does NOT use the `langfuseClient` shim for the *graph* trace — it uses the **LangChain `CallbackHandler`** attached at `graph.invoke` inside the Inngest job (`lib/inngest/functions/generate-estimate.ts:115-133`):
```typescript
const handler = new CallbackHandler({
  sessionId: `${traceChannel}:${projectId}`,
  userId: companyId,
  tags: [traceChannel, 'estimate-engine'],
})
const invokeResult = await graph.invoke({ ... }, { callbacks: [handler] })
await langfuseProcessor?.forceFlush()
```
(The `langfuseClient.generation()` shim in `langfuse.ts` is used by the raw-fetch `callTool` site in `openrouter.ts:203-214` for the LLM generation span — separate from the trace.)

### v5 API to set the correlation id on the trace (confirmed via Langfuse docs)
Two compatible mechanisms (use one or both):
1. **Trace metadata/attributes via the runnable config** (the path the OBS-03 stub expects):
```typescript
const invokeResult = await graph.invoke(
  { ...state },
  {
    callbacks: [handler],
    metadata: {
      langfuseSessionId: `${traceChannel}:${projectId}`,
      langfuseUserId: companyId,
      correlationId: attemptId,   // ← the promoted correlation id (GUARD-04)
    },
    tags: [traceChannel, 'estimate-engine'],
  }
)
```
The Langfuse LangChain integration reads `metadata.langfuseSessionId` / `metadata.langfuseUserId` from the runnable config — these are the EXACT tokens the OBS-03 stub asserts (`tests/unit/estimate/observability.test.ts:75`: `expect(src).toMatch(/langfuseSessionId|langfuseUserId/)`). Moving `sessionId`/`userId` from the constructor to the `invoke` config metadata (or adding them in BOTH) **closes the pre-existing RED OBS-03 test** — a cheap, in-scope win per CONTEXT specifics.
2. **Deterministic trace id from the correlation id** (optional, stronger join key):
```typescript
import { createTraceId } from '@langfuse/tracing'
const langfuseTraceId = await createTraceId(attemptId)  // stable 32-hex from attemptId
```
`createTraceId(seed)` is the v5 helper that produces a valid deterministic OTel trace id from an external id. With the CallbackHandler path, a predefined id is passed via the runnable config `runId` (`graph.invoke(state, { callbacks, runId: predefinedRunId, metadata })`). **Recommendation:** start with the `metadata.correlationId = attemptId` approach (guaranteed to satisfy OBS-03 and give a searchable trace attribute); add `createTraceId(attemptId)` only if the plan wants the Langfuse trace id itself to equal the correlation hash (nice-to-have for direct URL construction). Keep it best-effort (wrap in try/catch — never break the job).

> **Caveat (verify in plan):** the exact metadata key the v5 `@langfuse/langchain` CallbackHandler honors (`langfuseSessionId` vs `sessionId` in config metadata) should be confirmed against the installed `@langfuse/langchain@5.5.3` at implementation time. Both the constructor form (already shipping) and the config-metadata form are documented; the OBS-03 test only requires the *token* `langfuseSessionId`/`langfuseUserId` to appear in the file, which the metadata form guarantees.

## The correlation-id seam (GUARD-04) — exact threading

`attemptId` is already the lineage backbone:
- Route mints/forwards it → `EstimateGeneratePayload.attemptId` (`lib/inngest/events.ts:46`).
- Inngest fn reads it with a server fallback: `const attemptId = data.attemptId ?? randomUUID()` (`generate-estimate.ts:86`).
- EVERY `recordPipelineEvent(...)` in the fn already passes `attemptId` (`:92, :157, :174`, and onFailure `:54`).

**GUARD-04 promotes this same `attemptId` to THE correlation id and threads it three ways:**

| Sink | Where | Change |
|------|-------|--------|
| `pipeline_events` | `recordPipelineEvent` calls in `generate-estimate.ts` (already carry `attemptId`) | Ensure the SAME `attemptId` is used on every step of a run (already true — minted once at `:86`). No new column needed; `attempt_id` IS the correlation column. Confirm the started/succeeded/failed/preview_redirect rows all share it. |
| Langfuse trace | `graph.invoke` config in `generate-estimate.ts:121-133` | Add `metadata.correlationId = attemptId` (+ `langfuseSessionId`/`langfuseUserId`); optionally `createTraceId(attemptId)`. Best-effort. |
| Sentry | `asResponse` (`lib/errors/index.ts:88-96`) where `internal`/`offline` errors are captured | Add `scope.setTag('correlation_id', <id>)`. **Seam problem:** `asResponse` does not currently receive `attemptId` — it only sees the `XtimatorError`. Plumb the correlation id onto `XtimatorError.meta` (e.g. `meta.correlationId`) at the point `failureReasonToXtimatorError` is called, then in `asResponse` do `if (err.meta?.correlationId) scope.setTag('correlation_id', String(err.meta.correlationId))`. For the Inngest path (which doesn't go through `asResponse`), tag Sentry directly where the job captures/rethrows, or rely on the existing OTel trace correlation (Sentry+Langfuse share the same NodeTracerProvider per `instrumentation.ts:67-70`, so they may already share trace context). Plan should choose the minimal plumbing that gets `attemptId` to the Sentry scope on the estimate error paths. |

> **OTel co-location bonus:** `instrumentation.ts` registers ONE `NodeTracerProvider` hosting BOTH `LangfuseSpanProcessor` and `SentrySpanProcessor` (`:67-70`). Spans created in a run already share an OTel trace id across Langfuse and Sentry. Adding `correlationId = attemptId` as explicit metadata/tag on top gives a human-searchable join key in addition to the implicit OTel one.

## Common Pitfalls

### Pitfall 1: Breaking `price-source-tagging.test.ts` by changing `normalizeOutput`'s return shape
**What goes wrong:** the 3 existing tests call `normalizeOutput(raw)` and read `result.sections[0]...`. Switching to `{ ok, value }` makes `result.sections` undefined → tests fail.
**How to avoid:** update those 3 assertions to `result.value.sections[0]...` (and assert `result.ok === true`) in the same wave. This is a known, intended regression touch — flag it in the plan, not a surprise.
**Warning sign:** green→red in `tests/unit/ai/price-source-tagging.test.ts`.

### Pitfall 2: Double-charging the AI / retry storm
**What goes wrong:** putting the schema retry where it stacks on Inngest retries (2) and provider fallback (1) → up to 6 model calls.
**How to avoid:** retry cap = 1, located at the provider boundary (orthogonal to Inngest's job-level retries and the fallback's once-only). The happy path (valid first time) makes ZERO extra calls — CONTEXT invariant "Happy path AI call count unchanged."
**Warning sign:** more than 2 `create_estimate` tool calls per generation in Langfuse for a valid run.

### Pitfall 3: Persisting invalid/garbage output
**What goes wrong:** validating too late (after `calculatedSections`/insert).
**How to avoid:** validation + retry happen INSIDE the provider call (`provider.generateEstimate`), strictly before `generate-estimate.ts:182` returns. By the time the service builds sections, the output is schema-valid. On second failure the typed error propagates → `nodes/generate.ts` → `{ failure: { reason: 'invalid_output' } }` → never reaches insert.
**Warning sign:** any row in `estimate_items` with a non-finite/negative price.

### Pitfall 4: Observability that throws and regresses reliability
**What goes wrong:** a Langfuse `createTraceId`/flush or a discrepancy-metric write throws and kills the Inngest step (silent-failure bug class).
**How to avoid:** wrap ALL GUARD-04 bookkeeping in try/catch (Phase 92 D-06 rule). `recordPipelineEvent` already swallows. The Langfuse handler block is already inside a `step.run` but the new metadata/`createTraceId` additions must be guarded — never let observability break generation.
**Warning sign:** a generation that succeeded but the job shows as failed/retried after adding tracing metadata.

### Pitfall 5: Multi-tenant leak via price-book match
**What goes wrong:** matching against a price book not scoped to `companyId`.
**How to avoid:** `priceBookItems` is already loaded `companyId`-scoped (`getPriceBookItems(supabase, companyId)`, `:102`) and currency-filtered. Do NOT re-query unscoped. Build the match Map from THIS array only.
**Warning sign:** anchoring a price that doesn't belong to the company.

### Pitfall 6: Regressing the totals math
**What goes wrong:** "formalizing" GUARD-03 accidentally changes rounding/order and shifts persisted totals.
**How to avoid:** GUARD-03 is assertions + a metric, NOT a rewrite. Keep `round2 = Math.round(x*100)/100` and the exact line order (`:254, :260, :267, :268, :269`). Add checks AROUND it, don't touch it.
**Warning sign:** any existing totals/estimate snapshot test changing value.

### Pitfall 7: Refine not inheriting the guardrails
**What goes wrong:** putting validation/retry in the graph node (generate-only) so Phase 101's refine bypasses it.
**How to avoid:** validation lives at the provider boundary (`callToolValidated` / the fallback wrapper), which `refineEstimate` already shares. Anchoring/clamp lives in the post-AI processing path that refine will also route through in Phase 101. Verify the chosen seam is on the path `refineEstimate` calls — not in `nodes/generate.ts`.
**Warning sign:** Phase 101 having to re-add validation.

## Code Examples

### Section invariant assertion (GUARD-03, drop-in after :269)
```typescript
const EPSILON = 0.01
const round2 = (x: number) => Math.round(x * 100) / 100
function assertFinitePositive(x: number): number {
  return Number.isFinite(x) && x >= 0 ? x : 0   // defensive zero-out (never throw)
}
// after computing subtotal/taxAmount/grandTotal:
const totalsSane =
  [subtotal, taxAmount, grandTotal].every((v) => Number.isFinite(v) && v >= 0) &&
  Math.abs(grandTotal - round2(subtotal + taxAmount)) <= EPSILON
```

### Anchor + clamp (GUARD-02, before :251)
```typescript
const CEILING = 1_000_000
const bookByName = new Map(
  priceBookItems.map((p) => [normalizeNameForMatch(p.name), p])
)
let anchoredCount = 0, clampedCount = 0
const guardedSections = aiEstimate.sections.map((s) => ({
  ...s,
  items: s.items.map((it) => {
    const hit = bookByName.get(normalizeNameForMatch(it.description))
    if (hit) {
      anchoredCount++
      return { ...it, unit_price: hit.unit_price, price_source: 'price_book' as const }
    }
    let unit_price = it.unit_price
    if (unit_price > CEILING) { unit_price = CEILING; clampedCount++ }
    return { ...it, unit_price }
  }),
}))
// feed guardedSections into the existing calculatedSections math (:251)
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Langfuse v3 `new Langfuse().trace()/.generation()` | v5 OTel `startObservation` + `LangfuseSpanProcessor` + LangChain `CallbackHandler` | commit `4365cbe` (Phase 97 landed) | GUARD-04 must use v5 API (`createTraceId`, config metadata), not v3. Shim in `langfuse.ts` covers the generation-span case only. |
| zod v3 | zod v4 (`^4.3.6`) | already in tree | Use `safeParse` (stable). Avoid deprecated `error.format()`; `error.issues` still valid. |
| Unsafe `as` casts in `normalizeOutput` | `safeParse` discriminated result | this phase | The change point for GUARD-01. |

**Deprecated/outdated:**
- PROJECT.md statement "Phase 97 (Langfuse v5 migration) pending" — STALE; the migration is in `package.json` and `instrumentation.ts`/`langfuse.ts`. Do not plan around a v3 API.

## Open Questions

1. **Which seam validates Gemini-served output?**
   - What we know: `getAIProviderWithFallback` can serve via OpenRouter OR Gemini. Validation must cover both.
   - What's unclear: whether to add `callToolValidated` per-adapter or move validation into `provider-with-fallback.ts` (single seam).
   - Recommendation: prefer the single seam in `provider-with-fallback.ts` (Pattern 3 option b). Read `lib/ai/providers/gemini.ts` generate method during planning to confirm it returns the same raw shape `normalizeOutput` expects.

2. **Sentry correlation tag for the Inngest (non-`asResponse`) path.**
   - What we know: `asResponse` is the HTTP boundary; the Inngest job captures errors via OTel/`onFailure`, not `asResponse`.
   - What's unclear: cleanest place to `setTag('correlation_id', attemptId)` for job-level failures.
   - Recommendation: rely on the shared OTel trace (Sentry+Langfuse share one provider) for implicit correlation, AND add `meta.correlationId` to `XtimatorError` so the HTTP-surfaced path tags it. Decide the Inngest-path tag in the plan (could be a `Sentry.getCurrentScope().setTag` inside the job's catch).

3. **Exact `@langfuse/langchain@5.5.3` metadata key.**
   - What we know: v5 reads `metadata.langfuseSessionId`/`langfuseUserId` from runnable config; constructor also accepts `sessionId`/`userId`.
   - What's unclear: whether 5.5.3 honors the config-metadata form identically (docs are version-fluid).
   - Recommendation: keep the constructor form (already shipping) AND add config metadata; the OBS-03 test only needs the token present. Verify the trace actually carries the correlation id in a Langfuse dev project during implementation (human spot-check).

## Validation Architecture

> nyquist_validation not disabled in config — section included. Framework: **vitest 4.1.4**.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest `^4.1.4` |
| Config file | `vitest.config.ts` (jsdom env, `@` alias to root, `server-only` stubbed) |
| Quick run command | `npx vitest run tests/unit/ai tests/unit/estimate` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GUARD-01 | Valid output → `{ ok: true }`; structurally invalid → `{ ok: false }` | unit | `npx vitest run tests/unit/ai/schema.test.ts` | ❌ Wave 0 |
| GUARD-01 | Provider retries exactly once on first invalid, then `InvalidEstimateOutputError`; valid-first-time = 0 retries | unit | `npx vitest run tests/unit/ai/output-retry.test.ts` | ❌ Wave 0 |
| GUARD-01 | `nodes/generate.ts` maps `InvalidEstimateOutputError` → `{ failure: { reason: 'invalid_output' } }`, never throws | unit | `npx vitest run tests/unit/estimate/never-throw.test.ts` (extend) | ⚠️ extend existing |
| GUARD-01 | `normalizeOutput` D-15 coercion still holds under new shape | unit | `npx vitest run tests/unit/ai/price-source-tagging.test.ts` | ⚠️ UPDATE (return-shape change) |
| GUARD-02 | Price-book match overrides `unit_price` + sets `price_source='price_book'` | unit | `npx vitest run tests/unit/ai/price-anchoring.test.ts` | ❌ Wave 0 |
| GUARD-02 | `ai_estimate` unit_price `> CEILING` clamps to CEILING + increments `clampedCount`; `0` kept | unit | `npx vitest run tests/unit/ai/price-anchoring.test.ts` | ❌ Wave 0 |
| GUARD-02 | Match is `companyId`-scoped (no cross-tenant anchor) | unit | `npx vitest run tests/unit/ai/price-anchoring.test.ts` | ❌ Wave 0 |
| GUARD-03 | Section subtotal == sum(item totals); grand == subtotal+tax (epsilon); NaN→0 | unit | `npx vitest run tests/unit/estimate/totals-authority.test.ts` | ❌ Wave 0 |
| GUARD-03 | `totals_discrepancy` metric = server vs AI-implied delta, with anchored/clamped counts | unit | `npx vitest run tests/unit/estimate/totals-authority.test.ts` | ❌ Wave 0 |
| GUARD-04 | Same `attemptId` flows to pipeline_events + Langfuse trace metadata + Sentry tag | unit (source-anchor) | `npx vitest run tests/unit/estimate/observability.test.ts` | ⚠️ extend (closes OBS-03 RED) |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/ai tests/unit/estimate`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** full suite green (incl. the previously-RED OBS-03 now closed by GUARD-04) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `tests/unit/ai/schema.test.ts` — covers GUARD-01 (accept valid / reject malformed: missing required, negative qty/price, bad price_source coercion)
- [ ] `tests/unit/ai/output-retry.test.ts` — covers GUARD-01 retry-once-then-`invalid_output`; asserts valid-first-time = single call (mock the provider's `callTool`)
- [ ] `tests/unit/ai/price-anchoring.test.ts` — covers GUARD-02 anchor override, clamp bounds, zero-keep, tenant scope
- [ ] `tests/unit/estimate/totals-authority.test.ts` — covers GUARD-03 invariants + discrepancy metric
- [ ] UPDATE `tests/unit/ai/price-source-tagging.test.ts` — adapt 3 assertions to the `{ ok, value }` return shape (regression touch)
- [ ] EXTEND `tests/unit/estimate/observability.test.ts` — GUARD-04 closes the pre-existing OBS-03 RED (`langfuseSessionId`/`langfuseUserId` token now present in `generate-estimate.ts` via config metadata)
- [ ] EXTEND `tests/unit/estimate/never-throw.test.ts` — add `invalid_output` mapping case alongside existing `provider_unavailable`/`generation_failed`
- Framework install: none — vitest already present.

## Environment Availability

> Pure code/config phase — no NEW external tools introduced. All runtime deps already wired.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| zod | GUARD-01 schema | ✓ | 4.3.6 | — |
| @langfuse/tracing | GUARD-04 `createTraceId`/trace | ✓ | 5.5.3 | metadata-only (skip `createTraceId`) |
| @langfuse/langchain | GUARD-04 CallbackHandler | ✓ | 5.5.3 | — |
| @sentry/nextjs | GUARD-04 correlation tag | ✓ | 10.56.0 | — |
| vitest | all tests | ✓ | 4.1.4 | — |
| Langfuse keys (env) | live trace export | runtime-only | — | processor no-ops when keys absent (`instrumentation.ts:59-63`) — tests/build unaffected |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** Langfuse keys are env-only and the span processor no-ops without them — local dev/tests run fine; GUARD-04 wiring is source-verifiable without live keys (the OBS-03 stub is a source-text anchor test, not a live-trace test).

## Sources

### Primary (HIGH confidence)
- Live source tree (read in full): `lib/ai/{normalize,types}.ts`, `lib/ai/providers/openrouter.ts`, `lib/ai/with-fallback.ts`, `lib/services/generate-estimate.ts`, `lib/estimate/{failure,graph/nodes/generate}.ts`, `lib/observability/{langfuse,pipeline-events}.ts`, `lib/inngest/{functions/generate-estimate,events}.ts`, `lib/errors/index.ts`, `instrumentation.ts`, `tests/unit/estimate/observability.test.ts`, `tests/unit/ai/price-source-tagging.test.ts`, `vitest.config.ts`, `package.json`.
- `package.json` — exact installed versions (zod 4.3.6; @langfuse/* 5.5.3; vitest 4.1.4; @sentry/nextjs 10.56.0).
- `.planning/phases/99-*/99-VERIFICATION.md` — confirms `FailureReason` incl. `invalid_output`, the marker-error brand-check pattern, OBS-03 pre-existing RED at base commit.

### Secondary (MEDIUM confidence)
- Langfuse v5 JS SDK docs (langfuse.com/docs/observability/sdk/typescript, /features/trace-ids, /integrations/langchain/tracing) — `propagateAttributes`, `createTraceId(seed)`, `startObservation(parentSpanContext)`, CallbackHandler config-metadata (`langfuseSessionId`/`langfuseUserId`). Cross-checks the installed v5 surface; exact 5.5.3 key honoring to confirm at implementation.

### Tertiary (LOW confidence)
- None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions read directly from `package.json`; no new deps.
- Schema/normalize change: HIGH — current code read line-by-line; zod v4 `safeParse` stable.
- Bounded-retry seam: HIGH — both generate+refine confirmed to share `callTool`+`normalizeOutput`; Gemini-parity is the one Open Question (seam choice, not feasibility).
- Price-book match + totals math: HIGH — exact functions/lines quoted; math enumerated from source.
- Langfuse v5 API: MEDIUM-HIGH — version installed is certain; the precise `@langfuse/langchain@5.5.3` config-metadata key honored is the one item to spot-check live (OBS-03 token requirement is satisfied regardless).
- Pitfalls: HIGH — derived from CONTEXT invariants + Phase 92/99 established patterns in-tree.

**Research date:** 2026-06-21
**Valid until:** 2026-07-21 (stable brownfield; revalidate Langfuse/zod versions if package.json changes)
