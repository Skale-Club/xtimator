# Project Research Summary

**Project:** Xtimator
**Milestone:** v4.3 — Unified Agentic Estimate Engine
**Domain:** Shared multi-channel agentic estimate pipeline (web UI + MCP + WhatsApp) on Next.js 16 + Inngest + LangGraph + Supabase, with quality-assessment + refinement intelligence unified across channels
**Researched:** 2026-06-20
**Confidence:** HIGH

> This file previously held v4.0 multi-tenancy research (preserved in `.planning/milestones/v4.0-ROADMAP.md`). It has been replaced with v4.3 research, matching the four dimension files (`STACK.md`, `FEATURES.md`, `ARCHITECTURE.md`, `PITFALLS.md`) regenerated the same day.

## Executive Summary

This is a **refactor-and-unify milestone, not a greenfield build** — and the hard part is already done. `generateEstimateForProject` (`lib/services/generate-estimate.ts`) is a single, channel-agnostic generation core that all three channels already share. What diverges today is (1) orchestration and (2) the quality/refinement intelligence that only WhatsApp has: a one-pass structural gate (`evaluateVagueness` -> `isVagueEstimate()` -> `askDetails`) that detects a zero/empty estimate and asks the owner for detail before sending. Web and MCP currently ship that zero/empty estimate silently, single-shot. The named industry pattern for "generate -> evaluate -> decide good-enough vs needs-input -> iterate/ask" is the **evaluator-optimizer (reflection) loop with a hard iteration cap**. v4.3's job is to (a) extract the gate into a shared canonical graph, (b) give web + MCP the same gate, and (c) make the "needs more info" outcome surface correctly per channel.

