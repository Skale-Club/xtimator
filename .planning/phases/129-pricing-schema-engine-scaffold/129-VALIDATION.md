---
phase: 129
slug: pricing-schema-engine-scaffold
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 129 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/estimate tests/unit/services` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~60-120 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command scoped to the touched area.
- **After every plan wave:** Run `npx vitest run` (full suite).
- **Before `/gsd:verify-work`:** Full suite must be green (the ENG-02 retrocompat regression is the load-bearing gate for the whole milestone).
- **Max feedback latency:** ~120 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 129-migration | TBD (planner) | 1 | TAX-01 | unit (static SQL contract) | `npx vitest run tests/unit/estimate` | ❌ W0 | ⬜ pending |
| 129-engine-scaffold | TBD (planner) | 2 | ENG-02 | unit (retrocompat regression) | `npx vitest run tests/unit/services` | ❌ W0 | ⬜ pending |
| 129-no-ai-calculator | TBD (planner) | 1 | ENG-01 | unit (static) | `npx vitest run tests/unit/ai` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; TAX-01/ENG-01/ENG-02 each must have an automated verification. ENG-02 is the standing retrocompat guard for the whole milestone.*

---

## Wave 0 Requirements

- [ ] `tests/unit/estimate/advanced-pricing-migration.test.ts` — static SQL contract for the new columns (estimate_items taxable/tax_category/discount/cost/markup_pct; estimates deposit_type/deposit_value/balance_due; companies tax_config) + retrocompat defaults
- [ ] `tests/unit/services/pricing-retrocompat.test.ts` — ENG-02: the extended engine with no new fields produces byte-identical subtotal/tax/grandTotal to the locked baseline (the standing guard)
- [ ] `tests/unit/ai/no-ai-calculator.test.ts` — ENG-01: the AI's only tool is create_estimate; no calculator tool; the item schema has no total/tax field the server trusts

*Existing vitest infrastructure covers the framework; only the new test files above are Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration applies on remote | TAX-01 | Deploy is CI→GHCR→Coolify | After deploy, confirm the new columns exist; existing estimates unchanged |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
