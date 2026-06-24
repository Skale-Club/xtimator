---
phase: 109-durability-cost-control-hardening
verified: 2026-06-24T07:15:00Z
status: passed
score: 8/8 must-haves verified
---

# Phase 109: Durability + Cost-Control Hardening Verification Report

**Phase Goal:** Harden the research path for durability + cost control without changing its behavior contract; everything stays never-throw. (Minimal/foldable phase — hardens RMETER-01..03, no net-new requirement.) Plus the carried Phase-108 build fix.
**Verified:** 2026-06-24T07:15:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth (must_have)                                                                                                | Status     | Evidence                                                                                                                              |
| --- | --------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Build fix: every render-path `price_source` union includes `'researched'`; scoped CI tsc clean                  | ✓ VERIFIED | All three unions widened (grep below); `tsc -p tsconfig.ci.json` → **0 errors**, no `'researched' not assignable`/TS2322             |
| 2   | A persisted `researched` item renders in document/share/editor without a type error                             | ✓ VERIFIED | `DocumentItem` (L274) + `EstimateItem` (L64) + refine cast (L213) all accept `'researched'`; sweep finds zero omitting unions         |
| 3   | Cap: over-cap items keep non-zero `ai_estimate`, never reach provider; dropped count logged (no silent truncate) | ✓ VERIFIED | `MAX_RESEARCH_ITEMS_PER_ESTIMATE` const (orchestrator L91-94, env-overridable); cap+`console.warn` L165-172; Test 11 asserts all      |
| 4   | Fallback ordering: OpenRouter-web primary → gated Anthropic-web, fallback only on zero-evidence/error, gated     | ✓ VERIFIED | `getPriceResearchProviderChain()` (provider L139-165, gated on `getIntegrationKey('anthropic')`); chain iteration L231-311; Tests 15-18 |
| 5   | In-run memo per (normName, region) dedups the miss batch (one lookup + one recordUsage per key)                  | ✓ VERIFIED | Memo Map L180; per-key dedup L205-221, L244-249, L284; Test 13 asserts one lookup + one recordUsage, both items re-tagged             |
| 6   | step.run isolation DOCUMENTED-AS-DEFERRED (not silently dropped)                                                 | ✓ VERIFIED | `.planning/deferred-items.md` Item 5 (full rationale + pickup condition); SUMMARY 109-02 records it; `<deferred>` block in plan       |
| 7   | Channel-neutral + never-throw preserved; generate-estimate.ts untouched                                          | ✓ VERIFIED | `grep -c lib/whatsapp` → 0/0; top-level try/catch L330-337 + per-provider try/catch L258-262; no 109 commit touches generate-estimate |
| 8   | Full orchestrator suite green                                                                                    | ✓ VERIFIED | `vitest run price-research-orchestrator.test.ts` → **18 passed**; eval regression `price-research-regression.test.ts` → **3 passed**  |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact                                                  | Expected                                                          | Status     | Details                                                                                          |
| -------------------------------------------------------- | ---------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| `components/workspace/estimate/estimate-document.tsx`    | `DocumentItem.price_source` includes `'researched'`              | ✓ VERIFIED | L274: `'price_book' \| 'ai_estimate' \| 'researched' \| null`                                    |
| `lib/queries/estimate.ts`                                | `EstimateItem.price_source` includes `'researched'`             | ✓ VERIFIED | L64: `'price_book' \| 'ai_estimate' \| 'researched' \| null`                                     |
| `app/api/estimates/[id]/refine/route.ts`                 | refine cast includes `'researched'`                             | ✓ VERIFIED | L213: `as 'price_book' \| 'ai_estimate' \| 'researched'` (`?? 'ai_estimate'` default unchanged)  |
| `lib/estimate/price-research/orchestrator.ts`            | cap + fallback iteration + in-run memo                          | ✓ VERIFIED | Cap const + apply + log; memo Map + per-key dedup; chain iteration over shrinking miss set       |
| `lib/estimate/price-research/provider.ts`                | `getPriceResearchProviderChain()` returning `[primary, gated?]` | ✓ VERIFIED | L139-165, gated on Anthropic key, `[]` when unconfigured, never-throws                           |
| `tests/unit/estimate/price-research-orchestrator.test.ts` | cap/memo/fallback/never-throw coverage                         | ✓ VERIFIED | 18 tests (10 existing + Tests 11-18 for cap/memo/fallback); all pass                             |

### Key Link Verification

