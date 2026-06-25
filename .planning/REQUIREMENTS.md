# Requirements: Xtimator — Milestone v4.9 Internal Web Chat Assistant

**Defined:** 2026-06-24
**Core Value:** A business owner can go from job site audio recording to a sent, professional estimate in under 5 minutes without touching a keyboard.
**Milestone goal:** A conversational chat inside the Xtimator web app where the owner generates estimates, queries their data, and asks trade how-to questions — built on the Vercel AI Chatbot structure over Xtimator's existing infra. The strategic value is forcing the channel-neutral extraction of `lib/whatsapp/` into shared domain tools. Source: [SEED-034](seeds/SEED-034-internal-web-chat-assistant.md).

> **Locked decisions (from SEED-034):**
> - **WhatsApp = CHAT = MCP, three siblings** over the SAME channel-neutral core. The chat reimplements NO domain logic — it reuses the neutral modules.
> - **AI SDK and LangGraph coexist in different LAYERS.** The Vercel AI SDK is the chat/streaming layer (`useChat` + `streamText` + native tool-calling). The LangGraph estimate engine stays INTOCADO and is invoked as ONE tool — generation is an async Inngest job returning a structured estimate, so the chat↔engine boundary is a tool call, NOT a streaming bridge (no LangChainAdapter in v1).
> - **Web chat uses NATIVE tool-calling** (vs WhatsApp's pre-classifier); both call the SAME neutral domain functions, only the orchestration differs.
> - **Adopt** Next.js App Router+RSC + shadcn/Tailwind (already ours) + the AI SDK streaming/useChat/tool-call patterns. **Substitute** Auth.js→Supabase Auth, Neon/Drizzle→Supabase Postgres, Vercel Blob→our storage, AI Gateway→OpenRouter.
> - **Owner-only** — authenticated, tenant-scoped, NEVER customer-facing (Xtimator never talks to the end customer).
> - **Model via `ai_config` slots** (not hard-coded); heavy operations consume credits per v4.7, the conversation turn is absorbed.
> - **Scope fence:** the web-chat channel + the channel-neutral extraction it forces. MCP parity (SEED-030) is a SUBSEQUENT milestone — the extraction here makes it cheap. v1 ships generate + query + knowledge + multimodal; estimate-edit-in-chat and send-in-chat are deferred (the owner opens the result in the existing editor).

## v1 Requirements

Requirements for this milestone. Each maps to exactly one roadmap phase.

### Channel-Neutral Domain Extraction (foundation)

- [ ] **NEUT-01**: The estimate-generation capability is a channel-neutral domain function/tool (`createEstimate`) that both the WhatsApp handler and the new chat call — no channel-specific generation logic is duplicated.
- [ ] **NEUT-02**: The company-data query capability (today `lib/whatsapp/query-tools`) is a channel-neutral tool (`queryCompanyData`) both channels call.
- [ ] **NEUT-03**: Multimodal ingestion (`lib/whatsapp/normalize`: audio→transcript, photo→analysis) is extracted to a channel-neutral module both channels reuse.
- [ ] **NEUT-04**: A channel-neutral `askKnowledge` tool wraps the v4.8 `lib/knowledge/answer` (scoped by the company's `industries[]` + overlay).
- [ ] **NEUT-05**: The extraction is NON-DESTRUCTIVE — WhatsApp behaves identically (same estimate/query/knowledge results), proven by behavioral-parity tests; no WhatsApp regression.

### Chat Persistence

- [ ] **CHATDB-01**: `chat_conversations` + `chat_messages` tables exist with tenant-scoped RLS (mirroring `whatsapp_inbox`); idempotent migration, authored-only.
- [ ] **CHATDB-02**: Conversations and their messages persist and reload (a returning owner sees their chat history).

### AI SDK Chat Backend

- [ ] **CHATBE-01**: The Vercel AI SDK (`ai` + `@ai-sdk/*`) is added; the chat resolves its model via the `ai_config` slots (not hard-coded) through an OpenRouter-compatible provider.
- [ ] **CHATBE-02**: An `/api/chat` route uses `streamText` + native tool-calling, exposing the neutral domain tools (`createEstimate`, `queryCompanyData`, `askKnowledge`).
- [ ] **CHATBE-03**: Estimate generation is invoked as a tool that runs the existing `generateEstimateForProject` engine (async Inngest job) and returns a structured estimate — the LangGraph engine is unchanged.

### Chat UI

- [ ] **CHATUI-01**: A `useChat`-backed streaming chat surface renders the assistant's tokens and each tool-call's progress (e.g. "generating estimate…", "looking up João's last quote…").
- [ ] **CHATUI-02**: A conversation sidebar lists prior conversations with new/switch, and the selected conversation's history loads.
- [ ] **CHATUI-03**: The chat input is multimodal (text + audio + photo), routed through the extracted `normalize`.
- [ ] **CHATUI-04**: When a generation tool completes, an inline estimate card renders with an action to open it in the existing estimate editor.

### Credits, Slots & Access

- [ ] **CHATMETER-01**: Heavy chat operations (generation, transcription, photo analysis) consume credits via the v4.7 ledger exactly as the other channels do (by reusing the neutral functions that already debit); the lightweight conversation turn is absorbed.
- [ ] **CHATMETER-02**: The chat is owner-only (authenticated, tenant-scoped) and gated by tier entitlement (a Pro/Business feature); it is never reachable by an end customer.

## v2 Requirements

Deferred to a future milestone. Tracked but not in this roadmap.

### Richer Chat

- **CHATX-01**: Estimate editing in-chat (extract the WhatsApp edit-commands capability to neutral; edit a draft conversationally).
- **CHATX-02**: Send/deliver an estimate in-chat (extract the confirm/send capability).
- **CHATX-03**: Live streaming of the generation's intermediate reasoning into the chat (the LangChainAdapter bridge).

### Other Channels

- **MCPX-01**: MCP parity — bring the same neutral capabilities (incl. `ask_knowledge`) to the MCP server (SEED-030's milestone).

## Out of Scope

| Feature | Reason |
|---------|--------|
| Forking the Vercel template wholesale | Port the patterns onto Supabase/OpenRouter; don't import Auth.js/Drizzle/Neon/Blob |
| Rewriting the LangGraph estimate engine in the AI SDK | The engine stays intact, invoked as a tool (Decision #1) |
| Customer-facing chat | Xtimator never talks to the end customer — owner-only |
| Estimate edit/send in-chat (v1) | Deferred; v1 ships generate+query+knowledge, owner opens result in the existing editor |
| MCP parity | A subsequent milestone (SEED-030) that consumes this extraction |
| Pre-classifier for the web chat | The web chat uses native tool-calling (Decision #2); the pre-classifier stays WhatsApp's |

## Traceability

Which phases cover which requirements. Populated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| NEUT-01 | Phase 122 | Pending |
| NEUT-02 | Phase 122 | Pending |
| NEUT-03 | Phase 122 | Pending |
| NEUT-04 | Phase 122 | Pending |
| NEUT-05 | Phase 122 | Pending |
| CHATDB-01 | Phase 123 | Pending |
| CHATDB-02 | Phase 123 | Pending |
| CHATBE-01 | Phase 124 | Pending |
| CHATBE-02 | Phase 124 | Pending |
| CHATBE-03 | Phase 124 | Pending |
| CHATUI-01 | Phase 125 | Pending |
| CHATUI-02 | Phase 125 | Pending |
| CHATUI-03 | Phase 125 | Pending |
| CHATUI-04 | Phase 125 | Pending |
| CHATMETER-01 | Phase 124 | Pending |
| CHATMETER-02 | Phase 126 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-06-24*
*Last updated: 2026-06-25 — milestone v4.9 roadmap created. 5 phases (122-126), 16/16 requirements mapped, no orphans. 122 channel-neutral extraction + parity (NEUT-01..05) → 123 chat persistence (CHATDB-01/02) → 124 AI SDK + /api/chat tool-calling backend + slots + credit reuse (CHATBE-01..03, CHATMETER-01) → 125 chat UI (CHATUI-01..04) → 126 access/entitlement gate (CHATMETER-02).*
