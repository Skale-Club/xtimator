---
phase: 22-ai-price-anchoring
plan: 02
subsystem: ai-provider-layer
tags: [wave-1, tdd-green, ai, anthropic, gemini, price-book, normalize]
dependency_graph:
  requires:
    - "Phase 22 Plan 01 — lib/ai/ skeleton files + 17 RED test stubs"
    - "Phase 19 — estimate_items.price_source column"
    - "Phase 20 — getPriceBookItems() query"
    - "@google/genai@^2.0.0 installed (Plan 22-01)"
  provides:
    - "lib/ai/prompt-builder.ts — buildSystemPrompt (price book injection) + buildUserContent"
    - "lib/ai/normalize.ts — normalizeOutput EXPORTED with D-15 defensive fallback"
    - "lib/ai/index.ts — getAIProvider() factory reading platform_integrations ai_config row"
    - "lib/ai/providers/anthropic.ts — AnthropicAdapter with price_source in tool schema"
    - "lib/ai/providers/gemini.ts — GeminiAdapter gemini-2.5-flash + FunctionCallingConfigMode.ANY"
    - "lib/platform-config.ts — IntegrationProvider extended with 'gemini', getSelectedAIProvider() added"
    - "17/17 tests GREEN in tests/unit/ai/"
  affects:
    - "app/api/generate-estimate/route.ts — can now call getAIProvider() + provider.generateEstimate()"
    - "app/admin/integrations — Gemini key card now type-safe (IntegrationProvider + schema updated)"
tech_stack:
  added: []
  patterns:
    - "normalizeOutput shared helper in lib/ai/normalize.ts — both adapters import from same source (no duplication)"
    - "D-15 defensive fallback: item.price_source === 'price_book' ? 'price_book' : 'ai_estimate' — covers undefined/null/missing"
    - "No import server-only in lib/ai/index.ts — server-only by convention comment only (vitest importability)"
    - "SDK init inside method body (per-request) — ADMIN-06 compliance for both adapters"
    - "Dynamic import() in getAIProvider() factory — avoids loading both adapter SDK modules on every request"
key_files:
  created: []
  modified:
    - "lib/ai/prompt-builder.ts — full implementation replacing throwing stubs"
    - "lib/ai/normalize.ts — full exported normalizeOutput replacing throwing stub"
    - "lib/ai/index.ts — full getAIProvider() factory replacing throwing stub"
    - "lib/ai/providers/anthropic.ts — AnthropicAdapter implementation"
    - "lib/ai/providers/gemini.ts — GeminiAdapter implementation"
    - "lib/platform-config.ts — IntegrationProvider + 'gemini' + getSelectedAIProvider()"
    - "lib/schemas/admin.ts — integrationKeySchema z.enum extended with 'gemini'"
    - "app/admin/integrations/actions.ts — testIntegrationKey 'gemini' case added (D-18)"
    - "tests/unit/ai/prompt-builder.test.ts — 3/3 stubs → GREEN assertions"
    - "tests/unit/ai/provider-factory.test.ts — 3/3 stubs → GREEN assertions"
    - "tests/unit/ai/anthropic-adapter.test.ts — 4/4 stubs → GREEN assertions"
    - "tests/unit/ai/gemini-adapter.test.ts — 4/4 stubs → GREEN assertions"
    - "tests/unit/ai/price-source-tagging.test.ts — 3/3 stubs → GREEN assertions"
decisions:
  - "lib/ai/index.ts uses dynamic import() for adapter modules — avoids loading both adapter SDKs on every request"
  - "lib/schemas/admin.ts integrationKeySchema extended with 'gemini' (Rule 1 auto-fix) — required for TypeScript compatibility after IntegrationProvider extension"
  - "testIntegrationKey 'gemini' case added to actions.ts (Rule 1 auto-fix, D-18) — avoids exhaustiveness fallback for new provider"
