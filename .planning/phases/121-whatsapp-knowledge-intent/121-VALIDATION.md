---
phase: 121
slug: whatsapp-knowledge-intent
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-24
---

# Phase 121 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/whatsapp` |
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
| 121-intent | TBD (planner) | 1 | WAKB-01 | unit | `npx vitest run tests/unit/whatsapp` | ✅ existing (extend) | ⬜ pending |
| 121-dispatch | TBD (planner) | 1 | WAKB-02 | unit | `npx vitest run tests/unit/whatsapp` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; WAKB-01/02 each must have an automated verification.*

---

## Wave 0 Requirements

- [ ] `tests/unit/whatsapp/intent-router-knowledge.test.ts` — stubs for WAKB-01/02 (parseIntent('KNOWLEDGE')→KNOWLEDGE; unrecognized still →CREATE; classify prompt has the KNOWLEDGE bullet + QUERY-vs-KNOWLEDGE rule; dispatchKnowledge reads industries, calls answer scoped {industries, companyId}, delivers via sendOwnerReplyChunks)

*The existing WhatsApp intent-router safe-default regression tests must stay green — KNOWLEDGE is additive.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Owner asks a trade how-to over WhatsApp and gets a KB answer | WAKB-01/02 | Requires live WhatsApp + a seeded KB + applied migrations + a live answer/embed key | In staging, seed a carpet-cleaning entry, ask "how do I pre-treat a pet stain?" over WhatsApp, confirm a KB-grounded answer arrives |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
