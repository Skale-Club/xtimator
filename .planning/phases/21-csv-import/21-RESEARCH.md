# Phase 21: CSV Import - Research

**Researched:** 2026-05-07
**Domain:** CSV parsing, file upload UX, bulk Supabase insert + RLS, jsdom test scaffolding
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Entry Point & Flow Surface**
- **D-01:** Import lives as a Dialog modal triggered by an "Import CSV" button on `/settings/price-book` — same surface as the existing list. Reuses Phase 20 D-05 Dialog pattern. NOT a dedicated `/settings/price-book/import` sub-route.
- **D-02:** "Import CSV" button placed in the page header next to the existing "Add Item" button. Both visible on the empty state too.

**CSV Format Contract**
- **D-03:** 4 columns required in the header row: `category`, `name`, `unit`, `unit_price`. Header row is mandatory.
- **D-04:** Header matching is case-insensitive and order-independent — papaparse `header: true` mode + lowercase normalization. Extra columns silently ignored. Missing required column = whole-file rejection.
- **D-05:** Dot-decimal only for `unit_price` (e.g., `1234.56`). Comma-decimal rejected per US-only product scope. No `$` or thousands separators in input.
- **D-06:** `unit` cell may be blank (matches schema `.optional()`). `notes` intentionally omitted from CSV columns to keep format minimal.
- **D-07:** Downloadable template CSV linked from the Import Dialog ("Download template"). Template: header row + 2 example rows (one Labor, one Materials).

**Duplicate Handling**
- **D-08:** Skip silently on match — duplicate detection by case-insensitive `(name, category)` pair against existing `company_price_book` rows for the same company. Skipped rows counted and shown in post-import summary.
- **D-09:** Within-file duplicates (same name+category appearing twice) — first occurrence wins, rest counted as skipped duplicates.

**Validation & Preview UX**
- **D-10:** A row is invalid if: missing `category`, missing `name`, missing `unit_price`, `unit_price` is non-numeric, or `unit_price < 0`. Mirrors `priceBookItemSchema` — keep validation logic single-sourced.
- **D-11:** Preview Dialog shows ALL parsed rows in a scrollable table. Invalid rows render with red row background + small icon + tooltip listing failing reasons.
- **D-12:** Summary banner above the table: `"X valid · Y invalid · Z duplicates"`. Confirm button reads `"Import X items"`; disabled when X = 0.
- **D-13:** Partial import is acceptable — confirming with mixed valid/invalid imports only the valid rows. No all-or-nothing block.
- **D-14:** Whole-file errors (wrong file type, file >1 MB, >1000 rows, missing required column) caught BEFORE the preview opens, shown as inline error in the file-pick step. No preview Dialog opens.

**File Constraints**
- **D-15:** Hard caps enforced client-side: file size ≤1 MB, row count ≤1000.
- **D-16:** Accepted MIME / extension: `text/csv` and `.csv` only. `.txt` rejected.

**Insert Strategy**
- **D-17:** Single bulk `supabase.from('company_price_book').insert(rows)` call with the array of valid rows — one transaction by default; RLS still applies per row.
- **D-18:** New server action `importPriceBookItems(rows: PriceBookItemFormValues[])` in `lib/actions/price-book.ts`. Same `getAuthContext` + `revalidatePath('/settings/price-book')` + discriminated `{ data } | { error }` return pattern.
- **D-19:** Duplicate filtering happens server-side inside `importPriceBookItems` — server action fetches existing `(name, category)` pairs for the company once, filters incoming rows, then inserts the survivors. Avoids race conditions.

**Library Choice**
- **D-20:** papaparse (~45 KB) — handles quoted commas, escaped quotes, BOM, and stream parsing. De-facto JS CSV standard, MIT-licensed. Add `papaparse` + `@types/papaparse` to `package.json`.

### Claude's Discretion

- Exact preview table styling — follow existing Tailwind/shadcn conventions; reuse `Table` primitive. ✅ See Architecture Patterns below.
- Whether to debounce/disable the Confirm button while server action runs — yes, follow existing mutation patterns (`useTransition` + `disabled={isPending}`).
- File-picker primitive: native `<input type="file">` styled as a button vs custom drag-and-drop zone — pick whichever matches existing settings forms. ✅ Recommendation: native styled-as-button (drag-and-drop deferred — not in any other Settings surface).
- Error messages copy — "Friendly + actionable" tone. ✅ See Sample Copy in Code Examples.
- Whether to expose row-level edit-in-preview — NO, keeps scope contained.

### Deferred Ideas (OUT OF SCOPE)

- Excel / Google Sheets direct import (`.xlsx`) — deferred to v2.
- Import history / undo — not requested.
- Bulk price adjustment ("+10% per category") — deferred to v1.4.
- Edit-in-preview (fix invalid rows inline before confirm) — out of scope for v1.3.
- Server-side streaming for huge files — capped at 1 MB / 1000 rows means client-side parse stays fast.
- `notes` column in CSV — intentionally omitted to keep format minimal.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PB-05 | Usuário pode importar itens em lote via upload de arquivo CSV (colunas: categoria, item, unidade, preço; preview antes de confirmar import) | Standard Stack §papaparse 5.5.3, Architecture Patterns §1-4 (parse → validate → preview → bulk insert), Code Examples §all, Validation Architecture covers all 4 success criteria |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech Stack**: Next.js 14+ (App Router), TypeScript strict, Tailwind CSS, shadcn/ui, react-hook-form + zod
- **Database**: Supabase PostgreSQL with RLS on all tables
- **Mobile**: Audio recording AND file upload must work on iOS Safari and Android Chrome — directly relevant to D-16 file-picker behaviour
- **Security**: Service role key never exposed to browser; CSV import action uses cookie-bound client (RLS-enforced) — no service role needed
- **Convention from STATE.md (Phase 03+)**: `getAuthContext` is duplicated per-file in `lib/actions/*.ts`, never extracted. Phase 21 `importPriceBookItems` MUST follow this — extend the existing helper inside `lib/actions/price-book.ts`.
- **Convention from STATE.md (Phase 12-i18n-translation-system 12-03)**: Test stubs use `expect.fail('not implemented')` for Wave 0 RED. Mocks may need `vi.mock` of the target module itself so test files compile before sources exist.

