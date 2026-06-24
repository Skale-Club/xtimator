---
phase: 107-provider-seam-first-source-determinism-seam
verified: 2026-06-24T05:36:00Z
status: passed
score: 15/15 must-haves verified
re_verification: # Initial verification — no prior VERIFICATION.md
human_verification:
  - test: "Live OpenRouter web-search call returns real url_citation annotations and the adapter pairs them to prices"
    expected: "When platform_integrations.price_research source = openrouter_web and a real key is present, an actual job item resolves to a usable PriceResearchResult with a real source_url + snippet"
    why_human: "Requires a live OpenRouter key + billed web-search credit; cannot exercise without network. Unit tests cover the mocked request/response shape only."
  - test: "Live Anthropic web_search call with user_location returns citations the adapter maps to source_url + cited_text"
    expected: "When source = anthropic_web and Claude Console web search is enabled, an item resolves to a usable result"
    why_human: "Requires live Anthropic key + org-enabled web search; mocked in tests only."
---

# Phase 107: Provider-Seam-First Source + Determinism Seam — Verification Report

**Phase Goal:** The pricing-research source lives behind a swappable `PriceResearchProvider` port resolved from `platform_integrations`, with a real OpenRouter-web adapter (engine exa/native), a gated Anthropic quality-fallback adapter, AND a deterministic fixture adapter the v4.5 eval harness injects — so the CI gate stays green and the source can flip via config without touching call sites. Every web snippet that reaches the LLM is injection-hardened. Nothing wired into the estimate pipeline yet (Phase 108 owns that).

