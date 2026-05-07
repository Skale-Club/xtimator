# Phase 21: CSV Import - Context

**Gathered:** 2026-05-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Bulk-populate `company_price_book` from a user-supplied CSV file. End-to-end flow:

1. User clicks **Import CSV** from `/settings/price-book`
2. File picker (CSV only, ≤1 MB, ≤1000 rows) → client-side parse with papaparse
3. Preview Dialog shows ALL parsed rows with per-row validity markers + summary count
4. User confirms → bulk insert valid rows into `company_price_book` (RLS scoped by `company_id`) → toast + `router.refresh()`

**In scope:** CSV upload, parse, validation, preview, confirm, bulk insert.
**Not in scope:** Excel/Sheets (`.xlsx`, Google Sheets) — explicitly deferred to v2 in REQUIREMENTS. Bulk price adjustment (+10% per category) — deferred to v1.4. Import history / undo — not requested.

</domain>

<decisions>
## Implementation Decisions

### Entry Point & Flow Surface
- **D-01:** Import lives as a **Dialog modal** triggered by an "Import CSV" button on `/settings/price-book` — same surface as the existing list. Reuses Phase 20 D-05 Dialog pattern (consistent with add/edit). NOT a dedicated `/settings/price-book/import` sub-route.
- **D-02:** "Import CSV" button placed in the page header next to the existing "Add Item" button. Both visible on the empty state too (so first-time users see CSV as a faster onboarding path).

### CSV Format Contract
- **D-03:** **4 columns required** in the header row: `category`, `name`, `unit`, `unit_price`. Header row is mandatory.
- **D-04:** Header matching is **case-insensitive** and order-independent — papaparse `header: true` mode + lowercase normalization. Extra columns are silently ignored. Missing required column = whole-file rejection with clear error before preview.
- **D-05:** **Dot-decimal only** for `unit_price` (e.g., `1234.56`). Comma-decimal rejected per US-only product scope (CLAUDE.md). No `$` or thousands separators in input — UI documents this in the format hint and template.
- **D-06:** `unit` cell may be blank (matches schema `.optional()`); blank `notes` is implicit (column not in import; manual edit later if needed). `notes` intentionally omitted from CSV columns to keep the format minimal.
- **D-07:** **Downloadable template CSV** linked from the Import Dialog ("Download template"). Template: header row + 2 example rows (one Labor, one Materials).

### Duplicate Handling
- **D-08:** **Skip silently on match** — duplicate detection by case-insensitive `(name, category)` pair against existing `company_price_book` rows for the same company. Skipped rows are counted and shown in the post-import summary ("Imported X, skipped Y duplicates"). User can resolve manually via the existing Edit/Delete UI from Phase 20.
- **D-09:** Within-file duplicates (same name+category appearing twice in the CSV) — first occurrence wins, rest counted as skipped duplicates with the same UI feedback.

### Validation & Preview UX
- **D-10:** A row is **invalid** if: missing `category`, missing `name`, missing `unit_price`, `unit_price` is non-numeric, or `unit_price < 0`. (Mirrors `priceBookItemSchema` from Plan 20-01 — keep validation logic single-sourced.)
- **D-11:** Preview Dialog shows **ALL parsed rows** in a scrollable table. Invalid rows render with a red row background + small icon + tooltip listing the failing reasons (e.g., "missing name", "negative price").
- **D-12:** Summary banner above the table: `"X valid · Y invalid · Z duplicates"`. Confirm button reads `"Import X items"`; **disabled when X = 0**.
- **D-13:** **Partial import is acceptable** — confirming with mixed valid/invalid imports only the valid rows. No all-or-nothing block. Matches CSV reality (messy real-world data) and saves the user from manually fixing their export before retry.
- **D-14:** Whole-file errors (wrong file type, file >1 MB, >1000 rows, missing required column) are caught BEFORE the preview opens and shown as inline error in the file-pick step. No preview Dialog opens.

