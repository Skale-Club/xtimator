---
phase: 12
slug: i18n-translation-system
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-24
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 + React Testing Library (jsdom) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/i18n/` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/i18n/`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 12-01-01 | 01 | 0 | I18N-01, I18N-02 | unit | `npx vitest run tests/unit/i18n/language-context.test.tsx` | ❌ W0 | ⬜ pending |
| 12-01-02 | 01 | 0 | I18N-03, I18N-04, I18N-06 | unit | `npx vitest run tests/unit/i18n/use-translation.test.ts` | ❌ W0 | ⬜ pending |
| 12-01-03 | 01 | 0 | I18N-01 | unit | `npx vitest run tests/unit/components/language-toggle.test.tsx` | ❌ W0 | ⬜ pending |
| 12-01-04 | 01 | 0 | I18N-07 | unit | `npx vitest run tests/unit/components/translation-loading-overlay.test.tsx` | ❌ W0 | ⬜ pending |
| 12-02-01 | 02 | 0 | I18N-05 | unit | `npx vitest run tests/unit/translate-route.test.ts` | ❌ W0 | ⬜ pending |
| 12-02-02 | 02 | 1 | I18N-08 | integration | `supabase db push` then `supabase db diff` | N/A — manual | ⬜ pending |
| 12-03-01 | 03 | 1 | I18N-01, I18N-02 | unit | `npx vitest run tests/unit/i18n/language-context.test.tsx` | ❌ W0 | ⬜ pending |
| 12-03-02 | 03 | 2 | I18N-03, I18N-04 | unit | `npx vitest run tests/unit/i18n/use-translation.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/i18n/language-context.test.tsx` — covers I18N-01, I18N-02 (localStorage persistence, mount hydration)
- [ ] `tests/unit/i18n/use-translation.test.ts` — covers I18N-03, I18N-04, I18N-06 (EN passthrough, static dict lookup, mem cache)
- [ ] `tests/unit/components/language-toggle.test.tsx` — covers I18N-01 (EN→PT→ES→EN cycle)
- [ ] `tests/unit/components/translation-loading-overlay.test.tsx` — covers I18N-07 (renders on pendingCount > 0)
- [ ] `tests/unit/translate-route.test.ts` — covers I18N-05 (DB cache hit, AI translate miss, onConflict)

Template: `tests/unit/components/theme-toggle.test.tsx` — same vi.mock pattern for context, same jsdom render approach.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DB migration creates `translations` table with unique index | I18N-08 | Requires live Supabase connection | Run `supabase db push`, then verify table exists and unique index fires on duplicate insert |
| Language toggle appears in topbar and bottom-nav on mobile | I18N-01 | Visual placement requires browser | Open authenticated app on mobile viewport; confirm toggle is visible in both topbar and bottom nav |
| No flicker on page reload when PT/ES selected | I18N-02 | Visual timing issue | Set language to PT, reload, observe — should not flash EN before PT loads |
| `TranslationLoadingOverlay` appears only on first dynamic fetch | I18N-07 | Session state behavior | Switch to PT, navigate to a page with dynamic strings; overlay should appear once then disappear on repeat visit |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