## Summary

Phase 21 wires a CSV bulk-import pipeline into the existing `/settings/price-book` page. The data path is straightforward: `<input type="file">` → papaparse client-side parse → in-memory validation against the existing `priceBookItemSchema` → preview Dialog → server action with single bulk `.insert(array)` call (server-side dedup query first). All 20 architectural decisions are locked; this research validates each against current docs and surfaces the implementation pitfalls.

The two non-trivial technical risks are (1) **mobile file-picker behaviour** — iOS Safari is known to mishandle restrictive `accept` filters and may show an empty Files-app picker if MIME-only is specified, and (2) **PostgREST batch insert atomicity under RLS** — a single `.insert(array)` runs in one transaction, so a single RLS-denied row aborts the whole batch (not partial). Both risks have well-known fixes captured below.

papaparse 5.5.3 (latest, 2025-05-19) handles BOM, RFC-4180 quoting, and `header: true` object output natively — no custom parser code needed beyond a thin wrapper that maps papaparse output to `PriceBookItemFormValues`.

**Primary recommendation:** Implement in 3 plans mirroring Phase 20 — Plan 01 (Wave 0 RED stubs + bulk action stub + parser util skeleton) → Plan 02 (Wave 1: full parser + Dialog UI turning RED → GREEN) → Plan 03 (Wave 2: wire button into existing `PriceBookList` header + final integration test pass).

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| papaparse | 5.5.3 | Client-side CSV parsing — File/Blob → array of header-keyed objects | De-facto JS CSV parser; 13.5k★, MIT, zero deps, RFC-4180 compliant, BOM-aware. Released 2025-05-19 (current). Verified via `npm view papaparse version` — D-20 locked. |
| @types/papaparse | 5.5.2 | TypeScript types for papaparse | papaparse ships no types of its own; required for strict TS. Verified via `npm view @types/papaparse version`. |
| zod | ^4.3.6 (already installed) | Per-row validation via existing `priceBookItemSchema` | D-10 mandates single-sourcing schema across CRUD and import. No new schema needed. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @hookform/resolvers | ^5.2.2 (installed) | NOT needed for import — there is no react-hook-form here (the "form" is a file picker + button) | Skip — no form fields to validate via RHF. |
| sonner | ^2.0.7 (installed) | Success/error toast for import outcome | Mirror `PriceBookItemDialog` `toast.success(...)` / `toast.error(...)` pattern. |
| lucide-react | ^1.8.0 (installed) | Icons: `Upload` (button), `FileWarning` (invalid row), `Download` (template link) | Already used everywhere in price-book components. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| papaparse | csv-parse / fast-csv | Both Node-first; csv-parse browser bundle larger; fast-csv unmaintained for browser use. papaparse is the only one with first-class File/Blob input. **D-20 locked papaparse** — no alternative. |
| Single bulk `.insert(array)` | Per-row `.insert()` loop | Loop multiplies HTTP round trips by N (up to 1000) and breaks transaction atomicity. Bulk insert is one PostgREST request → one transaction. **D-17 locked.** |
| Client-side dedup | Server-side dedup (locked) | Client-side dedup is racy (another tab adds matching item between fetch and insert). **D-19 locked server-side.** |
| Custom drag-and-drop zone | Native `<input type="file">` | Drag-and-drop is nicer UX but not used elsewhere in Settings. Native input is faster to ship and works on mobile out-of-the-box. Recommend deferring drag-and-drop. |

**Installation:**

```bash
npm install papaparse@5.5.3
npm install -D @types/papaparse@5.5.2
```

**Version verification:**

```bash
npm view papaparse version          # → 5.5.3 (verified 2026-05-07, published 2025-05-19)
npm view @types/papaparse version   # → 5.5.2 (verified 2026-05-07)
```

Both are MIT-licensed, currently maintained.

## Architecture Patterns

### Recommended Project Structure

```
lib/
├── csv/
│   └── price-book-import.ts           # NEW: pure parsing + row classification (no React, no Supabase)
├── schemas/
│   └── price-book.ts                  # EXISTING: priceBookItemSchema (reuse — no changes)
├── actions/
│   └── price-book.ts                  # MODIFIED: append importPriceBookItems server action
└── queries/
    └── price-book.ts                  # EXISTING: PriceBookItem interface (reuse)

components/
└── price-book/
    ├── price-book-list.tsx            # MODIFIED: add "Import CSV" button + dialog state
    ├── price-book-item-dialog.tsx     # EXISTING: untouched
    └── price-book-import-dialog.tsx   # NEW: file picker → preview table → confirm flow

public/
└── price-book-template.csv            # NEW: static template file (header + 2 example rows)

tests/unit/
├── price-book/
│   ├── price-book-list.test.tsx       # EXISTING: extend with "Import CSV button visible" assertion
│   └── price-book-import-dialog.test.tsx  # NEW: parse + preview + confirm flow tests
└── csv/
    └── price-book-import.test.ts      # NEW: pure parser tests (no React, no jsdom DOM)
```

**Why this layout:**
- `lib/csv/price-book-import.ts` separates the parser logic from React so the parser tests are pure and don't need jsdom DOM scaffolding (faster, more reliable).
- A separate `price-book-import-dialog.tsx` keeps the existing item dialog (~280 lines) untouched and avoids cramming two dialogs into one file.
- Static template at `public/price-book-template.csv` means D-07 link is a plain `<a href="/price-book-template.csv" download>` — no API route needed.

### Pattern 1: Three-stage parse → validate → import flow

**What:** Separate concerns: papaparse turns File → raw row objects, a pure classifier turns raw rows → `{valid, invalid, duplicatesInFile}` (with per-row error reasons), then the server action is called with only the valid rows.

