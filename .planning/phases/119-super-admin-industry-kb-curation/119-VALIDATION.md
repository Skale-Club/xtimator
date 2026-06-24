---
phase: 119
slug: super-admin-industry-kb-curation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 119 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/knowledge tests/unit/admin` |
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
| 119-actions | TBD (planner) | 1 | KCUR-01, KCUR-02 | unit (action) | `npx vitest run tests/unit/admin` | ❌ W0 | ⬜ pending |
| 119-embed-many | TBD (planner) | 1 | KCUR-03 | unit | `npx vitest run tests/unit/knowledge` | ❌ W0 | ⬜ pending |
| 119-ui | TBD (planner) | 2 | KCUR-01 | unit (component) | `npx vitest run tests/unit/admin` | ❌ W0 | ⬜ pending |
| 119-bulk-import | TBD (planner) | 2 | KCUR-03 | unit | `npx vitest run tests/unit/admin` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; KCUR-01/02/03 each must have an automated verification.*

---

## Wave 0 Requirements

- [ ] `tests/unit/admin/knowledge-curation-actions.test.ts` — stubs for KCUR-01/02 (requireAdmin FIRST; service-role write scope='industry'+industry_id+company_id NULL; embed-then-insert, block save on embed failure; AuditAction)
- [ ] `tests/unit/knowledge/embed-many.test.ts` — stubs for KCUR-03 (embedMany batches an array input, preserves order by data[].index, chunks ≤96)
- [ ] `tests/unit/admin/knowledge-bulk-import.test.ts` — stubs for KCUR-03 (CSV parse → embed batch → bulk insert as industry rows)

*Existing vitest infrastructure covers the framework; only the new test files above are Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Super-admin creates an industry entry; it becomes retrievable | KCUR-01/02 | Requires live admin session + applied migrations + a live embed key | In staging, create a carpet-cleaning entry, then retrieve a related question and confirm it ranks |
| Bulk import seeds an industry | KCUR-03 | Requires live admin session | Upload a CSV, confirm N industry rows with embeddings |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
