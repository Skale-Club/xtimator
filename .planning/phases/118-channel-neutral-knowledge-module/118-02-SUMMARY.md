---
phase: 118-channel-neutral-knowledge-module
plan: 02
subsystem: api
tags: [pgvector, rag, knowledge-base, retrieval, never-throws, fixture, determinism, vitest, tdd, channel-neutral]

# Dependency graph
requires:
  - phase: 118-channel-neutral-knowledge-module
    plan: 01
    provides: "KnowledgeProvider port + Passage/RetrieveCtx types, embed(text)->1536-vector, match_knowledge_entries pgvector KNN RPC migration, the retrieve/fixture RED gates"
provides:
  - "retrieve(question, ctx) -> Passage[] (KMOD-02): embed + match_knowledge_entries RPC; NEVER-THROWS ([] + console.warn on any failure); caller-supplied industries/companyId forwarded verbatim"
  - "makeFixtureKnowledgeProvider(corpus) (KMOD-04): pure, in-memory, network-free, deterministic KnowledgeProvider for CI/eval"
affects: [118-03 answer/prompt-hardening, 119 curation, 120 company-overlay, 121 whatsapp-knowledge-intent]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Never-throws read boundary: retrieve wraps the throwing embed() building block + the rpc call in one try/catch → [] (console.warn) on embed throw / rpc error / any exception"
    - "Caller-supplied multi-tenant scope forwarded verbatim to the RPC (industries[]/companyId never read from LLM output, never widened in retrieve)"
    - "Determinism seam mirrored from price-research fixture: make...Provider over a keyed golden corpus, fixed clock (FIXTURE_FIXED_NOW), shared key-derivation helper, NOT a *.test.ts, channel-neutral"

key-files:
  created:
    - lib/knowledge/retrieve.ts
    - lib/knowledge/adapters/fixture.ts
  modified:
    - tests/unit/knowledge/retrieve.test.ts

key-decisions:
  - "retrieve caps results to k defensively (slice(0, k)) in addition to the RPC's match_count, so the 'top-k passages' contract holds regardless of how many rows the RPC returns"
  - "fixture normalizes BOTH corpus keys and the query through one shared normalizeQuestionKey (trim+lowercase) so an authored key and a query can never drift on case/whitespace"
  - "single feat commit for retrieve (not split RED/GREEN): the RED stub already landed in Plan 01; this plan extended the existing stub + landed the source together"

patterns-established:
  - "lib/knowledge/ stays channel-neutral as it grows: the ENGINE-01 static grep gate now scans retrieve.ts + adapters/fixture.ts and finds zero channel tokens"

requirements-completed: [KMOD-02, KMOD-04]

# Metrics
duration: 4min
completed: 2026-06-24
---

# Phase 118 Plan 02: Channel-Neutral lib/knowledge/ (retrieve + deterministic fixture) Summary

**The KMOD-02 never-throws RAG read boundary `retrieve(question, ctx)` (embed the question → `match_knowledge_entries` RPC → ranked `Passage[]`; [] + console.warn on any failure; caller-supplied scope forwarded verbatim) plus the KMOD-04 pure, network-free `makeFixtureKnowledgeProvider` determinism seam — turning the Wave-0 retrieve/fixture RED gates and the ENGINE-01 neutrality gate GREEN across the whole module.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-24T21:37:43Z
- **Completed:** 2026-06-24T21:41:33Z
- **Tasks:** 2
- **Files modified:** 2 created, 1 test extended

