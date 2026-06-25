# Phase 122: Channel-Neutral Domain Extraction + WhatsApp Parity - Research

**Researched:** 2026-06-24
**Domain:** Refactor / module extraction (channel-neutral domain layer) — TypeScript, Next.js, LangChain/LangGraph, Vitest
**Confidence:** HIGH (codebase-verified; no external library research needed)

## Summary

This is a **non-destructive extraction refactor**, not a greenfield build. The four capabilities to neutralize (NEUT-01..04) are at four very different maturity levels, and the single most important finding is: **most of the neutral core already exists.** The engine that does the real work for each capability is already channel-neutral and already shared by multiple channels. What lives in `lib/whatsapp/` is mostly the *channel-specific orchestration wrapper* around an already-neutral engine — not the engine itself.

Concretely: (1) **CREATE** — `generateEstimateForProject` (`lib/services/generate-estimate.ts`) is already neutral and is already invoked by web (`/api/generate-estimate`), WhatsApp (Inngest), AND the MCP `create_estimate` tool (`lib/mcp/tools/write.ts`). The pattern "thin per-channel tool → `EVENT_ESTIMATE_GENERATE` Inngest event → `generateEstimateForProject`" is **already proven by two channels.** (2) **QUERY** — `makeQueryTools` already imports zero channel code; it's a pure `(companyId, supabase)` closure factory returning LangChain tools. (3) **NORMALIZE** — the neutral primitive `ingestMultimodal` (`lib/estimate/ingest/multimodal.ts`) already exists and is channel-neutral; `normalize.ts` is a thin WhatsApp adapter that hasn't yet been pointed at it. (4) **KNOWLEDGE** — `lib/knowledge/answer.ts` is already fully neutral (explicit `Channel-neutral (ENGINE-01)` contract + a neutrality test); the neutral `askKnowledge` is a trivial wrapper.

The real work of this phase is therefore **(a) drawing a clean neutral "capability function" seam** (the data/capability function, NOT the channel-specific tool wrapper), **(b) moving QUERY's data-read functions + NORMALIZE's core to neutral homes**, **(c) re-pointing the WhatsApp call sites at the neutral functions**, and **(d) the parity guard** — proving WhatsApp behaves byte-identically via the existing `tests/unit/whatsapp/*` suite plus new neutral-module neutrality tests.

