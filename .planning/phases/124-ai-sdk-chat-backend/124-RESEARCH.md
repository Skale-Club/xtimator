# Phase 124: AI SDK + /api/chat Tool-Calling Backend - Research

**Researched:** 2026-06-24
**Domain:** Vercel AI SDK (v6) tool-calling chat backend over OpenRouter, wired to Xtimator's neutral domain tools + existing credit/Inngest infra
**Confidence:** HIGH (every package version, API name, and signature verified directly against the published `ai@6.0.209` type declarations and the OpenRouter provider README; repo-side wiring read first-hand)

## Summary

This phase adds the Vercel AI SDK as the chat/streaming LAYER and builds a single `/api/chat` route that streams a tool-calling conversation. The estimate engine (LangGraph) stays untouched — it is invoked as ONE async tool. The four neutral capabilities Phase 122 extracted (`createEstimate`, the six `queryCompanyData` reads, `askKnowledge`, `normalizeInput`) are wrapped as AI SDK tools; the route is the channel adapter, the tools stay neutral. Persistence reuses the Phase-123 `lib/queries/chat.ts` helpers. Credits are debited entirely by REUSE — `createEstimate` dispatches the Inngest job that ALREADY debits per v4.7; the conversation `streamText` turn is "absorbed" per the locked v4.7 decision and needs no new debit code (optionally a best-effort cost capture only).

The single highest-risk decision — package choice — resolves cleanly: use the community **`@openrouter/ai-sdk-provider`** (`createOpenRouter`). It is purpose-built for OpenRouter, supports the same `getIntegrationKey('openrouter')` key and `extraBody`/`headers`, and reads the `ai_config` slot model id directly as `openrouter(modelId)`. The OpenAI-compatible `@ai-sdk/openai` + custom `baseURL` also works but is a less faithful fit (OpenRouter's tool-call and provider-routing extensions aren't first-class). Recommend the dedicated provider.

