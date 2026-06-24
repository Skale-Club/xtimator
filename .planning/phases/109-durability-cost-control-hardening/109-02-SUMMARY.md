---
phase: 109-durability-cost-control-hardening
plan: 02
subsystem: price-research
tags: [cost-control, durability, provider-fallback, never-throw, channel-neutral]
requires:
  - lib/estimate/price-research/orchestrator.ts (Phase 108 — researchUnmatchedPrices)
  - lib/estimate/price-research/provider.ts (Phase 107 — getPriceResearchProvider seam)
  - lib/estimate/price-research/adapters/openrouter-web.ts + anthropic-web.ts (Phase 107)
  - lib/quota.ts (Phase 108-01 — price_research quota + recordUsage)
provides:
  - MAX_RESEARCH_ITEMS_PER_ESTIMATE (env-overridable per-estimate research cap)
  - in-run memo (per-call dedup of same (normName, region) lookups)
  - getPriceResearchProviderChain() ([primary, gated-anthropic?] ordered fallback)
affects:
  - lib/estimate/price-research/orchestrator.ts
  - lib/estimate/price-research/provider.ts
tech-stack:
  added: []
  patterns:
    - "env-overridable module const (mirrors AUTO_REFINE_MAX_ATTEMPTS)"
    - "ordered gated provider chain (mirrors lib/ai/provider-with-fallback.ts)"
    - "never-throw enrichment; no-silent-caps logging; channel-neutral"
key-files:
  created:
    - .planning/deferred-items.md
  modified:
    - lib/estimate/price-research/orchestrator.ts
    - lib/estimate/price-research/provider.ts
    - tests/unit/estimate/price-research-orchestrator.test.ts
    - tests/eval/price-research-regression.test.ts
decisions:
  - "Cap default 25, env MAX_RESEARCH_ITEMS_PER_ESTIMATE; over-cap items keep non-zero ai_estimate, never reach the provider; dropped count logged"
  - "In-run memo scoped to the CALL (per-estimate), keyed by normalized (name, region) — dedups the miss batch so a duplicate key is one provider lookup + one recordUsage"
  - "Anthropic fallback gated on getIntegrationKey('anthropic') resolving + primary not already anthropic_web"
  - "Item 5 (step.run isolation) documented-as-deferred — inline call already non-fatal; StepRunner threading too invasive for the 108 wire"
metrics:
  duration: "~25m"
  completed: 2026-06-24
  tasks: 2
  commits: 3
  files: 5
---

# Phase 109 Plan 02: Orchestrator Cost-Control + Resilience Hardening Summary

Bounded, fallback-aware, memoized price-research orchestrator: an env-overridable per-estimate research CAP, a gated OpenRouter-web → Anthropic-web runtime fallback chain, and a per-run in-run memo — every path never-throw and channel-neutral, with the live `generate-estimate.ts` wire untouched.

## What Was Built

### Task 1 — Per-estimate research item CAP + in-run memo (`d9211fc0`)
- Added `MAX_RESEARCH_ITEMS_PER_ESTIMATE` as an env-overridable module const mirroring `AUTO_REFINE_MAX_ATTEMPTS` (decide.ts) EXACTLY: `Number(env)` → `Number.isFinite && > 0 ? Math.floor(raw) : 25`.
- The cap is applied after building `candidates` and BEFORE the cache pass: `researchTargets = candidates.slice(0, cap)`; the over-cap remainder is left untouched (KEEPS its non-zero `ai_estimate` price, never $0, never reaches cache/provider).
- NO-SILENT-CAPS: `console.warn('[price-research] cap hit: …; N dropped to ai_estimate')` logs the dropped count when the cap bites.
- In-run memo: a per-CALL `Map<string, PriceResearchResult | null>` keyed by `${normalizeServiceNameKey(name)}@@${normalizeRegion(region)}`. The miss batch is deduped by memo key so two items sharing a normalized (name, region) issue ONE provider lookup + ONE `recordUsage` and both re-tag from the single result. A memoized `null` records a known miss.

### Task 2 — Gated OpenRouter-web → Anthropic-web fallback ordering (`290563f8`)
- Added `getPriceResearchProviderChain(): Promise<PriceResearchProvider[]>` to provider.ts. Returns `[primary, gated-anthropic?]`: the configured primary first (via the existing dispatch), then the Anthropic-web quality-fallback appended ONLY when the primary is NOT already `anthropic_web` AND `getIntegrationKey('anthropic')` resolves to a real key. Returns `[]` when unconfigured (the Phase-108 safe no-op preserved). A gate read failure simply omits the fallback (never throws).
- Orchestrator swapped from the single `getPriceResearchProvider()` to iterating the chain over the SHRINKING miss set: `provider.lookup` per round (wrapped in try/catch so an erroring provider falls through to the next), evidence-gate + re-tag + meter + cache.put the usable results, then feed only the STILL-unresolved items to the next provider. The fallback is attempted ONLY for items the primary left without usable evidence (or that it errored on), before they degrade to `ai_estimate`. Per-key dedup (the memo) holds across rounds.

