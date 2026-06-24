# Stack Research

**Domain:** Regional market-price research for AI estimate line items (US home-services SaaS)
**Researched:** 2026-06-23
**Confidence:** HIGH (pricing/capability facts verified against official OpenRouter / Anthropic / Brave / Google docs + multiple corroborating sources, June 2026)

> **Scope note.** This is the v4.6 "Researched Pricing Agent" milestone. The existing stack (Next.js 14 App Router, LangGraph estimate graph in an Inngest job, OpenRouter-primary provider fallback, `platform_integrations` encrypted-key store, `price_source` tagging) is FIXED and out of scope. This document covers ONLY the search-source addition needed to ground a regional market price for line items with no price-book match.

---

## TL;DR Recommendation

**Use a SEPARATE web-search call whose results are injected as context into the existing OpenRouter estimate path — do NOT try to run search "through" the forced `create_estimate` tool call.**

Ranked recommendation for the search SOURCE:

1. **OpenRouter native web-search server tool (engine `exa`, isolated research call)** — PRIMARY. Same vendor, same API key (`getIntegrationKey('openrouter')`), same billing, same `fetch` style the app already uses. ~$5 / 1,000 lookups. Zero new credential, zero new dependency.
2. **Brave Search API (raw search → feed snippets to OpenRouter LLM)** — the user's named candidate; viable and cheap (~$5/1k) but adds a NEW API key + a second metered vendor whose free tier was removed Feb 2026.
3. **Anthropic Claude web search tool** — best *quality* fit (native `user_location` city/region/state + citations) BUT Anthropic is only the FALLBACK provider here, so making it the default inverts the provider hierarchy. Reserve as a quality-fallback.
4. **Gemini `googleSearch` grounding** — also fallback-provider-bound; 1,500 free grounded prompts/day is attractive but couples a core feature to a non-primary vendor.
5. **Dedicated pricing APIs (RSMeans / Angi / HomeAdvisor)** — NOT practically accessible. No public developer API. Do NOT add.
6. **Direct scraping** — do NOT add. ToS/legal exposure, brittleness, headless-browser dependency the project deliberately avoided.

**Deciding factor:** OpenRouter is the primary provider. Option 1 keeps research inside the provider/credential/billing path the app already owns. The originating bug (`"Couch cleaning 8seats"` → $0) is "the model had no grounded number" — any of options 1-4 fixes it; option 1 fixes it with the least new surface area.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| OpenRouter web-search server tool (`openrouter:web_search`, engine `exa`) | current API (no SDK) | Grounded regional price lookup for unmatched line items, as a SEPARATE OpenRouter call | Same vendor/key/billing as the primary AI path. ~$5 / 1,000 requests (≤10 results). No new credential, no new vendor; fits the existing `fetch`-based adapter exactly. |
| Existing OpenRouter chat-completions path | current | Synthesize the grounded snippets into a single `unit_price` (+ low/high) for the item | Already built (`lib/ai/providers/openrouter.ts`). Research result is injected as context; the structured `create_estimate` call stays forced-tool and unchanged. |
| `zod` | ^3 (already in repo) | Validate the researched price payload (`{ unit_price, low, high, source, confidence }`) before writing `price_source:'researched'` | Mirrors existing `estimateOutputSchema` / `normalizeOutput` discipline; never trust a raw model number into the DB. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none required) | — | — | **No new npm dependency for the recommended path.** OpenRouter is called with plain `fetch` today; web-search is an extra entry in the request `tools` array on a separate call. Keep it dependency-free. |
| `@anthropic-ai/sdk` | already present (Claude/Whisper paths) | ONLY if implementing the Anthropic web-search *quality-fallback* (option 3) | Optional, fallback-tier only. Its `web_search` tool natively accepts `user_location {city, region, country}` — strongest regional grounding if ever needed. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `platform_integrations` admin store (existing) | Hold the chosen search engine + region/margin/fallback config | Reuse the existing AES-256-GCM encrypted, runtime-configurable store. If Brave (option 2) is chosen, its key lands here too via `getIntegrationKey()`. Zero env vars — matches the milestone's "admin-panel config" requirement. |
| Langfuse (existing) | Trace the new research step like every other generation | The OpenRouter adapter already emits Langfuse generations; mirror it for the research call so cost/latency are observable per run. |

