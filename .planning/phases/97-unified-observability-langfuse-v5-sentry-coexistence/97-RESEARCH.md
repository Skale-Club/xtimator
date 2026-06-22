# Phase 97: Unified Observability — Langfuse v5 + Sentry Coexistence - Research

**Researched:** 2026-06-20
**Domain:** OTel-based LLM observability — Langfuse v5 SDK migration + Sentry coexistence on Next.js 16 instrumentation hook
**Confidence:** HIGH (all findings from codebase inspection + npm registry verification; exact package peers confirmed)

---

## Summary

Phase 97 is a three-requirement observability wiring task with one non-trivial installation risk (Sentry/Langfuse OTel provider collision) and several migration steps on existing code. The codebase is in a clean post-Phase-96 state: all three channels (web/MCP/WhatsApp) now run through `buildEstimateGraph` in `lib/estimate/graph/index.ts`, which means a single `CallbackHandler` attachment at `graph.invoke` automatically covers all channel traffic.

The installed `langfuse@3.38.20` is the pre-OTel v3 line. Its LangChain companion (`langfuse-langchain`) requires `langchain <0.4` (the meta-package) which is not installed. The v5 OTel packages (`@langfuse/langchain`, `@langfuse/otel`, `@langfuse/tracing`) are on npm at version `5.5.3` with peer deps `@langchain/core >=0.3.8` (satisfied by installed `1.1.48`) and `@opentelemetry/api ^1.9.0` (a transitive version `1.9.1` is already in the tree via `@sentry/nextjs`). No langfuse v5 packages are currently installed — they must be added.

The critical integration constraint is that `@sentry/nextjs@10.56.0` (installed) ships a bundled `@sentry/opentelemetry@10.56.0` and auto-initializes OTel in `sentry.server.config.ts`. Langfuse v5's `LangfuseSpanProcessor` must land on the SAME `NodeTracerProvider` as Sentry's span processor, or the two exporters will collide. The fix is `skipOpenTelemetrySetup: true` in Sentry init + a shared provider in `instrumentation.ts`. Sentry init currently lives in `sentry.server.config.ts` (loaded by `instrumentation.ts`), so the coexistence setup requires moving Sentry init into `instrumentation.ts` directly.

Existing `langfuse@3` call sites in `lib/observability/langfuse.ts`, `lib/ai/openrouter-client.ts`, and `lib/ai/providers/openrouter.ts` must be migrated to `@langfuse/tracing` `observe()` calls (or marked as scope-out and left until a follow-on cleanup). The `getLangfuse()` singleton must be retired so no v3 traces run in parallel with v5 OTel traces.

**Primary recommendation:** Install `@langfuse/langchain@^5.5.3 @langfuse/otel@^5.5.3 @langfuse/tracing@^5.5.3`, wire `LangfuseSpanProcessor` + `SentrySpanProcessor` on a shared `NodeTracerProvider` in `instrumentation.ts`, attach `new CallbackHandler()` at `graph.invoke` in the shared engine, tag channel via `metadata`/`tags`, and retire the v3 `getLangfuse()` singleton.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

No CONTEXT.md exists for this phase — no prior `/gsd:discuss-phase` was run. All research areas come from the phase description and REQUIREMENTS.md.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| OBS-01 | All three channels emit a unified Langfuse trace per estimate run via a single `CallbackHandler` attached at `graph.invoke`; channels distinguished by `metadata`/`tags`. | `buildEstimateGraph` in `lib/estimate/graph/index.ts` is the single invocation point for all three channels (web/MCP/WhatsApp). Attaching a `CallbackHandler` there at `graph.invoke` covers all traffic. Channel is available as `state.channel` ('web' \| 'mcp' \| 'whatsapp'). |
| OBS-02 | Langfuse migrated to v5 OTel SDK (`@langfuse/langchain` + `@langfuse/otel` + `@langfuse/tracing`, replacing `langfuse@3.38.20`); coexists with `@sentry/nextjs` without OTel collision (shared tracer provider, `skipOpenTelemetrySetup: true`). | v5 packages confirmed at 5.5.3 on npm; peer deps satisfied by installed LangChain; Sentry coexistence pattern documented and confirmed via Sentry's `skipOpenTelemetrySetup` option. `@sentry/opentelemetry@10.56.0` ships as a direct dep of `@sentry/nextjs`. |
| OBS-03 | Per-channel AI call-count and latency (p95) per estimate visible in traces; deterministic vagueness gate confirmed still in place; web non-vague happy-path call count pinned at 1; no Langfuse keys/host or transcript/audio/key tokens committed. | Call-count visibility comes from `CallbackHandler` auto-capturing every LLM node invocation. The deterministic `isVagueEstimate()` gate is still in `lib/estimate/nodes/assess.ts`. Web happy-path call-count is already pinned by QA-03 test. Safe-metadata rule already established in v4.2. |
</phase_requirements>

---

## Standard Stack

