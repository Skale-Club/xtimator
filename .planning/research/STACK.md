# Stack Research — Unified Agentic Estimate Engine (v4.3)

**Domain:** Shared LangGraph domain graph across 3 channels (web UI, MCP, WhatsApp), run as durable Inngest background jobs, with unified Langfuse observability.
**Researched:** 2026-06-20
**Confidence:** HIGH (versions verified against installed `node_modules` + npm registry + official docs)

> **Scope note.** This is a SUBSEQUENT milestone. The LangChain/LangGraph/Inngest stack is already installed and working in the WhatsApp channel. This document covers ONLY the *additions and config* the unification needs. The core generation pipeline (`generateEstimateForProject`) and the OpenRouter provider factory are already shared by all 3 channels — they are out of scope for new dependencies.

---

## TL;DR (decision summary)

1. **Checkpointer:** Add **nothing**. The graph runs inside a single Inngest `step.run()`, which already provides at-least-once durability + retries. A LangGraph checkpointer here would be **double-durability** with no benefit (`MemorySaver` is per-process — lost when the step replays). `MemorySaver`, `PostgresSaver`, `SqliteSaver` are all already transitively present via `@langchain/langgraph@1.3.6` — do not add or wire any of them. (See [§1](#1-inngest--langgraph-durability-the-central-decision).)
2. **Langfuse → LangGraph tracing:** The installed `langfuse@3.38.20` is the **old SDK line** and its companion `langfuse-langchain@3.x` is **incompatible** with this project's LangChain v1 (`@langchain/core@1.x`). Adopt the **v5 OTel-based SDK**: `@langfuse/langchain` + `@langfuse/otel` + `@langfuse/tracing` + `@opentelemetry/sdk-node`/`@opentelemetry/api`. Attach a `new CallbackHandler()` per `graph.invoke(input, { callbacks: [handler] })` in the shared engine. (See [§2](#2-langfuse--langgraph-tracing-the-real-work).)
3. **LangGraph/LangChain core:** **Stay on what's installed.** `@langchain/langgraph@^1.3.x` (resolves to 1.3.6) and `@langchain/core@^1.1.48` are the GA v1 line with a no-breaking-changes-until-2.0 commitment. `StateGraph` (what this codebase uses) is stable. No version bump warranted for this milestone. (See [§3](#3-langgraph-v1-api-stability).)
4. **Sentry conflict (must-flag):** `@sentry/nextjs@10.x` is already installed and **auto-initializes OpenTelemetry**. Langfuse's OTel SpanProcessor and Sentry's will collide on the global tracer provider unless you set `skipOpenTelemetrySetup: true` and register both on one shared provider. This is the single biggest integration risk. (See [Sentry coexistence](#sentry-coexistence-required).)

---

## Recommended Additions

### Core Technologies (NEW)

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@langfuse/langchain` | `^5.5.3` | `CallbackHandler` that turns LangChain/LangGraph callbacks into Langfuse spans (OTel). | The **only** Langfuse package that supports LangChain v1. Peer dep is `@langchain/core >=0.3.8` — directly satisfied by installed `@langchain/core@1.1.48`. Old `langfuse-langchain@3.x` peer-depends on the `langchain` meta-package `<0.4.0` (not installed, incompatible). |
| `@langfuse/otel` | `^5.5.3` | `LangfuseSpanProcessor` — exports OTel spans to Langfuse Cloud/self-hosted. | Langfuse v4/v5 is OTel-native; the SpanProcessor is the export path. Required for the CallbackHandler's spans to actually reach Langfuse. |
| `@langfuse/tracing` | `^5.5.3` | Core tracing primitives + `observe()` for non-LangChain spans. | Pulled in transitively by `@langfuse/langchain`, but list explicitly so manual spans (raw OpenRouter `fetch`, Whisper) share the same trace tree. |
| `@opentelemetry/sdk-node` | latest matching `@opentelemetry/api ^1.9` | The Node OTel SDK / `NodeSDK` (or `NodeTracerProvider`) that hosts the span processors. | Langfuse v5 requires a host OTel SDK. Partially present transitively via `@sentry/nextjs` — pin a top-level version to control the shared provider. |
| `@opentelemetry/api` | `^1.9.0` | OTel API surface (peer dep of every `@langfuse/*` and `@opentelemetry/*` package). | Peer dependency of `@langfuse/langchain` and `@langfuse/otel`. Make it a direct dep to avoid duplicate-version drift between Sentry's copy and Langfuse's. |

### Supporting Libraries (NEW, conditional)

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@opentelemetry/sdk-trace-node` | matching `@opentelemetry/api ^1.9` | `NodeTracerProvider` for the shared-provider coexistence pattern. | Only for the Sentry-coexistence `instrumentation.ts` (lets you attach both processors to one provider). |
| `@sentry/opentelemetry` | matches `@sentry/nextjs@10.x` | `SentrySpanProcessor` / `SentrySampler` / `SentryPropagator`. | **Only if** keeping Sentry AND putting it on the same OTel provider as Langfuse (the recommended coexistence path). Likely already transitively installed by `@sentry/nextjs`; pin top-level when building the shared provider. |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `instrumentation.ts` (Next.js built-in) | Register the OTel provider once at server boot. | Next.js 16 supports the `register()` hook at project root. This is where `LangfuseSpanProcessor` (and Sentry's, if coexisting) get wired — NOT inside the graph. |
| `after()` from `next/server` | Flush Langfuse spans after a request in serverless/short-lived contexts. | Needed for web + MCP API-route entrypoints. The Inngest worker flushes via `langfuseSpanProcessor.forceFlush()` at the end of the step. |

---

## Installation

```bash
# Langfuse v5 (OTel) LangChain integration — the only new runtime deps that matter
npm install @langfuse/langchain@^5.5.3 @langfuse/otel@^5.5.3 @langfuse/tracing@^5.5.3 \
            @opentelemetry/sdk-node @opentelemetry/api@^1.9.0

# Only for the Sentry-coexistence shared-provider pattern (likely already transitive):
npm install @opentelemetry/sdk-trace-node @sentry/opentelemetry
```

**Then retire the obsolete SDK once migration is verified:**
```bash
npm uninstall langfuse        # old v3 line — superseded by @langfuse/* v5 packages
```
> Keep `langfuse@3.38.20` only transiently while `lib/observability/langfuse.ts` (`getLangfuse()`) still has consumers; migrate those to `@langfuse/tracing` `observe()` / the new client, then drop it. **Do not run both SDK lines in parallel long-term** — two exporters, two trace formats, duplicated spans.

---

## 1. Inngest ↔ LangGraph durability (the central decision)

**Recommendation: rely entirely on Inngest `step.run()` durability. Add NO LangGraph checkpointer.**

### What's actually installed (verified)

`@langchain/langgraph@1.3.6` (the `^1.3.3` range resolves up to 1.3.6) already **bundles**, as transitive deps:
- `@langchain/langgraph-checkpoint@^1.0.4` (base `MemorySaver` lives here; re-exported from `@langchain/langgraph`)
- `@langchain/langgraph-checkpoint-postgres@1.0.2` (`PostgresSaver`)
- `@langchain/langgraph-checkpoint-sqlite@1.0.1` (`SqliteSaver`)

`MemorySaver` is importable today from `@langchain/langgraph` (verified: `typeof MemorySaver === 'function'`). **No install is required** to get any checkpointer — they're already in the tree.

### Why NOT to use a LangGraph checkpointer here

The graph runs as one atomic unit inside `step.run('orchestrate-estimate', …)` (`lib/inngest/functions/whatsapp-process.ts:80`). The durability model is already:

| Concern | Handled by | Notes |
|---------|-----------|-------|
| Crash mid-job | **Inngest** retries the whole `step.run` (`retries: 1`) | Step result is memoized once it returns successfully. |
| Idempotency | **Inngest** `idempotency: 'event.data.batchKey'` | De-dups duplicate webhook deliveries. |
| Last-resort failure reply | **Inngest** `onFailure` + in-graph `sendError` node | Two layers guarantee the owner always gets a reply. |

Adding a LangGraph checkpointer on top means **double-durability**:
- `MemorySaver` is **per-process, in-RAM** → when Inngest replays the step on a fresh invocation/worker, saved state is **gone**. It buys nothing and is misleading (looks durable, isn't).
- `PostgresSaver`/`SqliteSaver` would persist graph state to a DB, but that **duplicates** what Inngest's step memoization already does, adds a checkpoint table + migration to maintain, and creates a second source of truth for "where is this job." Net negative for this architecture.

### The real granularity question (for the roadmapper)

PROJECT.md flags "checkpoint granularity" as a central decision. Honest framing:

- **The graph is the unit of replay today** (whole graph in one step). If a node deep in the graph fails after expensive work (e.g. `generateEstimate` succeeds but `evaluateVagueness` throws), Inngest replays the **entire** graph — re-running transcription/photo-analysis/generation. That re-work is the only real cost.
- **The fix is NOT a LangGraph checkpointer.** It's **Inngest step decomposition**: split the expensive phases across multiple `step.run()` calls (e.g. ingest → generate → assess → reply), so each phase is independently memoized and replay resumes at the failed phase. The shared engine should let callers either (a) `invoke()` the graph whole inside one step (WhatsApp's current model) or (b) drive it phase-by-phase across steps (durable-resume model).
- **Web already decouples ingestion** via separate Inngest jobs (`transcribe-audio`/`analyze-photos`) before generation. Preserve that: the shared graph should treat ingestion as a pluggable edge node so web keeps its pre-transcribed inputs and skips in-graph media download (which only WhatsApp needs).

> **Bottom line for the stack:** no new checkpoint package. The "checkpointing" is Inngest steps. If finer resume is wanted, it's a *design* change (more `step.run` boundaries), not a *dependency* change.

---

## 2. Langfuse → LangGraph tracing (the real work)

**Recommendation: migrate to the Langfuse v5 OTel SDK and attach a `CallbackHandler` per `graph.invoke`.**

### Why a migration, not just "wire the existing langfuse"

The installed `langfuse@3.38.20` is the **pre-OTel v3 line**. Its LangChain companion is `langfuse-langchain` (NOT installed). Verified incompatibility:

- `langfuse-langchain@3.38.20` peer-depends on **`langchain >=0.0.157 <0.4.0`** — the `langchain` *meta-package*, which is **not installed** here (only scoped `@langchain/*` v1 packages are). It targets the LangChain v0 era and pulls legacy callback/schema modules removed in LangChain v1.
- Langfuse officially added **LangChain v1 support only in the JS SDK `>=4.3.0`** (changelog 2025-10-26), via the **rewritten OTel package `@langfuse/langchain`**.

So the compatible path for this codebase's `@langchain/core@1.1.48` is the v5 line:

```
@langfuse/langchain (CallbackHandler)  →  @langfuse/tracing  →  @langfuse/otel (LangfuseSpanProcessor)  →  OTel NodeSDK
```

Verified peer deps (npm registry): `@langfuse/langchain@5.5.3` → `@langchain/core >=0.3.8` ✅ and `@opentelemetry/api ^1.9.0` ✅.

### Setup (once, at boot) — `instrumentation.ts`

```ts
// instrumentation.ts (project root)
import { NodeSDK } from '@opentelemetry/sdk-node'
import { LangfuseSpanProcessor } from '@langfuse/otel'

export const langfuseSpanProcessor = new LangfuseSpanProcessor({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY!,
  secretKey: process.env.LANGFUSE_SECRET_KEY!,
  baseUrl: process.env.LANGFUSE_HOST ?? 'https://cloud.langfuse.com',
  environment: process.env.NODE_ENV,
})

export async function register() {
  const sdk = new NodeSDK({ spanProcessors: [langfuseSpanProcessor] })
  sdk.start()
}
```
> **If Sentry stays**, this `register()` must instead build a **single shared provider** with both processors — see [Sentry coexistence](#sentry-coexistence-required).

### Attach per `graph.invoke` (in the shared engine — applies to ALL 3 channels)

```ts
import { CallbackHandler } from '@langfuse/langchain'

// inside the shared engine, wherever graph.invoke is called:
const langfuseHandler = new CallbackHandler() // binds to the active OTel span
const result = await graph.invoke(input, {
  callbacks: [langfuseHandler],
  // unify + distinguish channels via metadata, not separate handlers:
  metadata: {
    langfuseSessionId: `${channel}:${projectId}`, // web | mcp | whatsapp
    langfuseUserId: companyId,
    langfuseTags: [channel, 'estimate-engine'],
  },
})
```

Because all 3 channels call the **same shared engine** that runs `graph.invoke`, attaching the handler **once inside the engine** is what gives unified traces "for free." Distinguish channels via `metadata`/`tags`, not via separate wiring. The handler captures every node, LLM call (incl. OpenRouter calls made through `@langchain/*` adapters), and tool execution as nested spans automatically.

### Flush (serverless vs worker)

- **Inngest worker** (WhatsApp + the migrated web/MCP generation jobs): call `await langfuseSpanProcessor.forceFlush()` at the end of the step (and in `onFailure`) so spans aren't lost when the function returns.
- **Direct API routes** (if a channel invokes outside Inngest): use `after(() => langfuseSpanProcessor.forceFlush())` from `next/server`.

### Caveat (MEDIUM confidence)

Spans from the OpenRouter client (`lib/ai/openrouter-client.ts`) are auto-captured **only if** those calls go through a `@langchain/*` model class (e.g. `@langchain/openai` / `@langchain/anthropic`). Raw `fetch`-based OpenRouter calls won't appear under the graph trace unless wrapped with `@langfuse/tracing`'s `observe()` or made as child OTel spans. Confirm during extraction which path the OpenRouter client takes; if raw `fetch`, add `observe()` wrappers so token/cost data lands in the trace.

---

## 3. LangGraph v1 API stability

**Recommendation: keep `@langchain/langgraph@^1.3.x` and `@langchain/core@^1.1.48`. No bump needed. Standardize on `StateGraph`.**

| Check | Finding | Confidence |
|-------|---------|------------|
| Is v1 stable? | LangGraph 1.0 is GA with an explicit **no-breaking-changes-until-2.0** commitment. Core primitives (state, nodes, edges) are frozen. | HIGH |
| Is `StateGraph` stable? | Yes — the core primitive this codebase already uses (`lib/whatsapp/estimate-graph.ts`). `Annotation.Root`, `Send`, `addConditionalEdges` all stable in v1. | HIGH |
| Bump warranted? | No. Installed `1.3.6` is current-enough v1 (latest is `1.4.4`); both are within the stable v1 line. A bump to `^1.4` is **optional housekeeping**, not required — keep it a separate chore. | HIGH |
| `createReactAgent` / prebuilt? | **Not used by this project** — the codebase uses raw `StateGraph`. In JS v1, `createReactAgent` is still exported from `@langchain/langgraph/prebuilt` (verified locally: `typeof createReactAgent === 'function'`), but the forward path is `createAgent` from the `langchain` meta-package. Since the unified engine extracts a hand-built `StateGraph`, **do not introduce `createReactAgent`/prebuilt** — needless rewrite. | HIGH |

> **Do not** standardize on `createReactAgent`/`createAgent`. The estimate flow is a deterministic domain pipeline (ingest → generate → assess → refine/ask → finalize), not a tool-calling ReAct loop. `StateGraph` is the correct, already-proven primitive.

---

## Sentry coexistence (REQUIRED)

`@sentry/nextjs@^10.56.0` is installed and **auto-initializes OpenTelemetry**. Langfuse v5 is OTel-native. If both register processors on the global tracer provider independently, spans collide / one silently wins.

**Pattern (official Langfuse guidance — verified):** disable Sentry's auto-OTel and register both on one shared provider.

```ts
// instrumentation.ts (project root) — Langfuse + Sentry coexistence
import * as Sentry from '@sentry/nextjs'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { LangfuseSpanProcessor } from '@langfuse/otel'
import { SentrySpanProcessor, SentryPropagator, SentrySampler } from '@sentry/opentelemetry'

export async function register() {
  const sentryClient = Sentry.init({
    dsn: process.env.SENTRY_DSN,
    skipOpenTelemetrySetup: true, // <-- critical: stop Sentry grabbing the global provider
    tracesSampleRate: 1.0,
  })

  const provider = new NodeTracerProvider({
    sampler: sentryClient ? new SentrySampler(sentryClient) : undefined,
    spanProcessors: [new LangfuseSpanProcessor(/* keys */), new SentrySpanProcessor()],
  })
  provider.register({
    propagator: new SentryPropagator(),
    contextManager: new Sentry.SentryContextManager(),
  })
}
```

> **Flag for the phase planner:** the project now has TWO Next.js OTel consumers (Sentry + Langfuse). Whoever wires Langfuse MUST touch the existing Sentry init. Treat this as its own task with explicit verification that Sentry traces still arrive *and* Langfuse traces appear. Watch for `@opentelemetry/api` version skew between Sentry's bundled copy and Langfuse's peer (`^1.9.0`) — pin one top-level version.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Inngest `step.run` durability (no checkpointer) | `PostgresSaver` checkpointer | Only if you abandon Inngest as the runner and need LangGraph to own durable resume + human-in-the-loop *interrupts* across long pauses. Not the case here — Inngest is staying. |
| `@langfuse/langchain` v5 (OTel) | `langfuse-langchain` v3 (callback-direct) | Only on a LangChain **v0** codebase (`langchain <0.4`). Incompatible with this project's `@langchain/core@1.x`. |
| Langfuse `CallbackHandler` auto-tracing | Manual `@langfuse/tracing` `observe()` everywhere | Use `observe()` **in addition**, to capture non-LangChain spans (raw OpenRouter `fetch`, Whisper). Not a replacement for the callback handler. |
| Keep `StateGraph` | `createReactAgent` / `createAgent` | Only for open-ended tool-calling agents. The estimate pipeline is deterministic; ReAct adds nondeterminism + cost for no gain. |
| Keep `@langchain/langgraph@1.3.6` | Bump to `1.4.4` | Optional housekeeping; do as a separate chore, not in this milestone. Both are stable v1. |

---

## What NOT to Use / Add

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `@langchain/langgraph-checkpoint` (as a direct dep) | Already transitive; adding it top-level implies a checkpointer you don't need. | Inngest `step.run` memoization. |
| `@langchain/langgraph-checkpoint-postgres` / `-sqlite` | Double-durability with Inngest; adds a checkpoint table + migration + second source of truth. | Inngest step decomposition for finer resume. |
| `MemorySaver` wired into the compiled graph | Per-process RAM — lost on Inngest replay; gives false sense of durability. | Don't pass a checkpointer to `.compile()`. |
| `langfuse-langchain` (v3 line) | Peer-depends on `langchain <0.4` meta-package (not installed); breaks on LangChain v1. | `@langfuse/langchain@^5`. |
| Running `langfuse@3` AND `@langfuse/*@5` in parallel long-term | Two exporters, two trace schemas → duplicated/split traces. | Migrate `getLangfuse()` call sites to v5, then `npm uninstall langfuse`. |
| `createReactAgent` / `createAgent` for the estimate flow | Turns a deterministic domain pipeline into a nondeterministic tool-loop. | Existing `StateGraph`. |
| A bespoke "tracing middleware" around `graph.invoke` | Reinvents what `CallbackHandler` + OTel context propagation already do. | `@langfuse/langchain` `CallbackHandler` in the shared engine. |
| Letting Sentry auto-init OTel while adding Langfuse | Global-provider collision; one exporter silently wins. | `skipOpenTelemetrySetup: true` + shared `NodeTracerProvider`. |
| A new orchestration lib (Temporal, BullMQ, Trigger.dev) | Inngest already owns durable jobs and is wired across all entrypoints. | Inngest. |

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@langfuse/langchain@5.5.3` | `@langchain/core >=0.3.8` (installed: `1.1.48`) ✅ | Peer dep satisfied. This is the gate that rules out the v3 line. |
| `@langfuse/langchain@5.5.3` | `@opentelemetry/api ^1.9.0` | Must match the OTel API version Sentry also uses — pin top-level. |
| `@langchain/langgraph@1.3.6` | `@langchain/core ^1.1.48` ✅ | Both v1 GA; bundles checkpoint packages transitively. |
| `@langfuse/otel@5.5.3` | `@opentelemetry/sdk-node` / `NodeTracerProvider` | LangfuseSpanProcessor must be on the *same* provider as Sentry's processor. |
| `@sentry/nextjs@10.56.0` | `@opentelemetry/*` | Auto-inits OTel unless `skipOpenTelemetrySetup: true`. Direct conflict surface with Langfuse. |
| `langfuse@3.38.20` (current) | `@langchain/core@1.x` ❌ via `langfuse-langchain` | The reason a migration (not just "wiring") is required. |

---

## Open Questions (for roadmapper / phase planners)

1. **Step granularity vs whole-graph invoke.** Should the shared engine expose `invoke()` (whole graph in one Inngest step — WhatsApp's model) *and* a phase-driver (one `step.run` per node-group — durable resume)? Design decision, not a dependency one, but it shapes the engine's public API. (No new package either way.)
2. **OpenRouter span coverage.** Does `lib/ai/openrouter-client.ts` call through `@langchain/openai`/`@langchain/anthropic` (auto-traced) or raw `fetch` (needs `observe()`)? Determines whether token/cost data appears in Langfuse without extra wrapping. (MEDIUM confidence — needs code confirmation during extraction.)
3. **Sentry init ownership.** Where is `Sentry.init` currently called (`sentry.server.config.ts` / `instrumentation.ts`)? The Langfuse wiring must modify that exact spot to add `skipOpenTelemetrySetup: true` and the shared provider. Identify the file before planning the observability phase.
4. **Self-hosted vs Langfuse Cloud.** `LANGFUSE_HOST` default is cloud. If self-hosting (consistent with the deploy-via-CI/GHCR memory + Hetzner direction), confirm the OTLP endpoint + keys are set as env vars — never committed (per CLAUDE.md secret policy).
5. **Drop `langfuse@3`?** Confirm `lib/observability/langfuse.ts` (`getLangfuse()`) has no remaining consumers outside the graph path before uninstalling, or migrate them to `@langfuse/tracing` first.

---

## Sources

- Installed `node_modules` inspection — `@langchain/langgraph@1.3.6` bundles `@langchain/langgraph-checkpoint@^1.0.4`, `-postgres@1.0.2`, `-sqlite@1.0.1`; `MemorySaver` + `createReactAgent` exports verified via `node -e` (HIGH).
- npm registry `@langfuse/langchain/latest` → v5.5.3, peer `@langchain/core >=0.3.8` + `@opentelemetry/api ^1.9.0` (HIGH).
- npm registry `@langfuse/tracing/latest`, `@langchain/langgraph/latest` (`@langchain/langgraph@1.4.4` latest) — version + dep verification (HIGH).
- npm registry `langfuse-langchain/latest` → peer `langchain >=0.0.157 <0.4.0` (the incompatibility) (HIGH).
- Langfuse changelog "Langchain v1 Support" (2025-10-26) — JS SDK `>=4.3.0` required for LangChain v1 (HIGH).
- Langfuse docs: TypeScript SDK setup, LangChain integration cookbook (JS/TS), "existing OTel setup" / "existing Sentry setup" FAQs — `LangfuseSpanProcessor`, `CallbackHandler` attach pattern, `skipOpenTelemetrySetup` shared-provider pattern (HIGH / MEDIUM on exact Next.js snippet).
- LangChain blog + changelog "LangGraph 1.0 GA" + LangChain JS v1 migration guide — no breaking changes until 2.0; `StateGraph` stable; JS `createReactAgent` still in `@langchain/langgraph/prebuilt`, forward path `createAgent` from `langchain` (HIGH).
- Project files: `lib/whatsapp/estimate-graph.ts` (raw StateGraph), `lib/inngest/functions/whatsapp-process.ts` (graph in one `step.run`), `lib/observability/langfuse.ts` (old v3 client), `lib/services/generate-estimate.ts` (shared core), `package.json` (installed versions) (HIGH).

---
*Stack research for: Unified Agentic Estimate Engine (v4.3)*
*Researched: 2026-06-20*
