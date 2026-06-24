---
phase: 116-calibration-charge-on-validation
verified: 2026-06-24T19:40:00Z
status: passed
score: 10/10 must-haves verified
---

# Phase 116: Calibration Charge-On Validation Verification Report

**Phase Goal:** Provide the MECHANISM to derive grant/markup/price per tier from measured cost and validate the margin invariant (real cost of a full monthly grant ≤ ~30% of subscription price); gate the enforcementEnabled flip on that validation. Ship validator + aggregator + charge-on gate + runbook WITHOUT flipping enforcement on. Milestone completes safely with charging OFF.
**Verified:** 2026-06-24T19:40:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth | Status | Evidence |
| --- | ----- | ------ | -------- |
| 1 | validateMarginInvariant computes realCostOfGrant = grant × creditUnitUsd / markup, ratio = realCost/priceUsd, PASS iff ≤ 0.30 per priced tier | ✓ VERIFIED | calibration.ts:66-72 exact formula; MARGIN_INVARIANT_MAX=0.3 (line 32) |
| 2 | The illustrative DEFAULT_BILLING_CONFIG FAILS the invariant and the test ASSERTS the FAIL (defaults NOT edited) | ✓ VERIFIED | calibration.test.ts:88 `res.pass).toBe(false)`; :96-97 pro ratio 0.6897 FAIL; :106-107 business 0.6734 FAIL; `git diff billing-config.ts` EMPTY |
| 3 | A calibrated fixture PASSES; zero-price tiers (free/trial) skipped, not FAIL | ✓ VERIFIED | calibration.test.ts:118-119 `free/trial.skipped).toBe(true)`; :161-163 calibrated fixture passes; calibration.ts:68-71 skip logic |
| 4 | aggregateAiCostByOperation reads ai_cost_events via service client, EXCLUDES NULL real_cost_usd, reports mean/median/p90/n | ✓ VERIFIED | calibration.ts:122-125 `.not('real_cost_usd','is',null)`; test:187 NULL-only op excluded; no `?? 0` coercion |
| 5 | recommendFromAggregate is a pure function taking explicit usage profile | ✓ VERIFIED | calibration.ts:97-106 pure Σ mean × profile, no I/O; no server-only |
| 6 | saveBillingConfig REJECTS a false→true enforcementEnabled flip when validateMarginInvariant fails — no upsert | ✓ VERIFIED | actions.ts:778-790 gate after safeParse, before requireServiceClient; test:113 `upsertMock).not.toHaveBeenCalled()` |
| 7 | saveBillingConfig ALLOWS the flip when validator passes; OFF saves never gated | ✓ VERIFIED | test:122 passing flip upserts once; test:131 OFF save (failing defaults) upserts once |
| 8 | enforcementEnabled is NOT flipped on anywhere; DEFAULT untouched (stays false) | ✓ VERIFIED | grep: zero `enforcementEnabled: true` assignments in app/lib; billing-config.ts:69 `enforcementEnabled: false`; diff empty |
| 9 | analyze-ai-cost.mjs aggregates real cost (NULL excluded) using only DATABASE_URL, no secrets | ✓ VERIFIED | script:44 `WHERE real_cost_usd IS NOT NULL`; only `process.env.DATABASE_URL`; `node -c` parses; no literal connection string |
| 10 | CALIBRATION-RUNBOOK documents collect→analyze→set→validate→flip, marks defaults illustrative | ✓ VERIFIED | runbook Steps 1-5 present; "Status: ILLUSTRATIVE, enforcement OFF"; "DO NOT flip in Phase 116" |