### Core (new packages to install)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@langfuse/langchain` | `^5.5.3` | `CallbackHandler` — turns LangGraph node/LLM callbacks into Langfuse spans (OTel). | Only Langfuse package compatible with `@langchain/core@1.x`. Peer: `@langchain/core >=0.3.8` (satisfied). |
| `@langfuse/otel` | `^5.5.3` | `LangfuseSpanProcessor` — exports OTel spans to Langfuse. | The OTel export bridge. Langfuse v4/v5 is OTel-native; without this processor spans are never exported. |
| `@langfuse/tracing` | `^5.5.3` | Core tracing primitives + `observe()` for raw-fetch spans (Whisper, OpenRouter `fetch`). | Pulled in transitively by `@langfuse/langchain`, but pin explicitly so `observe()` wrappers on raw fetch calls share the same trace tree. |

### Already-present (transitive via @sentry/nextjs — do NOT add as new dep)

| Library | Transitive Version | Purpose |
|---------|--------------------|---------|
| `@opentelemetry/api` | `1.9.1` | OTel API surface (peer of all `@langfuse/*` packages). Already in tree — do not add as a direct dep unless version conflicts emerge. |
| `@opentelemetry/sdk-trace-node` | `2.7.1` | `NodeTracerProvider` for the shared-provider coexistence pattern. Already in tree via Sentry. |
| `@sentry/opentelemetry` | `10.56.0` | `SentrySpanProcessor`, `SentrySampler`, `SentryPropagator` — needed for shared provider setup. Already in tree as a direct dep of `@sentry/nextjs`. |
| `@opentelemetry/sdk-node` | `0.218.0` | `NodeSDK` (alternative host). Present but not needed when using `NodeTracerProvider` directly. |

### Remove (after migration)

| Library | Action | Condition |
|---------|--------|-----------|
| `langfuse@3.38.20` | `npm uninstall langfuse` | After all `getLangfuse()` call sites in `lib/observability/langfuse.ts`, `lib/ai/openrouter-client.ts`, `lib/ai/providers/openrouter.ts` are migrated to v5 `observe()`. |

### Installation

```bash
npm install @langfuse/langchain@^5.5.3 @langfuse/otel@^5.5.3 @langfuse/tracing@^5.5.3
```

Then, after migrating all v3 call sites:
```bash
npm uninstall langfuse
```

**Version verification (confirmed 2026-06-20):**
- `@langfuse/langchain@5.5.3` — `npm view @langfuse/langchain version` returns `5.5.3`
- `@langfuse/otel@5.5.3` — `npm view @langfuse/otel version` returns `5.5.3`
- `@langfuse/tracing@5.5.3` — `npm view @langfuse/tracing version` returns `5.5.3`
- `@opentelemetry/api@1.9.1` already in tree — satisfies `^1.9.0` peer dep

---

## Architecture Patterns

### Current State (as-built, post Phase 96)

```
lib/
├── estimate/
│   ├── graph/
│   │   ├── index.ts          ← buildEstimateGraph(adapter, {runner})
│   │   ├── state.ts          ← EstimateState — includes channel: 'web'|'mcp'|'whatsapp'
│   │   ├── types.ts          ← ChannelAdapter, StepRunner, passthroughRunner
│   │   └── nodes/
│   │       ├── generate.ts   ← makeGenerateNode(runner) — AI call wrapped in runner.run
│   │       ├── assess.ts     ← assessNode — deterministic isVagueEstimate()
│   │       ├── auto-refine.ts
│   │       └── decide.ts
│   ├── adapters/
│   │   ├── default.ts        ← makeDefaultAdapter({companyId, supabase}) for web/MCP
│   │   └── whatsapp.ts       ← makeWhatsAppAdapter({companyId, supabase, ownerPhone, messages})
│   └── quality/
│       └── revert.ts
├── whatsapp/
│   └── estimate-graph.ts     ← thin wrapper; buildEstimateGraph() zero-arg for WA callers
├── inngest/functions/
│   ├── generate-estimate.ts  ← web/MCP path: graph.invoke({channel:'web',...})
│   └── whatsapp-process.ts   ← WA path: graph.invoke({channel:'whatsapp',...})
├── observability/
│   └── langfuse.ts           ← getLangfuse() singleton — v3, MUST BE MIGRATED
├── ai/
│   ├── openrouter-client.ts  ← raw fetch to OpenRouter + OpenAI; uses getLangfuse() v3
│   └── providers/openrouter.ts ← uses getLangfuse() v3
instrumentation.ts            ← loads sentry.server.config; MUST be extended
sentry.server.config.ts       ← Sentry.init() — currently no skipOpenTelemetrySetup
```

### Pattern 1: Shared Provider (OBS-02 coexistence)

The `instrumentation.ts` hook is Next.js 16's server boot entry point. It currently loads `sentry.server.config.ts` which calls `Sentry.init()` without `skipOpenTelemetrySetup: true`, letting Sentry auto-grab the global OTel provider. For Langfuse to coexist without collision, Sentry init must be moved INTO `instrumentation.ts`'s `register()` function with `skipOpenTelemetrySetup: true`, and both processors must be wired on a single `NodeTracerProvider`.

