---
phase: 21-csv-import
plan: 03
subsystem: price-book/csv-import
tags: [wave-2, tdd, green-implementation, ui-wiring, static-asset, regression-gate]
dependency_graph:
  requires:
    - 21-02: PriceBookImportDialog (two-stage pick/preview) + importPriceBookItems server action
    - 21-01: Wave 0 RED stubs + locked API contracts
    - 20-02: PriceBookList (where the Import CSV button plugs in)
  provides:
    - components/price-book/price-book-list.tsx: Import CSV button in header (next to Add Item) + in empty state; lifted importDialogOpen state opens PriceBookImportDialog
    - public/price-book-template.csv: static template file with 4-column header + 2 example rows (Labor + Materials)
    - tests/unit/price-book/price-book-list.test.tsx: extended from 10 to 12 tests (all GREEN)
  affects:
    - PB-05: requirement fully closed at unit-test level — CSV import end-to-end flow wired to page surface
tech_stack:
  added:
    - papaparse@5.5.3 (installed in Phase 21 Plan 01)
  patterns:
    - Lifted importDialogOpen state in PriceBookList mirroring existing dialogOpen pattern (Phase 20 D convention)
    - handleImportClose calls router.refresh() on close (Pitfall 5 — close BEFORE refresh, not after)
    - Import CSV button rendered in BOTH empty state (below EmptyState) and populated state (header flex group with Add Item)
    - vi.mock for PriceBookImportDialog in list test keeps the mock surface isolated from real dialog imports
key_files:
  created:
    - public/price-book-template.csv
  modified:
    - components/price-book/price-book-list.tsx
    - tests/unit/price-book/price-book-list.test.tsx
    - .planning/phases/21-csv-import/21-VALIDATION.md
decisions:
  - Import CSV button positioned in header flex group (next to Add Item) using variant="outline" per D-01/D-02
  - Empty state Import CSV button rendered as separate div below EmptyState (not as second actionLabel prop — EmptyState only supports one action)
  - handleImportClose pattern mirrors handleDialogChange (closes state, calls router.refresh) — consistent with Phase 20 close-then-refresh convention
  - vi.mock for PriceBookImportDialog added before import to prevent real dialog (with parsePriceBookCsv / papaparse) from being imported in the list test context
metrics:
  duration: 11min
  completed: "2026-05-08T00:23:57Z"
  tasks_completed: 3
  files_created: 1
  files_modified: 3
  commits: 3
requirements: [PB-05]
---

# Phase 21 Plan 03: Wave 2 UI Wiring + Template CSV + Regression Gate Summary

**One-liner:** Import CSV button wired into PriceBookList header and empty state via lifted importDialogOpen state; static template CSV served at /price-book-template.csv; 12/12 list tests GREEN; 51/51 Phase 21 unit tests GREEN; PB-05 closed end-to-end at unit-test level.

## What Was Built

### Task 1: Wire Import CSV button + PriceBookImportDialog into PriceBookList

**`components/price-book/price-book-list.tsx` — changes applied:**

1. **Lucide import updated:** Added `Upload` to existing `{ BookOpen, Search, MoreHorizontal, Plus }` import
2. **New component import:** `import { PriceBookImportDialog } from '@/components/price-book/price-book-import-dialog'`
3. **New state:** `const [importDialogOpen, setImportDialogOpen] = useState(false)` after `dialogOpen`
4. **New handler:** `handleImportClose(open: boolean)` — mirrors `handleDialogChange`, calls `router.refresh()` when closing
5. **Empty state branch:** Added Import CSV button (`<Button variant="outline" onClick={() => setImportDialogOpen(true)}>`) in `<div className="flex justify-center -mt-4">` below EmptyState; also added `<PriceBookImportDialog open={importDialogOpen} onOpenChange={handleImportClose} />` as sibling dialog
6. **Populated state header:** Wrapped right-side actions in `<div className="flex items-center gap-2">` containing the Import CSV button (outline, Upload icon) + existing Add Item button
7. **Populated state footer:** Added `<PriceBookImportDialog open={importDialogOpen} onOpenChange={handleImportClose} />` after the existing AlertDialog

