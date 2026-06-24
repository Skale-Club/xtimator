---
phase: 119-super-admin-industry-kb-curation
plan: 02
subsystem: knowledge
tags: [super-admin, knowledge-base, bulk-import, csv, embeddings, server-actions]
requires:
  - parsePriceBookCsv (the papaparse parser shape this mirrors)
  - embedMany(texts[]) batched embedding helper (Plan 01, lib/knowledge/embed.ts)
  - createEntry/updateEntry/deleteEntry actions + toVectorLiteral (Plan 01, app/admin/knowledge/actions.ts)
  - isKnownIndustry (lib/industries.ts)
provides:
  - parseKnowledgeCsv(file) -> KnowledgeParseOutcome + KnowledgeImportRow (lib/csv/knowledge-import.ts)
  - bulkImportEntries(industryId, rows) server action (app/admin/knowledge/actions.ts)
affects:
  - app/admin/knowledge (bulk-import UI wired by Plan 03)
tech-stack:
  added: []
  patterns:
    - "Bulk import: requireAdmin() FIRST -> isKnownIndustry gate -> server re-validate -> embedMany (batch) -> single bulk .insert as scope='industry' -> revalidatePath -> void logAdminAction"
    - "Transactional-feel batch embed (KCUR-03 / Pitfall 4): embedMany throw aborts the WHOLE import — no partial / NULL-embedding rows reach the table"
    - "One import = one industry: the CSV carries only title,body,source; industryId is chosen in the UI and applied to every row"
    - "CSV caps enforced before any embed: 1 MB / 1000 rows / required title,body columns (mirror of parsePriceBookCsv)"
key-files:
  created:
    - lib/csv/knowledge-import.ts
    - tests/unit/csv/knowledge-import.test.ts
    - tests/unit/admin/knowledge-bulk-import.test.ts
  modified:
    - app/admin/knowledge/actions.ts
decisions:
  - "parseKnowledgeCsv is a simplified near-copy of parsePriceBookCsv: fixed columns title,body,source (source optional), no locale/column-mapping/folder"
  - "bulkImportEntries reuses Plan-01's toVectorLiteral (JSON.stringify pgvector literal) for the embedding write — same serialization as createEntry"
  - "Batch-embed BEFORE the insert; a batch failure imports nothing (no partial dead content invisible to retrieve())"
  - "Worker-thread doc references reworded to avoid the literal 'worker:true' so the Pitfall-3 negative grep stays clean"
metrics:
  duration_min: 6
  tasks: 2
  files_created: 3
  files_modified: 1
  completed: 2026-06-24
---

# Phase 119 Plan 02: Super-Admin Industry KB Curation (Bulk Import) Summary

A `title,body,source` CSV parser (`parseKnowledgeCsv`, a near-copy of `parsePriceBookCsv`) plus a `bulkImportEntries(industryId, rows)` server action that batch-embeds every valid row via Plan 01's `embedMany()` and bulk-inserts them as `scope='industry'` rows in one operation — a batch-embed failure aborts the whole import (no partial dead content).

## What Was Built

