# Feature Research

**Domain:** Agentic, multi-step estimate/document generation with a quality-assessment + refinement loop, surfaced across three channel modalities (async web, conversational WhatsApp, programmatic MCP)
**Milestone:** v4.3 Unified Agentic Estimate Engine
**Researched:** 2026-06-20
**Confidence:** HIGH (the canonical patterns are well-documented and the existing codebase already implements a one-pass version; per-channel divergence verified against LangGraph + MCP spec sources)

> NOTE: this file previously held v4.0 Multi-Tenancy feature research (now archived in the v4.0 roadmap). It has been replaced with v4.3 research per the active milestone.

---

## TL;DR for the roadmapper

Xtimator **already has** the hard part conceptually: WhatsApp runs a one-pass quality gate (`evaluateVagueness` node → `isVagueEstimate()` → `askDetails`) that detects a $0/empty estimate and asks the owner for more detail before sending. The named industry pattern for "generate → evaluate → decide good-enough vs needs-input → iterate/ask" is the **evaluator-optimizer (reflection) loop with a hard iteration cap**. v4.3's job is NOT to invent this — it is to (a) extract the gate into the shared canonical graph, (b) give web + MCP the SAME gate, and (c) make the gate's "needs more info" outcome surface correctly in each modality. The single most important insight: **the same quality verdict must produce three different control-flow shapes** because only WhatsApp has a human waiting inline. Web must *persist a "needs_details" state and prompt later in the UI*; MCP must *return a structured `needs_details` status the calling LLM acts on*; WhatsApp keeps its inline ask-and-wait.

---

## Feature Landscape

### Table Stakes (Users / callers expect these)

Features that, if missing, make the "unified agentic engine" feel broken or worse than the WhatsApp-only status quo.

