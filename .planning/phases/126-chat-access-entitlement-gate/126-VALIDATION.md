---
phase: 126
slug: chat-access-entitlement-gate
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-25
---

# Phase 126 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts (existing) |
| **Quick run command** | `npx vitest run tests/unit/chat tests/unit/entitlements.test.ts` |
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
| 126-entitlement-flag | TBD (planner) | 1 | CHATMETER-02 | unit | `npx vitest run tests/unit/entitlements.test.ts` | ✅ existing (extend) | ⬜ pending |
| 126-route-gate | TBD (planner) | 1 | CHATMETER-02 | unit | `npx vitest run tests/unit/chat` | ✅ existing (extend) | ⬜ pending |
| 126-page-gate | TBD (planner) | 2 | CHATMETER-02 | unit | `npx vitest run tests/unit/chat` | ❌ W0 | ⬜ pending |
| 126-owner-only | TBD (planner) | 2 | CHATMETER-02 | unit (static) | `npx vitest run tests/unit/chat` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*CHATMETER-02 is covered by the entitlement flag + the route 403 gate + the page upgrade prompt + the never-customer-facing static test.*

---

## Wave 0 Requirements

- [ ] `tests/unit/chat/chat-access-scope.test.ts` — static: no public/share route exposes the chat (never customer-facing); chat lives only under app/(app)/chat + the auth-gated app/api/chat
- [ ] `tests/unit/chat/chat-page-gate.test.tsx` — the page shows an upgrade prompt (not the chat) when the tier lacks chatEnabled

*Extends the existing `tests/unit/entitlements.test.ts` (chatEnabled per tier) + `tests/unit/chat/route.test.ts` (403 when not entitled).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Free-tier owner sees upgrade prompt; Pro sees chat | CHATMETER-02 | Requires live tier + auth | In staging, open /chat as a free company (upgrade prompt) then as a Pro company (chat loads) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
