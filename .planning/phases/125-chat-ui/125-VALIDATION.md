---
phase: 125
slug: chat-ui
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-06-25
---

# Phase 125 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/chat` |
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
| 125-message-parts | TBD (planner) | 1 | CHATUI-01 | unit (component) | `npx vitest run tests/unit/chat` | ❌ W0 | ⬜ pending |
| 125-sidebar-history | TBD (planner) | 1 | CHATUI-02 | unit | `npx vitest run tests/unit/chat` | ❌ W0 | ⬜ pending |
| 125-multimodal | TBD (planner) | 2 | CHATUI-03 | unit | `npx vitest run tests/unit/chat` | ❌ W0 | ⬜ pending |
| 125-estimate-card | TBD (planner) | 2 | CHATUI-04 | unit | `npx vitest run tests/unit/chat` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*The planner assigns concrete task IDs; CHATUI-01/02/03/04 each must have an automated verification.*

---

## Wave 0 Requirements

- [x] CHATUI-01 — `tests/unit/chat/chat-message.test.tsx` + `chat-composer.test.tsx` + `chat-thread.test.tsx` (parts render, send wiring, transport static-source) — scaffolds on disk, RED/todo until 125-01
- [x] CHATUI-02 — `tests/unit/chat/history-mapper.test.ts` (GREEN) + `chat-sidebar.test.tsx` (scaffold) — history seed mapper tested; sidebar todo until 125-02
- [x] CHATUI-03 — `tests/unit/chat/normalize-action.test.ts` (GREEN) — normalizeChatInput audio/photo → text, auth + active-company gate
- [x] CHATUI-04 — `tests/unit/chat/estimate-card.test.tsx` (scaffold) — open-in-editor link to /projects/[id]?tab=estimate&estimate=<id>, todo until 125-02

*Plus `tests/unit/chat/chat-ui-scope.test.ts` (GREEN) — backend scope fence. Dep `@ai-sdk/react@3.0.211` installed (its bundled `ai` is `6.0.209`, lockstep with the installed `ai@6.0.209`).*

*Adds `@ai-sdk/react@6.0.209` (the useChat hook), lockstep with the installed ai@6.0.209.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| End-to-end chat: stream + tool-call + estimate card | CHATUI-01/04 | Requires a live OpenRouter key + the backend + browser | In staging, ask "generate an estimate for project X", confirm the stream, the tool chip, and the inline card with a working editor link |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** Wave 0 complete (125-00) — all CHATUI requirements have a test file on disk; mapper + normalize action GREEN, component scaffolds RED/todo until 125-01/02.
