---
phase: 97-unified-observability-langfuse-v5-sentry-coexistence
plan: "02"
subsystem: observability
tags: [otel, langfuse, sentry, instrumentation, nodejs]
dependency_graph:
  requires: [97-01]
  provides: [OBS-02-provider, langfuseProcessor-export]
  affects: [inngest-steps, sentry-init, langfuse-tracing]
tech_stack:
  added: []
  patterns:
    - "skipOpenTelemetrySetup: true — prevents Sentry from grabbing the global OTel provider"
    - "Single NodeTracerProvider with both LangfuseSpanProcessor and SentrySpanProcessor"
    - "export let langfuseProcessor — module-level singleton for forceFlush() in serverless"
key_files:
  modified:
    - instrumentation.ts
    - sentry.server.config.ts
decisions:
  - "Sentry.init() moved from sentry.server.config.ts into instrumentation.ts register() to enable skipOpenTelemetrySetup:true and shared provider pattern"
  - "SentryContextManager sourced from @sentry/nextjs (not @sentry/opentelemetry) per verified runtime export"
  - "sentry.server.config.ts retained as empty stub (not deleted) to avoid breaking any stray imports at runtime"
metrics:
  duration_minutes: 5
  completed: "2026-06-20T20:13:28Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
---

# Phase 97 Plan 02: Shared NodeTracerProvider — Langfuse v5 + Sentry Coexistence Summary

**One-liner:** Shared `NodeTracerProvider` with `skipOpenTelemetrySetup: true` prevents Sentry/Langfuse global-registry collision, wiring both span processors onto a single OTel provider in `instrumentation.ts`.

## What Was Done

### Task 1: Rewrite instrumentation.ts

Replaced the 13-line stub (which only did `await import('./sentry.server.config')`) with the full 82-line shared-provider implementation:

- `Sentry.init()` moved inline into `register()` with `skipOpenTelemetrySetup: true` — prevents Sentry from registering its own global `NodeTracerProvider` and colliding with Langfuse's
- `LangfuseSpanProcessor` instantiated with keys from `process.env` only (empty-string fallback — gracefully no-ops locally)
- `NodeTracerProvider` constructed with `SentrySampler` + both processors (`[langfuseProcessor, new SentrySpanProcessor()]`)
- `provider.register()` called with `SentryPropagator` and `new Sentry.SentryContextManager()` (from `@sentry/nextjs`)
- `export let langfuseProcessor` declared at module level so Inngest step functions can `await langfuseProcessor?.forceFlush()` after graph.invoke
- Edge runtime branch retained: `await import('./sentry.edge.config')` unchanged

### Task 2: Hollow out sentry.server.config.ts

Replaced the active `Sentry.init()` call with a comment-only stub explaining the intentional emptiness. File retained so any stray `await import('./sentry.server.config')` references elsewhere don't break at the import level (import resolution succeeds, just no side effects).

## Verification Results

| Check | Result |
|-------|--------|
| `vitest run instrumentation.test.ts` | 7 GREEN, 1 RED (getLangfuse-gone — expected, Wave 4) |
| `tsc --noEmit \| grep instrumentation` | No errors |
| `grep skipOpenTelemetrySetup instrumentation.ts` | Line 47: `skipOpenTelemetrySetup: true` |
| `sentry.server.config.ts` has no `Sentry.init(` call | Confirmed |
| `instrumentation.ts` does not import `sentry.server.config` | Confirmed |
| `vitest run generate-estimate-job.test.ts` (QA-03) | 4/4 GREEN |

## Commits

| Task | Hash | Message |
|------|------|---------|
| Task 1 | c217fdb | feat(phase-97-w2): wire shared NodeTracerProvider — Langfuse v5 + Sentry coexistence |
| Task 2 | 631b621 | feat(phase-97-w2): hollow out sentry.server.config.ts — prevent double Sentry.init |

## Deviations from Plan

None — plan executed exactly as written.

Note: The Task 2 plan verification command (`Select-String 'Sentry.init'`) matched the comment text `Sentry.init()` in the comment body. This is a false positive in the verification script — the actual `Sentry.init(` function call was eliminated. Verified with a pattern anchored to non-comment lines.

## Known Stubs

None. `langfuseProcessor` is initialized in `register()` and exported as a live singleton. No placeholder data or hardcoded empty values flow to consumers.

## Self-Check: PASSED

- FOUND: instrumentation.ts
- FOUND: sentry.server.config.ts
- FOUND: 97-02-SUMMARY.md
- commit c217fdb verified in git log
- commit 631b621 verified in git log
