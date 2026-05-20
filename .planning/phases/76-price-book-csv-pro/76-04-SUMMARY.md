---
phase: 76
plan: 04
subsystem: price-book / csv-import
tags: [server-action, chunked-import, undo, error-csv]
dependency_graph:
  requires:
    - 76-01 (price_book_imports table + types regen)
    - 76-02 (applyDedupeStrategy + dedupe types)
  provides:
    - commitImportChunk server action (chunked insert/update, ≤50 rows/chunk)
    - undoLastImport server action (5-min server gate, restores prev_state)
    - getRecentUndoableImport helper (Undo banner lookup)
    - buildErrorCsv util (RFC 4180-escaped error report)
  affects:
    - lib/actions/price-book.ts (extended; no existing exports touched)
    - lib/csv/error-csv.ts (new)
tech_stack:
  added: []
  patterns:
    - "Server actions return `{ data } | { error: string }` (matches existing file)"
    - "actor_id sourced from supabase.auth.getClaims().claims.sub (NOT NULL in DB)"
    - "Chunk 0 seeds price_book_imports row; chunks 1..N merge into the same row"
    - "Undo window enforced at action layer (Date.now() vs created_at); RLS handles tenant isolation"
key_files:
  created:
    - lib/csv/error-csv.ts
    - tests/unit/csv/error-csv.test.ts
    - .planning/phases/76-price-book-csv-pro/76-04-SUMMARY.md
  modified:
    - lib/actions/price-book.ts
decisions:
  - "PLAN's commitImportChunk wrapper used applyDedupeStrategy with the (rows/existingKeys/...) shape — that was an older draft contract. 76-02's actual dedupe API is { existing, incoming, global } → { toInsert, toUpdate, skippedCount }. Adapted commitImportChunk to the real API."
  - "perRowOverrides keyed by 1-based index within the chunk slice (not global file row number) — chunks are stateless re: original file position; client owns the mapping back to display."
  - "insertedFolderIds tracked via a pre-check SELECT on price_book_folders before resolveOrCreateFolders, since the latter merges existing+created and doesn't expose which were brand new. Idempotent and cheap (one extra small query per chunk that creates folders)."
  - "folder cell in error CSV reads from canonical folder_name on ImportRow when header is the alias 'folder' — keeps the wizard's bag shape unchanged."
metrics:
  duration: "~8 min"
  completed: 2026-05-20
requirements:
  complete:
    - PB-CSV-06   # dry-run path: dryRun=true returns counts with no writes; client renders summary card
    - PB-CSV-07   # price_book_imports row written + 5-min undoLastImport gate
    - PB-CSV-08   # chunkIndex/totalChunks contract supports streaming progress + cancel between chunks
    - PB-CSV-09   # buildErrorCsv produces downloadable string with error_reason column
  partial:
    - PB-CSV-05   # action layer honors per-row + global dedupe strategies; UI wiring lands in 76-05
---

# Phase 76 Plan 04: Server-Side Commit, Undo & Error CSV Summary

Ships the server backbone for the wizard's Step 4: a chunked commit action that drives `applyDedupeStrategy` against existing items, seeds an undo ledger row in `price_book_imports`, and a paired `undoLastImport` action with a hard 5-minute eligibility gate. Plus a small RFC 4180 CSV builder for the "Download failed rows" affordance.

## What Shipped

### 1. `commitImportChunk(input)` — PB-CSV-06 / 08

Signature:

```ts
interface CommitChunkInput {
  rows: ImportRow[]
  globalStrategy: DedupeStrategy
  perRowOverrides: Record<number, DedupeStrategy>   // 1-based idx within chunk
  folderNameMap?: Record<string, string>            // lowercased key → folder_id
  chunkIndex: number
  totalChunks: number
  importId?: string                                 // present on chunks 1..N
  filename: string
  locale: string
  dryRun?: boolean
}

interface CommitChunkResult {
  importId: string                // 'dry-run' when dryRun=true
  chunkIndex: number
  totalChunks: number
  insertedCount: number
  updatedCount: number
  skippedCount: number
  failedRows: { rowNumber: number; values: ImportRow; reason: string }[]
  done: boolean                   // chunkIndex === totalChunks - 1
}
```

