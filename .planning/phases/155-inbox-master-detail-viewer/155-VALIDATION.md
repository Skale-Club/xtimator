---
phase: 155
slug: inbox-master-detail-viewer
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-05
---

# Phase 155 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.4 (unit) + Playwright (e2e, `test:e2e` script) |
| **Config file** | `vitest.config.ts` (unit), `playwright.config.ts` (e2e) |
| **Quick run command** | `npx vitest run tests/unit/admin/whatsapp-filters.test.ts tests/unit/whatsapp/admin-authority-contract.test.ts` |
| **Full suite command** | `npm test` (vitest run) + `npx playwright test tests/e2e/admin-whatsapp.spec.ts` |
| **Estimated runtime** | ~2s for the 2 scoped unit files (confirmed live — 33 tests, 100% green baseline) |

---

## Sampling Rate

- **After every task commit:** Run the 2-file scoped quick command above
- **After every plan wave:** Run `npm test` + `npx playwright test tests/e2e/admin-whatsapp.spec.ts`
- **Before `/gsd:verify-work`:** Full suite green. The e2e file's "static contract" describe block (source-string assertions) runs unconditionally and is the achievable gate when seeded admin creds (`TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD`) are unavailable — the live-nav tests (deep-link SSR selection, row-click URL update, mobile viewport) then become manual-verification items, not silently skipped/ignored.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 155-01-01 | 01 | 0 | INBOX-02 | unit (source-contract) | `npx vitest run tests/unit/whatsapp/admin-authority-contract.test.ts` | ✅ update literal call-site assertion | ⬜ pending |
| 155-01-02 | 01 | 0 | INBOX-02 | e2e (live-nav, creds-gated) | `npx playwright test tests/e2e/admin-whatsapp.spec.ts` | ❌ W0 (row-click → URL param) | ⬜ pending |
| 155-01-03 | 01 | 0 | INBOX-02 | e2e (live-nav, creds-gated) | `npx playwright test tests/e2e/admin-whatsapp.spec.ts` | ❌ W0 (direct-link SSR selection) | ⬜ pending |
| 155-01-04 | 01 | 0 | INBOX-02 | e2e or unit | `npx playwright test tests/e2e/admin-whatsapp.spec.ts` | ❌ W0 (empty-state text) | ⬜ pending |
| 155-01-05 | 01 | 0 | INBOX-02 | e2e (viewport-sized) | `npx playwright test tests/e2e/admin-whatsapp.spec.ts` | ❌ W0 (mobile collapse) | ⬜ pending |
| 155-01-06 | 01 | 0 | INBOX-02 | unit/e2e source-contract | `npx playwright test tests/e2e/admin-whatsapp.spec.ts` | ❌ W0 (no reply/send tokens) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Update the existing static-contract assertion for `loadAdminConversationThread(row.id, row.company_id)` in `tests/e2e/admin-whatsapp.spec.ts` to match the refactored call-site shape (Pitfall 1 from research — this is an edit to an EXISTING test, will fail if left as-is)
- [ ] New e2e test: clicking a conversation row updates `?conversation=<id>` and shows the thread inline (no `Sheet`/dialog role) — follows the existing `test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, ...)` gating already in this file
- [ ] New e2e test: `page.goto('/admin/inbox?conversation=<seeded-id>')` renders the thread without a prior click (SSR/prop-passthrough)
- [ ] New e2e or unit assertion: "Select a conversation" empty-state text renders when no `conversation` param is present
- [ ] New e2e test (check `playwright.config.ts` for an existing mobile project first): single-column collapse + back affordance below `md:` (768px)
- [ ] New unit/e2e source-contract assertion: `admin-whatsapp-client.tsx` (post-refactor) contains no reply/send-related identifiers (`not.toMatch(/sendMessage|reply|handleSend/i)`), mirroring the existing pattern already applied to `admin-whatsapp-accounts.tsx`
- No framework install needed — Vitest + Playwright already configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live-nav e2e assertions (row-click URL update, direct-link SSR selection, mobile viewport collapse) | INBOX-02 | These specific Playwright tests are gated behind seeded `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD` env vars per existing convention — in an environment without those creds, they are written but not executed by CI | After deploy: run with seeded admin test credentials, or manually click through `/admin/inbox` in a browser as a super admin and confirm URL updates, direct links work, and mobile view collapses correctly |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s (unit); e2e live-nav tests are creds-gated per existing convention
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-05 (autonomous run)
