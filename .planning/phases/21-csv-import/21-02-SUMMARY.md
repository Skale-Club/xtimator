---
phase: 21-csv-import
plan: 02
subsystem: price-book/csv-import
tags: [wave-1, tdd, green-implementation, papaparse, server-action, dialog, two-stage]
dependency_graph:
  requires:
    - 21-01: Wave 0 RED stubs + locked API contracts (parsePriceBookCsv, PriceBookImportDialog, importPriceBookItems)
    - 20-02: PriceBookItemDialog pattern (useTransition, useRouter, useEffect reset, close-then-refresh, toast)
    - 20-01: priceBookItemSchema for server-side safeParse re-validation
    - 19-02: company_price_book table (target of single bulk insert)
  provides:
    - lib/csv/price-book-import.ts: real parsePriceBookCsv (papaparse, BOM, caps, per-row classification)
    - components/price-book/price-book-import-dialog.tsx: two-stage dialog (pick -> preview -> confirm)
    - lib/actions/price-book.ts: importPriceBookItems (server-side dedup + single bulk insert)
  affects:
    - 21-03: Wave 2 wires "Import CSV" button into PriceBookList header (dialog already complete)
tech_stack:
  added: []
  patterns:
    - papaparse Papa.parse(file, { header: true, skipEmptyLines:'greedy', transformHeader }) pattern
    - BOM strip in transformHeader: h.trim().toLowerCase().replace(/^﻿/, '')
    - Extension-first type check: file.name.endsWith('.csv') as primary check (iOS Safari Pitfall 1)
    - Stage type: pick | preview internal state with useEffect reset on open prop
    - Close-then-refresh: onOpenChange(false) called BEFORE router.refresh() (Phase 20 Pitfall 5)
    - Server-side dedup: fetch existing (category,name) pairs -> JS Set -> filter survivors
    - Single bulk insert: supabase.from('company_price_book').insert(array) one transaction
    - priceBookItemSchema.safeParse for server-side re-validation (defense in depth)
    - data-testid="invalid-row" + aria-invalid="true" for invalid row markers (D-11)
key_files:
  created: []
  modified:
    - lib/csv/price-book-import.ts
    - components/price-book/price-book-import-dialog.tsx
    - lib/actions/price-book.ts
    - tests/unit/csv/price-book-import.test.ts
    - tests/unit/price-book/price-book-import-dialog.test.tsx
    - tests/unit/price-book/import-action.test.ts
decisions:
  - parsePriceBookCsv uses extension-first validation (isCsvByName OR isCsvByType) per Pitfall 1 — iOS Safari may report empty MIME for .csv files from Numbers/Excel
  - transformHeader strips BOM with replace(/^﻿/, '') in addition to papaparse's native BOM handling (belt-and-suspenders per Pitfall 2)
  - In-file duplicate key uses case-insensitive category::name concatenation; only added to seenInFile set when row has no errors
  - toBeDisabled() jest-dom matcher not available — replaced with .hasAttribute('disabled') assertion in dialog test
  - AlertTriangle lucide icon does not accept title prop in this lucide-react version — wrapped in span with title/aria-label for tooltip
  - Pre-existing TypeScript error in lib/actions/price-book.ts (ctx.error: string | undefined) is out of scope; not introduced by this plan
metrics:
  duration: 7min
  completed: "2026-05-08T00:08:24Z"
  tasks_completed: 3
  files_created: 0
  files_modified: 6
  commits: 4
requirements: [PB-05]
---

# Phase 21 Plan 02: Wave 1 GREEN Implementation Summary

**One-liner:** parsePriceBookCsv (papaparse + BOM strip + caps + per-row classification) + importPriceBookItems (server-side dedup + single bulk insert) + PriceBookImportDialog (two-stage pick/preview) — all 32 RED Wave 0 stubs turn GREEN.

## What Was Built

### Task 1: parsePriceBookCsv implementation + 14 parser stubs GREEN

**`lib/csv/price-book-import.ts` — real implementation:**

