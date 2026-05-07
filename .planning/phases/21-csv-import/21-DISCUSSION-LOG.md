# Phase 21: CSV Import - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-07
**Phase:** 21-csv-import
**Areas discussed:** Entry surface, CSV format contract, Duplicate handling, Validation & preview UX
**Mode:** User invoked discuss-phase, then said "faca o recomendado" — Claude selected the recommended option for every gray area without further questions.

---

## Entry Surface (Onde mora o fluxo de import)

| Option | Description | Selected |
|--------|-------------|----------|
| Dialog modal disparado por botão "Import CSV" em /settings/price-book | Reuses Phase 20 D-05 Dialog pattern, keeps user in list context | ✓ (recommended) |
| Sub-rota dedicada /settings/price-book/import com preview em página cheia | More space for preview but breaks the established add/edit Dialog pattern | |

**User's choice:** "faca o recomendado" → Dialog modal
**Notes:** Consistent with add/edit Dialog (Phase 20 D-05). The "Import CSV" button is placed next to "Add Item" in the list header (D-02).

---

## CSV Format Contract (Estrutura/formato do CSV)

| Aspect | Decision | Selected |
|--------|----------|----------|
| Columns | `category, name, unit, unit_price` (4 cols) | ✓ |
| Header row | Required, case-insensitive matching, order-independent | ✓ |
| Decimal separator | Dot only (US-only product) | ✓ |
| `unit` cell | May be blank (matches schema optional) | ✓ |
| `notes` column | Omitted from CSV — keep format minimal | ✓ |
| Template | Downloadable template CSV linked from Dialog | ✓ |
| Extra columns | Silently ignored | ✓ |
| Missing required column | Whole-file rejection before preview | ✓ |

**User's choice:** "faca o recomendado" → all defaults applied
**Notes:** Dot-decimal aligns with CLAUDE.md US-only constraint. Template seeds the right column names so users don't guess.

---

## Duplicate Handling (Tratamento de duplicatas)

| Option | Description | Selected |
|--------|-------------|----------|
| Skip silently on (name, category) match | User-friendly default; re-importing same file = no-op; summary shows count | ✓ (recommended) |
| Append all (allow duplicates) | Simplest but creates clutter on re-upload | |
| Replace duplicates (last-write-wins) | Risk of overwriting user's manual edits | |
| Per-import user choice | Adds UI complexity for an edge case | |

**User's choice:** "faca o recomendado" → Skip silently
**Notes:** Duplicate detection runs server-side inside `importPriceBookItems` (D-19) to avoid race conditions and trust issues. Within-file duplicates: first occurrence wins (D-09).

---

## Validation & Preview UX (Validação + erro UX no preview)

| Aspect | Decision | Selected |
|--------|----------|----------|
| Invalid criteria | Missing category/name/unit_price, non-numeric or negative unit_price | ✓ |
| Validation source | Reuse `priceBookItemSchema` from Plan 20-01 (single-source) | ✓ |
| Preview display | Show ALL rows, invalid marked red + tooltip | ✓ |
| Summary banner | "X valid · Y invalid · Z duplicates" above table | ✓ |
| Confirm button | "Import X items" — disabled when X = 0 | ✓ |
| On confirm | Partial import — only valid rows inserted; no all-or-nothing block | ✓ |
| Edit-in-preview | Out of scope — user fixes CSV and re-uploads | ✓ |

**User's choice:** "faca o recomendado" → all defaults applied
**Notes:** Whole-file errors (wrong type, >1MB, >1000 rows, missing required column) are caught BEFORE the preview opens (D-14).

---

## Claude's Discretion (não perguntado)

- **Library:** papaparse (~45 KB, MIT, handles BOM/quoted commas)
- **Insert strategy:** Single bulk `supabase.insert(rows)` call (transaction implicit, RLS per row)
- **File caps:** 1 MB / 1000 rows hard limit, communicated upfront
- **Accepted MIME:** `text/csv` and `.csv` only
- **File-picker primitive:** native `<input type="file">` styled as button (drag-and-drop optional, defer to plan if simple to add)
- **Error message tone:** friendly + actionable (e.g., "We need a CSV file under 1 MB" not "Invalid input")

## Deferred Ideas

(Already filed as out-of-scope in CONTEXT.md `<deferred>` section)

- Excel / Google Sheets import → v2
- Import history / undo → not requested
- Bulk price adjustment (+10% per category) → v1.4
- Edit-in-preview → out of scope
- `notes` column in CSV → keep format minimal
- Server-side streaming → not needed at 1 MB / 1000 row cap