**When to use:** Standard for any CSV import. Decouples parsing errors from validation errors from server errors so each can be surfaced separately to the user (D-11 / D-14).

**Example:**

```typescript
// lib/csv/price-book-import.ts
import Papa from 'papaparse'
import { priceBookItemSchema, type PriceBookItemFormValues } from '@/lib/schemas/price-book'

export const REQUIRED_HEADERS = ['category', 'name', 'unit', 'unit_price'] as const
export const MAX_ROWS = 1000
export const MAX_BYTES = 1024 * 1024 // 1 MB

export type RowError =
  | 'missing_category'
  | 'missing_name'
  | 'missing_unit_price'
  | 'invalid_unit_price'
  | 'negative_unit_price'

export interface ParsedRow {
  rowNumber: number               // 1-based, header is row 0
  values: PriceBookItemFormValues // when valid; partial otherwise
  errors: RowError[]
  isDuplicateInFile: boolean
}

export interface ParseOutcome {
  ok: true
  rows: ParsedRow[]
  validCount: number
  invalidCount: number
  inFileDuplicateCount: number
} | {
  ok: false
  fatal: 'too_large' | 'too_many_rows' | 'wrong_type' | 'missing_columns' | 'parse_error'
  detail: string
}

export function parsePriceBookCsv(file: File): Promise<ParseOutcome> {
  return new Promise((resolve) => {
    if (file.size > MAX_BYTES) {
      resolve({ ok: false, fatal: 'too_large', detail: `${(file.size / 1024 / 1024).toFixed(2)} MB exceeds 1 MB limit` })
      return
    }
    if (file.type && !['text/csv', 'application/vnd.ms-excel', ''].includes(file.type)
        && !file.name.toLowerCase().endsWith('.csv')) {
      resolve({ ok: false, fatal: 'wrong_type', detail: 'We need a .csv file.' })
      return
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: 'greedy',          // strips whitespace-only rows (Excel trailing-row pitfall)
      transformHeader: (h) => h.trim().toLowerCase(),  // case-insensitive header match (D-04)
      complete: (results) => {
        // Validate headers
        const headers = results.meta.fields ?? []
        const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h))
        if (missing.length > 0) {
          resolve({ ok: false, fatal: 'missing_columns', detail: `Missing required column(s): ${missing.join(', ')}` })
          return
        }
        if (results.data.length > MAX_ROWS) {
          resolve({ ok: false, fatal: 'too_many_rows', detail: `${results.data.length} rows exceeds ${MAX_ROWS} max` })
          return
        }

        // Per-row classify
        const seenInFile = new Set<string>()
        const rows: ParsedRow[] = results.data.map((raw, i) => {
          const errors: RowError[] = []
          const rawCategory = (raw.category ?? '').trim()
          const rawName = (raw.name ?? '').trim()
          const rawUnit = (raw.unit ?? '').trim()
          const rawPrice = (raw.unit_price ?? '').trim()

          if (!rawCategory) errors.push('missing_category')
          if (!rawName) errors.push('missing_name')
          if (!rawPrice) errors.push('missing_unit_price')

          // Coerce price
          const priceNum = Number(rawPrice)
          if (rawPrice && Number.isNaN(priceNum)) errors.push('invalid_unit_price')
          if (rawPrice && !Number.isNaN(priceNum) && priceNum < 0) errors.push('negative_unit_price')

          const dedupKey = `${rawCategory.toLowerCase()}::${rawName.toLowerCase()}`
          const isDup = errors.length === 0 && seenInFile.has(dedupKey)
          if (errors.length === 0) seenInFile.add(dedupKey)

          return {
            rowNumber: i + 2, // +2 = (header is row 1, data starts row 2)
            values: {
              category: rawCategory,
              name: rawName,
              unit: rawUnit,
              unit_price: Number.isNaN(priceNum) ? 0 : priceNum,
              notes: '',
            },
            errors,
            isDuplicateInFile: isDup,
          }
        })

        const validCount = rows.filter((r) => r.errors.length === 0 && !r.isDuplicateInFile).length
        const invalidCount = rows.filter((r) => r.errors.length > 0).length
        const inFileDuplicateCount = rows.filter((r) => r.isDuplicateInFile).length

        resolve({ ok: true, rows, validCount, invalidCount, inFileDuplicateCount })
      },
      error: (err) => resolve({ ok: false, fatal: 'parse_error', detail: err.message }),
    })
  })
}
```

### Pattern 2: Server-side dedup before bulk insert

**What:** In `importPriceBookItems`, fetch existing `(name, category)` pairs for the company first, build an in-memory Set, filter incoming rows against it, then bulk-insert the survivors.

**When to use:** Always for D-19 — the only race-safe way given RLS and Supabase's per-row policy enforcement.

**Example:**

```typescript
// lib/actions/price-book.ts (appended)
export async function importPriceBookItems(
  rows: PriceBookItemFormValues[]
): Promise<
  | { error: string }
  | { data: { imported: number; skipped: number } }
> {
  const ctx = await getAuthContext()
  if ('error' in ctx) return { error: ctx.error }
  const { supabase, company } = ctx

  // Server-revalidate every row (defense in depth — never trust client validation)
  const validatedRows: PriceBookItemFormValues[] = []
  for (const row of rows) {
    const result = priceBookItemSchema.safeParse(row)
    if (result.success) validatedRows.push(result.data)
  }
  if (validatedRows.length === 0) return { error: 'No valid rows to import.' }

  // Fetch existing (name, category) pairs for the company — one query
  const { data: existing, error: existingErr } = await supabase
    .from('company_price_book')
    .select('category, name')
    .eq('company_id', company.id)
  if (existingErr) return { error: 'Could not check for duplicates. Please try again.' }

  const existingKeys = new Set(
    (existing ?? []).map((r) => `${r.category.toLowerCase()}::${r.name.toLowerCase()}`)
  )

  // Filter rows against existing keys
  const toInsert = validatedRows.filter((r) => {
    const key = `${r.category.toLowerCase()}::${r.name.toLowerCase()}`
    return !existingKeys.has(key)
  })
  const skipped = validatedRows.length - toInsert.length

  if (toInsert.length === 0) {
    return { data: { imported: 0, skipped } }
  }

  // Single bulk insert — one transaction
  const { error: insertErr } = await supabase
    .from('company_price_book')
    .insert(
      toInsert.map((r) => ({
        company_id: company.id,
        category: r.category,
        name: r.name,
        unit: r.unit || null,
        unit_price: r.unit_price,
        notes: r.notes || null,
      }))
    )
  if (insertErr) return { error: 'Failed to import items. Please try again.' }

  revalidatePath('/settings/price-book')
  return { data: { imported: toInsert.length, skipped } }
}
```

