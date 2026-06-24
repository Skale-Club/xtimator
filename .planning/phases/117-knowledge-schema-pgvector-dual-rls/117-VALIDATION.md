---
phase: 117
slug: knowledge-schema-pgvector-dual-rls
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 117 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/knowledge` |
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
| 117-migration | TBD (planner) | 1 | KB-01, KB-02, KB-03 | unit (static SQL contract) | `npx vitest run tests/unit/knowledge` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The whole phase is one idempotent migration + a static contract test asserting: CREATE EXTENSION vector, knowledge_entries shape, vector(1536), HNSW cosine index, the scope CHECK, the dual RLS (industry readable-to-all + company_members company arm; industry writes service-role-only = no policy).*

---

## Wave 0 Requirements

- [ ] `tests/unit/knowledge/knowledge-entries-migration.test.ts` — static-read assertions locking the migration shape (extension, columns, vector dim, HNSW index, scope CHECK, dual RLS policies)

*Existing vitest infrastructure covers the framework; only the new test file above is Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration applies on remote with pgvector | KB-01 | Deploy is CI→GHCR→Coolify, not applied from here | After deploy, confirm the `vector` extension + `knowledge_entries` table + HNSW index exist in the remote DB |
| Tenant cannot read another company's overlay | KB-03 | Requires live multi-tenant auth | Log in as company A, confirm company B's overlay rows are not visible |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
