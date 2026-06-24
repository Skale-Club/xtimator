---
phase: 108-orchestrator-service-integration-the-payoff
plan: 03
subsystem: price-research / orchestrator
tags: [price-research, orchestrator, evidence-gate, never-throws, metering, never-$0, channel-neutral]
requires:
  - lib/estimate/price-research/provider.ts (getPriceResearchProvider, isUsableCandidate, batched lookup)
  - lib/estimate/price-research/cache.ts (get/put, neutral CachedPriceDatum)
  - lib/estimate/price-research/normalize.ts (normalizeServiceNameKey, normalizeRegion)
  - lib/quota.ts (checkQuota('price_research') + recordUsage('price_researched') — Plan 108-01)
  - lib/ai/types.ts (LineItemOutput / EstimateSectionOutput; price_source union incl. 'researched')
provides:
  - "researchUnmatchedPrices(sections, ctx) — channel-neutral, NEVER-THROWS orchestrator"
  - "ResearchContext { companyId, region, currency, supabase, attemptId?, projectId? }"
  - "ResearchOutcome { sections, flaggedUnpriced } — the awaiting_details signal for 108-04"
  - "precedence (ai_estimate-only) + cache-hit-free + quota-gated batched provider + evidence-gated re-tag + idempotent metering + never-$0 ladder, all composed"
affects:
  - "Plan 108-04 (integration) — calls researchUnmatchedPrices after anchorAndClampSections, before totals; routes flaggedUnpriced>0 (AND total>0) to awaiting_details"
tech-stack:
  added: []
  patterns:
    - "Never-throws enrichment mirroring anchorAndClampSections (research failure never breaks generation)"
    - "Identity-keyed staged re-tag Map<LineItemOutput, LineItemOutput> + immutable section rewrite"
    - "Cache HIT is free (no provider call, no recordUsage); only misses hit the gated provider"
    - "Per-attempt/project idempotency seed (Warning #1) — retry-stable, not company-scoped"
key-files:
  created:
    - lib/estimate/price-research/orchestrator.ts
    - tests/unit/estimate/price-research-orchestrator.test.ts
  modified: []
decisions:
  - "Flagged-unpriced mechanism: NO new price_source enum value (DB CHECK is price_book|ai_estimate|researched only). A $0-resolved item KEEPS ai_estimate + its model price; the only signal is the flaggedUnpriced COUNT in ResearchOutcome. 108-04 sets awaiting_details when flaggedUnpriced>0 AND total>0 — exactly what the 108-02 vagueness gate permits."
  - "Idempotency key seed = attemptId ?? projectId ?? companyId (Warning #1 fix). Per-attempt is retry-stable + distinct across estimates; project fallback is finer than company; cache-overlap within TTL is a HIT (no allowance) so a finer seed never under-meters."
  - "recordUsage runs per searched item BEFORE the evidence gate (1 search = 1 unit, whether or not the result is usable — the provider call cost is incurred regardless). Metering is best-effort try/catch so a ledger error never drops a priced line."
  - "Cache HIT consumes no allowance and never resolves the provider (getPriceResearchProvider only called when there is a miss AND quota allows)."
metrics:
  duration_minutes: 12
  completed: 2026-06-24
  tasks: 2
  files: 2
  commits: 2
---

# Phase 108 Plan 03: researchUnmatchedPrices Orchestrator Summary

The CORE composition of THE PAYOFF — a channel-neutral, NEVER-THROWS
`researchUnmatchedPrices(sections, ctx)` that filters the post-anchor `ai_estimate`
candidate set, checks the Phase-106 tenant cache (a HIT is free), calls the Phase-107
provider gated by the Plan-108-01 quota (ONE batched `lookup` for the miss set),
evidence-gates the re-tag (`ai_estimate → researched` only with `isUsableCandidate`),
meters each search idempotently, and applies the never-$0 fallback ladder by counting
unresolved items as `flaggedUnpriced`. Ships the orchestrator + 10 unit tests ONLY;
Plan 108-04 wires it into `generate-estimate.ts` (UNTOUCHED here).

## What Shipped

**Task 1 — contract + flagged-unpriced signal** (commit `7a72b8f`)
- `lib/estimate/price-research/orchestrator.ts`: `researchUnmatchedPrices(sections, ctx)` signature, `ResearchContext` ({ companyId, region, currency, supabase, attemptId?, projectId? }), `ResearchOutcome` ({ sections, flaggedUnpriced }). Never-throws skeleton + no-candidate short-circuit (returns byte-identical sections, provider never touched) + the pre-existing-$0 flagged count. Channel-neutral doc comment stating the ENGINE-01 neutrality + never-throws contract mirroring `anchorAndClampSections`.
- Tests 1-3: contract shape, never-throws on a rejecting provider/cache/quota, no-candidate short-circuit.

