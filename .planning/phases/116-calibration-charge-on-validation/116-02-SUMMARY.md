---
phase: 116-calibration-charge-on-validation
plan: 02
subsystem: payments
tags: [billing, margin-invariant, charge-on-gate, calibration, runbook, vitest, ops-script]

# Dependency graph
requires:
  - phase: 116-calibration-charge-on-validation (Plan 01)
    provides: "validateMarginInvariant (pure) — the validator the gate consumes"
  - phase: 111-billing-config-store
    provides: "saveBillingConfig (the single enforcementEnabled write path) + DEFAULT_BILLING_CONFIG"
  - phase: 110-real-cost-capture
    provides: "ai_cost_events.real_cost_usd — the calibration data source the ops script aggregates"
provides:
  - "The CALIB-02 charge-on gate inside saveBillingConfig: a false→true enforcementEnabled flip is REJECTED (ok:false, NO upsert) when validateMarginInvariant fails"
  - "scripts/analyze-ai-cost.mjs: operator aggregation of ai_cost_events (mean/median/p90/n per op, NULL excluded)"
  - "CALIBRATION-RUNBOOK.md: the documented collect→analyze→set→validate→flip transition"
affects: [billing-config-form charge-on UX, the eventual production enforcement flip]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Gate at the single chokepoint: enforcementEnabled is gated in saveBillingConfig (its only write path), not by convention — there is no way to persist enforcementEnabled:true against a failing config"
    - "Wiring proof via the REAL validator: the gate test imports the unmocked pure validateMarginInvariant so it proves the actual gate logic, not a stub"
    - "Enforcement-OFF is never gated: illustrative numbers are always saveable while charging is OFF; the gate only short-circuits a failing flip"
    - "Ops script reads process.env.DATABASE_URL only (NO secrets); session-pooler :5432 + ssl skeleton copied from check-pipeline-events-table.mjs"

key-files:
  created:
    - tests/unit/admin/charge-on-gate.test.ts
    - scripts/analyze-ai-cost.mjs
    - .planning/phases/116-calibration-charge-on-validation/CALIBRATION-RUNBOOK.md
  modified:
    - app/admin/integrations/actions.ts

key-decisions:
  - "The gate sits AFTER safeParse, BEFORE requireServiceClient — the upsert/invalidate/revalidate/audit logic is byte-identical (git diff shows only the import + the inserted gate block)"
  - "DEFAULT_BILLING_CONFIG (pro 0.69, business 0.67) FAILS the invariant by design; the gate test asserts the FAILING flip is rejected with no upsert — the CALIB-02 proof, against the real validator"
  - "No 'server-only' concern: the gate imports validateMarginInvariant (the pure half of calibration.ts) — it validates a config passed IN, so the Phase-111 BILLCFG-03 dormancy guard stays green WITHOUT an allowlist edit (calibration.ts is not a getBillingConfig consumer)"
  - "enforcementEnabled is NOT flipped on anywhere; DEFAULT_BILLING_CONFIG defaults untouched (they fail the invariant by design — correct; the gate prevents an unsafe flip until calibrated numbers are set)"

requirements-completed: [CALIB-02]

# Metrics
duration: 4min
completed: 2026-06-24
---

# Phase 116 Plan 02: Charge-On Gate + Ops Script + Calibration Runbook Summary

**Wires the Plan-01 margin-invariant validator to the single enforcementEnabled write path (saveBillingConfig) so a false→true charge-on flip is REJECTED with no upsert when the invariant fails — the CALIB-02 proof, asserted against the real unmocked validator — plus the operator's ai_cost_events aggregation script and the collect→analyze→set→validate→flip runbook. Enforcement stays OFF; the milestone completes safely.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-24T20:23:41Z
- **Tasks:** 3
- **Files modified:** 4 (1 source, 1 test, 1 script, 1 doc)

