---
phase: 112-credit-ledger-consumption-metering
plan: 04
subsystem: billing
tags: [credit-ledger, metering, debit, inngest, price-research, never-throw, wiring]

# Dependency graph
requires:
  - phase: 112-03
    provides: "recordCreditDebit (never-throw, idempotent on `${attemptId}:debit:${op}`) + debitIdemKey"
  - phase: 110
    provides: "ai_cost_events real-cost capture (attempt_id, real_cost_usd nullable) — the read-back source"
  - phase: 56
    provides: "recordUsage seam in the Inngest jobs + price-research orchestrator (the anchor for the debit)"
provides:
  - "recordCreditDebit wired into all four metered AI seams (estimate, photo_batch, audio_minutes, price_research)"
  - "Real AI spend now produces a credit_ledger debit — the metering the Phase-116 calibration consumes"
  - "credit-debit-wiring.test.ts — static source guard locking the four-seam debit contract + CREDIT-07-by-construction"
affects:
  - "116 calibration (reads the recorded debits to derive real numbers before flipping enforcementEnabled)"
  - "115 owner balance widget (the debits feed credit_balance/credit_ledger it reads)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Retry-isolated Inngest step.run('record-credit-debit') AFTER the existing usage seam — never blocks the job (recordCreditDebit is never-throw + enforcement OFF)"
    - "Bounded read-back of real cost from ai_cost_events by attemptId (≤3×150ms, cost-miss path only) — acceptable in a background step"
    - "Thread-the-known-cost (no read-back) where the value is already in hand (transcribe-audio's computeWhisperCostUsd)"
    - "Inline idempotent debit inside a loop collapses to ONE debit per attempt via the helper's idem key — no hoist, mirrors the existing best-effort recordUsage seam"
    - "CREDIT-07 by construction: NO channel==='mcp' branch anywhere — a non-spend op has no cost → no debit"

key-files:
  created:
    - tests/unit/billing/credit-debit-wiring.test.ts
  modified:
    - lib/inngest/functions/generate-estimate.ts
    - lib/inngest/functions/analyze-photos.ts
    - lib/inngest/functions/transcribe-audio.ts
    - lib/estimate/price-research/orchestrator.ts

key-decisions:
  - "estimate/photo_batch read cost BACK from ai_cost_events by attemptId (the cost is captured deep at the provider seam via fire-and-forget recordAICost). Bounded 3×150ms retry only on the cost-miss path; all-null → realCostUsd:null (no guessed 0)."
  - "transcribe-audio THREADS the already-computed computeWhisperCostUsd value into BOTH recordAICost and the debit (same value, no read-back race) — RESEARCH Pattern 2 option b. NO recordUsage seam here, so the debit anchors after save-transcript + recordAICost."
  - "price_research debits INLINE inside the per-result loop (kept beside recordUsage, NOT hoisted). The helper's idempotency on `${attemptId}:debit:price_research` collapses the per-loop calls to exactly one debit per attempt — equivalent to a post-loop single call but mirrors the existing metering seam."
  - "record-ai-cost.ts left byte-for-byte unchanged (Phase-110 measure-only CI guard intact)."

requirements-completed: [CREDIT-02, CREDIT-07]

# Metrics
duration: 5min
completed: 2026-06-24
tasks: 2
files: 5
commits: 2
---

# Phase 112 Plan 04: Credit Debit Wiring Summary

**`recordCreditDebit` (Plan 03) wired into all four metered AI seams — generate-estimate, analyze-photos, transcribe-audio, and the price-research orchestrator — so every real AI spend now produces a `credit_ledger` debit (CREDIT-02). Each debit fires AFTER its existing usage seam, is retry-isolated where it lives in an Inngest job, and never blocks the job (never-throw helper + enforcement OFF). estimate/photo read the real cost back from `ai_cost_events` by attemptId; transcribe threads the already-computed Whisper cost; price_research debits inline (idempotency collapses the per-loop calls to one debit per attempt). CREDIT-07 holds BY CONSTRUCTION — no `channel==='mcp'` branch anywhere; a non-spend op has no cost so it records nothing.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-24T17:01:32Z
- **Completed:** 2026-06-24T17:06:50Z
- **Tasks:** 2
- **Files:** 5 (1 created, 4 modified)

## What Was Built

