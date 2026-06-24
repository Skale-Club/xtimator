# Phase 108: Orchestrator + Service Integration (the payoff) - Context

**Gathered:** 2026-06-24
**Status:** Ready for planning
**Mode:** Auto-generated (autonomous; milestone decisions locked in REQUIREMENTS.md + research/ARCHITECTURE.md + research/PITFALLS.md)

<domain>
## Phase Boundary

THE PAYOFF — the originating "Couch cleaning 8seats → $0 → blocked as vague" bug is actually fixed here. Wire price research into the shared generation core so the persisted estimate carries real regional numbers BEFORE the vagueness gate sees it. Compose Phase 106 (cache) + Phase 107 (provider seam) into an orchestrator, call it from `generateEstimateForProject` immediately after `anchorAndClampSections`, enforce precedence + evidence-gating + a never-$0 fallback ladder, meter via the existing quota, fix the vagueness gate to distinguish a fully-empty estimate from a single flagged-unpriced item, and lock the originating case as a regression fixture.

Scope: RPRICE-01, RPRICE-03 (full runtime precedence), RPRICE-04, RFALL-01, RFALL-02, RFALL-03, RMETER-01, RMETER-02, RMETER-03.
</domain>

<decisions>
## Implementation Decisions

### Placement (load-bearing — from ARCHITECTURE.md)
- Enrich INSIDE `lib/services/generate-estimate.ts`, immediately AFTER `anchorAndClampSections` (~line 280) and BEFORE the server totals recalculation + persistence. This is the ONLY point where items are already tagged `price_book` vs `ai_estimate`, and it runs before the estimate is persisted/assessed — which is exactly why it fixes the `$0 → vague` bug (the `assess`/`isVagueEstimate` node runs on the PERSISTED estimate). A post-`assess` graph node would fire too late. Serving it here covers all 3 channels (the service is the shared core).
- New orchestrator `researchUnmatchedPrices(...)` in `lib/estimate/price-research/` (e.g. `orchestrator.ts` or `index.ts`) — channel-neutral, never-throws (mirrors the anchoring non-fatal contract). `generate-estimate.ts` calls it; a failure must never break generation.

