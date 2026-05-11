---
phase: 54
slug: whatsapp-status-flow
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-11
---

# Phase 54 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/unit/whatsapp/whatsapp-status-flow.test.ts` |
| **Full suite command** | `npx vitest run tests/unit/` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/whatsapp/whatsapp-status-flow.test.ts`
- **After every plan wave:** Run `npx vitest run tests/unit/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 54-01-01 | 01 | 1 | WASTATUS-02, WASTATUS-03, WASTATUS-04 | unit | `npx vitest run tests/unit/whatsapp/whatsapp-status-flow.test.ts` | ❌ W0 | ⬜ pending |
| 54-01-02 | 01 | 1 | WASTATUS-03 | unit | `npx vitest run tests/unit/whatsapp/whatsapp-status-flow.test.ts` | ❌ W0 | ⬜ pending |
| 54-02-01 | 02 | 2 | WASTATUS-01 | manual | Visual inspection of StatusBadge in settings UI | manual | ⬜ pending |
| 54-02-02 | 02 | 2 | WASTATUS-03 | unit + manual | `npx vitest run tests/unit/whatsapp/` + visual | manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/whatsapp/whatsapp-status-flow.test.ts` — stubs for WASTATUS-02, WASTATUS-03, WASTATUS-04 (RED before Plan 01 Task 2 implements `updateWhatsAppStatus`)

*Existing infrastructure covers test runner setup.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| StatusBadge renders correct color and label for each status value | WASTATUS-01 | Requires browser rendering | Navigate to /settings/integrations with a connected WhatsApp number; verify badge shows correct label and color |
| Suspend button disables message processing | WASTATUS-03 | Requires live Meta webhook | Suspend connection, send WhatsApp message to bot number, verify no estimate is created |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
