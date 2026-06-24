---
phase: 120
slug: company-kb-overlay-tenant
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 120 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/knowledge tests/unit/settings` |
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
| 120-overlay-actions | TBD (planner) | 1 | KOVL-01, KOVL-02 | unit (action) | `npx vitest run tests/unit/settings` | ❌ W0 | ⬜ pending |
| 120-overlay-ui | TBD (planner) | 2 | KOVL-01 | unit (component) | `npx vitest run tests/unit/settings` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; KOVL-01/02 each must have an automated verification.*

---

## Wave 0 Requirements

- [ ] `tests/unit/settings/knowledge-overlay-actions.test.ts` — stubs for KOVL-01/02 (tenant auth/active-company; write scope='company'+company_id+industry_id NULL via the RLS-authed client — NOT the service client; embed-then-insert, block on embed failure)

*Existing vitest infrastructure covers the framework; only the new test file above is Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Owner adds an overlay entry; it's private to the company | KOVL-01 | Requires live tenant session + applied migrations | In staging, add an overlay entry as company A, confirm company B cannot see it |
| Overlay entry becomes retrievable for the company | KOVL-02 | Requires live embed + retrieve | Add an overlay entry, retrieve a related question as that company, confirm it ranks |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