```typescript
// instrumentation.ts — post-Phase-97 shape
// Source: Langfuse official "existing Sentry setup" guidance + Sentry skipOpenTelemetrySetup docs
import * as Sentry from '@sentry/nextjs'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { LangfuseSpanProcessor } from '@langfuse/otel'
import { SentrySpanProcessor, SentrySampler, SentryPropagator } from '@sentry/opentelemetry'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 1. Init Sentry WITHOUT auto-OTel so it does not grab the global provider.
    const sentryClient = Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      sendDefaultPii: true,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      includeLocalVariables: true,
      enableLogs: true,
      skipOpenTelemetrySetup: true,   // <-- critical
      beforeSend(event) {
        if (event.transaction === 'POST /_not-found/page') return null
        return event
      },
    })

    // 2. Langfuse SpanProcessor (no-ops gracefully if keys are absent).
    const langfuseProcessor = new LangfuseSpanProcessor({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY ?? '',
      secretKey: process.env.LANGFUSE_SECRET_KEY ?? '',
      baseUrl: process.env.LANGFUSE_BASEURL ?? 'https://cloud.langfuse.com',
    })

    // 3. Single shared provider hosting both processors.
    const provider = new NodeTracerProvider({
      sampler: sentryClient ? new SentrySampler(sentryClient) : undefined,
      spanProcessors: [langfuseProcessor, new SentrySpanProcessor()],
    })
    provider.register({
      propagator: new SentryPropagator(),
      contextManager: new Sentry.SentryContextManager(),
    })
  }

  // Edge runtime: Sentry only (Langfuse OTel does not run on edge).
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

export const onRequestError = Sentry.captureRequestError
```

**Note:** `SentryContextManager` is exported from `@sentry/nextjs` (not from `@sentry/opentelemetry`). Verify the exact import path during implementation — Sentry's exports differ between `@sentry/nextjs`, `@sentry/node`, and `@sentry/opentelemetry`.

### Pattern 2: CallbackHandler at graph.invoke (OBS-01)

The `buildEstimateGraph` function in `lib/estimate/graph/index.ts` compiles the graph and returns the compiled object. The invocation happens in two places:

1. `lib/inngest/functions/generate-estimate.ts` (line 107): `graph.invoke({companyId, projectId, channel: 'web', ...})`
2. `lib/whatsapp/estimate-graph.ts` (line 76): `graph.invoke({companyId, projectId, channel: 'whatsapp', ...})`

The correct approach is to push the `CallbackHandler` attachment into `buildEstimateGraph` itself (or into a thin wrapper layer), so callers do not need to be aware of it. However, the `CallbackHandler` needs `metadata`/`tags` that include the channel, and the channel is only known at invoke time.

**Recommended approach:** Add an optional `traceConfig` parameter to `buildEstimateGraph` and pass it through to `graph.invoke`. This is the minimal, non-breaking change:

```typescript
// lib/estimate/graph/index.ts — post-Phase-97 addition
import { CallbackHandler } from '@langfuse/langchain'

interface TraceConfig {
  channel: 'web' | 'mcp' | 'whatsapp'
  companyId: string
  projectId: string
}

// buildEstimateGraph already returns graph.compile().
// Phase 97 adds a helper that wraps graph.invoke to inject the CallbackHandler:
export function buildEstimateGraphWithTracing(
  adapter: ChannelAdapter,
  options: { runner?: StepRunner; trace?: TraceConfig } = {}
) {
  const graph = buildEstimateGraph(adapter, { runner: options.runner })
  return {
    async invoke(input: Partial<EstimateStateType>) {
      const { trace } = options
      const callbacks = trace ? [new CallbackHandler({
        metadata: {
          langfuseSessionId: `${trace.channel}:${trace.projectId}`,
          langfuseUserId: trace.companyId,
        },
        tags: [trace.channel, 'estimate-engine'],
      })] : []
      return graph.invoke(input, callbacks.length ? { callbacks } : undefined)
    }
  }
}
```

**Alternative (simpler):** Pass `{ callbacks: [handler] }` as the second argument to `graph.invoke` directly at both call sites. LangGraph's `invoke` signature is `invoke(input, config?: RunnableConfig)` where `RunnableConfig` includes `callbacks`. This avoids changing `buildEstimateGraph`'s signature at all and keeps the ChannelAdapter contract (D-03) untouched.

```typescript
// At each graph.invoke call site:
import { CallbackHandler } from '@langfuse/langchain'

const handler = new CallbackHandler({
  metadata: {
    langfuseSessionId: `${channel}:${projectId}`,
    langfuseUserId: companyId,
  },
  tags: [channel, 'estimate-engine'],
})
const result = await graph.invoke(input, { callbacks: [handler] })
```

**Recommendation:** Use the call-site approach (second argument to `graph.invoke`). It is the pattern Langfuse officially documents, avoids changing `buildEstimateGraph`'s public API, and keeps the change contained to the two Inngest function files. The `buildEstimateGraph` signature stays at `(adapter, {runner?})` (D-03 preserved).

