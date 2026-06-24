---
phase: 119-super-admin-industry-kb-curation
plan: 03
subsystem: knowledge
tags: [super-admin, knowledge-base, admin-ui, csv-import, react-hook-form, pgvector]
requires:
  - createEntry/updateEntry/deleteEntry server actions (Plan 01, app/admin/knowledge/actions.ts)
  - bulkImportEntries server action (Plan 02, app/admin/knowledge/actions.ts)
  - parseKnowledgeCsv + KnowledgeParseOutcome + KnowledgeImportRow (Plan 02, lib/csv/knowledge-import.ts)
  - knowledgeEntrySchema + KnowledgeEntryInput (Plan 01, lib/schemas/knowledge.ts)
  - INDUSTRIES + getIndustryLabel (lib/industries.ts)
  - requireAdmin() + requireServiceClient() (admin auth + service-role client)
provides:
  - /admin/knowledge super-admin route tree (list + new + edit + delete + bulk import)
  - canConfirmImport(industryId, outcome) pure import-gate predicate (app/admin/knowledge/import-card.tsx)
  - Knowledge sidebar nav entry (components/admin/admin-nav.tsx)
affects:
  - Phase 119 super-admin curation surface is now usable end to end (KCUR-01 UI + KCUR-03 UI complete)
tech-stack:
  added: []
  patterns:
    - "Admin CRUD UI mirror: app/admin/blog/* structure copied verbatim, blog fields swapped for KB fields"
    - "Every page server component calls requireAdmin() FIRST, then reads via requireServiceClient() (service client bypasses RLS — the gate is the only access control)"
    - "Industry Select driven by INDUSTRIES (id/label) in both the entry form and the import card"
    - "Pure exported gate predicate (canConfirmImport) so the bulk-import enable rule is unit-provable without rendering the file input"
    - "List groups rows server-side under getIndustryLabel headers (curator works one industry at a time)"
key-files:
  created:
    - app/admin/knowledge/page.tsx
    - app/admin/knowledge/loading.tsx
    - app/admin/knowledge/entry-form.tsx
    - app/admin/knowledge/entry-form-wrapper.tsx
    - app/admin/knowledge/entry-actions.tsx
    - app/admin/knowledge/import-card.tsx
    - app/admin/knowledge/new/page.tsx
    - app/admin/knowledge/[id]/page.tsx
    - app/admin/knowledge/[id]/edit-entry-wrapper.tsx
    - tests/unit/admin/knowledge-entry-form.test.tsx
  modified:
    - components/admin/admin-nav.tsx
decisions:
  - "List grouping is server-side by industry (getIndustryLabel headers) rather than a client filter Select — simpler, stays within the planned 9-file set, and matches the one-industry-at-a-time curator workflow"
  - "import-card.tsx shipped in the Task-1 commit (not Task-2) because page.tsx imports it; keeping every commit buildable required the source to land with its consumer. Task 2 added only the gate test"
  - "Wrappers coerce empty/whitespace source -> null before calling the action, so a blank Source field persists as NULL (not an empty string)"
  - "Status column shows an 'Indexed' (success) badge when embedding is present and an amber 'Needs reindex' badge when null — cheap insurance; with embed-then-insert it should never appear"
metrics:
  duration_min: 5
  tasks: 2
  files_created: 10
  files_modified: 1
  completed: 2026-06-24
---

# Phase 119 Plan 03: Super-Admin Industry KB Curation (Admin UI) Summary

The super-admin Knowledge surface at `/admin/knowledge` — a list grouped by industry, a create/edit form (industry Select + title + body + source) wired to Plan 01's `createEntry`/`updateEntry`, per-row delete via `deleteEntry`, a CSV bulk-import card wired to Plan 02's `parseKnowledgeCsv` + `bulkImportEntries`, and the sidebar nav entry — every page gated by `requireAdmin()` and reading/writing `scope='industry'` rows through the service client.

## What Was Built