metrics:
  duration: "6min"
  tasks_completed: 3
  files_created: 0
  files_modified: 13
  completed_date: "2026-05-08"
requirements: [AIPRICE-01, AIPRICE-02, AIPRICE-03]
---

# Phase 22 Plan 02: Wave 1 Implementation — lib/ai/ GREEN + Price Source Normalization Summary

Full implementation of the lib/ai/ provider abstraction layer: buildSystemPrompt with price book injection, shared normalizeOutput with defensive fallback, getAIProvider() factory reading DB, AnthropicAdapter migrating route Steps 2-4 with price_source in tool schema, GeminiAdapter using gemini-2.5-flash and FunctionCallingConfigMode.ANY — turning all 17 RED test stubs GREEN.

## Tasks Executed

### Task 1: Implement prompt-builder.ts — prompt-builder.test.ts 3/3 GREEN

**Commit:** `301421a`

Replaced throwing stubs in `lib/ai/prompt-builder.ts` with real implementations:

- `buildSystemPrompt(input)`: when `priceBookItems.length === 0` — returns prompt without `## Your Company Price Book` section. When items exist — appends the price book block with `- Category | Name | $XX.XX/unit` compact format and explicit instruction `set price_source to "price_book"`.
- `buildUserContent(input)`: formats project info, transcripts, photo descriptions into human-readable user message.

Updated `tests/unit/ai/prompt-builder.test.ts`: removed `vi.mock` of the module itself (was mocking the module under test — Wave 0 artifact), replaced `expect.fail('not implemented')` with real assertions against `buildSystemPrompt`. 3/3 GREEN.

### Task 2a: Implement getAIProvider() factory + extend platform-config.ts — provider-factory.test.ts 3/3 GREEN

**Commit:** `262131f`

Extended `lib/platform-config.ts`:
- `IntegrationProvider` union: added `'gemini'`
- `getSelectedAIProvider()` function added (exported) — queries `platform_integrations` where `provider='ai_config'`, reads `metadata.selected_ai_provider`, returns `'anthropic'` | `'gemini'`

Implemented `lib/ai/index.ts`:
- `getAIProvider()`: queries `platform_integrations` for `ai_config` row, reads `metadata.selected_ai_provider`, uses dynamic `import()` to load `GeminiAdapter` or `AnthropicAdapter`. Falls back to `'anthropic'` when no row exists.
- No `import 'server-only'` — comment-only convention (test runner cannot import `server-only` package; module is only used from API routes in production).
- Re-exports `EstimateSectionOutput` (added to exports list — was missing from Wave 0 skeleton).

Updated `tests/unit/ai/provider-factory.test.ts`: added `import` statements for modules under test, replaced `expect.fail` stubs with real assertions using chained Supabase mock returning `maybeSingle()`. 3/3 GREEN.

### Task 2b: Create normalize.ts + implement adapters — 11/11 remaining tests GREEN

**Commit:** `c1189ba`

`lib/ai/normalize.ts`: exported `normalizeOutput(raw)` — maps raw AI response to typed `EstimateOutput`. D-15 defensive fallback: `item.price_source === 'price_book' ? 'price_book' : 'ai_estimate'` handles undefined, null, missing field, and any unexpected value.

`lib/ai/providers/anthropic.ts`: `AnthropicAdapter` migrates route.ts Steps 2-4 verbatim (model `claude-sonnet-4-20250514`, `tool_choice: { type: 'tool', name: 'create_estimate' }`, extract via `content.find(b => b.type === 'tool_use').input`). Adds `price_source` to items required array with `enum: ['price_book', 'ai_estimate']`. Calls `normalizeOutput` from shared module.

`lib/ai/providers/gemini.ts`: `GeminiAdapter` uses `@google/genai` v2 SDK — `new GoogleGenAI({ apiKey })`, model `gemini-2.5-flash`, `FunctionCallingConfigMode.ANY` + `allowedFunctionNames: ['create_estimate']`, extracts via `response.functionCalls[0].args`. `price_source` as `Type.STRING` with description (no Gemini Type.ENUM). Calls `normalizeOutput` from shared module.