**Primary recommendation:** Extract the **capability/data functions** to a new neutral home `lib/agent-tools/` (siblings of `lib/estimate/`, `lib/knowledge/`), and let each channel keep its own thin tool-format wrapper (LangChain tool for WhatsApp's ReAct, AI SDK tool for the chat in Phase 124). Use **move + re-point WhatsApp call sites** (not move + re-export shim) because the WhatsApp callers are few and the existing tests assert behavior, not import paths — a re-export shim would be dead weight you'd delete in Phase 124 anyway. Gate neutrality with a static source-grep test mirroring the existing `tests/unit/estimate/graph-neutrality.test.ts` and `tests/unit/knowledge/knowledge-neutrality.test.ts`.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NEUT-01 | `createEstimate` neutral domain function/tool both WhatsApp + chat call; no duplicated generation logic | Engine `generateEstimateForProject` ALREADY neutral + ALREADY shared (web/WhatsApp/MCP via `EVENT_ESTIMATE_GENERATE`). Neutral surface = a thin `createEstimate({companyId, projectId, prompts?, language?})` that dispatches the same Inngest event. The MCP `create_estimate` tool (`lib/mcp/tools/write.ts`) is the working precedent to copy. |
| NEUT-02 | `queryCompanyData` neutral tool both channels call (from `lib/whatsapp/query-tools`) | `makeQueryTools` imports NO channel code (verified). Extract = move the file to a neutral home; the *data-read functions* are the neutral asset. Recommend exposing the underlying reads so each channel can wrap them in its own tool format (LangChain vs AI SDK). |
| NEUT-03 | Multimodal ingestion (audio→transcript, photo→analysis) extracted to neutral module | Neutral primitive `ingestMultimodal` (`lib/estimate/ingest/multimodal.ts`) ALREADY exists + is neutral. Extract `normalize`'s core (bytes/base64 + type → text) to a neutral fn that wraps `ingestMultimodal`; `normalizeMessage` becomes a thin `WhatsAppMessage → neutral input` adapter. |
| NEUT-04 | Neutral `askKnowledge` wrapping `lib/knowledge/answer` (scoped by `industries[]` + overlay) | `answer()` is ALREADY neutral (`Channel-neutral (ENGINE-01)` + neutrality test). `askKnowledge` = trivial wrapper: `(question, {industries, companyId, language}) → answer(...)`. The `industries[]`/`companyId` company-read currently lives in `dispatchKnowledge` — lift that read into the neutral wrapper or keep it caller-supplied. |
| NEUT-05 | Extraction is NON-DESTRUCTIVE; WhatsApp behaves identically, proven by parity tests; no regression | The existing `tests/unit/whatsapp/*` suite (esp. `intent-router*.test.ts`, `query-tools.test.ts`, `normalize.test.ts`, `handler*.test.ts`, `never-reply-regression.test.ts`) is the parity guard — must stay green after re-pointing call sites. Add neutral-module neutrality tests as the forward guard. |
</phase_requirements>

## User Constraints (from CONTEXT.md)

> No `*-CONTEXT.md` file exists for Phase 122 (no `/gsd:discuss-phase` was run). Constraints below are lifted verbatim from the **locked decisions in REQUIREMENTS.md (v4.9)** and SEED-034, which bind this phase identically.

### Locked Decisions (from REQUIREMENTS.md + SEED-034)
- **WhatsApp = CHAT = MCP, three siblings** over the SAME channel-neutral core. The chat (and MCP) reimplement NO domain logic — they reuse the neutral modules. If a channel re-implements generation/query/edit, the milestone has failed.
- **AI SDK and LangGraph coexist in different LAYERS.** AI SDK = chat/streaming layer (Phase 124). LangGraph estimate engine stays **INTOCADO (untouched)** and is invoked as ONE tool; generation is an async Inngest job returning a structured estimate — the chat↔engine boundary is a **tool call, NOT a streaming bridge** (no `LangChainAdapter` in v1).
- **Web chat uses NATIVE tool-calling**; WhatsApp keeps its **pre-classifier** (`classifyAndRoute`). Both call the SAME neutral domain functions; only orchestration differs.
- **Owner-only**, authenticated, tenant-scoped, NEVER customer-facing.
- **Multi-tenant isolation invariant (T-lrf-01):** `companyId` is always a CLOSURE/param resolved upstream from the trusted owner identity — NEVER an LLM-supplied tool-input field. No tool schema may accept a `company_id`/`companyId`. This MUST survive the extraction unchanged.
- **Channel neutrality invariant (ENGINE-01):** neutral modules import NO channel package (no `lib/whatsapp/*`, no `ownerPhone`, `WhatsAppMessage`, `sendWhatsAppMessage`, `whatsapp_*`, `downloadWhatsAppMedia`).

### Claude's Discretion
- **The neutral home + naming** of the extracted layer (this research recommends `lib/agent-tools/` — see Architecture Patterns; alternatives evaluated).
- **Move + re-point call sites vs move + re-export shim** (this research recommends re-point — see Pitfalls).
- Whether QUERY's neutral asset is the *LangChain tools as-is* or the *underlying data-read functions* (this research recommends extracting the **data-read functions**; see NEUT-02 deep-dive).

### Deferred Ideas (OUT OF SCOPE — do NOT extract this phase)
- **Estimate edit-in-chat** (`lib/whatsapp/edit-commands.ts`, `agent.ts`, `agent-tools.ts`/`makeConfirmationTools`) → v2 (CHATX-01).
- **Confirm / send / deliver** (`confirm-actions.ts`, `confirm.ts`, `send-estimate.ts`, `pdf-delivery.ts`) → v2 (CHATX-02).
- **Ask-details / vagueness flow** as a neutral surface (`ask-details.ts`) → not a v1 chat capability.
- **The AI SDK chat backend itself** (`/api/chat`, `streamText`, `useChat`) → Phase 124+.
- **MCP parity work** (bringing these neutral capabilities to the MCP server) → subsequent milestone (SEED-030).

## Standard Stack

No new libraries are introduced in this phase. This is an internal refactor over the existing stack. Phase 124 adds `ai` + `@ai-sdk/*`; **do NOT add them here.**

### Core (already in the repo — reused, not installed)
| Library | Version (verified) | Purpose | Why Standard |
|---------|--------------------|---------|--------------|
| `@langchain/core` | (installed) | `tool()` factory for the WhatsApp QUERY ReAct tools | Already the WhatsApp tool format; stays the WhatsApp wrapper post-extraction |
| `@langchain/langgraph` | (installed) | `createReactAgent` (QUERY agent), estimate graph | Untouched by this phase |
| `@langchain/openai` | (installed) | `ChatOpenAI` classifier + ReAct LLM | Untouched |
| `zod` | (installed) | tool input schemas | The T-lrf-01 guard asserts no schema has `company_id` |
| `vitest` | `^4.1.4` (verified in package.json) | unit + neutrality tests | The parity guard + neutrality gate run here |
| `@supabase/supabase-js` | (installed) | `SupabaseClient` typing, service-role reads | Neutral functions take `supabase`/`companyId` as params (closure isolation) |

**Installation:** None. `npm install` adds nothing this phase.

**Version verification note:** Vitest `^4.1.4` confirmed in `package.json`; test command is `vitest run` (`npm test`). No registry lookups required because no package is added.

## Architecture Patterns

### The KEY insight (drives every decision below)

> **The neutral layer is the DATA / CAPABILITY function, not the channel-specific tool wrapper.**

A "tool" has two parts: (1) a channel-specific *binding* (LangChain `tool()` for WhatsApp's ReAct agent; an AI SDK `tool()` for the chat in Phase 124; an MCP `ToolDefinitionEntry` for the MCP server) and (2) the *capability* it invokes (read this client's latest estimate; transcribe this audio; answer this KB question; dispatch a generation job). **Only (2) is neutral.** Extract (2); let each channel keep its own (1). This is already how CREATE works across three channels and how the existing MCP read/write tools are built.

### Current state — what is ALREADY neutral vs coupled

| Capability | Neutral engine (already exists) | WhatsApp wrapper (coupled) | Extraction work |
|---|---|---|---|
| **CREATE** (NEUT-01) | `generateEstimateForProject` + `EVENT_ESTIMATE_GENERATE` Inngest job. Shared by web `/api/generate-estimate`, WhatsApp Inngest job, MCP `create_estimate`. | `dispatchCreate` in `intent-router.ts` → `processInboundMessages` (handler.ts): entitlement gate, draft-project create, batch debounce, WhatsApp inbox notify. | Define neutral `createEstimate(...)` that dispatches `EVENT_ESTIMATE_GENERATE` (copy MCP `write.ts`). WhatsApp keeps its own pre-flight wrapper. **Engine NOT touched.** |
| **QUERY** (NEUT-02) | — (the tools ARE the asset; no separate engine) | `makeQueryTools(companyId, supabase)` — **imports zero channel code** (verified). Returns 6 LangChain tools. The system prompt + ReAct loop live in `dispatchQuery`. | **Move** `makeQueryTools` + extract the underlying data-read fns to neutral. Recommend exposing the reads so the chat can wrap them as AI SDK tools without LangChain. |
| **NORMALIZE** (NEUT-03) | `ingestMultimodal` (`lib/estimate/ingest/multimodal.ts`) — neutral, takes Blobs/base64. | `normalizeMessage(WhatsAppMessage, ...)` — takes a `WhatsAppMessage`, calls `downloadWhatsAppMedia` + `transcribeAudioOR`/`analyzePhotoOR` directly (does NOT yet use `ingestMultimodal`). | Extract a neutral `normalizeInput({ kind, bytes/base64, mime, ext })` that wraps `ingestMultimodal`; `normalizeMessage` becomes a `WhatsAppMessage → neutral input` adapter that does the download + mime/ext derivation. |
| **KNOWLEDGE** (NEUT-04) | `lib/knowledge/answer.ts` — explicitly neutral (`Channel-neutral (ENGINE-01)`), neutrality-tested. | `dispatchKnowledge` in `intent-router.ts`: reads `industries[]`+`language` from `companies`, calls `answer()`, splits reply, sends WhatsApp. | Trivial neutral `askKnowledge(question, {industries, companyId, language})` wrapper over `answer()`. WhatsApp dispatch keeps reply-split + send. |

### Recommended neutral home + structure

The seed's diagram shows three core columns: `lib/estimate/` (CREATE), `query-tools` (QUERY), `lib/knowledge/` (KNOWLEDGE). CREATE and KNOWLEDGE already have neutral homes. The missing home is for **the cross-channel agent-facing capability functions** (the shared tools the three orchestrators call).

**Recommendation: create `lib/agent-tools/`** as a new top-level neutral module, sibling to `lib/estimate/`, `lib/knowledge/`, `lib/mcp/`.

```
lib/
├── estimate/                 # CREATE engine (neutral, EXISTS — untouched)
│   ├── ingest/multimodal.ts  # neutral raw-media→text primitive (EXISTS)
│   └── ...
├── knowledge/                # KNOWLEDGE engine (neutral, EXISTS — untouched)
│   └── answer.ts
├── agent-tools/              # NEW — the channel-neutral capability layer
│   ├── create-estimate.ts    # NEUT-01: createEstimate() → EVENT_ESTIMATE_GENERATE
│   ├── query-company-data.ts # NEUT-02: the data-read fns + makeQueryTools (moved)
│   ├── normalize-input.ts    # NEUT-03: neutral input → ingestMultimodal
│   ├── ask-knowledge.ts      # NEUT-04: thin wrapper over lib/knowledge/answer
│   └── index.ts              # barrel
└── whatsapp/                 # CHANNEL ADAPTERS ONLY after this phase
    ├── intent-router.ts      # re-pointed: imports from lib/agent-tools/*
    ├── normalize.ts          # thin WhatsAppMessage→neutral-input adapter
    └── query-tools.ts        # (option A) deleted; (option B) re-export shim
```

**Why `lib/agent-tools/` over the alternatives:**

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `lib/agent-tools/` (recommended) | `lib/estimate/` (extend it) | QUERY + KNOWLEDGE are NOT estimate-domain — folding them into `lib/estimate/` muddies that module's bounded context and would force `lib/estimate/` to import `lib/knowledge/`. Reject. |
| `lib/agent-tools/` | `lib/channels/core/` | Implies a channels framework that doesn't exist; over-naming for 4 files. The capabilities aren't "channels," they're the thing channels call. |
| `lib/agent-tools/` | `lib/agent/` | Acceptable; "agent-tools" is more precise since these are exactly the functions the three agents/orchestrators bind as tools. Either is defensible — pick one and be consistent. |

**Naming precedent in repo:** `makeQueryTools`, `makeConfirmationTools`, `makeWhatsAppAdapter` all use the `make*` closure-factory convention. Keep it: e.g. `makeQueryTools` stays named the same (just moves); `createEstimate`/`askKnowledge`/`normalizeInput` are plain neutral functions (no closure needed beyond their params).

### Pattern 1: Thin per-channel tool over a neutral capability (the CREATE precedent)

**What:** The neutral capability dispatches the Inngest job; each channel binds it in its own tool format. **When to use:** NEUT-01, and the template Phase 124's chat tool will copy.

```typescript
// Source: lib/mcp/tools/write.ts (verified) — the WORKING precedent
// MCP's create_estimate builds an EstimateGeneratePayload and dispatches the
// SAME Inngest event the web app uses, returning the event id as job_id.
const payload: EstimateGeneratePayload = {
  companyId,           // from trusted MCP auth context — NEVER LLM input
  projectId,           // validated tool input
  requestId: randomUUID(),
  prompts: [prompt],   // free-form prompt path into generateEstimateForProject
  language,
}
const { ids } = await inngest.send({ name: EVENT_ESTIMATE_GENERATE, /* id, */ data: payload })
// → returns ids[0] as job_id; caller polls check_job_status
```

The neutral `createEstimate` (NEUT-01) is this exact body, parameterized: `createEstimate({ companyId, projectId, prompts?, language? }): Promise<{ jobId }>`. WhatsApp's `dispatchCreate`/`processInboundMessages` keeps its entitlement gate + draft-project create + debounce as the WhatsApp wrapper; the chat tool (Phase 124) calls `createEstimate` directly with `streamText` tool-calling.

> **Decision point for the planner:** WhatsApp's CREATE path today is `processInboundMessages` → `EVENT_WHATSAPP_PROCESS` (a different event that runs the WhatsApp `makeWhatsAppAdapter` ingest fan-out for inbound media), NOT `EVENT_ESTIMATE_GENERATE`. So WhatsApp's "create" is heavier than the neutral `createEstimate` (it ingests WhatsApp media first). The neutral `createEstimate` should model the **prompt/already-ingested path** (the `EVENT_ESTIMATE_GENERATE` path that web + MCP use), and WhatsApp's media-ingest path stays WhatsApp-specific. **NEUT-01 is satisfied by "no duplicated generation logic"** — and there is none: every channel ends at `generateEstimateForProject`. Be careful NOT to try to force WhatsApp's media-ingest pipeline through the neutral `createEstimate`; that would be scope creep and a regression risk. The neutral surface is the generation *dispatch*, which all channels already share at the engine level.

### Pattern 2: Closure-factory tenant isolation (preserve verbatim)

**What:** `companyId`/`supabase` captured in a closure; never a tool-input field. **When to use:** NEUT-02 — must survive the move unchanged.

```typescript
// Source: lib/whatsapp/query-tools.ts (verified) — imports NO channel code
export function makeQueryTools(companyId: string, supabase: SupabaseClient) {
  // every query chains .eq('company_id', companyId); no zod schema accepts a tenant
  // ...6 tools...
}
```

The same factory shape powers `makeWhatsAppAdapter` (`lib/estimate/adapters/whatsapp.ts`). When moving `makeQueryTools`, the `import { formatMoney } from '@/lib/money/currency'` is its only non-channel dependency — clean to relocate.

### Pattern 3: Neutral primitive + thin channel adapter (the NORMALIZE shape)

**What:** A neutral fn takes already-downloaded bytes; the channel adapter does the download + mime derivation. **When to use:** NEUT-03.

```typescript
// Source: lib/estimate/ingest/multimodal.ts (verified, neutral) — the primitive
ingestMultimodal({ audio:[{blob, ext}], photos:[{base64, mimeType}], texts:[...] })
//   → { transcripts, photoDescriptions, texts }
```

`normalize.ts` currently calls `transcribeAudioOR`/`analyzePhotoOR` directly — the neutral `normalizeInput` should instead wrap `ingestMultimodal` (one fallback policy, already used by the estimate adapter). The WhatsApp-specific parts that STAY in `normalize.ts`: `downloadWhatsAppMedia`, the `mp4 → m4a` remap, the codec-param strip, and the `WhatsAppMessage` type-switch. The neutral `normalizeInput` returns the same `{ text, kind, ok, reason? }` shape so the intent-router contract is unchanged.

### Anti-Patterns to Avoid
- **Putting QUERY/KNOWLEDGE inside `lib/estimate/`** — wrong bounded context; forces `lib/estimate/` to import `lib/knowledge/`. Use `lib/agent-tools/`.
- **Making the neutral layer depend on a channel's tool format** — the neutral asset is the capability function. Do NOT export LangChain `tool()` objects as "the neutral API" — that locks the chat into LangChain when it's an AI SDK channel. Export the data-read functions; let WhatsApp keep `makeQueryTools` as its LangChain binding.
- **Forcing WhatsApp's media-ingest pipeline through a neutral `createEstimate`** — scope creep + the #1 regression risk. WhatsApp media ingest stays WhatsApp-specific.
- **Touching the LangGraph estimate engine** — locked decision: engine INTOCADO.
- **Adding `ai`/`@ai-sdk/*` this phase** — that's Phase 124.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| raw audio/photo → text | a new transcribe/vision path in the neutral normalize | `ingestMultimodal` (`lib/estimate/ingest/multimodal.ts`) | Already neutral, already carries the OpenRouter→Gemini fallback + per-item skip policy. A second path would drift. |
| dispatch a generation job | a new "neutral generation runner" | `inngest.send({ name: EVENT_ESTIMATE_GENERATE })` + `generateEstimateForProject` | Already the shared engine for web/WhatsApp/MCP; the only authoritative path. Copy `lib/mcp/tools/write.ts`. |
| KB RAG answer | re-prompt the model in the neutral wrapper | `lib/knowledge/answer.ts` `answer()` | Already neutral, hardened (KSEC-01), never-throws. `askKnowledge` is a 5-line wrapper. |
| tenant isolation | a new tenant-guard | the existing `companyId`-closure pattern | T-lrf-01 invariant; the existing test asserts it. Move it, don't redesign it. |
| channel-neutrality enforcement | manual code review | a static source-grep test | `tests/unit/estimate/graph-neutrality.test.ts` + `tests/unit/knowledge/knowledge-neutrality.test.ts` are copy-paste templates. |

**Key insight:** In this phase, almost everything you'd be tempted to "build" already exists one import away. The phase is plumbing (move + re-point + guard), not construction.

## Runtime State Inventory

> This is a pure code refactor (move + re-point imports). No stored data, service config, OS state, secrets, or build artifacts carry the symbol names being moved.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | None — no DB stores function/module names. Tenant data (`clients`, `projects`, `estimates`, `company_price_book`, `companies.industries`) is read by the moved functions but its schema/keys are untouched. | None |
| Live service config | None — no n8n/Datadog/external config references `lib/whatsapp/query-tools` or these symbols. Inngest event name `EVENT_ESTIMATE_GENERATE` is reused as-is (not renamed). | None |
| OS-registered state | None — no Task Scheduler/pm2/cron registration references these modules. The `cleanup-sessions-cron` touches WhatsApp sessions, not these capabilities. | None |
| Secrets/env vars | None — secret keys (`openai`, `openrouter` via `getIntegrationKey`) are read by the moved code but their NAMES are unchanged. Code-move only. | None |
| Build artifacts | None — TypeScript, no compiled package artifacts. Stale `.next` cache is rebuilt by CI→GHCR (per project deploy memory); no egg-info/binary equivalent. | None — `npm run build` in CI regenerates |

**The canonical question — after every file is updated, what still references the old paths?** Only **source imports** within the repo (the WhatsApp call sites + any test that imports `@/lib/whatsapp/query-tools` / `@/lib/whatsapp/normalize`). Those are caught by `tsc`/`vitest` at build time. Grep for importers before moving: `@/lib/whatsapp/query-tools`, `@/lib/whatsapp/normalize`, `normalizeMessage`, `makeQueryTools`.

## Common Pitfalls

### Pitfall 1: The parity guard tests import the OLD path
**What goes wrong:** `tests/unit/whatsapp/query-tools.test.ts` imports `@/lib/whatsapp/query-tools`; `tests/unit/whatsapp/normalize.test.ts` imports `@/lib/whatsapp/normalize`. If you move the source without updating these, the tests fail to resolve — a false "regression."
**Why it happens:** The tests are the parity guard but they're path-coupled.
**How to avoid:** Decide the migration strategy up front (see Pitfall 2). If re-pointing: update the test imports to the neutral path AND keep a WhatsApp-adapter test for what stays in `normalize.ts` (the download + mime/ext derivation). The *assertions* (m4a remap, no-throw, company_id closure) must remain byte-identical — only the import path changes.
**Warning signs:** A test diff that changes an `expect(...)` line — that means you changed behavior, not just location. Stop.

### Pitfall 2: Move + re-export shim leaves dead weight; move + re-point is cleaner here
**What goes wrong:** A re-export shim (`lib/whatsapp/query-tools.ts` → `export * from '@/lib/agent-tools/query-company-data'`) keeps old imports working but creates a permanent back-compat surface you'll delete in Phase 124 anyway.
**Why it happens:** Shims feel "lower risk" but here the callers are few and known.
**How to avoid:** **Recommend move + re-point.** Verified call sites of `makeQueryTools`: `lib/whatsapp/intent-router.ts` (`dispatchQuery`) + its test. Verified call sites of `normalizeMessage`: `intent-router.ts` (`classifyAndRoute`) + its test. That's ~2 source importers each — trivial to re-point. The behavioral guarantee comes from the unchanged test *assertions*, not from preserving import paths. (If the planner finds additional importers via grep, reassess — but the count is small.)
**Warning signs:** More than ~3 unexpected importers of a moved symbol → consider a temporary shim for that one symbol only.

### Pitfall 3: Breaking the T-lrf-01 tenant-isolation invariant during the move
**What goes wrong:** Refactoring `makeQueryTools` "to be more reusable" by adding a `companyId` tool-input field — the exact cross-tenant leak the security test forbids.
**Why it happens:** Making a function "neutral" can be misread as "make it take all inputs explicitly."
**How to avoid:** Move the closure-factory **verbatim**. The neutrality being added is "no `lib/whatsapp` import" (already true), NOT "parameterize the tenant." The test `tests/unit/whatsapp/query-tools.test.ts` Test 1a asserts no zod schema has `company_id`/`companyid` — it must stay green at the new path.
**Warning signs:** Any new `z.object({ ..., companyId })` in the moved file.

### Pitfall 4: Coupling the neutral layer to LangChain tool objects
**What goes wrong:** Exporting `makeQueryTools` (which returns `@langchain/core` `tool()` objects) as "the neutral query API," then Phase 124's AI-SDK chat is forced to depend on LangChain just to read a client's estimate.
**Why it happens:** `makeQueryTools` is the obvious thing to move, but it conflates the data read with the LangChain binding.
**How to avoid:** Extract the **underlying data-read functions** (e.g. `findClientByName`, `getLatestEstimateForClient`, `listRecentEstimates`, `listServices`, etc. as plain `(companyId, supabase, args) => Promise<string|rows>` functions) into `lib/agent-tools/query-company-data.ts`. Keep `makeQueryTools` as WhatsApp's LangChain binding over those functions (it can stay in `lib/whatsapp/` or move alongside as the "langchain adapter"). Phase 124 then wraps the same data-read functions in AI SDK `tool()`s. **This is the single highest-leverage design call in the phase.**
**Warning signs:** Phase 124 planning notes "chat needs `@langchain/core`" — that means NEUT-02 was extracted at the wrong layer.

### Pitfall 5: Re-pointing `intent-router.ts` changes WhatsApp behavior subtly
**What goes wrong:** `dispatchQuery`/`dispatchKnowledge` do more than call the capability — they read the company profile, build the system prompt, run the ReAct agent, `splitReply`, and `sendOwnerReplyChunks`. If you "extract" too much (e.g. the system prompt) into neutral, WhatsApp's exact reply wording/chunking can drift.
**Why it happens:** Over-extraction. The neutral surface is the *capability* (the tools / the `answer()` call), NOT the WhatsApp ReAct prompt or reply-splitting.
**How to avoid:** Draw the seam tightly: neutral = `makeQueryTools`'s data reads + `askKnowledge(question, ctx)`. WhatsApp-specific = the QUERY system prompt, the ReAct agent construction, `splitReply`, `sendOwnerReplyChunks`. The chat (Phase 124) will have its OWN system prompt + streaming. Leave the WhatsApp prompt/chunking in `intent-router.ts`.
**Warning signs:** A test in `intent-router*.test.ts` or `never-reply-regression.test.ts` changes an expected reply string.

## Code Examples

### NEUT-04 neutral askKnowledge (target shape)
```typescript
// lib/agent-tools/ask-knowledge.ts — thin neutral wrapper (NEUT-04)
// Source pattern: lib/knowledge/answer.ts answer() is already neutral + never-throws.
import { answer } from '@/lib/knowledge/answer'

export async function askKnowledge(
  question: string,
  ctx: { industries: string[]; companyId: string; language?: 'en' | 'pt' | 'es' }
): Promise<string> {
  return answer(question, ctx)   // answer() merges industry KB + company overlay
}
```
WhatsApp's `dispatchKnowledge` keeps the `companies.industries`/`language` read + `splitReply` + send; it just calls `askKnowledge` instead of `answer` (or the company-read also lifts into a neutral `askKnowledgeForCompany` if both channels want it — planner's call, both are 1 read).