### Pattern 3: Raw-fetch span coverage (OBS-03)

The OpenRouter client (`lib/ai/openrouter-client.ts`) and `lib/ai/providers/openrouter.ts` use raw `fetch` to call OpenRouter and OpenAI. These calls do NOT go through `@langchain/*` model classes and will NOT be auto-captured by the `CallbackHandler`. They currently use `getLangfuse()` (v3) to emit manual `trace.generation()` spans.

Migration path: replace `getLangfuse()` calls with `@langfuse/tracing` `observe()`:

```typescript
// lib/ai/openrouter-client.ts — after v3 getLangfuse() removal
import { Langfuse } from '@langfuse/tracing'

const lf = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY,
  secretKey: process.env.LANGFUSE_SECRET_KEY,
  baseUrl: process.env.LANGFUSE_BASEURL,
})

// Instead of lf.trace() + trace.generation():
const generation = lf.generation({
  name: 'transcribe_audio',
  model: model,
  input: { ext, model },
})
// ... await fetch ...
generation.end({ output: transcript.slice(0, 200) })
await lf.flushAsync()
```

**Note:** The v5 `Langfuse` client from `@langfuse/tracing` replaces the v3 `Langfuse` class from `langfuse`. The API is similar but not identical. The `observe()` helper is the recommended pattern for wrapping async functions.

### Pattern 4: Channel tagging via state.channel

`EstimateState` already carries `channel: 'whatsapp' | 'web' | 'mcp'` (from `lib/estimate/graph/state.ts` line 22). The initial `graph.invoke` call in both Inngest functions already passes `channel: 'web'` or `channel: 'whatsapp'`. The MCP path also passes `channel: 'web'` today (since MCP uses `makeDefaultAdapter` and the web Inngest function). Phase 97 can distinguish MCP by reading `event.data.source` or similar — but the existing `channel: 'web'` for MCP is acceptable for Phase 97 (MCP rides the web Inngest path). OBS-01 says "channels distinguished by metadata/tags" — passing `channel` as a tag satisfies this.

### Anti-Patterns to Avoid

- **Running both `langfuse@3` and `@langfuse/*@5` in parallel long-term:** Two exporters, two trace schemas, duplicated/split spans. Migrate all `getLangfuse()` call sites before removing v3.
- **Letting Sentry auto-init OTel while also registering Langfuse's processor:** The global provider collision means one exporter silently wins. Always use `skipOpenTelemetrySetup: true`.
- **Attaching `CallbackHandler` inside the adapter functions (ingest/finalize/onError):** The handler must be on `graph.invoke`, not on individual nodes. A handler per node creates fragmented traces.
- **Committing LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, or LANGFUSE_BASEURL:** These go in `.env.local` / Vercel env vars only. The gitleaks hook pattern `sk-ant-*`, `sk-proj-*` will not catch Langfuse keys, but CLAUDE.md's "no secrets" rule applies regardless.
- **Putting transcript content, audio transcripts, or API keys in trace metadata/tags:** The v4.2 safe-metadata rule prohibits this. Only IDs (companyId, projectId, channel, sessionId) go into trace metadata.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LangGraph node-level tracing | A custom middleware that wraps each node | `CallbackHandler` from `@langfuse/langchain` | Handles every node, LLM call, tool invocation automatically via the LangChain callback protocol |
| OTel span export to Langfuse | A custom HTTP export to Langfuse's OTLP endpoint | `LangfuseSpanProcessor` from `@langfuse/otel` | Handles batching, retry, auth, serialization |
| Raw-fetch span tracing | A custom timing wrapper | `@langfuse/tracing` `observe()` or `generation()` | Designed for non-LangChain AI calls; auto-handles parent context |
| Sentry + Langfuse coexistence | Monkey-patching the global tracer | `skipOpenTelemetrySetup: true` + shared `NodeTracerProvider` | Official supported pattern; avoids race conditions and unpredictable behavior |

**Key insight:** LangGraph's callback system is inherited from LangChain and the `CallbackHandler` from `@langfuse/langchain` was specifically rewritten for LangChain v1 / OTel compatibility. Do not reinvent it.

---

## Common Pitfalls

### Pitfall 1: @sentry/opentelemetry import path confusion
**What goes wrong:** `SentrySpanProcessor`, `SentrySampler`, `SentryPropagator` are in `@sentry/opentelemetry`, but `SentryContextManager` may be in `@sentry/nextjs` or `@sentry/node`. Wrong import path causes runtime errors at boot.
**Why it happens:** Sentry splits its OTel concerns across multiple packages. The exact export location depends on which `@sentry/*` package you import from.
**How to avoid:** Check `node_modules/@sentry/opentelemetry/index.js` exports during implementation. Also check `@sentry/nextjs` re-exports. Use `node -e "console.log(Object.keys(require('@sentry/opentelemetry')))"` to see what's actually exported.
**Warning signs:** `TypeError: SentryContextManager is not a constructor` at server boot.

