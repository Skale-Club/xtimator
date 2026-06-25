---
phase: 122
slug: channel-neutral-domain-extraction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 122 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/agent-tools tests/unit/whatsapp` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~60-120 seconds (full) |

---

## Sampling Rate

- **After every task commit:** Run the quick run command scoped to the touched area.
- **After every plan wave:** Run `npx vitest run` (full suite).
- **Before `/gsd:verify-work`:** Full suite must be green (the WhatsApp parity tests are the load-bearing gate).
- **Max feedback latency:** ~120 seconds.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 122-createEstimate | TBD (planner) | 1 | NEUT-01 | unit | `npx vitest run tests/unit/agent-tools` | ❌ W0 | ⬜ pending |
| 122-queryData | TBD (planner) | 1 | NEUT-02 | unit | `npx vitest run tests/unit/agent-tools` | ❌ W0 | ⬜ pending |
| 122-normalize | TBD (planner) | 1 | NEUT-03 | unit | `npx vitest run tests/unit/agent-tools` | ❌ W0 | ⬜ pending |
| 122-askKnowledge | TBD (planner) | 1 | NEUT-04 | unit | `npx vitest run tests/unit/agent-tools` | ❌ W0 | ⬜ pending |
| 122-parity | TBD (planner) | 2 | NEUT-05 | unit (regression) | `npx vitest run tests/unit/whatsapp` | ✅ existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; NEUT-01..05 each must have an automated verification. NEUT-05 (parity) reuses the EXISTING WhatsApp test suite — it must stay green unchanged after the extraction.*

---

## Wave 0 Requirements

- [ ] `tests/unit/agent-tools/create-estimate.test.ts` — stub for NEUT-01 (neutral createEstimate dispatches the engine; no channel import)
- [ ] `tests/unit/agent-tools/query-company-data.test.ts` — stub for NEUT-02 (neutral data-read functions; no channel import)
- [ ] `tests/unit/agent-tools/normalize.test.ts` — stub for NEUT-03 (neutral multimodal ingest; no channel import)
- [ ] `tests/unit/agent-tools/ask-knowledge.test.ts` — stub for NEUT-04 (neutral askKnowledge wraps answer; no channel import)
- [ ] `tests/unit/agent-tools/neutrality.test.ts` — static: grep lib/agent-tools/ imports no lib/whatsapp

*NEUT-05 reuses the existing tests/unit/whatsapp/* suite (the parity guard) — it must stay green.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| WhatsApp end-to-end still generates/queries/answers identically | NEUT-05 | Requires a live WhatsApp number | In staging, send an audio job + a QUERY + a KNOWLEDGE message and confirm identical behavior to pre-extraction |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