### Eval regression mock fix (`f8afce0`)
- `tests/eval/price-research-regression.test.ts` (the RFALL-03 full-graph regression) spread-mocks the provider module and overrode only `getPriceResearchProvider`; the orchestrator now calls `getPriceResearchProviderChain`, so the mock was extended to resolve a single-element chain `[provider]` from the same fixture-provider mock (no Anthropic fallback in the deterministic eval). This is a Rule-3 follow-on of the Task-2 chain swap.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Eval regression test pointed at the old provider seam**
- **Found during:** full-suite run after Task 2.
- **Issue:** `tests/eval/price-research-regression.test.ts` mocked `getPriceResearchProvider` (spread `...actual`); the orchestrator now calls `getPriceResearchProviderChain`, so the real (un-mocked) chain ran and returned the fixture path empty → the EVIDENCED couch case fell to grandTotal 0 (1 failing test).
- **Fix:** extended the provider mock to also resolve `getPriceResearchProviderChain` as `[provider]` from the existing fixture-provider mock.
- **Files modified:** tests/eval/price-research-regression.test.ts
- **Commit:** f8afce0

### Folded scope (per plan's explicit discretion)
- Task 1 and Task 2 share the same Step-2 provider pass; the cap/memo (Task 1) and the chain iteration (Task 2) are intertwined in one body. They were still landed as two atomic commits — Task 1 with the single `getPriceResearchProvider` + memo dedup, Task 2 swapping in the chain — exactly as the plan sequenced them.

## Deferred (documented, not silently dropped)

**Item 5 — `step.run('price-research')` retry isolation via the StepRunner seam: DEFERRED.** Recorded in `.planning/deferred-items.md`. `generateEstimateForProject` takes no `StepRunner` today; the research call is an inline non-fatal `await`. Threading a real `StepRunner` through `GenerateEstimateOptions` → the call site is too invasive for the freshly-wired 108 service path (CONTEXT decision #4 + the "DEFER IF RISKY" guardrail). The never-throw inline call already guarantees a research failure never blocks/fails the estimate; the finer `step.run` resume is the deferred enhancement.

## Verification

- `npx vitest run tests/unit/estimate/price-research-orchestrator.test.ts` → **18 passed** (10 existing + 4 cap/memo + 4 fallback-ordering).
- `grep -c "lib/whatsapp"` on orchestrator.ts and provider.ts → **0 / 0** (channel-neutral preserved).
- `npx tsc --noEmit -p tsconfig.json` → **clean** on orchestrator.ts, provider.ts, and the two test files.
- FULL `npx vitest run` → **275 files passed | 3 skipped, 1932 passed | 2 skipped | 33 todo** (no regressions vs the 108 baseline of 275 / 1924; +8 new orchestrator assertions).
- `generate-estimate.ts` UNTOUCHED (`git diff --name-only HEAD` excludes it).
- 3 atomic commits, all normal hooked (gitleaks ran, no `--no-verify`); no leaks found.

## Success Criteria Status

- [x] Per-estimate cap `MAX_RESEARCH_ITEMS_PER_ESTIMATE` (env-overridable, mirrors AUTO_REFINE_MAX_ATTEMPTS); over-cap items degrade to non-zero ai_estimate; dropped count LOGGED.
- [x] Gated provider fallback ordering: OpenRouter-web primary → Anthropic-web quality-fallback only on zero-evidence/errors, before degrading; never-throw; gated on Anthropic configured.
- [x] In-run memo per (normName, region) so the auto-refine loop doesn't re-pay within one run.
- [x] step.run isolation documented-as-deferred (deferred-items.md + this SUMMARY).
- [x] Channel-neutral; never-throw preserved; generate-estimate.ts untouched; full suite green; gitleaks clean.

## Known Stubs

None. All new paths are wired and tested; the only deferral (Item 5) is documented with a pickup condition.

## Self-Check: PASSED

- FOUND: lib/estimate/price-research/orchestrator.ts
- FOUND: lib/estimate/price-research/provider.ts
- FOUND: .planning/deferred-items.md
- FOUND: .planning/phases/109-durability-cost-control-hardening/109-02-SUMMARY.md
- FOUND commit d9211fc0 (Task 1 — cap + memo)
- FOUND commit 290563f8 (Task 2 — provider chain fallback)
- FOUND commit f8afce0 (eval regression mock fix)
