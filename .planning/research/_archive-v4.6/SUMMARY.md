# Project Research Summary

**Project:** Xtimator -- v4.6 Pricing Intelligence: Researched Pricing Agent (Pillar 2)
**Domain:** External-search-backed regional market-price enrichment inside an AI estimate pipeline (US home-services SaaS)
**Researched:** 2026-06-23
**Confidence:** HIGH (stack/architecture/pitfalls grounded against real code + official vendor docs; feature norms MEDIUM-HIGH)

## Executive Summary

v4.6 closes a single, sharp bug with broad consequences: when an estimate line item has no price-book match, today's AI guess can emit $0, and the vagueness gate (`isVagueEstimate`) blocks the whole estimate as "too vague" ("Couch cleaning 8seats" is the canonical case). The milestone replaces that guess, for unmatched items only, with a **regionally researched market price** tagged `price_source: 'researched'` and backed by evidence. The existing stack (Next.js App Router, the v4.3 canonical LangGraph estimate graph inside an Inngest job, OpenRouter-primary provider fallback, `platform_integrations` encrypted-key store, `price_source` tagging) is **fixed and out of scope** -- this is purely an additive enrichment plus one search source.

The load-bearing decisions are settled across all four research streams. **Search source:** use OpenRouter's native web-search server tool (engine `exa`, a *separate* call from the forced `create_estimate` call) -- same vendor, same key, same billing, ~$0.005/req, zero new dependency; Anthropic web search (with native `user_location`) is the gated *quality fallback* if regional grounding proves weak; Brave (free tier gone Feb 2026), dedicated pricing APIs (no public API), and scraping (legal/ToS/brittleness) are rejected. **Placement:** enrich *inside* `generateEstimateForProject`, immediately **after `anchorAndClampSections`** -- NOT as a post-`assess` graph node -- because the anchor pass is the only place that already knows which items lack a price-book match, and running before totals/persistence means the vagueness gate sees real numbers (which is the literal fix). **Precedence is absolute: `price_book > researched > ai_estimate`** (research only ever touches post-anchor `ai_estimate` items).