### File Constraints
- **D-15:** **Hard caps** enforced client-side: file size ≤1 MB, row count ≤1000. Both communicated upfront in the format hint.
- **D-16:** Accepted MIME / extension: `text/csv` and `.csv` only. `.txt` rejected even if comma-delimited (avoids ambiguous parsing).

### Insert Strategy
- **D-17:** **Single bulk `supabase.from('company_price_book').insert(rows)`** call with the array of valid rows — Supabase wraps the multi-row insert in one transaction by default; RLS still applies per row. No per-row loop.
- **D-18:** New server action `importPriceBookItems(rows: PriceBookItemFormValues[])` in `lib/actions/price-book.ts` (alongside existing `create/update/delete`). Same `getAuthContext` + `revalidatePath('/settings/price-book')` + discriminated `{ data } | { error }` return pattern (Phase 20 conventions).
- **D-19:** Duplicate filtering happens **server-side inside `importPriceBookItems`** — the server action fetches existing `(name, category)` pairs for the company once, filters incoming rows, then inserts the survivors. Avoids race conditions and trust issues with client-side duplicate detection.

### Library Choice
- **D-20:** **papaparse** (~45 KB) — handles quoted commas, escaped quotes, BOM, and stream parsing. De-facto JS CSV standard, MIT-licensed, no maintenance concerns. Add to `package.json` as `papaparse` + `@types/papaparse`.

### Claude's Discretion
- Exact preview table styling — follow existing Tailwind/shadcn conventions; reuse `Table` primitive if available, otherwise simple `<table>` with semantic tokens.
- Whether to debounce/disable the Confirm button while the server action is running — yes, follow existing mutation patterns.
- File-picker primitive: native `<input type="file">` styled as a button vs a custom drag-and-drop zone — pick whichever matches existing settings forms; drag-and-drop is a nice-to-have but not required.
- Error messages copy — "Friendly + actionable" tone (e.g., "We need a CSV file under 1 MB" instead of "Invalid input"). User has not specified copy.
- Whether to expose row-level edit-in-preview — **no**, keeps scope contained. User fixes the source CSV and re-uploads if mass edits needed; individual fixes go through the existing Edit dialog after import.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Roadmap & Requirements
- `.planning/ROADMAP.md` §"Phase 21: CSV Import" — phase goal, 4 success criteria, declared requirement PB-05
- `.planning/REQUIREMENTS.md` §"v1.3 Requirements" PB-05 — full requirement text and v1.3 constraints (free-text categories, RLS by company_id, US-only dot-decimal, optional price book)
- `.planning/PROJECT.md` §"Current Milestone" — v1.3 Smart Pricing goal and key constraints

### Prior Phase Artifacts (data layer + UI patterns to reuse)
- `.planning/phases/19-price-book-db-foundation/19-02-SUMMARY.md` — `company_price_book` schema, RLS policies, regenerated TS types
- `.planning/phases/20-price-book-crud-ui/20-CONTEXT.md` — D-01 through D-10 (page location, Dialog/AlertDialog patterns, EmptyState copy)
- `.planning/phases/20-price-book-crud-ui/20-01-SUMMARY.md` — `priceBookItemSchema`, `PriceBookItem` interface, `getPriceBookItems`, `getAuthContext` pattern, discriminated `{ data } | { error }` server action returns
- `.planning/phases/20-price-book-crud-ui/20-02-SUMMARY.md` — `PriceBookList` + `PriceBookItemDialog` (where the "Import CSV" button plugs in; matches dialog open/close + `router.refresh()` pattern)
- `.planning/phases/20-price-book-crud-ui/20-03-SUMMARY.md` — `/settings/price-book/page.tsx` server-component shape (auth → company → query → render); the Import flow doesn't change the page contract

### Implementation Files (will be modified or referenced)
- `lib/schemas/price-book.ts` — reuse `priceBookItemSchema` for row validation (single-source)
- `lib/actions/price-book.ts` — add `importPriceBookItems` alongside existing actions
- `lib/queries/price-book.ts` — `PriceBookItem` interface + `getPriceBookItems` (referenced for duplicate-detection query)
- `components/price-book/price-book-list.tsx` — add "Import CSV" button trigger here
- `app/(app)/settings/price-book/page.tsx` — no shape change (data still flows through `getPriceBookItems`)

