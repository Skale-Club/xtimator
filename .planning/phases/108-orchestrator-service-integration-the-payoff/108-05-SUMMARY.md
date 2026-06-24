---
phase: 108-orchestrator-service-integration-the-payoff
plan: 05
subsystem: eval-harness / price-research regression
tags: [price-research, eval, regression, the-payoff, never-$0, RFALL-03, deterministic, fixture-provider]
requires:
  - lib/services/generate-estimate.ts (the live researchUnmatchedPrices wire — Plan 108-04)
  - lib/estimate/price-research/orchestrator.ts (researchUnmatchedPrices — Plan 108-03)
  - lib/estimate/price-research/adapters/fixture.ts (makeFixtureProvider + fixtureKey + FIXTURE_FIXED_NOW — Plan 107-03)
  - tests/eval/fixtures/price-research.ts (PRICE_RESEARCH_FIXTURES — Plan 107-03)
  - tests/eval/{harness.test.ts,mock-providers.ts,metrics.ts,fixtures/cases.ts} (the v4.5 eval harness — Phase 103)
  - lib/estimate/quality/vagueness.ts (the refined gate — Plan 108-02)
provides:
  - "RFALL-03: 'Couch cleaning 8 seats' is a green full-graph regression — the originating $0/vague bug is locked as fixed end-to-end"
  - "EVIDENCED variant: fixture provider re-tags the $0 couch line researched $180 → persisted grandTotal>0 AND isVague===false"
  - "EMPTY-research+context variant: couch misses (keeps ai_estimate $0, flagged) but a non-zero ai_estimate line keeps total>0/non-vague (the never-$0 ladder)"
  - "ALL-EMPTY variant: only the $0 couch line + a research miss → total 0, isVague===true (the vagueness gate still blocks — not over-relaxed)"
  - "Deterministic: the Phase-107 fixture provider + fixed clock + a live-network tripwire drive the regression; zero live network"
affects:
  - "Phase 108 COMPLETE (5/5 plans) — the milestone's correctness contract is now gated end to end"
tech-stack:
  added: []
  patterns:
    - "Regression cases kept IN the regression test file (not cases.ts) so harness.test.ts's describe.each(CASES)/GRAPH_CASES counts are unchanged — the couch case needs the research-dep mocks that only this file installs"
    - "vi.mock(provider, importOriginal) spread to preserve the REAL isUsableCandidate evidence gate while overriding getPriceResearchProvider"
    - "Per-variant fixture map swapped via a runner arg + a mockResolvedValue on the provider seam (EVIDENCED uses PRICE_RESEARCH_FIXTURES; EMPTY/ALL-EMPTY use a couch-less map)"
key-files:
  created:
    - tests/eval/price-research-regression.test.ts
  modified: []
decisions:
  - "Regression cases live in the test file, NOT tests/eval/fixtures/cases.ts. Adding them to CASES would run the couch line through harness.test.ts WITHOUT this file's price-research mocks (cache/quota/provider) and alter its describe.each(CASES)/GRAPH_CASES counts + assertions. The plan explicitly allowed this (Claude's discretion). cases.ts is therefore byte-identical."
  - "The CACHE is mocked to a forced MISS (get→null/put→noop) rather than served through the chainable supabase mock — cache.ts calls requireServiceClient() directly and the harness's default chainable mock has no .maybeSingle(); a clean module mock is the deterministic way to force the provider path."
  - "The provider seam is mocked with importOriginal+spread so the REAL isUsableCandidate evidence gate still runs (the fixture provider returns ungrounded entries as misses by data, and the gate rejects citation-less results) — only getPriceResearchProvider is overridden to return the deterministic fixture adapter."
  - "default_tax_rate 0 on the company fixture so the persisted grandTotal equals the subtotal — clean $180 / $90 / $0 assertions with no tax arithmetic."
  - "The case item description is the SPACED 'Couch cleaning 8 seats' (NOT '8seats'): the orchestrator re-associates results by item.description and the fixture is keyed via fixtureKey('Couch cleaning 8 seats', {Austin,TX}); normalizeNameForMatch collapses whitespace but does not remove the space, so the unspaced form would silently miss."
metrics:
  duration_minutes: 5
  completed: 2026-06-24
  tasks: 1
  files: 1
  commits: 1
---

# Phase 108 Plan 05: "Couch cleaning 8 seats" Full-Graph Regression Fixture Summary

RFALL-03 lands: the originating "Couch cleaning 8 seats → $0 → blocked as vague" bug
is now locked as a green FULL-GRAPH regression. The new
`tests/eval/price-research-regression.test.ts` drives the REAL canonical estimate
graph (`buildEstimateGraph → ingest → generate(generateEstimateForProject) → research
→ totals → persist → assess`) against the deterministic Phase-107 fixture provider
under a fixed clock with ZERO live network, asserting the milestone's correctness
contract across three variants. Phase 108 is COMPLETE (5/5 plans).

## What Shipped

