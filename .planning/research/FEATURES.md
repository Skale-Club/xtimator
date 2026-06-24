# Feature Research

**Domain:** Researched/regional market pricing for AI estimate generation (US service businesses — construction, landscaping, plumbing, HVAC, cleaning, painting)
**Milestone:** v4.6 Pricing Intelligence — Researched Pricing Agent
**Feature scope:** For line items with no price-book match, research the average US market price in the client's region (city/state); tag `price_source: 'researched'`
**Researched:** 2026-06-23
**Confidence:** MEDIUM-HIGH (the regional-multiplier model, low/avg/high range presentation, and source-transparency norms are well established across RSMeans / Homewyse / Profit Rhino — HIGH; the *on-demand AI-web-search* variant of those patterns is less documented — MEDIUM)

> NOTE: this file previously held v4.3 Unified Agentic Estimate Engine feature research (now archived with that milestone). It has been replaced with v4.6 research per the active milestone.

---

## How the Industry Actually Does This (Context the roadmapper needs)

Three reference models dominate US service-pricing tools. All three matter because they set the expectations Xtimator's researched price will be measured against — users were *trained* on these even if they never name them:

1. **RSMeans / Gordian City Cost Index (CCI)** — a curated *national-average* unit-cost database (92,000+ line items) plus a per-location **multiplier** (national average = 100; NYC = 129.1, some metros ≈ 0.92). The estimate is built at national average, then the ZIP maps to the nearest indexed city and **separate labor and material factors** rescale it. ~970 North-American locations. Regional variance is real and large: **25–40%+**.
2. **Homewyse** — national cost guides with an explicit **Lower-to-Higher labor range** per task (labor is the biggest variance driver), labor sourced from **US Bureau of Labor Statistics** wage data, materials from "3–4 reputable sources **listed on each calculator page**." Source transparency is on the page, per item.
3. **Profit Rhino (Housecall Pro flat-rate book)** — prebuilt price books computed from **national averages** for material cost + typical materials per task + average labor time. The contractor then **localizes by entering their own costs/labor rate** — the tool gives a national baseline, the human owns the final number.

**Load-bearing takeaway:** the established pattern is *national average × regional adjustment*, presented as a *range*, with *visible sources*, and **always human-overridable**. Xtimator's novelty is doing the lookup **on-demand per line item via AI web search** (Brave / Gemini grounding / Claude search through the OpenRouter path) instead of a licensed static database. That changes the *mechanism*, not the *expected behavior*. The behavior expectations below are what users already assume.

---

## Feature Landscape

### Table Stakes (Users Expect These)

Missing any of these makes the researched price feel like "the AI guessed again" — exactly the trust problem v4.6 exists to fix.

| Feature | Why Expected | Complexity | Notes / Dependency on existing Xtimator code |
|---------|--------------|------------|----------------------------------------------|
| **Regional localization to client city/state** | RSMeans / Clear Estimates / Projul all localize by ZIP/county; a US owner expects a Dallas price ≠ a San Francisco price (25–40% spread). The client address (city/state) is already on the project. | MEDIUM | Two mechanisms: (a) **direct local lookup** — pass city/state into the search query ("couch cleaning cost Austin TX"); (b) **national-avg × multiplier** — research a national number, apply a stored regional factor. (a) is simpler, fits the AI-web-search path, and is what the milestone implies. Recommend (a) for v4.6, keep (b) as a sparse-result fallback. |
| **New `price_source: 'researched'` value, distinct from `ai_estimate` and `price_book`** | Locked milestone decision. Existing editor badge system (`price_book` / `ai_estimate` / `Edited`) must extend cleanly. Users need to know *this was researched, not guessed*. | LOW | Extends the existing `estimate_items.price_source` CHECK column + the editor badge component (`EDITPRICE-01/02`). **Dependency:** price-book anchoring (`anchorAndClampSections`, Pillar 1) must run first so only no-match items get researched. |
| **Graceful fallback when research finds nothing** | This IS the originating bug ("Couch cleaning 8seats" → \$0 → blocked as vague). The whole milestone fails if the no-data path still produces \$0. | MEDIUM | Ordered degradation (see callout): researched → `ai_estimate` with a **non-zero floor** → clearly-flagged **"needs your price"** line that does NOT hard-trip the vagueness gate. Must never emit \$0/null silently. |
| **Human override in the editor** | Profit Rhino, Homewyse, RSMeans all treat the number as a *starting point* — owners know their local market. Existing editor supports manual `unit_price` edit → `price_source: null` + "Edited" badge. | LOW | Already built. Just confirm a `researched` item edited by hand follows the same path (becomes `Edited`, clears `researched`) and is never re-researched afterward. |
| **Resolve to a single number the estimate math can use** | An estimate has totals/PDF/share that consume one `unit_price`, even if a range was researched. | LOW | If research yields a range, pick a defensible point (median/avg) as the line `unit_price`; retain low/high as metadata only. Totals/PDF/share already consume a single number. |

