/**
 * instrumentation.ts — Phase 97 (OBS-02)
 *
 * Shared OTel provider coexistence: Langfuse v5 + Sentry without global-registry collision.
 *
 * Pattern: Sentry.init with skipOpenTelemetrySetup:true → single NodeTracerProvider
 * hosts both LangfuseSpanProcessor and SentrySpanProcessor → provider.register().
 *
 * SentryContextManager is exported from @sentry/nextjs (verified).
 * SentrySpanProcessor / SentrySampler / SentryPropagator are from @sentry/opentelemetry.
 * NodeTracerProvider is from @opentelemetry/sdk-trace-node (already in tree via @sentry/nextjs).
 *
 * Export: langfuseProcessor — lets Inngest step.run bodies call
 * `await langfuseProcessor?.forceFlush()` after graph.invoke to prevent lost spans
 * in serverless contexts where Node.js suspends before the buffer drains.
 *
 * SECURITY: No Langfuse key literals. Keys are read from process.env only.
 * NEVER commit LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, or LANGFUSE_BASEURL.
 */
import * as Sentry from '@sentry/nextjs'
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
import { LangfuseSpanProcessor } from '@langfuse/otel'
import {
  SentrySpanProcessor,
  SentrySampler,
  SentryPropagator,
} from '@sentry/opentelemetry'
import { isUnreportableServerActionMismatch } from '@/lib/observability/sentry-filters'

/**
 * Exported so Inngest functions can call `await langfuseProcessor?.forceFlush()`
 * at the end of each step.run that invokes the estimate graph. Prevents lost spans
 * in serverless contexts (Pitfall 3 from Phase 97 research).
 */
export let langfuseProcessor: LangfuseSpanProcessor | null = null

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // 1. Init Sentry WITHOUT auto-OTel setup so Sentry does not grab the global
    //    OTel provider. We wire Sentry manually onto the shared provider below.
    const sentryClient = Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV,
      sendDefaultPii: true,
      tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
      includeLocalVariables: true,
      enableLogs: true,
      skipOpenTelemetrySetup: true, // CRITICAL — prevents global-provider collision
      beforeSend(event) {
        // Invalid/stale Server Action IDs are untrusted request input, not an
        // application exception. deploymentId handles legitimate build skew;
        // this keeps scanner probes from reopening XTIMATOR-3.
        if (isUnreportableServerActionMismatch(event)) return null
        return event
      },
    })

    // 2. Langfuse span processor — gracefully no-ops when keys are absent (empty
    //    string), so the app boots and runs without Langfuse configured locally.
    //    SECURITY: keys come from process.env only — never hardcoded here.
    langfuseProcessor = new LangfuseSpanProcessor({
      publicKey: process.env.LANGFUSE_PUBLIC_KEY ?? '',
      secretKey: process.env.LANGFUSE_SECRET_KEY ?? '',
      baseUrl: process.env.LANGFUSE_BASEURL ?? 'https://cloud.langfuse.com',
    })

    // 3. Single shared provider hosting both processors — Langfuse first so
    //    LLM spans are exported even if Sentry's processor throws.
    const provider = new NodeTracerProvider({
      sampler: sentryClient ? new SentrySampler(sentryClient) : undefined,
      spanProcessors: [langfuseProcessor, new SentrySpanProcessor()],
    })

    // 4. Register the provider as the global OTel implementation.
    //    SentryContextManager is from @sentry/nextjs (not @sentry/opentelemetry).
    provider.register({
      propagator: new SentryPropagator(),
      contextManager: new Sentry.SentryContextManager(),
    })
  }

  // Edge runtime: use Sentry's edge config only. Langfuse OTel does not run
  // on the edge (Node.js OTel SDK is not edge-compatible).
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config')
  }
}

// Automatically captures all unhandled server-side request errors.
export const onRequestError = Sentry.captureRequestError
