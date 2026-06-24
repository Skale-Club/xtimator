---
phase: 112-credit-ledger-consumption-metering
verified: 2026-06-24T17:11:29Z
status: passed
score: 7/7 must-haves verified
---

# Phase 112: Credit Ledger + Consumption Metering Verification Report

**Phase Goal:** A tenant-scoped append-only credit_ledger records every credit movement; each instrumented AI op debits real_cost × markup (from billing_config); a company's balance is fast-read; debits are idempotent; a pre-op checkCredits surfaces top-up without hard mid-flow fail; non-spend ops (MCP conversation) never debit. SAFE: an enforcementEnabled flag (default false) means debits RECORD but never BLOCK until Phase 116 calibration.
**Verified:** 2026-06-24T17:11:29Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1   | Append-only tenant-scoped credit_ledger records every movement | ✓ VERIFIED | Migration: `credit_ledger` table, `reason IN ('grant','debit','topup','adjust')`, real_cost_usd/markup/balance_after columns; only a SELECT RLS policy (append-only) |
| 2   | Each instrumented AI op debits round(real_cost × markup / creditUnitUsd) | ✓ VERIFIED | `credit-ledger.ts:64` `Math.round((realCostUsd * cfg.markup) / cfg.creditUnitUsd)`; wired into 4 seams (estimate/photo_batch/audio_minutes/price_research) |
| 3   | Balance is fast-read (cached column, reconcilable) | ✓ VERIFIED | `companies.credit_balance INTEGER NOT NULL DEFAULT 0`; updated on each write; `reconcileBalance()` SUM(delta_credits) repair path |
| 4   | Debits are idempotent (no double-charge on retry) | ✓ VERIFIED | Partial-unique index `idx_credit_ledger_idempotency`; check-then-insert + 23505 swallow; key `${attemptId}:debit:${op}` |
| 5   | Pre-op checkCredits surfaces top-up without hard mid-flow fail | ✓ VERIFIED | `checkCredits` returns `{allowed,balance,shortfall}`; `allowed:true` ALWAYS when `enforcementEnabled` false |
| 6   | Non-spend ops (MCP) never debit — CREDIT-07 by construction | ✓ VERIFIED | `if (input.realCostUsd == null) return` (no `?? 0`); zero `=== 'mcp'` branches across all 5 source files |
| 7   | enforcementEnabled default FALSE — debits RECORD but never BLOCK | ✓ VERIFIED | `billing-config.ts:69` `enforcementEnabled: false`; checkCredits gate honors it |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `supabase/migrations/20260624000004_phase112_credit_ledger.sql` | append-only table + tenant RLS + idempotency index + credit_balance | ✓ VERIFIED | All schema elements present; tenant-readable via company_members; no companies.user_id; no INSERT/UPDATE/DELETE policy |
| `lib/billing/credit-ledger.ts` | recordCreditDebit, grantCredits, checkCredits, reconcileBalance, debitIdemKey | ✓ VERIFIED | All 5 exports present; never-throw; config-driven; 229 lines |
| `lib/billing/billing-config.ts` | enforcementEnabled flag default false | ✓ VERIFIED | Type field + DEFAULT_BILLING_CONFIG = false |
| `lib/entitlements.ts` | monthlyCreditGrant on 4 tiers | ✓ VERIFIED | free 0 / trial 2000 / pro 9000 / business 30000 |
| `lib/inngest/functions/generate-estimate.ts` | record-credit-debit step after record-usage | ✓ VERIFIED | step at L189, after record-usage L175; op 'estimate'; bounded read-back |
| `lib/inngest/functions/analyze-photos.ts` | record-credit-debit step (photo_batch) | ✓ VERIFIED | step at L179, after record-usage L159; op 'photo_batch' |
| `lib/inngest/functions/transcribe-audio.ts` | threaded computeWhisperCostUsd debit | ✓ VERIFIED | whisperCost threaded into both recordAICost and debit; op 'audio_minutes'; after save-transcript |
| `lib/estimate/price-research/orchestrator.ts` | inline debit after recordUsage | ✓ VERIFIED | inline try/catch debit L292-319; op 'price_research'; gated on ctx.attemptId |
| `lib/billing/record-ai-cost.ts` | UNCHANGED (measure-only guard) | ✓ VERIFIED | git shows no working-tree diff; last commit predates phase 112 |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| credit_ledger RLS | company_members | SELECT TO authenticated | ✓ WIRED | `company_members.company_id` subquery; NO `companies.user_id` |
| recordCreditDebit | getBillingConfig() | markup + creditUnitUsd at call time | ✓ WIRED | `getBillingConfig()` read inside recordCreditDebit |
| checkCredits | enforcementEnabled | allowed:true when false | ✓ WIRED | `if (!cfg.enforcementEnabled) return {allowed:true...}` |
| 4 call sites | recordCreditDebit | step.run/inline after usage seam | ✓ WIRED | All 4 import from `@/lib/billing/credit-ledger` and invoke |
| debit cost source | ai_cost_events / computeWhisperCostUsd | read-back by attemptId / thread | ✓ WIRED | estimate/photo/price_research read back (filter null, never guess 0); transcribe threads |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| recordCreditDebit | realCostUsd | ai_cost_events.real_cost_usd (Phase 110 capture) / computeWhisperCostUsd | Yes (real provider cost) | ✓ FLOWING |
| credit_balance | balance_after | computed current − credits on each ledger write | Yes | ✓ FLOWING |
| checkCredits | balance | companies.credit_balance via injected client | Yes | ✓ FLOWING |