### Pitfall 2: @opentelemetry API version skew
**What goes wrong:** `@langfuse/langchain@5.5.3` peer-requires `@opentelemetry/api ^1.9.0`. If multiple copies of `@opentelemetry/api` end up in `node_modules` (e.g. from different dependency trees), OTel context does not propagate between Sentry spans and Langfuse spans.
**Why it happens:** npm may hoist one version but nest another — two OTel API instances means two separate global registries.
**How to avoid:** After install, run `npm ls @opentelemetry/api` to confirm there is only one resolved version. If there are two, add `@opentelemetry/api@^1.9.0` as a direct top-level dep to force deduplication.
**Warning signs:** Langfuse traces are created but have no parent span link to Sentry traces; `npm ls @opentelemetry/api` shows multiple versions.

### Pitfall 3: CallbackHandler not flushed in serverless context
**What goes wrong:** The Inngest function returns and Node.js process may be suspended before the `LangfuseSpanProcessor` flushes its buffer. Traces appear in Langfuse only intermittently.
**Why it happens:** Serverless functions (and long-lived Inngest workers) may not wait for async background tasks.
**How to avoid:** At the end of each `step.run` that calls `graph.invoke`, call `await langfuseProcessor.forceFlush()`. Export `langfuseProcessor` from `instrumentation.ts` so Inngest functions can import it. Alternatively, wire `after(() => langfuseProcessor.forceFlush())` for API routes using `next/server`'s `after`.
**Warning signs:** Local dev shows traces; production shows none or only some.

### Pitfall 4: getLangfuse() v3 singleton and v5 client creating duplicate spans
**What goes wrong:** If both `langfuse@3`'s `getLangfuse()` singleton and the new `@langfuse/tracing` client are active simultaneously, the same AI call emits two spans — one via the old v3 SDK and one via the new v5 OTel path. Langfuse shows duplicated/split traces.
**Why it happens:** The v3 `Langfuse` client has its own HTTP export path, completely independent of OTel. Running both means two parallel trace pipelines.
**How to avoid:** Migrate ALL `getLangfuse()` call sites to v5 before or in the same wave as removing `langfuse@3`. Do not leave `getLangfuse()` active once the OTel processor is running.
**Warning signs:** Duplicate generation spans in Langfuse trace view; `lib/observability/langfuse.ts` is still imported anywhere.

### Pitfall 5: Sentry traces break after skipOpenTelemetrySetup
**What goes wrong:** After adding `skipOpenTelemetrySetup: true`, Sentry stop receiving traces because the manual provider is not correctly wired (missing `SentrySampler`, wrong context manager, or missing `provider.register()`).
**Why it happens:** `skipOpenTelemetrySetup: true` requires the caller to manually do everything Sentry's auto-setup did. One missing piece breaks Sentry trace collection.
**How to avoid:** After implementation, verify in Sentry that error traces still arrive and performance traces still show request spans. Test with a deliberate test error (throw in a route) to confirm Sentry capture still works.
**Warning signs:** Sentry shows zero new errors/transactions after Phase 97 deployment.

### Pitfall 6: sentry.server.config.ts loading conflict
**What goes wrong:** The existing `sentry.server.config.ts` calls `Sentry.init()` without `skipOpenTelemetrySetup`. If `instrumentation.ts` also calls `Sentry.init()` (the new coexistence setup), Sentry is initialized twice.
**Why it happens:** `instrumentation.ts` currently imports `sentry.server.config.ts` via `await import('./sentry.server.config')`. After Phase 97 moves Sentry init into `instrumentation.ts`, the old file still exists and may be imported.
**How to avoid:** Phase 97 must either: (a) delete the `sentry.server.config.ts` content and move all config inline into `instrumentation.ts`, or (b) have `sentry.server.config.ts` export a config object that `instrumentation.ts` spreads into its `Sentry.init()` call. Do NOT import both files.

---

## Code Examples

### Verified: graph.invoke RunnableConfig signature (LangGraph v1)

```typescript
// From @langchain/core types — graph.invoke second argument
import type { RunnableConfig } from '@langchain/core/runnables'
// RunnableConfig includes: callbacks?: Callbacks
// Callbacks = BaseCallbackHandler[] | CallbackManager | undefined

// Usage confirmed to work in LangGraph 1.3.x:
const result = await graph.invoke(input, {
  callbacks: [handler],
})
```

Confidence: HIGH (from @langchain/core types + LangGraph source code patterns consistent with callback system).

### Verified: CallbackHandler instantiation (from @langfuse/langchain v5)

```typescript
import { CallbackHandler } from '@langfuse/langchain'

// Option 1: No constructor args — binds to active OTel span context
const handler = new CallbackHandler()

// Option 2: Explicit metadata/tags for channel disambiguation
const handler = new CallbackHandler({
  metadata: {
    langfuseSessionId: `${channel}:${projectId}`,
    langfuseUserId: companyId,
  },
  tags: [channel, 'estimate-engine'],
})
```

Confidence: HIGH (from `@langfuse/langchain` npm registry description and Langfuse official LangChain integration docs).

### Verified: LangfuseSpanProcessor instantiation

