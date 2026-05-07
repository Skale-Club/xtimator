---
phase: 21-csv-import
plan: 01
subsystem: price-book/csv-import
tags: [wave-0, tdd, red-stubs, papaparse, server-action, dialog]
dependency_graph:
  requires:
    - 20-02: PriceBookItemDialog pattern (Dialog open/onOpenChange, vi.mock conventions)
    - 20-01: priceBookItemSchema + PriceBookItemFormValues (reused as parser output type)
    - 19-02: company_price_book schema + RLS (table targeted by importPriceBookItems)
  provides:
    - lib/csv/price-book-import.ts: parsePriceBookCsv public API contract (locked for Wave 1)
    - components/price-book/price-book-import-dialog.tsx: PriceBookImportDialog skeleton (locked props)
    - lib/actions/price-book.ts: importPriceBookItems export (locked signature for Wave 1)
    - tests/unit/csv/price-book-import.test.ts: 14 RED stubs + 1 GREEN constants smoke
    - tests/unit/price-book/price-book-import-dialog.test.tsx: 10 RED component stubs
    - tests/unit/price-book/import-action.test.ts: 8 RED action stubs
  affects:
    - 21-02: Wave 1 GREEN implementation fills in the 32 RED stubs
tech_stack:
  added:
    - papaparse@5.5.3 (dependencies) — client-side CSV parsing, D-20 locked
    - "@types/papaparse@5.5.2" (devDependencies) — TypeScript types for papaparse
  patterns:
    - Wave 0 RED stub pattern (expect.fail + import lock from Phase 12-i18n-translation-system)
    - Chainable Supabase mock helper (makeSupabase factory, per-call-order routing for company_price_book)
    - vi.mock('@/lib/csv/price-book-import') in component tests to avoid real papaparse in jsdom (Pitfall 6)
key_files:
  created:
    - lib/csv/price-book-import.ts
    - components/price-book/price-book-import-dialog.tsx
    - tests/unit/csv/price-book-import.test.ts
    - tests/unit/price-book/price-book-import-dialog.test.tsx
    - tests/unit/price-book/import-action.test.ts
  modified:
    - lib/actions/price-book.ts (importPriceBookItems stub appended)
    - package.json (papaparse + @types/papaparse added)
    - package-lock.json
decisions:
  - papaparse@5.5.3 installed via npm (D-20 locked) — handles BOM, CRLF, RFC-4180 quoting natively
  - parsePriceBookCsv stub returns { ok: false, fatal: 'parse_error', detail: 'not implemented (Wave 0 stub)' } so any caller before Wave 1 fails loudly
  - importPriceBookItems stub returns { error: 'not implemented (Wave 0 stub)' } — same principle
  - makeSupabase factory uses priceBookCalls counter to route first company_price_book call to existingChain and subsequent calls to insertChain
  - void suppression pattern used in test files to silence unused-import TS warnings on Wave 0 stubs
metrics:
  duration: 4min
  completed: "2026-05-07T23:57:52Z"
  tasks_completed: 3
  files_created: 5
  files_modified: 3
  commits: 3
requirements: [PB-05]
---

# Phase 21 Plan 01: Wave 0 RED Stubs + Source Skeletons Summary

**One-liner:** papaparse installed + 32 Wave 0 RED stubs (14 parser + 10 dialog + 8 action) with locked public API skeletons ready for Wave 1 GREEN fill-in.

## What Was Built

### Task 1: papaparse install + parser-util skeleton + 14 RED parser tests

**papaparse installed:** `papaparse@5.5.3` (dependencies) + `@types/papaparse@5.5.2` (devDependencies)

**`lib/csv/price-book-import.ts` — locked public API:**

```typescript
export const REQUIRED_HEADERS = ['category', 'name', 'unit', 'unit_price'] as const
export const MAX_ROWS = 1000
export const MAX_BYTES = 1024 * 1024 // 1 MB

export type RowError = 'missing_category' | 'missing_name' | 'missing_unit_price' | 'invalid_unit_price' | 'negative_unit_price'
export interface ParsedRow { rowNumber: number; values: PriceBookItemFormValues; errors: RowError[]; isDuplicateInFile: boolean }
export type ParseOutcome = { ok: true; rows: ParsedRow[]; validCount: number; invalidCount: number; inFileDuplicateCount: number } | { ok: false; fatal: '...' ; detail: string }
export function parsePriceBookCsv(_file: File): Promise<ParseOutcome>  // stub
```

**Test results:** 14 failed (RED) + 1 passed (constants smoke GREEN) — intentional

**Commit:** `776b5a4`

### Task 2: PriceBookImportDialog skeleton + 10 RED component tests

