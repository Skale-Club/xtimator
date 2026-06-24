---
phase: 112-credit-ledger-consumption-metering
plan: 03
subsystem: billing
tags: [credit-ledger, metering, debit, idempotency, never-throw, billing-config]

# Dependency graph
requires:
  - phase: 112-01
    provides: "credit_ledger append-only table + companies.credit_balance + partial-unique idempotency index"
  - phase: 112-02
    provides: "enforcementEnabled flag on BillingConfig + monthlyCreditGrant on entitlements"
  - phase: 111
    provides: "getBillingConfig reader (markup / creditUnitUsd / enforcementEnabled)"
  - phase: 110
    provides: "ai_cost_events real-cost capture + never-throw side-effect shape to mirror"
  - phase: 56
    provides: "recordUsage check-then-insert + 23505-swallow idempotency pattern"
provides:
  - "lib/billing/credit-ledger.ts — recordCreditDebit, grantCredits, checkCredits, reconcileBalance, debitIdemKey"
  - "The credit metering CORE: real AI cost -> credit debit, config-driven, idempotent, never-throw"
  - "The FIRST real getBillingConfig consumer (Phase-111 dormancy guard now allowlists it)"
affects:
  - "113 Stripe rail (invoice.paid will CALL grantCredits)"
  - "Inngest jobs (generate-estimate/analyze-photos/transcribe + price-research orchestrator) — Plan 112-04 wires recordCreditDebit"
  - "115 owner balance widget (reads credit_balance/credit_ledger)"
  - "116 calibration (flips enforcementEnabled on after deriving real numbers)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Never-throw best-effort write (try -> service client -> insert -> catch -> console.warn -> void), mirroring record-ai-cost.ts"
    - "Check-then-insert dedup + 23505 swallow (NOT upsert onConflict — partial index can't be an arbiter), mirroring recordUsage"
    - "Cached companies.credit_balance updated in the same service-role write as each ledger insert; reconcileBalance = SUM(deltas) repair path"
    - "Runtime billing params read from getBillingConfig() at call time — no hard-coded billing numbers (BILLCFG-03)"
    - "CREDIT-07 (zero-debit for non-spend ops) holds BY CONSTRUCTION — no channel branch; a null/absent cost simply records nothing"

key-files:
  created:
    - lib/billing/credit-ledger.ts
    - tests/unit/billing/credit-ledger.test.ts
  modified:
    - tests/unit/billing/billing-config.test.ts

key-decisions:
  - "Debit lives in the NEW credit-ledger.ts, NOT record-ai-cost.ts — the Phase-110 measure-only CI guard fails the build on credit/debit/ledger/balance/markup in the cost module. record-ai-cost.ts left byte-for-byte unchanged."
  - "null realCostUsd -> NO debit (no `?? 0`); a cost rounding to <=0 credits -> no-op. The null-vs-0 discipline from Phase 110 carries forward so calibration never sees a guessed 0-debit."
  - "checkCredits returns allowed:true ALWAYS while enforcementEnabled is false (measure-only safety) — debits RECORD but nothing BLOCKS until Phase 116."
  - "reconcileBalance sums delta_credits TS-side (not a Postgres SUM) for symmetry/testability with the rest of the module, per RESEARCH discretion."
  - "grantCredits ships DORMANT-but-tested — Phase 113's invoice.paid webhook is the first caller; the helper accepts a stripe-event idempotency key."

requirements-completed: [CREDIT-02, CREDIT-03, CREDIT-04, CREDIT-05, CREDIT-06, CREDIT-07]

# Metrics
duration: 5min
completed: 2026-06-24
tasks: 2
files: 3
commits: 2
---

# Phase 112 Plan 03: Credit Ledger Metering Core Summary

**The NEW `lib/billing/credit-ledger.ts` — `recordCreditDebit` / `grantCredits` / `checkCredits` / `reconcileBalance` / `debitIdemKey` — a never-throw, idempotent, config-driven helper that converts a real AI cost into a credit debit, grants/top-ups credits, reads the fast cached balance, and reconciles it to the append-only ledger. Composed entirely from existing repo primitives (Phase 56 idempotency + Phase 110 never-throw + Phase 111 config); enforcement OFF so debits RECORD but nothing BLOCKS until Phase 116.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-06-24T16:52:08Z
- **Completed:** 2026-06-24T16:57:52Z
- **Tasks:** 2 (TDD RED -> GREEN)
- **Files:** 3 (2 created, 1 modified)

## What Was Built

**Task 1 — `tests/unit/billing/credit-ledger.test.ts`** (commit `59c10734`, RED)
- 17 unit tests over a chainable service-client fake (mocks `requireServiceClient` + `getBillingConfig`; no DB/network/secrets).
- Covers: debit math (`-9` from `0.02 × 4.5 / 0.01`), balance_after + companies.credit_balance update, null cost -> no debit, cost rounding to 0 -> no debit, never-throw on insert reject (+ console.warn), idempotency (pre-insert existence check + 23505 swallow), `debitIdemKey`, `reconcileBalance` SUM, `grantCredits` positive row + dedup + never-throw, `checkCredits` enforcement-off-always-allows / enforcement-on-gates / null-balance-defaults-0.

