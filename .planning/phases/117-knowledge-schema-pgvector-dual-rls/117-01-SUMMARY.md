---
phase: 117-knowledge-schema-pgvector-dual-rls
plan: 01
subsystem: database
tags: [pgvector, postgres, rls, supabase, embeddings, hnsw, knowledge-base, migration]

# Dependency graph
requires:
  - phase: 79-foundation-schema-cookie-active-company
    provides: company_members(user_id, company_id, role) join table — the tenant RLS subquery
  - phase: 106-price-research-cache
    provides: the neutral/service-role-only RLS posture (RLS enabled, zero client write policies)
  - phase: 112-credit-ledger
    provides: the company_members SELECT subquery + (select auth.uid()) idiom + idempotent/authored-only migration convention
provides:
  - pgvector (vector) extension enabled idempotently (extensions schema)
  - public.knowledge_entries table — scope-discriminated (industry|company), nullable industry_id/company_id, title/body/source, embedding vector(1536), created_at/updated_at
  - scope-discriminant CHECK (industry => industry_id set & company_id NULL; company => company_id NOT NULL)
  - HNSW cosine similarity index on embedding (vector_cosine_ops)
  - dual RLS — industry rows readable-to-all-authenticated + service-role-write-only; company overlay rows tenant-gated read AND write via company_members
  - static SQL-contract test locking the migration shape (CI, no DB, no secrets)
affects: [118-channel-neutral-knowledge-module, 119-super-admin-industry-kb-curation, 120-company-kb-overlay, 121-whatsapp-knowledge-intent]

# Tech tracking
tech-stack:
  added: [pgvector (vector extension), HNSW vector_cosine_ops index]
  patterns:
    - "Dual RLS on one scope-discriminated table via PostgreSQL permissive-policy OR semantics (neutral/service-role-write + tenant-overlay coexist)"
    - "Service-role-only writes expressed by the ABSENCE of any scope='industry' write policy (service role bypasses RLS)"
    - "embedding vector(1536) pinned for text-embedding-3-small; nullable while the table ships DORMANT"

key-files:
  created:
    - supabase/migrations/20260625000001_phase117_knowledge_entries.sql
    - tests/unit/knowledge/knowledge-entries-migration.test.ts
  modified: []

key-decisions:
  - "Pin embedding vector(1536) for text-embedding-3-small v1 — HNSW requires a fixed dimension; a future provider swap is a cheap ALTER TYPE + reindex on the empty table"
  - "Industry SELECT = readable by ALL authenticated (neutral/non-secret); the industries[] relevance filter belongs in Phase 118 retrieve() WHERE, not RLS"
  - "embedding NULLABLE — the table ships DORMANT, nothing writes vectors until Phase 118"
  - "No updated_at auto-touch trigger (out of scope per RESEARCH Open Q3); column carries default now()"

patterns-established:
  - "Pattern: dual-posture RLS — one SELECT policy OR-ing scope='industry' (all-authenticated) with the company_members arm for scope='company'; INSERT/UPDATE/DELETE gated to the owning company only; industry writes via the policy ABSENCE"
  - "Pattern: static SQL-contract test (readFileSync + regex, stripComments for negative assertions) mirroring credit-ledger-migration.test.ts — runs in CI with no DB and no secrets"

requirements-completed: [KB-01, KB-02, KB-03]

# Metrics
duration: 4min
completed: 2026-06-24
---

# Phase 117 Plan 01: Knowledge Schema + pgvector + Dual RLS Summary

