---
phase: 20
slug: price-book-crud-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-07
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 + @testing-library/react 16.3.2 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/price-book` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/price-book`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 20-01-01 | 01 | 0 | PB-01..PB-07 | unit | `npx vitest run tests/unit/price-book` | ❌ W0 | ⬜ pending |
| 20-01-02 | 01 | 0 | PB-02/PB-03 | unit | `npx vitest run tests/unit/schemas/price-book.test.ts` | ❌ W0 | ⬜ pending |
| 20-02-01 | 02 | 1 | PB-01 | unit | `npx vitest run tests/unit/price-book` | ❌ W0 | ⬜ pending |
| 20-02-02 | 02 | 1 | PB-02/PB-03 | unit | `npx vitest run tests/unit/price-book` | ❌ W0 | ⬜ pending |
| 20-02-03 | 02 | 1 | PB-04 | unit | `npx vitest run tests/unit/price-book` | ❌ W0 | ⬜ pending |
| 20-02-04 | 02 | 1 | PB-06 | unit | `npx vitest run tests/unit/price-book` | ❌ W0 | ⬜ pending |
| 20-02-05 | 02 | 1 | PB-07 | unit | `npx vitest run tests/unit/price-book` | ❌ W0 | ⬜ pending |
| 20-03-01 | 03 | 2 | PB-01..PB-07 | build | `npx tsc --noEmit` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/price-book/price-book-list.test.tsx` — stubs for PB-01, PB-02, PB-03, PB-04, PB-06, PB-07 (follow `tests/unit/clients/client-list.test.tsx`)
- [ ] `tests/unit/schemas/price-book.test.ts` — priceBookItemSchema validations (follow `tests/unit/schemas/client.test.ts`)
- [ ] Directory `tests/unit/price-book/` must be created by Wave 0

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Category Combobox shows existing categories as suggestions | PB-02/03 | Popover + Command keyboard/click interactions require browser | Open add dialog, type in category field, verify existing categories appear as options |
| Price Book entry card visible on /settings page | D-02 | Visual layout requires browser | Navigate to /settings, verify Price Book card appears below existing tabs |
| router.refresh() updates list after add/edit/delete | PB-02/03/04 | Requires live browser session | Add item, verify it appears in list without full page reload |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