## Installation

```bash
# Core: NOTHING to install for the recommended path (option 1).
# OpenRouter web-search is an additive `tools` field on the existing fetch call.

# Only if implementing the Anthropic quality-fallback (option 3):
# @anthropic-ai/sdk is already a project dependency — no action expected.
```

---

## How each option composes with OpenRouter-primary (the load-bearing question)

| # | Source | Composition with OpenRouter-primary | Verdict |
|---|--------|-------------------------------------|---------|
| 1 | **OpenRouter web search** | **Search runs THROUGH OpenRouter itself**, but as a SEPARATE call from `create_estimate`. The research call sends `tools:[{type:'openrouter:web_search', engine:'exa'}]`, lets the model search + summarize the regional price; result is injected as context into the unchanged forced-`tool_choice:create_estimate` call (or written directly after schema-validating). Same key, same `OPENROUTER_BASE_URL`, same billing. | BEST FIT |
| 2 | **Brave Search API** | **Separate search call, NOT through OpenRouter.** Call Brave's REST endpoint directly, get raw results, feed snippets as context to the existing OpenRouter LLM to extract the number. Adds one new vendor + key. The LLM half still runs on OpenRouter-primary. | VIABLE, MORE SURFACE |
| 3 | **Anthropic web search** | Runs **through Anthropic, the FALLBACK provider** — inverts the hierarchy. A separate `messages` call with `web_search` returns grounded text; feed that into the OpenRouter estimate call. Best regional grounding (`user_location`), but now a core feature depends on the fallback vendor. | QUALITY-FALLBACK ONLY |
| 4 | **Gemini grounding** | Runs **through Gemini, also a FALLBACK provider.** Separate `generateContent` with `googleSearch` grounding tool; feed grounded output to OpenRouter. Generous free quota, but same hierarchy-inversion concern as #3. | FALLBACK ONLY |
| 5 | **Dedicated pricing APIs** | Would be a pure data call independent of any LLM, results injected into OpenRouter — clean composition, **but the APIs do not exist**. | NOT AVAILABLE |
| 6 | **Scraping** | Independent fetch + parse, results injected into OpenRouter. Composition is fine; the *legality/reliability* is not. | DO NOT USE |

**Critical architectural note (verified by reading `lib/ai/providers/openrouter.ts`):** the existing call forces `tool_choice:{type:'function',function:{name:'create_estimate'}}`. A forced custom tool and a server-side web-search tool cannot be relied upon to BOTH fire in one turn — OpenRouter's docs do not document combining a forced `tool_choice` with `openrouter:web_search` (LOW confidence it works; treat as unsupported). Therefore the research MUST be a **separate, prior call**: search-and-ground first, inject the grounded price as context, then run the unchanged structured-estimate call. This maps cleanly to a new graph node placed before `assess`, exactly as the milestone describes — and preserves channel neutrality (it's just another node in `lib/estimate/graph`).

## Current pricing & limits (verified June 2026)