**Score:** 10/10 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/billing/calibration.ts` | Pure validator + recommend + server-only-free aggregator | ✓ VERIFIED | 156 lines; validateMarginInvariant, recommendFromAggregate, aggregateAiCostByOperation, MARGIN_INVARIANT_MAX, types exported; NO `import 'server-only'` statement (the 2 mentions are doc comments) |
| `tests/unit/billing/calibration.test.ts` | Correct-FAIL + passing fixture + skip + NULL-exclusion | ✓ VERIFIED | Asserts defaults FAIL, fixture passes, skip true, NULL row excluded; green |
| `app/admin/integrations/actions.ts` | Charge-on gate in saveBillingConfig | ✓ VERIFIED | imports validateMarginInvariant (line 17); gate at 778-790 in correct order |
| `tests/unit/admin/charge-on-gate.test.ts` | Wiring proof with REAL validator | ✓ VERIFIED | calibration NOT mocked; 3 groups; `not.toHaveBeenCalled` + `toHaveBeenCalledTimes(1)` |
| `scripts/analyze-ai-cost.mjs` | NULL-excluding aggregation, no secrets | ✓ VERIFIED | parses; `WHERE real_cost_usd IS NOT NULL` + PERCENTILE_CONT; DATABASE_URL only |
| `CALIBRATION-RUNBOOK.md` | collect→analyze→set→validate→flip | ✓ VERIFIED | all 5 steps; illustrative status; no secrets |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| calibration.ts | billing-config.ts | `import type { BillingConfig, BillingTier }` | ✓ WIRED | line 29, type-only import (stays out of dormancy allowlist) |
| calibration.ts | ai_cost_events | service client `.not('real_cost_usd','is',null)` | ✓ WIRED | lines 120-125 |
| actions.ts | calibration.ts | `import { validateMarginInvariant }` + guard before upsert | ✓ WIRED | import line 17; guard 778-790 precedes requireServiceClient line 791 |
| charge-on-gate.test.ts | saveBillingConfig | asserts upsert NOT called on failing flip | ✓ WIRED | `expect(upsertMock).not.toHaveBeenCalled()` line 113 |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Billing + admin unit suites green | `npx vitest run tests/unit/billing tests/unit/admin` | 42 files / 289 tests passed | ✓ PASS |
| Ops script parses | `node -c scripts/analyze-ai-cost.mjs` | PARSE-OK | ✓ PASS |
| Defaults unchanged | `git diff HEAD -- lib/billing/billing-config.ts` | empty | ✓ PASS |
| No enforcement flip in code | grep `enforcementEnabled: true` in app/lib | zero matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| CALIB-02 | 116-01, 116-02 | Grant/markup/price derived from measured real cost satisfy the margin invariant (≤30% of price), documented | ✓ SATISFIED | Validator + aggregator + recommend (mechanism), charge-on gate (enforcement), runbook (documented). REQUIREMENTS.md:73 marked [x]; mapping line 131 "Complete". No orphaned requirements for Phase 116. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | None found | — | No TODO/FIXME/placeholder; no `?? 0` NULL coercion; no `import 'server-only'` taint; runbook usage-profile TBD slot is intentional documented mechanism, not a stub |

### Human Verification Required

None. All behaviors are programmatically verifiable (pure math, server-action wiring proven via unit test against the real validator, script parse-check). No visual/UI surface shipped this phase. The eventual production enforcement flip is intentionally out of scope (no production data) and documented in the runbook.

### Gaps Summary

No gaps. The phase ships exactly the MECHANISM its goal scopes:

- **The trap held.** DEFAULT_BILLING_CONFIG was NOT edited to pass — `git diff` on billing-config.ts is empty, and the test asserts the defaults FAIL (pro 0.6897, business 0.6734 > 0.30). A calibrated fixture passes.
- **The charge-on gate is real and wired at the single chokepoint.** A false→true enforcementEnabled flip against a failing config is rejected with no upsert, proven by a wiring test that uses the unmocked pure validator.
- **enforcement stays OFF.** No `enforcementEnabled: true` assignment exists anywhere in app/lib; the default remains false. The milestone completes safely with charging OFF, as required.
- **The aggregator preserves null-vs-0 discipline** (`.not('real_cost_usd','is',null)`, no `?? 0`), the ops script uses only `process.env.DATABASE_URL` with no leaked secrets, and the runbook documents the full collect→analyze→set→validate→flip transition.
- All 42 billing+admin test files (289 tests) pass. The known pre-existing `mcp-route-contract.test.ts` parallel-only flake is not in scope and was not exercised.

---

_Verified: 2026-06-24T19:40:00Z_
_Verifier: Claude (gsd-verifier)_
