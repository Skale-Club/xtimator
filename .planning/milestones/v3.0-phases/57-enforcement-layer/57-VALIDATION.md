---
phase: 57
slug: enforcement-layer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-13
---

# Phase 57 — Validation Strategy

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/unit/api/generate-estimate-quota.test.ts tests/unit/api/analyze-photos-quota.test.ts` |
| **Full suite command** | `npx vitest run tests/unit/` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Quick run command above
- **After every plan wave:** `npx vitest run tests/unit/`
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 57-01-01 | 01 | 1 | QUOTA-03, QUOTA-04, QUOTA-06 | unit | `npx vitest run tests/unit/api/generate-estimate-quota.test.ts` | ❌ W0 | ⬜ pending |
| 57-01-02 | 01 | 1 | QUOTA-03, QUOTA-06 | unit | `npx vitest run tests/unit/api/generate-estimate-quota.test.ts` | ❌ W0 | ⬜ pending |
| 57-01-03 | 01 | 1 | QUOTA-04, QUOTA-06 | unit | `npx vitest run tests/unit/api/analyze-photos-quota.test.ts` | ❌ W0 | ⬜ pending |
| 57-02-01 | 02 | 2 | QUOTA-05, QUOTA-06 | unit | `npx vitest run tests/unit/whatsapp/handler.test.ts` | ⚠️ exists | ⬜ pending |
| 57-02-02 | 02 | 2 | QUOTA-05 | unit | `npx vitest run tests/unit/whatsapp/handler.test.ts` | ⚠️ exists | ⬜ pending |

---

## Wave 0 Requirements

- [ ] `tests/unit/api/generate-estimate-quota.test.ts` — stubs for QUOTA-03 + QUOTA-06 (RED before Task 2)
- [ ] `tests/unit/api/analyze-photos-quota.test.ts` — stubs for QUOTA-04 + QUOTA-06 (RED before Task 3)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 402 response shown in browser UI | QUOTA-06 | Requires BILLING-05 (Phase 59) for full UX | Confirm JSON body `{ error: 'plan_limit_reached', upgradeUrl: '/settings/billing' }` via network inspector |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