## Accomplishments
- **The CALIB-02 charge-on gate is live in the single write path.** `saveBillingConfig`, after `safeParse` and before `requireServiceClient`, runs `validateMarginInvariant(parsed.data)` when `enforcementEnabled` is true and returns `{ ok: false, message }` (naming the failing tier(s) + their ratio) with NO upsert when the invariant fails. The upsert/invalidate/revalidate/audit logic is byte-identical — the gate only short-circuits a failing flip.
- **The wiring is test-proven against the REAL validator.** `tests/unit/admin/charge-on-gate.test.ts` reuses the `billing-config-save.test.ts` mocks but does NOT mock `@/lib/billing/calibration` — the pure validator runs for real. Three groups: REJECT a failing flip (DEFAULT_BILLING_CONFIG + enforcement:true → ok:false, `upsertMock` NOT called, `lastUpsertPayload` null); ALLOW a calibrated passing flip (pro 1000@$29, business 3000@$99 → upsert once, metadata.enforcementEnabled true); NEVER gate an OFF save (failing defaults + enforcement:false → upsert once).
- **Operator tooling shipped.** `scripts/analyze-ai-cost.mjs` aggregates `ai_cost_events` mean/median/p90/n per `operation_type` with `WHERE real_cost_usd IS NOT NULL` (Phase-110 null-vs-0 discipline — NULL never coerced to 0), reading `process.env.DATABASE_URL` only (no secrets), via the session-pooler :5432 + ssl skeleton.
- **The transition is documented.** `CALIBRATION-RUNBOOK.md` documents collect→analyze→set→validate→flip, marks the current defaults illustrative + enforcement OFF, gives the margin-invariant formula, and records a usage-profile table slot. It explicitly says DO NOT flip in this phase.
- **Full suite green:** `npx vitest run` → 298 files passed | 3 skipped, 2110 passed | 2 skipped | 33 todo (baseline 115-02 296/2095; +2 files). No regressions; the known parallel-only `mcp-route-contract.test.ts` flake did not surface. tsc clean on `actions.ts`. Phase-111 BILLCFG-03 dormancy guard still 17/17.

## Task Commits

Each task was committed atomically (all normal hooked — gitleaks ran, no `--no-verify`, no leaks):

1. **Task 1: failing charge-on gate wiring test (RED)** - `9223ecd6` (test)
2. **Task 2: wire the gate into saveBillingConfig (GREEN)** - `bae5cd7` (feat)
3. **Task 3: ops analysis script + CALIBRATION-RUNBOOK** - `bb99c28` (chore)

_TDD: Task 1 RED (the REJECT case fails because the current action upserts the failing config), Task 2 GREEN; no REFACTOR needed._

## Files Created/Modified
- `app/admin/integrations/actions.ts` (modified) — imports `validateMarginInvariant` + `TierMarginResult` from `@/lib/billing/calibration`; the charge-on gate block inserted after the safeParse failure return and before `requireServiceClient()`.
- `tests/unit/admin/charge-on-gate.test.ts` (created) — the CALIB-02 wiring proof; reuses the billing-config-save mocks, runs the REAL validator, 3 groups.
- `scripts/analyze-ai-cost.mjs` (created) — operator aggregation of `ai_cost_events` (NULLs excluded); `DATABASE_URL` only.
- `.planning/phases/116-calibration-charge-on-validation/CALIBRATION-RUNBOOK.md` (created) — the documented calibration transition + illustrative/enforcement-OFF status.

## Decisions Made
- **Gate placement at the single chokepoint:** the gate goes inside `saveBillingConfig` (the only write path for `enforcementEnabled`), after `safeParse`, before the upsert — so a failing config can never persist `enforcementEnabled:true`. Enforced, not by convention.
- **No dormancy-guard allowlist edit needed:** the gate imports the PURE `validateMarginInvariant` (which validates a config passed IN), so `actions.ts` is not a new `getBillingConfig` consumer — the Phase-111 BILLCFG-03 guard stayed green without touching the allowlist (verified 17/17).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## Known Stubs
None that block CALIB-02. The runbook's per-tier usage-profile table is an intentional TBD slot (the operator fills it when calibrating against real data) — this is the documented GUESS the milestone scopes (Phase 116 ships the MECHANISM, not final numbers). `DEFAULT_BILLING_CONFIG` remains illustrative by design and FAILS the invariant — correct; the gate prevents an unsafe flip until calibrated numbers are set. `enforcementEnabled` stays OFF; the milestone completes safely.

## Self-Check: PASSED

All claimed files exist and all task commits exist (verified below).