| Source | Per-lookup cost | Free allowance | Rate limit | Latency profile | New credential? |
|--------|-----------------|----------------|------------|-----------------|-----------------|
| **OpenRouter web search (Exa)** | $0.005 / request (≤10 results) + $0.001/extra result + LLM tokens | OpenRouter credit balance only | OpenRouter account limits | One round-trip + model reasoning (seconds) | **No** — reuses existing OpenRouter key |
| **Brave Search API (Search plan)** | ~$5 / 1,000 ($0.003–$0.005/query) | **$5/mo prepaid credits (~1,000 queries). FREE TIER REMOVED Feb 2026.** | 50 QPS (Search plan); free-credit allowance throttled to 1 QPS | Single fast REST call (~sub-second) + a separate LLM call to extract the number | **Yes** — new Brave key |
| **Anthropic web search** | **$10 / 1,000 searches** + token costs for ingested results | none | org web-search rate limit (Console) | Native search→reason in one `messages` call; supports `user_location` | Uses Anthropic key (fallback vendor) |
| **Gemini googleSearch grounding** | **$35 / 1,000 grounded prompts** after free quota | 1,500 grounded prompts/day free on paid tier (shared) | Gemini API quotas | Grounded `generateContent` call | Uses Gemini key (fallback vendor) |
| **RSMeans / Angi / HomeAdvisor** | n/a | n/a | n/a | n/a | **No public API** |

Notes:
- OpenRouter's `:online` model suffix and the legacy `plugins:[{id:'web'}]` form are **deprecated**; the current form is the `openrouter:web_search` server tool with selectable engines (`auto`/`native`/`exa`/`firecrawl`/`parallel`/`perplexity`). Pin `exa` for deterministic $0.005/req pricing (`auto` may route to native provider search with provider-determined cost).
- Anthropic's `web_search` native `user_location:{city, region, country}` is the single best primitive for "average price in the client's city/state" — relevant if regional quality proves weak through OpenRouter/Exa.
- Gemini's free 1,500/day grounding is cheapest at low volume but ties a core feature to the fallback vendor.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| OpenRouter web search (option 1) | Brave Search API (option 2) | If you want the search index decoupled from the LLM vendor, need 50 QPS bursting, or distrust Exa quality for niche US-regional service pricing. Accept a new key + a metered vendor with no free tier. |
| OpenRouter web search (option 1) | Anthropic web search (option 3) | If A/B testing shows OpenRouter/Exa returns poor *regional* prices. Anthropic's `user_location` gives the strongest city/state grounding. Wire through the existing fallback adapter as a quality path — not the default. |
| OpenRouter web search (option 1) | Gemini grounding (option 4) | If lookup volume is very low and the 1,500/day free quota dominates cost concerns. Couples research to the fallback vendor. |
| Web-search APIs (any) | A static seeded "market rate" table in `platform_integrations` | As a cheap deterministic FALLBACK when search returns nothing/low-confidence, so the item still gets a non-$0 `researched` price instead of re-tripping the vagueness gate. **Recommended as a safety net regardless of search source.** |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| RSMeans Data Online "API" | **No public/developer API exists** (Gordian Cloud is a subscription UI + quarterly cost books; no programmatic field-callable access). Enterprise licensing only. | OpenRouter/Brave web search grounded to the region |
| HomeAdvisor / Angi cost-guide "API" | **No official public API.** Only third-party Apify scrapers exist — unofficial, ToS-violating, unstable. Cost data is consumer-web-page only. | Web-search APIs (which legally surface those same public cost-guide pages as grounded results) |
| Direct scraping (cheerio/puppeteer vs HomeAdvisor/Angi/Yelp) | ToS violations, IP blocking, layout churn, maintenance tax, legal exposure for a commercial SaaS; adds a headless-browser dependency the project deliberately avoided (chose `@react-pdf/renderer` over puppeteer for this reason). | OpenRouter/Brave/Anthropic web-search tools (they wrap search legally) |
| OpenRouter `:online` suffix / `plugins:[{id:'web'}]` | **Deprecated.** | `tools:[{type:'openrouter:web_search', engine:'exa'}]` server-tool form |
| Forcing `tool_choice:create_estimate` AND `web_search` in ONE call | Forced custom tool + server web-search in a single turn is undocumented/unreliable on OpenRouter. | Two calls: search-and-ground first, then the existing forced `create_estimate` call with the grounded price injected as context |
| Adding the `openai` npm SDK | Unnecessary — the adapter already speaks OpenRouter via plain `fetch`. | Keep `fetch`; add the `tools` field |

