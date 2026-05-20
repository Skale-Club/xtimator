# Phase 76: Price Book CSV Pro - Context

**Gathered:** 2026-05-20
**Status:** Ready for planning
**Mode:** Auto-generated (skip_discuss=true; spec authored in ROADMAP entry)

<domain>
## Phase Boundary

Replace the current single-dialog CSV import (Phase 21 baseline) with a polished 4-step wizard that gracefully handles real-world messy spreadsheets exported from QuickBooks, Excel, Google Sheets. A non-technical contractor should paste their existing file and end with a clean Price Book — no pre-massaging required.

**In scope:**
- 4-step wizard UX (Upload → Map columns → Preview+edit → Confirm+result)
- Column header auto-detect with alias dictionary + manual override
- Per-row inline editing in preview table
- Locale-aware currency parsing (US/BR/plain/quoted variants)
- Duplicate resolution strategy (Skip/Update/Suffix-as-new)
- Dry-run summary BEFORE any DB write
- 5-min undo window via new `price_book_imports` table
- Streaming progress for files >200 rows (chunked inserts)
- Error CSV download for failed rows
- Unit + Playwright E2E coverage

**Out of scope:**
- Scheduled imports / recurring sync
- Google Sheets API integration
- AI-powered field normalization (deterministic alias matching only)

</domain>

<decisions>
## Implementation Decisions (locked)

### Wizard architecture
- **State machine via `useReducer`** — single source of truth for current step + parsed data + mapping + preview rows + dedupe strategy + import result
- **Persistence on close** — partial wizard state cached in `sessionStorage` under `xtimator:price-book-import:draft:v1` so reopening resumes
- **Step indicator** — visual progress (1 of 4) with clickable backtracking to previous steps
- **All steps client-side until step 4** — preview/edit/validation happens in browser; only the final confirmed dataset goes to server

### Column mapping
- **Alias dictionary** in `lib/csv/price-book-aliases.ts`:
  - `name`: item, service, description, desc, product, line item
  - `unit_price`: price, cost, rate, amount, value, $
  - `folder`: category, group, section, type
  - `unit`: uom, qty unit, measure, units of measure, measurement
  - `notes`: comments, description (lower priority — falls back if name matched first)
- **User override** via `<Select>` per column showing detected guess + alternatives + "Skip this column"
- **Unmapped columns** explicitly shown as "Skip" with grey styling

### Locale-aware currency parsing
- Auto-detect via sample of first 5 numeric values
- 3 modes: US (`,` thousands, `.` decimals), BR (`.` thousands, `,` decimals), Plain (no separators)
- Override dropdown in UI; "Custom" lets user pick decimal + thousands separator manually
- Strip currency symbols `$ R$ €` before parsing
- Round to 2 decimals; reject negative; allow 0 (free item, edge case)

### Duplicate resolution
- **Global strategy radio** on preview screen — affects all duplicates by default
- **Per-row override dropdown** on the dupe row itself
- 3 strategies:
  - `skip` — don't import (default safe choice)
  - `update` — overwrite unit/unit_price/notes on existing row (keeps id)
  - `new` — import as `name (2)`, then `(3)`, etc.
- Dupe detection key: `(company_id, folder_id, lower(name))`

### Undo system
- **New DB table `price_book_imports`** (migration in plan 76-01):
  - `id UUID PK`, `company_id UUID FK`, `actor_id UUID FK`, `created_at TIMESTAMPTZ`
  - `inserted_item_ids UUID[]`, `updated_item_ids UUID[]`, `inserted_folder_ids UUID[]`
  - `summary JSONB` (insert count, update count, skip count, source filename)
  - Index on `(company_id, created_at DESC)` for "find latest import"
- **Undo button** on price-book page → calls `undoLastImport(importId)` server action → deletes `inserted_item_ids` + `inserted_folder_ids`, restores pre-update values for `updated_item_ids` from a `prev_state JSONB` column
- **5-min eligibility window** enforced server-side via `created_at > now() - interval '5 minutes'`
- Toast confirmation with rows-removed count

