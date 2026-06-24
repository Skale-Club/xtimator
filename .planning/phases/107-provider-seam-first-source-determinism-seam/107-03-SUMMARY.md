---
phase: 107-provider-seam-first-source-determinism-seam
plan: 03
subsystem: price-research
tags: [provider-seam, determinism, fixture-adapter, fixed-clock, eval-harness, evidence-gate, channel-neutral]
requires:
  - lib/estimate/price-research/provider.ts (PriceResearchProvider port + isUsableCandidate, from 107-01)
  - lib/estimate/price-research/normalize.ts (normalizeServiceNameKey + normalizeRegion, from Phase 106)
  - tests/eval (the *.test.ts include glob added in Phase 103-02)
provides:
  - makeFixtureProvider(fixtures, {now?}) — deterministic PriceResearchProvider keyed by normalized (name, region), zero network, injectable fixed clock
  - fixtureKey(name, region) — single-source-of-truth key derivation shared by dataset + adapter
  - PRICE_RESEARCH_FIXTURES — golden (service, region) -> candidates dataset (evidenced "Couch cleaning 8 seats" + Drywall repair + ungrounded Fence painting)
  - tests/eval/price-research-source.test.ts — gated eval source-contract test with a live-network tripwire (the Phase-108 harness injection point)
affects:
  - (none — nothing wired into the estimate pipeline; generate-estimate.ts untouched)
tech-stack:
  added: []
  patterns:
    - "fixtureKey() shared by the dataset and the adapter so key derivation can never drift (single source of truth)"
    - "fixed clock (opts.now, default FIXTURE_FIXED_NOW) instead of the wall clock — determinism guarantee (Pitfall 9)"
    - "ungrounded entry (source_url null) is a clean miss, mirroring isUsableCandidate's evidence gate as data"
    - "fetch stubbed-to-throw as a live-network tripwire in the eval test"
key-files:
  created:
    - lib/estimate/price-research/adapters/fixture.ts
    - tests/eval/fixtures/price-research.ts
    - tests/unit/estimate/price-research-fixture.test.ts
    - tests/eval/price-research-source.test.ts
  modified: []
decisions:
  - "fixtureKey(name, region) = `${normalizeServiceNameKey(name)}@@${normalizeRegion(region)}` exported and reused by both the dataset and the adapter — a single key derivation prevents the dataset and lookup from ever drifting"
  - "opts.now is captured (FIXTURE_FIXED_NOW default) but not yet written into a PriceResearchResult (the shape has no time field today); its purpose is to guarantee any FUTURE time-dependent field reads the injected clock, never the wall clock"
  - "an ungrounded fixture entry (source_url:null) is surfaced as a miss at the adapter, not just rejected downstream — the evidence gate is enforced as data so Phase 108 falls it through to ai_estimate"
metrics:
  duration: "~6m"
  tasks: 2
  files: 4
  completed: 2026-06-24
---

# Phase 107 Plan 03: Determinism Seam — Fixture Adapter + Golden Fixtures + Fixed Clock Summary

Shipped the DETERMINISM SEAM that keeps the v4.5 eval harness + CI regression gate green with ZERO live network: a deterministic `makeFixtureProvider` satisfying the Plan-01 `PriceResearchProvider` port (keyed by the normalized `(name, region)` tuple via a shared `fixtureKey`), a golden `(service, region) → candidates` dataset (the originating "Couch cleaning 8 seats" EVIDENCED case + a second evidenced service + an UNGROUNDED no-citation case), an injectable FIXED CLOCK (`opts.now`, never the wall clock), and a gated eval `*.test.ts` that drives the source deterministically behind a live-network tripwire (`fetch` stubbed to throw). Nothing is wired into `generate-estimate.ts`; the fixture adapter is the injection point Phase 108's harness will use, mirroring how `getAIProviderWithFallback` is mocked in `tests/eval/mock-providers.ts`.

## What Was Built

### Task 1 — Deterministic fixture adapter + golden fixtures + fixed clock (commit 31d06d8)
- `lib/estimate/price-research/adapters/fixture.ts`: `makeFixtureProvider(fixtures, opts?)` returns a port-shaped `PriceResearchProvider` whose `lookup` resolves each item by `fixtureKey(name, region)` against a synchronous in-memory map — pure, no network, no DB. An entry with a real `source_url` + `snippet` returns a usable result; an entry with `source_url: null` (UNGROUNDED) or an absent item returns a clean miss (`missFor`). `fixtureKey(name, region)` (exported, the single source of truth) composes `normalizeServiceNameKey(name)` + `normalizeRegion(region)` so "Couch cleaning 8 seats" / "Couch cleaning, 8 seats" / "  COUCH cleaning 8 seats " collapse to ONE entry. `opts.now` (default `FIXTURE_FIXED_NOW = 1_700_000_000_000`) is the injectable fixed clock — captured for any future time-dependent field, NEVER the wall clock. Channel-neutral; no `lib/whatsapp` import.
- `tests/eval/fixtures/price-research.ts` (helper module, NOT a `*.test.ts`): `PRICE_RESEARCH_FIXTURES` built via `fixtureKey` — EVIDENCED "Couch cleaning 8 seats" {Austin, TX} (the originating $0/vague regression case, now usable at $180 with a citation), EVIDENCED "Drywall repair" {Austin, TX}, and UNGROUNDED "Fence painting" {Austin, TX} (`source_url:null` → miss). All URLs are `https://example.test/...` RFC-2606 placeholders → gitleaks-safe.
- `tests/unit/estimate/price-research-fixture.test.ts` (7 tests): evidenced→usable, ungrounded→miss, absent→miss, normalization collapse (3 punctuation/case variants → same $180), fixed-clock identity, zero-network (fetch spy never called), batched one-result-per-item-in-order.

