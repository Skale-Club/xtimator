---
phase: 97-unified-observability-langfuse-v5-sentry-coexistence
plan: 01
subsystem: testing
tags: [langfuse, opentelemetry, otel, tracing, observability, vitest, tdd]

# Dependency graph
requires: []
provides:
  - "@langfuse/langchain@^5.5.3 in package.json dependencies"
  - "@langfuse/otel@^5.5.3 in package.json dependencies"
  - "@langfuse/tracing@^5.5.3 in package.json dependencies"
  - "RED test stubs for OBS-01 (CallbackHandler attachment) in tests/unit/estimate/observability.test.ts"
  - "RED test stubs for OBS-03 (safe-metadata) in tests/unit/estimate/observability.test.ts"
  - "RED test stubs for OBS-02 (instrumentation.ts rewrite) in tests/unit/observability/instrumentation.test.ts"
affects:
  - 97-02-PLAN (Wave 2 — instrumentation.ts rewrite must turn OBS-02 tests GREEN)
  - 97-03-PLAN (Wave 3 — CallbackHandler wiring must turn OBS-01/OBS-03 tests GREEN)
  - 97-04-PLAN (Wave 4 — langfuse v3 removal)

# Tech tracking
tech-stack:
  added:
    - "@langfuse/langchain@5.5.3 (Langfuse v5 LangChain integration)"
    - "@langfuse/otel@5.5.3 (Langfuse v5 OpenTelemetry provider)"
    - "@langfuse/tracing@5.5.3 (Langfuse v5 tracing primitives)"
  patterns:
    - "Source-text anchor test pattern: readFileSync production source + expect().toContain() assertions without server"
    - "RED-first TDD: test files committed before production code exists, verified to fail with correct error"

key-files:
  created:
    - "tests/unit/estimate/observability.test.ts — 8 tests for OBS-01 + OBS-03 (CallbackHandler + safe-metadata)"
    - "tests/unit/observability/instrumentation.test.ts — 8 tests for OBS-02 (instrumentation.ts rewrite)"
  modified:
    - "package.json — added @langfuse/langchain, @langfuse/otel, @langfuse/tracing at ^5.5.3"
    - "package-lock.json — 130 packages added, 70 changed"

key-decisions:
  - "Single @opentelemetry/api@1.9.1 confirmed deduped across all dependents — no manual pinning needed"
  - "langfuse@3.38.20 preserved (v3 removal deferred to Wave 4 per plan)"
  - "getLangfuse() absence test passes immediately in Wave 1 — no lib/*.ts files currently use getLangfuse()"
  - "Negative safe-metadata assertions (OBS-03) pass in Wave 1 — production code correctly has no forbidden tokens yet"

patterns-established:
  - "OBS test pattern: readFileSync(resolve(process.cwd(), path), 'utf8') for source-text anchors"
  - "RED wave: test stubs committed per-task before any production code, each individually verifiable"

requirements-completed:
  - OBS-01
  - OBS-02
  - OBS-03

# Metrics
duration: 7min
completed: 2026-06-20
---

# Phase 97 Plan 01: Unified Observability — Wave 1 Summary

**Langfuse v5 OTel packages installed (@langfuse/langchain, @langfuse/otel, @langfuse/tracing at 5.5.3) with 16 RED test stubs planted for OBS-01, OBS-02, and OBS-03 using source-text anchor pattern**

## Performance

- **Duration:** 7 min
- **Started:** 2026-06-20T20:04:55Z
- **Completed:** 2026-06-20T20:12:00Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Installed three Langfuse v5 OTel packages with a single deduplicated `@opentelemetry/api@1.9.1` in the dependency tree
- Created `tests/unit/estimate/observability.test.ts` with 8 tests covering OBS-01 (CallbackHandler attachment on web + WhatsApp channels) and OBS-03 (safe-metadata — no transcript/apiKey/audio_data in trace metadata)
- Created `tests/unit/observability/instrumentation.test.ts` with 8 tests covering OBS-02 (skipOpenTelemetrySetup, LangfuseSpanProcessor, SentrySpanProcessor, NodeTracerProvider, langfuseProcessor export, getLangfuse() v3 elimination, no committed keys)
- QA-03 regression check confirmed GREEN (4/4 tests in generate-estimate-job.test.ts still pass)

## Task Commits

1. **Task 1: Install Langfuse v5 OTel packages** — `f6cdb09` (feat)
2. **Task 2: Write RED test stubs — observability.test.ts (OBS-01, OBS-03)** — `61139e5` (test)
3. **Task 3: Write RED test stubs — instrumentation.test.ts (OBS-02)** — `7c2b137` (test)

## Files Created/Modified

- `package.json` — @langfuse/langchain, @langfuse/otel, @langfuse/tracing added at ^5.5.3; langfuse@^3.38.20 preserved
- `package-lock.json` — 130 packages added, 70 changed; @opentelemetry/api@1.9.1 deduplicated
- `tests/unit/estimate/observability.test.ts` — 8 tests: 5 RED (CallbackHandler not yet wired), 3 pass (negative safe-metadata assertions correct now)
- `tests/unit/observability/instrumentation.test.ts` — 8 tests: 7 RED (instrumentation.ts rewrite in Wave 2), 1 passes (getLangfuse() correctly absent in lib/)

## Decisions Made

- Single `@opentelemetry/api@1.9.1` confirmed via `npm ls @opentelemetry/api` — all sub-packages show `deduped`. No manual pinning needed.
- `langfuse@3.38.20` preserved as required — v3 call site migration is Wave 4 work.
- The `getLangfuse()` absence test (OBS-02) and the three negative safe-metadata tests (OBS-03) pass in Wave 1 by design — these are "clean by default" assertions that will remain passing through all waves.

## Deviations from Plan

None — plan executed exactly as written. All three packages installed at the specified versions, both test files created with the exact content from the plan spec, and all verification steps passed.

## Issues Encountered

None. `@opentelemetry/api` naturally deduplicated to 1.9.1 across all 130 newly-installed packages — no version conflict resolution was required.

## User Setup Required

None — no external service configuration required for this wave. Langfuse credentials (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_BASEURL`) are only required in Wave 2 when `instrumentation.ts` is rewritten to use them.

## Next Phase Readiness

- Wave 2 (97-02): Rewrite `instrumentation.ts` with `skipOpenTelemetrySetup: true`, `NodeTracerProvider`, `LangfuseSpanProcessor`, and `SentrySpanProcessor` — will turn 7 of 8 OBS-02 tests GREEN
- Wave 3 (97-03): Wire `CallbackHandler` at `graph.invoke` call sites in `generate-estimate.ts` and `estimate-graph.ts` — will turn 5 OBS-01 tests and the langfuseSessionId OBS-03 test GREEN
- Wave 4 (97-04): Remove `langfuse@3.38.20` and migrate v3 call sites
- No blockers — package install clean, test infrastructure operational

---
*Phase: 97-unified-observability-langfuse-v5-sentry-coexistence*
*Completed: 2026-06-20*
