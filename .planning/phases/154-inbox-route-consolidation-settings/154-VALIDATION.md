---
phase: 154
slug: inbox-route-consolidation-settings
status: draft
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-05
---

# Phase 154 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 (unit) + Playwright (e2e, `test:e2e` script) |
| **Config file** | `vitest.config.ts` (unit), `playwright.config.ts` (e2e) |
| **Quick run command** | `npx vitest run tests/unit/admin/whatsapp-filters.test.ts tests/unit/admin/whatsapp-account-actions.test.ts tests/unit/admin/whatsapp-templates.test.ts tests/unit/whatsapp/admin-authority-contract.test.ts tests/unit/settings/tenant-whatsapp-surface.test.ts` |
| **Full suite command** | `npm test` (vitest run, full unit suite) |
| **Estimated runtime** | ~3s for the 5 scoped files (confirmed live during research — 67 tests, 100% green baseline) |

---

## Sampling Rate

- **After every task commit:** Run the 5-file scoped quick command above
- **After every plan wave:** Run `npm test` (full suite) + `npx playwright test tests/e2e/admin-whatsapp.spec.ts`
- **Before `/gsd:verify-work`:** Full suite green (67/67 baseline tests + any new/updated assertions)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 154-01-01 | 01 | 0 | INBOX-01 | unit | `npx vitest run tests/unit/admin/whatsapp-filters.test.ts` | ✅ update paths | ⬜ pending |
| 154-01-02 | 01 | 0 | INBOX-01 | e2e | `npx playwright test tests/e2e/admin-whatsapp.spec.ts` | ✅ update paths | ⬜ pending |
| 154-01-03 | 01 | 0 | INBOX-03 | unit | `npx vitest run tests/unit/admin/whatsapp-account-actions.test.ts` | ✅ update revalidatePath target | ⬜ pending |
| 154-01-04 | 01 | 0 | INBOX-04 | unit | `npx vitest run tests/unit/settings/tenant-whatsapp-surface.test.ts` | ✅ update path assertion | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — existing test infrastructure already covers all phase requirements; all 6 affected test files exist today and a live baseline run (during research) confirmed 100% green (67/67) before any change. No new fixtures, no framework install.

---

## Manual-Only Verifications

*None — all phase behaviors have automated verification (unit source-contract tests + the e2e redirect/nav spec).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (none missing)
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-05 (autonomous run)