**Primary recommendation:** Install `ai@^6`, `@openrouter/ai-sdk-provider@^2`, and `zod` (already at v4.3.6, peer-compatible). Build `/api/chat` with `streamText({ model: openrouter(slotModelId), system, messages: convertToModelMessages(messages), tools, stopWhen: stepCountIs(5) })` and return `result.toUIMessageStreamResponse({ originalMessages, onFinish })`, persisting through `appendMessage`. Define each tool with `tool({ description, inputSchema: z.object({...}), execute })`. `createEstimate`'s tool returns `{ jobId, status: 'queued' }` immediately (async contract — mirrors MCP). `companyId` is a trusted closure value, NEVER a tool-input field.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CHATBE-01 | Add the Vercel AI SDK; resolve the chat model via `ai_config` slots over an OpenRouter-compatible provider | Standard Stack (verified versions) + `## Pattern 3: Model slot → provider` (reads the same `ai_config.openrouter_default_model` slot `getAIProvider` uses, constructs `openrouter(modelId)`) |
| CHATBE-02 | `/api/chat` route using `streamText` + native tool-calling, exposing the neutral tools | `## Pattern 1: The /api/chat route` + `## Pattern 2: Wrapping neutral functions as tools` (verified `streamText`/`tool`/`toUIMessageStreamResponse` API) |
| CHATBE-03 | Estimate generation invoked as a tool running `generateEstimateForProject` (async Inngest job), returning a structured estimate — LangGraph unchanged | `## Pattern 2` createEstimate tool (async dispatch → `{jobId,status:'queued'}`) + `## Pitfall 2` (async tool contract) + `lib/agent-tools/create-estimate.ts` already dispatches `EVENT_ESTIMATE_GENERATE` |
| CHATMETER-01 | Heavy ops debit credits via the v4.7 ledger by reusing the neutral functions that already debit; the conversation turn is absorbed | `## Pattern 4: Credit reuse` + `## Pitfall 4` (the Inngest job's `record-credit-debit` step already debits; conversation absorbed per locked v4.7 decision — no new debit code) |

<user_constraints>
## User Constraints (from REQUIREMENTS.md + SEED-034 locked decisions — no CONTEXT.md for this phase)

### Locked Decisions
- **AI SDK and LangGraph coexist in different LAYERS.** Vercel AI SDK = the chat/streaming layer (`streamText` + native tool-calling). The LangGraph estimate engine stays **INTOCADO** and is invoked as ONE tool — generation is an async Inngest job returning a structured estimate, so the chat↔engine boundary is a **tool call, NOT a streaming bridge** (no `LangChainAdapter` in v1).
- **Web chat uses NATIVE tool-calling** (vs WhatsApp's pre-classifier). Both call the SAME neutral domain functions; only the orchestration differs.
- **Adopt** the AI SDK streaming/tool-call patterns; **Substitute** the Vercel template's infra → Supabase Auth, Supabase Postgres, our storage, and **OpenRouter** (NOT Auth.js/Drizzle/Neon/Blob/AI-Gateway).
- **Model via `ai_config` slots** (not hard-coded). The chat resolves its model the same way `getAIProvider` does.
- **Credits:** heavy operations consume credits per v4.7 by REUSE; the conversation turn is **absorbed**.
- **Owner-only** — authenticated, tenant-scoped, NEVER customer-facing.
- The chat reimplements **NO domain logic** — it reuses the neutral `lib/agent-tools/` modules. The route is the channel adapter; the tools stay neutral (the static neutrality gate forbids `lib/agent-tools/` from importing any channel).

### Claude's Discretion (research options, recommend)
- Provider package choice: `@openrouter/ai-sdk-provider` vs `@ai-sdk/openai` + custom baseURL. (→ recommend the dedicated OpenRouter provider; see Standard Stack.)
- How the async `createEstimate` tool returns (job id + status; polling/follow-up surfaces in Phase 125 UI).
- Whether the absorbed conversation turn captures a best-effort cost row (recommend: optional, additive, never a credit debit).
- The `system` prompt content + `stopWhen` step budget.

### Deferred Ideas (OUT OF SCOPE for Phase 124)
- The chat UI (`useChat`, sidebar, multimodal input, estimate card) — **Phase 125**.
- Tier entitlement gate / owner-only verification — **Phase 126** (the route still authenticates the owner; the *entitlement* gate is 126).
- Estimate edit-in-chat and send-in-chat — v2.
- `LangChainAdapter` live-streaming of the graph's intermediate reasoning — v2.
- MCP parity (SEED-030) — a later milestone.
</user_constraints>

## Project Constraints (from CLAUDE.md)
- **No secrets in code/docs/planning.** The OpenRouter key comes via `getIntegrationKey('openrouter')` (encrypted `platform_integrations`, env fallback). Never hard-code or paste a key. gitleaks pre-commit hook blocks `sk-*`/`sk-ant-*`/etc.
- **Tech stack:** Next.js App Router (16.2.6), TypeScript strict, Zod (v4.3.6), server-side AI calls only — service-role key never in the browser.
- **GSD workflow:** all edits go through a GSD command (this is `/gsd:execute-phase 124`).
- **Channel-neutral modules stay neutral:** `lib/agent-tools/` must not import any channel (enforced by `tests/unit/agent-tools/neutrality.test.ts`). The new route lives OUTSIDE `lib/agent-tools/` (in `app/api/chat/` + optionally `lib/chat/`), so wrapping tools there is fine.

## Standard Stack

### Core (NEW dependencies — verified against npm 2026-06-24)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `ai` | `^6.0.209` | The Vercel AI SDK core — `streamText`, `tool`, `convertToModelMessages`, `stepCountIs`, `toUIMessageStreamResponse` | The chat/streaming layer the milestone locked-in adopting; v6 is current (published 2026-06-24) |
| `@openrouter/ai-sdk-provider` | `^2.9.1` | `createOpenRouter` provider — the AI SDK model factory pointed at OpenRouter | Purpose-built for OpenRouter; reuses our key; reads slot model id as `openrouter(id)`; **peer-requires `ai@^6`** (matches) |
| `zod` | `^4.3.6` (ALREADY INSTALLED) | Tool `inputSchema` definitions | AI SDK v6 peer-accepts `^4.1.8`; our `4.3.6` satisfies it — no upgrade needed |

**Verified peer deps:** `ai@6` → `zod: ^3.25.76 || ^4.1.8` (our 4.3.6 ✓). `@openrouter/ai-sdk-provider@2.9.1` → `ai: ^6.0.0` (✓), `zod: ^3.25.0 || ^4.0.0` (✓).

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@openrouter/ai-sdk-provider` | `@ai-sdk/openai` (`^3.0.74`) with `createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey })` | Works (OpenRouter is OpenAI-compatible), and reuses `OPENROUTER_BASE`. BUT: OpenRouter's tool-calling, provider-routing, and `extraBody`/transforms aren't first-class through the OpenAI shim, and you'd hand-set `HTTP-Referer`/`X-Title` headers. The dedicated provider is the cleaner, lower-surprise fit. Use the OpenAI shim ONLY if a future constraint forbids the community package. |
| `@openrouter/ai-sdk-provider@^2` | `@openrouter/ai-sdk-provider@1.5.4` | The 1.x line targets AI SDK **v5**. Since we install `ai@6`, we MUST use the 2.x line. Do not pin 1.x. |

**Installation:**
```bash
npm install ai@^6 @openrouter/ai-sdk-provider@^2
# zod already present at ^4.3.6 — no change
```
Then check the lockfile resolves `ai` and the provider to the verified majors (`npm view` confirmed `ai@6.0.209`, provider `2.9.1` on 2026-06-24).

**Version verification (do at plan time — registry moves fast):**
```bash
npm view ai version
npm view @openrouter/ai-sdk-provider version
npm view @openrouter/ai-sdk-provider peerDependencies
```

## Architecture Patterns

### Recommended File Structure
```
app/api/chat/
└── route.ts            # POST handler — auth → resolve company + model slot → streamText → persist
lib/chat/               # (NEW, optional) the channel-adapter layer (NOT lib/agent-tools/ — that stays neutral)
├── provider.ts         # resolveChatModel(): reads ai_config slot + getIntegrationKey('openrouter') → openrouter(id)
├── tools.ts            # buildChatTools({ companyId, supabase, industries, language }) → the AI SDK ToolSet wrapping neutral fns
└── system-prompt.ts    # the owner-only system prompt
```
Rationale: keep the route thin; put the slot→provider resolution and the tool-wrapping (which closes over the trusted `companyId`) in `lib/chat/` so they're unit-testable in isolation. `lib/chat/` is the CHANNEL ADAPTER — it MAY import channels/the neutral barrel; only `lib/agent-tools/` is forbidden from importing channels.

### Pattern 1: The `/api/chat` route (CHATBE-02)
```typescript
// Source: ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence + verified ai@6.0.209 d.ts
// app/api/chat/route.ts
import { streamText, convertToModelMessages, stepCountIs, type UIMessage } from 'ai'

