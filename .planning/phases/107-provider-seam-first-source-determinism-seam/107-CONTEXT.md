# Phase 107: Provider Seam + First Source + Determinism Seam - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous; milestone decisions locked in REQUIREMENTS.md + research/STACK.md)

<domain>
## Phase Boundary

Put the price-research SOURCE behind a swappable `PriceResearchProvider` port resolved from `platform_integrations`, with: a real **OpenRouter-web** adapter (engine configurable `exa` | `native`), a gated **Anthropic** quality-fallback adapter (`user_location` city/state), AND a deterministic **fixture** adapter the v4.5 eval harness injects so CI stays green. Every web snippet that reaches the LLM is injection-hardened in this same phase. NOTHING is wired into the estimate pipeline yet (Phase 108 does that) — this phase ships the seam + adapters + fixtures, unit-tested in isolation. Scope: RSRC-01, RSRC-02, RSRC-03, RSRC-04, RFALL-04.

NO user-facing UI in this phase (it is provider/adapter plumbing + admin-config resolution; the admin UI for source selection is a deferred Future Requirement).
</domain>

<decisions>
## Implementation Decisions

### The port (mirror `getAIProviderWithFallback`)
- New `lib/estimate/price-research/provider.ts` (or `index.ts`): a `PriceResearchProvider` interface with a **batched** contract `lookup(items, region, currency) → Promise<PriceResearchResult[]>`, one call for all unmatched items. The per-item-vs-batched concern stays INTERNAL to the adapter.
- `getPriceResearchProvider()` reads the active source from `platform_integrations` (via `getIntegrationKey`/the existing admin-config pattern) and returns a provider — or **`null` when unconfigured** so the Phase-108 enrichment becomes a safe no-op (mirror the `getXphereConfig()`/Stripe-Connect degrade pattern).
- A result is **evidence-gated by contract**: an item is returned as *researchable* (a usable price) ONLY when a real `source_url` + snippet is present. A citation-less guess is NOT returned as researched (Phase 108 then falls it to a non-zero ai_estimate). Shape ≈ `{ name, unit_price, currency, source_url, snippet, confidence? }` or a miss.

