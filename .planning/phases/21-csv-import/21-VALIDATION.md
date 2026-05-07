---
phase: 21
slug: csv-import
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-07
---

# Phase 21 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.4 + @testing-library/react 16.3.2 + jsdom 29.0.2 |
| **Config file** | `vitest.config.ts` (root) — `environment: 'jsdom'`, `setupFiles: ['tests/setup/load-env.ts']`, alias `@` → project root, `server-only` aliased to empty stub |
| **Quick run command** | `npx vitest run tests/unit/csv tests/unit/price-book` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~7s for quick, ~25s for full suite |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/csv tests/unit/price-book`
- **After every plan wave:** Run `npx vitest run` (full suite)
- **Before `/gsd:verify-work`:** Full suite must be green (modulo `deferred-items.md` baseline)
- **Max feedback latency:** ~7 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 21-01-01 | 01 | 0 | PB-05 (SC-1/SC-4 stubs) | unit + component | `npx vitest run tests/unit/csv/price-book-import.test.ts tests/unit/price-book/price-book-import-dialog.test.tsx` | ❌ W0 | ⬜ pending |
| 21-01-02 | 01 | 0 | PB-05 (action stubs) | unit | `npx vitest run tests/unit/price-book/import-action.test.ts` | ❌ W0 | ⬜ pending |
| 21-01-03 | 01 | 0 | PB-05 (npm install) | n/a | `cat package.json | grep papaparse` | ❌ W0 | ⬜ pending |
| 21-02-01 | 02 | 1 | PB-05 (SC-1, parser) | unit | `npx vitest run tests/unit/csv/price-book-import.test.ts` | ❌ W0 → ✅ | ⬜ pending |
| 21-02-02 | 02 | 1 | PB-05 (SC-2, dialog) | component | `npx vitest run tests/unit/price-book/price-book-import-dialog.test.tsx` | ❌ W0 → ✅ | ⬜ pending |
| 21-02-03 | 02 | 1 | PB-05 (SC-3, action) | unit | `npx vitest run tests/unit/price-book/import-action.test.ts` | ❌ W0 → ✅ | ⬜ pending |
| 21-03-01 | 03 | 2 | PB-05 (UI wire) | component | extend `tests/unit/price-book/price-book-list.test.tsx` "Import CSV button renders in header" | ✅ extends | ⬜ pending |
| 21-03-02 | 03 | 2 | PB-05 (template file) | smoke | `test -f public/price-book-template.csv` | ❌ W2 | ⬜ pending |
| 21-03-03 | 03 | 2 | PB-05 (full suite) | regression | `npx vitest run && npx tsc --noEmit` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/csv/price-book-import.test.ts` — RED stubs for parser (BOM, missing column, file too large, too many rows, in-file dup, case-insensitive headers)
- [ ] `tests/unit/price-book/price-book-import-dialog.test.tsx` — RED stubs for dialog (file change → parse, preview renders all rows, cancel-no-call, confirm filters invalid, invalid row error indicator)
- [ ] `tests/unit/price-book/import-action.test.ts` — RED stubs for server action (calls supabase.insert with array, skips duplicates against existing rows)
- [ ] `lib/csv/price-book-import.ts` — module skeleton (parser entrypoint exported, returns `{ rows, errors, fatal }` shape)
- [ ] `components/price-book/price-book-import-dialog.tsx` — component skeleton (default export `PriceBookImportDialog`)
- [ ] `lib/actions/price-book.ts` — `importPriceBookItems` export added (skeleton stub `throw new Error('not implemented')`)
- [ ] `bun add papaparse @types/papaparse` (or `npm install` equivalent) — D-20

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Mobile file picker on iOS Safari delivers a `.csv` file | PB-05 SC-1 | iOS Files app may report empty `file.type` despite valid CSV — automated jsdom tests can't simulate the device | Open `/settings/price-book` on real iOS Safari, tap "Import CSV", choose a `.csv` from Files app, verify preview renders rows |
| Mobile file picker on Android Chrome delivers a `.csv` file | PB-05 SC-1 | Same — real device variance | Open `/settings/price-book` on Android Chrome, tap "Import CSV", choose a `.csv` from device storage, verify preview renders rows |
| Excel-exported CSV with CRLF line endings parses correctly | PB-05 SC-1 | Excel adds CRLF by default; jsdom test fixtures usually LF — visual verification confirms papaparse handles both | Export a 3-row test CSV from Excel, import it, verify all 3 rows appear |
| Downloadable template (`/price-book-template.csv`) opens cleanly in Excel | PB-05 SC-1 (UX) | Browser → Excel handoff is OS-specific | Click "Download template" link, open downloaded file in Excel, verify columns and example rows render properly |
| Toast summary copy ("Imported X, skipped Y duplicates") feels actionable, not error-like | PB-05 (UX) | Tone/copy review is human-only | Re-import same CSV twice, verify second import shows positive-toned skip message (not red error) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references (3 new test files + 3 new source files + npm install)
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter (after Wave 0 lands RED)

**Approval:** pending