**Task 1 — generate-estimate + analyze-photos (read-back from ai_cost_events)** (commit `7f4b3a72`)
- Both jobs gained a new `step.run('record-credit-debit', ...)` IMMEDIATELY AFTER the existing `step.run('record-usage', ...)` — retry-isolated, never-throw.
- The step reads the real cost BACK from `ai_cost_events` filtered by `attempt_id` (the cost is captured deep at the provider seam via fire-and-forget `recordAICost`, RESEARCH Pitfall 6). It SUMs the non-null `real_cost_usd` values; if all are null it passes `realCostUsd: null` (the helper no-ops — null vs guessed 0). On the cost-miss path (the insert hasn't committed yet) it does a bounded read-back: up to 3×150ms (~450ms worst case) — acceptable in a background, never-blocking step.
- generate-estimate debits `operationType: 'estimate'`; analyze-photos debits `'photo_batch'`, summing all per-photo `vision` rows into the one batch debit (Open Question 2).
- `recordCreditDebit` imported from `@/lib/billing/credit-ledger`; reuses the already-imported `requireServiceClient` for the read-back.

**Task 2 — transcribe-audio + price-research orchestrator + wiring test** (commit `b634bd65`)
- **transcribe-audio**: computes `const whisperCost = computeWhisperCostUsd(ident.durationSeconds)` ONCE and threads the SAME value into BOTH the existing `recordAICost` call AND the new debit (no read-back race — the value is in hand). The debit lives in a `step.run('record-credit-debit', ...)` anchored AFTER `save-transcript` + `recordAICost` (this file has NO `recordUsage` seam), `operationType: 'audio_minutes'`, skipped when `ident.companyId` is null. `whisperCost` null (unknown rate / hidden Gemini fallback) → the helper no-ops.
- **orchestrator**: an inline, never-throw (try/catch) debit added right AFTER the existing `recordUsage` call, INSIDE the `for (const result of results)` loop. Because the call fires once per result but `recordCreditDebit` is idempotent on `${ctx.attemptId}:debit:price_research`, the per-result repetition collapses to exactly ONE debit per attempt — no hoist needed. Reads cost back from `ai_cost_events` by `ctx.attemptId` (same bounded shape); skipped when `ctx.attemptId` is absent (no stable key → no debit). `operationType: 'price_research'`.
- **credit-debit-wiring.test.ts** (created): a static source-read guard (mirrors the migration-contract / measure-only tests — no Inngest runtime, no DB). 19 assertions: all four files import `recordCreditDebit` from `@/lib/billing/credit-ledger`; the three Inngest jobs contain `step.run('record-credit-debit'`; each seam uses its correct operationType (`estimate` / `photo_batch` / `audio_minutes` / `price_research`); NONE of the four files contains a `channel === 'mcp'` debit branch (CREDIT-07 by construction); per-file debit-after-usage ordering — estimate/photo anchored on `record-usage`, orchestrator on `recordUsage`, transcribe-audio anchored on `save-transcript` + `recordAICost` (it has NO `recordUsage` token, which the test also asserts).

## Verification

- `npx vitest run tests/unit/billing/credit-debit-wiring.test.ts` — 19/19 GREEN.
- `npx vitest run tests/unit` (full unit suite) — **273 files / 1993 passed | 3 skipped | 31 todo**, 0 failures (baseline 112-03 was 272 files; +1 file / +19 wiring tests).
- `npx tsc --noEmit -p tsconfig.json` — clean on all four touched source files + the new test (a pre-existing TS2348 in `tests/unit/inngest/generate-estimate-job.test.ts:150` is NOT introduced by this plan — confirmed via `git stash` + `tsc` on the baseline; logged to `deferred-items.md`).
- `git status lib/billing/record-ai-cost.ts` — NO modification (Phase-110 measure-only guard intact).

## Deviations from Plan

None — plan executed exactly as written. Both tasks landed the seams, ordering, cost-sourcing strategy (read-back vs thread vs inline), and idempotency-collapse exactly as specified.

### Deferred Issues (out of scope)

- `tests/unit/inngest/generate-estimate-job.test.ts(150,66)`: pre-existing TS2348 test-mock typing error present on the 112-03 baseline (confirmed by stashing this plan's changes and re-running tsc). NOT caused by the credit-debit wiring; logged to `.planning/phases/112-credit-ledger-consumption-metering/deferred-items.md`. The full unit suite still runs green (vitest tolerates the mock typing).

## Known Stubs

None. All four seams are live and fire real debits against the real cost capture. Enforcement is intentionally OFF (Plan 02 flag default false) — debits RECORD but nothing BLOCKS until Phase 116 calibration flips `enforcementEnabled`. That is the designed measure-only state for this milestone, not a stub.

## Next Plan Readiness

- Phase 112 (Credit Ledger + Consumption Metering) is now COMPLETE — the ledger table (01), config flag (02), metering core (03), and the four wired seams (04) are all in place. Real AI spend produces real debits in measure-only mode.
- Phase 116 calibration can now consume the recorded debits to derive real numbers before flipping `enforcementEnabled` to ON.
- Phase 115 owner balance widget can read the `credit_balance` / `credit_ledger` the debits feed.

---
*Phase: 112-credit-ledger-consumption-metering*
*Completed: 2026-06-24*

## Self-Check: PASSED

- FOUND: tests/unit/billing/credit-debit-wiring.test.ts
- FOUND: .planning/phases/112-credit-ledger-consumption-metering/112-04-SUMMARY.md
- FOUND: lib/inngest/functions/generate-estimate.ts (record-credit-debit step)
- FOUND: lib/inngest/functions/analyze-photos.ts (record-credit-debit step)
- FOUND: lib/inngest/functions/transcribe-audio.ts (threaded-cost debit)
- FOUND: lib/estimate/price-research/orchestrator.ts (inline debit)
- FOUND commit: 7f4b3a72 (feat — Task 1: estimate + photos read-back debit)
- FOUND commit: b634bd65 (feat — Task 2: transcribe + price-research + wiring test)
- Full unit suite: 273 files / 1993 passed, 0 failed; wiring test 19/19; record-ai-cost.ts unchanged.
