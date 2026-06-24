---
phase: 119-super-admin-industry-kb-curation
plan: 01
subsystem: knowledge
tags: [super-admin, knowledge-base, embeddings, pgvector, server-actions]
requires:
  - knowledge_entries table (Phase 117, scope CHECK + HNSW + dual RLS)
  - embed() single-row helper (Phase 118, lib/knowledge/embed.ts)
  - requireAdmin() / requireServiceClient() (admin auth + service-role client)
provides:
  - knowledgeEntrySchema + KnowledgeEntryInput (lib/schemas/knowledge.ts)
  - createEntry / updateEntry / deleteEntry server actions (app/admin/knowledge/actions.ts)
  - embedMany(texts[]) batched embedding helper (lib/knowledge/embed.ts) — consumed by Plan 02
  - AuditAction knowledge_entry.save | knowledge_entry.delete
affects:
  - app/admin/knowledge (new route — UI wired by Plan 03)
tech-stack:
  added: []
  patterns:
    - "Super-admin CRUD: requireAdmin() FIRST -> safeParse -> embed -> requireServiceClient() write -> revalidatePath -> void logAdminAction"
    - "Embed-then-insert (KCUR-02): block the save on embed failure; never write a NULL-embedding industry row"
    - "pgvector first-write: embedding serialized as a JSON.stringify literal ('[...]') for the vector(1536) column"
    - "Re-embed only on change: updateEntry skips embed() when title and body are unchanged"
key-files:
  created:
    - lib/schemas/knowledge.ts
    - app/admin/knowledge/actions.ts
    - tests/unit/knowledge/embed-many.test.ts
    - tests/unit/admin/knowledge-curation-actions.test.ts
  modified:
    - lib/knowledge/embed.ts
    - lib/admin/audit-log.ts
decisions:
  - "Embedding written as JSON.stringify(vec) pgvector literal — unambiguous on the column's first-ever write (Pitfall 2)"
  - "embed failure BLOCKS the save (KCUR-02 block-the-save) — a NULL-embedding row is invisible to retrieve()"
  - "Single knowledge_entry.save audit action covers create AND update (mirrors granularity needs); delete is separate"
metrics:
  duration_min: 5
  tasks: 2
  files_created: 4
  files_modified: 2
  completed: 2026-06-24
---

# Phase 119 Plan 01: Super-Admin Industry KB Curation (Data Layer) Summary

Three `requireAdmin()`-gated server actions (create/update/delete) that write industry-scoped `knowledge_entries` rows via the service-role client with a non-null `vector(1536)` embedding generated on every save, plus the batched `embedMany()` helper Plan 02's bulk import will consume.

## What Was Built

- **`lib/schemas/knowledge.ts`** — `knowledgeEntrySchema` (`industry_id` refined against `isKnownIndustry`, `title` ≤200, `body`, optional `source` ≤500) + `KnowledgeEntryInput`. Mirrors the `blogPostSchema` export pattern.
- **`embedMany(texts[])`** added to `lib/knowledge/embed.ts` — OpenRouter `/embeddings` array input, chunked at ≤96/request, sorts `data[]` by `index` to preserve input order, validates 1536-dim, throws the whole batch on any bad shape, returns `[]` for empty input. The existing single-row `embed()` is unchanged.
- **`app/admin/knowledge/actions.ts`** — `createEntry` / `updateEntry` / `deleteEntry`. Each calls `requireAdmin()` FIRST (the only access control — the service client bypasses RLS), `safeParse`, then writes through `requireServiceClient()`. Create/update embed `title + '\n\n' + body` BEFORE the write and block the save (`ok:false`, no row) if `embed()` throws (KCUR-02). Insert payload pins `scope:'industry'`, `industry_id`, `company_id:null`. `updateEntry` re-embeds only when title/body changed.
- **`lib/admin/audit-log.ts`** — added `knowledge_entry.save` and `knowledge_entry.delete` to the `AuditAction` union.
- **Two Wave-0 test files** — `embed-many.test.ts` (4 cases: input-order preservation under shuffled `index`, 200→3-chunk batching with ≤96/request, bad-shape throw, empty→[]) and `knowledge-curation-actions.test.ts` (10 cases: auth-gate-first, scope/industry_id/company_id invariants, embed-then-insert, embed-failure-blocks-save, re-embed-only-on-change, delete logs the right audit action).

## Pitfall Resolutions

- **Pitfall 2 (pgvector first write):** the `embedding` value is serialized with `JSON.stringify(vec)` (a `'[...]'` vector literal pgvector parses) rather than a raw `number[]`, removing ambiguity on the column's first-ever write. The KCUR-02 tests accept either serialization (array or its JSON literal) and assert a non-null 1536-length vector reaches `.insert`/`.update`.
- **Pitfall 5 (needless re-embed):** `updateEntry` fetches existing `title, body`, computes `needsEmbed`, and omits the `embedding` key from the update payload on a source-only edit.

## Deviations from Plan

None — plan executed exactly as written. Two transient TypeScript errors in the test file (mock arg arity + a `mock.calls[0]?.[0]` tuple type) surfaced during the Task 2 tsc gate and were corrected before the Task 2 commit; source files were clean throughout.

## Verification

- `npx vitest run tests/unit/knowledge/embed-many.test.ts` — 4/4 green
- `npx vitest run tests/unit/admin/knowledge-curation-actions.test.ts` — 10/10 green
- `npx vitest run tests/unit/knowledge tests/unit/admin/knowledge-curation-actions.test.ts` — 60/60 green
- `npx vitest run` (full suite) — 308 files passed, 3 skipped; 2170 tests passed, 0 failures (no regression vs 117/118 baseline)
- `npx tsc --noEmit` — no errors in `app/admin/knowledge/actions.ts`, `lib/schemas/knowledge.ts`, `lib/knowledge/embed.ts`, `lib/admin/audit-log.ts`

## Commits

- `90ed5b86` feat(119-01): add knowledgeEntrySchema + embedMany + Wave-0 test scaffolds
- `b8666936` feat(119-01): gated createEntry/updateEntry/deleteEntry + audit actions (KCUR-01, KCUR-02)

## Known Stubs

None. The data layer is fully wired; the admin UI that calls these actions is Plan 03's scope.

## Self-Check: PASSED

All 6 created/modified files exist; both commits (90ed5b86, b8666936) present in history.
