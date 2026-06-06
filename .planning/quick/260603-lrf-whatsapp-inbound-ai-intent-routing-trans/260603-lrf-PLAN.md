---
phase: quick-260603-lrf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/whatsapp/normalize.ts
  - lib/whatsapp/query-tools.ts
  - lib/whatsapp/intent-router.ts
  - lib/whatsapp/handler.ts
  - lib/inngest/events.ts
  - lib/inngest/functions/whatsapp-process.ts
  - lib/inngest/functions/index.ts
  - tests/unit/whatsapp/normalize.test.ts
  - tests/unit/whatsapp/query-tools.test.ts
  - tests/unit/whatsapp/intent-router.test.ts
  - tests/unit/whatsapp/handler-intent-routing.test.ts
autonomous: true
requirements:
  - WA-INTENT-01  # normalize-first (audio/photo→text) for every inbound, any session state
  - WA-INTENT-02  # AI intent classifier (CONFIRM_OR_CANCEL / EDIT / CREATE / QUERY) via LangGraph
  - WA-INTENT-03  # multi-tenant-scoped read-only QUERY tools (company_id from trusted resolved value only)
  - WA-INTENT-04  # route classification + heavy work through Inngest after fast webhook ack
user_setup: []

must_haves:
  truths:
    - "An audio or photo that arrives while a session is in awaiting_confirm is transcribed/analyzed and acted on (NOT rejected with a canned 'reply send or cancel')."
    - "Every inbound message (any session state) is normalized to text before classification: audio→transcribeAudioOR, photo→analyzePhotoOR, text→as-is, using the SAME provider path as estimate-graph.ts."
    - "An inbound is classified into exactly one of CONFIRM_OR_CANCEL, EDIT, CREATE, QUERY using session + recent whatsapp_messages history as context."
    - "A QUERY (e.g. 'qual o ultimo estimate do cliente Joao') returns data ONLY for the sender's resolved company_id and never for any other tenant."
    - "MULTI-TENANT ISOLATION INVARIANT: every read-tool query is filtered by the company_id resolved upstream in route.ts; company_id is NEVER read from the message text or the LLM output."
    - "CREATE on a new audio/photo while a draft is pending closes/discards the pending awaiting_confirm session, then runs the existing create path on the new content."
    - "Read receipt + typing indicator still fire at the start (in processInboundWithDebounce) before the heavy classification work, and heavy work runs in Inngest after the webhook ack."
  artifacts:
    - path: "lib/whatsapp/normalize.ts"
      provides: "normalizeMessage(msg, companyId, supabase) → { text, kind } reusing transcribeAudioOR/analyzePhotoOR + downloadWhatsAppMedia"
      min_lines: 40
    - path: "lib/whatsapp/query-tools.ts"
      provides: "makeQueryTools(companyId, supabase) → company-scoped read-only LangChain tools (find_client_by_name, get_latest_estimate_for_client, get_project_status, list_recent_estimates)"
      min_lines: 80
      contains: "companyId"
    - path: "lib/whatsapp/intent-router.ts"
      provides: "classifyAndRoute LangGraph graph: normalize → classify (ChatOpenAI) → dispatch to confirm/edit/create/query"
      min_lines: 80
    - path: "lib/inngest/functions/whatsapp-process.ts"
      provides: "whatsAppIntentRouterJob (new fn for session-state inbound) + existing whatsAppProcessJob (create path) unchanged"
      contains: "intent-router"
  key_links:
    - from: "lib/whatsapp/handler.ts"
      to: "EVENT_WHATSAPP_INTENT (Inngest)"
      via: "processSingleMessageWithSession replaced by inngest.send for awaiting_confirm/awaiting_details"
      pattern: "EVENT_WHATSAPP_INTENT"
    - from: "lib/inngest/functions/whatsapp-process.ts"
      to: "lib/whatsapp/intent-router.ts"
      via: "buildIntentRouterGraph().invoke inside a step.run"
      pattern: "buildIntentRouterGraph|classifyAndRoute"
    - from: "lib/whatsapp/query-tools.ts"
      to: "clients / projects / estimates"
      via: "service-client reads filtered by company_id"
      pattern: "\\.eq\\(['\"]company_id['\"]"
    - from: "lib/whatsapp/normalize.ts"
      to: "transcribeAudioOR / analyzePhotoOR"
      via: "reused from lib/ai/openrouter-client"
      pattern: "transcribeAudioOR|analyzePhotoOR"
