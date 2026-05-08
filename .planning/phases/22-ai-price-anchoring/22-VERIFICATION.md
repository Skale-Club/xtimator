---
phase: 22-ai-price-anchoring
verified: 2026-05-07T22:22:00Z
status: passed
score: 9/9 must-haves verified
---

# Phase 22: AI Price Anchoring Verification Report

**Phase Goal:** The AI estimate generation pipeline loads the company's price book before generating, injects it as context into the Claude prompt, uses matched prices as anchors, falls back to market estimates when there is no match, and tags every output line item with its price origin.

**Verified:** 2026-05-07T22:22:00Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When a company has matching price book items, the generated estimate uses those prices | VERIFIED | `buildSystemPrompt` injects price book with explicit instruction to use exact `unit_price` and tag as `price_book`; `AnthropicAdapter` and `GeminiAdapter` pass this prompt to the model; `normalizeOutput` enforces the tag |
| 2 | When price book is empty or has no match, AI generates market-rate estimates — no regression | VERIFIED | `buildSystemPrompt` guards on `priceBookItems.length > 0`; empty array produces no injection section; fallback instruction sets `price_source` to `ai_estimate`; test: "no price book items → system prompt has no price book section" passes |
| 3 | Every line item in generated estimate JSON carries a `price_source` field set to either `price_book` or `ai_estimate`, and this value is persisted to `estimate_items.price_source` | VERIFIED | `LineItemOutput` type enforces `price_source: 'price_book' \| 'ai_estimate'`; `normalizeOutput` applies D-15 defensive fallback; route.ts line 269 maps `price_source: item.price_source` into `itemRows` insert |
| 4 | `getAIProvider()` factory reads DB and returns correct adapter | VERIFIED | `lib/ai/index.ts` queries `platform_integrations` for `ai_config` row; returns `GeminiAdapter` for `'gemini'`, `AnthropicAdapter` for all other values including `null` row |
| 5 | Route is thin — no direct SDK imports | VERIFIED | `import Anthropic` absent from `app/api/generate-estimate/route.ts`; only `getAIProvider` from `@/lib/ai` |
| 6 | `setActiveAIProvider` upserts `ai_config` row | VERIFIED | `app/admin/integrations/actions.ts` line 175 exports `setActiveAIProvider` which upserts `platform_integrations` with `provider='ai_config'` and `metadata.selected_ai_provider` |
| 7 | Admin panel shows Gemini key card and AIProviderSelector | VERIFIED | `page.tsx` PROVIDERS array includes `{ id: 'gemini' }`; `AIProviderSelector` rendered with `current={activeProvider}`; `ai-provider-selector.tsx` exists as client component |
| 8 | All 17 unit tests in `tests/unit/ai/` pass GREEN | VERIFIED | `npx vitest run tests/unit/ai/` — 5 files, 17/17 passed (spot-checked output) |
| 9 | No new test failures vs baseline | VERIFIED | Full suite: 9 failures, 380 pass — identical to documented baseline of 9 pre-existing failures |

**Score:** 9/9 truths verified

---

### Required Artifacts

