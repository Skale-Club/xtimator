---
phase: 124-ai-sdk-chat-backend
plan: 01
subsystem: api
tags: [vercel-ai-sdk, ai, openrouter, tool-calling, zod, chat, openrouter-provider]

# Dependency graph
requires:
  - phase: 122-channel-neutral-domain-extraction
    provides: "lib/agent-tools/ neutral barrel — createEstimate, askKnowledge, the six queryCompanyData reads"
  - phase: 123-chat-persistence-schema-history
    provides: "lib/queries/chat.ts persistence helpers (consumed by Plan 02's /api/chat route)"
provides:
  - "ai@^6 + @openrouter/ai-sdk-provider@^2 installed (the chat/streaming layer)"
  - "lib/chat/provider.ts — resolveChatModel + resolveChatModelId (ai_config slot → OpenRouter LanguageModelV3, with a keyless modelOverride test seam)"
  - "lib/chat/tools.ts — buildChatTools wrapping the 8 neutral capabilities as AI SDK tools with companyId as a trusted closure"
  - "lib/chat/system-prompt.ts — CHAT_SYSTEM_PROMPT (owner-only, async-estimate-aware)"
affects: [124-02 /api/chat route, 125 chat UI, 126 access gate]

# Tech tracking
tech-stack:
  added: ["ai@^6.0.209", "@openrouter/ai-sdk-provider@^2.9.1"]
  patterns:
    - "lib/chat/ is the CHANNEL ADAPTER (may import the neutral barrel); lib/agent-tools/ stays channel-neutral"
    - "AI SDK v6 tool({ description, inputSchema: z.object(...), execute }) — inputSchema, never the v3 parameters"
    - "companyId/supabase are trusted CLOSURE args on every tool — never an LLM inputSchema field (T-lrf-01)"
    - "slot resolution mirrors getAIProvider EXACTLY: ai_model_override → openrouter_default_model → OR_DEFAULTS.chat"

key-files:
  created:
    - lib/chat/provider.ts
    - lib/chat/tools.ts
    - lib/chat/system-prompt.ts
    - tests/unit/chat/provider.test.ts
    - tests/unit/chat/tools.test.ts
  modified:
    - package.json
    - package-lock.json

key-decisions:
  - "Used the dedicated @openrouter/ai-sdk-provider (createOpenRouter) over the @ai-sdk/openai baseURL shim — first-class OpenRouter tool-calling + headers"
  - "Imported the LanguageModelV3 type from @openrouter/ai-sdk-provider (ai does not re-export it by name)"
  - "Reused the existing ai_config slot for the conversation model (no dedicated cheap-chat slot in v1)"
  - "Added a modelOverride test seam to resolveChatModel so Plan 02's route is testable without a live OpenRouter key"

patterns-established:
  - "Test seam: optional, last-positional deps param skips the key+provider path (backward-compatible signature)"
  - "T-lrf-01 schema-walk test: iterate every tool's inputSchema.shape and assert no companyId/company_id/tenant/tenantId key"

requirements-completed: [CHATBE-01, CHATBE-02, CHATBE-03]

# Metrics
duration: 14min
completed: 2026-06-25
---

# Phase 124 Plan 01: AI SDK + Chat Backend Wiring Summary

**Vercel AI SDK v6 + dedicated OpenRouter provider installed, plus the lib/chat/ channel-adapter layer: an ai_config-slot model resolver, the 8 neutral agent-tools wrapped as AI SDK tools with companyId as a trusted closure, and an owner-only system prompt.**

## Performance

- **Duration:** 14 min
- **Started:** 2026-06-25T02:47:40Z
- **Completed:** 2026-06-25T03:02:00Z
- **Tasks:** 3
- **Files modified:** 7 (5 created, 2 modified)

## Accomplishments
- Installed `ai@6.0.209` + `@openrouter/ai-sdk-provider@2.9.1` (zod unchanged at ^4.3.6; no @ai-sdk/openai shim) — the chat/streaming layer the milestone locked in adopting.
- `resolveChatModel` / `resolveChatModelId` (CHATBE-01): resolves the model over the SAME `ai_config` slot `getAIProvider` uses (company `ai_model_override` → platform `openrouter_default_model` → `OR_DEFAULTS.chat`), keyed by `getIntegrationKey('openrouter')`, throws when unconfigured, returns `createOpenRouter({apiKey,headers})(modelId)`. A `modelOverride` test seam lets Plan 02's route unit-test inject a mock model without a live key.
- `buildChatTools` (CHATBE-02/03 + T-lrf-01): the 8 neutral capabilities (`createEstimate`, `askKnowledge`, and the six `queryCompanyData` reads) wrapped as AI SDK tools. `companyId` + `supabase` are trusted closure args on every tool, NEVER an inputSchema field. The `createEstimate` tool returns `{ jobId, status: 'queued' }` immediately with `channel: 'web'` — it does not await generation.
- `CHAT_SYSTEM_PROMPT`: a concise owner-only prompt that scopes the assistant to the authenticated owner's active company, instructs tool-use over invention, and states the async-estimate (job-id) contract.

## Task Commits

Each task was committed atomically (TDD test+impl folded per task; all hooked IN-PLACE, gitleaks ran on each, no `--no-verify`):

1. **Task 1: Install the AI SDK + OpenRouter provider** - `ad98c4b1` (chore)
2. **Task 2: lib/chat/provider.ts — slot → OpenRouter provider** - `4cb4eb56` (feat, TDD RED→GREEN)
3. **Task 3: lib/chat/tools.ts + system-prompt.ts — neutral fns as AI SDK tools** - `6ea66266` (feat, TDD RED→GREEN)

