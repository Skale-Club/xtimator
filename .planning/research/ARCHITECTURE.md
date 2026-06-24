# Architecture Research — v4.6 Researched Pricing Agent

**Domain:** AI estimate pipeline enrichment (regional market-price research for price-book misses)
**Researched:** 2026-06-23
**Confidence:** HIGH (grounded against the real graph/service/schema/UI files; the web-search *source* itself stays an open decision behind a seam)

---

## TL;DR Recommendation

1. **WHERE:** Add a research step as an **enrichment inside `generateEstimateForProject`, immediately AFTER `anchorAndClampSections`** — NOT as a new graph node. The anchor pass is the only place that has *already* tagged which items are `price_book` matches; everything still tagged `ai_estimate` after anchoring is exactly the set "no price-book match" the milestone targets. Doing it here also means web, WhatsApp, and MCP all get it for free (the service is the shared core).
2. **BATCHED, not per-item:** one research call for ALL unmatched items per estimate (a single `step.run`), not N calls.
3. **CACHE:** a new `price_research_cache` table keyed by `(company_id, normalized_service_name, region)` with a TTL column; reuses the price-book RLS/service-role pattern.
4. **PRECEDENCE:** `price_book > researched > ai_estimate`, enforced by running research only over the post-anchor `ai_estimate` set (anchored items are never touched).
5. **SEAM:** a `PriceResearchProvider` interface resolved by `getPriceResearchProvider()` reading active source from `platform_integrations` — mirrors `getAIProviderWithFallback` / `getIntegrationKey` exactly, so Brave / OpenRouter-web / Gemini-grounding / pricing-API are swappable via admin config.
6. **DURABILITY:** give research its own `step.run('price-research', …)` so a research-source timeout retries in isolation without re-charging the generate LLM call.

---

## Standard Architecture

### Where the new step lives in the existing pipeline

```
Inngest job: generate-estimate.ts
└─ step.run('orchestrate-estimate')          ← whole LangGraph in ONE step (DURABLE-02)
   └─ buildEstimateGraph(adapter, { runner })
        START → ingest → generate → assess → (autoRefine|finalize) → END
                          │
                          └─ makeGenerateNode(runner)
                               └─ runner.run('ai-generate', () =>
                                    generateEstimateForProject(companyId, projectId, opts)   ← shared core
                                  )
                                    1. gather project/client/company/priceBook
                                    2. provider.generateEstimate(input)         (OpenRouter→Gemini)
                                    3. anchorAndClampSections(...)               ← tags price_book vs ai_estimate
                                ┌─▶ 3.5  ★ NEW: researchUnmatchedPrices(...)     ← THIS MILESTONE
                                │        • input = sections still tagged 'ai_estimate' + client region
                                │        • cache lookup → research provider → write unit_price + 'researched'
                                4. server totals authority (totals.ts)
                                5. persist estimates / estimate_sections / estimate_items
```

The research step is a **fourth authority pass** in the same family as anchoring (Pillar 1) and totals (GUARD-03): a pure-ish enrichment that mutates `unit_price` + `price_source` on the section tree *before* the server computes authoritative totals.

### Why enrichment-in-service, NOT a new graph node

| Criterion | New node after `generate` | Enrichment after anchoring (RECOMMENDED) |
|-----------|---------------------------|------------------------------------------|
| Knows which items lack a price-book match | NO — anchoring runs *inside* the service, after the node returns. A node would have to re-fetch the persisted estimate and re-derive matches. | YES — sits a few lines after `anchorAndClampSections`, reads `price_source==='ai_estimate'` directly. |
| Channel neutrality | Must stay channel-neutral; OK but redundant | Service is already channel-neutral and shared by all 3 channels. |
| Totals correctness | Node mutates AFTER persistence → totals already wrong, needs re-persist | Runs BEFORE totals + persistence → totals authority sees researched prices natively. |
| Vagueness gate ($0 → "too vague") | `assess` runs on the persisted estimate; if research is a later node, the originating bug ("$0 → blocked") still fires before research. | Research fills $0 → `assess` sees real numbers → bug fixed. **This is the originating requirement.** |
| Code churn | New node + state channels + edges + re-fetch logic | One new call + one new module; graph topology untouched. |