| Artifact | Provides | Level 1 (Exists) | Level 2 (Substantive) | Level 3 (Wired) | Status |
|----------|----------|------------------|-----------------------|-----------------|--------|
| `lib/ai/types.ts` | `EstimateInput`, `EstimateOutput`, `LineItemOutput` with `price_source`, `PriceBookEntry`, `EstimateSectionOutput` | YES | YES — complete type definitions with `price_source: 'price_book' \| 'ai_estimate'` union | YES — imported by all lib/ai modules | VERIFIED |
| `lib/ai/provider.interface.ts` | `AIProvider` interface with `generateEstimate` | YES | YES — 6-line interface, fully typed | YES — implemented by both adapters | VERIFIED |
| `lib/ai/index.ts` | `getAIProvider()` factory reading `platform_integrations` | YES | YES — queries DB, uses dynamic imports, defaults to anthropic | YES — imported by route.ts | VERIFIED |
| `lib/ai/prompt-builder.ts` | `buildSystemPrompt` with 0-items guard and price book injection; `buildUserContent` | YES | YES — guards on `priceBookItems.length > 0`, injects compact `Category \| Name \| $price/unit` format, includes matching instruction | YES — imported by both adapters | VERIFIED |
| `lib/ai/normalize.ts` | `normalizeOutput` with D-15 defensive fallback | YES | YES — maps raw AI response to typed `EstimateOutput`; `price_source === 'price_book' ? 'price_book' : 'ai_estimate'` fallback | YES — imported by both adapters and `price-source-tagging.test.ts` | VERIFIED |
| `lib/ai/providers/anthropic.ts` | `AnthropicAdapter` with `price_source` in tool schema | YES | YES — `price_source` in `items[].required` array with `enum: ['price_book', 'ai_estimate']`; `tool_choice: { type: 'tool', name: 'create_estimate' }` | YES — dynamically imported by factory | VERIFIED |
| `lib/ai/providers/gemini.ts` | `GeminiAdapter` — `gemini-2.5-flash`, `FunctionCallingConfigMode.ANY` | YES | YES — model `gemini-2.5-flash`, `price_source` in `functionDeclarations`, `FunctionCallingConfigMode.ANY`, extracts via `response.functionCalls[0].args` | YES — dynamically imported by factory | VERIFIED |
| `lib/platform-config.ts` | `IntegrationProvider` includes `'gemini'`; `getSelectedAIProvider` exported | YES | YES — `'resend' \| 'anthropic' \| 'openai' \| 'gemini'`; `getSelectedAIProvider()` at line 227 | YES — imported by factory, page.tsx | VERIFIED |
| `app/api/generate-estimate/route.ts` | Thin route — no direct Anthropic import, uses `getAIProvider`, calls `getPriceBookItems`, persists `price_source` | YES | YES — 314 lines; `getAIProvider()` at line 131; `getPriceBookItems` at line 73; `price_source: item.price_source` at line 269 | YES — wires lib/ai to DB | VERIFIED |
| `app/admin/integrations/actions.ts` | `setActiveAIProvider` + `gemini` case in `testIntegrationKey` | YES | YES — `setActiveAIProvider` exported at line 175; `gemini` case at line 149 uses `GoogleGenAI` 1-token call | YES — called by `AIProviderSelector` | VERIFIED |
| `app/admin/integrations/page.tsx` | Gemini card in PROVIDERS + `AIProviderSelector` rendered | YES | YES — `{ id: 'gemini' }` in PROVIDERS at line 29; `ai_config` filter at line 77; `<AIProviderSelector current={activeProvider} />` at line 116 | YES — fetches `activeProvider`, passes to component | VERIFIED |
| `app/admin/integrations/ai-provider-selector.tsx` | Client component with radio buttons and `setActiveAIProvider` call | YES | YES — `'use client'`; `useState` + `useTransition`; radio buttons for `anthropic` and `gemini`; calls `setActiveAIProvider` in transition | YES — imported and rendered in page.tsx | VERIFIED |
| `tests/unit/ai/` (5 files, 17 tests) | Real GREEN assertions covering all 3 success criteria | YES | YES — all stubs replaced with real assertions; no `expect.fail('not implemented')` in any file | YES — run confirmed 17/17 passed | VERIFIED |

---

