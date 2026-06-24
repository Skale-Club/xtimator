---
phase: 118
slug: channel-neutral-knowledge-module
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 118 — Validation Strategy

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
| 118-rpc-migration | TBD (planner) | 1 | KMOD-02 | unit (SQL contract) | `npx vitest run tests/unit/knowledge` | ❌ W0 | ⬜ pending |
| 118-embed | TBD (planner) | 1 | KMOD-01 | unit | `npx vitest run tests/unit/knowledge` | ❌ W0 | ⬜ pending |
| 118-retrieve | TBD (planner) | 2 | KMOD-02 | unit | `npx vitest run tests/unit/knowledge` | ❌ W0 | ⬜ pending |
| 118-answer-hardening | TBD (planner) | 2 | KMOD-03, KSEC-01 | unit | `npx vitest run tests/unit/knowledge tests/unit/ai` | ❌ W0 | ⬜ pending |
| 118-fixture-neutrality | TBD (planner) | 2 | KMOD-04 | unit (static) | `npx vitest run tests/unit/knowledge` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; KMOD-01..04 + KSEC-01 each must have an automated verification.*

---

## Wave 0 Requirements

- [ ] `tests/unit/knowledge/match-rpc-migration.test.ts` — stubs for the match_knowledge_entries RPC migration contract
- [ ] `tests/unit/knowledge/embed.test.ts` — stubs for KMOD-01 (embed → 1536-vec via mocked OpenRouter; never-throws)
- [ ] `tests/unit/knowledge/retrieve.test.ts` — stubs for KMOD-02 (industry+overlay merge filter; never-throws; channel-neutral import)
- [ ] `tests/unit/knowledge/answer-hardening.test.ts` — stubs for KMOD-03 + KSEC-01 (RAG prompt built through sanitizeField + <knowledge>; static boundary assert)
- [ ] `tests/unit/knowledge/fixture.test.ts` — stubs for KMOD-04 (deterministic, zero-network) + a neutrality assertion (no lib/whatsapp import)

*Existing vitest infrastructure covers the framework; only the new test files above are Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live embedding + retrieval against the real RPC | KMOD-01/02 | Requires applied migration + a live OpenRouter key + seeded rows | In staging, seed an industry entry, embed a question, confirm retrieve returns it ranked |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