**Plan metadata:** _(this SUMMARY + STATE + ROADMAP commit)_

## Files Created/Modified
- `lib/chat/provider.ts` - `resolveChatModelId` (slot order) + `resolveChatModel` (key + OpenRouter model + test seam); `import 'server-only'`.
- `lib/chat/tools.ts` - `buildChatTools(ctx)` → the AI SDK ToolSet wrapping the neutral barrel; trusted-closure tenant; async createEstimate contract.
- `lib/chat/system-prompt.ts` - `CHAT_SYSTEM_PROMPT` owner-only string.
- `tests/unit/chat/provider.test.ts` - 7 cases (slot order override→default→OR_DEFAULTS.chat, missing-key throw, resolved-id passed to `openrouter()`, the keyless seam).
- `tests/unit/chat/tools.test.ts` - 11 cases (8-tool surface, createEstimate queued envelope + channel:web, askKnowledge ctx scope, each data-read's positional companyId+supabase, the T-lrf-01 inputSchema schema-walk, owner-scoped prompt).
- `package.json` / `package-lock.json` - the two new deps.

## Decisions Made
- **Dedicated OpenRouter provider over the OpenAI shim** — `createOpenRouter` is purpose-built for OpenRouter (first-class tool-calling, `HTTP-Referer`/`X-Title` headers), per the RESEARCH recommendation.
- **`LanguageModelV3` type imported from `@openrouter/ai-sdk-provider`** — `ai` uses the type internally but does not re-export it by name; the provider re-exports it from `@ai-sdk/provider`. (See Deviations Rule 3.)
- **Reused the existing `ai_config` slot** for the conversation model (no dedicated cheap-chat slot in v1) — Open Question 1 resolved per the RESEARCH recommendation.
- **`modelOverride` test seam** added to `resolveChatModel` so Plan 02's `/api/chat` route is testable without a live key (and without reading `process.env`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Imported `LanguageModelV3` from the OpenRouter provider, not from `ai`**
- **Found during:** Task 2 (lib/chat/provider.ts)
- **Issue:** The plan's `<action>` referenced `LanguageModelV3` for the seam type. Importing `import type { LanguageModelV3 } from 'ai'` typechecks-failed (`'"ai"' has no exported member named 'LanguageModelV3'`) — `ai` uses the type internally but does not re-export it under that name.
- **Fix:** Imported it from `@openrouter/ai-sdk-provider` (`import { createOpenRouter, type LanguageModelV3 } from '@openrouter/ai-sdk-provider'`), which re-exports it from `@ai-sdk/provider`. Behavior identical; the type is the same.
- **Files modified:** lib/chat/provider.ts
- **Verification:** `npx tsc --noEmit` clean on the new file; provider.test.ts 7/7 green.
- **Committed in:** `4cb4eb56` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking type-import correction)
**Impact on plan:** A faithful adaptation of the plan's intended type — no behavior change, no scope creep. Everything else executed exactly as written.

## Issues Encountered
- The full suite shows 1 failure: the KNOWN parallel-only `tests/unit/mcp-route-contract.test.ts` "GET returns 405" timeout flake — re-confirmed **8/8 GREEN in isolation**, touches no Phase-124 file, pre-existing and out of scope (documented across prior summaries).

## Verification Results
- `npx vitest run tests/unit/chat` → **4 files / 34 passed** (provider 7 + tools 11 + the pre-existing chat-queries/migration suites).
- `npx vitest run tests/unit/agent-tools` → **5 files / 16 passed** — the neutrality gate stays green (lib/agent-tools/ gained NO channel import; the wrappers live in lib/chat/).
- FULL `npx vitest run` → **322 files passed | 1 failed (the known mcp flake, 8/8 in isolation) | 3 skipped, 2268 passed**. Baseline 123-02 was 321 files / 2251; +2 chat files (+18), no regressions.
- `npx tsc --noEmit` → no NEW source errors (the residual errors are all pre-existing test-file issues: es2018 regex flags + test-mock types, untouched by this plan).
- grep: provider.ts contains `getIntegrationKey('openrouter')` + `createOpenRouter`; tools.ts imports `@/lib/agent-tools` and uses `inputSchema:` (never `parameters:`).
- No migration, no env var, no secret (placeholder ids only in tests).

## Known Stubs
None — every export is fully wired. The `/api/chat` route that consumes `resolveChatModel` + `buildChatTools` + `CHAT_SYSTEM_PROMPT` is Plan 02's scope (out of scope here by design).

## User Setup Required
None - no external service configuration required. (The OpenRouter key path already exists via `getIntegrationKey('openrouter')`; runtime use arrives with Plan 02's route.)

## Next Phase Readiness
- The channel-adapter layer (`lib/chat/`) is ready for Plan 124-02 to build the thin `/api/chat` route: `resolveChatModel(companyId)` → `streamText({ model, system: CHAT_SYSTEM_PROMPT, tools: buildChatTools(ctx), ... })` → `toUIMessageStreamResponse` persisting via the Phase-123 `appendMessage` helper.
- The `modelOverride` seam means the route is unit-testable with `MockLanguageModelV3` from `ai/test` (no live key needed).

---
*Phase: 124-ai-sdk-chat-backend*
*Completed: 2026-06-25*

## Self-Check: PASSED

All 5 created files + the SUMMARY exist on disk; all 3 task commits (`ad98c4b1`, `4cb4eb56`, `6ea66266`) exist in git history.
