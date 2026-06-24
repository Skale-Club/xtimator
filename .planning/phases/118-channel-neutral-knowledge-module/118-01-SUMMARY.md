---
phase: 118-channel-neutral-knowledge-module
plan: 01
subsystem: api
tags: [pgvector, embeddings, openrouter, rag, knowledge-base, supabase, vitest, tdd]

# Dependency graph
requires:
  - phase: 117-knowledge-schema-pgvector-dual-rls
    provides: "knowledge_entries table (scope industry|company, embedding vector(1536) nullable) + HNSW cosine index + pgvector in extensions schema"
provides:
  - "KnowledgeProvider port + Passage/RetrieveCtx types (the lib/knowledge/ seam every other file imports)"
  - "embed(text) -> number[1536] via OpenRouter /embeddings (KMOD-01)"
  - "match_knowledge_entries pgvector KNN RPC migration (industry+overlay WHERE merge, cosine, idempotent, authored-only)"
  - "6 Wave-0 knowledge test files (2 GREEN here, 4 RED gating Plans 02/03)"
affects: [118-02 retrieve/answer/fixture, 118-03 prompt-hardening, 119 curation, 120 company-overlay, 121 whatsapp-knowledge-intent]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Provider/port SEAM mirrored from lib/estimate/price-research/provider.ts (caller-supplied multi-tenant scope, never from LLM output)"
    - "embed reuses getORKey + OPENROUTER_BASE (plain fetch, no SDK/dep) — building block MAY throw; retrieve() wraps never-throws"
    - "Static SQL contract test (readFileSync + regex + stripComments) for the authored-only RPC migration"
    - "Wave-0 RED test stubs import yet-to-exist module paths so downstream plans inherit a failing GREEN gate"

key-files:
  created:
    - lib/knowledge/provider.ts
    - lib/knowledge/embed.ts
    - supabase/migrations/20260625000002_phase118_match_knowledge_entries.sql
    - tests/unit/knowledge/embed.test.ts
    - tests/unit/knowledge/match-knowledge-rpc-migration.test.ts
    - tests/unit/knowledge/retrieve.test.ts
    - tests/unit/knowledge/answer-hardening.test.ts
    - tests/unit/knowledge/fixture.test.ts
    - tests/unit/knowledge/knowledge-neutrality.test.ts
  modified: []

key-decisions:
  - "embed imports getORKey + OPENROUTER_BASE from lib/ai/openrouter-client (not a re-declared base URL) — single source for the OpenRouter key + base"
  - "EMBEDDING_MODEL is a swappable module const ('openai/text-embedding-3-small'); a future swap is one line + a cheap ALTER ... TYPE vector(N) reindex"
  - "RPC returns similarity = 1 - (embedding <=> query) but ORDERs by the raw <=> distance asc so the HNSW cosine index serves the sort"
  - "Migration authored-only — NO remote apply (no db push, no apply_migration MCP); deploy CI->GHCR->Coolify"

patterns-established:
  - "lib/knowledge/ channel-neutral module: imports no channel package (ENGINE-01), enforced by a static neutrality grep test"
  - "Two GREEN gates land in Plan 01 (embed + RPC contract); four RED gates (retrieve/answer/fixture/neutrality-of-future-source) gate Plans 02/03"

requirements-completed: [KMOD-01]

# Metrics
duration: 6min
completed: 2026-06-24
---

# Phase 118 Plan 01: Channel-Neutral lib/knowledge/ Foundation Summary

**Contracts-first foundation for lib/knowledge/: the KnowledgeProvider port + Passage/RetrieveCtx types, embed(text)->1536-vector via OpenRouter /embeddings (KMOD-01), the match_knowledge_entries pgvector KNN RPC migration (industry+overlay merge, cosine, idempotent, authored-only), and all six Wave-0 test files (2 GREEN, 4 RED gating Plans 02/03).**

## Performance

- **Duration:** ~6 min
- **Started:** 2026-06-24T21:28:52Z
- **Completed:** 2026-06-24T21:34:33Z
- **Tasks:** 3
- **Files modified:** 9 created