Note: null cost correctly produces NO debit (no guessed 0) — this is intended null-vs-0 discipline, not a disconnected data source.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Billing + entitlements suites green | `npx vitest run tests/unit/billing tests/unit/entitlements` | 18 files / 158 tests passed | ✓ PASS |
| Measure-only guard still green | `npx vitest run tests/unit/billing/measure-only-invariant.test.ts` | 3/3 passed | ✓ PASS |
| record-ai-cost.ts unchanged | `git status --short lib/billing/record-ai-cost.ts` | no diff | ✓ PASS |
| No MCP channel branch in debit wiring | grep `=== 'mcp'` across 5 source files | 0 matches | ✓ PASS |
| No `realCostUsd ?? 0` (null-vs-0) | grep in credit-ledger.ts | 0 matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CREDIT-01 | 112-01 | Append-only tenant-scoped credit_ledger | ✓ SATISFIED | Migration table + tenant RLS + provenance columns |
| CREDIT-02 | 112-03, 112-04 | AI op debits real_cost × markup | ✓ SATISFIED | Debit formula + 4 wired seams |
| CREDIT-03 | 112-01, 112-03 | Fast-read balance, reconcilable | ✓ SATISFIED | credit_balance column + reconcileBalance |
| CREDIT-04 | 112-02, 112-03 | Per-tier monthlyCreditGrant + grantCredits | ✓ SATISFIED | 4 tiers + grantCredits (dormant, tested) |
| CREDIT-05 | 112-02, 112-03 | Pre-op checkCredits surfaces top-up, no hard fail | ✓ SATISFIED | checkCredits + enforcementEnabled default false |
| CREDIT-06 | 112-03 | Idempotent debits | ✓ SATISFIED | Partial-unique index + check-then-insert + 23505 swallow |
| CREDIT-07 | 112-03, 112-04 | Non-spend ops never debit | ✓ SATISFIED | null cost → no debit; no channel branch; wiring test asserts absence |

All 7 requirement IDs from PLAN frontmatter cross-reference to REQUIREMENTS.md (lines 29-35) and are verifiably implemented. No orphaned requirements — REQUIREMENTS.md maps exactly CREDIT-01..07 to Phase 112 (lines 108-114), all claimed across the four plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | none | — | No TODO/FIXME/placeholder/stub in phase artifacts. `current ?? 0` and `?? null` are correct cached-balance defaults, not stubs. grantCredits ships dormant-but-tested (intentional, Phase 113 caller) — not a placeholder. |

### Human Verification Required

None. All truths are verifiable programmatically via schema inspection, source grep, and the unit suite. Runtime DB behavior (actual RLS enforcement, real Inngest execution) is covered by static-contract tests in measure-only mode by design; enforcement remains OFF until Phase 116, so there is no live blocking behavior to test this phase.

### Gaps Summary

No gaps. Every must-have truth is backed by verified, substantive, wired, and data-flowing artifacts:

- The migration is append-only with tenant-readable RLS via `company_members` (NOT `companies.user_id`, NOT service-role-only), a partial-unique idempotency index, and the cached `companies.credit_balance` column.
- The debit lives in `lib/billing/credit-ledger.ts` (NOT `record-ai-cost.ts`, which is confirmed unchanged with the measure-only guard still green), uses the exact config-driven formula `round(real_cost × markup / creditUnitUsd)`, idempotency key `${attemptId}:debit:${op}`, and never throws.
- `enforcementEnabled` defaults false; checkCredits returns `allowed:true` always while off.
- null/absent realCostUsd produces NO debit (no `?? 0`); CREDIT-07 holds by construction with zero `=== 'mcp'` branches.
- monthlyCreditGrant is present on all 4 tiers; the invoice.paid webhook is correctly deferred to Phase 113 (grantCredits ships dormant-but-tested).
- `npx vitest run tests/unit/billing tests/unit/entitlements` is green (158 tests); measure-only-invariant.test.ts passes (3 tests).

---

_Verified: 2026-06-24T17:11:29Z_
_Verifier: Claude (gsd-verifier)_