**Verified:** 2026-06-24T05:36:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
| -- | ----- | ------ | -------- |
| 1  | `getPriceResearchProvider()` returns null when source unconfigured (safe no-op) | ✓ VERIFIED | provider.ts:108-122 `switch(source){…default: return null}`; `getActiveResearchSource` returns null on no-svc / no-row / unknown (87-99). Test green. |
| 2  | Port exposes a batched `lookup(items, region, currency)` contract | ✓ VERIFIED | provider.ts:44-54 `PriceResearchProvider.lookup(items[], region, currency)`; all 3 adapters implement it batched. |
| 3  | Evidence-gated `isUsableCandidate` (real source_url + snippet + positive price) | ✓ VERIFIED | provider.ts:68-78 enforces non-empty source_url AND non-empty snippet AND finite unit_price > 0. Truth-table test green. |
| 4  | zod payload/result schema, `safeParse` never throws | ✓ VERIFIED | schema.ts:14-25 both schemas; adapters use `safeParse` (openrouter:175, anthropic:138). Schema test green. |
| 5  | OpenRouter adapter: SEPARATE `openrouter:web_search` call, engine nested under `parameters`, default exa, native configurable, NO tool_choice/create_estimate | ✓ VERIFIED | openrouter-web.ts:114-119 `tools:[{type:'openrouter:web_search', parameters:{engine, max_results}}]`; resolveEngine default 'exa' (70-84); grep tool_choice/create_estimate/:online = 0. |
| 6  | OpenRouter reuses `getIntegrationKey('openrouter')`, parses url_citation → source_url+snippet, evidence-gated, never throws | ✓ VERIFIED | openrouter-web.ts:99, citationByUrl map (143-149), citation-match gate (182-194), outer try/catch → misses (218-221). |
| 7  | Anthropic adapter: `web_search` with `user_location {city, region:state, country:'US'}`, gated/non-default, errors → miss | ✓ VERIFIED | anthropic-web.ts:74-86 user_location {type:'approximate', city, region:state, country:'US'}; searchErrored → miss (93-99); reachable only via 'anthropic_web' dispatch; try/catch → miss. |
| 8  | Fixture adapter deterministic, no Date.now()/no live network, injectable clock, golden fixtures conform to schema | ✓ VERIFIED | fixture.ts pure map lookup, no fetch/Date.now (grep=0), opts.now clock (85), FixtureCandidate shape matches schema. Tripwire test green. |
| 9  | `sanitizeField` exported + `<search_result>` in `## Security`; `buildResearchSearchPrompt` routes through it; static test asserts it | ✓ VERIFIED | prompt-builder.ts:33 `export function sanitizeField`; :96 Security block enumerates `<search_result>`; search-prompt.ts:14,29-34 wraps names via sanitizeField in `<search_result>`. prompt-builder.test.ts green. |
| 10 | Eval harness test collected by eval glob, runs green, zero live calls | ✓ VERIFIED | vitest.config.ts:23 glob `tests/eval/**/*.test.ts`; price-research-source.test.ts has fetch tripwire (32-37); `vitest run tests/eval` = 3 files / 25 tests passed. |
| 11 | Channel-neutral (no lib/whatsapp import) | ✓ VERIFIED | grep `lib/whatsapp` in lib/estimate/price-research/ = no files found. |
| 12 | `generate-estimate.ts` UNTOUCHED (Phase 108 owns wiring) | ✓ VERIFIED | Not in `git diff --name-only HEAD`; last commit touching it is Phase 100 (unrelated). |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/estimate/price-research/provider.ts` | Port + factory + evidence gate | ✓ VERIFIED | 123 lines; exports `PriceResearchProvider`, `getPriceResearchProvider`, `isUsableCandidate`; reads platform_integrations; channel-neutral. |
| `lib/estimate/price-research/schema.ts` | zod result/payload schema | ✓ VERIFIED | 29 lines; both schemas exported; safeParse-based (never throws). |
| `lib/estimate/price-research/search-prompt.ts` | hardened batched query builder | ✓ VERIFIED | 54 lines; imports sanitizeField, wraps in `<search_result>`. |
| `lib/ai/prompt-builder.ts` | exported sanitizeField + `<search_result>` in Security | ✓ VERIFIED | sanitizeField exported (33); `<search_result>` in Security enumeration (96); no wording drift. |
| `lib/estimate/price-research/adapters/openrouter-web.ts` | primary adapter | ✓ VERIFIED | 224 lines; separate web_search call, engine exa default, evidence-gated, never throws. |
| `lib/estimate/price-research/adapters/anthropic-web.ts` | gated fallback | ✓ VERIFIED | 164 lines; web_search + user_location, gated, never throws. |
| `lib/estimate/price-research/adapters/fixture.ts` | deterministic seam | ✓ VERIFIED | 111 lines; no Date.now/fetch; injectable clock; normalized key. |
| `tests/eval/fixtures/price-research.ts` | golden dataset | ✓ VERIFIED | Evidenced Couch-cleaning + Drywall cases; ungrounded Fence-painting miss; `example.test` URLs. |
| `tests/eval/price-research-source.test.ts` | gated eval test | ✓ VERIFIED | Fetch tripwire, fixed clock, evidenced→usable, ungrounded→miss, determinism. |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| search-prompt.ts | prompt-builder.ts | `import { sanitizeField }` | ✓ WIRED | Line 14 import; used 3× (city/state/item name). |
| provider.ts | platform_integrations | createServiceClient read | ✓ WIRED | Lines 88-95 `.from('platform_integrations').eq('provider','price_research')`. |
| openrouter-web.ts | OpenRouter chat/completions | fetch + getIntegrationKey('openrouter') + openrouter:web_search | ✓ WIRED | Lines 99, 122, 114-119. |
| openrouter-web.ts | search-prompt.ts | buildResearchSearchPrompt | ✓ WIRED | Lines 26, 111. |
| anthropic-web.ts | Anthropic messages API | web_search + user_location | ✓ WIRED | Lines 68-86. |
| fixture.ts | provider.ts | implements PriceResearchProvider | ✓ WIRED | Line 25 type import; lookup returns PriceResearchResult[]. |
| price-research-source.test.ts | fixtures/price-research.ts | imports golden dataset | ✓ WIRED | Line 18. |

### Data-Flow Trace (Level 4)

N/A — Phase 107 is a library-seam phase with no rendering surface. The "data flows" are exercised by the behavioral spot-checks below (fixture adapter produces real evidenced data; adapters parse mocked responses into populated results).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Phase-107 unit + eval tests pass | `vitest run` (7 files) | 7 files / 70 tests passed | ✓ PASS |
| Full eval suite stays green (no harness regression, new eval test collected) | `vitest run tests/eval` | 3 files / 25 tests passed | ✓ PASS |
| New/modified files type-check | `tsc --noEmit` filtered to phase files | 0 errors | ✓ PASS |
| OpenRouter adapter free of forbidden patterns | grep tool_choice/create_estimate/:online/plugins | 0 occurrences | ✓ PASS |
| Fixture adapter has no live clock/network | grep Date.now / fetch in fixture.ts | 0 occurrences | ✓ PASS |
| Channel neutrality | grep lib/whatsapp in price-research/ | 0 files | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| RSRC-01 | 107-02 | Price research via OpenRouter web search, separate call ahead of forced create_estimate | ✓ SATISFIED | openrouter-web.ts separate web_search call, no tool_choice/create_estimate. |
| RSRC-02 | 107-01, 107-02 | engine exa/native configurable behind swappable PriceResearchProvider seam | ✓ SATISFIED | provider.ts port + factory; resolveEngine exa default, native configurable. |
| RSRC-03 | 107-02 | Anthropic web search with user_location, gated, non-default | ✓ SATISFIED | anthropic-web.ts user_location, dispatch-gated to 'anthropic_web'. |
| RSRC-04 | 107-01, 107-03 | Deterministic fixture adapter drives source in tests/CI, eval gate green | ✓ SATISFIED | fixture.ts + eval test, fetch tripwire, 25/25 eval green. |
| RFALL-04 | 107-01, 107-02 | Web-search content sanitized (sanitizeField + `<search_result>` + Security clause) | ✓ SATISFIED | sanitizeField exported, `<search_result>` in Security, buildResearchSearchPrompt routes all untrusted text. |

No orphaned requirements — REQUIREMENTS.md maps exactly RSRC-01..04 + RFALL-04 to Phase 107, all claimed by plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None found | — | grep for TODO/FIXME/placeholder/not-implemented across lib/estimate/price-research = 0 matches. |

### Human Verification Required

Two items (live-key paths) are flagged in frontmatter. These do NOT block phase-goal acceptance — the adapters are evidence-gated, never-throw, and fully covered by mocked request/response shape tests. Live verification is deferred to when Phase 108 wires research into the pipeline with a real configured source.

### Gaps Summary

No gaps. All 12 observable truths verified, all 9 artifacts exist + substantive + wired, all 7 key links wired, all 5 requirements satisfied, no anti-patterns, no TypeScript errors. The seam is config-flippable (platform_integrations.price_research → openrouter_web | anthropic_web | null), injection-hardened (every web/item snippet routes through sanitizeField + `<search_result>` + the enumerated Security clause), deterministic (fixture adapter with fixed clock + live-network tripwire), and correctly inert (generate-estimate.ts untouched; null-on-unconfigured no-op). The full-suite claim of 270 files / 1884 passed was not re-run wholesale; the phase-relevant slices (7 unit/eval files + the entire eval suite) are green and the new files type-check cleanly.

---

_Verified: 2026-06-24T05:36:00Z_
_Verifier: Claude (gsd-verifier)_