### Key Link Verification

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `app/api/generate-estimate/route.ts` | `lib/ai/index.ts` | `import { getAIProvider } from '@/lib/ai'` | WIRED | Line 7 import; line 131 call |
| `app/api/generate-estimate/route.ts` | `lib/queries/price-book.ts` | `import { getPriceBookItems } from '@/lib/queries/price-book'` | WIRED | Line 8 import; line 73 call with `supabase, companyId` |
| `app/api/generate-estimate/route.ts` | `estimate_items` table | `price_source: item.price_source` in `itemRows` map | WIRED | Line 269 — explicit field mapping with D-16 comment |
| `lib/ai/index.ts` | `platform_integrations` table | `createServiceClient().from('platform_integrations').select('metadata').eq('provider','ai_config').maybeSingle()` | WIRED | Lines 9-14 — reads `ai_config` row |
| `lib/ai/providers/anthropic.ts` | `@anthropic-ai/sdk` | `new Anthropic({ apiKey: await getIntegrationKey('anthropic') })` | WIRED | Lines 11-14 — per-request SDK init (ADMIN-06 compliant) |
| `lib/ai/providers/gemini.ts` | `@google/genai` | `new GoogleGenAI({ apiKey: await getIntegrationKey('gemini') })` | WIRED | Lines 11-14 — per-request SDK init |
| `lib/ai/prompt-builder.ts` | `EstimateInput.priceBookItems` | `priceBookItems.length > 0` guard | WIRED | Line 9 — conditional injection |
| `lib/ai/providers/anthropic.ts` | `lib/ai/normalize.ts` | `import { normalizeOutput } from '../normalize'` | WIRED | Line 7 import; line 93 call |
| `lib/ai/providers/gemini.ts` | `lib/ai/normalize.ts` | `import { normalizeOutput } from '../normalize'` | WIRED | Line 7 import; line 79 call |
| `tests/unit/ai/price-source-tagging.test.ts` | `lib/ai/normalize.ts` | `import { normalizeOutput } from '@/lib/ai/normalize'` | WIRED | Line 2 — tests the shared normalizer directly |
| `app/admin/integrations/page.tsx` | `app/admin/integrations/actions.ts` | `AIProviderSelector` calls `setActiveAIProvider` | WIRED | `ai-provider-selector.tsx` line 5 import; called in `handleChange` |

---

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `app/api/generate-estimate/route.ts` | `priceBookItems` | `getPriceBookItems(supabase, companyId)` — DB query in `lib/queries/price-book.ts` | YES — queries `company_price_book` table | FLOWING |
| `app/api/generate-estimate/route.ts` | `aiEstimate` | `provider.generateEstimate(estimateInput)` — real adapter call | YES — adapters call Anthropic/Gemini APIs with `priceBookItems` in prompt | FLOWING |
| `app/api/generate-estimate/route.ts` | `price_source` in `itemRows` | `item.price_source` from `aiEstimate` → `normalizeOutput` | YES — guaranteed non-null by D-15 fallback | FLOWING |
| `app/admin/integrations/page.tsx` | `activeProvider` | `getSelectedAIProvider()` → DB query for `ai_config` row | YES — reads `metadata.selected_ai_provider` from `platform_integrations` | FLOWING |

---

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| 17 Phase 22 unit tests pass | `npx vitest run tests/unit/ai/` | 5 files, 17/17 passed | PASS |
| No direct Anthropic import in route | `grep "import Anthropic" route.ts` | no match | PASS |
| `price_source` persisted in itemRows | `grep "price_source.*item.price_source" route.ts` | line 269 confirmed | PASS |
| `setActiveAIProvider` exported | `grep "setActiveAIProvider" actions.ts` | line 175 confirmed | PASS |
| Gemini model string correct | `grep "gemini-2.5-flash" gemini.ts` | line 62 confirmed | PASS |
| No `server-only` import in factory | `grep "server-only" lib/ai/index.ts` | no match | PASS |
| `ai_config` never passed to `getIntegrationKey` | `grep -r "getIntegrationKey.*ai_config" lib/ai/` | no match | PASS |
| SDK init inside method body | `grep -n "new Anthropic\|new GoogleGenAI" adapters` | both inside `generateEstimate()` body | PASS |
| Full suite — no new failures | `npx vitest run` | 9 failures (pre-existing), 380 pass | PASS |
| TypeScript clean | `npx tsc --noEmit \| grep "error TS" \| grep -v react-pdf` | empty output — 0 new errors | PASS |
| All 8 commits verified in git log | `git log --oneline \| grep <hashes>` | 473a54c, c5068cb, bbf49e4, 301421a, 262131f, c1189ba, 54981b1, 4810b2b all found | PASS |

---

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| AIPRICE-01 | 22-01, 22-02, 22-03 | AI receives price book as context and uses registered prices as anchors for matching items | SATISFIED | `buildSystemPrompt` injects price book with matching instruction; adapters receive and pass it to API; `prompt-builder.test.ts` tests exact format |
| AIPRICE-02 | 22-01, 22-02, 22-03 | When no match or price book is empty, AI uses market estimates — no regression | SATISFIED | `priceBookItems.length === 0` guard omits injection section; `buildSystemPrompt` test for empty case passes; full suite shows 0 new failures vs baseline |
| AIPRICE-03 | 22-01, 22-02, 22-03 | Each generated estimate line item is tagged with `price_book` or `ai_estimate` in `price_source`, and this is persisted to `estimate_items.price_source` | SATISFIED | `LineItemOutput.price_source` is required type; `normalizeOutput` D-15 fallback enforces non-null; route.ts line 269 persists to DB |

