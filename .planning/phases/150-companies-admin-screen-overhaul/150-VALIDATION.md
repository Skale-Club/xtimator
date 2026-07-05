---
phase: 150
slug: companies-admin-screen-overhaul
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-05
---

# Phase 150 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (project-wide, `vitest.config.ts`) |
| **Config file** | `vitest.config.ts` (jsdom environment, `tests/unit/**/*.test.ts(x)`) |
| **Quick run command** | `npx vitest run tests/unit/admin/companies --reporter=dot` |
| **Full suite command** | `npm test` (= `vitest run`) |
| **Estimated runtime** | ~5-10 seconds for the phase's own suite; several minutes for the full repo suite |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/admin/companies-*.test.ts`
- **After every plan wave:** Run `npm test` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~10 seconds (no live-DB integration harness in this repo — all tests here are static-source-contract style, same as Phase 93/85)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 150-01-01 | 01 | 0 | ADMINCO-04 | unit (static-source contract) | `npx vitest run tests/unit/admin/companies-route-gate.test.ts` | ❌ W0 | ⬜ pending |
| 150-01-02 | 01 | 0 | ADMINCO-01 | unit (static-source contract) | `npx vitest run tests/unit/admin/companies-email-search.test.ts` | ❌ W0 | ⬜ pending |
| 150-01-03 | 01 | 0 | ADMINCO-02 | unit (static-source contract) | `npx vitest run tests/unit/admin/companies-filters.test.ts` | ❌ W0 | ⬜ pending |
| 150-01-04 | 01 | 0 | ADMINCO-03 | unit (static-source contract) | `npx vitest run tests/unit/admin/companies-pagination.test.ts` | ❌ W0 | ⬜ pending |
| 150-01-05 | 01 | 0 | ADMINCO-01..04 (controls) | unit (static-source contract) | `npx vitest run tests/unit/admin/companies-controls.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/admin/companies-route-gate.test.ts` — mirrors `tests/unit/admin/events-route-gate.test.ts` exactly, retargeted at `app/admin/companies/page.tsx`; asserts `requireAdmin()` precedes `requireServiceClient()` and Demo Accounts uses an independent (non-paginated) query
- [ ] `tests/unit/admin/companies-email-search.test.ts` — asserts the email-resolution path uses `auth.admin.listUsers()` + `company_members`, and asserts NO direct `.ilike('email'` against the `companies` table
- [ ] `tests/unit/admin/companies-filters.test.ts` — asserts the tier/AI-override/demo-vs-real filter chain (`.eq`/`.is`/`.not`) is present and independently toggleable
- [ ] `tests/unit/admin/companies-pagination.test.ts` — asserts `.range()`, `{count:'exact'}`, `PAGE_SIZE = 25`, and `pageUrl()` param preservation
- [ ] `tests/unit/admin/companies-controls.test.ts` — mirrors `tests/unit/admin/events-controls.test.ts`; asserts `'use client'`, search input Enter/blur commit, filter `Select`s reset page on change, `router.refresh()` on the Refresh button
- [ ] Also add a focused case (in `companies-pagination.test.ts` or a small standalone) asserting `.in('id', [])` (the email-resolution zero-match case) returns zero rows and does NOT silently fall through to "show everyone" — per the research's flagged Open Question 2

*No framework install needed — Vitest is already configured and running against this exact directory shape (`tests/unit/admin/`).*

---

## Manual-Only Verifications

*None — all phase behaviors have automated (static-source-contract) verification, consistent with this codebase's existing testing maturity level for admin pages (no live-DB integration harness exists per the Phase 79/85 precedent).*

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 10s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-07-05 (autonomous run)