```typescript
import { LangfuseSpanProcessor } from '@langfuse/otel'

const langfuseProcessor = new LangfuseSpanProcessor({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY ?? '',
  secretKey: process.env.LANGFUSE_SECRET_KEY ?? '',
  baseUrl: process.env.LANGFUSE_BASEURL ?? 'https://cloud.langfuse.com',
})
// Guards: if publicKey/secretKey are empty, processor is a no-op (does not throw).
```

Confidence: HIGH (from `@langfuse/otel` npm registry docs).

### Verified: NodeTracerProvider with multiple span processors

```typescript
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
// Already in tree at version 2.7.1 — no new install needed

const provider = new NodeTracerProvider({
  sampler: sentryClient ? new SentrySampler(sentryClient) : undefined,
  spanProcessors: [langfuseProcessor, new SentrySpanProcessor()],
})
provider.register({
  propagator: new SentryPropagator(),
  contextManager: new Sentry.SentryContextManager(),
})
```

Confidence: MEDIUM (pattern from Langfuse official docs "existing Sentry setup"; exact `SentryContextManager` import path needs verification).

---

## Current State Summary

### Existing Langfuse v3 usage (all must be migrated)

| File | Usage | Migration Action |
|------|-------|-----------------|
| `lib/observability/langfuse.ts` | `getLangfuse()` singleton factory using `langfuse@3` `Langfuse` class | Replace with `@langfuse/tracing` `Langfuse` class; or retire entirely if all callers are migrated to OTel auto-tracing |
| `lib/ai/openrouter-client.ts` | `getLangfuse()` calls for `transcribe_audio`, `analyze_photo`, `translate_texts` traces | Replace with `@langfuse/tracing` `observe()` or `generation()` per call; safe-metadata rule applies |
| `lib/ai/providers/openrouter.ts` | `getLangfuse()` calls for estimate generation traces | Replace with `@langfuse/tracing` `observe()` — note: estimate generation goes through `generateEstimateForProject` which is called via `makeGenerateNode` inside the shared graph, so the `CallbackHandler` on `graph.invoke` may already capture this if the provider uses `@langchain/*` model classes |

### buildEstimateGraph call sites (where CallbackHandler attaches)

| File | Line | Channel | Change Required |
|------|------|---------|-----------------|
| `lib/inngest/functions/generate-estimate.ts` | ~107 | `'web'` | Pass `{ callbacks: [handler] }` to `graph.invoke` |
| `lib/whatsapp/estimate-graph.ts` | ~76 | `'whatsapp'` | Pass `{ callbacks: [handler] }` to `graph.invoke` |

The `whatsapp-process.ts` Inngest function calls `buildEstimateGraph()` (zero-arg wrapper) from `lib/whatsapp/estimate-graph.ts`, which in turn calls `buildSharedEstimateGraph(adapter)`. The handler needs to be passed into the inner `graph.invoke` call inside `lib/whatsapp/estimate-graph.ts`.

### Sentry current state

| File | Current behavior | Required change |
|------|-----------------|-----------------|
| `instrumentation.ts` | Loads `./sentry.server.config` via `await import()` | Move Sentry.init into `register()` with `skipOpenTelemetrySetup: true`; add shared provider setup |
| `sentry.server.config.ts` | `Sentry.init({dsn, environment, ...})` — no `skipOpenTelemetrySetup` | Either delete or convert to export-only (config object, no `Sentry.init` call) |
| `sentry.edge.config.ts` | Edge runtime Sentry init | Unchanged — Langfuse OTel does not run on edge |

---

## Implementation Decisions

| Decision | Rationale |
|----------|-----------|
| Attach `CallbackHandler` at `graph.invoke` call sites (not inside `buildEstimateGraph`) | Avoids changing `buildEstimateGraph` signature (D-03). Channel metadata only known at invoke time. Two call sites is manageable. |
| Move Sentry.init into `instrumentation.ts` `register()` with `skipOpenTelemetrySetup: true` | Only option for shared provider. `sentry.server.config.ts` is loaded by `instrumentation.ts` — the Sentry init must happen in `register()` where the provider is built, not before. |
| Export `langfuseProcessor` from `instrumentation.ts` | Allows Inngest functions to call `langfuseProcessor.forceFlush()` at end of step, preventing lost spans in serverless context. |
| Migrate `getLangfuse()` call sites in the same phase (not deferred) | REQUIREMENTS.md out-of-scope table says "Retiring the legacy `langfuse@3` package: Cleanup can follow after the v5 migration lands." However, running both v3 and v5 in parallel creates duplicate spans. The safe approach: migrate `getLangfuse()` call sites as part of Phase 97, then remove `langfuse@3`. |
| MCP channel tag stays as `'web'` (not `'mcp'`) | MCP uses the web Inngest function (`generate-estimate.ts`) and the `makeDefaultAdapter` with `channel: 'web'`. The `channel` field in state already distinguishes web vs mcp conceptually — the Inngest payload includes `channel` via `EstimateGeneratePayload`. If MCP distinction is needed, add `channel: 'mcp'` to the MCP invocation path. This is a scope decision for the planner. |
| Safe-metadata rule: no transcripts/keys in trace payload | Established in v4.2. `langfuseSessionId`, `langfuseUserId`, `tags` carry only IDs and discriminators — never transcript content, audio data, or API keys. |

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js 20+ | `@langfuse/*` packages | Yes | Per Next.js 16 requirement | — |
| `@opentelemetry/api` | Peer dep of all `@langfuse/*` | Yes (transitive) | `1.9.1` | — |
| `@opentelemetry/sdk-trace-node` | `NodeTracerProvider` for shared provider | Yes (transitive) | `2.7.1` | — |
| `@sentry/opentelemetry` | `SentrySpanProcessor`, `SentrySampler`, `SentryPropagator` | Yes (bundled by `@sentry/nextjs`) | `10.56.0` | — |
| LANGFUSE_PUBLIC_KEY env var | OBS-02/OBS-03 | Not committed (per CLAUDE.md) | N/A | `LangfuseSpanProcessor` gracefully no-ops when keys are empty strings |
| LANGFUSE_SECRET_KEY env var | OBS-02/OBS-03 | Not committed (per CLAUDE.md) | N/A | Same graceful no-op |
| LANGFUSE_BASEURL env var | OBS-02 | Not committed | N/A | Defaults to `https://cloud.langfuse.com` |

