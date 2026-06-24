---
phase: 105-price-source-researched-threading
plan: 01
subsystem: ai-estimate-pipeline
tags: [price-source, researched, dormant-threading, schema, migration]
requires:
  - estimate_items.price_source CHECK (Phase 19)
  - estimateOutputSchema / LineItemOutput (Phase 100 GUARD-01)
provides:
  - "estimate_items.price_source accepts 'researched' (DB CHECK widened, idempotent migration)"
  - "estimateOutputSchema preserves a 'researched' price_source value (no longer coerced to ai_estimate)"
  - "LineItemOutput.price_source union includes 'researched'"
affects:
  - Phase 108 (research agent that will WRITE 'researched')
tech-stack:
  added: []
  patterns:
    - "Idempotent CHECK-widening: DROP CONSTRAINT IF EXISTS (autonamed inline + new named) then ADD named CHECK"
    - "zod preprocess preserves an allowed value while still coercing genuine garbage to a default"
key-files:
  created:
    - supabase/migrations/20260623000001_estimate_items_price_source_researched.sql
  modified:
    - lib/ai/schema.ts
    - lib/ai/types.ts
    - tests/unit/ai/schema.test.ts
decisions:
  - "price-anchoring.ts needed NO logic change — the 'price_book' as const literal is assignable to the widened union; a price-book match still wins (precedence byte-unchanged)."
  - "Migration NOT applied to remote — CI->GHCR->Coolify owns deploy (per CLAUDE.md + 105-CONTEXT)."
metrics:
  duration: ~3min
  completed: 2026-06-24
  tasks: 2
  files: 4
  commits: 4
---

# Phase 105 Plan 01: `price_source: 'researched'` Threading (Dormant) Summary

Threaded the third `price_source` provenance value `'researched'` end to end through the DB CHECK constraint and the AI layer (output schema + `LineItemOutput` type), shipped **dormant** — nothing tags an item `'researched'` in this phase. The value is now *valid* across the stack so Phase 108's research agent can write it; existing behavior is byte-preserved and the full `tests/unit/ai` suite stays green.

## What Was Built

**Task 1 — Idempotent CHECK-widening migration** (`feat`, commit `483af141`)
- New `supabase/migrations/20260623000001_estimate_items_price_source_researched.sql`.
- Drops the Phase-19 autonamed inline CHECK (`estimate_items_price_source_check`) idempotently, plus its own named constraint, then re-adds a named `estimate_items_price_source_researched_check` widened to `price_source IS NULL OR price_source IN ('price_book', 'ai_estimate', 'researched')`.
- `NULL` remains accepted (owner-edited rows persist `NULL`). Column COMMENT updated to document the `researched` provenance.
- Not applied to remote (deploy via CI→GHCR→Coolify). No secrets (gitleaks clean).

**Task 2 — Schema preprocess relaxation + type widening** (TDD)
- RED (`test`, commit `f3e6d9ad`): added a failing case to the existing `GUARD-01: price_source defensive coercion (D-15 as preprocess)` block asserting an exact `'researched'` value is preserved. Confirmed failing (`expected 'ai_estimate' to be 'researched'`) before implementation.
- GREEN (`feat`, commit `f3e7ae00`):
  - `lib/ai/schema.ts`: relaxed the D-15 preprocess to `(v) => (v === 'price_book' || v === 'researched' ? v : 'ai_estimate')` with `z.enum(['price_book', 'ai_estimate', 'researched'])`. Genuine garbage still coerces to `'ai_estimate'`.
  - `lib/ai/types.ts`: widened `LineItemOutput.price_source` to `'price_book' | 'ai_estimate' | 'researched'`.
  - `lib/ai/price-anchoring.ts`: **no change** — its `'price_book' as const` literal is assignable to the widened union; anchoring precedence (price-book match wins) is byte-unchanged.
- No REFACTOR step needed (change is minimal and clean).

## Verification

- `npx vitest run tests/unit/ai/schema.test.ts tests/unit/ai/price-source-tagging.test.ts tests/unit/ai/price-anchoring.test.ts` → 24/24 green (3 pre-existing coercion regression cases + the new preservation case; anchoring unchanged-green).
- `npx vitest run tests/unit/ai` → **11 files / 64 tests green** — the dormant-threading invariant holds: nothing in production code tags an item `'researched'`, the value is only made *valid*.
- `npx tsc --noEmit -p tsconfig.ci.json` → no `lib/ai/*` errors attributable to this change.
- `git diff --stat lib/ai/price-anchoring.ts` → **empty** (behavior byte-unchanged).
- `grep -c researched` confirms the value threaded in the migration (6), `schema.ts` (2), `types.ts` (1).
- Secret scan on the migration: no `whsec_/sk_/sk-ant-/sb_secret_` patterns.

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. This plan is intentionally dormant: the `'researched'` value is made valid end-to-end but is never written by production code in this phase (Phase 108 wires the research agent that writes it). This is the planned phase boundary, not an unfinished stub.

## Deferred (operational)

- Apply migration `20260623000001_estimate_items_price_source_researched.sql` to the remote DB via the CI→GHCR→Coolify pipeline (the executor only writes the `.sql` file; never builds on the VPS).

## Self-Check: PASSED
- FOUND: supabase/migrations/20260623000001_estimate_items_price_source_researched.sql
- FOUND: lib/ai/schema.ts (preprocess preserves 'researched')
- FOUND: lib/ai/types.ts ('researched' in union)
- FOUND: tests/unit/ai/schema.test.ts (preservation case)
- FOUND commit: 483af141 (migration)
- FOUND commit: f3e6d9ad (RED test)
- FOUND commit: f3e7ae00 (GREEN schema+types)