## Stack Patterns by Variant

**If you want minimum new surface area + vendor consistency (DEFAULT):**
- Use **OpenRouter web search (Exa engine)** in a new graph node before `assess`.
- Because: same key (`getIntegrationKey('openrouter')`), same billing, same `fetch` style, no new dependency, clean composition as a separate call ahead of the unchanged `create_estimate`.

**If regional price quality is the top priority and cost is secondary:**
- Use **Anthropic web search with `user_location:{city, region:state, country:'US'}`** behind a `platform_integrations` flag.
- Because: native location grounding + citations give the most defensible "average price in {city, state}" — but it leans on the fallback vendor, so gate it.

**If you want the search index decoupled from the LLM vendor (user's named candidate):**
- Use **Brave Search API** for raw results, then the existing OpenRouter LLM to extract the number.
- Because: independent index, 50 QPS headroom — at the cost of a new key and a vendor with no free tier (removed Feb 2026).

**Always add (regardless of source):**
- A deterministic fallback (seeded regional-rate table or clamped category average) so a failed/low-confidence search still yields a non-$0 `researched` price and never re-triggers the "too vague" gate that started this milestone.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| OpenRouter web-search server tool | existing `lib/ai/providers/openrouter.ts` fetch shape | Additive `tools` entry on a SEPARATE call; do NOT mix with the forced `tool_choice:create_estimate` call. |
| `openrouter:web_search` engine `exa` | OpenRouter chat-completions + Responses API | Pin `engine:'exa'` for deterministic $0.005/req pricing; `auto` may route to native provider search (provider-determined cost). |
| `web_search_20250305` / `20260209` (Anthropic) | `@anthropic-ai/sdk` (already present) | Only for the optional quality-fallback; org admin must enable web search in the Claude Console. |

## Sources

- https://openrouter.ai/docs/guides/features/server-tools/web-search — OpenRouter web-search server tool: engines (auto/native/exa/firecrawl/parallel/perplexity), Exa $0.005/req (≤10 results) + $0.001/extra; `:online`/`plugins:[{id:'web'}]` deprecated; tool_choice+web_search combination NOT documented. HIGH (capabilities/pricing) / LOW (forced-tool coexistence — undocumented)
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool — Anthropic web search: **$10/1,000 searches** + token costs; native `user_location {city, region, country}`; citations; `max_uses`. HIGH
- https://brave.com/search/api/ + https://api-dashboard.search.brave.com/documentation/pricing — Brave Search plan ~$5/1,000 (50 QPS); Answers plan $4/1,000 + token fees (2 QPS); $5/mo credits. HIGH
- https://www.implicator.ai/brave-drops-free-search-api-tier-puts-all-developers-on-metered-billing/ + https://agentdeals.dev/vendor/brave-search-api — **Brave free tier removed Feb 2026**, now metered ~1,000 queries on $5 credit. MEDIUM (corroborated across sources)
- https://ai.google.dev/gemini-api/docs/pricing — Gemini grounding $35/1,000 prompts after 1,500/day free on paid tier. HIGH
- https://www.rsmeans.com/ + GetApp/Capterra profiles — RSMeans Data Online: subscription UI, **no developer API**. MEDIUM
- https://www.angi.com/standards/about-our-cost-data-page.htm + Apify scraper listings — Angi/HomeAdvisor cost data is consumer-web-only; **no official API**, only unofficial scrapers. MEDIUM
- Source files read: `lib/ai/providers/openrouter.ts` (forced `tool_choice:create_estimate`, plain `fetch`, `getIntegrationKey('openrouter')`), `lib/ai/provider-with-fallback.ts` (OpenRouter primary → Gemini fallback), `lib/ai/price-anchoring.ts` (`price_source` tagging boundary). HIGH

---
*Stack research for: regional market-price research source for the v4.6 Researched Pricing Agent*
*Researched: 2026-06-23*