**Task 2 — `lib/billing/credit-ledger.ts`** (commit `69fc3a3e`, GREEN)
- `import 'server-only'` + header comment documenting WHY the debit lives here (not in record-ai-cost.ts) and that this is the first real `getBillingConfig` consumer.
- `recordCreditDebit`: `credits = Math.round((realCostUsd * markup) / creditUnitUsd)`; null cost or `credits<=0` -> no-op; check-then-insert dedup keyed `${attemptId}:debit:${op}`; reads `companies.credit_balance`, writes the `-credits` ledger row (`balance_after = current - credits`) + updates the cache; `23505` swallowed; whole body try/catch -> `console.warn` (never throws).
- `grantCredits`: positive `grant`/`topup` row, idempotent (dedup by supplied key), `balance_after = current + credits`, never throws. Dormant — Phase 113 calls it.
- `checkCredits(supabase, companyId, estimatedCredits)`: reads the cached balance via the INJECTED client (mirrors `checkQuota`); `shortfall = max(0, estimated - balance)`; `enforcementEnabled:false` -> `allowed:true` always; else `allowed = shortfall === 0`.
- `reconcileBalance`: SUM(delta_credits) -> writes to `companies.credit_balance`; returns the sum; never throws.
- `debitIdemKey(attemptId, op)` -> `` `${attemptId}:debit:${op}` ``.

## Verification

- `npx vitest run tests/unit/billing/credit-ledger.test.ts` — 17/17 GREEN.
- `npx vitest run tests/unit/billing` — 16 files / 119 tests GREEN (includes the still-passing `measure-only-invariant.test.ts` AND the updated dormancy guard).
- `npx vitest run` (full) — **285 files / 2022 passed | 2 skipped | 33 todo**, 0 failures (baseline 112-02 was 284/2005; +1 file / +17 credit-ledger tests).
- `npx tsc --noEmit -p tsconfig.json` — zero errors on `lib/billing/credit-ledger.ts`.
- `git status lib/billing/record-ai-cost.ts` — NO modification (measure-only guard intact).
- Acceptance greps PASS: exact debit formula (1), `if (input.realCostUsd == null) return` (1), `${attemptId}:debit:${op}` (2), `PG_UNIQUE_VIOLATION`/`'23505'` (3), `console.warn('[recordCreditDebit]`. No `lib/whatsapp` import, no `channel === 'mcp'` branch, no `record-ai-cost` import (the 3 `record-ai-cost.ts` matches are explanatory doc-comments only).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended the Phase-111 dormancy guard to allowlist credit-ledger.ts as the first getBillingConfig consumer**
- **Found during:** Task 2 (full billing-suite run after implementing the module)
- **Issue:** `tests/unit/billing/billing-config.test.ts` `BILLCFG-03: getBillingConfig ships dormant` is a SYMBOL-scoped guard asserting NO production module references `getBillingConfig`. The new `credit-ledger.ts` legitimately reads `getBillingConfig()` at call time (BILLCFG-03 mandates config-driven billing), so the guard flagged it.
- **Fix:** Added `lib/billing/credit-ledger.ts` to the guard's ALLOWLIST and reworded the describe/comment/message to "consumed ONLY by the reader + credit-ledger". This is the documented expected RED->GREEN — the planner and the 112-02 SUMMARY both predicted Plan 03 would introduce the first real consumer and update this test. Intent preserved: no OTHER production module may reference the symbol (the guard still fails if a stray consumer appears).
- **Files modified:** tests/unit/billing/billing-config.test.ts
- **Commit:** `69fc3a3e` (Task 2 commit — the allowlist change is part of the GREEN transition)

**Total deviations:** 1 auto-fixed (blocking). Expected and pre-declared by the plan; no scope creep.

## Known Stubs

None. `grantCredits` ships dormant-but-fully-tested (Phase 113 wires it) — that is an intentional, tested helper, not a placeholder stub. No UI, no hardcoded empty data sources.

## Next Plan Readiness

- The metering core is ready for **Plan 112-04** to wire `recordCreditDebit` into the Inngest jobs (a new `step.run('record-credit-debit')` after `record-usage`) and the price-research orchestrator.
- `grantCredits` is ready for Phase 113's `invoice.paid` webhook.
- `checkCredits` is ready as the enforcement-gated pre-op gate (inert until Phase 116 flips `enforcementEnabled`).

---
*Phase: 112-credit-ledger-consumption-metering*
*Completed: 2026-06-24*

## Self-Check: PASSED

- FOUND: lib/billing/credit-ledger.ts
- FOUND: tests/unit/billing/credit-ledger.test.ts
- FOUND: .planning/phases/112-credit-ledger-consumption-metering/112-03-SUMMARY.md
- FOUND commit: 59c10734 (test — RED contract)
- FOUND commit: 69fc3a3e (feat — GREEN module + dormancy allowlist)
- Full suite: 285 files / 2022 passed, 0 failed; measure-only-invariant.test.ts still green; record-ai-cost.ts unchanged.
