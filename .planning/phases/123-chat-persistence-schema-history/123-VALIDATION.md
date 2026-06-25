---
phase: 123
slug: chat-persistence-schema-history
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 123 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/chat tests/unit/queries` |
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
| 123-migration | TBD (planner) | 1 | CHATDB-01 | unit (static SQL contract) | `npx vitest run tests/unit/chat` | ❌ W0 | ⬜ pending |
| 123-helpers | TBD (planner) | 1 | CHATDB-02 | unit | `npx vitest run tests/unit/queries` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; CHATDB-01/02 each must have an automated verification.*

---

## Wave 0 Requirements

- [ ] `tests/unit/chat/chat-persistence-migration.test.ts` — static-read assertions for the migration (chat_conversations + chat_messages, parts jsonb, company_id denormalized, company_members RLS, no companies.user_id)
- [ ] `tests/unit/queries/chat-queries.test.ts` — stubs for CHATDB-02 (listConversations/getConversation/createConversation/appendMessage scoped to the active company)

*Existing vitest infrastructure covers the framework; only the new test files above are Wave 0.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration applies on remote | CHATDB-01 | Deploy is CI→GHCR→Coolify | After deploy, confirm chat_conversations + chat_messages exist in the remote DB |
| Returning owner sees history | CHATDB-02 | Requires the Phase-124/125 chat writing rows | In staging, persist a conversation, reload, confirm history loads |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