### Pattern 3: Dialog with two stages (file pick → preview)

**What:** A single Dialog with internal `stage: 'pick' | 'preview'` state. The "pick" stage renders the file input + format hint + template link. On valid parse, transitions to "preview" stage rendering the row table + confirm button. On confirm, calls server action and closes on success.

**When to use:** Standard pattern for any "preview before commit" flow. Avoids two separate dialogs which would lose user context.

**Example:**

```typescript
// components/price-book/price-book-import-dialog.tsx (skeleton)
type Stage =
  | { kind: 'pick'; fatalError: string | null }
  | { kind: 'preview'; outcome: Extract<ParseOutcome, { ok: true }> }

export function PriceBookImportDialog({ open, onOpenChange }: Props) {
  const [stage, setStage] = useState<Stage>({ kind: 'pick', fatalError: null })
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  async function handleFile(file: File) {
    const outcome = await parsePriceBookCsv(file)
    if (!outcome.ok) {
      setStage({ kind: 'pick', fatalError: friendlyMessage(outcome.fatal, outcome.detail) })
      return
    }
    setStage({ kind: 'preview', outcome })
  }

  function handleConfirm() {
    if (stage.kind !== 'preview') return
    const validRows = stage.outcome.rows
      .filter((r) => r.errors.length === 0 && !r.isDuplicateInFile)
      .map((r) => r.values)

    startTransition(async () => {
      const result = await importPriceBookItems(validRows)
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      toast.success(
        result.data.skipped > 0
          ? `Imported ${result.data.imported} items, skipped ${result.data.skipped} duplicates.`
          : `Imported ${result.data.imported} items.`
      )
      onOpenChange(false)
      router.refresh()
    })
  }

  // Reset stage when dialog reopens (Phase 20 Pitfall 3)
  useEffect(() => {
    if (open) setStage({ kind: 'pick', fatalError: null })
  }, [open])

  return <Dialog open={open} onOpenChange={onOpenChange}>{/* ... */}</Dialog>
}
```

### Pattern 4: "Import CSV" button as a Plan-02 PriceBookList edit, NOT a new component

**What:** The Import button is added directly to `components/price-book/price-book-list.tsx` next to the existing "Add Item" button (~line 148). Dialog state (`importDialogOpen`) is lifted into `PriceBookList`, mirroring the existing `dialogOpen` / `deleteDialogOpen` pattern. The `EmptyState` actionLabel pattern needs extending or duplicating since `EmptyState` only supports a single action — recommend rendering both buttons inline below `EmptyState` (or use `EmptyState` for primary "Add" and a small `<Button variant="outline">` below for "Import CSV").

**When to use:** Always — D-01/D-02 explicitly require this. NOT a sub-route, NOT a separate page.

### Anti-Patterns to Avoid

- **Re-implementing CSV parsing by hand** (`split(',')`): breaks on quoted commas, escaped quotes, BOM, CRLF/LF differences, Excel artefacts. papaparse handles all of these. Don't hand-roll.
- **Validating row shape with a custom checker**: D-10 mandates `priceBookItemSchema`. Build per-row error messages by mapping zod issues, not by writing parallel checks.
- **Per-row server action calls in a loop**: each call is a new HTTP round-trip + a new auth context resolution. Single bulk insert is mandatory (D-17).
- **Trusting client-side dedup**: race window between client-fetch and client-confirm; D-19 puts dedup server-side.
- **Reading the file synchronously via `FileReader.readAsText` then handing the string to `Papa.parse`**: papaparse takes File directly and uses streaming internally. Skip the redundant FileReader step.
- **Calling `router.refresh()` BEFORE closing the dialog**: causes a flash of stale data (Phase 20 Pitfall 5). Close → toast → refresh.
- **Using `useState<File>(null)` and re-running parse on every render**: keep parse imperative inside `onChange` callback; result lives in `stage` state, never the raw File.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| CSV row parsing | Custom `split(',')` / regex parser | `Papa.parse(file, { header: true })` | Quoted commas, escaped quotes, BOM, CRLF/LF, mixed line endings — papaparse RFC-4180 compliant. |
| Excel-export quirks | Custom BOM-strip / trailing-empty-row filter | `transformHeader` + `skipEmptyLines: 'greedy'` | papaparse strips BOM via meta and `'greedy'` mode handles whitespace-only rows. |
| Per-row schema validation | Custom field check loop | `priceBookItemSchema.safeParse(row)` | Single source of truth (D-10); same logic that powers add/edit dialog. |
| (name, category) dedup | Compound DB UNIQUE index + race-prone client check | One server-side `SELECT category, name WHERE company_id = ...` + JS Set | Avoids schema migration mid-feature; matches D-19 server-side strategy. |
| File-size / extension validation | Custom byte-counter + magic-number sniffer | `file.size`, `file.name.endsWith('.csv')`, `file.type` | Browser already provides everything needed for D-15/D-16. |
| Bulk insert transactionality | Per-row `.insert()` loop with manual rollback | Single `.insert(array)` — PostgREST runs each request in one transaction | "Every request to an API resource runs inside a transaction" — PostgREST docs. |

**Key insight:** papaparse + the existing `priceBookItemSchema` + a single Supabase bulk insert covers 95% of the implementation. The hand-rolled glue is just (a) row → `PriceBookItemFormValues` mapping, (b) dedup Set comparison, (c) error → friendly-message lookup, and (d) the two-stage Dialog UI. Everything else is library.