**`components/price-book/price-book-import-dialog.tsx` — locked props:**

```typescript
export interface PriceBookImportDialogProps { open: boolean; onOpenChange: (open: boolean) => void }
export function PriceBookImportDialog({ open, onOpenChange }: PriceBookImportDialogProps): JSX.Element
```

**Mock patterns established for Wave 1:**
- `vi.mock('@/lib/csv/price-book-import')` — mocks parsePriceBookCsv so component tests don't run real papaparse (per RESEARCH Pitfall 6)
- `vi.mock('@/lib/actions/price-book')` — mocks importPriceBookItems + re-exports others as no-op
- `vi.mock('next/navigation')` + `vi.mock('sonner')` — canonical Phase 20 pattern

**Test results:** 10/10 failed (RED) — intentional

**Commit:** `0fcc948`

### Task 3: importPriceBookItems stub + 8 RED action tests

**`lib/actions/price-book.ts` — importPriceBookItems appended (existing exports untouched):**

```typescript
export async function importPriceBookItems(rows: PriceBookItemFormValues[]): Promise<{ data: { imported: number; skipped: number } } | { error: string }>
// stub returns { error: 'not implemented (Wave 0 stub)' }
```

**Chainable Supabase mock helper established:**
- `makeSupabase({ claims, company, existing, insertResult })` factory
- Routes `from('companies')` → companyChain, first `from('company_price_book')` → existingChain (SELECT), second → insertChain (INSERT)
- `priceBookCalls` counter tracks call order

**Test results:** 8/8 failed (RED) — intentional

**Commit:** `579cb36`

## Wave 0 RED Count

| File | Stubs | Result |
|------|-------|--------|
| tests/unit/csv/price-book-import.test.ts | 14 RED + 1 GREEN smoke | Pass |
| tests/unit/price-book/price-book-import-dialog.test.tsx | 10 RED | Pass |
| tests/unit/price-book/import-action.test.ts | 8 RED | Pass |
| **Total** | **32 RED + 1 GREEN** | **Nyquist-compliant** |

## Regression Check

Phase 20 tests after Task 3: **16/16 passed** (price-book-list.test.tsx + price-book.test.ts). No regression from appending `importPriceBookItems` to lib/actions/price-book.ts.

## TypeScript Compile

`npx tsc --noEmit 2>&1 | grep -v "@react-pdf" | grep -v "estimate-pdf.tsx"` — **zero errors**. Pre-existing @react-pdf baseline unchanged.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

The following are intentional Wave 0 stubs (Wave 1 fills them in):

- `lib/csv/price-book-import.ts` — `parsePriceBookCsv` body returns `{ ok: false, fatal: 'parse_error', detail: 'not implemented (Wave 0 stub)' }`
- `lib/actions/price-book.ts` — `importPriceBookItems` body returns `{ error: 'not implemented (Wave 0 stub)' }`
- `components/price-book/price-book-import-dialog.tsx` — renders a shell Dialog with no file picker, no stages, no action calls

These stubs are intentional and **do not** prevent the plan's goal (establishing the locked public API contract for Wave 1). Plan 21-02 (Wave 1 GREEN) will replace all stubs with real implementations.

## Hand-off to Plan 21-02 (Wave 1 GREEN)

Wave 1 takes each of the 32 RED stub bodies and replaces `expect.fail('not implemented')` with real assertions. Key inputs for Wave 1:

1. **Parser implementation:** Use RESEARCH Pattern 1 (papaparse with `header:true`, `skipEmptyLines:'greedy'`, `transformHeader: h => h.trim().toLowerCase()`) to fill in `parsePriceBookCsv`
2. **Dialog implementation:** Use RESEARCH Pattern 3 (Stage type `pick | preview`, `handleFile`, `handleConfirm`, `useTransition`, `router.refresh()` after close)
3. **Action implementation:** Use RESEARCH Pattern 2 (getAuthContext → safeParse each row → fetch existing keys → filter → single bulk insert)
4. **Mock helpers already established:** `makeSupabase` factory + all `vi.mock` calls ready in test files — Wave 1 just fills the test bodies

## Self-Check: PASSED

| Check | Result |
|-------|--------|
| lib/csv/price-book-import.ts exists | FOUND |
| components/price-book/price-book-import-dialog.tsx exists | FOUND |
| tests/unit/csv/price-book-import.test.ts exists | FOUND |
| tests/unit/price-book/price-book-import-dialog.test.tsx exists | FOUND |
| tests/unit/price-book/import-action.test.ts exists | FOUND |
| Commit 776b5a4 exists | FOUND |
| Commit 0fcc948 exists | FOUND |
| Commit 579cb36 exists | FOUND |