### The research pass (precedence price_book > researched > ai_estimate)
- The candidate set = items STILL tagged `ai_estimate` after anchoring (price_book items are out of scope and never overwritten). An owner-edited item (price_source null) is never researched.
- For each candidate: `cache.get(companyId, normName, region, currency)` → on HIT use it (NO provider call, NO allowance consumed); on MISS and IF the quota allows → `provider.lookup(...)` (batched for the miss set), then `cache.put` the evidenced results.
- Region = client city+state (already on the project's client address); currency = the estimate currency.
- EVIDENCE-GATED tagging (RPRICE-04): an item is re-tagged `ai_estimate → researched` ONLY when the provider returned a usable evidenced price (`isUsableCandidate`: real source_url + snippet + positive price). No evidence → the item KEEPS `ai_estimate` (never a fake `researched`).

### Never-$0 fallback ladder (RFALL-01)
- No rung is ever $0: `price_book` → `researched` → non-zero `ai_estimate` → "flagged unpriced" line.
- A line that still resolves to $0 after research (model gave $0 / no evidence / over-quota) is a "flagged unpriced item" routed to the EXISTING `awaiting_details` surfacing — NOT silently $0, and NOT blocking the whole estimate when other items are priced.

### Vagueness-gate fix (RFALL-02) — the Ellen rule, refined
- `lib/estimate/quality/vagueness.ts`: today `isVagueEstimate` returns vague when `total <= 0 OR no items`. Refine so it distinguishes:
  - **Whole estimate empty / nothing priced** (no items, or every item $0 → total 0) → STILL vague (block → needs-details).
  - **At least one priced item (total > 0) with a flagged unpriced item among others** → NOT vague (allow → estimate proceeds; the unpriced line is surfaced for the owner to fill).
- Net effect: "total > 0" already passes today; the refinement is ensuring a partially-priced estimate is never blocked just because one line is flagged, while a genuinely valueless ($0/empty) estimate still asks for details. Keep the change minimal and well-tested; do not regress the WhatsApp/needs-details paths.

### Metering (reuse existing quota — RMETER-01..03)
- Add a new count-based event type `price_researched` to `lib/quota.ts` (EventType union + the QUOTA mapping) — 1 unit per SEARCH (a provider.lookup call / per-item search), idempotent via a stable idempotency key (e.g. `${attemptId}:research:${normName}:${region}`).
- Add a per-tier monthly research allowance to `lib/entitlements.ts` (a new field, e.g. `maxPriceResearchPerMonth: number | null`), sized from the per-search cents cost (Free small, Business unlimited/null). Pick sane starting numbers (Claude's discretion, documented) — e.g. free: 50, trial: 200, pro: 1000, business: null.
- `checkQuota` gates research: over allowance → SKIP the provider call for remaining items (they fall to non-zero `ai_estimate`), the estimate still generates and NEVER hard-fails. A cache hit consumes NO allowance.
- Reuse `recordUsage` (idempotent insert) — do NOT build a new ledger.

### Regression fixture (RFALL-03)
- Add "Couch cleaning 8seats" (the originating case) to the eval harness (`tests/eval/`), driven by the Phase-107 fixture provider, asserting a NON-ZERO, NON-VAGUE estimate — INCLUDING the empty-research-response variant (provider returns no evidence → falls to non-zero ai_estimate / flagged, still non-vague when other context exists; and the all-empty variant still correctly blocks).

### Claude's Discretion
- Exact per-tier research allowance numbers (document them).
- The exact "non-zero floor" mechanism for an ai_estimate item that came back $0 (a flagged-unpriced marker vs a minimal floor) — pick the cleanest that satisfies "never $0, never silently block a partially-priced estimate".
- Orchestrator file name/shape; how the flagged-unpriced signal threads to the existing awaiting_details path.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `.planning/REQUIREMENTS.md` — RPRICE-01/03/04, RFALL-01/02/03, RMETER-01/02/03 + Locked decisions
- `.planning/research/ARCHITECTURE.md` — THE placement decision (enrich after anchorAndClampSections, before totals/persist); precedence-for-free; orchestrator shape
- `.planning/research/PITFALLS.md` — the $0/vague trap as the correctness contract; evidence-gated-not-step-gated; cost/quota; multi-tenant cache; determinism
- `lib/services/generate-estimate.ts` — the integration site (after `anchorAndClampSections` ~L276-293, before the totals recalculation ~L295+ and persistence ~L344+)
- `lib/ai/price-anchoring.ts` — `anchorAndClampSections` output (items tagged price_book vs ai_estimate) — the candidate-set boundary
- `lib/estimate/price-research/{provider,cache,normalize,schema}.ts` + `adapters/*` — Phase 106/107 building blocks to compose
- `lib/estimate/quality/vagueness.ts` — the gate to refine (current `isVagueEstimate`)
- `lib/quota.ts` — `checkQuota` / `recordUsage` / `EventType` / `QUOTA_TO_EVENT` (add `price_researched`)
- `lib/entitlements.ts` — `Entitlements` tiers (add a research allowance field)
- `lib/estimate/graph/nodes/assess.ts` + `decide.ts` — the vagueness assessment + auto-refine edges (do NOT change the graph topology; only the gate logic + the persisted estimate it reads)
- `tests/eval/fixtures/` + `tests/eval/price-research-source.test.ts` + `tests/eval/mock-providers.ts` — where the regression fixture + deterministic source injection live
- `components/workspace/needs-details-banner.tsx` + the `awaiting_details` path (Phase 102/96) — the existing surfacing for flagged-unpriced
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `generateEstimateForProject` (`lib/services/generate-estimate.ts`) — shared core for web/WhatsApp/MCP; the single integration point.
- `anchorAndClampSections` (`lib/ai/price-anchoring.ts`) — produces the price_book/ai_estimate tagging that defines the candidate set.
- `cache.get/put` + `normalizeRegion`/`normalizeServiceNameKey` (Phase 106) + `getPriceResearchProvider()` + `isUsableCandidate` (Phase 107) — compose these.
- `checkQuota`/`recordUsage`/`getEntitlements` (`lib/quota.ts`, `lib/entitlements.ts`) — the metering machinery.
- `isVagueEstimate` (`lib/estimate/quality/vagueness.ts`) + the auto-refine loop (Phase 96) + the `awaiting_details` web banner (Phase 102) — the surfacing the flagged-unpriced path reuses.
- The v4.5 eval harness (`tests/eval/`) driving the REAL graph against deterministic mocks — add the regression fixture here.

### Established Patterns
- Non-fatal/never-throw enrichment (anchoring swallows errors); server totals are the single authority; AI total never persisted.
- Channel-neutral estimate domain (ENGINE-01 — no channel import in the orchestrator).
- Idempotent `recordUsage`; quota gating returns `{allowed, remaining}`.

### Integration Points
- `generate-estimate.ts` gains ~one orchestrator call after anchoring; `vagueness.ts` gate refined; `quota.ts`+`entitlements.ts` gain the research event/allowance; eval gains the regression fixture. Phase 109 later isolates research into its own `step.run` + adds runtime provider fallback ordering + caps.
</code_context>

<specifics>
## Specific Ideas

The single correctness invariant: **no fallback rung is ever $0, and a partially-priced estimate is never blocked**. The originating "Couch cleaning 8seats" case must become a green regression fixture (non-zero, non-vague) — including the empty-research variant. Evidence-gating stays internal (no source UI).
</specifics>

<deferred>
## Deferred Ideas

- Dedicated `step.run('price-research')` retry isolation, runtime OpenRouter→Anthropic fallback ordering, per-estimate item caps, refine-loop memoization → Phase 109.
- Admin UI for source/allowance config + markup → Future Requirements.
</deferred>