**`tests/unit/price-book/price-book-list.test.tsx` — changes applied:**

1. Added `vi.mock('@/components/price-book/price-book-import-dialog')` before the import — renders `<div data-testid="price-book-import-dialog">Import Open</div>` when open, null otherwise
2. Added 2 new `it()` blocks after the existing 10:
   - `'Import CSV button renders in header'` — renders with mockItems, asserts `getByRole('button', { name: /Import CSV/i })`
   - `'empty state shows Import CSV alongside Add first item'` — renders with items=[], asserts both buttons

**TDD flow:**
- RED: Added vi.mock + 2 new tests → 2 fail, 10 pass (confirmed)
- GREEN: Implemented component changes → 12/12 pass

**Commit:** `9cf396b`

### Task 2: Create static price-book template CSV under public/

**`public/price-book-template.csv` — created:**

```
category,name,unit,unit_price
Labor,General Labor,hr,75.00
Materials,PVC Pipe 2in,ft,3.50
```

- 3 non-empty lines (header + 2 data rows)
- First line exactly `category,name,unit,unit_price` — locked column order per D-03
- Plain UTF-8, no BOM, LF line endings
- No `$` or comma thousands separators (D-05 dot-decimal only)
- Served at `/price-book-template.csv` by Next.js static file serving from `public/`
- Matches `href="/price-book-template.csv"` in `PriceBookImportDialog` (line 163) — download link now functional

**Verify:** `node -e "..."` exit code 0 — 3 lines confirmed, header matches.

**Commit:** `5f560e7`

### Task 3: Phase regression gate — full TypeScript + Vitest sweep

**Phase 21 + Phase 20 unit suite:**
```
npx vitest run tests/unit/csv tests/unit/price-book tests/unit/schemas/price-book.test.ts
```
Result: **51/51 pass, 0 failures**

| Suite | Tests | Result |
|-------|-------|--------|
| Parser (tests/unit/csv/price-book-import.test.ts) | 15/15 | GREEN |
| Dialog (tests/unit/price-book/price-book-import-dialog.test.tsx) | 10/10 | GREEN |
| Action (tests/unit/price-book/import-action.test.ts) | 8/8 | GREEN |
| List (tests/unit/price-book/price-book-list.test.tsx) | 12/12 | GREEN |
| Schema (tests/unit/schemas/price-book.test.ts) | 6/6 | GREEN |
| **Total** | **51/51** | **GREEN** |

**Full vitest suite:**
```
npx vitest run
```
Result: 363 pass, 9 failures — ALL 9 match the pre-existing baseline in `deferred-items.md`:
- `tests/unit/admin-gate.test.ts` — 2 failures (pre-existing)
- `tests/unit/globals-brand-tokens.test.ts` — 5 failures (pre-existing)
- `tests/unit/onboarding-schema.test.ts` — 2 failures (pre-existing)

No new failures introduced by Phase 21.

**TypeScript check:**
```
npx tsc --noEmit
```
Result: 1 error only — `lib/actions/price-book.ts:98` (`ctx.error: string | undefined` not assignable to `string`). This is the pre-existing error documented in 21-02-SUMMARY.md (existed before Plan 21-02, out of scope). No new TypeScript errors from Phase 21 files.

**VALIDATION.md updated:**
- `nyquist_compliant: true`
- `wave_0_complete: true`
- `status: green`
- All 9 task rows: ✅ green
- Wave 0 Requirements: all [x] checked
- Validation Sign-Off: all [x] checked, `**Approval:** approved 2026-05-08`

**Commit:** `cb5df63`

## Final Test Counts (Phase 21 complete)

| Suite | Before Plan 21-03 | After Plan 21-03 |
|-------|-------------------|------------------|
| Parser tests | 15/15 | 15/15 |
| Dialog tests | 10/10 | 10/10 |
| Action tests | 8/8 | 8/8 |
| List tests | 10/10 → extended | 12/12 |
| Schema tests | 6/6 | 6/6 |
| **Total Phase 21+20** | **49/49** | **51/51** |