### OpenRouter-web adapter (PRIMARY — same key/billing as the main provider)
- Runs price research as a **SEPARATE OpenRouter call** ahead of the unchanged forced `create_estimate` call (do NOT combine a forced `tool_choice:create_estimate` with `web_search` in one turn — undocumented/unreliable per STACK.md). Plain `fetch` via the existing OpenRouter path + `getIntegrationKey('openrouter')` — NO new dependency, NO new credential.
- Web search via `tools: [{ type: 'openrouter:web_search', engine: <ENGINE> }]` where ENGINE is **configurable** between `'exa'` (fixed ~$0.005/req) and `'native'` (the model's own web search; provider-determined cost). Default `'exa'`. (NOT the deprecated `:online` suffix / `plugins:[{id:'web'}]` form.)
- The model is asked to return, per unmatched item, an average US market price for that service in the client's city+state WITH the supporting source_url + snippet; validate the payload with a zod schema before returning (mirror `estimateOutputSchema`/`normalizeOutput` discipline — never trust a raw model number).

### Anthropic quality-fallback adapter (GATED, non-default)
- Uses `@anthropic-ai/sdk` (already a dependency) `web_search` tool with `user_location: { city, region: state, country: 'US' }` — the strongest regional grounding. Wired as a pluggable, GATED, non-default source (Anthropic is the fallback vendor; do not invert the hierarchy). Selected only via config / when OpenRouter-web is unavailable.

### Determinism seam (keeps the v4.5 eval harness green)
- A deterministic **fixture adapter** + golden `(service, region) → candidates` fixtures + a **fixed clock**, so tests/CI drive the source with ZERO live network calls. The v4.5 eval harness + CI regression gate must run green against it. The port is the injection point (mirror how `getAIProviderWithFallback` is mocked in tests/eval/mock-providers.ts).

### Injection hardening (RFALL-04)
- Web-search content is sanitized through the EXISTING `sanitizeField` and wrapped in a NEW `<search_result>` tag, enumerated in the `buildSystemPrompt` `## Security` block, before entering ANY prompt. A static test asserts research prompts are built through this hardened boundary (not an ad-hoc string concat). Reuse the existing pattern in `lib/ai/prompt-builder.ts` — do NOT invent a parallel path.

### Claude's Discretion
- Exact module file split under `lib/estimate/price-research/` (provider.ts vs adapters/*.ts).
- The exact zod schema for the research payload; the exact OpenRouter request body for the search call (follow STACK.md + current OpenRouter docs).
- How `platform_integrations` encodes the chosen source + engine (reuse the existing integrations-provider config shape).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/REQUIREMENTS.md` — RSRC-01..04, RFALL-04 + Locked decisions
- `.planning/research/STACK.md` — the VERIFIED OpenRouter web-search contract (engine exa/native, $0.005/req, separate-call requirement, deprecated forms to avoid), the Anthropic `user_location` fallback, current pricing/limits
- `.planning/research/ARCHITECTURE.md` — the `PriceResearchProvider` seam mirroring `getAIProviderWithFallback`; null-provider safe no-op
- `.planning/research/PITFALLS.md` — evidence-gating (not step-gating), prompt-injection-from-web-content, determinism/eval-flakiness, cost/rate-limit
- `lib/ai/provider-with-fallback.ts` — the seam shape to mirror (`getAIProviderWithFallback`)
- `lib/ai/providers/openrouter.ts` — the existing OpenRouter fetch path + forced create_estimate (the call the research must precede, NOT combine with)
- `lib/ai/prompt-builder.ts` — `sanitizeField` + the `## Security` block to extend with `<search_result>`
- `lib/ai/schema.ts` / `lib/ai/normalize.ts` — the zod-validate-before-trust discipline for the research payload
- `lib/platform-config.ts` (`getIntegrationKey`) + `lib/admin/integrations-providers.ts` — admin-config source resolution
- `tests/eval/mock-providers.ts` — how the AI provider seam is mocked deterministically in the eval harness (mirror for the research source)
- `lib/estimate/price-research/{cache,normalize}.ts` — Phase 106 cache module (Phase 108 composes cache + provider; this phase need not call the cache)
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `getAIProviderWithFallback` / `getAIProvider` (`lib/ai/provider-with-fallback.ts`, `lib/ai/provider.ts`) — exact seam shape to mirror for `getPriceResearchProvider`.
- OpenRouter `fetch` adapter (`lib/ai/providers/openrouter.ts`) + `getIntegrationKey('openrouter')` — reuse for the search call.
- `@anthropic-ai/sdk` already present (Whisper/Claude paths) — for the Anthropic `web_search` fallback adapter.
- `sanitizeField` + `## Security` block (`lib/ai/prompt-builder.ts`) — extend for `<search_result>`.
- `tests/eval/mock-providers.ts` + `tests/eval/fixtures/` — the deterministic-mock pattern to mirror for the fixture adapter.

### Established Patterns
- Provider key resolution via `platform_integrations` (encrypted, runtime-configurable, zero env vars).
- zod-validate every model payload before trusting it (GUARD-01).
- Channel-neutral estimate domain in `lib/estimate/` (ENGINE-01 neutrality — the research module must not import a channel module).

### Integration Points
- Phase 108 calls `getPriceResearchProvider()` + the cache inside `generateEstimateForProject` after anchoring. This phase only ships the port + adapters + fixtures + hardening; it does NOT modify `generate-estimate.ts`.
</code_context>

<specifics>
## Specific Ideas

The single most important contract: **evidence-gated tagging** — the provider returns a usable researched price ONLY with a real source_url + snippet, so a hallucinated guess can never later be surfaced as `researched`. This is a correctness gate, not a UI feature (no source citations are shown to users this milestone).
</specifics>

<deferred>
## Deferred Ideas

- Admin-panel UI for choosing the source/engine + spend caps — Future Requirement (deferred).
- Provider fallback ORDERING (OpenRouter-web → Anthropic) at runtime is Phase 109 hardening; this phase just makes both adapters exist + selectable.
</deferred>