### NEUT-02 data-read extraction (target shape)
```typescript
// lib/agent-tools/query-company-data.ts (NEUT-02) — neutral data reads
// Tenant isolation preserved: companyId is a param, NEVER a tool-input field.
export async function getLatestEstimateForClient(
  companyId: string, supabase: SupabaseClient, name: string
): Promise<string> { /* moved verbatim body; every query .eq('company_id', companyId) */ }
// ...findClientByName, getProjectStatus, listRecentEstimates, listServices, findServiceByName

// lib/whatsapp/query-tools.ts (STAYS as WhatsApp's LangChain binding)
export function makeQueryTools(companyId: string, supabase: SupabaseClient) {
  return [ tool(({name}) => getLatestEstimateForClient(companyId, supabase, name), {...}), /* ... */ ]
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WhatsApp owns all domain logic in `lib/whatsapp/` | Channel-neutral core (`lib/estimate/`, `lib/knowledge/`, `lib/estimate/ingest/`) + thin channel adapters; MCP already a sibling | Phases 89 (MCP), 94 (ChannelAdapter), 99 (ingest unify), v4.8 (knowledge) | Most extraction precedent already exists; this phase finishes the QUERY + NORMALIZE seams and names the shared layer |
| `normalize.ts` calls `transcribeAudioOR`/`analyzePhotoOR` directly | `ingestMultimodal` neutral primitive (one fallback policy) | Phase 99 (UNIFY-01) | NEUT-03 should re-point normalize at `ingestMultimodal` rather than the raw primitives |

**Deprecated/outdated:** Nothing to remove. The phase is additive (new `lib/agent-tools/`) + re-pointing. The `intent-router.ts` header comments referencing "four intents" are stale (there are five — KNOWLEDGE was added); harmless, optional cleanup.

## Open Questions

1. **Does the neutral `createEstimate` need a draft-project step, or only the dispatch?**
   - What we know: web/MCP pass an existing `projectId`; WhatsApp's `processInboundMessages` *creates* the draft project before dispatch. The chat (Phase 124) will also need a project to attach to.
   - What's unclear: whether draft-project creation belongs in neutral `createEstimate` or stays per-channel.
   - Recommendation: keep `createEstimate({ companyId, projectId, ... })` requiring a `projectId` (matches web + MCP); leave project creation to the channel. Phase 124 can add a tiny neutral `ensureDraftProject` helper if the chat needs it — out of scope here. NEUT-01 is about no duplicated *generation* logic, which is already satisfied.

2. **Where does `makeQueryTools` (the LangChain binding) live after extraction?**
   - What we know: it's WhatsApp's tool format; the chat won't use it.
   - Recommendation: leave `makeQueryTools` in `lib/whatsapp/query-tools.ts` as the WhatsApp LangChain adapter, importing the neutral data-reads from `lib/agent-tools/query-company-data.ts`. Keeps the neutral layer LangChain-free (Pitfall 4). Acceptable alternative: `lib/whatsapp/query-tools.ts` becomes a thin file that only builds tools.

3. **Should the `companies.industries`/`language` read for KNOWLEDGE be neutral or caller-supplied?**
   - What we know: `dispatchKnowledge` reads it from `companies`; `answer()` takes `industries` as caller-supplied.
   - Recommendation: provide BOTH — a low-level `askKnowledge(question, ctx)` (caller supplies industries) and optionally a convenience `askKnowledgeForCompany(question, {companyId, supabase, question})` that does the read. The chat and WhatsApp both want the company-scoped variant, so the convenience form avoids duplicating the `companies` read across channels. Planner's discretion; both are trivial.

## Validation Architecture

> `workflow.nyquist_validation: true` (verified in `.planning/config.json`) — section included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest `^4.1.4` |
| Config file | `vitest.config.ts` |
| Quick run command | `npx vitest run tests/unit/whatsapp/query-tools.test.ts tests/unit/whatsapp/normalize.test.ts` |
| Full suite command | `npm test` (`vitest run`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NEUT-01 | `createEstimate` dispatches `EVENT_ESTIMATE_GENERATE` with correct payload; no LLM-supplied tenant | unit | `npx vitest run tests/unit/agent-tools/create-estimate.test.ts` | ❌ Wave 0 |
| NEUT-02 | Moved data-reads filter every query by closure `companyId`; no schema accepts a tenant (T-lrf-01); same outputs as today | unit | `npx vitest run tests/unit/whatsapp/query-tools.test.ts tests/unit/agent-tools/query-company-data.test.ts` | ✅ (whatsapp) / ❌ Wave 0 (neutral) |
| NEUT-03 | Neutral `normalizeInput` wraps `ingestMultimodal`; WhatsApp adapter preserves m4a remap + codec strip + no-throw `{ok:false}` | unit | `npx vitest run tests/unit/whatsapp/normalize.test.ts tests/unit/agent-tools/normalize-input.test.ts` | ✅ (whatsapp) / ❌ Wave 0 (neutral) |
| NEUT-04 | `askKnowledge` delegates to `answer()` with `{industries, companyId, language}`; never throws | unit | `npx vitest run tests/unit/agent-tools/ask-knowledge.test.ts` | ❌ Wave 0 |
| NEUT-05 | WhatsApp behaves identically post-extraction (parity guard) + neutral modules import no channel token | unit | `npx vitest run tests/unit/whatsapp/ tests/unit/agent-tools/neutrality.test.ts` | ✅ (whatsapp suite) / ❌ Wave 0 (neutrality) |

**The existing parity guard (must stay green, assertions unchanged):**
- `tests/unit/whatsapp/intent-router.test.ts`, `tests/unit/whatsapp/intent-router-knowledge.test.ts` — QUERY/KNOWLEDGE dispatch
- `tests/unit/whatsapp/handler-intent-routing.test.ts`, `tests/unit/whatsapp/handler.test.ts`, `tests/unit/whatsapp/handler-inngest-dispatch.test.ts` — CREATE dispatch
- `tests/unit/whatsapp/query-tools.test.ts` — QUERY tools + T-lrf-01 isolation
- `tests/unit/whatsapp/normalize.test.ts` — multimodal normalize
- `tests/unit/whatsapp/never-reply-regression.test.ts` — reply invariant
- `tests/unit/inngest/whatsapp-process-job.test.ts`, `tests/unit/errors/whatsapp-adapter.test.ts` — engine path

### Sampling Rate
- **Per task commit:** the touched module's test (e.g. `npx vitest run tests/unit/whatsapp/query-tools.test.ts`)
- **Per wave merge:** `npx vitest run tests/unit/whatsapp/ tests/unit/agent-tools/ tests/unit/knowledge/`
- **Phase gate:** `npm test` fully green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/agent-tools/neutrality.test.ts` — static source-grep: `lib/agent-tools/*` imports no `lib/whatsapp/*` / channel token (copy `tests/unit/knowledge/knowledge-neutrality.test.ts`, repoint `KNOWLEDGE_DIR` → `lib/agent-tools`)
- [ ] `tests/unit/agent-tools/query-company-data.test.ts` — covers NEUT-02 at the neutral path (port assertions from `whatsapp/query-tools.test.ts`)
- [ ] `tests/unit/agent-tools/normalize-input.test.ts` — covers NEUT-03 neutral core (delegates to `ingestMultimodal`)
- [ ] `tests/unit/agent-tools/create-estimate.test.ts` — covers NEUT-01 dispatch payload (mock `inngest.send`; assert `EVENT_ESTIMATE_GENERATE` + no LLM tenant)
- [ ] `tests/unit/agent-tools/ask-knowledge.test.ts` — covers NEUT-04 wrapper (mock `answer`)
- [ ] Update import paths in `tests/unit/whatsapp/query-tools.test.ts` + `tests/unit/whatsapp/normalize.test.ts` IF re-pointing (Pitfall 2) — assertions unchanged
- Framework install: none (Vitest already present)

