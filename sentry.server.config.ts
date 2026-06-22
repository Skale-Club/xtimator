/**
 * sentry.server.config.ts — Phase 97 (OBS-02)
 *
 * INTENTIONALLY EMPTY.
 *
 * Sentry.init() was moved into instrumentation.ts `register()` in Phase 97
 * to allow a shared NodeTracerProvider with Langfuse v5's LangfuseSpanProcessor
 * (skipOpenTelemetrySetup: true coexistence pattern).
 *
 * This file is retained so existing `await import('./sentry.server.config')`
 * references in any other files do not break at the import level, but it
 * performs no initialization. If no other file imports this module, it can
 * be deleted in a future cleanup.
 *
 * See instrumentation.ts for the actual Sentry + Langfuse OTel setup.
 */
