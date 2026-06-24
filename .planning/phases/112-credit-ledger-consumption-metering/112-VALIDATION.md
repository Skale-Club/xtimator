---
phase: 112
slug: credit-ledger-consumption-metering
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 112 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/billing` |
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
| 112-ledger-table | TBD (planner) | 1 | CREDIT-01 | unit (migration contract) | `npx vitest run tests/unit/billing` | ❌ W0 | ⬜ pending |
| 112-debit-helper | TBD (planner) | 1 | CREDIT-02, CREDIT-06, CREDIT-07 | unit | `npx vitest run tests/unit/billing` | ❌ W0 | ⬜ pending |
| 112-balance | TBD (planner) | 1 | CREDIT-03 | unit | `npx vitest run tests/unit/billing` | ❌ W0 | ⬜ pending |
| 112-grant-field | TBD (planner) | 1 | CREDIT-04 | unit | `npx vitest run tests/unit/billing tests/unit/entitlements` | ❌ W0 | ⬜ pending |
| 112-check-credits | TBD (planner) | 2 | CREDIT-05 | unit | `npx vitest run tests/unit/billing` | ❌ W0 | ⬜ pending |
| 112-wire-debits | TBD (planner) | 2 | CREDIT-02, CREDIT-07 | unit | `npx vitest run tests/unit` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; each phase requirement (CREDIT-01..07) must have an automated verification.*

---

## Wave 0 Requirements

- [ ] `tests/unit/billing/credit-ledger.test.ts` — stubs for CREDIT-01/02/06/07 (migration contract; debit = round(real_cost × markup / unit); idempotent unique-key; zero-debit when no cost)
- [ ] `tests/unit/billing/credit-balance.test.ts` — stubs for CREDIT-03 (cached balance reconciles to ledger sum)
- [ ] `tests/unit/billing/check-credits.test.ts` — stubs for CREDIT-05 (allowed/shortfall; enforcementEnabled=false never blocks)
- [ ] `tests/unit/entitlements.test.ts` (extend) — CREDIT-04 monthlyCreditGrant field present on all tiers

*Existing vitest infrastructure covers the framework; only the new test files above are Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Real debit recorded after a live estimate | CREDIT-02 | Requires live AI call + applied migration | In staging, generate one estimate, confirm a `credit_ledger` debit row with delta = round(real_cost × markup / unit) |
| Owner sees own ledger, not others' | CREDIT-01/03 | Requires multi-tenant auth session | Log in as company A, confirm only A's ledger rows are visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
