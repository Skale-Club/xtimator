---
phase: 76
plan: 02
subsystem: price-book / csv-import
tags: [logic, parser-extension, dedupe, wizard-reducer, tests-green]
dependency_graph:
  requires:
    - 76-01 (ALIAS_DICTIONARY constant, locale-parser stubs, Wave-0 RED tests, ParsedRow types)
  provides:
    - detectColumnMapping (priority-based header → target resolver)
    - parseCurrency + detectLocale (US/BR/Plain/Custom)
    - applyDedupeStrategy + DedupeResult shape
    - wizardReducer + initialWizardState + serializeDraft/deserializeDraft
    - parsePriceBookCsv ParseOptions ({ locale, customLocale, mapping })
  affects:
    - lib/csv/* (logic surface for 76-03 UI + 76-04 server actions)
tech_stack:
  added: []
  patterns:
    - "Pure-function logic layer — no React/DOM imports in lib/csv/*"
    - "Reducer file ships its own DedupeStrategy type to avoid circular dep with dedupe.ts"
    - "Mapping inverse lookup (target → csv header) in parser to keep callers using canonical field names"
key_files:
  created:
    - lib/csv/dedupe.ts
    - lib/csv/wizard-state.ts
    - .planning/phases/76-price-book-csv-pro/76-02-SUMMARY.md
  modified:
    - lib/csv/price-book-aliases.ts (real detectColumnMapping; added 'description'/'desc' to notes fallback)
    - lib/csv/locale-parser.ts (real parseCurrency + detectLocale)
    - lib/csv/price-book-import.ts (additive ParseOptions; backward-compatible)
    - tests/unit/csv/dedupe.test.ts (removed now-unused @ts-expect-error)
    - tests/unit/csv/wizard-state-machine.test.ts (removed now-unused @ts-expect-error)
decisions:
  - "Added 'description' and 'desc' to notes aliases so they fall through when 'name' header is also present (matches PB-CSV-02 spec + RED test)"
  - "parser extension (locale/mapping) added even though no current test required it — 76-03 UI needs it and the PLAN.md required it for hand-off"
  - "wizard state uses `file: File | null` (not `fileName`) to match RED test contract"
  - "File object dropped from serializeDraft — File isn't JSON-serializable; user must re-upload after sessionStorage reload"
  - "Removed @ts-expect-error in 76-01 tests now that the modules exist (tsc was failing on superfluous directives; runtime tests pass either way)"
metrics:
  duration: "~10 min"
  completed: 2026-05-20
requirements:
  complete:
    - PB-CSV-02   # alias detector live (impl + tests GREEN)
    - PB-CSV-04   # locale parser live (impl + tests GREEN)
    - PB-CSV-05   # dedupe resolver live (impl + tests GREEN)
  partial:
    - PB-CSV-10   # 37/37 Wave-0 tests GREEN; E2E + i18n still owed (76-05)
---

# Phase 76 Plan 02: Wizard Logic Layer (Aliases + Locale + Dedupe + Reducer) Summary

Implements the pure-logic backbone for the 4-step CSV import wizard. Every Wave-0 RED test from 76-01 is now GREEN (37/37), and the 17 baseline parser tests remain GREEN — total 54/54 in `tests/unit/csv/`. The 76-03 UI plan can mount each of these primitives without writing any logic in components.

## What Shipped

### 1. `detectColumnMapping` (PB-CSV-02)

Priority-based per-target claiming with case-insensitive normalization:

- Priority order `['name', 'unit_price', 'folder', 'unit', 'notes']`
- Each target claims the first matching header in `headers` order
- A header already claimed by a higher-priority target falls through to the next-priority target whose alias list contains it
- Unknown headers map to `'_skip'`

Notable: `'description'` and `'desc'` were added to `ALIAS_DICTIONARY.notes` (in addition to `name`) so that when both `name` and `description` headers are present, `name` claims `name` and `description` cleanly falls to `notes` — matches the PB-CSV-02 spec and the locked RED test.

### 2. `parseCurrency` + `detectLocale` (PB-CSV-04)

`parseCurrency(raw, mode, custom?)` — strips `R$`/`$`/`€`/`£`/`¥`, a single quote layer, and whitespace; then:

| Mode    | Transformation                                                  |
|---------|-----------------------------------------------------------------|
| `us`    | strip `,` thousands                                             |
| `br`    | strip `.` thousands, swap `,` → `.` decimal                     |
| `plain` | leave as-is                                                     |
| `custom`| strip `custom.thousands`, swap `custom.decimal` → `.`           |

Returns `Math.round(n * 100) / 100` or `null` for empty / unparseable input.

`detectLocale(samples)` — heuristic over up to 5 samples; BR (`1.234,56` or `99,00`) wins over US (`1,234.56`) wins over Plain (`1234.56`). Defaults to `plain`.

### 3. `lib/csv/dedupe.ts` (PB-CSV-05) — NEW

```ts
applyDedupeStrategy({ existing, incoming, global }): {
  toInsert: DedupeInsert[]
  toUpdate: DedupeUpdate[]
  skippedCount: number
}
```

Dedup key: case-insensitive `(folder_name, name)`. Per-row `strategyOverride` on incoming rows beats `global`. The `'new'` strategy assigns `Name (2)`, `(3)`, … walking suffixes until a free slot is found — collisions stack within the batch (two consecutive `'new'` rows produce `(2)` then `(3)`).

### 4. `lib/csv/wizard-state.ts` (PB-CSV-01) — NEW

11-action reducer covering the full wizard lifecycle:

`FILE_PARSED | LOCALE_SET | MAPPING_SET | MAPPING_COMPLETE | EDIT_CELL | DEDUPE_STRATEGY_SET | DEDUPE_ROW_OVERRIDE | PREVIEW_COMPLETE | BACK | RESET | RESTORE_DRAFT`

Plus `serializeDraft(state)` → JSON (omits the `File` object) and `deserializeDraft(json)` → state or `null` (when malformed / wrong version / >24h old).

### 5. Parser extension (additive, backward-compatible)

`parsePriceBookCsv(file, options?)` — new optional second arg:

```ts
interface ParseOptions {
  locale?: LocaleMode
  customLocale?: CustomLocale
  mapping?: Record<string, TargetField | '_skip'>
}
```

- When `mapping` is provided, an inverse lookup (`target → csv header`) drives row extraction so the wizard can hand the parser a remapped header set instead of pre-renaming columns
- When `locale` is provided, `parseCurrency` replaces `Number()` for `unit_price` — invalid → `'invalid_unit_price'` error; negative → `'negative_unit_price'`
- Notes column is now read via header (default `'notes'`) — previously hardcoded to empty string
- Omitting `options` preserves baseline behavior 1:1 (all 17 baseline tests still GREEN)

## Test Counts

| File                                  | Tests | Status |
|---------------------------------------|------:|--------|
| `tests/unit/csv/aliases.test.ts`      |  9    | GREEN  |
| `tests/unit/csv/locale-parsing.test.ts` | 15  | GREEN  |
| `tests/unit/csv/dedupe.test.ts`       |  6    | GREEN  |
| `tests/unit/csv/wizard-state-machine.test.ts` | 7 | GREEN  |
| **Wave-0 subtotal**                   | **37**| **GREEN** |
| `tests/unit/csv/price-book-import.test.ts` (baseline) | 17 | GREEN |
| **Total `tests/unit/csv/`**           | **54**| **GREEN** |

`npx tsc --noEmit` — clean (after removing the now-unused `@ts-expect-error` directives left in the 76-01 RED test files).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 — Bug] PLAN.md interface for `dedupe.ts` didn't match locked RED test contract**
- **Found during:** Task 2 (reading `dedupe.test.ts`)
- **Issue:** PLAN.md proposed `DedupeInput { rows, existingKeys, existingNamesByFolder, globalStrategy, perRowOverrides }` returning `DedupeAction[]`. The RED test contract from 76-01 is `{ existing, incoming, global }` returning `{ toInsert, toUpdate, skippedCount }`, with per-row `strategyOverride` carried on each `IncomingRow`.
- **Fix:** Implemented to match the RED tests (which 76-01 SUMMARY explicitly calls "the contract baseline"). PLAN.md's broader `DedupeAction` shape was never depended on by any test or downstream caller.
- **Files modified:** `lib/csv/dedupe.ts`
- **Commit:** `f2981ff`

**2. [Rule 1 — Bug] PLAN.md interface for `wizard-state.ts` diverged from locked RED test contract**
- **Found during:** Task 3 (reading `wizard-state-machine.test.ts`)
- **Issue:** PLAN.md proposed `fileName: string`, `globalDedupeStrategy`, `RESTORE_DRAFT { state }`; RED test uses `file: File | null`, `dedupeStrategy`, `RESTORE_DRAFT { draft }`, `mapping?` (optional).
- **Fix:** Implemented to match RED tests. Kept all 11 actions from PLAN.md but renamed fields and action payload keys to satisfy the locked contract.
- **Files modified:** `lib/csv/wizard-state.ts`
- **Commit:** `fbdb989`

**3. [Rule 2 — Missing functionality] Added `'description'` + `'desc'` to `ALIAS_DICTIONARY.notes`**
- **Found during:** Task 1 verify (test "name wins for name, description falls to notes" failed)
- **Issue:** Without `'description'` in the notes alias list, after `name` claims a different header, `description` could only fall through to `'_skip'`. Test expected `notes`.
- **Fix:** Added per CONTEXT.md spec: `notes: comments, description (lower priority — falls back if name matched first)`. Priority order ensures `name` still wins when only `description` is present.
- **Files modified:** `lib/csv/price-book-aliases.ts`
- **Commit:** `ebcfe2d`

**4. [Rule 3 — Blocking] Removed unused `@ts-expect-error` directives in two 76-01 RED tests**
- **Found during:** `tsc --noEmit` verification
- **Issue:** Two 76-01 test files used `@ts-expect-error — module created in 76-02` over the import line. Once the modules exist, those directives become unused and `tsc` errors with TS2578. Tests pass at runtime either way (vitest doesn't type-check), but `tsc` clean is a 76-02 success criterion.
- **Fix:** Removed the directives only. Test bodies and assertions are unchanged.
- **Files modified:** `tests/unit/csv/dedupe.test.ts`, `tests/unit/csv/wizard-state-machine.test.ts`
- **Commit:** `fbdb989`

### Authentication Gates

None.

## Commits

| Hash      | Message |
|-----------|---------|
| `ebcfe2d` | feat(76-02-01): implement detectColumnMapping + parseCurrency/detectLocale |
| `f2981ff` | feat(76-02-02): add dedupe resolver + extend parser with locale/mapping options |
| `fbdb989` | feat(76-02-03): implement wizard reducer + sessionStorage draft serialization |

## Hand-off

### To 76-03 (Wizard UI — 4 steps)

Mount these primitives directly; no logic in components:

- **Step 1 (Upload):** call `parsePriceBookCsv(file)` (no options yet — baseline parse for detection); then dispatch `{ type: 'FILE_PARSED', file, rows, headers }`. Optionally call `detectLocale(samples)` over the first 5 raw `unit_price` cells before re-parsing with `{ locale }`, then dispatch `LOCALE_SET`.
- **Step 2 (Map):** seed `mapping` via `detectColumnMapping(headers)`; user `<Select>` per column dispatches `MAPPING_SET`; "Next" dispatches `MAPPING_COMPLETE`.
- **Step 3 (Preview):** re-run `parsePriceBookCsv(file, { locale, customLocale, mapping })` to apply user mapping + locale. Show inline edits via `EDIT_CELL`. Dedupe radio dispatches `DEDUPE_STRATEGY_SET`; per-row override dispatches `DEDUPE_ROW_OVERRIDE`.
- **Step 4 (Confirm):** call `applyDedupeStrategy({ existing: <fetched-existing>, incoming: <merged-edits>, global: dedupeStrategy })` to compute the dry-run summary. Pass `toInsert + toUpdate` to the 76-04 server action.

Sessionstorage hook: on every state change call `sessionStorage.setItem('xtimator:price-book-import:draft:v1', serializeDraft(state))`. On mount, `deserializeDraft(...)` → `{ type: 'RESTORE_DRAFT', draft }` if not null. Always check `state.file === null` to prompt for re-upload after restore.

### To 76-04 (Server: chunked commit, undo action, error CSV)

The dedupe `DedupeResult` shape is the input shape for `commitImportChunk`:

- `toInsert: DedupeInsert[]` → insert rows; collect resulting IDs into `inserted_item_ids` for `price_book_imports`
- `toUpdate: DedupeUpdate[]` → snapshot pre-state into `prev_state JSONB`, then update; collect IDs into `updated_item_ids`
- `skippedCount` → store in `summary JSONB.skip_count`

Folder creation flows through the existing `resolveOrCreateFolders` server action (Phase 21 baseline) — new `folder_name` values become new folders and get tracked in `inserted_folder_ids`.

## Self-Check: PASSED

- FOUND: `lib/csv/dedupe.ts`
- FOUND: `lib/csv/wizard-state.ts`
- FOUND: `lib/csv/price-book-aliases.ts` (modified — real impl)
- FOUND: `lib/csv/locale-parser.ts` (modified — real impl)
- FOUND: `lib/csv/price-book-import.ts` (modified — ParseOptions)
- FOUND commit: `ebcfe2d`
- FOUND commit: `f2981ff`
- FOUND commit: `fbdb989`
- VERIFIED: `npx vitest run tests/unit/csv/` → 54 passed (37 wave-0 + 17 baseline)
- VERIFIED: `npx tsc --noEmit` clean
