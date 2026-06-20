# Pitfalls Research — Shared LangGraph Estimate Engine (v4.3)

**Domain:** Extracting a channel-specific LangGraph StateGraph into a shared agentic engine consumed by web / MCP / WhatsApp, running under Inngest (Xtimator v4.3 "Unified Agentic Estimate Engine")
**Researched:** 2026-06-20
**Confidence:** HIGH for codebase-specific findings (read `estimate-graph.ts`, `whatsapp-process.ts`, `generate-estimate.ts` x2, `query-tools.ts`, `intent-router.ts`, `agent.ts`, `transcribe-audio.ts`, `analyze-photos.ts`, `mcp/tools/write.ts`, the silent-failure debug log, `package.json`). MEDIUM-HIGH for LangGraph/Inngest version semantics (verified against official LangChain + Inngest docs; `@langchain/langgraph@1.3.3`, `@langchain/core@1.1.48`, `inngest@4.4.0`).

> Orientation for the roadmapper: phase labels below are **logical milestone workstreams**, not yet-assigned roadmap IDs. v4.3 has six natural workstreams from `PROJECT.md`: **(A) Extract canonical graph**, **(B) Resolve LangGraph↔Inngest checkpoint granularity**, **(C) Migrate web**, **(D) Migrate MCP**, **(E) Migrate WhatsApp onto shared graph**, **(F) Unified observability + tests/UAT**. Order them **B → A → C/D/E → F**: the checkpoint-granularity decision (B) is the keystone every migration phase depends on, so decide it *before* extracting nodes.

---

## The single most important fact for this milestone

The WhatsApp graph today is compiled with **`graph.compile()` and no checkpointer** (`estimate-graph.ts:444`) and the **entire graph runs inside ONE Inngest `step.run('orchestrate-estimate', …)`** (`whatsapp-process.ts:80`). Per LangChain docs, a graph with no checkpointer has **no durability, no fault-tolerance, and no pending-writes recovery** — it is purely in-memory per `invoke`. Per Inngest docs, **the function body replays on every retry and only completed `step.run` results are memoized.** Therefore today's durability model is: *the whole graph is one atomic, all-or-nothing unit; an Inngest retry re-runs the entire graph from scratch, re-charging every AI call.*

This is **deliberate and correct for WhatsApp** (`retries: 1`, plus the in-graph `generationFailed`→`sendError` catch and the `onFailure` fallback reply guarantee the owner is never left silent). The danger in v4.3 is **(a)** copying WhatsApp's whole-graph-in-one-step model onto the web path, which already has fine-grained `step.run` checkpoints (`generate-estimate.ts`: `call-ai-provider` and `record-usage` are separate steps so a retry never re-charges Anthropic), and **(b)** "cleaning up" the WhatsApp never-throw discipline as nodes become shared. Every pitfall below radiates from this tension.

---

## Critical Pitfalls

### Pitfall 1: Double durability — wrapping the shared graph in one Inngest step re-runs the whole graph (and re-charges AI) on any retry