- **`lib/csv/knowledge-import.ts`** — `parseKnowledgeCsv(file) -> KnowledgeParseOutcome`. Mirrors `parsePriceBookCsv` exactly: 1 MB size cap (`too_large`), extension/MIME type check (`wrong_type`), `Papa.parse` with `header:true, skipEmptyLines:'greedy', transformHeader` (trim + lowercase + BOM-strip), required `title,body` columns (`missing_columns`), >1000 rows (`too_many_rows`). Simplified to FIXED columns `title,body,source` (source optional → `null` when absent) — no locale, no column-mapping, no folder. Per-row classify pushes `missing_title`/`missing_body`; in-file title dupes (case-insensitive) are FLAGGED, not errors. Never enables the papaparse worker thread (Pitfall 3). Exports `REQUIRED_HEADERS`, `MAX_ROWS`, `MAX_BYTES`, `KnowledgeImportRow`, `ParsedKnowledgeRow`, `KnowledgeRowError`, `KnowledgeParseOutcome`.
- **`app/admin/knowledge/actions.ts`** — appended `bulkImportEntries(industryId, rows)`. `requireAdmin()` FIRST (the only access control — the service client bypasses RLS), `isKnownIndustry(industryId)` gate (`ok:false` on unknown — no embed, no insert), server re-validate (`r.title?.trim() && r.body?.trim()` drops empties; 0 valid → `ok:false`), `embedMany(valid.map(title + '\n\n' + body))` BEFORE the write (a throw → `ok:false` and NO insert — Pitfall 4), then a SINGLE `requireServiceClient().from('knowledge_entries').insert(...)` of rows each pinning `scope:'industry'`, `industry_id`, `company_id:null`, `embedding: toVectorLiteral(embeddings[i])` (Plan-01's pgvector serialization). `revalidatePath('/admin/knowledge')` + `void logAdminAction({ action:'knowledge_entry.save', targetId: industryId, metadata:{ imported, industry_id } })`. Returns `{ ok:true, imported }`. The `KnowledgeActionResult` success arm was widened to `{ ok:true; imported?:number }`; imports added: `embedMany`, `isKnownIndustry`, `type KnowledgeImportRow`.
- **Two test files** — `knowledge-import.test.ts` (13 cases: 3-row parse with a missing-body invalid, missing-title invalid, BOM-strip, case-insensitive + order-independent headers, source optional → null, `missing_columns`/`too_large`/`too_many_rows`/`wrong_type` fatals, in-file dup flag, rowNumber offset, constants) and `knowledge-bulk-import.test.ts` (6 cases: batch-embed + bulk-insert invariants with `embedMany` called once / single `.insert` of 3 rows each scope/industry_id/company_id/embedding asserted, re-validate drops an empty-body row → 2 inserted, 0-valid → ok:false no embed/insert, embedMany-throws → ok:false no insert, unknown industry → ok:false neither called, non-admin gate).

## Pitfall Resolutions

- **Pitfall 3 (no worker thread):** `parseKnowledgeCsv` never sets the papaparse worker option; the two doc-comment references were reworded to avoid the literal so the negative grep stays clean.
- **Pitfall 4 (validate / embed before insert):** caps + required-column checks reject oversize/too-many-rows files before any embed; `embedMany` runs BEFORE the bulk `.insert`, and a throw aborts the whole import with no row written (test 4 proves `.insert` is never called on an `embedMany` failure).
- **Pitfall 2 (pgvector first write) — reused:** the bulk insert serializes each embedding through Plan-01's `toVectorLiteral` (`JSON.stringify(vec)` literal); the test accepts array or JSON-literal form and asserts a 1536-length vector per row.

## Deviations from Plan

None — plan executed exactly as written. One minor in-scope wording fix: the Pitfall-3 acceptance grep (`! grep -q "worker: *true"`) matched the doc-comment prose mentioning the forbidden option, so the two comment references were reworded (no behavior change) to keep the negative grep accurate.

## Verification

- `npx vitest run tests/unit/csv/knowledge-import.test.ts` — 13/13 green
- `npx vitest run tests/unit/admin/knowledge-bulk-import.test.ts` — 6/6 green (incl. embedMany-throws-no-insert, 0-valid, unknown-industry)
- `npx vitest run tests/unit/admin/knowledge-curation-actions.test.ts` — 10/10 green (Plan-01 actions not regressed)
- `npx tsc --noEmit -p tsconfig.json` — no errors in `app/admin/knowledge/actions.ts`, `lib/csv/knowledge-import.ts`
- `npx vitest run` (full suite) — **310 files passed | 3 skipped, 2189 passed | 2 skipped | 33 todo** (baseline 119-01 308/2170; +2 files / +19 tests) — no regressions; the known parallel-only `mcp-route-contract.test.ts` flake did not surface

## Commits

- `4d37547b` feat(119-02): add parseKnowledgeCsv title,body,source parser with caps (KCUR-03)
- `1d8eb4a6` test(119-02): add failing bulkImportEntries test (KCUR-03 RED)
- `fc403d8` feat(119-02): bulkImportEntries batch-embed + bulk-insert industry rows (KCUR-03)

## Known Stubs

None. The parser + bulk-import data path are fully wired; the admin upload UI that calls `parseKnowledgeCsv` + `bulkImportEntries` is Plan 03's scope.

## Self-Check: PASSED