### Differentiators (Competitive Advantage — align with the <5-min, no-keyboard Core Value)

Where Xtimator beats a static-database competitor — but each adds cost/latency/scope. Prioritize ruthlessly.

| Feature | Value Proposition | Complexity | Notes / Dependency |
|---------|-------------------|------------|--------------------|
| **Source transparency — "researched from N sources" / citations** | Homewyse lists sources per item; grounded-LLM best practice is inline citations to cut hallucination and build trust. For an AI-researched price this is the single biggest trust lever — it converts "the AI made it up" into "here's where this came from." | MEDIUM | Grounded search (Brave / Gemini googleSearch / Claude search) returns URLs + snippets. Capture them as line-item metadata; surface lightly in the editor (tooltip/expander "researched from 3 sources"). Don't over-build a citations UI in v4.6 — **store the data, show a minimal indicator**. Pairs with the `researched` badge. |
| **Low / average / high range retained as metadata** | Homewyse's headline feature; labor variance makes a single number feel falsely precise. A range signals honesty and helps the owner pick. | MEDIUM | Extract low/avg/high; store all three, use avg for the line, expose low/high on hover/expand. **Anti-feature risk:** do NOT replace the single editable `unit_price` with a range in the core estimate — totals/PDF need one number. Range is *supplementary metadata*. |
| **Caching/reuse of service+region prices** | Each researched item = an AI/web-search call (latency + token + API cost; grounding carries a "double synthesis" 2x-token hidden cost). Re-researching "drywall repair / Austin TX" on every estimate is wasteful. A shared cache keyed by (normalized service, region) cuts cost + latency sharply. | MEDIUM | Key = normalized service description + region (city/state or metro). TTL: prices move slowly — **30–90 day TTL** is reasonable (Homewyse refreshes quarterly; RSMeans quarterly/annual). Beware **cache-poisoning amplification** (a bad result persists the whole TTL) — keep TTL modest. **Multi-tenant note:** market prices aren't tenant-private, so recommend a **platform-shared, region-keyed, normalized-service cache** (cheaper, warmer) over per-company. |
| **Admin-panel control of research behavior** | Milestone-locked. Lets the platform owner tune region params, markup applied to researched prices, fallback policy, TTL, and active search source — without redeploy (matches existing `platform_integrations` pattern). | MEDIUM | Reuses the existing super-admin config surface. Scope tightly: a few knobs (enable/disable, source selection, default markup, cache TTL, fallback mode) — **not a rules engine**. Can ship thin with sane defaults. |
| **Confidence signal on the researched number** | Grounded search returns variable-quality results; a high/medium/low confidence hint (from source count/agreement) tells the owner when to double-check. | LOW-MEDIUM | Cheap to derive (#sources, variance across sources). Surface as a subtle indicator. Ties into the no-data fallback (low confidence → suggest verifying). |

### Anti-Features (Tempting, but harmful — explicitly DO NOT build)

| Anti-Feature | Why Requested / Tempting | Why Problematic | Better Approach |
|--------------|--------------------------|-----------------|-----------------|
| **Real-time live scraping of marketplaces/competitors per item** | "Get the exact current price from HomeAdvisor / Thumbtack / Yelp." | Brittle (anti-bot, ToS/legal risk), slow, non-deterministic, expensive per estimate; results vary run-to-run, undermining trust. Scraping is a milestone candidate to *weigh against*, not adopt blindly. | Use a **grounded web-search API** (Brave / Gemini grounding / Claude search via the OpenRouter path) returning snippets + citations, plus the cache. Treat results as *benchmarks*, not live quotes. |
| **A single authoritative "the market price is \$X" with no range/uncertainty** | Cleaner UI, less to explain. | Falsely precise; when wrong it destroys trust harder than an honest range, and nudges the owner to send a number they didn't vet. | Single number for the math, but **always pair with a source/confidence indicator** so it reads as "researched, verify me" not "truth." |
| **Building a proprietary nationwide priced cost database (RSMeans clone)** | "Then we don't depend on AI search; deterministic + fast." | Massive ongoing data-curation cost; RSMeans/Gordian/Homewyse have decades of head start + licensed BLS pipelines. Against the lean on-demand thesis. | On-demand AI research + cache *is* the lean alternative; the cache organically becomes a cost database over time without manual curation. |
| **A full cost-of-living multiplier table maintained in-house** | Deterministic regional adjustment like RSMeans CCI. | Maintenance burden, staleness, 970+ location coverage gaps — overkill when the query can just include the city/state. | Pass city/state into the **search query** (direct local lookup). Consider a coarse multiplier only as a *fallback* when local results are sparse. |
| **Auto-applying researched prices silently into the final sent estimate without review** | "Frictionless, no keyboard" matches the core value. | A wrong researched price sent to a client is worse than a blank — it looks like a binding quote. The owner must at least *see* it's researched. | Keep the existing review-in-editor step; mark researched items distinctly so the owner can scan + adjust before sending. The 5-min flow survives a glance-and-confirm. |
| **Letting researched prices override the company price book** | "Newer/market data must be more accurate." | Violates the locked priority model — the price book is *authoritative* (Pillar 1, `anchorAndClampSections`). Owners deliberately curate it. | **Strict precedence: `price_book` > `researched` > `ai_estimate`.** Research only runs on no-match items. Never re-rank. |
| **Researching prices for items the owner already priced/edited** | "Keep everything fresh." | Wasteful, and overwrites human intent (the strongest signal). | Research only no-match items; once `Edited`, never re-research. |

---

## The "No Data Found" Path (explicit — ties to the originating $0 bug)

This is the quality gate's crux. Originating bug: "Couch cleaning 8seats" → AI emitted **\$0** → **vagueness gate blocked the whole estimate as "too vague."** The researched-pricing agent must guarantee the \$0 path is closed. Ordered behavior:

```
For each line item with NO price-book match:
  1. Research (regional, grounded web search).
     ├─ Usable result (>=1 credible source, non-zero) → price_source='researched'
     │     attach sources + (optional) low/avg/high + confidence
     └─ No usable result ↓
  2. Fall back to ai_estimate WITH a non-zero floor (never $0/null).
     ├─ AI produces a plausible non-zero number → price_source='ai_estimate'
     └─ Still $0 / refuses ↓
  3. Emit a CLEARLY-FLAGGED "needs your price" line:
       - non-blocking: does NOT hard-trip the vagueness gate into "too vague" reject
       - placeholder/zero allowed ONLY when visibly flagged for the owner to fill
       - estimate still renders; owner completes the one line in the editor
```

**Key contract:** the vagueness gate (`isVagueEstimate` / `lib/estimate/quality/vagueness.ts`) must distinguish *"the whole estimate is empty/itemless"* (legitimately vague → block) from *"one researched item couldn't be priced but is flagged"* (don't block the whole estimate). This is the single most important interaction to get right — and the direct fix for the originating bug.

---

## Feature Dependencies

```
[Price-book anchoring: anchorAndClampSections]   (EXISTS — Pillar 1)
        └──must run before──> [Researched pricing agent]
                                   ├──writes──> [price_source: 'researched' tag/badge]
                                   ├──feeds──> [Source/citation metadata]   (differentiator)
                                   ├──feeds──> [Low/avg/high range metadata] (differentiator)
                                   └──reads/writes──> [Service+region cache] (differentiator)

[Researched pricing agent]
        └──on no-data──> [Fallback chain: ai_estimate floor → flagged needs-price]
                              └──must coordinate with──> [Vagueness gate]   (EXISTS — must learn the new distinction)

[Canonical estimate graph: lib/estimate/graph]   (EXISTS — v4.3)
        └──research node inserted BEFORE──> [assess node]   (channel-neutral; runs inside the Inngest job)

[Estimate editor badges + manual override]   (EXISTS — EDITPRICE-01/02)
        └──extended by──> [researched badge]  &  [Edited clears 'researched']

[Super-admin config: platform_integrations pattern]   (EXISTS)
        └──controls──> [region params, markup, fallback mode, cache TTL, search source]
```

### Dependency Notes

- **Research requires price-book anchoring first:** research must only run on items with no price-book match, so anchoring/clamp resolves first. Hard ordering constraint.
- **Research must run before `assess` in the graph:** so the vagueness assessment sees researched (non-zero) prices, not raw \$0 guesses. This is *the* placement decision in the milestone and the mechanical fix for the originating bug. Must preserve channel neutrality (no `lib/whatsapp/*` imports in the new node — same rule the v4.3/v4.5 nodes follow).
- **Vagueness gate must learn a new distinction:** "itemless/empty estimate" (block) vs "one flagged unpriced item" (allow). Without this, the no-data path re-introduces the original bug.
- **Editor override conflicts with re-research:** once `Edited`, an item must never be re-researched (human intent wins). One-way transition.
- **Caching enhances cost/latency but must respect tenant boundaries:** market prices aren't tenant-private, so a platform-shared region-keyed cache is acceptable and far cheaper than per-tenant — but the key must normalize the service description well or the hit rate collapses.
- **Source selection is an open milestone decision:** Brave Search vs Gemini googleSearch grounding vs Claude web search vs a pricing API vs scraping — must fit the OpenRouter-primary path. This is a STACK/architecture decision, flagged here because the differentiators (sources, range, confidence) depend on whichever source returns citations + snippets.

---

## MVP Definition

### Launch With (v4.6 core)

- [ ] **Research node in the canonical graph, before `assess`, channel-neutral** — runs in the Inngest job for no-match items only. *Without this, nothing else exists.*
- [ ] **Regional localization via client city/state in the search query** — direct local lookup (simplest mechanism that fits the OpenRouter/Brave path). *The whole point of the milestone.*
- [ ] **`price_source: 'researched'` value + editor badge** — distinct from `ai_estimate`/`price_book`. *Locked decision; trust-critical.*
- [ ] **No-data fallback chain (researched → ai_estimate non-zero floor → flagged needs-price) + vagueness-gate fix** — *Directly fixes the originating \$0 bug; the milestone fails without it.*
- [ ] **Human override preserved** — confirm existing `Edited` flow covers researched items. *Near-zero cost, non-negotiable trust property.*
- [ ] **Minimal source capture** — store source URLs / snippet count on the researched item even if UI is just "researched from N sources." *Cheap now, expensive to retrofit; underpins trust + future citations.*

### Add After Validation (v4.6.x / next)

- [ ] **Service+region cache with 30–90 day TTL** — *Add once research volume/cost is visible; big cost/latency win, not needed to validate correctness.*
- [ ] **Low/avg/high range as supplementary metadata + hover/expand UI** — *Add once owners ask "how sure is this?" Range is honesty polish, not core math.*
- [ ] **Admin-panel research config (markup, fallback mode, source selection, TTL)** — *Start with sane hardcoded defaults; expose knobs once usage reveals which matter. (Milestone lists it; can ship thin.)*
- [ ] **Confidence indicator from source count/agreement** — *Layer on after sources are captured.*

### Future Consideration (v5+)

- [ ] **Coarse regional multiplier fallback table** — *Only if direct local lookup proves too sparse for rural/obscure regions.*
- [ ] **Full citations UI (clickable sources per line)** — *Defer until transparency proves a retention/trust driver.*
- [ ] **Cross-tenant pricing analytics from the cache** ("market rate for X is trending up") — *Emergent value from the cache; needs volume + a privacy pass first.*

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Research node before `assess` (graph integration) | HIGH | MEDIUM | P1 |
| Regional localization via city/state query | HIGH | MEDIUM | P1 |
| `price_source: 'researched'` value + badge | HIGH | LOW | P1 |
| No-data fallback chain + vagueness-gate fix | HIGH | MEDIUM | P1 |
| Human override preserved for researched items | HIGH | LOW | P1 |
| Minimal source capture (store URLs/count) | MEDIUM | LOW | P1 |
| Service+region cache (TTL) | MEDIUM | MEDIUM | P2 |
| Low/avg/high range metadata + UI | MEDIUM | MEDIUM | P2 |
| Admin-panel research config | MEDIUM | MEDIUM | P2 |
| Confidence indicator | MEDIUM | LOW-MEDIUM | P2 |
| Regional multiplier fallback table | LOW | MEDIUM | P3 |
| Full per-line citations UI | LOW-MEDIUM | MEDIUM | P3 |

**Priority key:** P1 = must have for v4.6 launch · P2 = should have, add when possible · P3 = future.

---

## Competitor Feature Analysis

| Feature | RSMeans / Gordian | Homewyse | Profit Rhino (Housecall Pro) | Xtimator v4.6 Approach |
|---------|-------------------|----------|------------------------------|------------------------|
| **Regional localization** | ZIP → nearest of 970 indexed cities; separate labor + material multipliers vs national=100 | BLS regional wage data; region = biggest variance | Owner enters their own local costs/labor rate | City/state injected into AI search query (direct local lookup); multiplier only as sparse-result fallback |
| **Price source mechanism** | Licensed curated DB, quarterly/annual updates | 3–4 reputable sources + BLS, periodic refresh | National-average curated book + supplier data | On-demand grounded AI web search (Brave / Gemini grounding / Claude search via OpenRouter) |
| **Range vs single** | Single localized unit cost | Explicit **Lower–Higher** labor range | Single flat-rate number | Single number for math; low/avg/high retained as metadata (P2) |
| **Source transparency** | Methodology documented; not per-estimate citations | **Sources listed on each calculator page** | Methodology described, not per-item citations | Capture sources per item; surface "researched from N sources" (P1 minimal → citations P3) |
| **Caching / refresh cadence** | Quarterly/annual book updates | Periodic (quarterly) | Periodic book updates | 30–90 day region-keyed cache (P2) |
| **No-data behavior** | Item absent from book = estimator fills manually | Calculator simply not offered | Item not in book = manual add | Fallback chain ending in flagged needs-price; never \$0-block (P1) |
| **Override** | Estimator edits freely | Advisory only | Owner-owned numbers | Existing editor `Edited` flow; human always wins |

**Where Xtimator differs meaningfully:** every competitor relies on a *pre-built static database* refreshed on a vendor cadence; Xtimator does *per-item on-demand research* localized to the specific client's region. That's more flexible (covers obscure/long-tail services a static book lacks — exactly the "couch cleaning 8 seats" case) but inherits AI-search's variance and cost — which is precisely why **caching, source transparency, ranges, and the no-data fallback are not optional polish; they are the controls that make the on-demand approach trustworthy.**

---

## Sources

- [Clear Estimates — locally adjusted costs, 15,000+ items / 400 US areas](https://www.clearestimates.com/)
- [RSMeans Data Online — 970+ locations, 92,000+ line items](https://www.rsmeans.com/products/online)
- [RSMeans City Cost Index](https://www.rsmeans.com/rsmeans-city-cost-index)
- [Gordian — City Cost Index: Everything You Need to Know](https://www.gordian.com/resources/city-cost-index-everything-need-know/)
- [NEDES — How to Use RSMeans for Zip Code-Based Pricing](https://nedesestimating.com/how-to-use-rsmeans-for-zip-code-based-pricing/)
- [Projul — Live Construction Costs by County](https://projul.com/features/live-construction-costs/)
- [Construction Estimator (Capterra) — 400 US markets, ZIP-based](https://www.capterra.com/p/10040049/Construction-Estimator/)
- [Homewyse — Where does Homewyse get its cost data?](https://www.homewyse.com/reference/where_does_homewyse_get_cost_data.html)
- [Homewyse — How accurate are Homewyse estimates? (Lower–Higher labor range)](https://www.homewyse.com/reference/how_accurate_are_homewyse_estimates.html)
- [Housecall Pro × Profit Rhino flat-rate price book guide](https://help.housecallpro.com/en/articles/8754493-profit-rhino-with-housecall-pro-a-complete-guide)
- [Housecall Pro — Price Book feature](https://www.housecallpro.com/features/price-book/)
- [Jobber vs Housecall Pro 2026 comparison (flat-rate gap)](https://www.getjobber.com/comparison/jobber-vs-housecall-pro/)
- [Towards Data Science — Grounding LLMs with Fresh Web Data to Reduce Hallucinations](https://towardsdatascience.com/grounding-llms-with-fresh-web-data-to-reduce-hallucinations/)
- [Firecrawl — Reduce hallucinations in search-grounded LLM responses (caching/TTL, citations)](https://www.firecrawl.dev/glossary/web-search-apis/reduce-hallucinations-search-grounded-llm-responses)
- [AiBrain — LLM Grounding in 2026: Options, Hidden Costs, Risks (double-synthesis token cost, cache poisoning)](https://www.askaibrain.com/en/posts/llm-grounding-guide-2026-options-hidden-costs-and-risks)

---
*Feature research for: Researched/regional market pricing for AI estimate generation (Xtimator v4.6)*
*Researched: 2026-06-23 · Confidence: MEDIUM-HIGH*