**What goes wrong:**
The shared graph contains nodes that cost real money (`generateEstimate` calls the AI provider; the new "assess quality → refine" loop adds *more* AI calls). If the graph keeps running inside a single `step.run` (today's WhatsApp model) and is given `retries >= 1`, then any failure *after* a successful AI call — a transient Supabase write error in `evaluateVaguenessNode`, a `sendWhatsAppMessage` 5xx, an Inngest step timeout — fails the whole step and **re-runs the entire graph, re-calling and re-paying for every AI call that already succeeded.** This is "double durability": Inngest gives step-level durability, LangGraph (only *with* a checkpointer) gives node-level durability, and naïvely nesting them means the outer retry defeats any inner progress.

The web path does NOT have this problem today (each AI call is its own memoized `step.run`). The acute regression risk is **importing the WhatsApp pattern onto web/MCP** during the migration and silently losing the per-AI-call checkpoint that `generate-estimate.ts` was specifically built to provide (its header: "Retries skip already-successful steps so Anthropic is never charged twice").

**Why it happens:**
"Make all channels consistent" is the milestone's stated goal, and the easiest way to share the graph is to wrap `graph.invoke()` in one `step.run` everywhere. The cost is invisible until a post-AI failure triggers a retry in production — exactly what a green test suite won't show.

**How to avoid:**
- **Decide the checkpoint-granularity contract FIRST (workstream B), before extracting nodes.** Pick ONE coherent model and apply it deliberately per channel:
  - **(i) Whole-graph-as-one-step + `retries: 0` (or 1) + a guaranteed terminal reply** (today's WhatsApp model). Acceptable for WhatsApp because `sendError`/`onFailure` make a re-charge-free *visible failure* preferable to silent retries. Keep this for WhatsApp.
  - **(ii) AI-calling nodes mapped to discrete Inngest steps** so each AI call is independently memoized (today's web model). Strongly preferred for web/MCP where `retries: 2` is desirable and re-charging is unacceptable. Two sub-options: split the graph into multiple `graph.invoke` segments each in its own `step.run`, OR pass an Inngest `step`-backed executor into the graph so AI-calling nodes wrap their work in `step.run`.
- **Never run a multi-AI-call graph in a single `step.run` with `retries > 0`.** If you keep one-step, set `retries: 0` and rely on a terminal-reply guarantee — do not silently inherit web's `retries: 2`.
- **Keep usage recording idempotent and in its own step:** web already records usage in a *separate* step keyed by `requestId` (DB partial-unique index). Preserve that so even if an AI call re-charges, quota isn't double-counted.

**Warning signs:**
- A single `step.run` wrapping `graph.invoke()` on the web or MCP path with `retries >= 1`.
- Langfuse traces (workstream F) showing the same `projectId` generating two full estimates seconds apart with no user action.
- `usage_events` rows colliding on the `(company_id, idempotency_key)` partial-unique index.
- AI-provider cost per estimate roughly doubling after the migration.

**Phase to address:** Workstream **B** defines the contract; **C/D/E** implement it per channel. Hard success criterion on B: *"document, per channel, exactly which retry count and which step boundary each AI call lives in."*

---

### Pitfall 2: Step-replay non-determinism — code that runs on every replay produces inconsistent state

**What goes wrong:**
Inngest replays the function body (everything outside `step.run`, and anything inside a step that hasn't completed) on every retry. LangGraph's own resume model (once a checkpointer is added) *also* replays from the last checkpoint. Any non-deterministic value computed **outside a memoized boundary** — `new Date()` for `expires_at`, `randomUUID()` for an id, `Math.random`, "now"-relative session TTLs — gets a *different value on each replay*, producing duplicate sessions, mismatched idempotency keys, or split-brain state.

Concrete traps already in the code:
- `askDetailsNode` and `sendConfirmationNode` compute `expiresAt = Date.now() + TTL` and `INSERT` a `whatsapp_sessions` row. If these ever land outside a memoized step (or the graph gains a checkpointer and resumes), a replay inserts a **second** session row with a different `expires_at`.
- The Inngest functions mint `attemptId = data.attemptId ?? randomUUID()` — safe *because* it's coalesced from the payload, but the pattern is fragile: any new node that mints an id fresh (not from payload/state) diverges on replay.

**Why it happens:**
Today the whole WhatsApp graph is inside one `step.run`, so it completes once or re-runs wholesale — non-determinism is masked because nothing partially resumes. The moment v4.3 introduces *either* finer Inngest steps (Pitfall 1 option ii) *or* a LangGraph checkpointer (for the ask-details wait), partial replay becomes real and these latent non-determinisms activate.

**How to avoid:**
- **Generate all ids and timestamps ONCE, at the entrypoint, and thread them through state/payload** — never inside a node that can replay. Make `data.attemptId ?? randomUUID()` coalescing the rule for every new id/timestamp in the shared graph.
- **Wrap every exactly-once side-effecting DB write in its own memoized boundary** (an Inngest `step.run`, or a checkpointed node) and make it idempotent (`upsert` on a natural key, or guard on "session already exists for this draft").
- If you add a checkpointer for the refine wait, treat node bodies as **possibly-replayed**: no fresh `Date.now()`, no fresh random, no "append to an array I read at node start."
- Review checklist item: "Does this node call `Date.now()` / `Math.random` / `randomUUID` / `crypto`? If yes, it must come from state, not be minted here."

**Warning signs:**
- Duplicate `whatsapp_sessions` rows for the same `draft_project_id`.
- `expires_at` values differing by a few seconds for what should be one session.
- Idempotency keys (`requestId`, `batchKey`) not matching between a first attempt and its retry.
- Intermittent test flakiness only under simulated retry.

**Phase to address:** Workstream **A** (establish "ids/time from state only" as nodes are extracted), re-verified in **B** when step/checkpoint boundaries are finalized.

---

### Pitfall 3: Checkpoint conflict — adding a LangGraph checkpointer for the refine loop while Inngest is the durability layer (and in-memory state can't survive a retry)

**What goes wrong:**
The new "ask for details / refine" intelligence is naturally a *pause-and-resume* (human-in-the-loop) flow — ask the owner a question, wait, resume on their reply. LangGraph implements that via a checkpointer + `thread_id` + `interrupt`. But Xtimator's durability and "wait for the next message" mechanism is already **Inngest events + `whatsapp_sessions` rows**, not a LangGraph checkpointer. Bolting one on creates two competing sources of truth for "where are we," and:
- An **`InMemorySaver`/`MemorySaver` checkpointer is useless across Inngest retries or serverless invocations** — the ZenML durable-runtime writeup states the failure plainly: "Pod A starts a LangGraph graph with InMemorySaver… Pod A disappears… Pod B does not have Pod A's memory. LangGraph cannot find the old in-memory thread state." Coolify/serverless restarts and Inngest retries are exactly this "Pod B" case.
- A **persistent (Postgres) checkpointer** introduces a *second* durable store next to `whatsapp_sessions` and `pipeline_events`, with its own `thread_id` lifecycle, that drifts from the session state machine the WhatsApp flow already relies on (`awaiting_details` / `awaiting_confirm`).

**Why it happens:**
LangGraph tutorials reach for `interrupt` + checkpointer as the canonical "ask the human." It's right in a standalone LangGraph deployment, but it duplicates infrastructure Xtimator already has.

**How to avoid:**
- **Keep "wait for the owner's next message" in the existing session/event mechanism, not in a LangGraph interrupt.** Model the refine loop as: graph run #1 ends at `askDetails` (writes `whatsapp_sessions.state='awaiting_details'`, sends the question, returns) → owner replies → a *new* Inngest event starts graph run #2 with the prior context. This is how the WhatsApp flow already works and keeps Inngest the sole durability layer.
- If a checkpointer is genuinely needed for *within-a-single-invocation* multi-node agentic work (e.g. the refine loop iterating a couple times before replying), scope it to a **single `graph.invoke` inside one `step.run`** and use `MemorySaver` **only for that one invocation** — never expect it to survive across invocations/retries. Document the limitation in the node header.
- **Do not introduce a persistent LangGraph checkpointer store** unless workstream B explicitly decides Inngest is being *replaced* (it is not, per `PROJECT.md`). One durability layer.

**Warning signs:**
- A `PostgresSaver`/`SqliteSaver` or a `checkpoints` table appearing in the schema.
- A `thread_id` persisted somewhere other than (or in addition to) `whatsapp_sessions`.
- "It worked locally but the refine loop forgets context in prod" (the InMemorySaver-across-restarts symptom).
- Two places that both claim to own conversation state.

**Phase to address:** Workstream **B** — the central decision `PROJECT.md` already flags ("graph↔Inngest checkpoint granularity"). Deliverable must state explicitly: *checkpointer or not; if yes, in-memory-per-invocation only; session-state machine remains the cross-message source of truth.*

---

### Pitfall 4: Regressing the WhatsApp silent-failure guarantee when nodes become shared

**What goes wrong:**
This codebase has a **recurring, documented bug class** (`.planning/debug/whatsapp-inbound-no-reply-recurrence.md`): if anything in the pipeline throws, the owner sees read+typing and then *nothing* — no estimate, no error. The fix is a **defense-in-depth chain** the refactor can easily break:
1. **Every node never re-throws** — `processMessageNode` catches and returns `{ ok:false }` (comment `T-mq2-01`); `generateEstimateNode` catches and sets `generationFailed` instead of throwing (its comment: "NEVER re-throw… the recurring silent-failure bug").
2. **Conditional edges route failures to `sendError`** (`checkInputsEdge`, `checkGeneratedEdge`) so the owner always gets *some* reply.
3. **`whatsapp-process.ts` has an `onFailure`** that sends `FALLBACK_ERROR_REPLY` after retries exhaust — even if the graph couldn't be entered at all.

When `generateEstimate`/`evaluateVagueness`/etc. become **shared nodes called from web and MCP too**, the temptation is to "clean up" by letting them throw (so web can surface a proper error) — which silently re-arms the WhatsApp bug. Equally dangerous: a shared `sendError`/terminal node that calls `sendWhatsAppMessage` will **throw or no-op when invoked from the web path** (no `ownerPhone`), so the "guaranteed reply" guarantee becomes channel-specific and WhatsApp may lose its terminal reply if the shared node is refactored to be channel-agnostic.

**Why it happens:**
The never-throw discipline looks like "swallowed errors / bad practice" to someone who didn't live the recurrence. A reviewer optimizing the shared core for web (where throwing → a clean failed-job notification is *correct*) will naturally remove the catches.

**How to avoid:**
- **Treat "never leave the WhatsApp owner without a reply" as a frozen invariant with a dedicated regression test that stays green** — coverage already exists (`tests/unit/inngest/whatsapp-process-job.test.ts` asserts "reply-on-failure-guarantee"). Extend it to assert the *shared* nodes still route to a terminal reply when invoked through the WhatsApp adapter.
- **Separate "domain failure signaling" from "channel reply."** Shared domain nodes signal failure via **state** (generalize the existing `generationFailed` flag to a `failure?: {reason}` channel), NOT by throwing and NOT by calling `sendWhatsAppMessage` directly. Then each adapter maps `failure`:
  - WhatsApp → `sendError` (conversational reply) + the `onFailure` net.
  - Web → throw/return so the Inngest `generate-estimate` `onFailure` fires its existing `ai_job.failed` notification.
  - MCP → a failed job status the `check_job_status` poll surfaces.
- **Keep the `onFailure` fallback on every channel's Inngest function** — last line of defense, cheap. Web/MCP already have `onFailure` (`generate-estimate.ts`); WhatsApp has `sendFallbackReply`. Do not consolidate these away.
- **The reply-sending nodes (`askDetails`, `sendConfirmation`, `sendError`) are WhatsApp EDGE nodes, not domain nodes** — keep them out of the shared core (see Pitfall 5). `PROJECT.md` already says WhatsApp plugs "only edge nodes (inbound media download + conversational reply)" — hold that line.

**Warning signs:**
- A shared node's `catch` block deleted or replaced with `throw`.
- `sendWhatsAppMessage` / `logOutboundMessage` imported into the shared core module.
- The `whatsapp-process-job` reply-on-failure test modified or skipped.
- Review comments like "why is this swallowing the error?" on a shared node — answer: because WhatsApp.
- In staging, a forced AI failure on a WhatsApp message producing no reply.

**Phase to address:** Workstream **A** (extract canonical graph with failure-as-state, reply-as-edge-node) and **E** (migrate WhatsApp onto the shared graph — the regression gate lives here, hard success criterion).

---

### Pitfall 5: Channel divergence leaking — a shared node assumes WhatsApp-only context (ownerPhone, conversational reply) when called from web/MCP; web's decoupled ingestion vs graph ingestion mismatch

**What goes wrong:**
The current graph's state and several nodes are saturated with WhatsApp assumptions meaningless for web/MCP:
- **State:** `ownerPhone`, `messages: WhatsAppMessage[]`, `currentMessage: WhatsAppMessage`, `mediaResults` (WhatsApp media-download outcomes), `estimateLanguage` derived for a conversational reply.
- **Nodes:** `processMessageNode` does **WhatsApp media download + storage + transcription inline** (`downloadWhatsAppMedia`, bucket layout `${companyId}/whatsapp/…`, `whatsapp_messages` updates). `askDetails`/`sendConfirmation`/`sendError` write `whatsapp_sessions` and call `sendWhatsAppMessage`.
- **Ingestion mismatch (called out in `PROJECT.md`):** the **web path ingests BEFORE the graph** — transcription and photo analysis already ran as separate Inngest jobs (`transcribe-audio.ts`, `analyze-photos.ts`) and the results sit in `recordings.transcript` / `photos.ai_description`. WhatsApp ingests **inside** the graph (`processMessageNode`). A shared `ingest` node that unconditionally downloads+transcribes will **re-do work for web (double transcription cost) or fail (no WhatsApp media id)**; a shared node that *skips* ingestion leaves WhatsApp with nothing to estimate from.

If a domain node reaches for `state.ownerPhone` or `state.currentMessage` when invoked from web/MCP, it gets `undefined` and either throws (re-arming Pitfall 4) or silently misbehaves (sends to `undefined` phone, inserts a malformed session).

**Why it happens:**
The graph was *born* WhatsApp-only; "extract it" reads as "make it importable," not "strip the channel assumptions." The shared-vs-edge boundary is subtle precisely because `generateEstimateForProject` is *already* channel-agnostic (good) while the orchestration around it is not (the actual work of this milestone).

**How to avoid:**
- **Define the canonical graph's state as channel-neutral.** Domain channels only: `companyId`, `projectId`, `language?`, `qualityVerdict?`, `refinementInputs?`, `estimateId?`, `failure?`. **No `ownerPhone`, no `WhatsAppMessage`, no `whatsapp_*`.** Channel-specific data lives in a thin adapter, not shared state.
- **Make ingestion a pluggable edge step, not a shared domain node.** Three adapters feed the *same* precondition the core already enforces (`generateEstimateForProject` requires "at least one transcript, photo, or prompt"):
  - **WhatsApp adapter:** download media → transcribe/analyze → write `recordings`/`photos` (today's `processMessageNode` logic) *before* invoking the shared core.
  - **Web adapter:** ingestion already happened upstream → invoke the shared core directly. **Preserve the decoupled ingestion** — `PROJECT.md` flags this; do not collapse web's `transcribe-audio`/`analyze-photos` jobs into the graph.
  - **MCP adapter:** prompt-only → pass `prompts:[prompt]` (already works via `generateEstimateForProject` options).
- **The shared core consumes ALREADY-INGESTED inputs** (it already reads `recordings`/`photos` from the DB). Resist moving download/transcription into the core just because WhatsApp does it there.
- **Reply is an edge concern.** Web returns an estimate id (poll/redirect); MCP returns a job result; WhatsApp sends a conversational message. The core must not assume a conversational reply.
- Guard test: invoke the shared graph with web-shaped input (no `ownerPhone`, no `currentMessage`) and assert it produces an estimate without touching any `whatsapp_*` table or `sendWhatsAppMessage`.

**Warning signs:**
- `ownerPhone`, `whatsapp_messages`, `whatsapp_sessions`, `sendWhatsAppMessage`, `downloadWhatsAppMedia`, or `WhatsAppMessage` referenced anywhere in the shared core module.
- Web transcription/vision cost doubling (shared ingest re-processing already-ingested rows).
- A web/MCP estimate run inserting a `whatsapp_sessions` row.
- `undefined` phone numbers in `whatsapp_messages` logs originating from web runs.
- Shared-core tests importing WhatsApp fixtures.

**Phase to address:** Workstream **A** (channel-neutral state + shared-vs-edge boundary), **C** (web migration keeps decoupled ingestion + verifies no `whatsapp_*` writes), **D** (MCP prompt-only path), **E** (WhatsApp media ingestion moves to an adapter, not the core).

---

### Pitfall 6: Multi-tenant isolation regressing when nodes are shared — companyId leaking into LLM-controllable surface

**What goes wrong:**
The hard tenancy invariant (`query-tools.ts` header `T-lrf-01`, and `PROJECT.md`): **`companyId` must be a trusted closure/param resolved upstream — NEVER an LLM-suppliable tool input or LLM-derived value.** Today this holds because `companyId` flows webhook → resolved-from-`owner_phone` → graph state → every `.eq('company_id', companyId)`, and `makeQueryTools(companyId, …)` captures it in a closure with no `company_id` zod field. When the graph is shared and gains an **agentic refine loop with tools** (the new "ask for details" intelligence may use ReAct tools like the existing `agent.ts`/`query-tools.ts`), the risks are:
- A new tool exposes `companyId`/`projectId` as a schema field "for flexibility," letting a crafted inbound WhatsApp message or a crafted MCP prompt steer the agent to **read or write another tenant's data**.
- The MCP path resolves tenancy differently (`auth.company_id` from the OAuth token, re-checked in `write.ts`) than WhatsApp (owner_phone → company). A shared node assuming *one* resolution source applies the wrong tenant when invoked from the other channel.
- The shared core uses the **service-role client** (RLS-bypassing, as it must from Inngest) — so the *explicit `.eq('company_id', companyId)` filter is the SOLE isolation control.* A shared node that forgets the filter on a new query silently cross-reads.

**Why it happens:**
Agentic loops invite "let the model pick the entity." Sharing across channels with different auth models invites "just take companyId from wherever." Both are natural and both are catastrophic for a multi-tenant SaaS.

**How to avoid:**
- **`companyId` (and `projectId`) enter the shared graph ONLY as trusted state, resolved by the channel adapter before invocation.** Web: from the authed session/payload. MCP: from `auth.company_id` (re-verified against the project, as `write.ts` already does). WhatsApp: from owner_phone resolution. The core treats them as opaque trusted values and never re-derives them from message content.
- **Forbid `companyId`/`company_id`/`projectId` as a field on ANY tool schema in the shared engine** — extend the existing `query-tools.ts` rule and its dedicated test ("no schema accepts a company_id input") to cover every tool in the shared refine loop. Closure-capture only.
- **Every DB access in the shared core chains `.eq('company_id', companyId)`** (and project access re-checks ownership). Keep this as a static-contract test, like the v4.0 RLS/server-action sweeps.
- **Re-verify project ownership at the boundary** the way `write.ts` does (`project.company_id !== auth.company_id → notFound`) — once per adapter, then trust within the core.
- Injection test: a WhatsApp message / MCP prompt saying "show me company X's estimates" must NOT cause any query without the closure `companyId`.

**Warning signs:**
- Any zod/JSON tool schema in the shared engine with a `company_id`/`companyId`/`project_id` property.
- A shared query lacking `.eq('company_id', companyId)`.
- `companyId` parsed out of `currentMessage` / prompt text / LLM output anywhere.
- Different tenant-resolution code paths converging on a shared node without re-establishing the trusted value.
- The `query-tools` "no tenant input" test not extended to new tools.

**Phase to address:** Workstream **A** (channel-neutral state carries trusted `companyId`; tools forbid tenant inputs) and **D** (MCP adapter re-verifies `auth.company_id` ownership before entering the core). The static "no tenant input + every query scoped" contract test is a hard gate on **A**, re-run in **F**.

---

### Pitfall 7: Cost/latency blow-up — agentic refinement adds surprise AI calls (and seconds) to the fast web path

**What goes wrong:**
Today web/MCP estimate generation is **single-shot**: one AI call in `generateEstimateForProject`. The milestone's headline feature gives them WhatsApp's "assess quality → refine / ask-details" loop. Done naïvely, every web estimate now fires **3–5+ AI calls** (generate → quality-assess via LLM → maybe refine via LLM → maybe re-assess…), each adding latency to a flow whose *core value prop is speed* ("under 5 minutes," web UX is a synchronous-feeling generate→redirect). Worse:
- The **quality/vagueness check today is cheap and deterministic** — `isVagueEstimate()` inspects totals/item counts (`evaluateVaguenessNode` reads `estimate_sections/estimate_items`); it is NOT an LLM call. Replacing it with an LLM "quality assessor" for "parity" silently adds a model call to every estimate on every channel.
- An **unbounded refine loop** ("keep refining until good") spins multiple model calls and multiplies cost per estimate; on the **MCP path the LLM is already polling `check_job_status`**, so a long loop burns poll cycles and tokens.
- WhatsApp tolerates a few extra seconds (async chat); the **web "generate and redirect" path does not** — added latency reads as a hang.

**Why it happens:**
"Intelligence parity" is read as "run the full agentic loop everywhere, always." The deterministic vagueness check gets "upgraded" to an LLM without anyone pricing it. Refine loops default to "loop until satisfied" with no cap.

**How to avoid:**
- **Keep quality assessment deterministic/cheap by default.** Reuse `isVagueEstimate()` (no AI) as the gate; only invoke an *LLM* assessor or a refine pass when the cheap gate says "vague." Preserves the common-case single-call cost.
- **Make the refine loop opt-in and bounded per channel.** Web fast path: at **most one** refine pass (or zero — surface "this estimate looks thin, add detail?" non-blockingly) so the happy path stays single-call. WhatsApp/MCP (async, conversational): allow the ask-details round-trip it has today. Put a **hard iteration cap** (≤1–2) on any in-invocation loop — never "loop until good."
- **Budget AI calls per channel explicitly in workstream B and assert it:** a web estimate of a *non-vague* project must make exactly the same number of AI calls as today (1). Add a test/metric.
- **Account for quota/spend:** more AI calls = more `recordUsage`. Decide whether refine passes count against quota and keep usage recording idempotent per `requestId` so a retry doesn't multiply the count.
- **Measure with Langfuse (workstream F):** per-channel AI-calls-per-estimate and p95 latency are tracked outputs, with web's happy-path call count pinned.

**Warning signs:**
- `evaluateVagueness` (or its successor) calling an LLM instead of `isVagueEstimate`.
- A `while`/recursive refine loop with no max-iteration guard.
- Web estimate p95 latency rising materially post-migration.
- AI cost-per-estimate climbing for *all* estimates, not just thin ones.
- MCP `check_job_status` runs taking much longer / more polls than ~30–60s.

**Phase to address:** Workstream **B** (per-channel AI-call budget + loop-cap policy) and **C** (web migration pins happy-path to single AI call; refine is opt-in/bounded). Verified in **F** (Langfuse per-channel call-count + latency).

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Wrap shared `graph.invoke()` in one `step.run` everywhere, copying WhatsApp | Fastest way to "share" the graph; one code path | Web/MCP lose per-AI-call checkpointing → retries re-charge AI (Pitfall 1); web's existing fine-grained steps regress | Only for WhatsApp with `retries:0/1` + terminal-reply guarantee — never for web/MCP with `retries>0` |
| Let shared domain nodes `throw` on failure ("web wants clean errors") | Simpler node code; natural for web | Re-arms the WhatsApp silent-failure recurrence (Pitfall 4) | Never — signal failure via state; map to channel behavior in the adapter |
| Keep `ownerPhone`/`WhatsAppMessage` in shared state "for now" | Less refactoring up front | Channel assumptions leak into web/MCP; `undefined` phones, stray `whatsapp_*` writes (Pitfall 5) | Never in the shared core — only in the WhatsApp adapter |
| Replace deterministic `isVagueEstimate()` with an LLM quality assessor | Sounds smarter; uniform | +1 AI call on every estimate on every channel (Pitfall 7) | Only behind the cheap deterministic gate, or as an opt-in refine trigger |
| Add a LangGraph `MemorySaver` for the ask-details wait | Canonical LangGraph HITL pattern | Useless across Inngest retries/serverless restarts; second source of truth vs `whatsapp_sessions` (Pitfall 3) | Only in-memory, single-invocation; cross-message wait stays in session/event mechanism |
| Mint `randomUUID()`/`Date.now()` inside a node | Convenient, local | Diverges on replay → duplicate sessions / idempotency mismatch (Pitfall 2) | Never — coalesce from payload/state at the entrypoint |
| Add `company_id` as a tool input "for flexibility" in the refine agent | Easy multi-entity tools | Cross-tenant read/write under prompt injection (Pitfall 6) | Never — closure-capture only |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| LangGraph (`@langchain/langgraph@1.3.x`) | Assuming `graph.compile()` (no checkpointer) gives durability/resume | No checkpointer = in-memory, no fault-tolerance/HITL/pending-writes. Durability comes from Inngest today. Decide deliberately (workstream B). |
| LangGraph parallel `Send` fan-out | Two branches writing the same channel without a reducer → lost update / `InvalidUpdateError` | Channels written by parallel branches MUST have a reducer (code already does this for `mediaResults`). Any NEW parallel-written channel needs the same — and the reducer must be **commutative/order-independent** (branches complete in nondeterministic order; never assume input order). |
| LangGraph nodes vs edges | Returning `Send[]` from a node (throws `InvalidUpdateError`) | `Send[]` belongs on a conditional EDGE (`supervisorEdge`); nodes return a state object — the code documents this; preserve it when extracting. |
| Inngest (`inngest@4.4.0`) | Putting AI calls / DB writes outside `step.run`, or assuming function-body code runs once | Function body replays on retry; only completed `step.run` results memoize. Wrap every side effect/AI call in a step; thread ids from payload. |
| Inngest `idempotency` key | Reusing the WhatsApp `batchKey` model for web/MCP without thought | Web uses `event.data.requestId`; MCP sends `id: estimate-mcp-…-${requestId}`; WhatsApp uses `batchKey`. Keep per-channel idempotency keys distinct and stable across retries. |
| Inngest `onFailure` | Consolidating per-function `onFailure` handlers into the shared core | `onFailure` is the last-line reply/notification net and is channel-specific (WhatsApp reply vs `ai_job.failed` notify vs MCP failed-status). Keep one per function. |
| Supabase service-role client in shared core | Forgetting `.eq('company_id', companyId)` because "RLS will catch it" | Service role BYPASSES RLS — the explicit filter is the only isolation control (Pitfall 6). Every query scoped, statically tested. |
| MCP `create_estimate` | Long agentic refine loop while the LLM polls `check_job_status` | Bound the loop; keep generation ~30–60s as the tool description promises; surface a refine *prompt* rather than blocking on a multi-pass loop. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Refine loop adds AI calls to every estimate | AI cost-per-estimate up for ALL estimates; web p95 latency up | Deterministic `isVagueEstimate` gate first; LLM/refine only when thin; hard iteration cap (Pitfall 7) | Immediately at any volume — it's per-estimate, not per-scale |
| Whole-graph-in-one-step retry re-charges AI | Provider cost spikes on transient errors; duplicate estimates | Per-AI-call `step.run` for web/MCP; `retries:0/1` for one-step WhatsApp (Pitfall 1) | On the first post-AI transient failure in prod |
| Re-ingestion in a shared `ingest` node | Web transcription/vision cost doubles | Ingestion is an edge step; web keeps decoupled `transcribe-audio`/`analyze-photos`; core consumes already-ingested DB rows (Pitfall 5) | As soon as web routes through a shared ingest node |
| Synchronous-feeling web flow waiting on agentic loop | "Generate" feels like a hang | Keep web happy path single-call; refine async/opt-in | At first real user with a thin project |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| `company_id`/`project_id` as a tool-input schema field in the shared refine agent | Cross-tenant read/write via prompt injection (untrusted WhatsApp/MCP input) | Closure-capture trusted `companyId`; forbid tenant inputs on every tool; extend `query-tools` "no tenant input" test (Pitfall 6) |
| Shared-core query missing `.eq('company_id', companyId)` under service role | Silent cross-tenant data leak (RLS is bypassed) | Static-contract test: every shared-core query is company-scoped |
| Trusting message/prompt content to resolve tenant | Attacker picks the tenant | `companyId` resolved by the channel adapter only (session/OAuth/owner_phone), never from content/LLM output |
| MCP path not re-verifying project ownership before the core | A valid token reaching another company's project | Re-check `project.company_id === auth.company_id` in the MCP adapter (as `write.ts` already does) before invoking the core |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| WhatsApp owner left with read+typing and no reply after a refactor | The exact recurring bug; total silence on failure | Frozen invariant + regression test; failure-as-state → `sendError` + `onFailure` (Pitfall 4) |
| Web estimate "hangs" while a multi-pass refine runs synchronously | Perceived slowness; abandons the flow | Single-call happy path; refine bounded/opt-in/async (Pitfall 7) |
| Web/MCP suddenly asking conversational "can you add more detail?" with no place to answer | Confusing — web has no chat thread | Map "ask details" to channel-appropriate UX: WhatsApp = message; web = inline "estimate looks thin" hint, not a blocking question |
| Refine loop silently regenerating the estimate the user is looking at | Estimate values shift unexpectedly | Make refinement explicit/visible; preserve version management (`generate-estimate.ts` already versions) |

## "Looks Done But Isn't" Checklist

- [ ] **Shared graph extracted:** Often still imports `sendWhatsAppMessage`/`whatsapp_*`/`ownerPhone` — verify the shared core module has ZERO WhatsApp imports (grep the module).
- [ ] **Web migrated:** Often re-runs ingestion — verify a web estimate makes exactly 1 AI call for a non-vague project and writes NO `whatsapp_*` rows.
- [ ] **WhatsApp silent-failure guarantee:** Often regressed by removing a node `catch` — verify the reply-on-failure test is green AND a forced AI failure in staging still replies.
- [ ] **Checkpoint granularity:** Often "one step everywhere" by default — verify each AI call's step boundary + retry count is documented per channel (workstream B artifact).
- [ ] **Multi-tenant:** Often a new tool exposes `company_id` — verify the "no tenant input on any tool" test covers the new refine-loop tools, and every shared query is scoped.
- [ ] **Replay determinism:** Often a node mints `Date.now()`/UUID locally — verify all ids/timestamps come from payload/state.
- [ ] **Cost/latency budget:** Often unmeasured — verify Langfuse reports per-channel AI-calls-per-estimate and the deterministic vagueness gate is still in place.
- [ ] **onFailure nets:** Often consolidated away — verify each Inngest function still has its channel-specific `onFailure`.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Double-durability re-charging AI (Pitfall 1) | MEDIUM | Split the offending `graph.invoke` into per-AI-call `step.run`s (or drop `retries` to 0 on the one-step path); add the usage-idempotency assertion; add a Langfuse alert on duplicate generations |
| WhatsApp silent-failure regressed (Pitfall 4) | HIGH (user-facing, recurring, hard to detect) | Restore failure-as-state + `sendError` routing + `onFailure`; re-enable/strengthen the reply-on-failure test; add a staging forced-failure smoke before every WhatsApp-touching deploy |
| Channel assumption leaked (Pitfall 5) | MEDIUM | Move WhatsApp logic into the adapter; strip channel fields from shared state; add the "web run touches no `whatsapp_*`" test |
| Cross-tenant leak via tool input (Pitfall 6) | HIGH (security) | Remove tenant fields from tool schemas immediately; rotate to closure-capture; audit `whatsapp_messages`/query logs for cross-tenant access; extend the static contract test |
| Cost/latency blow-up (Pitfall 7) | LOW-MEDIUM | Reinstate deterministic gate; cap refine iterations; make refine opt-in on web; pin happy-path call count in tests |
| Checkpointer conflict (Pitfall 3) | MEDIUM | Remove the persistent checkpointer; move cross-message wait back to session/event mechanism; keep any saver in-memory/single-invocation |
| Replay non-determinism (Pitfall 2) | MEDIUM | Coalesce ids/timestamps from payload/state; make writes idempotent (upsert/guard); de-dup any duplicate session rows created in the window |

## Pitfall-to-Phase Mapping

> Workstreams (logical, from `PROJECT.md`): **A**=Extract canonical graph · **B**=LangGraph↔Inngest checkpoint granularity (decide FIRST) · **C**=Migrate web · **D**=Migrate MCP · **E**=Migrate WhatsApp onto shared graph · **F**=Unified observability + tests/UAT.

| Pitfall | Prevention Workstream | Verification |
|---------|------------------------|--------------|
| 1. Double durability / retry re-charges AI | **B** (contract) → **C/D/E** (impl) | No single `step.run` wraps a multi-AI-call graph with `retries>0`; Langfuse shows 1 generation per user action; usage idempotency holds |
| 2. Step-replay non-determinism | **A** (convention) | Forced-retry test produces no duplicate sessions / consistent idempotency keys; no `Date.now()`/UUID minted in nodes |
| 3. Checkpointer conflict | **B** (decision) | No persistent checkpointer/`thread_id` store added; cross-message wait stays in `whatsapp_sessions`/events |
| 4. WhatsApp silent-failure regression | **A** (failure-as-state) + **E** (gate) | `whatsapp-process-job` reply-on-failure test green; staging forced-failure still replies; no `sendWhatsAppMessage` in shared core |
| 5. Channel divergence leaking | **A** (neutral state) + **C** (keep decoupled ingest) + **E** (WA media adapter) | Shared core has zero `whatsapp_*` imports; web run makes 1 AI call, writes no `whatsapp_*`; ingestion is an edge step |
| 6. Multi-tenant isolation | **A** (closure tenancy) + **D** (MCP ownership re-check) | "No tenant input on any tool" + "every query scoped" static tests cover new tools; injection test passes |
| 7. Cost/latency from refine loop | **B** (budget) + **C** (pin web) | Deterministic vagueness gate intact; refine iteration-capped; web non-vague estimate = 1 AI call; Langfuse per-channel call-count tracked |

## Sources

- **Codebase (authoritative, HIGH):** `lib/whatsapp/estimate-graph.ts` (no-checkpointer `compile()`, `Send` fan-out, `mediaResults` reducer, never-throw nodes, `generationFailed`→`sendError`), `lib/inngest/functions/whatsapp-process.ts` (single `step.run`, `retries:1`, `onFailure` fallback), `lib/inngest/functions/generate-estimate.ts` (per-AI-call `step.run`, `retries:2`, idempotent usage, `onFailure` notify), `lib/inngest/functions/{transcribe-audio,analyze-photos}.ts` (web's decoupled ingestion), `lib/services/generate-estimate.ts` (already channel-agnostic core, `channel?:'whatsapp'`, `prompts?`), `lib/mcp/tools/write.ts` (MCP reuses `EVENT_ESTIMATE_GENERATE`, re-checks `auth.company_id`), `lib/whatsapp/query-tools.ts` (T-lrf-01 closure-tenancy invariant), `lib/whatsapp/{intent-router,agent}.ts` (existing ReAct agents + tool patterns), `package.json` (`@langchain/langgraph@1.3.3`, `@langchain/core@1.1.48`, `inngest@4.4.0`).
- **`.planning/debug/whatsapp-inbound-no-reply-recurrence.md`** (HIGH) — the documented silent-failure bug class and its defense-in-depth fix.
- **`.planning/PROJECT.md`** (HIGH) — v4.3 milestone scope, the flagged "graph↔Inngest checkpoint granularity" + "preserve web's decoupled ingestion" decisions.
- **LangChain LangGraph docs — Checkpointers** (MEDIUM-HIGH): checkpointers required for fault-tolerance/HITL/pending-writes; `thread_id` mandatory with a checkpointer; reducers accumulate rather than overwrite. https://docs.langchain.com/oss/javascript/langgraph/checkpointers
- **LangChain LangGraph docs — Durable execution** (MEDIUM): persistence modes; intermediate state not saved without persistence. https://docs.langchain.com/oss/javascript/langgraph/durable-execution
- **ZenML — "Your LangGraph agent works. Now make the workflow durable"** (MEDIUM): "one completed graph.invoke(...) = one checkpoint"; InMemorySaver state cannot survive across pods/restarts (the "Pod B" problem). https://www.zenml.io/blog/langgraph-durable-runtime
- **Inngest docs — Steps** (MEDIUM-HIGH): function body replays on retry, only completed `step.run` results memoize; wrap non-deterministic side effects/API calls in `step.run`. https://www.inngest.com/docs/learn/inngest-steps

---
*Pitfalls research for: shared LangGraph estimate engine across web/MCP/WhatsApp on Next.js + Inngest + Supabase (Xtimator v4.3)*
*Researched: 2026-06-20*