| From                                  | To                                       | Via                                              | Status | Details                                                                                |
| ------------------------------------- | ---------------------------------------- | ------------------------------------------------ | ------ | -------------------------------------------------------------------------------------- |
| `orchestrator.ts`                     | `provider.ts getPriceResearchProviderChain` | import + iterate primary→fallback on zero-evidence | WIRED  | Imported L43, called L231, iterated L238-311 over shrinking `remaining` miss set        |
| `orchestrator.ts` cap                 | `console.warn` dropped count             | no-silent-caps log                               | WIRED  | L168-171 logs `cap hit … N dropped to ai_estimate`; Test 11 asserts the message + count |
| `lib/queries/estimate.ts EstimateItem` | `estimate-document.tsx DocumentItem`     | share/estimate-view maps `price_source`         | WIRED  | Both source + target unions widened; CI tsc clean confirms the map type-checks          |

### Behavioral Spot-Checks

| Behavior                                          | Command                                                       | Result            | Status |
| ------------------------------------------------- | ------------------------------------------------------------ | ----------------- | ------ |
| Render-path types compile (build fix)             | `tsc --noEmit -p tsconfig.ci.json`                           | 0 errors          | ✓ PASS |
| Cap/memo/fallback/never-throw behaviors           | `vitest run price-research-orchestrator.test.ts`             | 18 passed         | ✓ PASS |
| Full-graph regression (provider-chain mock fix)   | `vitest run price-research-regression.test.ts`               | 3 passed          | ✓ PASS |
| Channel-neutral (no whatsapp in module)           | `grep -c lib/whatsapp orchestrator.ts provider.ts`          | 0 / 0             | ✓ PASS |
| generate-estimate.ts untouched by 109             | `git show --stat` over the four 109 commits                  | not in any commit | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan          | Description                                                                                          | Status      | Evidence                                                                                       |
| ----------- | -------------------- | -------------------------------------------------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------- |
| RMETER-01   | 109-01, 109-02       | Each search metered via `recordUsage` / `price_researched`, count-based, idempotent                | ✓ SATISFIED | `recordUsage(... 'price_researched', 1, buildIdemKey(...))` L276; REQUIREMENTS.md `[x]` Complete |
| RMETER-02   | 109-01, 109-02       | Monthly allowance in `entitlements`, gated by checkQuota                                            | ✓ SATISFIED | `checkQuota(... 'price_research')` L226; REQUIREMENTS.md `[x]` Complete (Phase 108)             |
| RMETER-03   | 109-01, 109-02       | Over-allowance → research skipped, items fall to non-zero `ai_estimate`; never hard-fails           | ✓ SATISFIED | `if (quota.allowed)` gate L227 (skips provider when over); never-throw ladder; `[x]` Complete   |

All three RMETER requirements were completed in Phase 108 (REQUIREMENTS.md lines 90-92 = Complete). Phase 109 hardens them — cap bounds cost (RMETER-02 worst-case), memo prevents double-pay (RMETER-01), fallback chain + over-quota skip preserve the never-hard-fail contract (RMETER-03) — without changing the behavior contract or adding a net-new requirement. No orphaned requirements.

### Data-Flow Trace (Level 4)

Not applicable — Plan 01 is a type-level widening of existing live render-path code (no new dynamic-data artifact); Plan 02 hardens an already-wired orchestrator whose data flow (cache → provider chain → evidence gate → re-tag) was verified in Phase 108 and is exercised by the 18 unit tests + 3 eval-regression tests here.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| —    | —    | None    | —        | No TODO/FIXME/PLACEHOLDER/stub patterns in any of the 5 modified source files |

### Human Verification Required

None. Every must-have is programmatically verifiable: type widening (scoped tsc), cap/memo/fallback behavior (unit tests with mocked provider/cache/quota), never-throw (rejecting-deps tests), channel-neutrality (grep), and the build-fix CI gate (tsconfig.ci.json clean).

### Gaps Summary

No gaps. The carried Phase-108 build fix is complete — all three render-path `price_source` unions/casts include `'researched'`, the sweep finds no remaining omitting union, and `tsc -p tsconfig.ci.json` is clean (0 errors, no `'researched' not assignable`). The cost-control + resilience hardening is complete and tested: an env-overridable per-estimate cap with logged drops (over-cap items keep non-zero `ai_estimate`, never reach the provider), a gated OpenRouter-web → Anthropic-web fallback chain tried only on zero-evidence/error before items degrade, and a per-run in-run memo deduping the miss batch by normalized (name, region) to one lookup + one recordUsage per key. Every new path is never-throw and channel-neutral, `generate-estimate.ts` is untouched by all four 109 commits, and the step.run isolation is documented-as-deferred in `.planning/deferred-items.md` (not silently dropped). RMETER-01..03 remain Complete and are hardened, not altered. Orchestrator suite 18/18 green; eval regression 3/3 green.

---

_Verified: 2026-06-24T07:15:00Z_
_Verifier: Claude (gsd-verifier)_