All 3 AIPRICE requirements are marked `[x]` (satisfied) in REQUIREMENTS.md. No orphaned requirements for Phase 22 were found.

---

### Anti-Patterns Found

No blockers or warnings found. Checked all Phase 22 files for:
- `TODO/FIXME/PLACEHOLDER` comments — none
- `expect.fail('not implemented')` stubs — none (all replaced with real assertions)
- Empty returns (`return null`, `return {}`, `return []`) — none in production code paths
- `server-only` import in `lib/ai/index.ts` — absent (correct per ADMIN-06)
- Hardcoded empty `priceBookItems: []` at call sites — the route fetches real items from DB; tests use `[]` only as valid input fixture (not a stub)
- `ai_config` passed to `getIntegrationKey()` — absent (correct; `ai_config` row has null ciphertext)

---

### Human Verification Required

The following behaviors are correct by code inspection but require a live environment to fully validate:

**1. Price Book Matching in Live Estimate**

**Test:** Create a company with at least one price book item (e.g., "Labor | General Labor | $65.00/hr"). Record audio describing that work type. Generate an estimate.
**Expected:** The generated estimate includes a line item for that labor at $65.00/unit_price, and the item carries `price_source: 'price_book'` in the DB row.
**Why human:** Requires live Anthropic API key, real audio transcription, and DB inspection — not testable without running the full stack.

**2. Market-Rate Fallback With Empty Price Book**

**Test:** Generate an estimate with a company that has no price book items configured.
**Expected:** Estimate generates normally with all items carrying `price_source: 'ai_estimate'`. Behavior is identical to pre-Phase-22 behavior.
**Why human:** Regression can only be fully validated end-to-end with a live AI API call.

**3. Admin Provider Switch**

**Test:** Visit `/admin/integrations`. Confirm the Gemini radio button is present. Switch active provider to Gemini (requires Gemini API key configured). Generate an estimate.
**Expected:** Estimate generates successfully using Gemini. Switch back to Anthropic — next estimate uses Claude.
**Why human:** Requires live Gemini API key and end-to-end estimate generation to confirm provider routing works in production.

---

## Summary

Phase 22 goal is fully achieved. The AI estimate generation pipeline:

1. **Loads price book** — `getPriceBookItems(supabase, companyId)` called in route before AI generation; result passed as `priceBookItems` in `EstimateInput`.
2. **Injects as context** — `buildSystemPrompt` conditionally adds a `## Your Company Price Book` section with compact `Category | Name | $price/unit` format and an explicit instruction to use those prices as anchors.
3. **Falls back gracefully** — empty `priceBookItems` array produces no injection; fallback instruction instructs AI to use market rates; 3/3 prompt-builder tests confirm this behavior.
4. **Tags every output line item** — `LineItemOutput.price_source` is a required TypeScript type; `normalizeOutput` applies D-15 defensive fallback ensuring `undefined`/`null`/unexpected values all become `'ai_estimate'`; 3/3 price-source-tagging tests confirm.
5. **Persists `price_source`** — route.ts `itemRows` map explicitly maps `price_source: item.price_source` to the `estimate_items` insert.
6. **Provider abstraction** — `getAIProvider()` factory reads `platform_integrations.metadata.selected_ai_provider` and returns `AnthropicAdapter` or `GeminiAdapter` via dynamic import; route has no direct SDK dependency.
7. **Admin control** — Gemini key card visible in `/admin/integrations`; `AIProviderSelector` radio component switches provider via `setActiveAIProvider` without redeploy.

All 17 unit tests GREEN. TypeScript clean. Full suite: 9 pre-existing failures, 0 new. All 8 commits verified in git log.

---

_Verified: 2026-05-07T22:22:00Z_
_Verifier: Claude (gsd-verifier)_
