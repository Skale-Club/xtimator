---
phase: 166-ai-reliability-output-integrity
plan: 01
subsystem: api
tags: [openrouter, gemini, anthropic-sdk, abortsignal, finish-reason, tool-schema, temperature, vitest]

# Dependency graph
requires:
  - phase: 107-price-research
    provides: openrouter-web + anthropic-web research adapters (never-throw contract this plan bounds with timeouts)
  - phase: 110-cost-observability
    provides: recordAICost + usage.include cost capture the truncation path deliberately skips (noted for 167)
provides:
  - Every AI fetch in lib/ai + lib/estimate/price-research carries an AbortSignal timeout (120s chat, 300s research/agentic)
  - AI_CHAT_TIMEOUT_MS exported from lib/ai/openrouter-client.ts (single source for the 120s budget)
  - TruncatedOutputError exported from lib/ai/with-fallback.ts — finish_reason==='length' is typed, diagnosable, and NOT terminal (fallback still fires)
  - Symmetric 8192 output budgets (OpenRouter max_tokens / Gemini maxOutputTokens in BOTH methods)
  - estimateToolSchema exported with taxable/tax_category/cost/markup_pct on the PRIMARY path (parity test locks drift)
  - temperature 0.3 pinned on both providers, generate + refine
affects: [166-02 consistency checks, 167 cost integrity, price-research, estimate-generation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Marker-error class with readonly brand flag (TruncatedOutputError.truncated) beside InvalidEstimateOutputError — survives module-instance boundaries"
    - "finish_reason checked BEFORE tool-call-args guard so truncation is typed regardless of how much output survived"
    - "reportSilentFallback prefixes primary error .name into the ops alert message for diagnosability"

key-files:
  created:
    - tests/unit/ai/openrouter-timeout.test.ts
    - tests/unit/ai/openrouter-truncation.test.ts
    - tests/unit/ai/tool-schema-fields.test.ts
  modified:
    - lib/ai/providers/openrouter.ts
    - lib/ai/providers/gemini.ts
    - lib/ai/with-fallback.ts
    - lib/ai/needs-details.ts
    - lib/ai/openrouter-client.ts
    - lib/estimate/price-research/adapters/openrouter-web.ts
    - lib/estimate/price-research/adapters/anthropic-web.ts

key-decisions:
  - "RESEARCH_TIMEOUT_MS (300s) kept as a local const in each research adapter rather than exporting a second constant from openrouter-client.ts — the plan's single-source rule applies to the 120s chat budget (AI_CHAT_TIMEOUT_MS); the research budget is a different number with its own rationale"
  - "TruncatedOutputError placed in with-fallback.ts (not a new errors module) — matches the InvalidEstimateOutputError precedent exactly"
  - "Gemini config comments phrased WITHOUT the literal string 'generationConfig' so the plan's grep gate (0 hits) stays meaningful"

patterns-established:
  - "Every raw AI fetch must carry signal: AbortSignal.timeout(...) — 120s single-completion, 300s multi-step agentic/transcription"
  - "Read finish_reason on every chat-completions response before trusting tool-call arguments"

requirements-completed: [AIREL-01, AIREL-02, AIREL-03, AIREL-05]

# Metrics
duration: 29min implementation (+ ~2.5h full-suite verification under 3-executor machine contention)
completed: 2026-07-17
---

# Phase 166 Plan 01: AI Reliability — Timeouts, Truncation, Schema Parity, Temperature Summary

**Every AI fetch is now bounded (120s/300s AbortSignal), finish_reason==='length' throws a typed TruncatedOutputError that can no longer persist a silent partial estimate, the primary OpenRouter tool schema finally asks for taxable/tax_category/cost/markup_pct, and both providers run generate+refine at temperature 0.3 with symmetric 8192-token output budgets.**

## Performance

- **Duration:** 29 min implementation (10:16 → 10:45); full-suite verification stretched to ~13:40 by three GSD executors running vitest concurrently on this machine
- **Started:** 2026-07-17T14:16:00Z
- **Completed:** 2026-07-17T17:45:00Z
- **Tasks:** 3/3
- **Files modified:** 7 source + 3 new test files

## Accomplishments

- **AIREL-01 (audit C1):** closed the ONLY unbounded fetch on the primary generation path (`openrouter.ts` callTool) plus the three other unbounded AI calls. A hung socket now throws within budget, making the Gemini fallback actually reachable and unpinning the Inngest step.
- **AIREL-02 (audit C2):** `finish_reason` is read for the first time. A length-stop now throws `TruncatedOutputError` — including when the truncated JSON happens to be VALID (the silent-partial killer, pinned by test) — and the fallback ops alert names the error class so truncation stops masquerading as "malformed tool-call arguments". Output budgets raised 4096→8192 symmetric across providers.
- **AIREL-03 (audit C3):** the live OpenRouter tool schema now declares `taxable`, `tax_category` (enum labor|materials|other), `cost`, `markup_pct` — per-category tax (TAX-03) and cost+markup (MARK-01) now work on the PRIMARY path, not only via Gemini fallback/refine. A static parity test locks the schema against the exact drift class the audit caught.
- **AIREL-05 (audit C5):** `temperature: 0.3` pinned in the OpenRouter body (covers generate+refine) and in BOTH Gemini flat-`config` blocks.

## Task Commits

Each task was committed atomically:

1. **Task 1: Timeouts everywhere (AIREL-01)** — `3899c28c` (feat)
2. **Task 2: finish_reason + max_tokens + TruncatedOutputError (AIREL-02)** — `8ec052d1` (feat)
3. **Task 3: Tool-schema pricing fields + pinned temperature (AIREL-03/05)** — `f9d2c1cc` (feat)

Note: commits are interleaved on main with concurrent Phase 164/169 executor commits (parallel wave execution).

## Fetch-Timeout Sweep (AIREL-01 verification gate)

`grep -rn "fetch(" lib/ai/ lib/estimate/price-research/` (excluding tests) — every hit verified to carry a signal:

| # | Call site | Endpoint | Timeout | Status |
|---|-----------|----------|---------|--------|
| 1 | `lib/ai/providers/openrouter.ts:236` (callTool — PRIMARY generation/refine) | OR `/chat/completions` | 120s `AI_CHAT_TIMEOUT_MS` | **ADDED this plan** |
| 2 | `lib/ai/needs-details.ts:92` (best-effort classification) | OR `/chat/completions` | 120s `AI_CHAT_TIMEOUT_MS` | **ADDED this plan** (abort degrades to SAFE_FALLBACK — never-throw preserved) |
| 3 | `lib/estimate/price-research/adapters/openrouter-web.ts:161` (agentic web-search) | OR `/chat/completions` + web_search tool | 300s `RESEARCH_TIMEOUT_MS` | **ADDED this plan** (abort degrades to research miss — never-throw preserved) |
| 4 | `lib/estimate/price-research/adapters/anthropic-web.ts` (SDK, not raw fetch) | Anthropic `messages.create` | 300s via `new Anthropic({ apiKey, timeout })`, default maxRetries kept | **ADDED this plan** (SDK default was 10 min) |
| 5 | `lib/ai/openrouter-client.ts:116` (transcription primary) | OR `/audio/transcriptions` | 300s | pre-existing |
| 6 | `lib/ai/openrouter-client.ts:157` (transcription fallback) | OpenAI `/audio/transcriptions` | 300s | pre-existing |
| 7 | `lib/ai/openrouter-client.ts:259` (vision) | OR `/chat/completions` | 120s | pre-existing |
| 8 | `lib/ai/openrouter-client.ts:365` (translation) | OR `/chat/completions` | 120s | pre-existing |

No unbounded AI fetch remains in either tree.

## Per-File Changes

- `lib/ai/openrouter-client.ts` — ONLY change: `AI_CHAT_TIMEOUT_MS` now `export`ed (was module-private) + doc comment. Transcription/vision sections untouched (other plans' territory per hard constraints).
- `lib/ai/providers/openrouter.ts` — import + attach `AbortSignal.timeout(AI_CHAT_TIMEOUT_MS)`; `finish_reason?: string` added to response type; truncation check placed BEFORE the `!argsJson` guard; `max_tokens` 4096→8192; `temperature: 0.3`; `estimateToolSchema` exported; four pricing fields added to the item schema (optional, NOT in `required[]`, Gemini-matching descriptions).
- `lib/ai/providers/gemini.ts` — `maxOutputTokens: 8192` + `temperature: 0.3` in BOTH `generateEstimate` (flat config) and `refineEstimate` (flat config). No nested generation-params sub-object anywhere (grep gate: 0 hits).
- `lib/ai/with-fallback.ts` — `TruncatedOutputError` added beside `InvalidEstimateOutputError` (marker `truncated = true as const`, named, NOT terminal — falls through to the fallback branch like any generic throw); `reportSilentFallback` now prefixes `err.name` into the alert message. `callWithFallback` control flow untouched.
- `lib/ai/needs-details.ts` — timeout attached; existing outer try/catch verified to swallow AbortError (degrades, never throws).
- `lib/estimate/price-research/adapters/openrouter-web.ts` — local `RESEARCH_TIMEOUT_MS = 300_000` + signal; surrounding never-throw catch converts abort to all-misses.
- `lib/estimate/price-research/adapters/anthropic-web.ts` — `new Anthropic({ apiKey, timeout: RESEARCH_TIMEOUT_MS })`, default maxRetries preserved.
- `tests/unit/ai/openrouter-timeout.test.ts` (new) — AbortSignal attached from the shared constant; aborted primary → fallback fires exactly once.
- `tests/unit/ai/openrouter-truncation.test.ts` (new, 8 tests) — (a) length+invalid JSON → TruncatedOutputError not the malformed-JSON error; (b) length+VALID JSON → STILL TruncatedOutputError; (c) stop/tool_calls+valid → parses; length+no-args → truncation not the generic no-estimate error; marker/message shape; non-terminal through callWithFallback; ops alert names the class.
- `tests/unit/ai/tool-schema-fields.test.ts` (new, 7 tests) — static import of the exported schema; superset of the 9 zod-mirrored item fields; tax_category enum parity; types; the 4 new fields NOT in required[]; pre-existing required[] untouched.

## Test Evidence

- `npx vitest run tests/unit/ai/` → **23 files / 155 tests, all GREEN** (includes the 3 new suites and every pre-existing provider/fallback/cost test).
- `npx tsc --noEmit -p tsconfig.ci.json` → **clean, 0 errors**.
- `npx vitest run tests/unit/estimate/price-research-openrouter-web.test.ts tests/unit/estimate/price-research-anthropic-web.test.ts` → GREEN (research adapter contracts intact).
- `npm test` (full suite, 487 files / 3600 tests) → 3552 passed; 23 failures all investigated:
  - 17 were pure 30s/15s test timeouts + worker-fork startup failures caused by THREE concurrent GSD executors running vitest on this machine simultaneously (environment time 9,928s vs test time 1,097s). Every affected file re-run in isolation → GREEN (verified directly: topup-pack-card, price-research-orchestrator, generate-estimate-dispatch, save-seo, transcribe-dispatch, transcribe-fallback, empty-output-guards, whatsapp/batch-reporting, whatsapp/never-reply-regression, mcp-route-contract — 40/40 + 16/16).
  - 1 (`landing-page.test.tsx` AuthDialog auto-open) is an ambient, pre-existing portal-timing flake — PROVEN unrelated by worktree bisect: it passed and later failed at the pre-milestone commit `af208989` with identical code. Logged to `deferred-items.md`, not fixed (scope boundary).

## Regression Contracts (audit § final — verified)

- `callWithFallback` falls back exactly once — control flow untouched; `with-fallback.test.ts` 12/12 GREEN.
- `InvalidEstimateOutputError` semantics untouched (still terminal/rethrown pre-fallback).
- `ProvidersUnavailableError` untouched.
- BYOK `apiKeyOverride` path untouched (`openrouter-cost-capture.test.ts` GREEN).
- ENG-01 "AI has no calculator" language preserved verbatim in the new field descriptions; `no-ai-calculator.test.ts` GREEN.

## Decisions Made

1. **RESEARCH_TIMEOUT_MS local per adapter** — the plan mandates ONE exported constant for the 120s chat budget (done); the 300s research budget is a deliberately different number, kept as a documented local const in each of the two research adapters rather than widening openrouter-client.ts's export surface.
2. **TruncatedOutputError lives in with-fallback.ts** — beside InvalidEstimateOutputError, same marker-brand pattern, no new errors module.
3. **Comment phrasing avoids the literal 'generationConfig' string** — the plan's grep gate demands 0 hits in gemini.ts; the SDK-shape warning is expressed without the banned token so the gate stays a meaningful tripwire.

## Deviations from Plan

None - plan executed exactly as written. (One in-flight correction: Task 1's edit briefly imported TruncatedOutputError before Task 2 created it; caught by tsc and removed before the Task 1 commit — no deviation in any committed state.)

## Known Stubs

None — all code paths are fully wired; no placeholder values or unwired components introduced.

## Issues Encountered

- **Machine contention during verification:** three GSD executors (166-01, 164-01, 169-01/02) ran vitest concurrently, producing worker-fork startup timeouts and 30s test timeouts in two full-suite runs. Resolved by re-running every failing file in isolation (all GREEN except the one ambient flake documented in deferred-items.md).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 166-02 (AIREL-04 consistency checks in lib/services/generate-estimate.ts) can proceed — this plan deliberately did not touch that file; `TruncatedOutputError` and the exported schema are available for it.
- Phase 167 (cost integrity): the truncated-primary `usage.cost` non-recording is re-confirmed and logged in deferred-items.md.

## Self-Check: PASSED

- `lib/ai/providers/openrouter.ts`, `lib/ai/providers/gemini.ts`, `lib/ai/with-fallback.ts`, `lib/ai/needs-details.ts`, `lib/ai/openrouter-client.ts`, both research adapters — FOUND
- `tests/unit/ai/openrouter-timeout.test.ts`, `openrouter-truncation.test.ts`, `tool-schema-fields.test.ts` — FOUND
- Commits `3899c28c`, `8ec052d1`, `f9d2c1cc` — FOUND on main

---
*Phase: 166-ai-reliability-output-integrity*
*Completed: 2026-07-17*