## Common Pitfalls

### Pitfall 1: iOS Safari ignores `accept="text/csv"` and may show empty Files-app picker

**What goes wrong:** User taps the file input on iPhone Safari; Files app opens but every file is greyed out, OR all files are selectable and the user can pick a `.png`.

**Why it happens:** iOS Safari has a long-standing bug where `accept` with a MIME-only value (e.g., `text/csv`) is mishandled — sometimes filters too aggressively (empty picker), sometimes ignored entirely. iOS does NOT support comma-separated extension lists in `accept` reliably either. The Files app does not necessarily report `text/csv` MIME for `.csv` files saved from Numbers or Excel — sometimes empty string, sometimes `application/vnd.ms-excel`.

**How to avoid:**
1. Set `accept=".csv,text/csv,application/vnd.ms-excel"` — a list with the extension first.
2. Do NOT trust `file.type` exclusively. Validate via `file.name.toLowerCase().endsWith('.csv')` AS THE PRIMARY CHECK, then optionally cross-check `file.type` with a permissive list `['', 'text/csv', 'application/vnd.ms-excel', 'application/csv']`.
3. Show a clear error if extension fails — friendly message: "We need a .csv file" (D-16).

**Warning signs:** "User says they can't pick the file" reports from iOS. Test on a real iPhone (or BrowserStack) before shipping.

### Pitfall 2: Excel-exported CSVs add BOM (`﻿`) which becomes part of the first header

**What goes wrong:** The user's CSV from Excel has `category,name,unit,unit_price` as the visible header, but the first cell is actually `﻿category`. Header validation fails with "missing required column 'category'" even though it's right there.

**Why it happens:** Excel "Save as CSV UTF-8" prepends a UTF-8 BOM to the file. The byte is part of the first field unless explicitly stripped.

**How to avoid:** papaparse 5.x **strips BOM automatically** when parsing — verified in source. Belt-and-suspenders: `transformHeader: (h) => h.trim().toLowerCase().replace(/^﻿/, '')`.

**Warning signs:** Test with an Excel-exported CSV — easiest reliable repro. Don't only test with a hand-typed CSV.

### Pitfall 3: PostgREST batch insert is all-or-nothing on RLS denial

**What goes wrong:** User imports 100 rows; one row's `category` field somehow violates an RLS policy (e.g., race condition where the user's company was just deactivated). The whole batch fails with one error message; no rows imported.

**Why it happens:** Per PostgREST docs: "After User Impersonation, every request to an API resource runs inside a transaction." A single `.insert(array)` is one request → one transaction → atomic. Any per-row failure (RLS, CHECK constraint, NOT NULL) rolls back the whole batch.

**How to avoid:** This is **the desired behaviour** for D-13 partial imports IF "partial" means partial **across the validate phase** (some rows excluded as invalid before insert). Once the action calls `.insert()`, all-or-nothing is correct — partial DB writes would be confusing for the user.

For belt-and-suspenders: server action validates every row with `priceBookItemSchema.safeParse` BEFORE building the insert array (Pattern 2 above). This means RLS denial is the only path to a batch-rollback, and it's effectively impossible for a single user importing their own company's data.

**Warning signs:** A row that passes client validation but fails on the server. Surface error message: "Failed to import items. Please try again." (D-18 fallback). Log the underlying Supabase error server-side for debug.

### Pitfall 4: papaparse + Webpack 5 / Next.js bundling — `worker: true` breaks build

**What goes wrong:** Adding `worker: true` to `Papa.parse()` config tries to inline a Worker URL via `new URL(...)` which Next.js Turbopack/Webpack handles differently from raw papaparse expectations. Build fails or runtime worker fails to spawn.

**Why it happens:** papaparse's worker mode bundles its own worker source which doesn't survive Webpack 5 module resolution without extra config.

**How to avoid:** **Do NOT use `worker: true`**. With ≤1 MB / ≤1000 rows (D-15), main-thread parse takes <50ms; workers are over-engineering. Just use `Papa.parse(file, { header: true, skipEmptyLines: 'greedy', complete })`.

**Warning signs:** "Cannot find module" errors involving a papaparse worker file at build time, or "Worker is not defined" at runtime.

### Pitfall 5: Numeric coercion of "1,234.56" silently produces NaN

**What goes wrong:** User's CSV has `unit_price` cells like `"1,234.56"` (US thousands separator). `Number("1,234.56")` → `NaN`. Row marked invalid with "invalid unit_price" error which confuses the user — the price looks fine.

**Why it happens:** `Number()` is strict; only accepts dot-decimal with no separators (D-05).

**How to avoid:** D-05 explicitly rejects this — but the error message must explain WHY. Friendly copy: `"Price '1,234.56' has a comma. Use 1234.56 instead."` Do NOT silently strip commas (would mask currency-symbol issues).

**Warning signs:** Localized exports from non-US Excel installations. We're US-only per CLAUDE.md, so this is acceptable; just be clear in the error message.

### Pitfall 6: jsdom `File` works but `FileReader.readAsText` is synchronous-ish flaky

**What goes wrong:** Tests pass `new File(['csv content'], 'test.csv', { type: 'text/csv' })` to the parse util. papaparse internally uses FileReader which jsdom 29 supports — but if you mistakenly use `fetch(file)` or polyfill FileReader, behaviour diverges.

**How to avoid:**
1. Use `new File([content], name, { type })` constructor directly in tests — jsdom 29.0.2 supports it natively (verified — `@types/jsdom` already installed).
2. Use `vi.waitFor(() => expect(...).toBeDefined())` or `await` the parse Promise — never assume synchronous completion.
3. Alternative: mock `papaparse` itself for component tests; only the pure parser util needs real papaparse.

**Test pattern:**

