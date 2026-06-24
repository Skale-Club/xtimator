---
phase: 111
slug: billing-config-store-super-admin-billing-panel
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 111 — Validation Strategy

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
| 111-config-reader | TBD (planner) | 1 | BILLCFG-01 | unit | `npx vitest run tests/unit/billing` | ❌ W0 | ⬜ pending |
| 111-defaults-zod | TBD (planner) | 1 | BILLCFG-01 | unit | `npx vitest run tests/unit/billing` | ❌ W0 | ⬜ pending |
| 111-admin-panel | TBD (planner) | 2 | BILLCFG-02 | unit (action) | `npx vitest run tests/unit/admin` | ❌ W0 | ⬜ pending |
| 111-tenant-gate | TBD (planner) | 2 | BILLCFG-03 | unit (static/authz) | `npx vitest run tests/unit/admin` | ❌ W0 | ⬜ pending |
| 111-dormant | TBD (planner) | 1 | BILLCFG-01 | static | `npx vitest run tests/unit/billing` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; each phase requirement (BILLCFG-01/02/03) must have an automated verification.*

---

## Wave 0 Requirements

- [ ] `tests/unit/billing/billing-config.test.ts` — stubs for BILLCFG-01 (getBillingConfig returns DEFAULT_BILLING_CONFIG when no row; reads metadata when present; zod validation; dormant grep)
- [ ] `tests/unit/admin/billing-config-save.test.ts` — stubs for BILLCFG-02/03 (save action validates + writes; requireAdmin gate FIRST; tenant has no route)

*Existing vitest infrastructure covers the framework; only the new test files above are Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Super-admin edits a param and it persists | BILLCFG-02 | Requires the live admin UI + auth session | In staging, open /admin/integrations/billing, change markup, save, reload — value persists |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
