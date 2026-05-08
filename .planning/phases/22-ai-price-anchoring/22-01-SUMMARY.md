---
phase: 22-ai-price-anchoring
plan: 01
subsystem: ai-provider-layer
tags: [wave-0, tdd-red, ai, provider-interface, gemini, anthropic, nyquist]
dependency_graph:
  requires:
    - "Phase 19 — estimate_items.price_source column (string | null) in DB"
    - "Phase 20 — getPriceBookItems(supabase, companyId) query available"
  provides:
    - "lib/ai/types.ts — EstimateInput, EstimateOutput, LineItemOutput, PriceBookEntry, EstimateSectionOutput"
    - "lib/ai/provider.interface.ts — AIProvider interface with generateEstimate method"
    - "lib/ai/index.ts — getAIProvider() factory skeleton"
    - "lib/ai/prompt-builder.ts — buildSystemPrompt + buildUserContent skeletons"
    - "lib/ai/normalize.ts — normalizeOutput stub (Wave 1 export location)"
    - "lib/ai/providers/anthropic.ts — AnthropicAdapter skeleton"
    - "lib/ai/providers/gemini.ts — GeminiAdapter skeleton"
    - "@google/genai@^2.0.0 installed in package.json"
    - "5 RED test files in tests/unit/ai/ — 17 failing stubs for Wave 1 contract"
  affects:
    - "Wave 1 (plan 22-02) — must implement all 17 stubs to GREEN"
    - "lib/ai/ source modules — all throwing skeletons"
tech_stack:
  added:
    - "@google/genai@^2.0.0 — official Google Generative AI SDK (replaces deprecated @google/generative-ai)"
  patterns:
    - "AIProvider interface pattern — adapters implement generateEstimate(input): Promise<EstimateOutput>"
    - "No 'use server' or 'import server-only' in any lib/ai/ file — test-importable from both server + vitest contexts"
    - "expect.fail('not implemented') stubs for Wave 0 RED state (Nyquist compliance — established Phase 18/20)"
    - "Explicit expect import in test files: import { describe, expect, it, vi } from 'vitest' — required even with globals:true for tsc"
key_files:
  created:
    - "lib/ai/types.ts"
    - "lib/ai/provider.interface.ts"
    - "lib/ai/index.ts"
    - "lib/ai/prompt-builder.ts"
    - "lib/ai/normalize.ts"
    - "lib/ai/providers/anthropic.ts"
    - "lib/ai/providers/gemini.ts"
    - "tests/unit/ai/prompt-builder.test.ts"
    - "tests/unit/ai/provider-factory.test.ts"
    - "tests/unit/ai/anthropic-adapter.test.ts"
    - "tests/unit/ai/gemini-adapter.test.ts"
    - "tests/unit/ai/price-source-tagging.test.ts"
  modified:
    - "package.json — added @google/genai@^2.0.0"
    - "package-lock.json — lockfile updated"
decisions:
  - "lib/ai/normalize.ts created as Wave 0 stub (not in original plan spec) so price-source-tagging.test.ts import resolves without TypeScript errors — Wave 1 implements the real function"
  - "explicit expect added to all vitest imports — tsc fails on globals even with globals:true in vitest.config; existing test pattern requires explicit import"
metrics:
  duration: "12min"
  tasks_completed: 2
  files_created: 13
  files_modified: 2
  completed_date: "2026-05-08"
requirements: [AIPRICE-01, AIPRICE-02, AIPRICE-03]
---

# Phase 22 Plan 01: Wave 0 Scaffold — lib/ai/ Skeleton + RED Test Stubs Summary

Installed `@google/genai@^2.0.0`, scaffolded 7 skeleton source files in `lib/ai/`, and created 5 RED test stubs in `tests/unit/ai/` — establishing the Nyquist-compliant Wave 0 contract that Wave 1 (plan 22-02) must implement against.

## Tasks Executed

### Task 1: Install @google/genai and scaffold lib/ai/ skeleton files

**Commit:** `473a54c`

Ran `npm install @google/genai` — adds `@google/genai@^2.0.0` to package.json dependencies (the new official SDK; `@google/generative-ai` is deprecated since Nov 2025).

Created 7 skeleton files:

- `lib/ai/types.ts` — complete type definitions: `PriceBookEntry`, `LineItemOutput` (with required `price_source: 'price_book' | 'ai_estimate'` — D-03), `EstimateSectionOutput`, `EstimateOutput`, `EstimateInput` (with `priceBookItems: PriceBookEntry[]` for D-10 injection).
- `lib/ai/provider.interface.ts` — `AIProvider` interface with `generateEstimate(input: EstimateInput): Promise<EstimateOutput>`.
- `lib/ai/index.ts` — `getAIProvider()` factory stub (throws "not implemented"); re-exports type aliases from `./types`.
- `lib/ai/prompt-builder.ts` — `buildSystemPrompt` + `buildUserContent` stubs (both throw).
- `lib/ai/normalize.ts` — `normalizeOutput` stub (Wave 1 implements; Wave 0 needs this for `price-source-tagging.test.ts` import resolution).
- `lib/ai/providers/anthropic.ts` — `AnthropicAdapter` class implementing `AIProvider` (throws).
- `lib/ai/providers/gemini.ts` — `GeminiAdapter` class implementing `AIProvider` (throws).

No `'use server'` or `'import server-only'` in any lib/ai/ file — these are importable from both API route (server) and vitest (non-server) contexts.

**Verification:** `npx tsc --noEmit` — zero new errors beyond pre-existing 5 `@react-pdf/renderer` errors.

### Task 2: Create 5 RED test stubs in tests/unit/ai/

**Commit:** `c5068cb`
**Fix commit:** `bbf49e4` (Rule 2 auto-fix — see Deviations)