**One idempotent, authored-only migration enabling pgvector and creating the scope-discriminated `knowledge_entries` table (embedding `vector(1536)` + HNSW cosine index) with two coexisting RLS postures — industry rows neutral/service-role-write + readable-to-all, company-overlay rows tenant-gated via `company_members` — plus a static SQL-contract test.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-24T21:02:36Z
- **Completed:** 2026-06-24T21:06:36Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- pgvector enabled idempotently (`create extension if not exists vector with schema extensions`).
- `public.knowledge_entries` table: scope discriminator (`industry|company`), nullable `industry_id`/`company_id`, `title`/`body`/`source`, `embedding vector(1536)`, `created_at`/`updated_at`, and a scope-keys CHECK enforcing the discriminant invariant.
- HNSW cosine index `knowledge_entries_embedding_hnsw_idx using hnsw (embedding vector_cosine_ops)` — builds correctly on the empty curated table.
- Dual RLS: one SELECT policy OR-ing `scope='industry'` (all authenticated) with the `company_members` arm for `scope='company'`; company-scoped INSERT/UPDATE/DELETE via `company_members`; industry writes service-role-only (no policy targets `scope='industry'`).
- Static contract test (15 assertions) locks every contract element; ran RED-by-missing-migration → GREEN after authoring.
- Full vitest suite green (299 files / 2125 tests); no remote apply performed.

## Task Commits

Each task was committed atomically (TDD: RED → GREEN):

1. **Task 1: Static migration-contract test (RED scaffold)** - `868cd1b6` (test)
2. **Task 2: knowledge_entries migration (GREEN — extension + table + HNSW + dual RLS)** - `fdc321f2` (feat)

## Files Created/Modified
- `supabase/migrations/20260625000001_phase117_knowledge_entries.sql` - The one idempotent, authored-only migration: pgvector extension + scope-discriminated table + scope-keys CHECK + HNSW cosine index + dual RLS (industry neutral/service-role-write + company overlay via company_members). Filename sorts strictly after `20260624000004_phase112_credit_ledger.sql`.
- `tests/unit/knowledge/knowledge-entries-migration.test.ts` - 15 static SQL-contract assertions (KB-01/02/03) via readFileSync + regex; `stripComments` helper for the no-`companies.user_id` and no-`WITH CHECK scope='industry'` negative assertions. New `tests/unit/knowledge/` directory.

## Decisions Made
- Followed plan as specified. The migration SQL was lifted verbatim from the plan's locked `<action>` block; the test implements the exact assertion checklist from the plan `<behavior>`.
- Used `vector(1536)` UNQUALIFIED (resolves on the search_path on Supabase even with the extension in `extensions`); the contract test accepts either form.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None. RED state was confirmed as `ENOENT` (missing migration), not a test syntax/import error — the correct Wave-0 RED state. Test flipped fully GREEN after Task 2.

## User Setup Required
None - no external service configuration required in this phase. The migration is authored-only; deploy is owned by CI→GHCR→Coolify (never built/migrated on the VPS). Post-deploy, the `vector` extension + `knowledge_entries` table + HNSW index land in the remote DB through the pipeline.

## Next Phase Readiness
- The schema foundation is in place. Phase 118 (`lib/knowledge/` channel-neutral module) can now build `embed()` + `retrieve()` over `knowledge_entries` — the table ships DORMANT (embedding nullable) until that phase writes vectors.
- The dual RLS is the security boundary; Phase 118's `retrieve()` applies the `industries[]` relevance filter in its WHERE (not RLS).
- No blockers. Operational deferral: apply the migration to remote via CI→GHCR→Coolify (not in this phase).

## Known Stubs
None — the table intentionally ships DORMANT (no app code writes the `embedding` vector until Phase 118). The `embedding` column is nullable by design, documented in the migration header and PROJECT.md/STATE.md; this is the planned v4.8 sequencing, not a stub blocking the plan's goal.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260625000001_phase117_knowledge_entries.sql
- FOUND: tests/unit/knowledge/knowledge-entries-migration.test.ts
- FOUND: .planning/phases/117-knowledge-schema-pgvector-dual-rls/117-01-SUMMARY.md
- FOUND commit: 868cd1b6 (Task 1 — RED test)
- FOUND commit: fdc321f2 (Task 2 — migration GREEN)

---
*Phase: 117-knowledge-schema-pgvector-dual-rls*
*Completed: 2026-06-24*