## Environment Availability

> Pure code/config refactor with no NEW external dependencies. All runtime deps (OpenRouter via `getIntegrationKey('openrouter')`, OpenAI via `getIntegrationKey('openai')`, Inngest, Supabase service client) are already wired and used by the code being moved. **Step 2.6: SKIPPED for new dependencies** — nothing new is required to plan or execute this phase.

## Project Constraints (from CLAUDE.md)

- **GSD workflow:** all edits go through a GSD command (this phase runs under `/gsd:execute-phase`). No direct repo edits.
- **Secret handling (CRITICAL):** never commit secrets; this phase touches code that *reads* keys via `getIntegrationKey` but introduces no key literals. Planning docs use placeholders only. `gitleaks` pre-commit hook is active.
- **Tech stack:** Next.js 14+ App Router, TypeScript strict, Supabase Postgres + RLS, server-side AI calls only, service role key never in browser. The moved neutral functions are server-only (`generate-estimate.ts` uses `requireServiceClient`; `answer.ts` is `import 'server-only'`) — preserve that.
- **Channel neutrality (ENGINE-01) + tenant isolation (T-lrf-01):** enforced by static + unit tests (above). Treated as locked.
- **Deploy:** CI→GHCR→Coolify; never build on the VPS (project memory). No deploy action in this phase, but the `npm run build` that CI runs must pass (TypeScript resolves all re-pointed imports).
- **Project name:** "Xtimator" (not "EstimateBuilder Pro").
- **Windows path-length (project memory):** the phase dir `122-channel-neutral-domain-extraction` is long; run GSD executors in-place (no worktree isolation) to avoid MAX_PATH.