- `Papa.parse(file, { header: true, skipEmptyLines: 'greedy', transformHeader })` — handles BOM, CRLF, quoted commas natively
- `transformHeader: (h) => h.trim().toLowerCase().replace(/^﻿/, '')` — case-insensitive headers (D-04) + BOM strip (Pitfall 2)
- No `worker: true` (Pitfall 4) — 1MB/1000-row cap makes main-thread parse instant
- Extension-first type check: `file.name.endsWith('.csv')` primary, `file.type` secondary (Pitfall 1 iOS Safari)
- Size check before parse (D-15), type check before parse (D-16)
- Per-row classification: missing_category, missing_name, missing_unit_price, invalid_unit_price, negative_unit_price (D-10)
- In-file dedup: case-insensitive `category::name` Set, first occurrence wins (D-09)
- rowNumber = i + 2 (header is row 1, first data row is row 2)

**Test results:** 15/15 passed (14 RED -> GREEN + 1 constants smoke already GREEN)

**Commit:** `bf79dfe`

### Task 2: importPriceBookItems action body + 8 action stubs GREEN

**`lib/actions/price-book.ts` — importPriceBookItems filled in:**

- `getAuthContext()` reused from same-file helper (Phase 03+ convention)
- `priceBookItemSchema.safeParse(row)` for every row (server-side re-validation, defense in depth)
- Empty rows → `{ error: 'No valid rows to import.' }` without touching Supabase
- Fetch existing `(category, name)` pairs for company in one query (`select('category, name').eq('company_id', ...)`)
- Case-insensitive dedup Set: `${r.category.toLowerCase()}::${r.name.toLowerCase()}` (D-08, D-19)
- Single bulk `supabase.from('company_price_book').insert(array)` — one transaction (D-17)
- Blank `unit`/`notes` coerced to `null` in insert payload (not empty string)
- `revalidatePath('/settings/price-book')` on success
- Return `{ data: { imported, skipped } } | { error }` (D-18)
- Import changed from `import type { PriceBookItemFormValues }` to `import { priceBookItemSchema, type PriceBookItemFormValues }` to allow value use

**Test results:** 8/8 passed; Phase 20 regression 16/16 still GREEN

**Commit:** `66a45d8`

### Task 3: PriceBookImportDialog two-stage implementation + 10 component stubs GREEN

**`components/price-book/price-book-import-dialog.tsx` — full implementation (247 lines):**

Stage 1 (pick):
- Native `<input type="file">` hidden, triggered by Button click
- `accept=".csv,text/csv,application/vnd.ms-excel"` (Pitfall 1)
- Format hint: `Required columns: category, name, unit, unit_price · max 1 MB · max 1000 rows`
- Template download link: `<a href="/price-book-template.csv" download>` (D-07)
- Fatal error inline with `AlertTriangle` icon (D-14)

Stage 2 (preview):
- Summary banner: `X valid · Y invalid · Z duplicates` (D-12)
- Scrollable table of ALL parsed rows
- Invalid rows: `data-testid="invalid-row"`, `aria-invalid="true"`, `className="bg-destructive/10"` (D-11)
- Duplicate rows: `opacity-50` visual marker
- Per-row error tooltip via `span title` attribute

Confirm flow:
- `useEffect([open])` resets stage to pick on reopen (Pitfall 3)
- `startTransition(async () => importPriceBookItems(validRows))` (D-13 — only valid rows)
- `toast.error(result.error)` on failure
- `toast.success(...)` then `onOpenChange(false)` then `router.refresh()` on success (Pitfall 5 — close BEFORE refresh)
- Confirm button `disabled={validCount === 0 || isPending}` (D-12)

**Test deviation:** `toBeDisabled()` (jest-dom) not available in this vitest setup — replaced with `.hasAttribute('disabled')` which is equivalent.

**Test results:** 10/10 passed

**Full sweep:** 49/49 passed (15 parser + 10 dialog + 8 action + 10 list + 6 schema)

**Commits:** `e9b76f8`, `8530ab5` (TS fix)

## Final Test Counts

| Suite | Tests | Result |
|-------|-------|--------|
| Parser (tests/unit/csv/price-book-import.test.ts) | 15/15 | GREEN |
| Dialog (tests/unit/price-book/price-book-import-dialog.test.tsx) | 10/10 | GREEN |
| Action (tests/unit/price-book/import-action.test.ts) | 8/8 | GREEN |
| Phase 20 regression (list + schema) | 16/16 | GREEN |
| **Total** | **49/49** | **GREEN** |