## Accomplishments
- `KnowledgeProvider` port + `Passage`/`RetrieveCtx` types — the seam every other module file imports; multi-tenant invariant (industries/companyId caller-supplied, never from LLM output) documented; no channel import.
- `embed(text)` (KMOD-01): 1536-dim `openai/text-embedding-3-small` via OpenRouter `/embeddings`, reusing `getORKey` + `OPENROUTER_BASE`; building block that throws on bad shape / non-2xx; 4/4 unit tests green.
- `match_knowledge_entries` pgvector KNN RPC migration: merges industry KB (`industry_id = any(match_industries)`) + company overlay (`company_id = match_company`), ranked by `embedding <=> query_embedding`, idempotent (`create or replace`), authored-only, secret-free; static contract test 8/8 green.
- All six Wave-0 test files present: embed + RPC-contract + neutrality GREEN now; retrieve + answer-hardening + fixture RED (the GREEN gates Plans 02/03 must satisfy).

## Task Commits

Each task committed atomically (normal hooked commits, in-place, no --no-verify):

1. **Task 1: KnowledgeProvider port + Passage/RetrieveCtx types** - `fd699f3` (feat)
2. **Task 2: embed(text) via OpenRouter /embeddings (KMOD-01, TDD)** - `b0a7685` (test RED) → `960410d` (feat GREEN)
3. **Task 3: match_knowledge_entries RPC migration + RPC contract test + Wave-0 stubs** - `05546b7` (feat)

_Note: Task 2 is TDD — separate test (RED) then feat (GREEN) commits._

## Files Created/Modified
- `lib/knowledge/provider.ts` - server-only KnowledgeProvider port + Passage + RetrieveCtx (the module seam)
- `lib/knowledge/embed.ts` - embed(text) -> number[1536] via OpenRouter /embeddings
- `supabase/migrations/20260625000002_phase118_match_knowledge_entries.sql` - pgvector KNN RPC (cosine, industry+overlay merge, idempotent, authored-only)
- `tests/unit/knowledge/embed.test.ts` - KMOD-01 coverage (1536-len + bad-shape + non-2xx + body assertion) — GREEN
- `tests/unit/knowledge/match-knowledge-rpc-migration.test.ts` - static RPC contract — GREEN
- `tests/unit/knowledge/knowledge-neutrality.test.ts` - static channel-neutrality grep — GREEN
- `tests/unit/knowledge/retrieve.test.ts` - KMOD-02 never-throws RAG read path — RED (gates Plan 02)
- `tests/unit/knowledge/answer-hardening.test.ts` - KMOD-03 + KSEC-01 <knowledge> tag + sanitizeField — RED (gates Plan 03)
- `tests/unit/knowledge/fixture.test.ts` - KMOD-04 deterministic fixture provider — RED (gates Plan 02)

## Decisions Made
- embed reuses `getORKey` + `OPENROUTER_BASE` from `lib/ai/openrouter-client` (the plan's interfaces note confirmed that path holds those exports) — no duplicate base-URL literal.
- RPC orders by the raw `<=>` distance ascending while returning `1 - distance` as `similarity`, so the HNSW cosine index serves the sort and callers still get a higher-is-closer score.
- Provider doc comment reworded to avoid the literal forbidden token (`lib/whatsapp`) so the neutrality grep stays satisfiable on this file.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None. The 4 RED stubs fail at Vite import-resolution (their target modules do not exist yet) — the correct RED signal; they go GREEN once Plans 02/03 land `retrieve`/`prompt`/`adapters/fixture`.

## User Setup Required
None - no external service configuration required. (The RPC migration is authored-only; remote apply is deferred to the CI->GHCR->Coolify deploy.)

## Next Phase Readiness
- Plan 02 (retrieve + fixture adapter) has the `KnowledgeProvider` port, `embed()`, and the `match_knowledge_entries` RPC in hand, plus `retrieve.test.ts` + `fixture.test.ts` as failing GREEN gates.
- Plan 03 (answer + prompt hardening) has `answer-hardening.test.ts` (the `<knowledge>` tag + sanitizeField + ## Security enumeration gate) waiting.
- Operational deferral: apply `20260625000002` to remote via CI->GHCR->Coolify (NOT on the VPS).

## Self-Check: PASSED

All 9 created files verified on disk; all 4 task commits (fd699f3, b0a7685, 960410d, 05546b7) verified in git history.

---
*Phase: 118-channel-neutral-knowledge-module*
*Completed: 2026-06-24*
