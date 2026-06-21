# Phase 102 — Deferred Items

Out-of-scope discoveries logged during execution. NOT fixed in their discovering plan.

## [102-03] Pre-existing vitest cross-file worker-reuse leakage

**Discovered during:** 102-03 (HARD-05) full-suite verification.

**Symptom:** `npx vitest run tests/unit/estimate tests/unit/whatsapp` reports ~12
failures across ~9 files (e.g. `batch-reporting`, `never-reply-regression`,
`replay-safe-ttl`, `confirm`, `intent-router`, `channel-adapter`, `step-runner`,
`generate-refine-equivalence`). The failures are state-bleed artifacts:
`sessionInserts`/`sendWhatsAppMessage` call counts accumulate across files that
share the `@/lib/whatsapp/estimate-graph` mock harness and module-level mock state,
so a later file sees `2` reply calls instead of `1`, etc.

**Proof it is leakage, not a regression:** EVERY one of these files PASSES when run
in isolation (`npx vitest run tests/unit/whatsapp/batch-reporting.test.ts`, etc.).
Confirmed for all 9 files during 102-03.

**Scope:** Pre-existing (predates Phase 102 impl plans; flagged in STATE.md Next-Up
as a recommended follow-up). Out of scope for HARD-05/06/07. Do NOT fix here.

**Recommended fix (future):** a test-harness isolation pass — `vi.resetModules()` +
per-file mock-state reset, or `pool: 'forks'` / `isolate: true` / `fileParallelism`
config so each file gets a fresh worker. Belongs to a dedicated test-infra task
(candidate for Phase 103 eval/test-harness work).
