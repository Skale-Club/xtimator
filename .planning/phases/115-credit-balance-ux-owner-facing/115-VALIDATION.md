---
phase: 115
slug: credit-balance-ux-owner-facing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 115 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/billing tests/unit/queries` |
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
| 115-credits-query | TBD (planner) | 1 | CREDITUI-01 | unit (owner-safe projection) | `npx vitest run tests/unit` | ❌ W0 | ⬜ pending |
| 115-balance-card | TBD (planner) | 2 | CREDITUI-01 | unit (component) | `npx vitest run tests/unit` | ❌ W0 | ⬜ pending |
| 115-low-notify | TBD (planner) | 2 | CREDITUI-02 | unit | `npx vitest run tests/unit/billing` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; CREDITUI-01/02 each must have an automated verification.*

---

## Wave 0 Requirements

- [ ] `tests/unit/queries/credits-query.test.ts` — stubs for CREDITUI-01 (history projection SELECTs only operation_type/delta_credits/reason/created_at — NEVER real_cost_usd/markup)
- [ ] `tests/unit/billing/credit-balance-card.test.tsx` — stubs for CREDITUI-01 (balance + per-action guidance render; no token math)
- [ ] `tests/unit/billing/credit-low-notify.test.ts` — stubs for CREDITUI-02 (low/zero threshold from billing_config fires the warning; CTA links to top-up)

*Existing vitest infrastructure covers the framework; only the new test files above are Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Owner sees balance + history in settings | CREDITUI-01 | Requires live auth session + ledger rows | Log in, open /settings/billing, confirm balance + recent history with no token/cost numbers |
| Low-balance warning + top-up CTA | CREDITUI-02 | Requires a low balance + notification surface | Drive balance below threshold, confirm a warning notification + working top-up CTA |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