Created `tests/unit/ai/` directory with 5 test files, all using `expect.fail('not implemented')` for every test body:

- `prompt-builder.test.ts` — 3 stubs: no price book → no section; items present → compact list format; items present → matching instruction
- `provider-factory.test.ts` — 3 stubs: returns AnthropicAdapter for 'anthropic'; returns GeminiAdapter for 'gemini'; defaults to AnthropicAdapter when no row
- `anthropic-adapter.test.ts` — 4 stubs: price_source in input_schema required; tool_choice forces tool; returns EstimateOutput with price_source; defensive fallback to ai_estimate
- `gemini-adapter.test.ts` — 4 stubs: functionDeclarations contains price_source; FunctionCallingConfigMode.ANY in toolConfig; returns EstimateOutput from functionCalls[0].args; defensive fallback to ai_estimate
- `price-source-tagging.test.ts` — 3 stubs: matched item price_source='price_book'; unmatched='ai_estimate'; undefined price_source → 'ai_estimate' (imports from `@/lib/ai/normalize`)

Class-based `vi.mock` factories used for `@anthropic-ai/sdk` and `@google/genai` (established Phase 08 pattern).

**Verification:**
- `npx vitest run tests/unit/ai/` — 5 test files failed, 17 tests failed (RED state confirmed)
- `npx vitest run tests/unit/price-book` — 30/30 GREEN (no regression)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added lib/ai/normalize.ts stub**
- **Found during:** Task 2
- **Issue:** `price-source-tagging.test.ts` imports from `@/lib/ai/normalize` (per plan spec: "This import is intentionally forward-referencing the Wave 1 artifact") — but that file didn't exist in the plan's Task 1 file list. Without the file, TypeScript would fail to compile the test file.
- **Fix:** Created `lib/ai/normalize.ts` with a `normalizeOutput` stub that throws "not implemented". Wave 1 (plan 22-02) will implement the real function.
- **Files modified:** `lib/ai/normalize.ts` (created)
- **Commit:** `473a54c`

**2. [Rule 2 - Missing Critical] Added explicit `expect` import to all 5 test files**
- **Found during:** Task 2 verification (`npx tsc --noEmit`)
- **Issue:** Plan spec showed test stubs without importing `expect` from vitest (relying on `globals: true` in vitest.config.ts). However, `tsc` does not honor vitest globals — it reported 17 "Cannot find name 'expect'" errors in the new test files. All existing test files in the codebase explicitly import `expect` from vitest.
- **Fix:** Added `expect` to the vitest import in all 5 test files: `import { describe, expect, it, vi } from 'vitest'`
- **Files modified:** All 5 `tests/unit/ai/*.test.ts` files
- **Commit:** `bbf49e4`

## Validation Results

| Check | Command | Result |
|-------|---------|--------|
| @google/genai in package.json | `node -e "console.log(...)"` | `^2.0.0` |
| All skeleton files exist | `ls lib/ai/...` | 7/7 found |
| Wave 0 RED state | `npx vitest run tests/unit/ai/` | 17/17 fail |
| Price-book regression | `npx vitest run tests/unit/price-book` | 30/30 GREEN |
| TypeScript clean | `npx tsc --noEmit \| grep error` (excluding react-pdf) | 0 new errors |

## Known Stubs

All lib/ai/ source files are intentional stubs — Wave 0 design:

| File | Stub | Reason |
|------|------|--------|
| `lib/ai/index.ts:getAIProvider()` | throws 'not implemented' | Wave 1 plan 22-02 implements |
| `lib/ai/prompt-builder.ts:buildSystemPrompt()` | throws 'not implemented' | Wave 1 plan 22-02 implements |
| `lib/ai/prompt-builder.ts:buildUserContent()` | throws 'not implemented' | Wave 1 plan 22-02 implements |
| `lib/ai/normalize.ts:normalizeOutput()` | throws 'not implemented' | Wave 1 plan 22-02 implements |
| `lib/ai/providers/anthropic.ts:generateEstimate()` | throws 'not implemented' | Wave 1 plan 22-02 implements |
| `lib/ai/providers/gemini.ts:generateEstimate()` | throws 'not implemented' | Wave 1 plan 22-02 implements |

These stubs are intentional Wave 0 artifacts. They do NOT prevent the plan's goal (establishing the type contract and RED test suite). Wave 1 (plan 22-02) resolves all stubs.

## Wave 1 Handoff

Wave 1 (Plan 22-02) receives:

- 17 RED test stubs with exact behavior descriptions to implement against
- Full type contracts in `lib/ai/types.ts` (no changes needed to types)
- Skeleton files with correct exports/interfaces to fill in
- `@google/genai` already installed
- Test mock patterns already established (class-based vi.mock for both SDKs)

## Self-Check: PASSED

- FOUND: `lib/ai/types.ts`
- FOUND: `lib/ai/provider.interface.ts`
- FOUND: `lib/ai/index.ts`
- FOUND: `lib/ai/prompt-builder.ts`
- FOUND: `lib/ai/normalize.ts`
- FOUND: `lib/ai/providers/anthropic.ts`
- FOUND: `lib/ai/providers/gemini.ts`
- FOUND: `tests/unit/ai/prompt-builder.test.ts`
- FOUND: `tests/unit/ai/provider-factory.test.ts`
- FOUND: `tests/unit/ai/anthropic-adapter.test.ts`
- FOUND: `tests/unit/ai/gemini-adapter.test.ts`
- FOUND: `tests/unit/ai/price-source-tagging.test.ts`
- FOUND: commit `473a54c` (Task 1)
- FOUND: commit `c5068cb` (Task 2)
- FOUND: commit `bbf49e4` (Task 2 fix)