## Sources

### Primary (HIGH confidence — codebase-verified, read in full)
- `lib/services/generate-estimate.ts` — `generateEstimateForProject` (neutral engine, NEUT-01)
- `lib/whatsapp/intent-router.ts` — `classifyAndRoute`/`dispatchCreate`/`dispatchQuery`/`dispatchKnowledge`
- `lib/whatsapp/handler.ts` — `processInboundMessages` (CREATE path)
- `lib/whatsapp/query-tools.ts` — `makeQueryTools` (NEUT-02; verified zero channel imports)
- `lib/whatsapp/normalize.ts` — `normalizeMessage` (NEUT-03)
- `lib/estimate/ingest/multimodal.ts` — `ingestMultimodal` (neutral primitive, NEUT-03 target)
- `lib/knowledge/answer.ts` — `answer()` (neutral, NEUT-04 target; `import 'server-only'`)
- `lib/estimate/adapters/whatsapp.ts` — `makeWhatsAppAdapter` (ChannelAdapter closure-factory precedent)
- `lib/mcp/tools/write.ts` — `create_estimate` (the WORKING NEUT-01 precedent; dispatches `EVENT_ESTIMATE_GENERATE`)
- `lib/inngest/events.ts` — `EVENT_ESTIMATE_GENERATE`, `EstimateGeneratePayload`
- `tests/unit/whatsapp/query-tools.test.ts`, `tests/unit/whatsapp/normalize.test.ts` — parity guard (path-coupled)
- `tests/unit/knowledge/knowledge-neutrality.test.ts`, `tests/unit/estimate/graph-neutrality.test.ts` — neutrality-gate templates
- `.planning/REQUIREMENTS.md`, `.planning/seeds/SEED-034-internal-web-chat-assistant.md`, `.planning/STATE.md`, `.planning/config.json`
- `CLAUDE.md` + auto-memory (deploy, Windows path, project name constraints)
- `package.json` — Vitest `^4.1.4`, `npm test` = `vitest run`

### Secondary / Tertiary
- None — no external library research was required (internal refactor over the existing stack).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages; all reused deps verified present in repo.
- Architecture: HIGH — extraction seams traced to concrete, read-in-full source; the cross-channel CREATE pattern is already proven by MCP + web.
- Pitfalls: HIGH — derived from the actual T-lrf-01 test, the path-coupled parity tests, and the existing neutrality-gate tests.
- Open questions: MEDIUM — three small seam-placement calls left to the planner's discretion (all locked decisions are honored either way).

**Research date:** 2026-06-24
**Valid until:** 2026-07-24 (stable internal-refactor domain; no fast-moving external deps). Re-verify only if `lib/whatsapp/`, `lib/estimate/ingest/`, or the Inngest event contract change before planning.