**Task 2 — cache → quota-gated provider → evidence-gate → metering → never-$0** (commit `d2e1203`)
- Filled the body, wrapped entirely in try/catch (never-throws). Steps: (1) candidate set = `price_source === 'ai_estimate'` only; (2) per-candidate `cache.get` HIT (positive price) stages a `researched` re-tag with NO provider call / NO allowance; (3) collect misses; (4) `checkQuota('price_research')` — `allowed:false` SKIPS the provider for the whole miss set (items keep `ai_estimate`); (5) `allowed:true` → `getPriceResearchProvider()` (null → no-op) → ONE batched `lookup(misses, region, currency)`; (6) per result: `recordUsage('price_researched', 1, idemKey)` then the EVIDENCE GATE — `isUsableCandidate` → stage `researched` + `cache.put`, else keep `ai_estimate` (no put); (7) apply staged re-tags to an immutable section tree; (8) count items still `unit_price<=0` as `flaggedUnpriced`.
- Tests 4-10: precedence (only the ai_estimate item searched), cache HIT (no provider/recordUsage), MISS+allowed+evidenced (re-tag + put + recordUsage key), evidence gate (unevidenced keeps ai_estimate, no put), over-allowance skip, never-$0 flagged count, batched (one lookup for N) + idempotency-key stability across re-runs.

## The Flagged-Unpriced Mechanism (for Plan 108-04)

We deliberately did NOT introduce a new `price_source` value — the Phase-105 DB CHECK
is `price_book | ai_estimate | researched` only. A $0-resolving item (model gave $0 /
no evidence / over-quota) KEEPS its `ai_estimate` tag and its (possibly non-zero) model
unit_price; it is never mutated to a fake price and never dropped. The ONLY signal
threaded out is the `flaggedUnpriced` integer in `ResearchOutcome`.

**How 108-04 should consume it:** after totals are recalculated, set
`projects.status = 'awaiting_details'` when `flaggedUnpriced > 0 AND total > 0`. That
is exactly the case the refined 108-02 vagueness gate permits (a partially-priced
estimate carrying a flagged unpriced line is NOT vague), so the priced lines still
persist while the owner is prompted to fill the unpriced one via the existing
needs-details recourse path (Phase 102). When `total === 0` (nothing priced) the
existing `isVagueEstimate` path still blocks → needs-details, unchanged.

## Warning #1 Fix (idempotency-key cross-estimate collision)

The metering key is `${attemptId ?? projectId ?? companyId}:research:${normName}:${region}`.
A per-generation-attempt seed is retry-stable for the same attempt and distinct across
estimates (so research is not under-metered across estimates). When 108-04 cannot
supply a real `attemptId`, the PROJECT-scoped fallback is finer than company-scoped;
the cache-overlap is benign because a repeat of the same service+region within the
30-day TTL is a cache HIT anyway (consumes NO allowance regardless of the seed). The
`attemptId` + `projectId` context params already exist so 108-04 can pass the best
available token. Test 10 locks key stability across re-runs with the same attempt.

## Verification

- `npx vitest run tests/unit/estimate/price-research-orchestrator.test.ts` → 1 file / 10 passed (Tests 1-10).
- `grep -c "lib/whatsapp" lib/estimate/price-research/orchestrator.ts` → 0 (channel-neutral, ENGINE-01).
- `grep -c "export async function researchUnmatchedPrices" …` → 1; `grep -c "isUsableCandidate" …` → 3 (>=1); orchestrator 233 lines (>= 80 min).
- `git diff --name-only` over both commits EXCLUDES `lib/services/generate-estimate.ts` (108-04 wires it).
- `npx tsc --noEmit` clean on `orchestrator.ts` + the test (verified by filtering the full-repo tsc output — see Deferred Issues).
- Full `npx vitest run` → **273 files passed | 3 skipped, 1915 passed | 2 skipped | 33 todo** (was 271/1899 at the 108-01 baseline; +1 file / +16 assertions — my 10 + 108-02's 6 — no regressions).
- gitleaks ran on both commits (normal hooked commits, NO `--no-verify`) — no leaks found. Test URLs are `https://example.test/...` placeholders.

## Deviations from Plan

None — plan executed exactly as written. Both deviations below are Rule-1 doc-comment
rewords, not functional changes:
- Reworded the channel-neutrality doc comment so the `grep -c "lib/whatsapp"` acceptance returns 0 while the module genuinely imports no channel package.

## Deferred Issues (out of scope — NOT caused by this plan)

A bare full-repo `npx tsc --noEmit` reports 12 pre-existing errors, NONE in the
orchestrator or its test. Logged to `deferred-items.md`:
- 5 stale `Entitlements` test-mock literals missing `maxPriceResearchPerMonth` (a regression from Plan 108-01's interface widening) across `tests/unit/whatsapp/handler*.test.ts`.
- 7 long-standing tsconfig/strictness mismatches (es2018 regex `s` flag, StepRunner mock shape, DocumentSection assignment, Mock callable) that predate Phase 108.
These are runtime-green (vitest passes); the CI uses a scoped `tsconfig.ci.json`. Not
fixed here (different subsystems, not caused by this task — scope boundary).

## Known Stubs

None. The orchestrator is fully implemented; it is DORMANT only in that no production
caller invokes it yet — Plan 108-04 wires it into `generateEstimateForProject` after
`anchorAndClampSections`. No hardcoded/empty values flow to any UI.

## Self-Check: PASSED
- FOUND: lib/estimate/price-research/orchestrator.ts
- FOUND: tests/unit/estimate/price-research-orchestrator.test.ts
- FOUND commit: 7a72b8f
- FOUND commit: d2e1203