## Accomplishments
- `retrieve(question, ctx)` (KMOD-02): embeds the question, calls `rpc('match_knowledge_entries', { query_embedding, match_industries, match_company, match_count })`, maps rows to ranked `Passage[]` capped at `k`. NEVER throws — `[]` + `console.warn` on embed throw, rpc error, or any exception. The caller-supplied `industries[]`/`companyId` are forwarded verbatim (multi-tenant invariant: never from LLM output, never widened here). 4/4 unit tests green.
- `makeFixtureKnowledgeProvider(corpus)` (KMOD-04): a pure, in-memory, network-free `KnowledgeProvider` over a keyed golden corpus — `embed` returns a fixed 1536-stub, `retrieve` reads a synchronous map, `FIXTURE_FIXED_NOW` fixed clock guards future time-dependent fields. The CI/eval determinism seam. 3/3 unit tests green.
- ENGINE-01 neutrality gate GREEN across the whole module: the static grep now scans `retrieve.ts` + `adapters/fixture.ts` (in addition to Plan 01's provider/embed) and finds zero channel tokens — `lib/knowledge/` imports no channel.

## Task Commits

Each task committed atomically (normal hooked commits, in-place, no --no-verify):

1. **Task 1: retrieve(question, ctx) — embed + RPC, never-throws (KMOD-02)** - `b880e13c` (feat)
2. **Task 2: deterministic fixture provider + neutrality gate (KMOD-04, ENGINE-01)** - `aa073ff` (feat)

## Files Created/Modified
- `lib/knowledge/retrieve.ts` - KMOD-02 never-throws RAG read path (embed + match_knowledge_entries RPC → Passage[])
- `lib/knowledge/adapters/fixture.ts` - KMOD-04 deterministic, network-free fixture KnowledgeProvider
- `tests/unit/knowledge/retrieve.test.ts` - extended with the caller-supplied-invariant assertion (Test 4: match_industries/match_company forwarded verbatim)

## Decisions Made
- retrieve caps to `k` defensively (`slice(0, k)`) on top of the RPC's `match_count`, so the "top-k passages" contract holds even if the (mocked or real) RPC returns more rows — the Wave-0 test feeds 8 rows with `k: 3` and asserts length 3.
- The fixture normalizes both corpus keys (at construction) and the query through one shared `normalizeQuestionKey` (trim + lowercase), so a fixture authored as "How do I…" matches a query "how do I…" — the dataset and the lookup can never drift on key derivation.
- Single `feat` commit for retrieve rather than split RED/GREEN: the RED stub already shipped in Plan 01; this plan extended the existing stub and landed the source together as one GREEN step.

## Deviations from Plan
None - plan executed exactly as written. (The fixture's question-key normalization was implied by the plan's `question.trim().toLowerCase()` lookup; the Wave-0 corpus key carried a capital "I", so the same normalization was applied to corpus keys at construction to keep the keyed map consistent — within the plan's stated lookup behavior, not a structural change.)

## Issues Encountered
None blocking. The full `tests/unit/knowledge` run shows `answer-hardening.test.ts` still RED (`@/lib/knowledge/prompt` unresolved) — that is the intended Plan 03 gate, out of scope here. All Plan 02 targets (retrieve, fixture, neutrality) are GREEN; 36/36 knowledge tests pass across the 6 in-scope files.

## User Setup Required
None - no external service configuration required. The fixture is a CI/eval helper, never wired to production.

## Next Phase Readiness
- Plan 03 (answer + prompt hardening) can now compose `retrieve()` (the never-throws read path) and `makeFixtureKnowledgeProvider` (the offline determinism seam) to satisfy `answer-hardening.test.ts` (the `<knowledge>` tag + sanitizeField + ## Security enumeration gate), with the neutrality gate already green across the module.

## Known Stubs
None. The fixture's stub embed vector (`new Array(1536).fill(0)`) is intentional and documented — the fixture's `retrieve` uses the keyed golden map, not the vector; it is a CI/eval determinism seam, not a production path.

## Self-Check: PASSED

- `lib/knowledge/retrieve.ts` — FOUND
- `lib/knowledge/adapters/fixture.ts` — FOUND
- Commit `b880e13c` — FOUND
- Commit `aa073ff` — FOUND

---
*Phase: 118-channel-neutral-knowledge-module*
*Completed: 2026-06-24*
