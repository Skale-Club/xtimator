---
phase: 107-provider-seam-first-source-determinism-seam
plan: 01
subsystem: price-research
tags: [provider-seam, zod, prompt-injection, channel-neutral, evidence-gate]
requires:
  - lib/platform-config.ts (getSelectedAIProvider pattern)
  - lib/ai/prompt-builder.ts (sanitizeField + ## Security boundary)
  - lib/supabase/service.ts (createServiceClient)
provides:
  - PriceResearchProvider port + batched lookup(items, region, currency) contract
  - getPriceResearchProvider() factory (null-on-unconfigured Phase-108 no-op)
  - isUsableCandidate() evidence gate (source_url + snippet + positive price)
  - priceResearchResultSchema + priceResearchPayloadSchema (zod validate-before-trust)
  - exported sanitizeField + <search_result> enumerated in ## Security
  - buildResearchSearchPrompt() hardened batched query builder
affects:
  - lib/ai/prompt-builder.ts (additive: +1 export, +1 Security token)
tech-stack:
  added: []
  patterns:
    - "platform_integrations metadata read mirroring getSelectedAIProvider()"
    - "dynamic adapter import keeps the factory independently type-checkable"
    - "reuse the single sanitizeField/<search_result> hardening boundary (no parallel path)"
key-files:
  created:
    - lib/estimate/price-research/provider.ts
    - lib/estimate/price-research/schema.ts
    - lib/estimate/price-research/search-prompt.ts
    - lib/estimate/price-research/adapters/openrouter-web.ts
    - lib/estimate/price-research/adapters/anthropic-web.ts
    - tests/unit/estimate/price-research-provider.test.ts
    - tests/unit/estimate/price-research-schema.test.ts
  modified:
    - lib/ai/prompt-builder.ts
    - tests/unit/ai/prompt-builder.test.ts
decisions:
  - "Placeholder adapter modules (openrouter-web/anthropic-web) return no-op misses so provider.ts is type-checkable and dispatchable in Plan 01; Plan 02 fills the real web-search lookup"
  - "isUsableCandidate trims source_url + snippet and requires a finite strictly-positive unit_price — the load-bearing evidence gate (Pitfall 1)"
  - "<search_result> inserted before the <instruction> clause so the generate-mode prompt diff is exactly one token (Pitfall 7 — no parallel Security path)"
metrics:
  duration: "~8m"
  tasks: 2
  files: 9
  completed: 2026-06-24
---

# Phase 107 Plan 01: Provider Seam Foundation + Injection Hardening Summary

Shipped the FOUNDATION of the price-research source seam: the `PriceResearchProvider` port (batched, evidence-gated by contract), the `getPriceResearchProvider()` factory that resolves the active source from `platform_integrations` and returns `null` when unconfigured (Phase-108 safe no-op), the zod schema that validates a research payload before trust, and the injection-hardening boundary (exported `sanitizeField` + a new `<search_result>` tag enumerated in `buildSystemPrompt`'s `## Security` block) that Plan 02/03 adapters build every prompt through. Nothing is wired into `generate-estimate.ts`.

## What Was Built

### Task 1 — PriceResearchProvider port + evidence-gated schema (commit c035f7f)
- `lib/estimate/price-research/provider.ts`: `Region`, `PriceResearchResult`, `PriceResearchProvider` (batched `lookup(items, region, currency)`), `PriceResearchSource` types; `isUsableCandidate()` evidence gate; `getActiveResearchSource()` reading `platform_integrations.metadata.research_source` (mirrors `getSelectedAIProvider()`); `getPriceResearchProvider()` factory dispatching to dynamically-imported adapters, `null` when unconfigured. `server-only`, channel-neutral.
- `lib/estimate/price-research/schema.ts`: `priceResearchResultSchema` + `priceResearchPayloadSchema` (zod), `safeParse` never throws.
- `lib/estimate/price-research/adapters/{openrouter-web,anthropic-web}.ts`: placeholder factory seams returning no-op misses (Plan 02 fills the real lookup).
- 21 unit tests: `isUsableCandidate` 7-row truth table (all false cases + the one true case), null-on-unconfigured (no service client / no row / unknown source), factory dispatch to mocked adapters; schema valid-parse / garbage-safeParse-false / null-fields-allowed.

### Task 2 — Injection-harden the research path (commit cf468c4)
- `lib/ai/prompt-builder.ts`: `sanitizeField` is now `export`ed (body unchanged); `## Security` block enumerates `, web search results (inside <search_result> tags)` before the `<instruction>` clause — a single inserted token, generate prompt otherwise byte-identical.
- `lib/estimate/price-research/search-prompt.ts`: `buildResearchSearchPrompt(items, region)` composes the batched US-market query, wrapping each model-supplied item name and the city/state through `sanitizeField` inside `<search_result>` tags. The ONLY place research item text enters a prompt (RFALL-04). Channel-neutral.
- 5 new prompt-builder tests (18 total): `<search_result>` enumerated in Security; existing tags not regressed; item-name `drywall <script>alert(1)</script>` produces escaped `&lt;script&gt;` and no raw `<script>`; null-region path.

## Verification
- `npx vitest run` (full suite): **266 files passed | 3 skipped, 1853 passed | 2 skipped | 33 todo** — no regressions vs the 264/1827 (106-02) baseline (+2 files, +26 assertions).
- Three plan files together: 39/39 green. Estimate + ai suites: 32 files / 193 green.
- `npx tsc --noEmit`: clean on all new/modified files.
- Channel neutrality: `grep -rc "lib/whatsapp"` on provider.ts / search-prompt.ts / schema.ts → 0 / 0 / 0.
- `git diff --name-only HEAD` does NOT include `lib/services/generate-estimate.ts` (nothing wired into the pipeline).
- Acceptance greps all pass (getPriceResearchProvider==1, isUsableCandidate==1, schema names==5, maybeSingle/platform_integrations==5, export sanitizeField==1, <search_result> present in both files).
- gitleaks ran on both commits (normal hooked commits, no `--no-verify`): no leaks found.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Created placeholder adapter modules so provider.ts is type-checkable**
- **Found during:** Task 1
- **Issue:** The plan's `getPriceResearchProvider()` uses `await import('./adapters/openrouter-web')` / `'./adapters/anthropic-web')`, but those modules are Plan 02 deliverables — `tsc --noEmit` cannot resolve the dynamic imports and would fail Plan 01's own type-check gate.
- **Fix:** Added thin placeholder modules `lib/estimate/price-research/adapters/{openrouter-web,anthropic-web}.ts` exporting the `make*WebProvider()` factories with a no-op `lookup` (returns `[]` = all misses, the correct degraded behavior until Plan 02 implements real web search). Each carries a doc comment marking Plan 02 as the owner of the real lookup body. This keeps Plan 01 independently type-checkable and the factory dispatch genuinely exercised, with zero Plan-02 logic.
- **Files modified:** lib/estimate/price-research/adapters/openrouter-web.ts, lib/estimate/price-research/adapters/anthropic-web.ts
- **Commit:** c035f7f

**2. [Rule 1 - Bug] Reworded doc comments to avoid tripping the channel-neutrality acceptance grep**
- **Found during:** Task 1
- **Issue:** A doc comment in provider.ts originally read "imports nothing from lib/whatsapp", which made the acceptance grep `grep -c "lib/whatsapp" provider.ts` return 1 instead of the required 0 (a false positive — the file has no such import).
- **Fix:** Reworded to "Channel-neutral (ENGINE-01): this module imports no channel package." (also applied to the two adapter files for consistency). The acceptance grep now returns 0 and the file remains genuinely channel-neutral.
- **Files modified:** lib/estimate/price-research/provider.ts (+ both adapter files)
- **Commit:** c035f7f

## Known Stubs

The two adapter modules (`adapters/openrouter-web.ts`, `adapters/anthropic-web.ts`) are intentional placeholder seams: `lookup()` returns `[]` (no candidates). This is by design — Plan 01 ships the port + factory shape; **Plan 107-02** implements the real `openrouter:web_search` (engine `exa`/`native`) and Anthropic `user_location` lookups. They are NOT wired into any production path (the seam is dormant until Phase 108), so the no-op cannot affect estimate generation. Documented in the plan as the explicit Plan-02 boundary.

## Self-Check: PASSED
- FOUND: lib/estimate/price-research/provider.ts
- FOUND: lib/estimate/price-research/schema.ts
- FOUND: lib/estimate/price-research/search-prompt.ts
- FOUND: lib/estimate/price-research/adapters/openrouter-web.ts
- FOUND: lib/estimate/price-research/adapters/anthropic-web.ts
- FOUND: tests/unit/estimate/price-research-provider.test.ts
- FOUND: tests/unit/estimate/price-research-schema.test.ts
- FOUND commit: c035f7f (Task 1)
- FOUND commit: cf468c4 (Task 2)