### Streaming progress for large files
- Server action accepts `chunkIndex` + `totalChunks` + `chunkSize=50`
- Client iterates: sends chunk → updates progress state → next chunk
- Cancel button aborts client loop (already-inserted chunks stay — Phase 1 we don't rollback partials; can add later)
- UI shows "Importing X of Y…" + filled progress bar

### Error report download
- After server commit, response includes `failedRows: ImportRow[]` with `error_reason` populated
- Client builds CSV with original columns + `error_reason` last column
- Download via `URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))` + anchor click

### Tests
- Unit:
  - `tests/unit/csv/aliases.test.ts` — 8+ cases for header auto-detect
  - `tests/unit/csv/locale-parsing.test.ts` — 12+ cases for currency parsing
  - `tests/unit/csv/dedupe.test.ts` — 6+ cases (3 strategies × 2+ scenarios)
  - `tests/unit/csv/wizard-state-machine.test.ts` — 6+ cases (step nav, persist+restore, error transitions)
- E2E:
  - `tests/e2e/price-book-import-wizard.spec.ts` — happy path with 50-row fixture file uploaded, walking all 4 steps

### Claude's discretion
- Exact step layout (single page with state vs Next.js parallel routes — likely single page; simpler)
- Whether to use `react-hook-form` for mapping step or vanilla state (vanilla likely cleaner — only 4-5 fields)
- Whether to add an "import history" page now or defer (likely defer — undo button on main page covers the 5-min window)

</decisions>

<code_context>
## Existing Code Insights (baseline from Phase 21)

### Reusable Assets (Phase 21 — existing)
- `components/price-book/price-book-import-dialog.tsx` (310 lines) — current single-dialog UI to be replaced
- `lib/csv/price-book-import.ts` (130 lines) — `parsePriceBookCsv` + types — keep parsing, extend with locale + alias support
- `lib/actions/price-book.ts` (349 lines) — has `importPriceBookItems` + `resolveOrCreateFolders` server actions — extend with `commitImport` (new), `undoLastImport` (new)
- `tests/unit/csv/price-book-import.test.ts` — existing parser tests; extend
- `tests/unit/price-book/price-book-import-dialog.test.tsx` — existing dialog tests; will be rewritten

### Established Patterns
- 'use client' for any wizard step component
- shadcn primitives: `Dialog`, `Table`, `Button`, `Select`, `Input`, `Alert`, `RadioGroup`
- Phase 71 design system: `<Card variant="glass">` for wizard container, `gradient-brand` for primary CTAs
- Toast feedback via `sonner` (`toast.success` / `toast.error`)
- Server actions return `{ ok: true } | { ok: false, message }`
- i18n via `useTranslation()` `t()`
- Forms use `react-hook-form + zod` when complex

### Integration Points
- Entry: "Import CSV" button on `/price-book` page (already exists per current dialog)
- Server actions in `lib/actions/price-book.ts`
- New migration: `supabase/migrations/{ts}_price_book_imports.sql`
- TypeScript types regen after migration via `supabase gen types`

</code_context>

<specifics>
## Specific Ideas

**The 10 success criteria from ROADMAP are authoritative.** Plans target each:

1. **PB-CSV-01:** 4-step wizard with step indicator + close-resume
2. **PB-CSV-02:** Column auto-detect via alias dict + override dropdowns
3. **PB-CSV-03:** Per-row inline editing with inline error display
4. **PB-CSV-04:** Locale-aware currency parsing (US/BR/Plain/Custom)
5. **PB-CSV-05:** Duplicate resolution (Skip/Update/Suffix) global + per-row
6. **PB-CSV-06:** Dry-run summary card before commit
7. **PB-CSV-07:** `price_book_imports` table + 5-min undo
8. **PB-CSV-08:** Streaming progress for >200 rows + cancel
9. **PB-CSV-09:** Error CSV download
10. **PB-CSV-10:** Unit (4 files, 32+ cases) + Playwright E2E

**Plan structure (5 plans across 4 waves):**

- **76-01 — DB + foundations:** migration for `price_book_imports` table, types regen, alias dictionary, locale parser, Wave 0 RED tests for csv/aliases/locale/dedupe/wizard-state
- **76-02 — Parser + dedupe + wizard state machine (logic):** extend `parsePriceBookCsv` with alias mapping + locale parsing; new dedupe util; useReducer for wizard. Turns 75% of RED tests GREEN.
- **76-03 — Wizard UI (4 steps):** new `PriceBookImportWizard` component with Step1Upload, Step2Map, Step3Preview, Step4Confirm. Replaces `price-book-import-dialog.tsx` (delete old).
- **76-04 — Server side: chunked import, undo action, error CSV:** `commitImportChunk` action with chunk pagination; `undoLastImport` action with 5-min gate; error CSV builder utility.
- **76-05 — E2E + i18n + closeout:** Playwright spec with 50-row fixture, i18n verification, UAT runbook, final summary.

</specifics>

<deferred>
## Deferred Ideas

- Scheduled imports / Google Sheets sync — future seed
- AI field normalization (LLM-powered mapping when alias dict misses) — future enhancement
- Multi-batch undo (undo more than just the last) — for now 5-min window covers user error
- Cross-device import history — DB persistence already there, just no UI; can add later
- Cost/margin column — current schema is unit_price only, no cost; out of scope

</deferred>