---

<objective>
WhatsApp inbound currently gets STUCK in the `awaiting_confirm` session state: any non-text
message (audio/photo) arriving while an estimate is pending is rejected by
`processSingleMessageWithSession` with a canned "Reply send or cancel" — the media is never
transcribed or analyzed. There is also no way to ASK questions about existing data.

This plan replaces the rigid send/cancel gate with an AI intent classifier that runs on
EVERY inbound message (any session state). Each message is NORMALIZED to text first
(audio→transcription, photo→image analysis, text→as-is) using the EXACT same provider path
the estimate flow uses today (`transcribeAudioOR` / `analyzePhotoOR` from
`lib/ai/openrouter-client` — transcription is OpenAI whisper-1 direct, do NOT invent a new
provider). The normalized text + session context + recent conversation history are classified
into one of four intents and routed to the existing flows:

- CONFIRM_OR_CANCEL → existing `processConfirmationReply` / `runConfirmationAgent`
- EDIT → existing `runConfirmationAgent` + `makeConfirmationTools`
- CREATE → discard pending session, run existing `processInboundMessages` → estimate-graph
- QUERY → NEW read-only, strictly multi-tenant-scoped LangChain tools

Purpose: the bot reads every new audio/photo even mid-confirmation, and owners can ask
"qual o ultimo estimate do cliente X" over WhatsApp.
Output: 3 new lib modules + Inngest router job + handler rewire + 4 unit test files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<placement_decision>
WHERE the classifier runs (requirement #5): INSIDE Inngest, after the fast webhook ack.

Rationale: normalization (audio download + Whisper) + the classifier LLM call are slow
(seconds) and MUST NOT block the Meta webhook ack (<1s). The existing CREATE path already
dispatches heavy work to `whatsAppProcessJob` via Inngest. The bug is that the SESSION path
in handler.ts (`awaiting_confirm` / `awaiting_details`) runs SYNCHRONOUSLY in the webhook
`after()` thread and short-circuits with the canned reply.

Fix: handler.ts dispatches a NEW Inngest event `EVENT_WHATSAPP_INTENT` for session-state
inbound (carrying the single message + session snapshot), exactly mirroring how the
no-session path dispatches `EVENT_WHATSAPP_PROCESS`. A new Inngest function runs the
intent-router graph. Read receipt + typing indicator stay at the START of
`processInboundWithDebounce` (already there) before any dispatch. Idempotency reuses the
existing wamid batchKey pattern (`wa-intent-{messageId}`).
</placement_decision>

<reuse_map>
DO NOT reimplement — import and reuse:
- transcribeAudioOR, analyzePhotoOR   from @/lib/ai/openrouter-client  (normalize step)
- downloadWhatsAppMedia               from @/lib/whatsapp/client       (media fetch)
- runConfirmationAgent                from @/lib/whatsapp/agent        (EDIT + CONFIRM_OR_CANCEL)
- processConfirmationReply            from @/lib/whatsapp/confirm      (CONFIRM_OR_CANCEL text path)
- makeConfirmationTools               from @/lib/whatsapp/agent-tools  (EDIT tools, already used by agent)
- actionCancel                        from @/lib/whatsapp/confirm-actions (discard pending session on CREATE)
- processInboundMessages              from @/lib/whatsapp/handler      (CREATE path → estimate-graph)
- logOutboundMessage                  from @/lib/whatsapp/conversations
- sendWhatsAppMessage                 from @/lib/whatsapp/client
- requireServiceClient                from @/lib/supabase/service
- ChatOpenAI                          from @langchain/openai  (gpt-4o, temperature 0 — same as agent.ts)
- loadConversationHistory pattern: agent.ts reads last 20 whatsapp_messages (direction/body/msg_type) for the (company, ownerPhone) conversation. Reuse the same query shape for classifier context.
</reuse_map>

<interfaces>
Session shape (from confirm.ts / confirm-actions.ts):
```typescript
type Session = { id: string; state: string; draft_project_id: string | null; draft_estimate_id: string | null }
```
WhatsAppMessage (from lib/whatsapp/types.ts):
```typescript
interface WhatsAppMessage {
  id: string; from: string; timestamp: string
  type: 'text'|'audio'|'image'|'document'|'video'|'sticker'|'reaction'|'unknown'
  text?: { body: string }
  audio?: { id: string; mime_type: string }
  image?: { id: string; mime_type: string; caption?: string }
}
```
Audio normalization (copy mime/ext handling from estimate-graph.ts processMessageNode):
```typescript
const mimeType = (msg.audio.mime_type ?? 'audio/ogg').split(';')[0].trim()
const rawExt = mimeType.split('/')[1] ?? 'ogg'
const ext = rawExt === 'mp4' ? 'm4a' : rawExt   // Whisper needs m4a not mp4
const buf = await downloadWhatsAppMedia(msg.audio.id)
const text = await transcribeAudioOR(new Blob([new Uint8Array(buf)], { type: mimeType }), ext)
```
Photo normalization:
```typescript
const mimeType = msg.image.mime_type ?? 'image/jpeg'
const buf = await downloadWhatsAppMedia(msg.image.id)
const text = await analyzePhotoOR(buf.toString('base64'), mimeType)
```
DB columns available for QUERY tools (initial_schema.sql):
- clients(id, company_id, name, email, phone, address, city, state, ...)
- projects(id, company_id, client_id, name, status, total, created_at, updated_at)
- estimates(id, project_id, company_id, status, summary, timeline, total, currency_code, created_at, ...)
Inngest event constants live in @/lib/inngest/events (EVENT_WHATSAPP_PROCESS already there).
Inngest function registry: lib/inngest/functions/index.ts (export array consumed by /api/inngest).
</interfaces>

@lib/whatsapp/handler.ts
@lib/whatsapp/agent.ts
@lib/whatsapp/estimate-graph.ts
@lib/inngest/functions/whatsapp-process.ts
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Normalizer + multi-tenant QUERY tools</name>
  <files>lib/whatsapp/normalize.ts, lib/whatsapp/query-tools.ts, tests/unit/whatsapp/normalize.test.ts, tests/unit/whatsapp/query-tools.test.ts</files>
  <behavior>
    normalize.ts — normalizeMessage(msg, companyId, supabase) → { text: string; kind: 'text'|'audio'|'photo'|'unknown'; ok: boolean; reason?: string }:
    - text msg → { text: msg.text.body, kind: 'text', ok: true }
    - audio msg → downloadWhatsAppMedia + transcribeAudioOR (mime/ext handling EXACTLY as estimate-graph.ts: strip codec param, mp4→m4a); { text: transcript, kind: 'audio', ok: true }; on download/transcription failure return { text: '', kind:'audio', ok: false, reason }
    - image msg → downloadWhatsAppMedia + analyzePhotoOR(base64, mime); prepend caption if present; { text, kind:'photo', ok:true }
    - other → { text:'', kind:'unknown', ok:false, reason:'unsupported_type' }
    - Test 1: text passthrough returns body unchanged
    - Test 2: audio path calls transcribeAudioOR with m4a when mime is audio/mp4 (mocked)
    - Test 3: photo path calls analyzePhotoOR with base64 (mocked) and includes caption
    - Test 4: download failure returns ok:false (no throw)

    query-tools.ts — makeQueryTools(companyId: string, supabase: SupabaseClient) returns LangChain tools. companyId is a CLOSURE parameter (trusted, resolved upstream) — NEVER a tool input arg:
    - find_client_by_name({ name }) → clients filtered .eq('company_id', companyId).ilike('name', `%name%`).limit(5)
    - get_latest_estimate_for_client({ name }) → resolve client by name within company, then latest project+estimate .eq('company_id', companyId) order created_at desc limit 1
    - get_project_status({ name }) → projects .eq('company_id', companyId).ilike('name',...) status + total
    - list_recent_estimates({}) → estimates .eq('company_id', companyId) order created_at desc limit 5
    - Every tool returns a concise human-readable string; "no results" message when empty.
    - Test 1 (SECURITY — the #1 requirement): every tool's underlying query includes .eq('company_id', companyId); assert the mock supabase received company_id === the closure value, and that NO tool schema (zod) contains a companyId/company_id field.
    - Test 2: find_client_by_name with no match returns a "not found" string (no throw)
    - Test 3: get_latest_estimate_for_client returns total + created date for a matched client
  </behavior>
  <action>
    Create lib/whatsapp/normalize.ts and lib/whatsapp/query-tools.ts per <behavior>.
    normalize.ts: import { transcribeAudioOR, analyzePhotoOR } from '@/lib/ai/openrouter-client' and { downloadWhatsAppMedia } from '@/lib/whatsapp/client'. Copy the mime/ext derivation verbatim from estimate-graph.ts processMessageNode (the m4a remap is load-bearing for Whisper). Never throw — return ok:false with a reason so the router can fall back gracefully.
    query-tools.ts: import { tool } from '@langchain/core/tools', z from 'zod', SupabaseClient type. Mirror the makeConfirmationTools(session, companyId, supabase) closure pattern in agent-tools.ts. companyId is captured from the function args ONLY. Each tool's zod schema must contain ONLY query inputs (name, etc.) — explicitly NO company_id field, so the LLM physically cannot supply a tenant. Use the passed supabase (service client) for all reads. Add a top-of-file comment documenting the cross-tenant-leak threat and the closure-scoping mitigation.
    Write both test files following the existing vitest pattern (explicit `import { describe, it, expect, vi } from 'vitest'`, vi.mock for @/lib/ai/openrouter-client and @/lib/whatsapp/client; a chainable supabase mock like handler.test.ts makeSupabaseMock).
  </action>
  <verify>
    <automated>cd c:/Users/User/Desktop/projetos_skale/xtimator/xtimator && npx vitest run tests/unit/whatsapp/normalize.test.ts tests/unit/whatsapp/query-tools.test.ts</automated>
  </verify>
  <done>Both test files pass. query-tools test proves every read filters by the closure company_id and no tool schema accepts a company_id input. normalize reuses transcribeAudioOR/analyzePhotoOR with correct mime/ext handling and never throws.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Intent-router LangGraph + Inngest job + event</name>
  <files>lib/whatsapp/intent-router.ts, lib/inngest/events.ts, lib/inngest/functions/whatsapp-process.ts, lib/inngest/functions/index.ts, tests/unit/whatsapp/intent-router.test.ts</files>
  <behavior>
    intent-router.ts — buildIntentRouterGraph() compiles a LangGraph StateGraph (consistent with estimate-graph.ts) OR a classifyAndRoute(state) entry. State: { companyId, ownerPhone, message: WhatsAppMessage, session: Session|null, normalizedText, intent }.
    Flow: normalize → loadHistory → classify (ChatOpenAI gpt-4o temp 0) → dispatch.
    classify returns one of: 'CONFIRM_OR_CANCEL' | 'EDIT' | 'CREATE' | 'QUERY'. The system prompt is given: current session state + estimate context (if draft_estimate_id) + last ~20 whatsapp_messages, and the normalized text. Rules in prompt:
    - CONFIRM_OR_CANCEL: owner wants to send/deliver or discard/cancel the pending draft (only valid when session is awaiting_confirm).
    - EDIT: owner wants to change a field of the pending draft (only when awaiting_confirm).
    - CREATE: a new job description (text OR a new audio/photo describing work) — DEFAULT for new media when intent is not clearly edit/confirm; also default when there is NO session.
    - QUERY: a question about existing data ("qual o ultimo estimate do cliente X", "status do projeto Y", "quanto ficou o orcamento do Joao").
    dispatch:
    - CONFIRM_OR_CANCEL → processConfirmationReply(normalizedText, session, companyId, ownerPhone, supabase)
    - EDIT → runConfirmationAgent(normalizedText, session, companyId, ownerPhone, supabase)
    - CREATE → if session: await actionCancel(session, supabase) to discard pending draft+session; then processInboundMessages([message], companyId, fromPhone, supabase) (re-uses entitlement + draft-project + estimate-graph dispatch)
    - QUERY → run a small ReAct agent (createReactAgent) with makeQueryTools(companyId, supabase); send the synthesized answer via sendWhatsAppMessage + logOutboundMessage
    - normalize ok:false (e.g. transcription failed) → send a graceful "couldn't read your audio, please describe in text" reply, do not crash.

    events.ts — add EVENT_WHATSAPP_INTENT = 'whatsapp/intent.requested' and WhatsAppIntentPayload { companyId; ownerPhone; fromPhone; message: unknown; session: { id; state; draft_project_id; draft_estimate_id } | null; batchKey }.

    whatsapp-process.ts — add whatsAppIntentRouterJob: inngest.createFunction({ id:'whatsapp-intent', idempotency:'event.data.batchKey', retries:1, triggers:[{event:EVENT_WHATSAPP_INTENT}] }) that refresh-typing then step.run('route-intent') invoking buildIntentRouterGraph(). whatsAppProcessJob stays unchanged.

    index.ts — register whatsAppIntentRouterJob in the exported functions array.

    - Test 1: classify routes a "send it" message in awaiting_confirm to CONFIRM_OR_CANCEL → processConfirmationReply called (LLM mocked to return the label).
    - Test 2: a new audio describing a job while awaiting_confirm → CREATE → actionCancel called then processInboundMessages called.
    - Test 3: a "qual o ultimo estimate do cliente Joao" with no session → QUERY → query agent runs with company-scoped tools.
    - Test 4: whatsAppIntentRouterJob opts.id === 'whatsapp-intent' and idempotency === 'event.data.batchKey'; index.ts registers it.
  </behavior>
  <action>
    Create lib/whatsapp/intent-router.ts per <behavior>. For the classifier, use ChatOpenAI (gpt-4o, temperature 0, apiKey: process.env.OPENAI_API_KEY) exactly like agent.ts. Keep the classifier output constrained: instruct it to reply with ONLY the label; parse case-insensitively and default to CREATE on any unrecognized output (safe default — runs the normal estimate path). Load history with the SAME query shape as agent.ts loadConversationHistory (last 20 whatsapp_messages by conversation_id for company+ownerPhone). For QUERY use createReactAgent({ llm, tools: makeQueryTools(companyId, supabase) }) from '@langchain/langgraph/prebuilt'; extract the final AIMessage text the same way agent.ts does and send it.
    For CREATE's processInboundMessages call, note its signature is (messages, companyId, fromPhone, supabase) where fromPhone is E.164 WITHOUT '+'; carry fromPhone in the event payload (ownerPhone has '+', fromPhone does not).
    Update events.ts, whatsapp-process.ts (add second function — do NOT modify whatsAppProcessJob), and index.ts (register the new function).
    Write tests/unit/whatsapp/intent-router.test.ts: vi.mock @langchain/openai (ChatOpenAI), @langchain/langgraph/prebuilt (createReactAgent), and the reused modules (@/lib/whatsapp/confirm, /agent, /handler, /confirm-actions, /query-tools, /normalize, /client, /conversations) so the routing logic is asserted in isolation. For the job-shape test, read whatsapp-process.ts source like whatsapp-process-job.test.ts does, or assert fn.opts.
  </action>
  <verify>
    <automated>cd c:/Users/User/Desktop/projetos_skale/xtimator/xtimator && npx vitest run tests/unit/whatsapp/intent-router.test.ts tests/unit/inngest/whatsapp-process-job.test.ts</automated>
  </verify>
  <done>intent-router routes all 4 intents to the correct reused flow; CREATE discards the pending session via actionCancel before processInboundMessages; QUERY uses company-scoped tools; whatsAppIntentRouterJob is registered with correct id + idempotency; existing whatsapp-process-job test still passes (whatsAppProcessJob untouched).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Rewire handler to dispatch session-state inbound to the intent router</name>
  <files>lib/whatsapp/handler.ts, tests/unit/whatsapp/handler-intent-routing.test.ts</files>
  <behavior>
    In processInboundWithDebounce (and the legacy processInboundMessage twin), REPLACE the awaiting_confirm branch that calls processSingleMessageWithSession with an Inngest dispatch of EVENT_WHATSAPP_INTENT carrying { companyId, ownerPhone, fromPhone, message, session, batchKey:`wa-intent-${message.id}` }. Read receipt + typing indicator stay BEFORE this (already present at top of the function).
    The awaiting_details branch: KEEP the existing debounce → dispatchToExistingProject behavior for the CREATE-continuation case UNCHANGED (multi-message debounce must be preserved per requirement #6). NOTE: awaiting_details inbound that is a question or a new unrelated job is out of scope for this branch — only awaiting_confirm is rerouted through the classifier. (Document this scoping in a code comment.)
    DELETE the now-dead processSingleMessageWithSession canned-reply function (or leave it only if still referenced by a test; prefer delete + update any test).
    - Test 1: awaiting_confirm + audio message → inngest.send called with name EVENT_WHATSAPP_INTENT and the message + session in data (NOT the old canned 'reply send or cancel' sendWhatsAppMessage).
    - Test 2: awaiting_confirm + text message → still dispatches EVENT_WHATSAPP_INTENT (classifier decides, not a regex).
    - Test 3: no session → still dispatches EVENT_WHATSAPP_PROCESS (create path unchanged).
    - Test 4: markMessageAsRead + sendTypingIndicator fire before any dispatch.
  </behavior>
  <action>
    Edit lib/whatsapp/handler.ts: in BOTH processInboundWithDebounce and processInboundMessage, change the `if (existingSession?.state === 'awaiting_confirm')` block to dispatch EVENT_WHATSAPP_INTENT via the dynamic import pattern already used for EVENT_WHATSAPP_PROCESS (`const { inngest } = await import('@/lib/inngest/client'); const { EVENT_WHATSAPP_INTENT } = await import('@/lib/inngest/events')`). Pass the single message (not a batch), the session snapshot, ownerPhone (with +), and fromPhone (without +). Remove processSingleMessageWithSession and its now-unused imports (processConfirmationReply, sendWhatsAppMessage if unused elsewhere in the file, logOutboundMessage if unused). Keep awaiting_details path exactly as-is. Add a comment block explaining the new routing (mirror the existing Phase 67 comment style).
    Update tests/unit/whatsapp/handler-intent-routing.test.ts (new) following handler.test.ts mocking style. If handler.test.ts asserts the old canned reply for awaiting_confirm, update those assertions to the new dispatch behavior so the suite stays green.
    Run tsc to confirm no dangling imports/types.
  </action>
  <verify>
    <automated>cd c:/Users/User/Desktop/projetos_skale/xtimator/xtimator && npx vitest run tests/unit/whatsapp/handler-intent-routing.test.ts tests/unit/whatsapp/handler.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>awaiting_confirm inbound (audio/photo/text) dispatches EVENT_WHATSAPP_INTENT instead of the canned reply; no-session path still dispatches EVENT_WHATSAPP_PROCESS; awaiting_details debounce preserved; read receipt + typing fire first; tsc clean; existing handler.test.ts updated and green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Meta webhook → app | Untrusted inbound message content (text, audio, photo) crosses here; already HMAC-verified in route.ts. |
| LLM output → DB reads | The classifier and QUERY agent produce tool calls / arguments from untrusted message content. The LLM is NOT trusted to choose the tenant. |
| Sender → company_id | company_id is resolved upstream in route.ts from owner_phone / companies.phone / conversation / clients — this is the ONLY trusted tenant source. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-lrf-01 | Information Disclosure | QUERY read tools (query-tools.ts) — CROSS-TENANT DATA LEAK (#1 risk) | mitigate | company_id is a CLOSURE parameter of makeQueryTools, captured from the trusted resolved value passed by the Inngest payload (originally from route.ts). It is NEVER a zod tool-input field, so the LLM physically cannot supply a tenant. EVERY query chains `.eq('company_id', companyId)`. A dedicated unit test asserts (a) every tool query received the closure company_id and (b) no tool schema contains a company_id/companyId field. Reads use the service client (whatsapp_* + cross-table) because RLS is deny-all for these contexts; the explicit company_id filter is the sole isolation control, hence the test. |
| T-lrf-02 | Tampering | Classifier output | mitigate | Classifier output is constrained to a fixed label set; unrecognized output defaults to CREATE (the normal, safe estimate path), never to a privileged action. |
| T-lrf-03 | Denial of Service | Normalization (audio download + Whisper) | accept | Runs inside Inngest (off the webhook ack path) with retries:1; per-phone hourly/daily rate limits already enforced in route.ts before dispatch. Existing control sufficient. |
| T-lrf-04 | Elevation of Privilege | EDIT/CONFIRM tools acting on a draft | mitigate | EDIT/CONFIRM only operate on the session's own draft_project_id/draft_estimate_id, which is scoped to the resolved company_id session row; reuses existing confirm-actions which already scope by these IDs. |
</threat_model>

<verification>
- `npx vitest run tests/unit/whatsapp/` — all whatsapp unit tests green (new + existing).
- `npx tsc --noEmit` — clean (no dangling imports after handler rewire).
- Grep proof of multi-tenant isolation: `query-tools.ts` shows `.eq('company_id', companyId)` on every read and zero `company_id` in any zod schema.
- Grep proof of provider reuse: `normalize.ts` imports `transcribeAudioOR` / `analyzePhotoOR` (no new transcription provider invented).
- Grep proof of placement: `handler.ts` dispatches `EVENT_WHATSAPP_INTENT` for awaiting_confirm (no `processSingleMessageWithSession` canned reply remains).
- Deploy note (Coolify): NO local Docker build. Verify via tsc + vitest only; push to main triggers GitHub Actions → GHCR → Coolify pull. INNGEST_DEV is NOT set in prod so EVENT_WHATSAPP_INTENT reaches Inngest Cloud.
</verification>

<success_criteria>
- An audio/photo arriving during awaiting_confirm is transcribed/analyzed and classified (no canned "reply send or cancel").
- Classifier routes every inbound into CONFIRM_OR_CANCEL / EDIT / CREATE / QUERY with session + history context.
- QUERY returns data ONLY for the sender's resolved company_id (multi-tenant isolation test passes).
- CREATE on new media discards the pending session then runs the existing estimate path.
- Heavy work runs in Inngest after the fast webhook ack; read receipt + typing fire first.
- All reused modules (runConfirmationAgent, makeConfirmationTools, processInboundMessages, processConfirmationReply, logInbound/Outbound) are imported, not reimplemented.
- Paragraph-splitting feature is NOT implemented (explicitly out of scope).
</success_criteria>

<output>
After completion, create `.planning/quick/260603-lrf-whatsapp-inbound-ai-intent-routing-trans/260603-lrf-SUMMARY.md`
</output>
