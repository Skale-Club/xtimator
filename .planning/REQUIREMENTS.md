# Requirements — Milestone v4.6 Pricing Intelligence (Researched Pricing Agent)

**Defined:** 2026-06-23
**Status:** Approved — ready for roadmap

> **Goal:** When an estimate line item has no match in the company price book, a specialized step researches the average regional market price (client's city + state) and writes it with `price_source: 'researched'` — instead of the AI guessing a price that can come out $0 and trip the "too vague" gate. Delivers Pillar 2 (researched pricing) on top of the existing Pillar 1 (price-book priority via `anchorAndClampSections`).

> **Locked decisions (from discussion 2026-06-23):**
> - Search source: **OpenRouter web search** (primary provider), engine configurable `exa` (fixed ~$0.005/req) vs `native` (model's own search). Anthropic web search (`user_location`) as a gated quality fallback. Brave / dedicated pricing APIs / scraping rejected.
> - Region granularity: **city + state** (already on the client address) — also the cache key.
> - Markup/margin: **none in MVP** (deferred to admin config).
> - Cache scope: **per-tenant** (`company_id`).
> - Metering: **reuse the existing quota** (`usage_events` / `checkQuota` / `recordUsage`) with a new `price_researched` event type, **count-based** (1 unit/search), per-tier monthly allowance. No new credit/billing subsystem.
> - Source citations / ranges / confidence are NOT surfaced in the UI this milestone.

---

## v4.6 Requirements

### RPRICE — Researched Pricing Core

- [ ] **RPRICE-01**: For each estimate line item with no price-book match, the system researches an average regional market price using the client's city + state, instead of letting the AI guess.
- [x] **RPRICE-02**: A researched price is tagged `price_source: 'researched'` (distinct from `price_book` and `ai_estimate`), threaded through the output schema, persistence (`estimate_items.price_source` CHECK), and the estimate editor price badge.
- [x] **RPRICE-03**: Price precedence `price_book > researched > ai_estimate` is enforced — research runs only on no-match items, never overrides a price-book item, and never re-researches an item the owner has edited.
- [ ] **RPRICE-04**: An item is tagged `researched` only when the lookup returns real evidence (a source URL + snippet); without evidence it falls back to a non-zero `ai_estimate`. (Internal correctness gate — source data is not shown in the UI.)

### RSRC — Research Source / Provider

- [ ] **RSRC-01**: Price research runs through OpenRouter's web search (the primary AI provider), as a separate call ahead of the unchanged forced `create_estimate` call.
- [ ] **RSRC-02**: The search engine is configurable between `exa` (OpenRouter/Exa, fixed cost) and `native` (the model's own web search), behind a swappable `PriceResearchProvider` seam mirroring `getAIProviderWithFallback`.
- [ ] **RSRC-03**: Anthropic web search (with `user_location` city/state) is available as a pluggable quality-fallback source, gated and not the default.
- [ ] **RSRC-04**: The research source is seamed so a deterministic fixture adapter drives it in tests/CI (no live calls) — the v4.5 eval harness + CI regression gate stay green.

### RFALL — Fallback & Correctness (the $0 fix)

- [ ] **RFALL-01**: No fallback rung is ever $0 — research → non-zero `ai_estimate` → flagged unpriced item, never zero.
- [ ] **RFALL-02**: The vagueness gate distinguishes a fully empty estimate (block → needs-details) from a single flagged unpriced item (allow → estimate proceeds).
- [ ] **RFALL-03**: The originating "Couch cleaning 8seats" case is a regression fixture that produces a non-zero, non-vague estimate.
- [ ] **RFALL-04**: Web-search content is sanitized against prompt injection (reusing `sanitizeField` + a tagged `<search_result>` block + the `## Security` clause) before entering the LLM prompt.

### RMETER — Metering & Cost (reuse existing quota)

- [ ] **RMETER-01**: Each price-research search is metered through the existing usage system (`usage_events` / `recordUsage`) via a new `price_researched` event type, count-based (1 unit/search), idempotent.
- [ ] **RMETER-02**: Each tier gets a monthly price-research allowance in `entitlements`, sized from the per-search cost in cents.
- [ ] **RMETER-03**: `checkQuota` gates research; when a company is over its research allowance, research is skipped and items fall back to a non-zero `ai_estimate` — the estimate still generates and never hard-fails.

### RCACHE — Caching

- [x] **RCACHE-01**: Researched prices are cached in a new `price_research_cache` table keyed by (`company_id`, normalized service name, city + state), with service-role/deny-all RLS (the `pipeline_events` posture).
- [x] **RCACHE-02**: Cache entries expire after a TTL (~30 days); a cache hit reuses the price without a new search and without consuming the research allowance.

---

## Future Requirements (deferred)

- Source citations in the estimate UI ("researched from N sources" + links).
- Low / avg / high price range as captured metadata + display.
- Confidence indicator on researched prices.
- Admin-panel UI for source selection, engine choice, spend caps, and research on/off.
- Configurable markup / margin applied to researched prices.

---

## Out of Scope

- **Direct scraping** of HomeAdvisor / Angi / Yelp cost pages — ToS/legal exposure, brittleness, and a headless-browser dependency the project deliberately avoids.
- **In-house RSMeans-style priced database** — maintenance trap; on-demand research is the chosen mechanism.
- **In-house cost-of-living multiplier table** — direct city/state lookup is used instead.
- **A new cents-based credit wallet / billing subsystem** — explicitly reuse the existing count-based quota instead.
- **Silent auto-apply without review** — estimates remain user-editable; researched prices are a starting point.

---

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RPRICE-01 | Phase 108 | Pending |
| RPRICE-02 | Phase 105 | Complete |
| RPRICE-03 | Phase 108 | Complete |
| RPRICE-04 | Phase 108 | Pending |
| RSRC-01 | Phase 107 | Pending |
| RSRC-02 | Phase 107 | Pending |
| RSRC-03 | Phase 107 | Pending |
| RSRC-04 | Phase 107 | Pending |
| RFALL-01 | Phase 108 | Pending |
| RFALL-02 | Phase 108 | Pending |
| RFALL-03 | Phase 108 | Pending |
| RFALL-04 | Phase 107 | Pending |
| RMETER-01 | Phase 108 | Pending |
| RMETER-02 | Phase 108 | Pending |
| RMETER-03 | Phase 108 | Pending |
| RCACHE-01 | Phase 106 | Complete |
| RCACHE-02 | Phase 106 | Complete |