**Task 1 — the gated full-graph regression test** (commit `cf1bedd`)
- `tests/eval/price-research-regression.test.ts` (collected by the
  `tests/eval/**/*.test.ts` include glob — proven 1 file / 3 tests, not "No test
  files found"). Mirrors `harness.test.ts`'s full-graph structure:
  - `vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 })` (heavy-graph import
    latency, 103-01).
  - Mocks the AI provider seam (`getAIProviderWithFallback → makeMockProvider` keyed
    by the active case), `transcribe/analyze` stubs, `queries/recording+photo`,
    `next/cache`, and the service client.
  - **CRUCIAL override:** the `makeSupabaseMock` `projects` client is
    `{ city:'Austin', state:'TX' }` so research has a region; `company_price_book` is
    EMPTY so the couch line stays `ai_estimate` after anchoring; `default_tax_rate 0`
    so grandTotal == subtotal.
  - Mocks the price-research deps the orchestrator composes:
    `@/lib/estimate/price-research/provider` (`importOriginal`+spread → keeps the REAL
    `isUsableCandidate`; `getPriceResearchProvider` returns the runner-selected fixture
    adapter), `@/lib/estimate/price-research/cache` (`get→null` / `put→noop` → forces
    the provider path), `@/lib/quota` (`checkQuota→{allowed:true,remaining:50}` /
    `recordUsage→noop`).
  - **Live-network tripwire:** `vi.stubGlobal('fetch', () => { throw … })` +
    `afterEach(vi.unstubAllGlobals)` — the fixture path makes zero network calls.
  - Three variants through `runCaseWithFixtures(case, fixtures)`:
    - **Test 1 EVIDENCED:** single `$0` ai_estimate "Couch cleaning 8 seats" +
      `PRICE_RESEARCH_FIXTURES` → orchestrator re-tags it `researched` `$180` →
      `grandTotal === 180`, `isVague === false`, `lineItemCount === 1`. The bug fixed.
    - **Test 2 EMPTY-research + context:** same couch `$0` line + a non-zero
      `ai_estimate` "Stain treatment" `$90`, over a COUCH-LESS fixtures map → couch
      misses (keeps `ai_estimate` `$0`, flagged), but `grandTotal === 90`,
      `isVague === false`, `lineItemCount === 2` (the never-$0 ladder falls to the
      non-zero ai_estimate).
    - **Test 3 ALL-EMPTY:** ONLY the `$0` couch line + the couch-less map → couch
      misses → `grandTotal === 0`, `isVague === true` (the vagueness gate still
      blocks → needs-details; not over-relaxed).

## Verification

- `npx vitest run tests/eval/price-research-regression.test.ts` → **1 file / 3 passed**.
- `npx vitest run tests/eval` → **4 files / 28 passed** (was 3/25 at the 107-03
  baseline; +1 file / +3 — `harness.test.ts` unaffected, its CASES/GRAPH_CASES counts
  unchanged).
- FULL `npx vitest run` → **275 files passed | 3 skipped, 1924 passed | 2 skipped |
  33 todo** (was 274/1921 at the 108-04 baseline; +1 file / +3 assertions — no
  regressions).
- `npx tsc --noEmit` → clean on `tests/eval/price-research-regression.test.ts` (the
  remaining repo-wide tsc errors are the long-standing pre-Phase-108 tsconfig/
  strictness mismatches logged to `deferred-items.md`; CI uses scoped
  `tsconfig.ci.json` — NONE from this plan).
- Acceptance grep:
  `grep -c "Couch cleaning 8seats\|Couch cleaning 8 seats" tests/eval/price-research-regression.test.ts`
  = 6 (>= 1).
- Zero live network: the `fetch` tripwire never fires (the provider is the fixture
  adapter; the cache is a forced miss; quota is mocked).
- gitleaks ran on the commit (normal hooked commit — NO `--no-verify`) — no leaks
  found (synthetic case JSON + the Phase-107 `*.test` placeholder URLs only).

## Deviations from Plan

### Auto-fixed Issues

None — plan executed as written within Claude's documented discretion.

The one structural choice the plan explicitly delegated: the regression cases live in
the test file rather than `tests/eval/fixtures/cases.ts`. Adding them to `CASES` would
run the couch line through `harness.test.ts` WITHOUT this file's price-research mocks
and alter its `describe.each(CASES)`/`GRAPH_CASES` counts + assertions. The plan
allowed this ("keep the regression-only cases in the regression test file … if adding
to CASES would alter harness.test.ts counts — Claude's discretion, document which").
`cases.ts` is therefore byte-identical (`git diff` empty for it). The plan's
`files_modified` listed `cases.ts`; it was intentionally left untouched per that clause.

## Deferred Issues (out of scope — NOT caused by this plan)

The repo-wide `npx tsc --noEmit` still reports the long-standing pre-Phase-108
tsconfig/strictness errors in unrelated files (already logged to `deferred-items.md`;
CI uses scoped `tsconfig.ci.json`). None are in this plan's file.

## Known Stubs

None. The regression drives the REAL production generation path (the live 108-04 wire
→ the 108-03 orchestrator → the never-$0 ladder → the refined 108-02 vagueness gate).
The only mocked seams are the deterministic test boundaries that keep the eval gate
network-free (AI provider, raw ingestion, service client, the price-research
cache/quota/provider — replaced by the Phase-107 deterministic fixture adapter).

## Self-Check: PASSED
- FOUND: tests/eval/price-research-regression.test.ts
- FOUND commit: cf1bedd
