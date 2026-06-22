/**
 * lib/observability/langfuse.ts — Phase 97 (OBS-02)
 *
 * Langfuse v5 tracing for raw-fetch AI call sites that are NOT captured by the
 * @langfuse/langchain CallbackHandler (Whisper transcription, OpenRouter vision,
 * OpenRouter translation, OpenRouterAdapter.callTool).
 *
 * The graph-based estimate generation IS captured automatically by the
 * CallbackHandler attached at graph.invoke in Wave 3.
 *
 * Langfuse v5 dropped the v3 `new Langfuse().generation()` client in favour of an
 * OTel-based API (`startObservation`, span processors). To avoid rewriting every
 * call site, this module exposes a thin `langfuseClient` shim that preserves the
 * minimal v3-style surface the call sites rely on:
 *   const gen = langfuseClient.generation({ name, model, input, startTime })
 *   gen.end({ output, endTime })
 *   await langfuseClient.flushAsync()
 *
 * Spans are exported via the LangfuseSpanProcessor configured in instrumentation.ts;
 * flushAsync() force-flushes that processor (serverless may suspend before the
 * buffer drains naturally). All calls are best-effort — callers wrap in try/catch.
 *
 * SECURITY: No key literals. Langfuse keys are read from env by the span processor
 * in instrumentation.ts. NEVER commit LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY /
 * LANGFUSE_BASEURL.
 */
import 'server-only'
import { startObservation } from '@langfuse/tracing'
import { langfuseProcessor } from '@/instrumentation'

type GenerationStart = {
  name: string
  model?: string
  input?: unknown
  startTime?: Date
  /** Legacy v3-style token usage; mapped to v5 `usageDetails`. */
  usage?: { input?: number; output?: number }
}

type GenerationEnd = {
  output?: unknown
  endTime?: Date
}

export const langfuseClient = {
  /**
   * Start a generation observation. Returns a handle whose `end()` records the
   * output and closes the span — mirroring the legacy v3 generation API.
   */
  generation({ name, model, input, startTime, usage }: GenerationStart) {
    // Map v3 { input, output } token counts → v5 usageDetails (numbers only).
    const usageDetails: Record<string, number> = {}
    if (typeof usage?.input === 'number') usageDetails.input = usage.input
    if (typeof usage?.output === 'number') usageDetails.output = usage.output

    const observation = startObservation(
      name,
      {
        model,
        input,
        ...(Object.keys(usageDetails).length > 0 ? { usageDetails } : {}),
      },
      { asType: 'generation', ...(startTime ? { startTime } : {}) },
    )
    return {
      end({ output, endTime }: GenerationEnd = {}) {
        if (output !== undefined) observation.update({ output })
        observation.end(endTime)
      },
    }
  },

  /** Force-flush buffered spans (serverless safety). No-op if not initialized. */
  async flushAsync() {
    await langfuseProcessor?.forceFlush()
  },
}