## API Contract Verification

All three public APIs locked in Plan 21-01 were honoured without drift:

| Export | Contract from 21-01 | Implemented |
|--------|---------------------|-------------|
| `parsePriceBookCsv(file: File): Promise<ParseOutcome>` | LOCKED | Signature unchanged |
| `PriceBookImportDialog({ open, onOpenChange })` | LOCKED | Props unchanged |
| `importPriceBookItems(rows: PriceBookItemFormValues[])` | LOCKED | Signature unchanged |
| `REQUIRED_HEADERS`, `MAX_ROWS`, `MAX_BYTES` | LOCKED | Constants unchanged |
| `ParsedRow`, `ParseOutcome`, `RowError` | LOCKED | Types unchanged |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `toBeDisabled()` jest-dom matcher not available**
- **Found during:** Task 3
- **Issue:** `toBeDisabled()` is a `@testing-library/jest-dom` matcher not available in this vitest setup (no jest-dom setupFile)
- **Fix:** Replaced with `expect(btn.hasAttribute('disabled')).toBe(true)` — equivalent assertion, no false positives
- **Files modified:** `tests/unit/price-book/price-book-import-dialog.test.tsx`
- **Commit:** `e9b76f8`

**2. [Rule 1 - Bug] `title` prop not accepted on AlertTriangle lucide-react icon**
- **Found during:** Task 3 TypeScript compile check
- **Issue:** `LucideProps` does not include `title` prop in this lucide-react version — introduced new TS error
- **Fix:** Wrapped AlertTriangle in `<span title="..." aria-label="...">` — tooltip behaviour preserved
- **Files modified:** `components/price-book/price-book-import-dialog.tsx`
- **Commit:** `8530ab5`

**Pre-existing TypeScript error (out of scope):** `lib/actions/price-book.ts:98` — `ctx.error: string | undefined` not assignable to `string`. This existed before Plan 21-02 (verified by git stash check) and is not introduced by this plan. Deferred.

## Known Stubs

None — all Wave 0 stubs replaced with real implementations. The dialog, parser, and action are fully functional at the unit-test level.

The `public/price-book-template.csv` static file referenced by the template download link (`/price-book-template.csv`) does NOT exist yet. Plan 21-03 creates it per D-07. The link is wired correctly; it just returns 404 until Plan 21-03.

## Hand-off to Plan 21-03 (Wave 2)

Wave 2 wires the completed dialog into the existing UI:

1. **`components/price-book/price-book-list.tsx`** — add `isImportOpen` state + "Import CSV" button next to "Add Item" + render `<PriceBookImportDialog>` (D-01, D-02)
2. **`public/price-book-template.csv`** — create static template file (D-07) so the download link works
3. **Extend `tests/unit/price-book/price-book-list.test.tsx`** — 2 new assertions: "Import CSV button renders in header" + "empty state shows Import CSV"
4. **Final regression sweep** — `npx vitest run` full suite

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| lib/csv/price-book-import.ts exists and >= 80 lines | FOUND (113 lines) |
| components/price-book/price-book-import-dialog.tsx exists and >= 180 lines | FOUND (247 lines) |
| lib/actions/price-book.ts contains priceBookItemSchema.safeParse | FOUND |
| lib/actions/price-book.ts contains from('company_price_book').insert | FOUND |
| lib/actions/price-book.ts still has createPriceBookItem, updatePriceBookItem, deletePriceBookItem | FOUND |
| tests/unit/csv contains zero expect.fail('not implemented') | CONFIRMED |
| tests/unit/price-book/price-book-import-dialog.test.tsx contains zero expect.fail | CONFIRMED |
| tests/unit/price-book/import-action.test.ts contains zero expect.fail | CONFIRMED |
| Commit bf79dfe exists | FOUND |
| Commit 66a45d8 exists | FOUND |
| Commit e9b76f8 exists | FOUND |
| Commit 8530ab5 exists | FOUND |
| 49/49 tests passing | CONFIRMED |