| Feature | Why Expected | Complexity | Notes / Dependency on existing code |
|---------|--------------|------------|-------------------------------------|
| **Quality gate (self-assessment) on EVERY channel** | Web/MCP today ship a $0/empty estimate silently single-shot; WhatsApp doesn't. Parity is the milestone's stated goal. | LOW | The gate already exists: `isVagueEstimate()` (total ≤ 0 OR zero line items) in `lib/whatsapp/ask-details.ts`. Extracting `evaluateVagueness` into the shared graph is the table-stakes move. Reuse the predicate verbatim — do NOT rewrite. |
| **Deterministic, cheap pass/fail check first** | A free structural check (total>0, ≥1 item, sane math) catches the common failure with zero extra AI cost/latency. Industry guidance: gate on concrete, measurable criteria before LLM-as-judge. | LOW | `isVagueEstimate()` is already pure + deterministic. Math validation already runs inside `generateEstimateForProject` (subtotal/tax/total rounding). Keep the cheap gate as the default; reserve any LLM-judge for a differentiator. |
| **"Needs more info" is an explicit, typed outcome — not an error** | A vague input is a normal, recoverable state, not a 500. WhatsApp already treats it as a first-class branch (`checkVagueEdge → askDetails`). | MEDIUM | Generation core `generateEstimateForProject` currently THROWS on no-input and returns a success result otherwise — it has no "generated-but-vague" return channel. The graph layer (not the core) owns the verdict today. Keep it that way: the shared graph adds a `quality: 'ok' \| 'needs_details'` to graph state. |
| **A localized, specific prompt telling the user WHAT is missing** | "Add more detail" is useless; "tell me service type, area, materials, timeline" is actionable. | LOW | Exists: `buildAskDetailsMessage(language)` with EN/PT/ES copy naming the 4 missing dimensions. Reuse for WhatsApp; web/MCP need the same *content* rendered in their own surface (UI banner / structured field). |
| **Resumable continuation against the SAME draft (no orphan re-create)** | When the user supplies the missing detail, it must complement the original project and regenerate — not spawn a second project/estimate. | MEDIUM | WhatsApp does this via `whatsapp_sessions(state='awaiting_details', draft_project_id)` + `revertVagueEstimate()` (deletes the $0 estimate, reverts project to draft) + the `awaiting_details` debounce branch in `handler.ts`. Web/MCP need an equivalent "this project is awaiting details" persisted flag (see per-channel matrix). |
| **Hard iteration cap / loop guard** | Without a max-attempts bound, an evaluator-optimizer loop can refine forever, burning cost and latency. Every 2026 source on the pattern stresses a hard iteration limit + clear termination condition. | LOW | No loop exists yet (today's gate is one-pass: ask once, wait for human, regenerate once). The cap becomes load-bearing the moment any *automatic* refine edge is added. Store `refineAttempts` in graph state; cap at 1 auto-refine (recommended) before falling back to ask-the-human. |
| **Always reply / never silently die** | The graph's hardest-won property: a failure must produce a visible, recoverable outcome, not a dead Inngest job. | LOW (preserve) | Already encoded: `generateEstimateNode` never re-throws (`generationFailed` flag → `sendError`), and `checkGeneratedEdge` routes failures to a reply. This invariant MUST survive the extraction — it is the most important behavior in `estimate-graph.ts`. The web/MCP terminal nodes need their own equivalent of `sendError`. |
| **Quota/usage charged once per delivered estimate, not per refine attempt** | Users must not be billed N× for one logical estimate because the engine refined internally. | MEDIUM | `recordUsage` runs in the Inngest wrapper as a separate `step.run` keyed by `requestId` (idempotent). A refine loop that regenerates inside one graph run must NOT double-charge — decide whether a refine counts as new usage (recommend: charge per *delivered* estimate, not per internal attempt). Dependency: `lib/quota` idempotency-key strategy. |

### Differentiators (Competitive advantage, align with the <5-min Core Value)

Features that make the unified engine *better* than today's single-pass behavior — not just at-parity. Be selective; these are where to spend.

| Feature | Value Proposition | Complexity | Notes / Dependency |
|---------|-------------------|------------|--------------------|
| **One automatic self-refine before asking the human** | Many "vague" estimates are recoverable from context the model under-used on pass 1. A single evaluator-optimizer iteration (re-prompt with the critique "you returned $0 / no items; re-examine the transcript and price conservatively") can salvage the estimate with zero user friction — directly serving "estimate in under 5 min without touching a keyboard." | MEDIUM | This is the *true* upgrade from the current one-pass gate to a real evaluator-optimizer loop. New conditional edge: `evaluateQuality → (refine \| finalize \| ask)` with `refineAttempts` cap = 1. Adds one AI call only on the failure path. Must respect the cost/latency anti-features below. |
| **LLM-as-judge quality scoring beyond the structural check** | Structural `isVagueEstimate` catches $0/empty but not "technically priced but obviously wrong/thin" (1 line item for a kitchen remodel). A lightweight judge (cheap model) scoring completeness/plausibility catches soft-vague estimates. | HIGH | Net-new. Higher cost + latency + a new failure mode (judge disagreeing with itself). Recommend deferring to a later phase behind the structural gate; gate first, judge only if structural passes but confidence is low. Flag for deeper phase research. |
| **Per-channel "confidence/quality" surfaced to the user** | Showing web users a soft "this estimate looks thin — add audio/photos?" nudge (non-blocking) lets them choose to improve without forcing a loop. | MEDIUM | Web-only UX affordance. Reuses the same verdict; renders as a dismissible banner on the estimate editor rather than blocking. Lower-risk way to give web the *intelligence* without the *interruption*. |
| **Unified langfuse tracing of the gate/refine decision across all 3 channels** | One trace showing ingest→generate→assess→(refine/ask)→finalize per channel makes the agentic behavior debuggable and tunable (where do estimates get judged vague? how often does auto-refine succeed?). | MEDIUM | Stated milestone goal ("unified observability"). Dependency: the v4.2 `pipeline_events` store already records steps; the graph nodes should emit equivalent spans. Trace the *verdict* and *attempt count*, not transcripts (v4.2 ADMINLOG-05 safe-metadata rule still applies — no transcript/audio/apiKey tokens). |

### Anti-Features (Tempting, but harmful — explicitly DO NOT build)

The question explicitly asks where NOT to add agentic loops. These are guardrails the phases must encode.

| Anti-Feature | Why Requested / Tempting | Why Problematic | Better Approach |
|--------------|--------------------------|-----------------|-----------------|
| **Unbounded / multi-iteration auto-refine** | "Just keep refining until it's perfect." | Evaluator-optimizer loops without a hard cap burn tokens, blow latency past the <5-min promise, and can oscillate. Universally flagged anti-pattern. | Hard cap (recommend **1** auto-refine), then fall back to asking the human (web/MCP/WhatsApp surfaces). Store + assert `refineAttempts`. |
| **Surprising the user with extra AI calls / cost** | More AI = better output. | Each refine/judge call costs money + time the owner didn't ask for, and can double-charge quota. Erodes trust + margin. | Cheap deterministic gate **first**; spend an extra AI call **only** on the failure path; charge quota per *delivered* estimate, not per internal attempt. |
| **Blocking the fast/happy path with a quality gate that has overhead** | "Always run the judge for safety." | An LLM-judge on every estimate adds latency to the 90% of estimates that are fine, directly hurting the core value prop. | Structural gate is ~free and runs always; the expensive judge (if built) runs only when structural passes but signals are weak. The happy path stays single-shot-fast. |
| **Forcing a synchronous human-in-the-loop interrupt on the async web channel** | LangGraph's `interrupt()` is the textbook HITL primitive; reuse it everywhere. | `interrupt()` requires a checkpointer AND a caller waiting on the same `thread_id` to `Command(resume=...)`. The web generation runs in a fire-and-forget Inngest job — there is NO human waiting mid-run. A graph `interrupt()` would hang the job, not prompt the user. | Web must **terminate** the run, **persist** a "needs_details" state, and prompt the user **later** in the UI (poll/notification). Resume = a *new* graph run triggered by the user's added input. (This is the single biggest cross-channel design trap.) |
| **A single canned "could not generate" error for vague input** | Simplest to implement. | Conflates "broken" with "needs a bit more info"; users abandon instead of completing. WhatsApp already avoids this. | Keep "needs_details" as a distinct, actionable, typed outcome on every channel (table stakes above). |
| **Blocking MCP `create_estimate` waiting inline for clarification** | MCP spec now has `elicitation/create` (server pauses, asks client for structured input mid-call). | Elicitation requires the *client* to support it (Claude.ai / Claude Desktop / ChatGPT vary), and the existing MCP contract is already async (`create_estimate` returns `job_id`, LLM polls `check_job_status`). Adding a synchronous elicitation pause fights that design and breaks non-supporting clients. | Return a structured terminal status (`status: 'needs_details'` + `missing: [...]` + the same `project_id`) from the job-status poll. The **calling LLM** decides to gather detail and call `create_estimate` again on the same project. Keeps the contract async + portable. |
| **Re-creating a new project/estimate on each refine or detail-supply** | Easiest mental model: every generate = new row. | Orphan projects/estimates, broken version lineage, confusing dashboards. | Revert + regenerate against the SAME draft (`revertVagueEstimate` pattern); estimate `version` increments on the same project (already in `generateEstimateForProject`). |
| **Putting the quality verdict inside `generateEstimateForProject`** | "One function does everything." | The core is shared and intentionally channel-agnostic; baking the gate + ask-details + session logic into it couples it to graph/conversation concerns and breaks the clean "generation core vs orchestration" split the milestone relies on. | Verdict + routing live in the **graph nodes** (`evaluateQuality`/`refine`/`ask*`); the core stays a pure generate function. (Matches today's separation — `ask-details.ts` is explicitly "WhatsApp-only, core NOT touched".) |

---

## Per-Channel Behavior Matrix (THE core deliverable)

Same quality verdict (`ok` \| `needs_details`), three control-flow shapes. "Human in the loop mid-run?" is the discriminator.

| Concern | Web (async, Inngest job) | WhatsApp (conversational) | MCP (programmatic API) |
|---------|--------------------------|---------------------------|------------------------|
| **Human waiting mid-run?** | **No** — fire-and-forget Inngest job; user already navigated away / sees a spinner. | **Yes** — owner is in an active chat thread, can reply inline. | **No** — calling LLM issued a tool call and is polling; no human in the tool execution itself. |
| **On verdict = `needs_details`** | Auto-refine once (cap=1); if still vague, **end the run** and **persist** a "needs_details" state on the project/estimate. Do NOT `interrupt()`. | Auto-refine once (optional); if still vague, send `buildAskDetailsMessage()` inline and open `awaiting_details` session (existing behavior). | Auto-refine once (cap=1); if still vague, the job completes with a structured `needs_details` payload. |
| **How the user/caller is prompted** | UI surfaces the persisted state: a non-blocking banner / state on the estimate editor ("Add a few details to finish this estimate: service type, area, materials, timeline") + optional in-app notification. | Inline WhatsApp text message (already localized EN/PT/ES). | `check_job_status` returns `{ status: 'needs_details', project_id, missing: ['service_type','area','materials','timeline'] }`; the LLM reads it and asks ITS user or supplies detail itself. |
| **Persisted state mechanism** | **New** — needs a project/estimate-level flag (e.g. `projects.status = 'awaiting_details'` or an estimate workflow_status) since there is no chat session. Web can reuse the project row; a `whatsapp_sessions`-style table is overkill. | Existing `whatsapp_sessions(state='awaiting_details', draft_project_id, expires_at, 30-min TTL)`. | Stateless from MCP's view — the verdict rides in the job-status response; state lives on the project row (same as web). The LLM holds the conversational state on its side. |
| **How continuation/resume happens** | User adds audio/photo/text in the web UI → triggers a **new** generation run (new Inngest event) against the same project → version increments. NOT a graph resume. | Next inbound message in `awaiting_details` → debounced → re-dispatched to the SAME draft project (`dispatchToExistingProject`) → regenerates. | LLM calls `create_estimate` again with more detail in the `prompt` (and/or same `project_id`) → new job → regenerates against same project. |
| **Cleanup of the vague estimate** | `revertVagueEstimate`-equivalent: either delete the $0 estimate or keep it flagged-incomplete (decide in phase). Today web persists a vague estimate and shows it — undesirable. | `revertVagueEstimate()` deletes the $0 estimate + reverts project to draft (existing). | Same project-row cleanup as web; the LLM never sees a $0 estimate, only the `needs_details` status. |
| **Existing entry point to migrate** | `lib/inngest/functions/generate-estimate.ts` (`call-ai-provider` step → must call the shared graph instead of the linear core). | `lib/whatsapp/estimate-graph.ts` + `whatsapp-process.ts` (already the graph — keep edge nodes for media download + conversational reply). | `lib/mcp/tools/write.ts` (`create_estimate` dispatches `EVENT_ESTIMATE_GENERATE`; `check_job_status` reads run output → must learn to surface `needs_details`). |
| **LangGraph mechanism** | Graph runs to a terminal `persistNeedsDetails` node, then END. **No `interrupt()`.** | Graph runs to `askDetails` node (sends message + opens session), then END. (Today's behavior.) | Graph runs to a terminal node that sets the structured outcome in the run output, then END. **No elicitation pause.** |

**The one-paragraph takeaway for phase planning:** the shared graph should END at a verdict, not pause. For WhatsApp the "end" node sends a chat message + opens a session; for web the "end" node persists a project-level `awaiting_details` flag the UI later reads; for MCP the "end" node writes a structured status into the Inngest run output that `check_job_status` relays. Three terminal "ask" nodes (or one terminal node + a `channel`-switched side-effect), NOT three different loops. The loop (auto-refine, cap=1) is identical and channel-agnostic; only the **terminal "ask" side-effect** differs.

---

## Feature Dependencies

```
Shared canonical graph (ingest → generate → assess → refine/ask → finalize)
   ├── requires ──> generateEstimateForProject  [EXISTS — keep as pure core, do not embed verdict]
   ├── requires ──> isVagueEstimate()           [EXISTS in ask-details.ts — reuse verbatim as the cheap gate]
   ├── requires ──> graph state: { quality, refineAttempts, channel }   [NEW]
   │
   ├── Quality gate (table stakes)
   │       └── enhanced by ──> One auto-refine (differentiator)
   │                               ├── requires ──> hard iteration cap   [loop guard — table stakes]
   │                               └── enhanced by ──> LLM-as-judge (differentiator, DEFER)
   │
   ├── Per-channel terminal "ask" side-effect
   │       ├── WhatsApp: askDetails node            [EXISTS — whatsapp_sessions + buildAskDetailsMessage]
   │       ├── Web: persistNeedsDetails node        [NEW — project-level awaiting_details flag + UI banner]
   │       └── MCP: needs_details status            [NEW — structured field in run output, read by check_job_status]
   │
   ├── Resumable continuation (table stakes)
   │       ├── WhatsApp: dispatchToExistingProject   [EXISTS]
   │       ├── Web: new run on same project from UI  [NEW trigger; version increment EXISTS]
   │       └── MCP: re-call create_estimate          [EXISTS — same project_id]
   │
   ├── conflicts with ──> LangGraph interrupt() on web   [ANTI-FEATURE — no human mid-run]
   └── conflicts with ──> MCP elicitation pause          [ANTI-FEATURE — async contract + client support]

Quota single-charge ──constrains──> auto-refine loop (charge per delivered estimate, not per attempt)
Unified langfuse tracing ──enhances──> the whole graph (reuses v4.2 pipeline_events discipline; safe-metadata rule applies)
```

### Dependency Notes

- **Graph requires the core but must not absorb its responsibilities:** `generateEstimateForProject` stays the channel-agnostic generate primitive (it already takes a `channel?` option only for the WhatsApp system-prompt addendum). The quality verdict, refine decision, and ask-side-effects belong in graph nodes — mirroring today's clean split where `ask-details.ts` is "WhatsApp-only, core intentionally NOT touched."
- **Auto-refine requires the iteration cap before it ships:** the cap is not a follow-up; an uncapped loop is the headline anti-pattern. Land them together.
- **Web continuation is a NEW run, not a graph resume:** because there is no human mid-run, the web "resume" is the user adding input later and a fresh Inngest event firing. This is a dependency on the *absence* of `interrupt()`, not on adding it.
- **MCP `needs_details` depends on `check_job_status` learning a new terminal status:** today `check_job_status` normalizes to `queued\|running\|complete\|failed` and extracts an `estimate_id` on complete (`normalizeStatus` / `extractEstimateId` in `write.ts`). It needs a `needs_details` branch carrying `project_id` + `missing[]`, sourced from the Inngest run output.
- **Quota charging constrains the loop:** `recordUsage` is idempotent per `requestId` in the Inngest wrapper. If a single graph run can regenerate internally, decide the charging unit up front (recommend: per delivered estimate). Otherwise a refine silently double-bills.
- **Checkpoint granularity is an open architectural question (from PROJECT.md):** today the WhatsApp graph runs inside a single `step.run` (no per-node checkpoint). A refine loop changes the cost calculus of re-running the whole graph on Inngest retry — phase planning must resolve graph↔Inngest checkpoint boundaries alongside the loop.

---

## MVP Definition (for this milestone)

### Land in v4.3 core phases (parity + the safe upgrade)

- [ ] **Extract the canonical graph** with the quality gate (`evaluateQuality` reusing `isVagueEstimate()`) — the unification spine.
- [ ] **Web consumes the graph** and, on `needs_details`, persists a project-level state instead of shipping a $0 estimate (closes the worst current single-shot gap).
- [ ] **MCP consumes the graph** and surfaces `needs_details` via `check_job_status` (structured, async — no elicitation).
- [ ] **WhatsApp consumes the graph**, keeping `askDetails` + sessions as its terminal node (no behavior regression; the "always reply / never throw" invariant preserved).
- [ ] **Hard iteration cap** in graph state (even if auto-refine is cap=0 initially, the guard exists).
- [ ] **Quota charged per delivered estimate** (no double-charge from internal attempts).

### Add after parity (the differentiator that serves the <5-min promise)

- [ ] **One automatic self-refine (cap=1)** on the failure path before asking the human — turns the one-pass gate into a true evaluator-optimizer loop.
- [ ] **Web non-blocking "thin estimate" nudge** (soft verdict surfaced, user opts in).
- [ ] **Unified langfuse traces** of verdict + attempt count across channels.

### Defer (flag for deeper phase research)

- [ ] **LLM-as-judge soft-quality scoring** beyond the structural gate — new cost/latency/failure surface; only if structural-pass-but-weak cases prove common.
- [ ] **Multi-iteration refine (cap>1)** — only if telemetry shows one refine is insufficient AND latency budget allows.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Extract canonical graph + shared quality gate | HIGH | MEDIUM | P1 |
| Web: persist `needs_details` (stop shipping $0 estimates) | HIGH | MEDIUM | P1 |
| MCP: structured `needs_details` via check_job_status | HIGH | MEDIUM | P1 |
| WhatsApp: consume graph, preserve askDetails + never-throw | HIGH (regression risk) | MEDIUM | P1 |
| Hard iteration cap / loop guard | HIGH (cost safety) | LOW | P1 |
| Quota charged per delivered estimate | HIGH (margin/trust) | MEDIUM | P1 |
| One automatic self-refine (cap=1) | HIGH | MEDIUM | P2 |
| Web non-blocking "thin estimate" nudge | MEDIUM | MEDIUM | P2 |
| Unified langfuse tracing of verdict/attempts | MEDIUM | MEDIUM | P2 |
| LLM-as-judge soft scoring | MEDIUM | HIGH | P3 |
| Multi-iteration refine (cap>1) | LOW | MEDIUM | P3 |

**Priority key:** P1 = required for the milestone's parity goal · P2 = the upgrade that justifies "agentic" · P3 = defer behind telemetry.

---

## Competitor / Pattern Analysis

| Aspect | Industry pattern (2026) | Xtimator's current state | Our approach for v4.3 |
|--------|------------------------|--------------------------|----------------------|
| Quality loop | Evaluator-optimizer / reflection: generate → LLM-as-judge → refine, **hard iteration cap** | One-pass structural gate (WhatsApp only); web/MCP single-shot | Extract structural gate to all channels; add cap=1 auto-refine as the differentiator; LLM-judge deferred |
| Pause/resume | LangGraph `interrupt()` + checkpointer for HITL | WhatsApp uses sessions + new dispatch (not `interrupt()`) | Keep the END-and-persist model; **avoid `interrupt()` on async web** |
| API clarification | MCP `elicitation/create` (synchronous, client-dependent) | MCP is async (`job_id` + poll) | Structured `needs_details` status on poll; **avoid elicitation pause** |
| Termination | Concrete, measurable gate + max-attempts | Deterministic `isVagueEstimate` (total≤0 OR no items) | Reuse the deterministic gate as the cheap first check; cap any loop |

---

## Sources

- LangGraph — Human-in-the-Loop and Interrupts (checkpointer-backed `interrupt()` / `Command(resume)`; requires a caller on the same `thread_id`): https://docs.langchain.com/oss/python/langgraph/interrupts · https://www.langchain.com/blog/making-it-easier-to-build-human-in-the-loop-agents-with-interrupt
- Evaluator-optimizer / reflection pattern with hard iteration cap (the named "generate → evaluate → refine/accept" loop): https://www.sitepoint.com/the-definitive-guide-to-agentic-design-patterns-in-2026/ · https://www.c-sharpcorner.com/article/implementing-stateful-evaluation-loops-in-langgraph/ · https://blog.gainesai.com/langgraph-strands-agentcore-and-the-patterns-that-actually-matter-in-2026
- Quality-gate / termination-condition best practices (concrete measurable gates, avoid unbounded loops): https://arxiv.org/pdf/2501.17167 (QualityFlow) · https://futureagi.com/blog/langgraph-agent-evaluation-2026/
- MCP elicitation vs structured-status (why async tools should return structured outcomes rather than pause): https://dev.to/kachurun/mcp-elicitation-human-in-the-loop-for-mcp-servers-m6a · https://newsletter.victordibia.com/p/mcp-for-software-engineers-part-2
- Existing Xtimator code (primary source for current behavior + dependencies): `lib/whatsapp/estimate-graph.ts`, `lib/whatsapp/ask-details.ts`, `lib/services/generate-estimate.ts`, `lib/inngest/functions/generate-estimate.ts`, `lib/mcp/tools/write.ts`, `lib/whatsapp/handler.ts`, `lib/whatsapp/confirm.ts`

---
*Feature research for: unified agentic estimate engine (quality-gate + refinement across web/WhatsApp/MCP)*
*Researched: 2026-06-20 · Confidence: HIGH*