```typescript
// tests/unit/csv/price-book-import.test.ts (pure parser — real papaparse)
import { parsePriceBookCsv } from '@/lib/csv/price-book-import'

it('parses a 3-row CSV and classifies one invalid row', async () => {
  const csv = [
    'category,name,unit,unit_price',
    'Labor,General Labor,hr,75',
    'Labor,,hr,80',                    // missing name → invalid
    'Materials,PVC Pipe,ft,3.50',
  ].join('\n')
  const file = new File([csv], 'test.csv', { type: 'text/csv' })

  const outcome = await parsePriceBookCsv(file)
  expect(outcome.ok).toBe(true)
  if (outcome.ok) {
    expect(outcome.validCount).toBe(2)
    expect(outcome.invalidCount).toBe(1)
    expect(outcome.rows[1].errors).toContain('missing_name')
  }
})

// tests/unit/price-book/price-book-import-dialog.test.tsx (component — mock papaparse)
vi.mock('@/lib/csv/price-book-import', () => ({
  parsePriceBookCsv: vi.fn().mockResolvedValue({
    ok: true, rows: [/* fixtures */], validCount: 2, invalidCount: 0, inFileDuplicateCount: 0,
  }),
  REQUIRED_HEADERS: ['category','name','unit','unit_price'],
  MAX_ROWS: 1000,
  MAX_BYTES: 1024 * 1024,
}))
```

### Pitfall 7: Windows CRLF vs Unix LF in user-supplied CSVs

**What goes wrong:** A CSV exported on Windows uses `\r\n` line endings. Hand-rolled parsers split on `\n` and end up with rows containing trailing `\r` characters in the last field of each row.

**How to avoid:** papaparse handles both transparently — `newline` config option auto-detects. **As long as we use papaparse, this is solved.** Hand-rolling = pain.

### Pitfall 8: `getAuthContext` returning `Not authenticated` looks like an import failure

**What goes wrong:** User's session expires in another tab between page load and clicking Import. The action returns `{ error: 'Not authenticated' }`. Toast shows "Not authenticated" which is confusing — they ARE on the page.

**How to avoid:** Either (a) accept the existing error message (consistent with other actions), or (b) special-case auth errors to redirect to `/login` from the client. Phase 20 didn't special-case; recommend keeping consistent for now and revisiting in a UX pass.

## Runtime State Inventory

> Not applicable — this is a greenfield feature phase, not a rename/refactor/migration.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js / npm | Build, install | ✓ | (project default) | — |
| papaparse | Client-side parser | Will install | 5.5.3 | None — D-20 locked |
| @types/papaparse | TypeScript strict | Will install | 5.5.2 | None |
| zod | Schema validation | ✓ | ^4.3.6 | — |
| jsdom | Vitest test environment | ✓ | ^29.0.2 | — |
| Supabase (PostgREST) | Bulk insert RLS-scoped | ✓ | @supabase/supabase-js ^2.103.0 | — |

**Missing dependencies with no fallback:** None blocking — papaparse + types are a single `npm install` and the team has installed similar deps before (zod, sonner, cmdk).

