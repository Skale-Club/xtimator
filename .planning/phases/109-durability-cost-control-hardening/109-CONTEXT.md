# Phase 109: Durability + Cost-Control Hardening - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous; final phase of v4.6)

<domain>
## Phase Boundary

Now that price research is wired and live (Phase 108), harden the path for durability + cost control WITHOUT changing its behavior contract. Keep it MINIMAL/foldable — only add what materially improves resilience/cost. Scope: hardening of RMETER-01..03 + the durability/cost concerns from research (no net-new requirement). Plus one carried-over cleanup the Phase-108 verifier surfaced: widen the document/PDF `DocumentItem.price_source` type to include `'researched'` so `next build` type-checks cleanly (a Phase-105 threading gap).

The whole feature MUST remain non-fatal (never-throw): every hardening path preserves the contract that a slow/failed/capped research step never blocks or fails the estimate.
</domain>

<decisions>
## Implementation Decisions

### 1. `next build` cleanup (carried from 108 verification — do FIRST, it can break the Docker build)
- `components/workspace/estimate/estimate-document.tsx` (~L274): widen `DocumentItem.price_source` from `'price_book' | 'ai_estimate' | null` to also include `'researched'`. One-line union widening. `next.config.ts` does NOT set `ignoreBuildErrors`, so this currently fails `next build` type-checking now that researched items occur. Verify a scoped `tsc` (and ideally `next build` typecheck) is clean after. Also sweep for any OTHER `price_source` union in the document/PDF/share render path that still omits `'researched'`.

### 2. Per-estimate research item CAP (cost control)
- Add a bounded cap on how many unmatched items are researched per estimate (e.g. a module const like `MAX_RESEARCH_ITEMS_PER_ESTIMATE`, optionally env-overridable mirroring `AUTO_REFINE_MAX_ATTEMPTS`). Items beyond the cap degrade to non-zero `ai_estimate` (never $0). Log/flag what was dropped (no silent truncation). This bounds worst-case cost + latency per estimate.

### 3. Runtime provider fallback ordering (OpenRouter-web → Anthropic quality fallback)
- Mirror the existing AI provider-fallback ordering: when the PRIMARY source (OpenRouter-web) returns NO evidence for the batch (or errors), attempt the GATED Anthropic quality-fallback before degrading items to `ai_estimate`. Keep it never-throw and gated (Anthropic only if configured/available). This is the runtime ordering Phase 107 deferred (Phase 107 made both adapters exist + selectable; this wires the fallback sequence).

### 4. `step.run` retry isolation (durability) — ONLY if cleanly achievable via the existing StepRunner seam
- Give research its own retry unit so a research-source timeout retries the research alone without re-invoking the already-succeeded LLM generate step. Use the EXISTING `StepRunner` seam (`runner.run('price-research', …)`) threaded from the generate path — do NOT add a LangGraph checkpointer (v4.3 locked: Inngest is the sole durability layer). If threading a real StepRunner into `generateEstimateForProject` is too invasive for this phase, KEEP the inline never-throw call and document the deferral rather than forcing a risky refactor — the inline call is already non-fatal.

### 5. Refine-loop memoization
- Memoize research results per `(normalizedName, region)` WITHIN a single generation run so the Phase-96 auto-refine loop (which re-runs generate) does not re-pay for the same lookups. The Phase-106 cache (30d TTL, DB) already covers cross-run repeats; this is an in-run memo to avoid even the cache round-trip / double-metering inside one attempt. Lightweight (an in-memory map for the run).

### Claude's Discretion
- Whether items 3/4/5 each warrant a plan or can be folded — keep the phase MINIMAL. Item 1 (build fix) + item 2 (cap) are the highest-value, lowest-risk; do those for sure. Items 3-5 add resilience but must not risk the working 108 wire — fold or defer any that would require a risky refactor, and document the deferral in the phase summary.
- Exact cap numbers + env var name.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/REQUIREMENTS.md` — RMETER-01..03 (this phase hardens them; no net-new requirement)
- `.planning/research/ARCHITECTURE.md` — "ship inline + never-throw first, promote to its own step.run once latency is measured"; StepRunner reuse
- `.planning/research/PITFALLS.md` — cost/rate-limit, latency, provider fallback, no-silent-caps
- `lib/estimate/price-research/orchestrator.ts` — where the cap + fallback ordering + in-run memo live
- `lib/estimate/price-research/provider.ts` + `adapters/openrouter-web.ts` + `adapters/anthropic-web.ts` — the primary + gated-fallback adapters to sequence
- `lib/services/generate-estimate.ts` — the call site (StepRunner threading, if pursued)
- `lib/estimate/graph/nodes/generate.ts` + `lib/estimate/graph/types.ts` — the `StepRunner` seam (`runner.run('ai-generate', …)`) to mirror for `'price-research'`
- `lib/estimate/graph/nodes/decide.ts` — the `AUTO_REFINE_MAX_ATTEMPTS` env-override pattern to mirror for the item cap
- `components/workspace/estimate/estimate-document.tsx` — the `DocumentItem.price_source` union to widen (build fix)
- `.planning/phases/108-orchestrator-service-integration-the-payoff/108-VERIFICATION.md` — the flagged build-fix item
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AUTO_REFINE_MAX_ATTEMPTS` (`lib/estimate/graph/nodes/decide.ts`) — the env-overridable module-const pattern to mirror for the research item cap.
- The `StepRunner` seam (`runner.run(...)`, `lib/estimate/graph/types.ts` + `generate.ts`) — the durability primitive (passthrough by default) to optionally reuse for research retry isolation.
- The existing AI provider-fallback ordering (`lib/ai/provider-with-fallback.ts`) — the never-throw fallback pattern to mirror for OpenRouter-web → Anthropic.
- Phase-106 cache + Phase-107 adapters + Phase-108 orchestrator — the live pieces being hardened.

### Established Patterns
- Inngest is the sole durability layer (NO LangGraph checkpointer — v4.3 locked). Non-fatal/never-throw enrichment. No-silent-caps (log what's dropped).

### Integration Points
- All changes are internal to `lib/estimate/price-research/` + (optionally) the generate-estimate call site + the document-render type. No graph topology change; no admin UI (deferred).
</code_context>

<specifics>
## Specific Ideas

Do NOT risk the working Phase-108 wire. The phase is "minimal/foldable" by design — the build-fix + a cost cap are the must-dos; deeper durability (step.run isolation) should be folded or documented-as-deferred if it would require an invasive refactor. Every path stays never-throw.
</specifics>

<deferred>
## Deferred Ideas

- Admin UI for source/engine/allowance/spend-cap config + markup → Future Requirements.
- Source-citation / range / confidence UI → Future Requirements.
- A platform-wide (cross-tenant) cache tier → deferred (tenant-scoped first).
</deferred>