export async function POST(req: Request) {
  // 1. Auth the owner (Supabase) + resolve active company — mirror existing app routes.
  //    Resolve companyId/userId/industries/language HERE (trusted, server-side).
  // 2. Parse the UI messages + optional conversationId from the body.
  const { messages, conversationId }: { messages: UIMessage[]; conversationId?: string } =
    await req.json()

  const model = await resolveChatModel(companyId)      // Pattern 3
  const tools = buildChatTools({ companyId, supabase, industries, language }) // Pattern 2

  const result = streamText({
    model,
    system: CHAT_SYSTEM_PROMPT,
    messages: convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(5),  // allow up to 5 tool-call rounds per turn
  })

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    onFinish: async ({ messages: full }) => {
      // Persist via Phase-123 helpers. `full` is the complete UIMessage[]
      // (history + the new assistant/tool message). Persist the NEW tail.
      await persistTurn(conversationId, userId, full)  // appendMessage(...)
    },
  })
}
```
**Verified exports (from `ai@6.0.209` `dist/index.d.ts`):** `streamText`, `convertToModelMessages`, `stepCountIs`, `toUIMessageStreamResponse`, `UIMessage`. `streamText` accepts `{ model, system, prompt|messages, tools, stopWhen, onFinish, ... }`. `toUIMessageStreamResponse` accepts `{ originalMessages, onFinish }` (confirmed in the d.ts — `originalMessages?: UI_MESSAGE[]`, `onFinish?: UIMessageStreamOnFinishCallback`).

### Pattern 2: Wrapping neutral functions as tools (CHATBE-02/03)
```typescript
// Source: ai-sdk.dev tools-and-tool-calling + verified inputSchema usage
// lib/chat/tools.ts
import { tool } from 'ai'
import { z } from 'zod'
import {
  createEstimate, askKnowledge,
  findClientByName, getLatestEstimateForClient, getProjectStatus,
  listRecentEstimates, listServices, findServiceByName,
} from '@/lib/agent-tools'

