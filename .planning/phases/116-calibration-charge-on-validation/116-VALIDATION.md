---
phase: 116
slug: calibration-charge-on-validation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 116 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/billing tests/unit/admin` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~60-120 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command scoped to the touched area.
- **After every plan wave:** Run `npx vitest run` (full suite).
- **Before `/gsd:verify-work`:** Full suite must be green.
- **Max feedback latency:** ~120 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 116-validator | TBD (planner) | 1 | CALIB-02 | unit (pure) | `npx vitest run tests/unit/billing` | ❌ W0 | ⬜ pending |
| 116-aggregator | TBD (planner) | 1 | CALIB-02 | unit | `npx vitest run tests/unit/billing` | ❌ W0 | ⬜ pending |
| 116-charge-on-gate | TBD (planner) | 2 | CALIB-02 | unit (action) | `npx vitest run tests/unit/admin` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*CALIB-02 is covered by the validator + the charge-on gate wiring (the validator gating enforcementEnabled).*

---

## Wave 0 Requirements

- [ ] `tests/unit/billing/calibration.test.ts` — stubs for CALIB-02 (validateMarginInvariant: ratio = grant×unit/markup vs 0.30×price; the CURRENT illustrative defaults FAIL by design — assert the FAIL; a calibrated fixture PASSES; div-by-zero guards on free/trial)
- [ ] `tests/unit/admin/charge-on-gate.test.ts` — stubs for the gate (saveBillingConfig rejects a false→true enforcement flip when the validator fails; no upsert fires)

*Existing vitest infrastructure covers the framework; only the new test files above are Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real calibration from production data | CALIB-02 | Requires N weeks of live ai_cost_events (does not exist yet) | Per the runbook: run the analysis script against prod ai_cost_events, set numbers in billing_config, confirm validateMarginInvariant passes, then flip enforcementEnabled |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