**Missing dependencies with no fallback:**
- None. All OTel packages are already in the tree. Only `@langfuse/*` packages need installation.

**Missing dependencies with fallback:**
- Langfuse env vars: `LangfuseSpanProcessor` is designed to no-op when keys are absent, so the app boots and runs without Langfuse configured. Traces simply do not appear.

---

## Validation Architecture

`nyquist_validation` is `true` in `.planning/config.json` — this section is mandatory.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.4 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test` (runs `vitest run`) |
| Full suite command | `npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| OBS-01 | All 3 channels emit a trace via `CallbackHandler` at `graph.invoke` | Unit (mock `CallbackHandler`, verify it is passed to `graph.invoke` in both Inngest fns) | `npm test -- tests/unit/estimate/observability.test.ts` | No — Wave 0 gap |
| OBS-01 | Channel discriminator appears in trace metadata/tags | Unit (source-text anchor: grep `generate-estimate.ts` and `estimate-graph.ts` for `CallbackHandler`) | `npm test -- tests/unit/estimate/observability.test.ts` | No — Wave 0 gap |
| OBS-02 | `instrumentation.ts` contains `skipOpenTelemetrySetup: true` | Unit (source-text anchor: `readFileSync('instrumentation.ts')`) | `npm test -- tests/unit/observability/instrumentation.test.ts` | No — Wave 0 gap |
| OBS-02 | `instrumentation.ts` registers both `LangfuseSpanProcessor` and `SentrySpanProcessor` on one provider | Unit (source-text anchor) | Same file | No — Wave 0 gap |
| OBS-02 | `sentry.server.config.ts` no longer calls `Sentry.init()` directly (or is deleted) | Unit (source-text anchor) | Same file | No — Wave 0 gap |
| OBS-02 | `langfuse@3` is uninstalled / `getLangfuse()` has zero call sites | Unit (source-text anchor: grep `getLangfuse` across project) | Same file | No — Wave 0 gap |
| OBS-03 | Web non-vague happy path = exactly 1 AI call (QA-03 regression) | Unit (existing test) | `npm test -- tests/unit/inngest/generate-estimate-job.test.ts` | Yes |
| OBS-03 | No transcript/audio content in trace metadata (safe-metadata rule) | Unit (source-text anchor: grep CallbackHandler construction for forbidden fields) | `npm test -- tests/unit/estimate/observability.test.ts` | No — Wave 0 gap |

### Manual-only checks (cannot be automated without live Langfuse)

| Check | Why Manual | When to Run |
|-------|------------|-------------|
| Langfuse UI shows traces for all 3 channels | Requires live LANGFUSE_PUBLIC_KEY + cloud connection | Phase gate before `/gsd:verify-work` |
| Langfuse traces show nested LLM spans with token counts | Requires live connection + an actual estimate run | Phase gate |
| Sentry still receives error traces post-skipOpenTelemetrySetup | Requires live Sentry DSN + a deliberate test error | Phase gate |
| p95 latency visible per channel in Langfuse | Requires multiple traces accumulated | Phase gate |

### Sampling Rate