export function buildChatTools(ctx: {
  companyId: string; supabase: SupabaseClient; industries: string[]; language?: 'en'|'pt'|'es'
}) {
  return {
    // CHATBE-03 — async dispatch tool. Returns IMMEDIATELY with the job id.
    createEstimate: tool({
      description: 'Start generating a professional estimate for a project. Returns a job id; the estimate is produced asynchronously.',
      inputSchema: z.object({
        projectId: z.string().describe('The project to generate the estimate for'),
        prompts: z.array(z.string()).optional().describe('Free-form scope notes'),
      }),
      // companyId is the TRUSTED closure value — NEVER a schema field (T-lrf-01).
      execute: async ({ projectId, prompts }) => {
        const { jobId } = await createEstimate({
          companyId: ctx.companyId, projectId, prompts,
          language: ctx.language, channel: 'web',
        })
        return { jobId, status: 'queued' as const }
      },
    }),

    askKnowledge: tool({
      description: 'Answer a trade/how-to question from the industry knowledge base.',
      inputSchema: z.object({ question: z.string() }),
      execute: async ({ question }) =>
        askKnowledge(question, { industries: ctx.industries, companyId: ctx.companyId, language: ctx.language }),
    }),

    // queryCompanyData — one tool per read keeps schemas tight; companyId + supabase are closure args.
    findClientByName: tool({
      description: 'Find a client by (partial) name.',
      inputSchema: z.object({ name: z.string() }),
      execute: async ({ name }) => findClientByName(ctx.companyId, ctx.supabase, name),
    }),
    // ...getLatestEstimateForClient, getProjectStatus, findServiceByName (each takes `name`);
    //    listRecentEstimates, listServices take NO input → inputSchema: z.object({}).
  }
}
```
**Key facts:** `tool()` in v6 uses **`inputSchema`** (NOT the v3/`parameters` name — this changed across versions; verified in the d.ts). Each neutral data-read takes `(companyId, supabase, name)` positionally — `companyId` and `supabase` are CLOSURE args, only `name` is an LLM field. The read functions return STRINGS (already owner-readable); return them verbatim. `askKnowledge` returns a string and never throws. `createEstimate` returns `{ jobId }`.

### Pattern 3: Model slot → provider (CHATBE-01)
```typescript
// lib/chat/provider.ts
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { getIntegrationKey } from '@/lib/platform-config'

