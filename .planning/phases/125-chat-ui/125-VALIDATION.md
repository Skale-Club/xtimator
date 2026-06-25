---
phase: 125
slug: chat-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
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

- [ ] `tests/unit/chat/message-parts.test.tsx` — stub for CHATUI-01 (renders text parts as bubbles + tool-<name> parts as progress/result; full-message-array send)
- [ ] `tests/unit/chat/conversation-sidebar.test.tsx` — stub for CHATUI-02 (lists conversations, new/switch, history seeds useChat with user/assistant rows)
- [ ] `tests/unit/chat/multimodal-input.test.tsx` — stub for CHATUI-03 (audio/photo routed through normalizeInput → message text)
- [ ] `tests/unit/chat/estimate-card.test.tsx` — stub for CHATUI-04 (tool-createEstimate output → poll job → card with open-in-editor link to /projects/[id]?tab=estimate&estimate=<id>)

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
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