Flow per chunk:

1. **Resolve folders** — pre-check `price_book_folders` for the missing names so we can flag the truly new ones for `inserted_folder_ids`; then call existing `resolveOrCreateFolders`.
2. **Load existing items** for the company (`id`, `folder_id`, `name`, `unit`, `unit_price`, `notes`) and project into the `PriceBookExistingRow` shape `dedupe.ts` expects (folder_id resolved back to its lowercased folder_name via the freshly-built map).
3. **Run `applyDedupeStrategy`** with `{ existing, incoming, global }`. Each `IncomingRow` carries its own `strategyOverride` lifted from `perRowOverrides[idx + 1]`.
4. **Bulk INSERT** the `toInsert` slice in one `.insert(...).select('id')` round-trip. Failed inserts route every row into `failedRows`.
5. **Per-row UPDATE** the `toUpdate` slice (different values per row → can't batch). Each update first snapshots prior `{ name, unit, unit_price, notes }` into `prevState[id]` before writing the new values.
6. **Record/merge** into `price_book_imports`:
   - Chunk 0: INSERT a row with `actor_id`, both id arrays, `prev_state`, and a `summary { filename, locale, inserted, updated, skipped, failed }`.
   - Chunks 1..N: SELECT the existing row, concat id arrays, shallow-merge `prev_state`, additively merge `summary` counts, UPDATE.
7. **Revalidate `/price-book`** only on the final chunk.

`dryRun: true` short-circuits steps 4–7 entirely and returns the planned counts (skipped comes from dedupe; inserted/updated stay at zero since nothing executed). The wizard uses this for the Step 4 summary card before the user clicks Commit.

### 2. `undoLastImport(importId)` — PB-CSV-07

```ts
interface UndoResult { removedItems: number; removedFolders: number; revertedItems: number }
```

- Loads the import row scoped by `company_id` (RLS + explicit filter — belt and suspenders).
- **5-min gate** — `Date.now() - new Date(created_at).getTime() > 5 * 60 * 1000` → returns `{ error: 'Undo window expired (5 minutes).' }`. No DB writes happen past this check.
- **Removes inserted items** via `DELETE … IN (inserted_item_ids)` with `count: 'exact'` for the toast number.
- **Restores updated items** by iterating `updated_item_ids`, reading `prev_state[id]`, and writing `{ name, unit, unit_price, notes }` back. Items missing from `prev_state` are skipped (defensive — shouldn't happen but doesn't poison the rollback).
- **Removes folders** in `inserted_folder_ids` only if they have zero remaining items (cheap `count: 'exact', head: true` probe per folder). Folders the user populated post-import survive.
- **Removes the ledger row** so the Undo banner disappears after a successful rollback.
- Revalidates `/price-book` regardless of partial outcomes.

### 3. `getRecentUndoableImport()` helper

Single-query lookup for the `/price-book` Undo banner: `created_at > now() - 5 min`, descending, `limit 1`, `maybeSingle()`. Returns `{ id, createdAt, summary }` or `null`. 76-05 calls this on the price-book page render to decide whether to show the banner.

### 4. `lib/csv/error-csv.ts` — `buildErrorCsv(rows, headers)`

- Header = `[...headers, 'error_reason']`.
- RFC 4180 cell escaping: any cell containing `,`, `"`, `\n`, or `\r` is wrapped in `"…"` with `"` → `""`.
- Empty `rows` → header-only single-line string (no trailing newline).
- The `folder` header transparently reads from `folder_name` on `ImportRow` when the canonical key is the only thing on the row — keeps the wizard's bag shape from leaking the alias.

### 5. Tests

`tests/unit/csv/error-csv.test.ts` — **6 GREEN cases**:

1. empty rows → header-only
2. basic row with all columns
3. comma escaping
4. embedded `"` doubling
5. embedded newline wrapping
6. `folder` header aliasing `folder_name`

```
Tests  6 passed (6)
```

## Chunk-Merge Logic for `price_book_imports`

The ledger row is treated as an accumulator: chunk 0 seeds it with that chunk's data, subsequent chunks UPDATE by selecting the current value and writing back concatenated arrays + merged JSONBs. This keeps a single Undo target for the whole import even though the import was streamed across N HTTP round-trips. Tradeoff: if chunk M fails after chunk 0 succeeded, the user still has an Undo button — calling Undo at that point reverses every chunk that landed. That matches the desired UX (cancel = abort + offer Undo).

## Error CSV Escape Rules (Concrete)

| Input cell                  | Output                            |
|-----------------------------|-----------------------------------|
| `Drywall`                   | `Drywall`                         |
| `Paint, premium`            | `"Paint, premium"`                |
| `Bolt "1/2 inch"`           | `"Bolt ""1/2 inch"""`             |
| `Multi\nline`               | `"Multi\nline"` (literal newline) |
| `` (empty / undefined)      | (empty cell)                      |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] PLAN's commitImportChunk used an out-of-date `applyDedupeStrategy` interface**
- **Found during:** Task 2 (typing the inner helper)
- **Issue:** PLAN.md passed `{ rows: ParsedRow[], existingKeys: Set, existingNamesByFolder: Map, globalStrategy, perRowOverrides: Map }` and expected `DedupeAction[]` back. The actual 76-02 implementation (per `76-02-SUMMARY.md` Deviation #1) is `{ existing: PriceBookExistingRow[], incoming: IncomingRow[], global }` → `{ toInsert, toUpdate, skippedCount }`, with per-row override carried on each `IncomingRow.strategyOverride`.
- **Fix:** Built `IncomingRow[]` from `input.rows` honoring `perRowOverrides[idx + 1]`, projected existing items into `PriceBookExistingRow[]` (folder_id → folder_name via the resolved folder map), and consumed `{ toInsert, toUpdate, skippedCount }` directly. No call-site needed `DedupeAction` since the wizard renders preview-side, not server-side.
- **Files modified:** `lib/actions/price-book.ts`
- **Commit:** `fdf10e2`

**2. [Rule 2 — Missing functionality] `actor_id` is NOT NULL — needed an explicit fetch**
- **Found during:** Task 2 typing pass
- **Issue:** PLAN.md sketched `actor_id: (await supabase.auth.getUser()).data.user?.id` — the `?` produces `string | undefined`, which the DB rejects. The Insert type for `price_book_imports` requires `actor_id: string`.
- **Fix:** Pulled `actor_id` from `supabase.auth.getClaims().claims.sub` (matching the existing `getAuthContext` pattern in this file) and added an early-return `{ error: 'Not authenticated' }` when absent.
- **Files modified:** `lib/actions/price-book.ts`
- **Commit:** `fdf10e2`

**3. [Rule 3 — Blocking] Distinguishing brand-new folders from pre-existing for `inserted_folder_ids`**
- **Found during:** Task 2 mid-implementation
- **Issue:** `resolveOrCreateFolders` returns a merged map of existing + created folders — there's no signal for which were created this call. Naively pushing every resolved id into `inserted_folder_ids` would cause Undo to try to delete folders that were already there pre-import.
- **Fix:** Added a cheap pre-check `SELECT name FROM price_book_folders WHERE name IN (missing)` before calling `resolveOrCreateFolders`. Anything not in the pre-existing set after resolution is treated as newly created.
- **Files modified:** `lib/actions/price-book.ts`
- **Commit:** `fdf10e2`

**4. [Rule 3 — Blocking] `ctx.error` widening forced `as string` cast**
- **Found during:** `tsc --noEmit` pass
- **Issue:** `getAuthContext()` returns `{ error: 'Not authenticated' as const }` or `{ error: 'No company found' as const }`. When my new functions declared their return as `Promise<{ data } | { error: string }>`, tsc narrowed `ctx.error` to `string | undefined` after the type guard (interaction with the `data` arm of the union) and refused to assign. Existing functions in the file use `error: ctx.error as string` for the same reason (lines 86, 240, 312).
- **Fix:** Matched the existing pattern — `return { error: ctx.error as string }` in all three new functions. No runtime change.
- **Files modified:** `lib/actions/price-book.ts`
- **Commit:** `fdf10e2`

### Authentication Gates

None — all work is at the action layer; auth comes from the session-bound Supabase client.

### Deferred / Out of Scope

- Component errors in `components/price-book/import-wizard/PriceBookImportWizard.tsx` (`Step1Upload`, `Step2Map`, `Step3Preview`, `Step4Confirm` modules missing). These are owned by parallel plan 76-03 and are not touched here.

## Commits

| Hash      | Message                                                            |
|-----------|--------------------------------------------------------------------|
| `fdf10e2` | feat(76-04): commitImportChunk + undoLastImport + error CSV builder |

## Hand-off to 76-05

**Wire Step4Confirm to the streaming loop:**

```ts
const CHUNK = 50
const chunks = sliceIntoChunks(allRows, CHUNK)
let importId: string | undefined
for (let i = 0; i < chunks.length; i++) {
  if (cancelled) break
  const res = await commitImportChunk({
    rows: chunks[i],
    globalStrategy: state.dedupeStrategy,
    perRowOverrides: state.perRowOverrides,         // already 1-based per chunk after slicing
    folderNameMap: state.folderNameMap,
    chunkIndex: i,
    totalChunks: chunks.length,
    importId,
    filename: state.file?.name ?? 'import.csv',
    locale: state.locale,
  })
  if ('error' in res) { /* toast + offer Undo if importId set */ ; break }
  importId = res.data.importId
  setProgress({ inserted: ... , updated: ... , skipped: ... })
  if (res.data.failedRows.length) appendFailed(res.data.failedRows)
}
if (failed.length) {
  const csv = buildErrorCsv(failed, ['name', 'unit_price', 'unit', 'folder', 'notes'])
  downloadBlob(csv, 'import-errors.csv', 'text/csv')
}
```

**Dry-run summary (before the loop):** Call `commitImportChunk({ ...firstChunk, dryRun: true })` — or, more accurately, run `applyDedupeStrategy` client-side over the merged dataset for the Step 4 summary card. The server `dryRun` path exists as a future hook for cross-chunk previews if needed.

**Undo banner on `/price-book`:** Server component calls `getRecentUndoableImport()`; if non-null, render a banner with `summary.inserted/updated/skipped` and an `<UndoButton importId={data.id} createdAt={data.createdAt} />` client component that calls `undoLastImport`. The button should self-hide via a `setInterval` once `createdAt + 5min < now`.

## Self-Check: PASSED

- FOUND: `lib/csv/error-csv.ts`
- FOUND: `tests/unit/csv/error-csv.test.ts`
- FOUND: `lib/actions/price-book.ts` (extended)
- FOUND commit: `fdf10e2`
- VERIFIED: `npx vitest run tests/unit/csv/error-csv.test.ts` → 6 passed
- VERIFIED: `npx tsc --noEmit` shows no errors in `lib/actions/price-book.ts` or `lib/csv/error-csv.ts` (only out-of-scope errors in `components/price-book/import-wizard/*` owned by parallel plan 76-03)
- VERIFIED: `commitImportChunk`, `undoLastImport`, `getRecentUndoableImport` all exported from `lib/actions/price-book.ts`
- VERIFIED: `buildErrorCsv` exported from `lib/csv/error-csv.ts`