Updated 3 test files with real assertions. All 4+4+3 = 11 tests GREEN.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Extended integrationKeySchema with 'gemini' in lib/schemas/admin.ts**
- **Found during:** Post-task TypeScript check
- **Issue:** `tsc --noEmit` reported 4 errors in `integration-card.tsx` — the Zod schema `z.enum(['resend', 'anthropic', 'openai'])` didn't include `'gemini'`, causing type mismatch when `IntegrationProvider` was extended. `IntegrationKeyInput.provider` couldn't accept the broader type.
- **Fix:** Added `'gemini'` to the `z.enum` array in `lib/schemas/admin.ts`.
- **Files modified:** `lib/schemas/admin.ts`
- **Commit:** `c1189ba` (same task commit — fix was inline before commit)

**2. [Rule 1 - Bug] Added 'gemini' case to testIntegrationKey in app/admin/integrations/actions.ts**
- **Found during:** Post-task TypeScript check (RESEARCH.md Pitfall 4 — switch exhaustiveness)
- **Issue:** After adding `'gemini'` to `IntegrationProvider`, the `testIntegrationKey` switch/if-chain in `actions.ts` would fall through to the `Unknown provider` fallback when admin tests a Gemini key. D-18 (CONTEXT.md) explicitly specifies this case must be handled.
- **Fix:** Added `if (input.provider === 'gemini')` case — uses `GoogleGenAI` per-request with `ai.models.generateContent({ model: 'gemini-2.5-flash', contents: 'hi', config: { maxOutputTokens: 1 } })` and returns timing message on success.
- **Files modified:** `app/admin/integrations/actions.ts`
- **Commit:** `c1189ba` (same task commit — fix was inline before commit)

## Validation Results

| Check | Command | Result |
|-------|---------|--------|
| Full AI unit suite | `npx vitest run tests/unit/ai/` | 17/17 PASS |
| Price-book regression | `npx vitest run tests/unit/price-book` | 30/30 GREEN |
| TypeScript clean | `npx tsc --noEmit \| grep error TS \| grep -v react-pdf` | 0 errors |
| No server-only in index.ts | `grep "server-only" lib/ai/index.ts` | ok |
| Model string | `grep "gemini-2.5-flash" lib/ai/providers/gemini.ts` | confirmed |
| SDK init inside method | `grep -n "new Anthropic\|new GoogleGenAI" ...` | both inside generateEstimate() body |
| No ai_config to getIntegrationKey | `grep -r "getIntegrationKey.*ai_config" lib/ai/` | ok |
| normalizeOutput exported | `grep "export function normalizeOutput" lib/ai/normalize.ts` | confirmed |

## Known Stubs

None — all Wave 0 stubs resolved. All lib/ai/ source files are fully implemented.

## Self-Check: PASSED

- FOUND: `lib/ai/prompt-builder.ts` — fully implemented
- FOUND: `lib/ai/normalize.ts` — exports normalizeOutput
- FOUND: `lib/ai/index.ts` — no server-only import, has convention comment
- FOUND: `lib/ai/providers/anthropic.ts` — AnthropicAdapter implemented
- FOUND: `lib/ai/providers/gemini.ts` — GeminiAdapter with gemini-2.5-flash
- FOUND: `lib/platform-config.ts` — IntegrationProvider includes 'gemini', getSelectedAIProvider exported
- FOUND: commit `301421a` (Task 1)
- FOUND: commit `262131f` (Task 2a)
- FOUND: commit `c1189ba` (Task 2b)
- FOUND: 17/17 tests GREEN in tests/unit/ai/
- FOUND: 30/30 tests GREEN in tests/unit/price-book (no regression)
- FOUND: TypeScript clean (0 new errors after auto-fixes)