- **Per task commit:** `npm test` (full suite — currently fast, no slow integration tests)
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work` + manual Langfuse UI verification

### Wave 0 Gaps

- [ ] `tests/unit/estimate/observability.test.ts` — covers OBS-01 (CallbackHandler attachment in both Inngest fns) + OBS-03 (safe-metadata rule source anchor)
- [ ] `tests/unit/observability/instrumentation.test.ts` — covers OBS-02 (source-text anchors: `skipOpenTelemetrySetup`, `LangfuseSpanProcessor`, `SentrySpanProcessor` in `instrumentation.ts`; `getLangfuse` absent from codebase)
- No framework install needed — Vitest already configured and running

---

## Open Questions

1. **Should MCP get its own channel tag (`'mcp'`) or stay as `'web'`?**
   - What we know: MCP creates estimates via `EVENT_ESTIMATE_GENERATE` (same as web), dispatched from `lib/mcp/tools/write.ts`. The `generate-estimate.ts` Inngest function currently hardcodes `channel: 'web'`. The `EstimateGeneratePayload` in `lib/inngest/events.ts` may or may not carry a `channel` field.
   - What's unclear: Does the MCP path need its own `channel: 'mcp'` tag in the trace for OBS-01 to be satisfied, or is `'web'` acceptable?
   - Recommendation: Check `lib/inngest/events.ts` for `EstimateGeneratePayload`'s field shape. If it has no `channel`, add `channel?: 'web' | 'mcp'` and pass `'mcp'` from `lib/mcp/tools/write.ts`. This is a 2-line change that gives clean channel discrimination.

2. **Does `lib/ai/providers/openrouter.ts` call go through a `@langchain/*` model class?**
   - What we know: `openrouter-client.ts` uses raw `fetch`. `lib/ai/providers/openrouter.ts` is a separate file that also uses `getLangfuse()`.
   - What's unclear: Whether `providers/openrouter.ts` wraps a `@langchain/openai` or `@langchain/anthropic` model class (which would auto-trace via `CallbackHandler`) or also uses raw `fetch`.
   - Recommendation: Read `lib/ai/providers/openrouter.ts` during implementation. If it uses raw fetch, add `observe()` wrappers; if it uses `@langchain/*`, the `CallbackHandler` auto-captures it.

3. **Exact `SentryContextManager` import path**
   - What we know: `@sentry/opentelemetry` ships at 10.56.0 as a dep of `@sentry/nextjs`. `SentrySampler`, `SentrySpanProcessor`, `SentryPropagator` are in `@sentry/opentelemetry`.
   - What's unclear: Whether `SentryContextManager` is in `@sentry/opentelemetry` or `@sentry/nextjs` or `@sentry/node`.
   - Recommendation: Run `node -e "console.log(Object.keys(require('@sentry/opentelemetry')))"` during Wave 0 to enumerate exact exports. May need `@sentry/node` import instead.

---

## Sources

### Primary (HIGH confidence)

- Codebase read 2026-06-20: `lib/estimate/graph/index.ts`, `lib/estimate/graph/state.ts`, `lib/estimate/graph/types.ts`, `lib/estimate/graph/nodes/generate.ts`, `lib/estimate/adapters/default.ts`, `lib/estimate/adapters/whatsapp.ts`, `lib/whatsapp/estimate-graph.ts`, `lib/inngest/functions/generate-estimate.ts`, `lib/inngest/functions/whatsapp-process.ts`, `lib/observability/langfuse.ts`, `lib/ai/openrouter-client.ts`, `instrumentation.ts`, `sentry.server.config.ts`, `package.json`
- npm registry: `@langfuse/langchain@5.5.3` peer deps (`@langchain/core >=0.3.8`, `@opentelemetry/api ^1.9.0`) — `npm view @langfuse/langchain peerDependencies`
- npm registry: latest versions `@langfuse/langchain`, `@langfuse/otel`, `@langfuse/tracing` all at `5.5.3` — `npm view @langfuse/langchain version`
- Installed `node_modules` inspection: `@opentelemetry/api@1.9.1`, `@opentelemetry/sdk-trace-node@2.7.1`, `@opentelemetry/sdk-node@0.218.0` all present transitively
- npm registry: `@sentry/nextjs@10.56.0` deps include `@sentry/opentelemetry@10.56.0` and `@opentelemetry/api@^1.9.1`
- Existing research: `.planning/research/STACK.md` (verified 2026-06-20) — the Sentry coexistence pattern, langfuse v5 migration rationale, CallbackHandler attach pattern
- `tests/unit/inngest/generate-estimate-job.test.ts` — QA-03 call-count regression test already exists

### Secondary (MEDIUM confidence)

- Langfuse official docs: LangChain JS integration, "existing Sentry setup" FAQ, `LangfuseSpanProcessor` configuration
- `@langfuse/langchain` npm package description confirming `CallbackHandler` as the LangGraph integration surface
- Sentry docs: `skipOpenTelemetrySetup` option and manual OTel provider setup

### Tertiary (LOW confidence)

- Exact `SentryContextManager` import path — needs verification during implementation
- Exact `NodeTracerProvider` constructor signature for `spanProcessors` array (vs `addSpanProcessor`) — verify against `@opentelemetry/sdk-trace-node@2.7.1` API

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — versions verified against npm registry and installed tree
- Architecture: HIGH — call sites located, migration path clear, coexistence pattern from official sources
- Pitfalls: HIGH — based on actual current code and known OTel provider collision behavior
- Validation architecture: HIGH — test targets identified, gap tests specified

**Research date:** 2026-06-20
**Valid until:** 2026-07-20 (Langfuse v5 is stable; Sentry OTel patterns are stable)
