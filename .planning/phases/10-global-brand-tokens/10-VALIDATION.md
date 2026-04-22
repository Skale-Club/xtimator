---
phase: 10
slug: global-brand-tokens
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-22
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --reporter=verbose` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 0 | BRAND-01, BRAND-02, BRAND-03 | unit (file snapshot) | `npm test -- --reporter=verbose tests/unit/globals-brand-tokens.test.ts` | ❌ Wave 0 | ⬜ pending |
| 10-01-02 | 01 | 1 | BRAND-01 | unit (file snapshot) | `npm test -- --reporter=verbose tests/unit/globals-brand-tokens.test.ts` | ❌ Wave 0 | ⬜ pending |
| 10-01-03 | 01 | 1 | BRAND-02 | unit (file snapshot) | `npm test -- --reporter=verbose tests/unit/globals-brand-tokens.test.ts` | ❌ Wave 0 | ⬜ pending |
| 10-01-04 | 01 | 1 | BRAND-03 | unit (file snapshot) | `npm test -- --reporter=verbose tests/unit/globals-brand-tokens.test.ts` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/globals-brand-tokens.test.ts` — file-snapshot tests for BRAND-01, BRAND-02, BRAND-03
  - Reads `app/globals.css` and asserts `224 86% 60%` is present in `:root`, `.dark`, `[data-theme]` scopes
  - Reads `app/(auth)/layout.tsx` and asserts fallback string is `224 86% 60%`
  - Reads `app/admin/layout.tsx` and asserts fallback string is `224 86% 60%`
  - Asserts old string `220 91% 60%` is absent from all three files

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Buttons visually render in brand blue `#406EF1` in dark mode | BRAND-01 | Visual color perception cannot be asserted via unit tests | Start dev server, navigate to any authenticated page in dark mode, verify button background color matches `#406EF1` |
| Focus rings show brand blue `#406EF1` | BRAND-01 | Visual focus ring verification | Tab through interactive elements in browser devtools, verify ring color |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