The decisive point is the **originating bug**: "Couch cleaning 8seats" generated `$0`, `assess`/`isVagueEstimate` blocked it. `assess` runs on the *already-persisted* estimate inside the graph. If research were a node placed *after* `assess`, the block already happened. Placing research *before* persistence (inside the service) means the vagueness gate sees researched prices — which is the whole point. (Placing a research node *between* `generate` and `assess` is theoretically possible but would require the node to re-load the just-persisted estimate, re-derive the unmatched set, re-run totals, and re-persist — strictly worse than doing it in-line where the section tree is still in memory and untagged-vs-tagged is already known.)

### Component Responsibilities

| Component | Responsibility | New / Modified |
|-----------|----------------|----------------|
| `lib/estimate/price-research/index.ts` `researchUnmatchedPrices(sections, ctx)` | Pure-orchestration: filter `ai_estimate` items, batch them, cache-check, call provider, write `unit_price` + `price_source:'researched'`. Never throws (mirrors anchoring's non-fatal contract). | **NEW** |
| `lib/estimate/price-research/provider.ts` `PriceResearchProvider` + `getPriceResearchProvider()` | Source seam. Resolves active research source from `platform_integrations`; returns `{ lookup(items, region) }`. | **NEW** |
| `lib/estimate/price-research/providers/{brave,openrouter-web,…}.ts` | Concrete source adapters. | **NEW** (≥1) |
| `lib/estimate/price-research/cache.ts` | `(company_id, normalized_name, region)` read/write against `price_research_cache`. | **NEW** |
| `price_research_cache` table | Multi-tenant cache with TTL. | **NEW (migration)** |
| `lib/services/generate-estimate.ts` | Insert one call between `anchorAndClampSections` (~line 277) and totals (~line 282). Thread `client.city`/`client.state` region. | **MODIFIED** |
| `lib/ai/schema.ts` `price_source` enum | Add `'researched'`; relax the D-15 preprocess (today coerces anything ≠ `price_book` → `ai_estimate`). | **MODIFIED** |
| `lib/ai/types.ts` `LineItemOutput.price_source` | Add `'researched'`. | **MODIFIED** |
| `lib/ai/price-anchoring.ts` | The `'price_book' as const` literal stays; type widening only. Anchoring still wins (precedence). | **MODIFIED (type only)** |
| `estimate_items.price_source` CHECK | `… IN ('price_book','ai_estimate','researched')`. | **MODIFIED (migration)** |
| `lib/actions/estimate.ts` (editor save) | `price_source` union `+ 'researched'`; the existing `isManuallyEdited → null` rule already covers edits. | **MODIFIED** |
| `components/workspace/estimate/use-estimate-reducer.ts` | `EditorItem.price_source` union `+ 'researched'`. | **MODIFIED** |
| `item-row.tsx` / `item-card-mobile.tsx` | New "Researched" badge branch (3rd variant alongside Price book / AI estimate). | **MODIFIED** |
| `lib/admin/integrations-providers.ts` + admin UI | New "Price Research" category / source selector. | **MODIFIED** |
| `lib/inngest/functions/generate-estimate.ts` | Optional: inject a real `StepRunner` so research becomes its own `step.run` (durability isolation). | **MODIFIED (optional, recommended)** |

---

## Recommended Project Structure

```
lib/estimate/price-research/
├── index.ts                 # researchUnmatchedPrices(sections, ctx) — orchestrator, never throws
├── provider.ts              # PriceResearchProvider interface + getPriceResearchProvider()
├── cache.ts                 # cacheGet / cachePut keyed (company_id, normalized_name, region)
├── normalize.ts             # reuse normalizeNameForMatch from price-anchoring.ts; add region normalizer
└── providers/
    ├── brave.ts             # Brave Search source adapter
    ├── openrouter-web.ts    # OpenRouter web-search model source adapter
    └── (gemini-grounding.ts / pricing-api.ts as added)

supabase/migrations/
└── 2026MMDD_price_research_cache_and_source.sql   # new table + CHECK widen + (optional) source seed

components/workspace/estimate/                       # MODIFIED: add 'researched' badge
```

### Structure Rationale

- **Sibling to `lib/ai/price-anchoring.ts`, but under `lib/estimate/`** — research is a *pricing-domain* concern (region, market lookup), distinct from the LLM provider layer. Keeping it under `lib/estimate/` mirrors `lib/estimate/quality/` and `lib/estimate/totals.ts` (estimate-domain authorities) and keeps it importable by the channel-neutral service without dragging in channel code.
- **`providers/` mirrors `lib/ai/providers/`** — same mental model as the OpenRouter/Gemini/Anthropic adapter folder, so the swap pattern is familiar.
- **`getPriceResearchProvider()` mirrors `getAIProviderWithFallback()`** — both are async factories that read active config from `platform_integrations` via `getIntegrationKey`/`getAIProvider`; engineers already know the shape.

---

## Architectural Patterns

### Pattern 1: Post-Anchor Enrichment (the placement)

**What:** Run research over `sections.flatMap(s => s.items).filter(i => i.price_source === 'ai_estimate')` immediately after `anchorAndClampSections`, before totals.
**When:** Always, inside the shared service.
**Trade-offs:** + single integration point, all channels free, totals/vagueness see real prices. − the service grows another responsibility (mitigated by extracting the logic into its own module and keeping the call a one-liner).

```typescript
// lib/services/generate-estimate.ts — after anchorAndClampSections (~line 280)
const { sections: guardedSections } = anchorAndClampSections(aiEstimate.sections, priceBookMapped)

// ★ NEW: research only the items anchoring left as 'ai_estimate'
const researchedSections = await runner.run('price-research', () =>
  researchUnmatchedPrices(guardedSections, {
    companyId,                       // tenant scope — NEVER from LLM output
    region: { city: client?.city ?? null, state: client?.state ?? null },
    currencyCode,
  })
)
// then totals + persistence read researchedSections instead of guardedSections
```

### Pattern 2: Provider Seam (the swappable source)

**What:** `PriceResearchProvider` interface + `getPriceResearchProvider()` factory reading the active source from `platform_integrations`, exactly like `getAIProvider(companyId)`.
**When:** Resolved once per `researchUnmatchedPrices` call.
**Trade-offs:** + Brave/OpenRouter-web/Gemini/pricing-API swap with zero call-site change; admin can flip it live (the decision is still open, so the seam *is* the deliverable). − one indirection layer (negligible).

```typescript
// lib/estimate/price-research/provider.ts
export interface ResearchedPrice {
  normalizedName: string
  unitPrice: number          // USD; 0 allowed only if source genuinely returns 0
  confidence?: number        // optional, for future "low-confidence" badge
}
export interface PriceResearchProvider {
  // BATCHED: all unmatched item names in one shot
  lookup(items: { name: string }[], region: Region, currencyCode: string): Promise<ResearchedPrice[]>
}
export async function getPriceResearchProvider(): Promise<PriceResearchProvider | null> {
  const source = await getActiveResearchSource()        // reads platform_integrations
  switch (source) {
    case 'brave':          return makeBraveProvider(await getIntegrationKey('brave_search'))
    case 'openrouter_web': return makeOpenRouterWebProvider(await getIntegrationKey('openrouter'))
    default:               return null                   // disabled → enrichment is a no-op
  }
}
```

`null` provider (source unconfigured) → `researchUnmatchedPrices` returns input unchanged → items stay `ai_estimate`. This is the graceful-degrade pattern already used by `getXphereConfig()` / Stripe-Connect ("degrade gracefully when admin key absent").

### Pattern 3: TTL Cache with Tenant Scope (avoid re-researching)

**What:** Before calling the provider, look up each normalized `(company_id, name, region)` in `price_research_cache`; only send cache-misses to the provider; write fresh results back with `expires_at`.
**When:** Every research call.
**Trade-offs:** + huge cost/latency win on repeat services (same company quotes "couch cleaning per seat" in "Austin, TX" repeatedly); + bounds web-search spend. − cache staleness (mitigated by TTL); − one extra table.

**Why scope by `company_id`?** Two reasons: (1) RLS uniformity with the rest of the schema (every tenant table gates on `company_id` per the v4.0 RLS rewrite); (2) a researched price may be margin-adjusted per company (the milestone mentions admin-config margins). A platform-wide cache would leak one tenant's adjusted price into another. If margins are applied *after* the cache, a shared `(name, region)` cache is possible — but `company_id`-scoping is the safe default and matches every existing table.

```sql
CREATE TABLE public.price_research_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  normalized_name TEXT NOT NULL,          -- normalizeNameForMatch(item.description)
  region          TEXT NOT NULL,          -- normalized "city|state" or "state" or "US"
  unit_price      NUMERIC(12,2) NOT NULL,
  currency_code   TEXT NOT NULL DEFAULT 'USD',
  source          TEXT,                   -- which provider produced it (audit)
  confidence      NUMERIC,                -- optional
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL,   -- created_at + TTL; cron/lazy purge
  UNIQUE (company_id, normalized_name, region, currency_code)
);
ALTER TABLE public.price_research_cache ENABLE ROW LEVEL SECURITY;
-- Deny-all to clients; written/read only via requireServiceClient() from the service
-- (mirrors pipeline_events posture). No authenticated policy needed — service-role bypasses RLS.
```

**TTL recommendation:** **30 days** for market prices (regional service rates move slowly; weekly would burn budget for little gain, yearly risks drift). Lazy purge: treat `expires_at < now()` as a miss; optional weekly cron `DELETE … WHERE expires_at < now()` (the project already runs pg_cron + Vercel-cron fallback patterns). Reuse `getIntegrationKey`'s 30s in-memory TTL idea only for the *active-source string*, not for prices.

### Pattern 4: Batched Lookup (per-item vs batched)

**What:** One provider call for all unmatched item names, not one call per item.
**When:** Always inside a single Inngest step.

| Approach | Latency (N unmatched items) | Cost | Failure blast radius |
|----------|------------------------------|------|----------------------|
| Per-item | N × round-trip (serial) or N concurrent (rate-limit risk) | N × search cost | one item fails → partial; retries multiply |
| **Batched** | 1 round-trip | 1 search/LLM call | one call retries cleanly inside `step.run` |

A typical estimate has a handful of unmatched items; N serial web searches inside one Inngest step risks the step's wall-clock budget. A batched call — "return average US market unit prices for these services in {city, state}: [...]" — is one round-trip, one retry unit, one cost unit. For a pure pricing-API source that only accepts one query per item, the provider adapter can fan out *internally* (its concern), but the **seam contract is batched** (`lookup(items[], region)`), so the orchestrator and cache logic never change when the source changes.

---

## Data Flow

### Research enrichment flow (the new path)

```
generateEstimateForProject
  └─ anchorAndClampSections → guardedSections (items tagged price_book | ai_estimate)
       └─ researchUnmatchedPrices(guardedSections, {companyId, region, currencyCode})
            1. unmatched = items where price_source === 'ai_estimate'
            2. region = normalize(client.city, client.state)  (fallback: state → "US")
            3. cacheGet(company_id, normalizedName, region) for each → {hits, misses}
            4. if misses.length:
                 provider = await getPriceResearchProvider()
                 if provider: results = await provider.lookup(misses, region, currencyCode)
                              cachePut(results)            (write-through, expires_at = now+TTL)
            5. for each unmatched item with a hit/result:
                 item.unit_price  = researchedPrice
                 item.price_source = 'researched'
               (no hit & no result → item STAYS 'ai_estimate' — never downgrade price_book)
            6. return rewritten sections
  └─ totals.ts computes authoritative subtotal/tax/grand over researched prices
  └─ persist estimate_items with price_source ∈ {price_book, researched, ai_estimate}
  └─ assess (graph) now sees non-$0 numbers → vagueness gate passes
```

### Precedence guarantee (`price_book > researched > ai_estimate`)

- **price_book wins absolutely:** research only ever reads items already tagged `ai_estimate`. Anchored (`price_book`) items are out of the candidate set — they can never be overwritten by research.
- **researched beats ai_estimate:** a successful lookup re-tags `ai_estimate → researched`.
- **ai_estimate is the floor:** no hit / source disabled / provider error → item keeps `ai_estimate`. Research is **non-fatal and additive**, exactly like anchoring (which "must never break generation").

---

## Scaling Considerations

| Scale | Adjustments |
|-------|-------------|
| 0–1k estimates/mo | Cache + batched call is plenty. Single research source. |
| 1k–100k | Cache hit-rate dominates cost; consider a platform-wide `(name, region)` cache layer behind the per-company one IF margins are applied post-cache. Add provider fallback (Brave→OpenRouter-web) mirroring AI fallback. |
| 100k+ | Pre-warm cache for the company's most-quoted services; move purge to a dedicated cron; rate-limit the research source per company tier (reuse `checkQuota`). |

### Scaling Priorities

1. **First bottleneck: research-source cost/latency.** Fix order already baked in: cache → batch → TTL. A warm cache makes most generations skip the network entirely.
2. **Second bottleneck: Inngest step wall-clock** if a source is slow. Fix: research gets its **own `step.run`** (below), so it neither blocks nor re-charges the generate LLM step on retry.

---

## Durability inside Inngest

The whole graph runs in **one** `step.run('orchestrate-estimate')` (DURABLE-02: Inngest is the sole durability layer, no LangGraph checkpointer). Two options for research:

- **Recommended:** thread a real `StepRunner` into `buildEstimateGraph(adapter, { runner })` from `generate-estimate.ts` so `researchUnmatchedPrices` runs in `runner.run('price-research', …)`. Because the graph today runs inside a single outer `step.run`, true nested-step isolation requires the runner to map to `step.run`. The seam *already exists* (`StepRunner`, `passthroughRunner`) and the generate node already wraps its AI call in `runner.run('ai-generate', …)` — research follows the identical pattern. Net effect: a research-source timeout retries the research unit without re-invoking the (already-succeeded, already-paid-for) LLM generate call.
- **Minimum viable:** call `researchUnmatchedPrices` inline (passthroughRunner). Simpler, but a research-source failure that throws would bubble to the whole `orchestrate-estimate` step and re-run generation on retry. **Mitigation that makes this acceptable:** `researchUnmatchedPrices` **never throws** (catches all provider/cache errors, returns input unchanged) — same contract as `anchorAndClampSections`. With never-throw, inline is safe; the dedicated step is purely a cost/retry-isolation optimization.

**Decision:** ship inline + never-throw first (Phase 108), add the dedicated `step.run` as a hardening step (Phase 109) once a real source is wired and its latency is measured.

---

## Anti-Patterns

### Anti-Pattern 1: Research as a post-`assess` graph node
**What people do:** add a node after `generate`/`assess` to "enrich prices."
**Why it's wrong:** the vagueness gate (`assess`/`isVagueEstimate`) already ran on the persisted $0 estimate and blocked it — the originating bug is NOT fixed. The node must also re-load + re-total + re-persist.
**Do this instead:** enrich in-service before totals/persistence.

### Anti-Pattern 2: Trusting `region` or item names from LLM output for tenant/cache keys
**What people do:** key the cache or scope queries off model-produced strings.
**Why it's wrong:** breaks the project-wide invariant "`companyId` is never LLM-derived." A poisoned name could read another tenant's cache.
**Do this instead:** `company_id` from closure/param; `region` from the persisted `client.city/state`; only the *item description text* (used for the search query and the normalized cache key) comes from the model — and it's tenant-scoped by `company_id` in the key.

### Anti-Pattern 3: Per-item synchronous web searches inside the Inngest step
**What people do:** loop `await search(item)` over items.
**Why it's wrong:** N serial round-trips blow the step budget; N concurrent ones hit source rate limits; retries multiply cost.
**Do this instead:** batched `lookup(items[], region)`; let a single-query-only source fan out internally.

### Anti-Pattern 4: Overwriting `price_book` or persisting research as authoritative totals
**What people do:** re-price everything, or write the source's returned total.
**Why it's wrong:** violates `price_book > researched`; bypasses GUARD-03 server totals authority.
**Do this instead:** research only `ai_estimate` items; only `unit_price` + `price_source` change; `totals.ts` remains the sole total authority.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Brave Search (candidate) | New `brave_search` provider in `platform_integrations` (encrypted key via `getIntegrationKey`); `makeBraveProvider`. | Independent index; key already supported by the encrypted-key path. |
| OpenRouter web-search model (candidate) | Reuse existing `openrouter` key; `makeOpenRouterWebProvider` issues a web-grounded completion. | Zero new key; stays on the project's primary AI path. |
| Gemini grounding / pricing API (candidates) | Same seam; add adapter + (maybe) new `platform_integrations` provider id. | Decision deferred — seam absorbs whichever wins. |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `generate-estimate.ts` ↔ `price-research/index.ts` | direct async call, never-throws | one new line after anchoring |
| `price-research` ↔ `platform_integrations` | `getPriceResearchProvider()` → `getIntegrationKey` | mirrors `getAIProvider` |
| `price-research` ↔ `price_research_cache` | service-role client (`requireServiceClient`) | RLS deny-all to clients, like `pipeline_events` |
| schema/types ↔ anchoring/totals/persistence/editor | the `'researched'` enum value | single thread through ~8 files (schema.ts, types.ts, price-anchoring type, estimate_items CHECK, actions/estimate.ts, use-estimate-reducer.ts + item-row + item-card-mobile) |

---

## Suggested Build Order (dependency-ordered phases)

**Phase 105 — `price_source: 'researched'` threading (foundation, no behavior change).**
Widen `lib/ai/schema.ts` enum (relax D-15 preprocess to allow `'researched'`), `lib/ai/types.ts` `LineItemOutput`, `price-anchoring.ts` types, `estimate_items.price_source` CHECK migration, `lib/actions/estimate.ts` + `use-estimate-reducer.ts` unions, and the "Researched" badge in `item-row.tsx` / `item-card-mobile.tsx`. Ships green with zero items ever tagged `researched` yet (badge dormant). *Depends on: nothing.* *Unblocks: everything.*

**Phase 106 — Cache table + tenant-scoped cache module.**
Migration for `price_research_cache` (RLS deny-all), `cache.ts` (get/put, TTL=30d, normalized region), `normalize.ts` (reuse `normalizeNameForMatch` + region normalizer). Unit-tested in isolation. *Depends on: nothing (parallelizable with 105).* *Unblocks: 108.*

**Phase 107 — Provider seam + first source.**
`PriceResearchProvider` interface, `getPriceResearchProvider()` (reads active source from `platform_integrations`, returns `null` when unconfigured), one concrete adapter (recommend **OpenRouter-web first** — no new key, stays on primary path — then Brave behind the same seam). Admin UI: new "Price Research" source selector in `integrations-providers.ts`. *Depends on: nothing for the interface; admin wiring reuses existing pattern.* *Unblocks: 108.*

**Phase 108 — Orchestrator + service integration (the payoff).**
`researchUnmatchedPrices` (filter `ai_estimate` → cache-check → batched `provider.lookup` → write-through → re-tag), wired into `generateEstimateForProject` after `anchorAndClampSections`, **never-throws**, inline (passthroughRunner). End-to-end: the "couch cleaning $0" case now gets a researched price and passes the vagueness gate. *Depends on: 105, 106, 107.* *Unblocks: the milestone goal.*

**Phase 109 — Durability + hardening (optional).**
Inject a real `StepRunner` from `generate-estimate.ts` so research runs in its own `step.run('price-research')`; add provider fallback (source A → source B) mirroring AI fallback; admin-config margins applied post-research; optional purge cron. *Depends on: 108.* *Defer until a real source's latency is measured.*

> Phases 105 and 106/107 can run in parallel; 108 is the join point; 109 is post-hoc hardening. Numbering continues the global counter (v4.6 starts at Phase 105 per PROJECT.md).

---

## Sources

- Codebase (HIGH — read directly): `lib/services/generate-estimate.ts`, `lib/ai/price-anchoring.ts`, `lib/estimate/totals.ts`, `lib/estimate/graph/{index,state,types}.ts`, `lib/estimate/graph/nodes/{generate,decide}.ts`, `lib/ai/{schema,types,provider-with-fallback}.ts`, `lib/inngest/functions/generate-estimate.ts`, `lib/platform-config.ts` (`getIntegrationKey`), `lib/admin/integrations-providers.ts`, `components/workspace/estimate/{item-row,item-card-mobile,use-estimate-reducer}.tsx`, `lib/actions/estimate.ts`, `supabase/migrations/20260506000001_phase19_price_book.sql`.
- `.planning/PROJECT.md` — v4.6 milestone definition, locked constraints (OpenRouter primary, Brave candidate, Phase 105 start), originating bug.
- `lib/estimate/graph/CHECKPOINTING.md` (DURABLE-02: Inngest sole durability) — referenced via `index.ts` header.

---
*Architecture research for: v4.6 Researched Pricing Agent (regional market-price enrichment for price-book misses)*
*Researched: 2026-06-23*
