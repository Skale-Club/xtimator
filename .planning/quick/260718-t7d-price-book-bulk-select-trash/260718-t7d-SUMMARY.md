---
phase: quick-260718-t7d
plan: 01
status: complete
subsystem: price-book
tags: [price-book, trash, soft-delete, bulk-select, supabase, migration]

# Dependency graph
requires: []
provides:
  - "Soft delete (deleted_at) on company_price_book — migration 20260718000001, applied to remote project prmqgcrnpuvpzruyzvuv"
  - "Bulk select-all per category + bulk move-to-Trash on the price book page"
  - "/trash page (sidebar entry) with Restore / Delete forever / Empty Trash"
  - "Trash-aware filters on every active-row reader (page, autocomplete, chat agent, CSV dedup)"
affects: [price-book, estimate-generation, chat-agent, csv-import, app-shell-nav]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Soft-delete via deleted_at + partial index (company_id) WHERE deleted_at IS NULL; hard delete only permitted on rows already trashed"
    - "Bulk selection as a Set<string> with a floating action bar; select-all operates on the VISIBLE (search-filtered) items of a category"

key-files:
  created:
    - supabase/migrations/20260718000001_price_book_soft_delete.sql
    - app/(app)/trash/page.tsx
    - components/trash/trash-list.tsx
    - tests/unit/trash/trash-list.test.tsx
  modified:
    - types/database.types.ts
    - lib/queries/price-book.ts
    - lib/actions/price-book.ts
    - lib/agent-tools/query-company-data.ts
    - components/price-book/price-book-list.tsx
    - components/app-shell/nav-items.ts
    - tests/unit/price-book/price-book-list.test.tsx
    - tests/unit/price-book/import-action.test.ts
    - tests/unit/agent-tools/query-company-data.test.ts
    - tests/unit/whatsapp/query-tools.test.ts
    - tests/unit/services/generate-estimate.test.ts
    - tests/eval/harness.test.ts
    - tests/eval/price-research-regression.test.ts

key-decisions:
  - "deletePriceBookItem converted to soft delete (same signature) — the single-item Delete and the bulk path both land in Trash; nothing in the price book UI can hard-delete"
  - "destroyPriceBookItems/emptyPriceBookTrash additionally filter .not('deleted_at','is',null) — an active row is structurally unreachable by hard delete"
  - "Import dedup queries exclude trashed rows so a deleted item's name can be re-imported; restore after such a re-import may produce a visible duplicate (accepted)"
  - "deleteFolder guard still counts trashed items — a category with only trashed items refuses deletion until the trash is emptied (FK would block anyway)"
  - "seedIndustryPriceBook's own row count is deliberately unfiltered — trashing your whole book does NOT re-trigger the industry seed"
  - "Six test files' supabase chain mocks synced with the new .is('deleted_at', null) step (repo pattern: fix mocks honestly, no test weakened; all previously-green assertions retained)"

patterns-established:
  - "Trash surfaces under /trash with nav demoHidden+overflow; future entity trashes (projects, clients) can join the same page"

requirements-completed: []

# Metrics
duration: ~60min
completed: 2026-07-18
---

# Quick 260718-t7d: Price book bulk select + Trash Summary

**Price book categories now have a select-all checkbox (red-box position from the user's screenshot) with per-row checkboxes and a bulk Delete; deleting moves items to a new sidebar Trash page where they can be restored or deleted forever (per item or Empty Trash). Backed by a deleted_at soft-delete column applied to the remote DB.**

## Task Commits

1. **Tasks 1-3: migration + backend + UI + tests** — `7d50d23f` (feat), 17 files, +809/−38

## Verification (actual observed output)

| Check | Expected | Actual |
| --- | --- | --- |
| `apply_migration price_book_soft_delete` (MCP, project prmqgcrnpuvpzruyzvuv) | success | `{"success":true}` |
| `npx tsc --noEmit -p tsconfig.ci.json` | 0 errors | exit 0 |
| price-book + trash suites | green | 59 passed (59) |
| All affected files (services/eval/whatsapp/agent-tools/landing) | green | 104/105 — the 1 fail is the pre-existing landing modal auto-open timing flake (passes in isolation, flips run-to-run with no code change) |

## Pre-existing failures documented (NOT from this change)

- **Node v25.6.0 + vitest 4**: `--localstorage-file` warning; Node's built-in Web Storage shadows jsdom's → `localStorage.clear is not a function` in tests/unit/tour/*, onboarding-survey, install-prompt (27 tests). Fails identically without this change; CI (different Node) unaffected.
- **landing-page modal auto-open**: timing flake under parallel load.

## Deviations from Plan

None functional. Test-mock syncs grew beyond the planned file list (6 files instead of 2) because the full-suite run surfaced every mock that stubs the company_price_book chain.

## Next Phase Readiness

- Commit LOCAL on dev (user directive: keep local). Migration IS live on the remote DB (additive, nullable — safe for the running app).
- Retention/auto-purge deliberately not implemented (user asked for view + delete-forever only); cron cleanup can be added later.