The dominant risk is not "can we look up a price" but "can we do it **trustworthily, deterministically, and cheaply**." Four guardrails are non-negotiable and must ship with the feature, not after: (1) **no fallback rung is ever $0** -- researched -> non-zero `ai_estimate` floor -> flagged "needs your price" routed to the existing `awaiting_details` path, never a silent $0 block; (2) the `'researched'` tag is **evidence-gated** (requires `source_url` + snippet + `researched_at`) so a guess is never laundered as researched; (3) the search source sits behind a **`PriceResearchProvider` port with a deterministic fixture adapter** so the v4.5 eval harness + CI regression gate stay green; (4) **prompt-injection hardening is reused** (route every snippet through `sanitizeField` + a `<search_result>` tag in the existing ## Security block). Caching (`price_research_cache`, tenant-scoped, ~30-day TTL) and cost controls (per-estimate item caps + a provider spend cap) bound the per-estimate blast radius.

## Key Findings

### Recommended Stack

The recommendation is to add a web-search call whose grounded result is injected as context into the *existing* OpenRouter estimate path -- never to combine a forced `tool_choice: create_estimate` with a server web-search tool in one turn (undocumented/unreliable on OpenRouter). The search runs first, grounds a number, then the unchanged structured-estimate call proceeds. See `STACK.md`.

**Core technologies:**
- **OpenRouter web-search server tool (`openrouter:web_search`, engine `exa`)** -- grounded regional price lookup for unmatched items, as a separate OpenRouter call -- same vendor/key/billing as the primary AI path, ~$0.005/req, **no new credential or npm dependency**. Pin `exa` for deterministic pricing (`auto` may route to provider search at variable cost).
- **Existing OpenRouter chat-completions path** -- synthesize grounded snippets into a single `unit_price` (+ low/high metadata) -- already built (`lib/ai/providers/openrouter.ts`); research result is injected as context.
- **`zod` (already in repo)** -- validate the researched payload before writing `price_source: 'researched'` -- mirrors existing `normalizeOutput` discipline; never trust a raw model number into the DB.
- **`platform_integrations` admin store (existing)** -- hold active source + region/margin/fallback config -- reuses AES-256-GCM encrypted, runtime-configurable store; zero env vars.

**Runner-up (gated quality fallback):** Anthropic Claude web search ($10/1k searches) with native `user_location {city, region, country}` -- strongest regional grounding + citations, but inverts the provider hierarchy (Anthropic is only the fallback vendor), so gate it behind a `platform_integrations` flag and use only if A/B shows OpenRouter/Exa regional quality is weak.

**Rejected:** Brave Search (viable + cheap but adds a new key + a metered vendor whose **free tier was removed Feb 2026**, ~$0.003-0.005/query, 50 QPS, no default spend cap); Gemini grounding ($35/1k after 1,500/day free -- couples a core feature to the fallback vendor); **dedicated pricing APIs** (RSMeans/Angi/HomeAdvisor -- **no public developer API**); **direct scraping** (ToS/legal exposure, brittleness, headless-browser dependency the project deliberately avoided). Always pair the chosen source with a deterministic safety-net fallback so a failed lookup still yields a non-$0 price.

### Expected Features

Industry norm (RSMeans/Homewyse/Profit Rhino) is *national average x regional adjustment, shown as a range, with visible sources, always human-overridable*. Xtimator's novelty is doing the lookup **on-demand per line item via AI web search** instead of a licensed static DB -- that changes the mechanism, not the expected behavior. See `FEATURES.md`.

**Must have (table stakes):**
- **Regional localization via client city/state in the search query** -- direct local lookup ("couch cleaning cost Austin TX"); the whole point of the milestone.
- **`price_source: 'researched'` value + editor badge** -- distinct from `price_book` / `ai_estimate`; trust-critical, locked decision.
- **No-data fallback chain + vagueness-gate fix** -- researched -> non-zero `ai_estimate` floor -> flagged "needs your price" (non-blocking); directly kills the originating $0 bug.
- **Human override preserved** -- confirm existing `Edited` flow clears `researched` and that item is never re-researched (one-way).
- **Minimal source capture** -- store `source_url` + snippet count on the researched item even if UI is just "researched from N sources"; cheap now, expensive to retrofit, underpins the `researched` tag integrity.

**Should have (competitive):**
- **Source transparency / "researched from N sources"** -- the single biggest trust lever (converts "the AI made it up" into "here is where this came from").
- **Low / avg / high range retained as metadata** -- honesty signal; avg drives the line, low/high on hover. Anti-feature: do NOT replace the single editable `unit_price` with a range.
- **Service+region cache (30-90 day TTL)** -- big cost/latency win once volume is visible.
- **Admin-panel research config** -- source selection, default markup, fallback mode, TTL; ship thin with sane defaults.
- **Confidence signal** from source count/agreement.

**Defer (v4.6.x / v5+):**
- Coarse regional-multiplier fallback table (only if direct local lookup proves too sparse for rural regions).
- Full clickable per-line citations UI.
- Cross-tenant pricing analytics from the cache (needs volume + privacy pass).

**Explicit anti-features (do NOT build):** real-time live scraping per item; a single "the market price is $X" with no range/uncertainty; a proprietary RSMeans-clone cost DB; auto-applying researched prices silently into the sent estimate without review; letting researched prices override the price book; re-researching items the owner already edited.

### Architecture Approach

Add the research step as an **enrichment inside `generateEstimateForProject`, immediately after `anchorAndClampSections`** (the post-anchor `ai_estimate` set *is* the "no price-book match" set), running BEFORE totals + persistence so the graph's `assess`/vagueness gate sees real numbers. One **batched** lookup for all unmatched items (not N calls), behind a swappable provider seam, with a tenant-scoped TTL cache. The orchestrator **never throws** (mirrors anchoring's non-fatal contract). See `ARCHITECTURE.md`.

**Major components:**
1. **`lib/estimate/price-research/index.ts researchUnmatchedPrices(sections, ctx)`** -- filter `ai_estimate` items -> cache-check -> batched `provider.lookup` -> write-through -> re-tag `researched`; never throws.
2. **`lib/estimate/price-research/provider.ts PriceResearchProvider + getPriceResearchProvider()`** -- the swappable-source seam, resolving active source from `platform_integrations` (mirrors `getAIProviderWithFallback`); `null` when unconfigured -> enrichment is a no-op. **This is also the determinism seam** the eval harness injects a fixture adapter into.
3. **`price_research_cache` table (new migration)** -- `(company_id, normalized_name, region, currency)` unique key + `expires_at`; deny-all client RLS, service-role-only (mirrors `pipeline_events`).
4. **`lib/services/generate-estimate.ts` (modified)** -- one new call between anchoring and totals, threading `client.city/state` region.
5. **The `'researched'` enum thread** -- single value through ~8 files: `lib/ai/schema.ts` (relax the D-15 preprocess), `lib/ai/types.ts`, `price-anchoring.ts` (type widen only -- `price_book` still wins), `estimate_items.price_source` CHECK, `lib/actions/estimate.ts`, `use-estimate-reducer.ts`, `item-row.tsx`, `item-card-mobile.tsx` (new "Researched" badge).