export async function resolveChatModel(companyId?: string) {
  const apiKey = await getIntegrationKey('openrouter')
  if (!apiKey) throw new Error('OpenRouter API key not configured')

  // Same slot mechanism getAIProvider uses: company override → ai_config.openrouter_default_model → OR_DEFAULTS.chat
  const modelId = await resolveChatModelId(companyId)   // read companies.ai_model_override, then platform ai_config

  const openrouter = createOpenRouter({
    apiKey,
    headers: { 'HTTP-Referer': 'https://xtimator.com', 'X-Title': 'Xtimator' }, // matches existing SITE_HEADERS
  })
  return openrouter(modelId)
}
```
`resolveChatModelId` mirrors `getAIProvider` (lib/ai/index.ts) EXACTLY: company `ai_model_override` → `platform_integrations.ai_config.metadata.openrouter_default_model` (via `getOpenRouterDefaultModel()`) → `OR_DEFAULTS.chat` (`anthropic/claude-sonnet-4-5`). The AI SDK model is `openrouter(modelId)`. (Optional: a cheaper conversation slot per the v4.7 "absorbed + cheap model" note — but reuse the existing slot unless the planner adds a dedicated chat slot.)

### Pattern 4: Credit reuse (CHATMETER-01)
The chat adds **NO new debit code**. Reuse is automatic:
- **Generation:** the `createEstimate` tool dispatches `EVENT_ESTIMATE_GENERATE`. The `generateEstimateJob` (lib/inngest/functions/generate-estimate.ts) ALREADY runs a `record-credit-debit` step that reads back `ai_cost_events` by `attemptId` and calls `recordCreditDebit({ operationType: 'estimate' })`. Routing through the neutral `createEstimate` means the chat inherits this debit for free.
- **Transcription / photo (Phase 125 multimodal input):** `normalizeInput` → `ingestMultimodal` → the OpenRouter vision / Whisper seams call `recordAICost` (lib/ai/openrouter-client.ts) — the cost-capture path is shared; the credit debit is folded into the estimate job's read-back. No chat-specific code.
- **Conversation turn:** **absorbed** per the locked v4.7 decision (CREDIT-07: a lightweight conversation = zero credit, by construction — there is no channel branch in `recordCreditDebit`; an op that spent nothing records nothing). Recommend: do NOT debit the `streamText` turn. OPTIONALLY capture its real cost with a best-effort `recordAICost({ operationType: 'translation'|... })`-style row for observability ONLY — but `recordAICost` is measure-only and never debits, so this is safe and additive. Default recommendation: leave the conversation un-metered to honor "absorbed" literally; revisit only if conversation spend proves material.

### Anti-Patterns to Avoid
- **Promoting `companyId` (or any tenant id) to a tool `inputSchema` field.** T-lrf-01: the tenant is ALWAYS a trusted closure value resolved from the authed owner. An LLM-supplied tenant is a cross-tenant leak. The neutral functions already enforce `companyId` as a positional (non-LLM) arg — keep it that way in the tool wrapper.
- **Reimplementing generation/query/knowledge logic in the route.** Forbidden by the locked decision. The route wraps the neutral barrel; it adds NO domain logic.
- **Bridging the LangGraph run into the stream.** v1 boundary is a tool call returning `{jobId}`, not a `LangChainAdapter` stream. Do not pull in `@langchain` streaming here.
- **Blocking on the estimate job inside the tool.** The tool must return immediately (`{jobId,status:'queued'}`); the result surfaces via polling/follow-up in the Phase-125 UI. Awaiting the job inside `execute` would hang the stream and break the async contract.
- **Hard-coding the model id.** Must read the `ai_config` slot (CHATBE-01).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| SSE/streaming protocol + tool-call framing | A custom `ReadableStream` + event format | `streamText().toUIMessageStreamResponse()` | The AI SDK owns the wire protocol `useChat` (Phase 125) expects; hand-rolling it desyncs front/back |
| Multi-step tool loop (call tool → feed result → continue) | A manual while-loop re-calling the model | `stopWhen: stepCountIs(N)` | Built-in loop control; verified export |
| UI↔model message conversion | Manual mapping of parts/roles | `convertToModelMessages(messages)` | Handles tool parts, attachments, roles correctly |
| OpenRouter request shape (headers, model id, tool schema → JSON Schema) | Raw `fetch` to `/chat/completions` | `createOpenRouter({apiKey})(modelId)` | The provider serializes Zod `inputSchema` to JSON Schema and handles OpenRouter's tool-call protocol |
| Estimate generation, company queries, knowledge answers | Any new generation/query/RAG code | `lib/agent-tools/*` (Phase 122) | These are the SHARED neutral capabilities; duplicating them breaks channel parity |
| Credit debit for generation | A chat-specific debit | The Inngest job's existing `record-credit-debit` step | Already debits per v4.7; reuse is the locked decision |

**Key insight:** This phase is almost entirely WIRING. The hard parts (generation engine, neutral tools, persistence helpers, credit ledger, cost capture) already exist. The AI SDK supplies the streaming/tool-loop machinery. The net-new code is: the route, the tool wrappers (closures over trusted ctx), the slot→provider resolver, and the persistence glue.

## Common Pitfalls

### Pitfall 1: `parameters` vs `inputSchema` (the API renamed across versions)
**What goes wrong:** Training data and older tutorials use `tool({ parameters: z.object(...) })`. In AI SDK v6 the field is **`inputSchema`**. Using `parameters` silently produces a tool with no schema (or a type error).
**How to avoid:** Always `tool({ description, inputSchema: z.object({...}), execute })`. Verified against `ai@6.0.209` types.

### Pitfall 2: The async-tool contract (CHATBE-03)
**What goes wrong:** Treating `createEstimate` as a synchronous "generate and return the estimate" tool. Generation is an async Inngest job that returns LATER; awaiting it in `execute` hangs the stream.
**How to avoid:** The tool dispatches and returns `{ jobId, status: 'queued' }` immediately — exactly mirroring the MCP `create_estimate` async contract and the existing `createEstimate({...}) → {jobId}` shape. The estimate itself arrives via polling/a follow-up surfaced by the Phase-125 UI. The tool-call boundary is NOT a streaming bridge (locked decision).

### Pitfall 3: Persisting messages in `onFinish` (not mid-stream)
**What goes wrong:** Trying to persist the assistant message during streaming, or persisting the wrong shape, so history reloads broken.
**How to avoid:** Persist in `toUIMessageStreamResponse({ originalMessages, onFinish })`. The `onFinish` `{ messages }` is the COMPLETE `UIMessage[]` (history + new assistant/tool turn). Use `appendMessage` (Phase 123) to write the new tail with `parts` jsonb + `role`. The Phase-123 helpers resolve `company_id` internally via `getActiveCompanyId()` and scope by `user_id` — pass `conversationId`/`role`/`parts`. (Create the conversation first via `createConversation` if `conversationId` is absent.) `appendMessage` already bumps `updated_at`.

### Pitfall 4: Double-debiting or mis-debiting the conversation
**What goes wrong:** Adding a `recordCreditDebit` call in the route "to be safe," double-charging generation (the Inngest job already debits) or charging the absorbed conversation.
**How to avoid:** Add NO debit in the route. Generation debits inside its Inngest job. The conversation is absorbed. `recordCreditDebit` is keyed by `attemptId:debit:op` (idempotent) — but the route shouldn't call it at all. The ONLY optional addition is a best-effort `recordAICost` row (measure-only, never debits) for conversation-cost observability.

### Pitfall 5: OpenRouter key + model from the slot, not env or hard-code
**What goes wrong:** Hard-coding a model id or reading `process.env.OPENROUTER_API_KEY` directly, breaking the admin-configurable slot and the encrypted-key path.
**How to avoid:** Key via `getIntegrationKey('openrouter')` (encrypted DB → env fallback, already handles both). Model via the `ai_config` slot resolution (company override → `getOpenRouterDefaultModel()` → `OR_DEFAULTS.chat`). Never inline a key (gitleaks blocks it).

### Pitfall 6: `streamText` runs on Node, not Edge, and is server-only
**What goes wrong:** Marking the route `export const runtime = 'edge'` — but the neutral tools use the Node `inngest` client, `node:crypto` (`randomUUID` in `createEstimate`), and the service Supabase client.
**How to avoid:** Keep the route on the default Node runtime. `createEstimate` imports `node:crypto`; `query-company-data` uses the service client. Do not opt into Edge.

## Code Examples

### Unit-testing the route by mocking the model (scope fence: route is testable)
```typescript
// Source: ai-sdk.dev/docs/ai-sdk-core/testing — verified MockLanguageModelV3 in ai@6.0.209 ai/test
import { streamText, simulateReadableStream } from 'ai'
import { MockLanguageModelV3 } from 'ai/test'

const model = new MockLanguageModelV3({
  doStream: async () => ({
    stream: simulateReadableStream({
      chunks: [
        { type: 'text-start', id: 't1' },
        { type: 'text-delta', id: 't1', delta: 'Here is your estimate job.' },
        { type: 'text-end', id: 't1' },
        { type: 'finish', finishReason: 'stop', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } },
      ],
    }),
  }),
})
```
**Verified:** `MockLanguageModelV3` is exported from `ai/test`; `simulateReadableStream` from `ai`. For the route's unit test, inject the mock model (e.g. via a seam in `resolveChatModel`) and mock the neutral tools (`@/lib/agent-tools`) — assert that the `createEstimate` tool's `execute` calls the neutral `createEstimate` with the trusted `companyId` and NO tenant from input, and that `appendMessage` is called in `onFinish`. This mirrors the existing repo test style (chainable Supabase mocks, `vi.mock` of `@/lib/agent-tools`).

### The neutral `createEstimate` dispatch this tool wraps (already shipped, Phase 122)
```typescript
// lib/agent-tools/create-estimate.ts (existing) — dispatches EVENT_ESTIMATE_GENERATE once, returns { jobId }.
// The chat tool's execute simply calls this with the trusted companyId + channel: 'web'.
const { jobId } = await createEstimate({ companyId, projectId, prompts, language, channel: 'web' })
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tool({ parameters })` | `tool({ inputSchema })` | AI SDK v4→v5 era | Use `inputSchema` (Pitfall 1) |
| `result.toDataStreamResponse()` | `result.toUIMessageStreamResponse()` | AI SDK v5+ | The current method name; pair with `convertToModelMessages` on input |
| `experimental_streamText` / `maxSteps` | stable `streamText` + `stopWhen: stepCountIs(n)` | v5/v6 | Multi-step loop control is now `stopWhen`, not `maxSteps` |
| `@openrouter/ai-sdk-provider@1.x` (AI SDK v5) | `@2.x` (AI SDK v6) | provider 2.0 | Must use 2.x with `ai@6` |
| `MockLanguageModelV2` | `MockLanguageModelV3` | v6 | Test mock class bumped to V3 in `ai/test` |

**Deprecated/outdated:** any tutorial showing `parameters:`, `toDataStreamResponse()`, `maxSteps:`, or provider `1.x` is pre-v6 — do not copy.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `ai` (npm) | CHATBE-01/02 | ✗ (install) | `^6.0.209` target | — (must install) |
| `@openrouter/ai-sdk-provider` (npm) | CHATBE-01 | ✗ (install) | `^2.9.1` target | `@ai-sdk/openai` + baseURL (alternative) |
| `zod` | tool schemas | ✓ | `4.3.6` | — (peer-compatible) |
| OpenRouter API key | the provider | ✓ (runtime) | via `getIntegrationKey('openrouter')` | env `OPENROUTER_API_KEY` fallback (already wired) |
| Inngest dev server | createEstimate dispatch (manual/integration testing) | ✓ | `inngest@^4.4.0` + `inngest-cli` in `npm run dev` | unit tests mock `@/lib/inngest/client` |
| `ai_config` slot model id | CHATBE-01 | ✓ (DB) | `platform_integrations.ai_config` | `OR_DEFAULTS.chat` = `anthropic/claude-sonnet-4-5` |

**Missing dependencies with no fallback:** `ai` (the SDK itself) — must be installed; this is the phase's only blocking add.
**Missing dependencies with fallback:** the OpenRouter provider package (alt: OpenAI-compatible shim, but recommend the dedicated provider).

## Validation Architecture

> nyquist_validation is enabled (config.json `workflow.nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.4` |
| Config file | `vitest.config.*` (repo uses `npx vitest run`; `@vitejs/plugin-react` + jsdom present) |
| Quick run command | `npx vitest run tests/unit/chat` |
| Full suite command | `npx vitest run` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHATBE-01 | `resolveChatModel` reads the `ai_config` slot (company override → default → `OR_DEFAULTS.chat`) + `getIntegrationKey('openrouter')`; constructs `openrouter(id)` | unit | `npx vitest run tests/unit/chat/provider.test.ts` | ❌ Wave 0 |
| CHATBE-02 | `/api/chat` POST: streams a turn, exposes the neutral tools, calls `convertToModelMessages` + `toUIMessageStreamResponse` | unit (mock `MockLanguageModelV3` + mock `@/lib/agent-tools`) | `npx vitest run tests/unit/chat/route.test.ts` | ❌ Wave 0 |
| CHATBE-02 | `buildChatTools`: each tool's `execute` calls the neutral fn with the TRUSTED `companyId` (no tenant from input); schemas use `inputSchema` | unit | `npx vitest run tests/unit/chat/tools.test.ts` | ❌ Wave 0 |
| CHATBE-03 | `createEstimate` tool dispatches the Inngest job and returns `{ jobId, status: 'queued' }` WITHOUT awaiting completion | unit (mock `@/lib/agent-tools` createEstimate) | `npx vitest run tests/unit/chat/tools.test.ts` | ❌ Wave 0 |
| CHATMETER-01 | The route adds NO `recordCreditDebit` call (debit lives in the Inngest job); conversation un-debited | unit (static-source grep: route file contains no `recordCreditDebit`) | `npx vitest run tests/unit/chat/credit-reuse.test.ts` | ❌ Wave 0 |
| (security) | T-lrf-01: no tool `inputSchema` contains a `companyId`/tenant field | unit (assert schemas) | `npx vitest run tests/unit/chat/tools.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/chat`
- **Per wave merge:** `npx vitest run` (full suite — baseline 321 files / 2251 passed as of 123-02)
- **Phase gate:** full suite green + `npx tsc --noEmit` clean before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/chat/provider.test.ts` — covers CHATBE-01 (slot resolution + key + `openrouter(id)`; mock `@/lib/platform-config` + the service client)
- [ ] `tests/unit/chat/tools.test.ts` — covers CHATBE-02/03 + T-lrf-01 (`buildChatTools` wraps the neutral barrel; trusted `companyId`; `inputSchema` shape; async `{jobId,status}` return). Mock `@/lib/agent-tools`.
- [ ] `tests/unit/chat/route.test.ts` — covers CHATBE-02 (POST streams via `MockLanguageModelV3`; persists in `onFinish` via `appendMessage`). Mock `ai`'s model seam + `@/lib/queries/chat`.
- [ ] `tests/unit/chat/credit-reuse.test.ts` — covers CHATMETER-01 (static grep: route imports/uses no debit; generation debit is the Inngest job's).
- [ ] Framework install: none — Vitest already present. New dep install: `npm install ai@^6 @openrouter/ai-sdk-provider@^2`.

## Open Questions

1. **Dedicated cheap "conversation" model slot vs reuse the estimate slot?**
   - What we know: v4.7 decision says "absorbed + cheap model slot"; `getAIProvider` resolves one chat slot today.
   - What's unclear: whether to add a NEW `ai_config` slot key (e.g. `openrouter_chat_model`) for the conversation turn, or reuse `openrouter_default_model`.
   - Recommendation: reuse the existing slot for v1 (simplest, honors "model via slots"); the planner MAY add a dedicated cheap-model slot if the conversation cost proves material. Don't block the phase on it.

2. **Conversation persistence granularity (create-on-first-message).**
   - What we know: `appendMessage` needs a `conversationId`; `createConversation` makes one.
   - What's unclear: whether the route creates the conversation when `conversationId` is absent (server-side) or expects the Phase-125 UI to create it first.
   - Recommendation: have the route create-if-absent (server-side) so the backend is self-contained and testable without the UI. The UI (Phase 125) can pass an existing id to continue.

3. **Does the route capture the conversation's real cost (observability) or stay fully un-metered?**
   - What we know: `recordAICost` is measure-only (never debits) and additive at other call sites.
   - Recommendation: optional best-effort `recordAICost` for the conversation turn (observability only). Default to NOT adding it in v1 to keep the scope tight and honor "absorbed"; it's a trivial additive follow-up if wanted.

## Sources

### Primary (HIGH confidence)
- `ai@6.0.209` published type declarations (`npm pack ai@latest` → `dist/index.d.ts`, `dist/test/index.d.ts`) — verified exports: `streamText`, `tool`/`inputSchema`, `convertToModelMessages`, `stepCountIs`, `toUIMessageStreamResponse` (`originalMessages`/`onFinish`), `MockLanguageModelV3`, `simulateReadableStream`.
- npm registry (2026-06-24): `ai` 6.0.209, `@openrouter/ai-sdk-provider` 2.9.1, `@ai-sdk/openai` 3.0.74 + peerDependency constraints (zod ^4.1.8, ai ^6).
- OpenRouter `ai-sdk-provider` README (github raw) — `createOpenRouter({ apiKey, headers })` + `openrouter(modelId)`; v6 compat note (use 2.x for ai@6, 1.5.4 for v5).
- ai-sdk.dev official docs — tools-and-tool-calling (`tool({description,inputSchema,execute})`), chatbot-message-persistence (`toUIMessageStreamResponse({originalMessages,onFinish})`), testing (`MockLanguageModelV3`).
- Repo source (read first-hand): `lib/agent-tools/*`, `lib/queries/chat.ts`, `lib/ai/index.ts`, `lib/platform-config.ts`, `lib/billing/credit-ledger.ts` + `record-ai-cost.ts`, `lib/inngest/functions/generate-estimate.ts`, `lib/inngest/events.ts`, `package.json`.

### Secondary (MEDIUM confidence)
- WebSearch (verified against official docs): `stopWhen: stepCountIs(n)` multi-step semantics (ai-sdk.dev step-count-is reference + Vercel AI SDK 6 blog).

### Tertiary (LOW confidence)
- None load-bearing. (The OpenRouter docs `community/vercel-ai-sdk` URL 404'd; the README + npm provided the verified facts instead.)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions + peer deps verified against the live registry and the published type declarations (not training data).
- Architecture / API: HIGH — `streamText`/`tool`/`inputSchema`/`toUIMessageStreamResponse`/`stepCountIs`/`MockLanguageModelV3` confirmed in `ai@6.0.209` `.d.ts`.
- Repo wiring (credit reuse, neutral tools, persistence, slot resolution): HIGH — read first-hand from source.
- Pitfalls: HIGH — the version-rename pitfalls (`inputSchema`, `toUIMessageStreamResponse`, `stopWhen`) are cross-verified against the published types.

**Research date:** 2026-06-24
**Valid until:** ~2026-07-08 (AI SDK v6 is fast-moving — re-verify package versions and the `toUIMessageStreamResponse`/`onFinish` shape at plan time with `npm view` and the official docs).