- **`app/admin/knowledge/page.tsx`** (`force-dynamic`) — `requireAdmin()` FIRST, then `requireServiceClient().from('knowledge_entries').select('id, industry_id, title, source, embedding, created_at').eq('scope','industry').order('created_at', desc)`. Rows grouped server-side under `getIndustryLabel` headers; each row links to the edit page, shows Source, an Indexed/Needs-reindex status badge (driven by `embedding == null`), Created date, and `<EntryActions>`. A "New entry" button + the `<ImportCard/>` mounted above the table. Empty state copy: "No entries yet. Create your first industry KB entry."
- **`app/admin/knowledge/entry-form.tsx`** (`'use client'`) — `useForm` + `zodResolver(knowledgeEntrySchema)`. Fields: `industry_id` (INDUSTRIES `<Select>`, defaults to `initial.industry_id` on edit), `title` (Input), `body` (Textarea `min-h-[300px]`), `source` (Input, optional). Submit label "Save entry".
- **`app/admin/knowledge/entry-form-wrapper.tsx`** + **`[id]/edit-entry-wrapper.tsx`** (`'use client'`) — `useTransition` wrappers calling `createEntry` / `updateEntry(id, ...)`, coercing empty source → null, toasting, and `router.push('/admin/knowledge')` on success.
- **`app/admin/knowledge/entry-actions.tsx`** (`'use client'`) — delete arm only: `confirm()` → `deleteEntry(id)` → toast + `router.refresh()`.
- **`app/admin/knowledge/new/page.tsx`** + **`[id]/page.tsx`** — `requireAdmin()`-gated; new wraps `<EntryFormWrapper/>`, edit `maybeSingle()` by id with `notFound()` and `<EditEntryWrapper entry={...}/>`.
- **`app/admin/knowledge/import-card.tsx`** (`'use client'`) — glass Card "Bulk import": INDUSTRIES Select + `<input type="file" accept=".csv">` + a "{valid} valid, {invalid} invalid, {dup} duplicate" preview + a Confirm button. `onFile` → `parseKnowledgeCsv(file)` (toasts `detail` on `ok:false`). `onConfirm` → `bulkImportEntries(industryId, validRows)` in `useTransition`, toast `Imported {n} entries` + `router.refresh()`. Exports the pure **`canConfirmImport(industryId, outcome)`** gate.
- **`app/admin/knowledge/loading.tsx`** — mirrors blog loading inside `AdminShellSkeleton`.
- **`components/admin/admin-nav.tsx`** — added `BookOpen` import + `{ href: '/admin/knowledge', label: 'Knowledge', Icon: BookOpen }` after Blog.
- **`tests/unit/admin/knowledge-entry-form.test.tsx`** — 6 cases proving the `canConfirmImport` gate (no-industry / no-valid-rows / null / fatal → false; industry + valid rows → true) plus the INDUSTRIES options the Selects render.

## Deviations from Plan

None functional — plan executed as written. Two within-scope structuring choices:
- **List filter:** the plan offered a client industry-filter Select OR server-side grouping; chose server-side grouping under `getIndustryLabel` headers (simpler, no extra file).
- **import-card commit placement:** `import-card.tsx` is Task-2 scope but `page.tsx` (Task 1) imports it, so the source shipped in the Task-1 commit to keep every commit buildable; the Task-2 commit added only the gate test (TDD seam).

## Verification

- `npx vitest run tests/unit/admin/knowledge-entry-form.test.tsx` — 6/6 green
- `npx tsc --noEmit -p tsconfig.json` — no errors in any `app/admin/knowledge/*` file or `admin-nav.tsx` (pre-existing unrelated test-file TS errors untouched)
- `npx vitest run` (full suite) — **311 files passed | 3 skipped; 2195 passed | 2 skipped | 33 todo** (baseline 119-02: 310 files / 2189 tests; +1 file / +6 tests) — no regressions
- All 10 new files + admin-nav present; all Task 1 + Task 2 acceptance greps pass

## Checkpoint

Task 3 (`checkpoint:human-verify` — end-to-end create/edit/delete + bulk import against a migrated env) was **auto-approved** per the project standing instruction (never pause for human-verify during phase runs). The verification environment depends on Phase 117/118 migrations being deployed (CI→GHCR→Coolify) and the OpenRouter key configured so `embed()` works — an operational deferral, not a code blocker.

## Known Stubs

None. The UI is fully wired to Plan 01/02's actions. The amber "Needs reindex" status badge is intentional cheap insurance (embed-then-insert means it should never render in practice).

## Self-Check: PASSED