The recommended shape is **one StateGraph whose pluggable nodes are resolved from a ChannelAdapter** passed into a `buildEstimateGraph(adapter)` factory (mirroring the repo's existing factory and closure patterns). The canonical core is `generate -> assess -> decide`; each channel plugs only its *edge* nodes: `ingest` (WhatsApp downloads media; web/MCP passthrough because transcripts/descriptions already exist), `refine`/`ask` (WhatsApp `askDetails` + sessions; web persists a `needs_details` state; MCP returns a structured status), `finalize`, and `onError`. The single most important product insight: **the same quality verdict must produce three different control-flow shapes** because only WhatsApp has a human waiting inline. The shared graph should **END at a verdict, not pause** — three terminal "ask" side-effects, one channel-agnostic loop.

The key risks are all variations on one tension: today the whole WhatsApp graph runs inside **one Inngest step.run with no LangGraph checkpointer**, which is deliberate and correct for WhatsApp but **must not be copied onto web/MCP**, which already have fine-grained per-AI-call step.run checkpoints. Mitigation is threefold: (1) Inngest stays the **sole** durability layer — add **no** LangGraph checkpointer (it would double-persist state and create a second recovery authority); (2) keep web's **decoupled ingestion** — the graph enters at `generate`; (3) preserve WhatsApp's **never-throw / always-reply** invariant by signaling failure via *state*, not exceptions, and mapping it per-adapter. Cost discipline matters: the deterministic `isVagueEstimate()` gate stays free and always-on; any extra AI call (refine/judge) runs **only on the failure path**, hard-capped, charged **per delivered estimate**.

## Key Findings

### Recommended Stack

The LangChain/LangGraph/Inngest stack is **already installed and working**; v4.3 needs almost no new runtime dependencies. The core generation pipeline and the OpenRouter provider factory are already shared across all three channels and require no new packages. The one real piece of new work is **observability**: the installed `langfuse@3.38.20` is the pre-OTel v3 line and its LangChain companion is incompatible with this project's LangChain v1 (`@langchain/core@1.1.48`). The compatible path is the **Langfuse v5 OTel SDK**. There is **no new checkpoint package** — "checkpointing" here means Inngest steps, not a LangGraph saver. (See `STACK.md`.)

**Core technologies (NEW — observability only):**
- `@langfuse/langchain@^5.5.3` — `CallbackHandler` that turns LangGraph callbacks into Langfuse spans; the *only* Langfuse package compatible with LangChain v1 (peer `@langchain/core >=0.3.8`, satisfied).
- `@langfuse/otel@^5.5.3` + `@langfuse/tracing@^5.5.3` — `LangfuseSpanProcessor` (OTel export path) + manual `observe()` spans for raw OpenRouter/Whisper calls.
- `@opentelemetry/sdk-node` + `@opentelemetry/api@^1.9.0` — host OTel SDK; pin top-level to avoid version skew with Sentry's bundled copy.

**Explicitly unchanged / NOT added:**
- `@langchain/langgraph@^1.3.x` (resolves to `1.3.6`) + `@langchain/core@^1.1.48` — **stay put.** v1 GA, no-breaking-changes-until-2.0; `StateGraph` is the correct, proven primitive. Do **not** bump and do **not** introduce `createReactAgent`/`createAgent` (the estimate flow is a deterministic pipeline, not a ReAct loop).
- **No checkpointer package.** `MemorySaver`/`PostgresSaver`/`SqliteSaver` are already transitive — do not wire any of them.
- After migration, retire `langfuse@3` (`npm uninstall langfuse`) once `lib/observability/langfuse.ts` call-sites move to v5. Do **not** run both SDK lines in parallel long-term.

**Stack must-flag:** `@sentry/nextjs@10.x` is installed and **auto-initializes OpenTelemetry**. Langfuse v5 is OTel-native. Both will collide on the global tracer provider unless Sentry is set with `skipOpenTelemetrySetup: true` and both processors register on **one shared `NodeTracerProvider`** in `instrumentation.ts`. This is the single biggest integration risk in the stack.

### Expected Features

The per-channel behavior matrix is **the core deliverable**: same verdict (`ok` | `needs_details`), three control-flow shapes, discriminated by "is a human waiting mid-run?" (See `FEATURES.md`.)

**Must have (table stakes — parity):**
- **Quality gate on every channel** — reuse `isVagueEstimate()` (total <= 0 OR zero line items) verbatim; extract `evaluateVagueness` into the shared graph.
- **Deterministic, cheap pass/fail check first** — free structural check before any LLM judge; preserves the common-case single-call cost.
- **"Needs more info" as a typed, first-class outcome** (`quality: 'ok' | 'needs_details'` in graph state) — not a 500, not a silent zero estimate.
- **Resumable continuation against the SAME draft** — no orphan re-create; version increments on the same project.
- **Hard iteration cap / loop guard** — store `refineAttempts`; the cap is load-bearing the moment any auto-refine edge exists. Land it *with* the loop, never after.
- **Always reply / never silently die** — preserve WhatsApp's never-throw discipline; each channel needs its own terminal failure surface.
- **Quota charged once per *delivered* estimate**, not per internal refine attempt (`recordUsage` idempotent per `requestId`).

**Should have (differentiators — the upgrade that justifies "agentic"):**
- **One automatic self-refine (cap=1)** on the failure path before asking the human — turns the one-pass gate into a true evaluator-optimizer loop; adds one AI call only on the failure path; directly serves the <5-min promise.
- **Web non-blocking "thin estimate" nudge** — surface the verdict as a dismissible banner, not a blocking question (web has no chat thread).
- **Unified Langfuse traces** of verdict + attempt count across all three channels (reuses v4.2 `pipeline_events` discipline; safe-metadata rule applies — no transcripts/audio/key tokens).

**Defer (v2+ / behind telemetry):**
- **LLM-as-judge soft-quality scoring** beyond the structural gate — new cost/latency/failure surface; only if structural-pass-but-weak cases prove common. Flag for deeper phase research.
- **Multi-iteration refine (cap>1)** — only if telemetry shows one refine is insufficient and latency budget allows.

**Anti-features (explicitly DO NOT build):**
- Unbounded / multi-iteration auto-refine (cap it at 1, then ask the human).
- LangGraph `interrupt()` on the async web channel — there is no human mid-run; it would hang the job, not prompt the user.
- MCP `elicitation/create` synchronous pause — fights the existing async `job_id`+poll contract and breaks non-supporting clients; return a structured `needs_details` status instead.
- Putting the quality verdict inside `generateEstimateForProject` — keep the core a pure generate function; verdict/routing live in graph nodes.
- Re-creating a new project/estimate per refine — revert + regenerate against the same draft.

### Architecture Approach

One shared `StateGraph` with a `ChannelAdapter` (not three graphs, not LangGraph `configurable`). Canonical nodes (`generate -> assess -> decide`) are defined exactly once; channels plug only edge nodes. State is **channel-neutral** (`companyId`, `projectId`, `channel`, `prompts?`, `isVague`, `generationFailed`/`failure?`, `refineAttempts`) — no `ownerPhone`/`WhatsAppMessage`/`whatsapp_*` in the shared core. The graph **enters at `generate`**; ingestion is a pluggable pre-node (passthrough guard `hasUsableInputs(projectId)` for web/MCP, media fan-out for WhatsApp). (See `ARCHITECTURE.md`.)

**Major components:**
1. **Channel entry (Inngest functions)** — `whatsapp-process.ts`, `generate-estimate.ts` (MCP reuses web's fn). The durability boundary: `step.run` wrappers, retries, `onFailure`, idempotency, `pipeline_events`, quota. **Keep one `onFailure` per function** (channel-specific; never consolidate).
2. **Shared domain graph** — `lib/estimate/graph/` (`buildEstimateGraph(adapter)` factory, `state.ts`, `types.ts` for `ChannelAdapter`/`StepRunner`, `nodes/{generate,assess,decide}.ts`).
3. **Channel adapters** — `lib/estimate/adapters/{default,whatsapp}.ts`. WhatsApp adapter imports existing `lib/whatsapp/*` primitives (`downloadWhatsAppMedia`, `sendWhatsAppMessage`, `revertVagueEstimate`, `buildAskDetailsMessage`, session writes).
4. **Quality core** — `lib/estimate/quality/vagueness.ts` (channel-neutral `isVagueEstimate` + `hasUsableInputs`); `ask-details.ts` keeps WhatsApp copy/session helpers.
5. **Generation core** — `lib/services/generate-estimate.ts` — **UNCHANGED.** The load-bearing fact that makes this milestone cheap.

**Integration points that change:** `whatsapp-process.ts` (import swap + `channel:'whatsapp'`, durability unchanged) and `generate-estimate.ts` `call-ai-provider` step (now `graph.invoke(defaultAdapter)` — the line that gives web *and* MCP parity for free). `mcp/tools/write.ts` `create_estimate` needs **no change**; `check_job_status` learns a `needs_details` terminal status. `intent-router.ts` is a separate conversational graph — **out of scope.**

### The Two Load-Bearing Decisions

These are the decisions `PROJECT.md` flagged; all four dimension files converge on the same answers.

**Decision 1 — graph <-> Inngest checkpoint granularity -> Inngest owns durability; NO LangGraph checkpointer.**
Today the whole WhatsApp graph runs inside one `step.run` with no checkpointer; a retry re-runs the entire graph, re-charging every AI call. This is deliberate for WhatsApp (`retries:1` + never-throw + `onFailure` fallback make a re-charge-free *visible failure* preferable). The fix for finer resume is **NOT a LangGraph checkpointer** (in-memory savers do not survive Inngest retries/serverless restarts — the "Pod B" problem; a Postgres saver duplicates state Inngest already owns and creates a second source of truth that drifts from the `whatsapp_sessions` state machine). It is **Inngest step decomposition**: a thin `StepRunner` injected into the graph so the expensive AI nodes (`generate`, and WhatsApp transcribe/vision) each become their own memoized `step.run`, with `passthroughRunner` in unit tests. Per channel, document exactly which retry count and step boundary each AI call lives in. **Never run a multi-AI-call graph in one `step.run` with `retries > 0`.**

**Decision 2 — keep web's decoupled ingestion; the graph enters at `generate`.**
Web already ingests at upload time via separate Inngest jobs (`transcribe-audio.ts`, `analyze-photos.ts`) with per-item `step.run` checkpoints and a staged "Transcribing -> Analyzing -> Generating" UX. By generation time, `recordings.transcript` and `photos.ai_description` are populated. Folding ingestion into the graph would **regress** both the per-item checkpointing and the staged UX, and a shared unconditional `ingest` node would **double-charge** web transcription or fail (no WhatsApp media id). So `ingest` is a pluggable pre-node: passthrough guard for web/MCP, media fan-out for WhatsApp. The shared core consumes **already-ingested** inputs.

### Critical Pitfalls

(Top items from `PITFALLS.md`; all radiate from the single-step / never-throw tension.)

1. **Double durability — wrapping the shared graph in one Inngest step re-charges AI on retry.** Copying WhatsApp's whole-graph-in-one-step model onto web/MCP loses the per-AI-call checkpoint `generate-estimate.ts` was built to provide. *Avoid:* decide the checkpoint contract **first**; never wrap a multi-AI-call graph in one `step.run` with `retries > 0`; keep usage recording idempotent in its own step. *Warning signs:* same `projectId` generating two estimates seconds apart; `usage_events` idempotency collisions; AI cost-per-estimate doubling.

2. **Regressing the WhatsApp silent-failure guarantee when nodes become shared.** A documented recurring bug class: if anything throws, the owner sees read+typing then *nothing*. The temptation to let shared nodes `throw` (so web gets clean errors) re-arms it. *Avoid:* separate "domain failure signaling" (via a `failure?` state channel) from "channel reply"; map `failure` per-adapter (WhatsApp `sendError`; web throws -> `ai_job.failed`; MCP failed status). Keep `sendWhatsAppMessage`/`whatsapp_*` **out** of the shared core. Freeze the reply-on-failure regression test.

3. **Channel divergence leaking — a shared node assumes WhatsApp-only context (`ownerPhone`, conversational reply) when called from web/MCP; ingestion mismatch.** *Avoid:* channel-neutral shared state; ingestion as a pluggable edge step (web keeps decoupled jobs; WhatsApp media in its adapter; MCP prompt-only); guard test that a web-shaped invoke touches no `whatsapp_*` table.

4. **Cost/latency blow-up — agentic refinement adds surprise AI calls to the fast web path.** Replacing the free deterministic `isVagueEstimate()` with an LLM judge "for parity" adds a model call to *every* estimate; an unbounded loop multiplies it. *Avoid:* deterministic gate first, LLM/refine only when thin; hard iteration cap (<=1); pin web's non-vague happy path to **exactly 1 AI call** with a test.

5. **Checkpoint conflict / replay non-determinism.** Adding a LangGraph checkpointer for the refine wait creates two sources of truth (Pitfall 3 above); and ids/timestamps minted *inside* a node (`Date.now()`, `randomUUID()`) diverge on replay -> duplicate sessions / idempotency mismatch. *Avoid:* keep cross-message wait in the session/event mechanism; mint all ids/timestamps once at the entrypoint and thread through state.

6. **Multi-tenant isolation regressing — `companyId` leaking into an LLM-controllable surface.** If the refine loop gains tools, a `company_id` schema field lets crafted input steer cross-tenant reads (service role bypasses RLS, so the `.eq('company_id', companyId)` filter is the *sole* control). *Avoid:* `companyId` enters as trusted closure/state only; forbid tenant inputs on every tool; static-contract test that every shared query is scoped; MCP adapter re-verifies `auth.company_id` ownership.

## Implications for Roadmap

Based on combined research, the milestone has six natural workstreams. Two ordering principles dominate and **agree**: (1) the checkpoint-granularity *contract* is the keystone every migration depends on — decide it as a cheap up-front artifact before extracting nodes; (2) do the risky mechanical change (graph extraction) **behind the best-tested channel** (WhatsApp) without changing its behavior, then migrate the simplest channel as a no-op, then flip on intelligence, then observe, then optimize durability last.

### Phase 1: Checkpoint-Granularity Contract (decision artifact)
**Rationale:** `PROJECT.md`-flagged keystone; every migration phase depends on it. It is a *decision + lightweight scaffolding* (the `StepRunner` interface), not heavy implementation — cheap to land first and it pre-empts Pitfalls 1, 3, 5, 7.
**Delivers:** A written per-channel contract — which retry count + which `step.run` boundary each AI call lives in; explicit "no LangGraph checkpointer; Inngest is the sole durability layer; cross-message wait stays in `whatsapp_sessions`/events." The `StepRunner` type + `passthroughRunner` default.
**Addresses:** Decision 1 (the load-bearing one).
**Avoids:** Pitfalls 1 (double durability), 3 (checkpointer conflict), 7 (cost budget per channel).

### Phase 2: Extract Canonical Graph Behind WhatsApp (behavior-preserving)
**Rationale:** Riskiest mechanical change, done behind the richest test suite. If extraction is faithful, WhatsApp's tests stay green — de-risks the refactor itself.
**Delivers:** `lib/estimate/graph/` + `whatsappAdapter` by *moving* existing WhatsApp nodes into the adapter and `generate`/`assess`/`decide` into the channel-neutral core. Repoint `whatsapp-process.ts`. No durability change, no new intelligence, no web/MCP change.
**Uses:** Existing `StateGraph`, `buildEstimateGraph` factory pattern; `isVagueEstimate` moved to `lib/estimate/quality/vagueness.ts`.
**Implements:** Shared domain graph + channel adapter (components 2-4).
**Avoids:** Pitfalls 2 (failure-as-state convention established here), 4 (never-throw preserved), 5 (channel-neutral state), 6 (closure tenancy in shared state).

### Phase 3: Migrate Web + MCP onto the Shared Graph (generate-only parity first)
**Rationale:** Prove the shared graph works for web/MCP **before** any behavior changes. Swap `generate-estimate.ts` `call-ai-provider` to `graph.invoke(defaultAdapter)` with `assess`/`refine`/`finalize` as no-op-finalize. MCP comes along for free.
**Delivers:** Identical output to today, now flowing through the shared graph; web's decoupled ingestion preserved (default `ingest` = passthrough guard).
**Implements:** Decision 2 (graph enters at `generate`); default adapter.
**Avoids:** Pitfall 5 (verify a web run makes 1 AI call and writes no `whatsapp_*`).

### Phase 4: Turn On Intelligence Parity for Web + MCP
**Rationale:** First *behavior* change for web/MCP, isolated to the default adapter. This is the milestone's headline — closing the silent-zero-estimate gap.
**Delivers:** Default adapter's real `assess` (`isVagueEstimate`) + `refine`/terminal: web persists a project-level `awaiting_details`/`needs_detail` marker (non-blocking UI banner, no `interrupt()`); MCP surfaces `needs_details` (+ `project_id`, `missing[]`) via `check_job_status`. Optional: the one automatic self-refine (cap=1) differentiator.
**Addresses:** Table-stakes quality gate on every channel + the per-channel behavior matrix; the differentiators.
**Avoids:** Anti-features (`interrupt()` on web, MCP elicitation); Pitfall 4 (deterministic gate first, cap the loop, pin happy-path call count).

### Phase 5: Unified Observability
**Rationale:** Once behavior is uniform there is something uniform to observe; the migration to the Langfuse v5 OTel SDK is its own task because it must touch Sentry's OTel init.
**Delivers:** Langfuse v5 wiring in `instrumentation.ts` (shared `NodeTracerProvider` coexisting with Sentry); `CallbackHandler` attached once inside the shared engine, channels distinguished by metadata/tags; `pipeline_events` extended with `assess`/`refine`; per-channel AI-calls-per-estimate + p95 latency tracked.
**Uses:** `@langfuse/langchain` + `@langfuse/otel` + `@langfuse/tracing` + OTel SDK (the only new deps).
**Avoids:** The Sentry/Langfuse global-provider collision; verifies Pitfall 7 budgets (web happy-path call count pinned).

### Phase 6 (last, optional): Durability Granularity Refactor
**Rationale:** Optimization that touches the money/durability contract — done last, after metrics from Phase 5 prove it helps. Introduce the `StepRunner` injection so the AI `generate` call (and WhatsApp transcribe/vision) become their own `step.run` checkpoints, cutting re-charge on retry.
**Delivers:** Per-AI-call durability without importing Inngest into the graph and without a checkpointer; validated against `pipeline_events` retry/re-charge data.
**Avoids:** Pitfall 1 fully resolved (per-AI-call memoization).

### Phase Ordering Rationale

- **Contract before code (Phase 1 first):** the checkpoint decision is a dependency for every migration; making it an up-front artifact prevents each phase from silently re-deciding it (the Pitfall 1 trap).
- **Extract behind the best test coverage (Phase 2), then no-op migrate (Phase 3), then flip behavior (Phase 4):** splits the two big variables — mechanical refactor and product change — so each is independently reviewable and bisectable.
- **Observe (5) before optimize (6):** the durability refactor benefits from, and is validated by, the metrics the observability phase produces.
- **MCP rides web's coattails:** because MCP already dispatches `EVENT_ESTIMATE_GENERATE`, it inherits Phases 3-4 with near-zero new code — only `check_job_status` needs the `needs_details` branch.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 4 (intelligence parity), specifically the LLM-as-judge differentiator:** deferred in FEATURES.md as a new cost/latency/failure surface — if pursued, needs its own research on judge model choice + disagreement handling. (The structural-gate parity itself is well-understood and does **not** need research.)
- **Phase 6 (durability granularity):** the `Send` parallel fan-out <-> `step.run` interplay is the fiddly part; confirm against current LangGraph + Inngest semantics before implementing.

Phases with standard patterns (skip research-phase):
- **Phases 2-3 (extraction + no-op migration):** the codebase is the authority; patterns are already proven in the WhatsApp graph and the existing factory/closure conventions.
- **Phase 5 (observability):** STACK.md already verified the exact packages, peer deps, and the Sentry-coexistence snippet — implementation-ready.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified against installed `node_modules` + npm registry + official docs; peer-dep incompatibility of the old Langfuse line confirmed empirically. |
| Features | HIGH | Canonical evaluator-optimizer pattern is well-documented; the existing codebase already implements a one-pass version; per-channel divergence verified against LangGraph + MCP spec sources. |
| Architecture | HIGH | Integration points read from actual source; the shared-core-already-exists fact is verified; graph<->durable-execution trade-offs cross-checked against current ecosystem docs. |
| Pitfalls | HIGH | Codebase-specific findings read directly from source (incl. the documented silent-failure debug log); LangGraph/Inngest replay semantics verified against official docs. |

**Overall confidence:** HIGH — this is a refactor of a working system with the generation core already shared, so most findings are grounded in the existing codebase rather than speculation.

### Gaps to Address

- **OpenRouter span coverage (MEDIUM):** whether `lib/ai/openrouter-client.ts` calls through `@langchain/*` model classes (auto-traced) or raw `fetch` (needs `observe()` wrappers) determines whether token/cost data lands in Langfuse. *Handle in Phase 5:* confirm the call path during the observability wiring; add `observe()` if raw `fetch`.
- **Sentry init ownership:** the exact file where `Sentry.init` lives (`sentry.server.config.ts` vs `instrumentation.ts`) must be identified before the observability phase, since Langfuse wiring must modify that spot (`skipOpenTelemetrySetup: true` + shared provider). *Handle at Phase 5 planning.*
- **Quota charging unit for refine:** confirm whether an internal refine counts against quota (recommend: charge per *delivered* estimate). *Handle in Phase 1's contract* alongside the loop cap.
- **Self-hosted vs Langfuse Cloud OTLP endpoint:** consistent with the deploy-via-CI/GHCR direction, confirm `LANGFUSE_HOST` + keys are env vars only (never committed, per CLAUDE.md). *Handle at Phase 5.*
- **Web vague-estimate cleanup:** decide whether to delete the zero estimate (WhatsApp's `revertVagueEstimate` model) or keep it flagged-incomplete on the web project row. *Handle in Phase 4.*
- **Minor version-citation skew:** PITFALLS.md cited `@langchain/langgraph@1.3.3`; STACK.md's empirically-verified `1.3.6` (range `^1.3.x`) is authoritative. No action — both are the stable v1 line; noted for accuracy.

## Sources

### Primary (HIGH confidence)
- **Xtimator codebase (read 2026-06-20)** — `lib/services/generate-estimate.ts` (shared channel-agnostic core), `lib/whatsapp/estimate-graph.ts` (raw `StateGraph`, no-checkpointer `compile()`, `Send` fan-out, never-throw nodes), `lib/whatsapp/ask-details.ts` (`isVagueEstimate`, `buildAskDetailsMessage`, `revertVagueEstimate`), `lib/inngest/functions/{whatsapp-process,generate-estimate,transcribe-audio,analyze-photos}.ts`, `lib/mcp/tools/write.ts`, `lib/whatsapp/{handler,intent-router,query-tools,agent}.ts`, `lib/inngest/events.ts`, `package.json` (`@langchain/langgraph@1.3.6`, `@langchain/core@1.1.48`, `inngest@4.4.0`, `@sentry/nextjs@10.x`, `langfuse@3.38.20`).
- **`.planning/debug/whatsapp-inbound-no-reply-recurrence.md`** — the documented silent-failure bug class + its defense-in-depth fix.
- **`.planning/PROJECT.md`** — v4.3 scope; the flagged "graph<->Inngest checkpoint granularity" + "preserve web's decoupled ingestion" decisions.
- **npm registry + installed `node_modules`** — `@langfuse/langchain@5.5.3` peer `@langchain/core >=0.3.8` + `@opentelemetry/api ^1.9.0`; `langfuse-langchain` peer `langchain >=0.0.157 <0.4.0` (the incompatibility); checkpoint packages confirmed transitive.
- **LangChain — Durable execution & Checkpointers (official docs)** — nodes after a checkpoint re-execute on replay; checkpointers required for fault-tolerance/HITL; `StateGraph` stable in v1, no breaking changes until 2.0.
- **Inngest docs — Steps / Idempotency / Errors & Retries** — function body replays on retry; only completed `step.run` results memoize.
- **Langfuse changelog "Langchain v1 Support" (2025-10-26)** — JS SDK >=4.3.0 (the `@langfuse/*` v5 line) required for LangChain v1.

### Secondary (MEDIUM confidence)
- **Diagrid — "Checkpoints Are Not Durable Execution"** — checkpointer != durable execution; do not stack two recovery models.
- **ZenML — "Make the workflow durable"** — InMemorySaver state cannot survive across pods/restarts (the "Pod B" problem).
- **dev.to — "Idempotency in Production LangGraph Agents"** — side-effectful nodes must be idempotent because replay re-fires LLM/API calls.
- **Evaluator-optimizer / reflection pattern (2026 sources)** + **MCP elicitation-vs-structured-status** — the named generate->evaluate->refine loop with hard iteration cap; why async MCP tools should return structured outcomes rather than pause.

### Tertiary (LOW confidence)
- Exact Next.js `instrumentation.ts` snippet for the Sentry+Langfuse shared provider — pattern is from official Langfuse "existing Sentry setup" guidance but the precise Next.js wiring needs verification during Phase 5.

---
*Research completed: 2026-06-20*
*Ready for roadmap: yes*
