/**
 * lib/observability/langfuse.ts — Phase 97 (OBS-02)
 *
 * Langfuse v5 tracing client for raw-fetch AI call sites that are NOT captured
 * by the @langfuse/langchain CallbackHandler (Whisper transcription, OpenRouter
 * vision, OpenRouter translation, OpenRouterAdapter.callTool).
 *
 * The graph-based estimate generation IS captured automatically by the
 * CallbackHandler attached at graph.invoke in Wave 3.
 *
 * SECURITY: No key literals. Keys read from process.env only.
 * NEVER commit LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, or LANGFUSE_BASEURL.
 */
import 'server-only'
import { Langfuse } from '@langfuse/tracing'

/**
 * Module-level v5 Langfuse client for manual generation spans.
 * Gracefully no-ops when keys are absent — the Langfuse class handles this.
 * Exported directly so callers use `langfuseClient.generation(...)` without
 * the legacy getLangfuse singleton pattern.
 */
export const langfuseClient = new Langfuse({
  publicKey: process.env.LANGFUSE_PUBLIC_KEY ?? '',
  secretKey: process.env.LANGFUSE_SECRET_KEY ?? '',
  baseUrl: process.env.LANGFUSE_BASEURL ?? 'https://cloud.langfuse.com',
})
