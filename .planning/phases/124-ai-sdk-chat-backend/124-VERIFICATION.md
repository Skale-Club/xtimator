---
phase: 124-ai-sdk-chat-backend
verified: 2026-06-24T23:25:00Z
status: passed
score: 8/8 must-haves verified
---

# Phase 124: AI SDK Chat Backend Verification Report

**Phase Goal:** The Vercel AI SDK is added; a /api/chat route uses streamText + native tool-calling exposing the neutral domain tools (createEstimate/queryCompanyData/askKnowledge); estimate generation is an async tool dispatching the Inngest job (LangGraph engine unchanged); model via ai_config slots over OpenRouter; heavy ops consume credits by reuse (no new debit / no double-debit); conversation absorbed.
**Verified:** 2026-06-24T23:25:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | AI SDK + OpenRouter provider installed (CHATBE-01 dep) | ✓ VERIFIED | `ai=^6.0.209`, `@openrouter/ai-sdk-provider=^2.9.1`, `@ai-sdk/openai` ABSENT, `zod=^4.3.6` unchanged |
| 2   | resolveChatModel mirrors getAIProvider slot order over OpenRouter key | ✓ VERIFIED | provider.ts L34-51: override → `getOpenRouterDefaultModel()` → `OR_DEFAULTS.chat`; L68 `getIntegrationKey('openrouter')`; L72 `createOpenRouter` |
| 3   | buildChatTools exposes 8 neutral capabilities as AI SDK tools | ✓ VERIFIED | tools.ts L53-138: createEstimate, askKnowledge + 6 reads; `tool({ inputSchema: z.object(...) })`, never `parameters:` |
| 4   | companyId is a trusted closure, NEVER an inputSchema field (T-lrf-01) | ✓ VERIFIED | Every `companyId` ref is `ctx.companyId`; inputSchemas are `{projectId,prompts}`/`{question}`/`{name}`/`{}` only — grep confirms no companyId/tenant schema key |
| 5   | createEstimate tool dispatches async Inngest job, returns {jobId,status:'queued'} without hang (CHATBE-03) | ✓ VERIFIED | tools.ts L67-76 returns immediately; neutral create-estimate.ts L45-52 `inngest.send` → `{jobId}`, no await of generation engine |
| 6   | POST /api/chat: owner-auth (401) + active-company (400) → streamText(tools) → toUIMessageStreamResponse, persists in onFinish | ✓ VERIFIED | route.ts L51-53 (401), L58-60 (400), L89-95 streamText + stopWhen, L100 toUIMessageStreamResponse, L113-120 appendMessage tail in onFinish |
| 7   | Route adds NO credit debit; generation debits in Inngest job; conversation absorbed (CHATMETER-01) | ✓ VERIFIED | grep route.ts: 0 occurrences of recordCreditDebit/grantCredits/consumeCredits; debit lives in generate-estimate.ts L189-207; static test asserts absence |
| 8   | lib/agent-tools/ stays neutral (no channel-adapter import; wrappers in lib/chat/) | ✓ VERIFIED | grep `@/lib/(chat\|whatsapp\|mcp)` in lib/agent-tools/ → no matches; `channel?: 'web'\|'mcp'` is a neutral param, not an import |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/chat/provider.ts` | resolveChatModel + resolveChatModelId, slot → openrouter(modelId) | ✓ VERIFIED | 74 lines; `import 'server-only'`; exports both; mirrors getAIProvider exactly; modelOverride test seam |
| `lib/chat/tools.ts` | buildChatTools — 8 neutral fns as AI SDK tools w/ trusted companyId | ✓ VERIFIED | 138 lines; imports `@/lib/agent-tools`; `inputSchema:` throughout; closure companyId/supabase |
| `lib/chat/system-prompt.ts` | CHAT_SYSTEM_PROMPT owner-only | ✓ VERIFIED | Owner-scoped, async-estimate-aware, no secrets/model ids |
| `app/api/chat/route.ts` | POST handler — auth → company → streamText → persist | ✓ VERIFIED | 126 lines (>40 min); Node runtime (no edge); all wiring present |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| provider.ts | getIntegrationKey('openrouter') + ai_config slot | createOpenRouter({apiKey})(modelId) | ✓ WIRED | L17,L68,L72 all present |
| tools.ts | @/lib/agent-tools | tool({inputSchema,execute}) wrapping barrel | ✓ WIRED | L28-37 imports 8 neutral fns; all wrapped |
| route.ts | provider.ts + tools.ts | resolveChatModel(companyId) + buildChatTools(ctx) | ✓ WIRED | L85-86 |
| route.ts | lib/queries/chat.ts | appendMessage / createConversation in onFinish | ✓ WIRED | L40-44 imports; L107,L115 called in onFinish |
| route.ts | streamText().toUIMessageStreamResponse | convertToModelMessages + stopWhen stepCountIs(5) | ✓ WIRED | L88-100 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Chat unit suite passes | `npx vitest run tests/unit/chat` | 6 files / 44 passed | ✓ PASS |
| AI SDK deps resolved | node package.json check | ai ^6.0.209, provider ^2.9.1, no @ai-sdk/openai | ✓ PASS |
| Route has no debit call | grep recordCreditDebit/grantCredits/consumeCredits | 0 matches | ✓ PASS |
| Neutral barrel has no channel import | grep @/lib/(chat\|whatsapp\|mcp) in lib/agent-tools | 0 matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CHATBE-01 | 124-01 | AI SDK added; model via ai_config slots over OpenRouter | ✓ SATISFIED | deps installed; resolveChatModel slot order + getIntegrationKey('openrouter') |
| CHATBE-02 | 124-01, 124-02 | /api/chat uses streamText + tool-calling exposing neutral tools | ✓ SATISFIED | route.ts streamText + buildChatTools (8 neutral tools) |
| CHATBE-03 | 124-01 | Estimate gen is async tool → Inngest job; LangGraph unchanged | ✓ SATISFIED | createEstimate tool returns {jobId,status:'queued'} via inngest.send, no engine await |
| CHATMETER-01 | 124-02 | Heavy ops reuse v4.7 ledger; conversation absorbed | ✓ SATISFIED | route adds no debit (static test); debit in Inngest record-credit-debit step |

No orphaned requirements — REQUIREMENTS.md maps exactly CHATBE-01/02/03 + CHATMETER-01 to Phase 124, all claimed by plans.

### Anti-Patterns Found

None. No TODO/FIXME/placeholder stubs in the four source files. The `return` statements are genuine (`{ jobId, status: 'queued' }`, streamed Response, model objects) — not empty-stub returns. The `companyId`/`tenant` strings in tools.ts appear only in security doc comments and closure references, never as schema fields.

### Human Verification Required

None for goal verification. (Live end-to-end streaming against a real OpenRouter key + a real Inngest dispatch is exercised at the Phase-125 UI integration / runtime; the backend is fully unit-verified with MockLanguageModelV3.)

### Gaps Summary

No gaps. All 8 must-have truths verified against the actual codebase:
- AI SDK v6 + dedicated OpenRouter provider installed (no rejected @ai-sdk/openai shim).
- Slot resolver mirrors getAIProvider's three-tier order and sources the key via getIntegrationKey('openrouter').
- All 8 neutral capabilities wrapped with `inputSchema:` (v6), companyId/supabase as trusted closures, zero tenant fields in any schema.
- createEstimate is a true async dispatch (Inngest send → jobId, no generation await) — LangGraph engine untouched.
- /api/chat enforces owner-auth (401) + active-company (400), streams via streamText + toUIMessageStreamResponse, persists the new tail in onFinish.
- No credit debit in the route (static regression locks it); the debit is reused from the Inngest job; conversation absorbed.
- lib/agent-tools/ remains channel-neutral.

Note: `tests/unit/mcp-route-contract.test.ts` is a known pre-existing parallel-only flake, not a phase-124 file or regression — out of scope per the phase brief and prior summaries.

---

_Verified: 2026-06-24T23:25:00Z_
_Verifier: Claude (gsd-verifier)_