## TypeScript Baseline Confirmation

Only pre-existing error: `lib/actions/price-book.ts:98` — `string | undefined` not assignable to `string` (documented in 21-02-SUMMARY, existed before Plan 21-02). No `@react-pdf/renderer` errors present in this environment (they may be env-specific or have been resolved).

Zero new TypeScript errors from Plan 21-03 changes.

## Template CSV Content Sanity

File: `public/price-book-template.csv`
- Header: `category,name,unit,unit_price` (exact, no BOM)
- Row 1: `Labor,General Labor,hr,75.00`
- Row 2: `Materials,PVC Pipe 2in,ft,3.50`
- 3 lines total, UTF-8, LF endings
- Node verify script exits with code 0

## VALIDATION.md Flip Confirmation

`21-VALIDATION.md` frontmatter after Task 3:
```yaml
status: green
nyquist_compliant: true
wave_0_complete: true
```
All 9 task rows in Per-Task Verification Map: ✅ green
Approval: `approved 2026-05-08`

## Deviations from Plan

None — plan executed exactly as written. All 3 tasks completed as specified with no deviations.

## Known Stubs

None. All Wave 0 → Wave 1 → Wave 2 transitions are complete. The Import CSV flow is fully functional:
- Template CSV exists at `/price-book-template.csv` (download link now works)
- Import CSV button triggers PriceBookImportDialog from both header and empty state
- Dialog picks file → parses → previews → confirms → bulk inserts → router.refresh()
- All paths covered by 51 unit tests

## Hand-off to `/gsd:verify-work` (Phase 21 Manual Checks)

Phase 21 is ready for verification. The following manual-only checks from `21-VALIDATION.md` should be presented to the user:

| Manual Check | Instructions |
|-------------|-------------|
| iOS Safari file picker | Open `/settings/price-book` on real iOS Safari, tap "Import CSV", choose a `.csv` from Files app, verify preview renders rows |
| Android Chrome file picker | Open `/settings/price-book` on Android Chrome, tap "Import CSV", choose `.csv` from device storage, verify preview renders rows |
| Excel CRLF roundtrip | Export 3-row CSV from Excel, import it via the dialog, verify all 3 rows appear in preview |
| Template CSV download + Excel open | Click "Download template" in Import dialog, open downloaded file in Excel, verify 4 columns and 2 example rows render properly |
| Toast tone for re-import | Import same CSV twice; verify second import toast is positive ("skipped Y duplicates") not error-like |

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| components/price-book/price-book-list.tsx contains `import { PriceBookImportDialog }` | FOUND |
| price-book-list.tsx contains `Upload` in lucide-react import | FOUND |
| price-book-list.tsx contains exactly 2 `<PriceBookImportDialog` instances | FOUND (empty state + populated state) |
| price-book-list.tsx contains `importDialogOpen` state declaration | FOUND |
| price-book-list.tsx contains 2 `setImportDialogOpen(true)` call sites | FOUND |
| price-book-list.tsx contains `handleImportClose` function | FOUND |
| price-book-list.test.tsx contains `vi.mock('@/components/price-book/price-book-import-dialog'` | FOUND |
| price-book-list.test.tsx contains exactly 12 `it(` blocks | FOUND |
| public/price-book-template.csv exists | FOUND |
| public/price-book-template.csv first line is `category,name,unit,unit_price` | CONFIRMED |
| 21-VALIDATION.md contains `nyquist_compliant: true` | CONFIRMED |
| 21-VALIDATION.md contains `wave_0_complete: true` | CONFIRMED |
| 21-VALIDATION.md contains `status: green` | CONFIRMED |
| 21-VALIDATION.md Per-Task Verification Map has zero ⬜ pending | CONFIRMED (all 9 rows ✅ green) |
| Commit 9cf396b exists | CONFIRMED |
| Commit 5f560e7 exists | CONFIRMED |
| Commit cb5df63 exists | CONFIRMED |
| 51/51 Phase 21 unit tests passing | CONFIRMED |
