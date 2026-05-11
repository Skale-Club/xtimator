---
phase: 53
slug: pdf-attachment-delivery
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-11
---

# Phase 53 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/unit/whatsapp/` |
| **Full suite command** | `npx vitest run tests/unit/` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/whatsapp/`
- **After every plan wave:** Run `npx vitest run tests/unit/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 53-01-01 | 01 | 1 | WAPDF-01 | unit | `npx vitest run tests/unit/whatsapp/delivery-format.test.ts` | ❌ W0 | ⬜ pending |
| 53-01-02 | 01 | 1 | WAPDF-02 | unit | `npx vitest run tests/unit/whatsapp/pdf-upload.test.ts` | ❌ W0 | ⬜ pending |
| 53-01-03 | 01 | 2 | WAPDF-03 | unit | `npx vitest run tests/unit/whatsapp/pdf-upload.test.ts` | ❌ W0 | ⬜ pending |
| 53-01-04 | 01 | 2 | WAPDF-04 | unit | `npx vitest run tests/unit/whatsapp/pdf-upload.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/whatsapp/pdf-upload.test.ts` — stubs for WAPDF-02, WAPDF-03, WAPDF-04
- [ ] `tests/unit/whatsapp/delivery-format.test.ts` — stub for WAPDF-01 (migration + UI option)

*Existing `tests/unit/whatsapp/confirm.test.ts` covers send/cancel flow — extend rather than duplicate.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Client receives actual PDF document in WhatsApp app | WAPDF-03 | Requires live Meta Cloud API + real phone | Set delivery_format to pdf_attachment, trigger send via WhatsApp, verify document arrives on phone |
| PDF filename and caption appear correctly | WAPDF-03 | Requires live Meta Cloud API | Same as above — check filename and caption text in received message |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