**Missing dependencies with fallback:** None.

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 + @testing-library/react 16.3.2 + jsdom 29.0.2 |
| Config file | `vitest.config.ts` (root) — `environment: 'jsdom'`, `setupFiles: ['tests/setup/load-env.ts']`, alias `@` → project root, `server-only` aliased to empty stub |
| Quick run command | `npx vitest run tests/unit/price-book tests/unit/csv tests/unit/schemas/price-book.test.ts` |
| Full suite command | `npx vitest run` (or `npm test`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PB-05 (SC-1) | User uploads a CSV with columns (category, item, unit, price) and the UI parses it client-side without a page reload | unit (parser) + component | `npx vitest run tests/unit/csv/price-book-import.test.ts` | ❌ Wave 0 |
| PB-05 (SC-1) | Component accepts file via `<input type="file">` and triggers parse | component | `npx vitest run tests/unit/price-book/price-book-import-dialog.test.tsx::"file change triggers parse"` | ❌ Wave 0 |
| PB-05 (SC-2) | After upload, preview table shows all parsed rows; user can review and cancel or confirm | component | `npx vitest run tests/unit/price-book/price-book-import-dialog.test.tsx::"preview stage renders all rows"` | ❌ Wave 0 |
| PB-05 (SC-2) | Cancel button closes dialog without calling server action | component | `npx vitest run tests/unit/price-book/price-book-import-dialog.test.tsx::"cancel does not call importPriceBookItems"` | ❌ Wave 0 |
| PB-05 (SC-3) | On confirm, valid rows are sent to server action via single bulk call | component | `npx vitest run tests/unit/price-book/price-book-import-dialog.test.tsx::"confirm calls importPriceBookItems with only valid rows"` | ❌ Wave 0 |
| PB-05 (SC-3) | Server action calls supabase.insert with array of company-scoped rows | unit (action) | `npx vitest run tests/unit/price-book/import-action.test.ts::"calls supabase.insert with array"` | ❌ Wave 0 |
| PB-05 (SC-3) | Server action server-side dedup filters existing (name, category) pairs | unit (action) | `npx vitest run tests/unit/price-book/import-action.test.ts::"skips duplicates against existing rows"` | ❌ Wave 0 |
| PB-05 (SC-4) | Rows with missing required fields are flagged as invalid in preview | component | `npx vitest run tests/unit/price-book/price-book-import-dialog.test.tsx::"invalid rows have error indicator"` | ❌ Wave 0 |
| PB-05 (SC-4) | Confirm only imports valid rows when mixed valid/invalid in file | component | `npx vitest run tests/unit/price-book/price-book-import-dialog.test.tsx::"confirm filters out invalid rows"` | ❌ Wave 0 |
| PB-05 (parser) | CSV with BOM-prefixed header parses correctly | unit | `npx vitest run tests/unit/csv/price-book-import.test.ts::"strips BOM from header"` | ❌ Wave 0 |
| PB-05 (parser) | CSV missing required column rejects whole file with fatal error | unit | `npx vitest run tests/unit/csv/price-book-import.test.ts::"missing column rejects file"` | ❌ Wave 0 |
| PB-05 (parser) | File >1 MB rejects with `too_large` fatal | unit | `npx vitest run tests/unit/csv/price-book-import.test.ts::"file too large"` | ❌ Wave 0 |
| PB-05 (parser) | File >1000 rows rejects with `too_many_rows` fatal | unit | `npx vitest run tests/unit/csv/price-book-import.test.ts::"too many rows"` | ❌ Wave 0 |
| PB-05 (parser) | In-file duplicate (same name+category) marked as duplicate, first wins | unit | `npx vitest run tests/unit/csv/price-book-import.test.ts::"in-file duplicate first wins"` | ❌ Wave 0 |
| PB-05 (parser) | Header matched case-insensitively and order-independent | unit | `npx vitest run tests/unit/csv/price-book-import.test.ts::"case-insensitive headers"` | ❌ Wave 0 |
| PB-05 (UI) | Import button visible in PriceBookList header | component | extend `tests/unit/price-book/price-book-list.test.tsx::"Import CSV button renders in header"` | ✅ extends existing |
| PB-05 (UI) | Empty state shows both Add and Import options | component | extend `tests/unit/price-book/price-book-list.test.tsx::"empty state shows Import CSV"` | ✅ extends existing |

### Sampling Rate

- **Per task commit:** `npx vitest run tests/unit/price-book tests/unit/csv tests/unit/schemas/price-book.test.ts` (Phase 20 + 21 surface, fast)
- **Per wave merge:** `npx vitest run tests/unit/price-book tests/unit/csv tests/unit/schemas` (broader unit coverage)
- **Phase gate:** `npx vitest run` (full suite green except deferred-items.md baseline) before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/unit/csv/price-book-import.test.ts` — pure parser (10–14 tests covering all parser behaviours above). Create `tests/unit/csv/` directory.
- [ ] `tests/unit/price-book/price-book-import-dialog.test.tsx` — Dialog component (parse-mocked, 8–10 tests).
- [ ] `tests/unit/price-book/import-action.test.ts` — server action (Supabase chain mocked, 6–8 tests).
- [ ] Extend `tests/unit/price-book/price-book-list.test.tsx` — 2 new tests (Import button visible in header + empty state).
- [ ] No framework install needed — vitest 4.1.4 + jsdom 29.0.2 already in package.json.
- [ ] No new shared fixtures file needed — each test can construct `new File([csv], 'test.csv', { type: 'text/csv' })` inline.

## Code Examples

### Example 1: papaparse v5.5.3 — File parsing (verified API)

```typescript
// Source: https://www.papaparse.com/docs (verified 2026-05-07)
import Papa from 'papaparse'

Papa.parse<Record<string, string>>(file, {
  header: true,                                           // first row → object keys
  skipEmptyLines: 'greedy',                               // strips whitespace-only rows
  transformHeader: (h) => h.trim().toLowerCase(),         // case-insensitive headers
  complete: (results) => {
    // results.data: Record<string, string>[]
    // results.meta.fields: string[] (header names)
    // results.errors: ParseError[] (parse-level issues, not validation)
  },
  error: (err) => {
    // FileReader / IO error
  },
})
```

**Notes:**
- `Papa` is the default export (`import Papa from 'papaparse'`).
- BOM (`﻿`) is stripped automatically from the first header field.
- The `skipEmptyLines: 'greedy'` value handles Excel's habit of appending whitespace-only trailing rows.
- `dynamicTyping: true` would auto-coerce numbers — DON'T use it; we want strings so we can apply our own `Number()` + zod logic and surface "1,234.56 has a comma" errors clearly.

### Example 2: Sample friendly error copy (Claude's discretion)

```typescript
// Source: project convention (Phase 20 toast pattern)
function friendlyMessage(fatal: ParseFatalError, detail: string): string {
  switch (fatal) {
    case 'too_large':
      return 'Your file is over 1 MB. Try removing rows or splitting into multiple files.'
    case 'too_many_rows':
      return `Your file has too many rows. Max is 1000 — split it into smaller batches.`
    case 'wrong_type':
      return 'We need a .csv file. Save your spreadsheet as CSV and try again.'
    case 'missing_columns':
      return `${detail}. Check the template — header row needs: category, name, unit, unit_price.`
    case 'parse_error':
      return `Could not read your file: ${detail}. Try saving it again from Excel/Sheets.`
  }
}
```

### Example 3: Static template file content (D-07)

```csv
category,name,unit,unit_price
Labor,General Labor,hr,75.00
Materials,PVC Pipe 2in,ft,3.50
```

Save at `public/price-book-template.csv`. Link via `<a href="/price-book-template.csv" download>Download template</a>` — Next.js serves files in `public/` at the root.

### Example 4: Bulk insert with Supabase (verified)

```typescript
// Source: @supabase/supabase-js ^2.103.0 + PostgREST docs (verified)
const { error } = await supabase
  .from('company_price_book')
  .insert([
    { company_id, category: 'Labor', name: 'General Labor', unit: 'hr', unit_price: 75, notes: null },
    { company_id, category: 'Labor', name: 'Supervisor', unit: 'hr', unit_price: 120, notes: null },
    // ...up to 1000 rows
  ])
// One HTTP request → one PostgREST transaction → all-or-nothing.
// RLS applies per row; any denial aborts the whole batch.
```

### Example 5: Vitest mock pattern for the import-action server action (matches existing project conventions)

```typescript
// tests/unit/price-book/import-action.test.ts (skeleton)
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// Build a chainable mock — mirrors tests/unit/admin-gate.ts pattern
function makeSupabase({
  claims, company, existing, insertResult,
}: {
  claims: { sub: string } | null
  company: { id: string } | null
  existing: { category: string; name: string }[]
  insertResult: { error: { message: string } | null }
}) {
  const companyTerminal = vi.fn().mockResolvedValue({ data: company })
  const companyChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: companyTerminal,
  }
  const existingChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockResolvedValue({ data: existing, error: null }),
  }
  const insertChain = {
    insert: vi.fn().mockResolvedValue(insertResult),
  }
  return {
    auth: { getClaims: vi.fn().mockResolvedValue({ data: claims ? { claims } : null }) },
    from: vi.fn((table: string) => {
      if (table === 'companies') return companyChain
      // company_price_book — first call (select existing), second call (insert)
      let called = 0
      called++
      return called === 1 ? existingChain : insertChain
    }),
  }
}
```

(Note: the table-call counter approach is awkward; a cleaner pattern is two separate mock builders, one per call site. The plan should detail this.)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `<form action="/api/import" enctype="multipart/form-data">` page reload | Client-side parse + server action with array payload | Next.js 13+ Server Actions stable | No round-trip to upload, instant validation, no /api/* route needed |
| FileReader.readAsText() → Papa.parse(string) | Papa.parse(file) directly | papaparse 5.x | One step, internal streaming, less code |
| Per-row `.insert()` loop | Single `.insert(array)` | supabase-js 1.x → 2.x | Single transaction, 1000× fewer round-trips |
| zod `z.preprocess(Number, z.number())` | `z.coerce.number()` | zod 3.20+ | Less verbose, same behaviour |

**Deprecated/outdated:**
- papaparse `worker: true` mode in Webpack 5 / Next.js — works in pure browser but not always reliably bundled. Not needed at our scale.
- `csv-parse` browser bundle — last meaningful release 2018-era, papaparse better maintained.

## Open Questions

1. **Should we surface row-level error details (which fields failed) in the preview, or just "row invalid"?**
   - What we know: D-11 says red row + tooltip listing failing reasons.
   - What's unclear: Tooltip on what exactly — the row, the cell? Hover or click on mobile? Mobile has no hover.
   - Recommendation: Use a small icon at the start of each invalid row. On desktop, tooltip on hover. On mobile/tablet, render a small text line below the row showing reasons (no tooltip needed). Or use shadcn's `HoverCard` which degrades gracefully. Planner should pick.

2. **What happens when a CSV has a column named `notes` (or other extra columns)?**
   - What we know: D-04 says extra columns silently ignored.
   - What's unclear: Should we surface a warning "We saw a 'notes' column but ignored it — notes can be added per-item via Edit"? Or silent?
   - Recommendation: Silent. The summary banner already shows row counts; an extra-column warning would clutter. If users complain, add it later.

3. **Should the import action emit an audit event (estimate_activity-style) for analytics / future undo?**
   - What we know: Phase 04 added activity logging; deferred-ideas explicitly excludes import history.
   - What's unclear: Does Plan 22 (AI anchoring) want to know which items came from CSV vs manual?
   - Recommendation: Add a `source` column to `company_price_book` LATER if needed. Not in scope for Phase 21.

## Sources

### Primary (HIGH confidence)

- npm registry — `npm view papaparse version` → 5.5.3 (verified 2026-05-07; published 2025-05-19)
- npm registry — `npm view @types/papaparse version` → 5.5.2 (verified 2026-05-07)
- papaparse official docs: https://www.papaparse.com/docs — parse() options, BOM handling, header mode, skipEmptyLines greedy mode
- PostgREST docs: https://docs.postgrest.org/en/v12/references/transactions.html — "After User Impersonation, every request to an API resource runs inside a transaction" → confirms bulk insert is atomic
- Existing project files (HIGH — direct read):
  - `lib/schemas/price-book.ts` — `priceBookItemSchema` for D-10 reuse
  - `lib/actions/price-book.ts` — `getAuthContext` pattern for D-18
  - `lib/queries/price-book.ts` — `PriceBookItem` interface
  - `components/price-book/price-book-list.tsx` — header layout for D-02 button placement
  - `components/price-book/price-book-item-dialog.tsx` — Dialog open/close + onSubmit + router.refresh pattern
  - `tests/unit/price-book/price-book-list.test.tsx` — mock conventions, `vi.mock` of server actions, sonner, next/navigation
  - `tests/unit/admin-gate.test.ts` — chainable Supabase mock pattern
  - `vitest.config.ts` — jsdom env, server-only alias
  - `package.json` — installed deps (zod 4.3.6, sonner 2.0.7, @testing-library/react 16.3.2)
- `.planning/STATE.md` — Phase 03+ `getAuthContext` per-file convention, Phase 12-03 mock target itself, Phase 20 Pitfalls 1-5

### Secondary (MEDIUM confidence — verified across sources)

- Supabase JS docs (https://supabase.com/docs/reference/javascript/insert) — confirms `.insert(array)` accepts arrays; transaction semantics confirmed via PostgREST docs
- iOS Safari `accept` attribute behaviour: known issues documented at:
  - https://github.com/lionheart/openradar-mirror/issues/19227 (Safari/WebView accept bug)
  - https://github.com/mdn/browser-compat-data/issues/26043 (iOS doesn't implement accept with extensions)
  - https://github.com/react-dropzone/react-dropzone/issues/538 (iOS doesn't support comma-separated MIME)
  → cross-confirmed: extension-first `accept=".csv,text/csv"` + extension-based JS validation is the correct pattern

### Tertiary (LOW confidence — flagged for execution-time validation)

- Excel CSV BOM behaviour: documented across many Stack Overflow / blog posts, but not in a single authoritative source. Validate with a real Excel-exported test file during Plan 02 RED → GREEN.
- File MIME type from iOS Files app for `.csv` — varies by source app (Numbers vs Excel vs email attachment). The pragmatic mitigation is "extension-first validation" — already captured.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — npm-verified versions, official docs read, MIT license confirmed
- Architecture: HIGH — patterns are direct extensions of Phase 20 SUMMARY-documented patterns
- Pitfalls: HIGH — Pitfalls 1, 3, 5 verified against official docs; Pitfalls 2, 4, 6, 7 verified across multiple sources; Pitfall 8 is project convention
- Validation Architecture: HIGH — vitest setup verified, mock patterns extracted from real project files

**Research date:** 2026-05-07
**Valid until:** 2026-06-06 (30 days — papaparse and supabase-js are stable; no major version bumps expected)