### Task 2 — Gated eval source test, fixed clock, live-network tripwire (commit be89344)
- `tests/eval/price-research-source.test.ts` (a `*.test.ts` so the `tests/eval/**/*.test.ts` include glob collects it): builds `makeFixtureProvider(PRICE_RESEARCH_FIXTURES, { now: 1_700_000_000_000 })`. A `vi.stubGlobal('fetch', () => { throw new Error('NO LIVE NETWORK IN EVAL') })` tripwire asserts the source path makes ZERO live calls; `afterEach(vi.unstubAllGlobals)`. 5 tests: zero-network (3-item batch), originating case → `isUsableCandidate` true + `unit_price > 0` + truthy `source_url`, ungrounded → miss, absent → miss (not a throw), determinism (same lookup twice deep-equal under the fixed clock).

## Verification
- `npx vitest run tests/unit/estimate/price-research-fixture.test.ts` → **1 file / 7 tests** green.
- `npx vitest run tests/eval/price-research-source.test.ts` → **1 file / 5 tests** green (collected by the eval include glob — NOT "No test files found").
- `npx vitest run tests/eval` → **3 files / 25 tests** green (was 2 files / 20 at the 103-02 baseline; +1 file / +5 tests — `harness.test.ts` unaffected).
- FULL `npx vitest run` → **270 files passed | 3 skipped, 1884 passed | 2 skipped | 33 todo** — no regressions vs the 268/1872 (107-02) baseline (+2 files / +12 assertions).
- `npx tsc --noEmit`: clean on all 4 new files.
- Acceptance greps (Task 1): `makeFixtureProvider`==1, `Date.now()`==0 (fixed clock only), `fetch|http`==0 (no network), `Couch cleaning`>=1 in fixtures, `example.test`>=1, `lib/whatsapp`==0. (Task 2): `NO LIVE NETWORK|stubGlobal('fetch'`==2, `isUsableCandidate`==4, `Couch cleaning`==6.
- `git diff --name-only HEAD` does NOT include `lib/services/generate-estimate.ts` (nothing wired into the pipeline).
- gitleaks ran on both commits (normal hooked commits, no `--no-verify`): no leaks found (placeholder `example.test` URLs only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded `Date.now()` / `fetch` doc-comment mentions so the forbidden-token acceptance greps return 0**
- **Found during:** Task 1
- **Issue:** The plan's acceptance criteria require `grep -c "Date.now()"` === 0 and `grep -c "fetch\|http"` === 0 on `fixture.ts`. The natural explanatory doc comments ("not Date.now()", "NEVER read Date.now()", "No fetch, no DB") contained those literal tokens, tripping the greps to non-zero on a file that genuinely calls neither.
- **Fix:** Reworded the comments to "the wall clock" / "No network" — meaning preserved, the adapter still never calls the wall clock and never fetches, and the greps now return 0.
- **Files modified:** lib/estimate/price-research/adapters/fixture.ts
- **Commit:** 31d06d8

**2. [Rule 1 - Bug] Normalization-collapse test uses HONEST variants the real normalizer actually collapses**
- **Found during:** Task 1
- **Issue:** The plan's behavior note suggested "Couch cleaning 8 seats" and "couch cleaning, 8-seat" collapse to the same key. The real `normalizeNameForMatch` (reused via `normalizeServiceNameKey`) only lowercases, trims, strips `.`/`,`, and collapses whitespace — it does NOT strip hyphens or singularize, so "8-seat" would NOT collapse to "8 seats". Asserting that would be a false test.
- **Fix:** The collapse test uses variants the normalizer genuinely reduces to `couch cleaning 8 seats` — "Couch cleaning, 8 seats" (comma stripped) and "  COUCH cleaning 8 seats " (case + whitespace) — plus region case-folding {austin, tx}. The dataset key and the assertion now reflect the actual normalizer behavior.
- **Files modified:** tests/unit/estimate/price-research-fixture.test.ts, tests/eval/fixtures/price-research.ts
- **Commit:** 31d06d8

## Known Stubs
None. The fixture adapter is a complete, deterministic implementation of the port. `opts.now` is intentionally captured-but-unwritten (the `PriceResearchResult` shape has no time field today) — this is a forward-compatibility guarantee, not a stub: it ensures any future time-dependent field reads the injected clock. The adapter is a test/eval helper, dormant from the production path until Phase 108 injects it into the eval harness.

## Self-Check: PASSED
- FOUND: lib/estimate/price-research/adapters/fixture.ts
- FOUND: tests/eval/fixtures/price-research.ts
- FOUND: tests/unit/estimate/price-research-fixture.test.ts
- FOUND: tests/eval/price-research-source.test.ts
- FOUND commit: 31d06d8 (Task 1)
- FOUND commit: be89344 (Task 2)