### External Library Docs (researcher should pull current docs)
- papaparse: https://www.papaparse.com/docs — `parse(file, { header: true, skipEmptyLines: true, ...})`, error handling, BOM stripping

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`priceBookItemSchema`** (`lib/schemas/price-book.ts`): zod schema with `z.coerce.number().min(0)` for `unit_price` and `.optional().or(z.literal(''))` for `unit` — directly reusable for per-row validation in the preview. No need for a separate "import schema."
- **`PriceBookItemFormValues`** type — same type used by add/edit Dialog; the array shape `PriceBookItemFormValues[]` becomes the server action input.
- **`getAuthContext` pattern** in `lib/actions/price-book.ts:7` — duplicate inline rather than extracting (Phase 20 D convention from CLAUDE.md / Phase 03).
- **Phase 20 Dialog pattern** (`components/price-book/price-book-item-dialog.tsx`) — controlled `open`/`onOpenChange` pattern lifted into `PriceBookList`; the new `PriceBookImportDialog` follows the same shape (single dialog instance toggled by parent state).
- **Toast pattern** — `sonner` already in use; mirror Plan 20-02 success/error toast calls.

### Established Patterns
- **Mutation flow:** server action with `getAuthContext` → operation → `revalidatePath('/settings/price-book')` → return `{ data } | { error }`. Client component shows toast + calls `router.refresh()`.
- **Dialog state:** lifted into the parent `PriceBookList` (single dialog instance, opened with `setIsImportOpen(true)`).
- **Schema validation:** zod resolver cast as `any` for zod-v4 + react-hook-form mismatch (Phase 02 Pitfall 2 — only relevant if Import Dialog uses react-hook-form, which it likely won't since the form is the file picker).
- **Test pattern:** Wave 0 `expect.fail('not implemented')` stubs land first (Nyquist RED), then implementation turns GREEN. Mocks for `next/navigation`, `sonner`, and `@/lib/actions/price-book` already established in `tests/unit/price-book/`.

### Integration Points
- **Where Import button plugs in:** `components/price-book/price-book-list.tsx` header section — between the search Input and the existing "Add Item" button.
- **Where the action lives:** `lib/actions/price-book.ts` — append `importPriceBookItems` to the existing exports.
- **Test location:** `tests/unit/price-book/price-book-import.test.tsx` (component) + `tests/unit/schemas/price-book-import.test.ts` (validation/parsing) — mirrors Phase 20 `price-book-list.test.tsx` structure.

</code_context>

<specifics>
## Specific Ideas

- Mirror the user's existing pricing spreadsheet workflow: they probably have an Excel/Sheets file → File → Save as CSV → drag into Xtimator. The downloadable template (D-07) seeds the right column names so they don't have to guess.
- "Skipped duplicates" framed positively in the toast (not as an error) — re-uploading the same file should be a no-op, not a frustration.

</specifics>

<deferred>
## Deferred Ideas

- **Excel / Google Sheets direct import** — explicitly deferred to v2 in REQUIREMENTS.md "Out of Scope". CSV covers v1.3.
- **Import history / undo** — not requested. If users want to undo a big import, they delete via the existing UI (Phase 20 PB-04).
- **Bulk price adjustment** ("+10% per category") — deferred to v1.4 in REQUIREMENTS.md.
- **Edit-in-preview** (fix invalid rows inline before confirm) — out of scope for v1.3. Workflow: fix the CSV and re-upload, or import valid rows now and edit individually after.
- **Server-side streaming for huge files** — capped at 1 MB / 1000 rows means client-side parse stays fast; streaming is over-engineering for v1.3.
- **`notes` column in CSV** — intentionally omitted to keep the format minimal. Notes can be added per-item via the existing edit Dialog.

</deferred>

---

*Phase: 21-csv-import*
*Context gathered: 2026-05-07*