### Critical Pitfalls

From `PITFALLS.md` (10 total; top correctness/cost items below):

1. **Re-introducing the $0/vague trap on the no-data path** (the single most important) -- research returning nothing must degrade to a non-zero `ai_estimate`, or route to the existing `awaiting_details` path; **never** leave $0 (re-trips the gate) and **never** write an arbitrary placeholder. Regression-test the "Couch cleaning 8seats" fixture with an empty research response -> asserts a non-zero priced estimate.
2. **Hallucinated / citation-less `researched` prices** -- the tag must be **evidence-gated**: stamp `researched` only when `source_url` + snippet + `researched_at` exist; weak grounding falls through to honest `ai_estimate`, never a fake `researched`. Separate retrieval from generation.
3. **Non-determinism breaks the v4.5 eval harness + CI gate** -- seam the source behind `PriceResearchProvider`, ship a **deterministic fixture adapter** + golden fixtures + a fixed clock for `researched_at`/TTL; extend quality metrics with a "no $0 researched items" assertion. Never hit a live API in the gated suite.
4. **Prompt injection from web content** -- search snippets are attacker-influenceable; route every snippet through the existing `sanitizeField` + a `<search_result>` tag enumerated in `buildSystemPrompt` ## Security block; prefer structured numeric extraction over free-text-into-LLM. Reuse the proven transcript/photo hardening, do not invent a parallel path.
5. **Cost / latency / rate-limit explosion** -- batched (not per-item) lookup; tenant-scoped TTL cache (a hit is $0); **per-estimate item cap + provider spend cap**; memoize research across the auto-refine loop (do not re-pay on refine); distinguish 429-retry from quota-drained-degrade; never block the whole estimate on one slow lookup.

Plus: **multi-tenant cache leakage** (cache only the neutral market datum -- no `company_id`/client/margin in the *value*; apply margins after read; service-role-only table) and **channel neutrality** (the new module imports nothing channel-specific -- the `ENGINE-01` static gate).

## Implications for Roadmap

Both the architecture and pitfalls researchers proposed a phase breakdown. They agree on the shape; the architecture version is more concrete (numbered 105-109, continuing the global counter) and the pitfalls version maps every pitfall to a phase. The reconciled breakdown below uses the architecture numbering and folds the pitfalls' correctness/cost mappings into each phase. **Numbering continues globally -- v4.5 ended at Phase 103, so v4.6 starts at Phase 105.**

### Phase 105: `price_source: 'researched'` Threading (foundation, no behavior change)
**Rationale:** Pure type/enum/badge plumbing with zero runtime behavior -- unblocks everything else and ships green with the badge dormant (no item is ever tagged `researched` yet). No external dependency.
**Delivers:** Widened `lib/ai/schema.ts` enum (relax D-15 preprocess), `lib/ai/types.ts`, `price-anchoring.ts` type widen, `estimate_items.price_source` CHECK migration, `actions/estimate.ts` + `use-estimate-reducer.ts` unions, "Researched" badge in `item-row.tsx` / `item-card-mobile.tsx`.
**Addresses:** `price_source: 'researched'` value + badge (table stakes); human-override `Edited`-clears-`researched` confirmation.
**Avoids:** Precedence pitfall by type-only widening -- `price_book` still wins.

### Phase 106: Cache Table + Tenant-Scoped Cache Module
**Rationale:** Cache is core, not optional -- without it the cost/latency/rate-limit pitfalls bite at any real volume. Parallelizable with 105. Region-granularity + key-canonicalization decisions live here (and feed the search query in 108).
**Delivers:** `price_research_cache` migration (deny-all RLS), `cache.ts` (get/put, TTL=30d, normalized region), `normalize.ts` (reuse `normalizeNameForMatch` + region normalizer), a **static leakage test** (no `company_id`/client/margin in the value).
**Uses:** Supabase service-role pattern (mirrors `pipeline_events`).
**Implements:** `price_research_cache` component.
**Avoids:** Pitfall 5 (stale/wrong-region keys -- canonical `(service, region, currency)` + TTL), Pitfall 6 (multi-tenant leakage -- neutral datum only, margins applied after read).

### Phase 107: Provider Seam + First Source (+ determinism seam)
**Rationale:** The source decision is open behind a seam, so the **seam itself is the deliverable**. Ship the determinism seam (fixture adapter) *with* the first real adapter so the CI gate never goes red. Recommend OpenRouter-web first (no new key, stays on primary path).
**Delivers:** `PriceResearchProvider` interface + `getPriceResearchProvider()` (reads active source, `null` when unconfigured), OpenRouter-web adapter (`makeOpenRouterWebProvider`), **deterministic fixture adapter + golden `(service, region) -> candidates` fixtures + fixed clock**, admin "Price Research" source selector in `integrations-providers.ts`, prompt-injection hardening (`sanitizeField` + `<search_result>` tag in ## Security).
**Uses:** OpenRouter web-search (`engine: exa`), existing `openrouter` key, Langfuse tracing.
**Implements:** provider seam component.
**Avoids:** Pitfall 9 (non-determinism), Pitfall 7 (prompt injection), Pitfall 2 (hallucinated tag -- evidence-gating built into the adapter contract).

### Phase 108: Orchestrator + Service Integration (the payoff)
**Rationale:** The join point where the bug is actually fixed. Depends on 105/106/107. Ships inline + never-throws (the never-throw contract makes inline safe).
**Delivers:** `researchUnmatchedPrices` (filter `ai_estimate` -> cache-check -> batched `provider.lookup` -> write-through -> re-tag), wired into `generateEstimateForProject` after `anchorAndClampSections`; the **fallback ladder** (researched -> non-zero `ai_estimate` floor -> `awaiting_details`); the vagueness-gate distinction ("whole estimate empty" = block vs "one flagged unpriced item" = allow); the **"Couch cleaning 8seats" regression fixture** in the eval harness.
**Addresses:** regional localization, no-data fallback chain (table stakes), minimal source capture.
**Avoids:** Pitfall 1 (the $0/vague trap -- this is literally the milestone correctness contract), Pitfall 10.

### Phase 109: Durability + Cost-Control Hardening (optional, post-measurement)
**Rationale:** Defer until a real source latency/cost is measured. Folds in the pitfalls researcher dedicated cost-control concerns.
**Delivers:** real `StepRunner` so research runs in its own `step.run('price-research')` (retry isolation, no re-charging the LLM generate call); provider fallback (OpenRouter-web -> Anthropic-quality-fallback) mirroring AI fallback; **per-estimate item cap + provider spend cap + quota integration**; refine-loop memoization; concurrency cap + 429 backoff + circuit-breaker; admin-config margins applied post-research; optional purge cron.
**Uses:** existing Redis rate-limiting infra (SEED-012), `usage_events`/`checkQuota`.
**Avoids:** Pitfall 2 (latency blowup), Pitfall 3 (cost explosion), Pitfall 4 (rate-limit/quota).

### Phase Ordering Rationale

- **Dependency-driven:** 105 (types) and 106/107 (cache + seam) are independent and parallelizable; 108 is the join where behavior turns on; 109 hardens after real latency/cost is observed.
- **Correctness-first within phases:** the eval seam + fixtures (107) and the fallback ladder + regression fixture (108) ship *in the same phase* as the behavior they guard -- deferring them re-opens the exact bug or breaks the CI gate.
- **Region granularity is decided early** (106) because it shapes both the cache key and the 108 search query.
- **Cost controls can lag** (109) only because the per-estimate item cap is the backstop and a warm cache makes most generations skip the network -- but the provider spend cap should be set as an owner-setup runbook item from day one.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 107:** the OpenRouter web-search adapter -- LOW-confidence area is exactly how `engine: exa` returns citations/snippets in a form we can evidence-gate on; a short spike to confirm the response shape (and that a forced `create_estimate` is genuinely kept on a *separate* call) is warranted. Also where the source-lock decision (OpenRouter-web vs Anthropic-quality-fallback) must be confirmed.
- **Phase 108:** the vagueness-gate distinction ("empty estimate" vs "one flagged item") touches `isVagueEstimate` + the auto-refine/`awaiting_details` interaction (Phase 96) -- verify the refine loop does not re-research and that flagged items route cleanly.

Phases with standard patterns (skip research-phase):
- **Phase 105:** mechanical enum/type/badge threading along a known path -- well-understood.
- **Phase 106:** cache table follows the established `pipeline_events` service-role/deny-all RLS pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Pricing/capability facts verified against official OpenRouter / Anthropic / Brave / Gemini docs (June 2026); the one LOW spot is forced-tool + web-search coexistence (resolved by mandating a separate call). |
| Features | MEDIUM-HIGH | Regional-multiplier / range / source-transparency norms are well established (RSMeans/Homewyse/Profit Rhino = HIGH); the on-demand AI-web-search variant of those patterns is less documented (MEDIUM). |
| Architecture | HIGH | Grounded directly against the real graph/service/schema/UI files; the web-search source stays an open decision behind a seam, so the architecture holds regardless of which source wins. |
| Pitfalls | HIGH | Brave metering, OpenRouter pricing, Inngest step-timeout semantics verified against current sources; mapping grounded in reads of `prompt-builder.ts`, `vagueness.ts`, PROJECT.md. |

**Overall confidence:** HIGH

### Gaps to Address (open decisions to confirm with the user before requirements freeze)

- **Final source lock:** OpenRouter-web (engine `exa`) as default vs Anthropic web search (`user_location`) as a gated quality fallback. Default to OpenRouter-web; confirm whether to wire the Anthropic fallback in v4.6 or defer to 109. *Handle:* confirm at requirements; the seam absorbs either way.
- **Region granularity:** city+state vs metro vs ZIP. Research recommends **metro / city+state** (ZIP too sparse, state too coarse). *Handle:* lock in 106 since it shapes the cache key and search query.
- **Markup / margin policy on researched prices:** does the admin-configured margin apply to researched prices, and is it applied *before* or *after* the cache write? This determines cache scope (see below). *Handle:* confirm at requirements; recommendation is margin applied **after** cache read so the cached datum stays neutral.
- **Cache scope:** tenant-scoped `(company_id, ...)` vs platform-shared `(name, region)`. Architecture defaults to **`company_id`-scoped** (RLS uniformity + safe if margins are baked per-company); a platform-shared layer is only safe if margins are applied strictly post-cache. *Handle:* tie this decision to the margin decision above; ship tenant-scoped first.
- **Provider spend cap / owner runbook:** the chosen source dashboard spend cap must be set (no default cap on Brave/OpenRouter). *Handle:* owner-setup runbook item, secrets as placeholders only.

## Sources

### Primary (HIGH confidence)
- OpenRouter web-search server tool docs -- engines (`exa` $0.005/req <=10 results), `:online`/`plugins` deprecated, forced-tool + web-search coexistence undocumented.
- Anthropic web search tool docs -- $10/1k searches, native `user_location {city, region, country}`, citations.
- Brave Search API docs + pricing -- ~$5/1k, 50 QPS, rate-limit headers.
- Inngest Usage Limits / Steps docs -- step duration bounded by host timeout, steps are independent retry/replay units.
- Xtimator codebase -- `lib/ai/providers/openrouter.ts`, `provider-with-fallback.ts`, `price-anchoring.ts`, `lib/services/generate-estimate.ts`, `lib/estimate/graph/*`, `lib/ai/schema+types.ts`, `lib/inngest/functions/generate-estimate.ts`, `lib/platform-config.ts`, `lib/admin/integrations-providers.ts`, `components/workspace/estimate/*`, `lib/ai/prompt-builder.ts` (S06 hardening), `lib/estimate/quality/vagueness.ts`, `.planning/PROJECT.md` v4.6.

### Secondary (MEDIUM confidence)
- Brave free-tier removal (Feb 2026) -- implicator.ai + agentdeals.dev (corroborated across sources).
- Gemini grounding pricing ($35/1k after 1,500/day free).
- RSMeans / Angi / HomeAdvisor -- no public developer API (GetApp/Capterra profiles, Apify scraper listings).
- Industry pricing norms -- RSMeans City Cost Index, Homewyse (BLS wage data, Lower-Higher range), Profit Rhino / Housecall Pro flat-rate price book.

### Tertiary (LOW confidence)
- On-demand AI-web-search-per-item as a pricing mechanism -- sparse direct documentation; grounding/caching/hallucination best-practice extrapolated from LLM-grounding guides (Towards Data Science, Firecrawl, AiBrain).
- OpenRouter `engine: exa` exact citation/snippet response shape -- needs a confirming spike in Phase 107.

---
*Research completed: 2026-06-23*
*Ready for roadmap: yes*
