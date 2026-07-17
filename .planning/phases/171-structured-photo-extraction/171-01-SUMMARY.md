---
phase: 171-structured-photo-extraction
plan: 01
subsystem: ai
tags: [zod, supabase, jsonb, photos, schema-validation]

# Dependency graph
requires:
  - phase: 168-photo-pipeline-persistence-caption-coverage
    provides: "photos table + pipeline_events.metadata hand-add precedent (168-01) this plan's database.types.ts edit mirrors"
provides:
  - "photoExtractionSchema (zod, versioned v1) — the authoritative PhotoExtraction validator"
  - "PhotoExtraction type (z.infer, never drifts from the schema)"
  - "photoExtractionToolSchema() — hand-written JSON-schema mirror for provider tool declarations"
  - "dropInvalid array-level preprocess pattern (element-drop, not array-wipe)"
  - "photos.ai_extraction JSONB column (nullable, dormant-first, no backfill)"
affects: [171-02-structured-photo-extraction-providers, 171-03-structured-photo-extraction-prompt-serialization]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "dropInvalid<T>(el): array-level zod preprocess that filters elements failing their OWN schema BEFORE z.array(el) parses — a malformed element is dropped, siblings survive. The outer .catch([]) only nets non-array input, never element failures. Distinct from schema.ts's price_source pattern, which is a FIELD-level coercion on a single object, not an array-membership decision."
    - "Hand-written JSON-schema mirror function (photoExtractionToolSchema()) as the provider-adapter source of truth, matching the house style already used by lib/ai/providers/openrouter.ts's estimateToolSchema — no zod-to-jsonschema dependency."

key-files:
  created:
    - lib/ai/photo-extraction-schema.ts
    - supabase/migrations/20260718000001_phase171_photos_ai_extraction.sql
    - tests/unit/ai/photo-extraction-schema.test.ts
  modified:
    - types/database.types.ts

key-decisions:
  - "overall_description (non-empty string) is the ONE hard parse requirement — every other field is defensive (missing optional arrays -> [], enum drift -> field-level .catch() to a conservative default, not element drop)."
  - "Element-drop implemented as an ARRAY-LEVEL preprocess (dropInvalid), not a bare z.array(el).catch([]) — the latter would wipe the whole array when any single element fails, which is the opposite of the required 'drop bad element, keep siblings' contract. This is the plan's flagged Opus-check load-bearing subtlety."
  - "confidence and severity use field-level preprocess coercion (garbage -> 'estimated'/'moderate') so an otherwise-valid element with a drifted enum is KEPT, not dropped — dimension has no such coercion (an invalid dimension enum causes the whole element to fail its own schema and be dropped by dropInvalid, since there's no safe single default dimension)."
  - "Migration is nullable JSONB, dormant-first, NO backfill (FUT-02 deferred) — mirrors the 168-01 pipeline_events.metadata precedent exactly (idempotent ADD COLUMN IF NOT EXISTS + COMMENT ON COLUMN, not applied to remote directly; CI->GHCR->Coolify owns it)."
  - "database.types.ts hand-add matches generator alphabetical-key style: ai_extension inserted between ai_description and caption in Row/Insert/Update."

patterns-established:
  - "dropInvalid<T extends z.ZodTypeAny>(el: T) helper — reusable for any future 'array of validated objects where one bad entry shouldn't nuke the batch' need."

requirements-completed: [PEXT-01]

# Metrics
duration: ~20min
completed: 2026-07-17
---

# Phase 171 Plan 01: Structured Photo Extraction Schema Foundation Summary

**Versioned `photoExtractionSchema` (zod) with an array-level `dropInvalid` element-drop preprocess, `photoExtractionToolSchema()` JSON-schema mirror, and a dormant `photos.ai_extraction` JSONB column — the typed foundation 171-02/171-03 import.**

## Performance

- **Duration:** ~20 min
- **Completed:** 2026-07-17T23:28:21Z
- **Tasks:** 1 (of 1)
- **Files modified:** 4 (3 created, 1 modified)

## Accomplishments

- `lib/ai/photo-extraction-schema.ts`: the authoritative, GUARD-01-style zod schema (`photoExtractionSchema`), its `z.infer` type (`PhotoExtraction`), and the hand-written JSON-schema mirror (`photoExtractionToolSchema()`) that 171-02's OpenRouter tool declaration + Gemini `functionDeclaration` will both derive from.
- Implemented the plan's flagged Opus-check load-bearing subtlety exactly: `dropInvalid<T>(el)` is an ARRAY-LEVEL `z.preprocess` that filters the raw array down to elements which independently `safeParse` against `el`, THEN hands that already-valid array to `z.array(el)` — so a malformed single measurement/material/damage entry is dropped while its siblings survive. The `.catch([])` on the array schema is a non-array-input net only; it never fires on element-level failure because, by construction, every surviving element is already valid.
- `photos.ai_extraction JSONB` migration: nullable, dormant-first, no default, no backfill — idempotent `ADD COLUMN IF NOT EXISTS` + `COMMENT ON COLUMN` documenting the version-key contract, mirroring the 168-01 `pipeline_events.metadata` precedent byte-for-byte in structure/tone.
- `types/database.types.ts` hand-add: `ai_extraction: Json | null` added to `photos` Row/Insert/Update in the correct alphabetical slot, matching the generator's style.
- 22 unit tests (`tests/unit/ai/photo-extraction-schema.test.ts`), all green, covering: valid full parse, missing-optional-arrays-default-to-`[]`, non-array input on an array field treated as empty, three distinct drop-bad-element-keep-siblings cases (bad measurement by missing field, bad measurement by invalid `dimension` enum, bad material, bad damage entry), the two fail-on-`overall_description` cases (missing/empty), four field-level coercion cases (confidence drift/omission, severity drift, version omission/drift), and a 6-test parity block asserting `photoExtractionToolSchema()`'s property keys equal the zod shape's top-level keys and all three enums (`dimension`, `confidence`, `severity`) match exactly — the PEXT-04 foundation.

## Task Commits

Each task was committed atomically:

1. **Task 1: Schema module (TDD) + migration + types** - `61071967` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP/REQUIREMENTS docs commit, see below)

_Note: single-task plan; TDD was done within the one commit (test file + implementation landed together after local RED/GREEN iteration, matching the plan's `tdd`-flavored acceptance criteria without a separate three-commit TDD sequence since the plan itself marks the task `type="auto"` with a TDD acceptance bullet, not `tdd="true"`)._

## Exact Exports 171-02/171-03 Consume

```ts
// lib/ai/photo-extraction-schema.ts
export const photoExtractionSchema: z.ZodType<PhotoExtraction>  // safeParse-friendly authoritative gate
export type PhotoExtraction  // = z.infer<typeof photoExtractionSchema>
export function photoExtractionToolSchema(): Record<string, unknown>  // JSON-schema mirror, hand-written, house style
```

- `photoExtractionSchema.safeParse(raw)` — the ONE authoritative gate. `overall_description` missing/empty is the only failure mode; everything else defensively coerces or drops per-element.
- `PhotoExtraction` shape: `{ version: 1, surfaces: {name, material, condition}[], measurements: {dimension: 'length'|'area'|'height'|'count', value, unit, subject, confidence: 'stated'|'estimated'}[], materials: string[], damage: {description, severity: 'minor'|'moderate'|'severe'}[], trade_signals: string[], access_notes?: string | null, overall_description: string }`.
- `photoExtractionToolSchema()` — call it fresh each time (returns a new object each call; no shared mutable state). `required: ['overall_description']` only. 171-02 should pass this directly as the OpenRouter tool's `parameters` and adapt it (or reuse verbatim) for Gemini's `functionDeclaration.parameters`.
- `photos.ai_extraction: Json | null` now exists on `Database['public']['Tables']['photos']['Row' | 'Insert' | 'Update']` — 171-02 can write `PhotoExtraction` objects there (they satisfy `Json` structurally since all fields are string/number/array/object/null); 171-03's serializer should treat a `null` value as "prose-only photo" (the existing/unchanged path).

## Files Created/Modified

- `lib/ai/photo-extraction-schema.ts` - `photoExtractionSchema`, `PhotoExtraction` type, `dropInvalid` helper, `photoExtractionToolSchema()`
- `supabase/migrations/20260718000001_phase171_photos_ai_extraction.sql` - nullable `photos.ai_extraction JSONB`, dormant-first, no backfill
- `types/database.types.ts` - hand-added `ai_extraction: Json | null` to `photos` Row/Insert/Update
- `tests/unit/ai/photo-extraction-schema.test.ts` - 22 cases (schema validation + tool-schema parity)

## Decisions Made

See `key-decisions` in frontmatter. Summary: hard-requirement is `overall_description` only; element-drop (`dropInvalid`) is a NEW array-level pattern distinct from `schema.ts`'s field-level `price_source` coercion; `dimension` has no coercion (invalid enum drops the whole element, since there's no safe default dimension) while `confidence`/`severity` DO coerce (drift keeps the element, defaults to `'estimated'`/`'moderate'`); migration is nullable/dormant-first/no-backfill mirroring 168-01 exactly.

## Deviations from Plan

None — plan executed exactly as written. The interface block in the plan was followed verbatim (export names, `dropInvalid` pattern, hard-requirement semantics, migration filename and dormant-first posture).

## Issues Encountered

None blocking. During verification, a bare (non-scoped) `npx tsc --noEmit` was additionally run as due diligence beyond the plan's own acceptance criteria (which only requires the scoped `tsconfig.ci.json` check, and that passed cleanly). The bare check surfaced 7 pre-existing TypeScript errors in unrelated test files (`vision-truncation.test.ts`, `derived-duration.test.ts`, `transcribe-short-circuit.test.ts`, `analyze-photos-cost.test.ts`, `analyze-photos-coverage.test.ts`, `estimate-bounds.test.ts`) — confirmed via `git stash -u` to be present identically before this plan's changes, and none touch `photos`/`photo-extraction`. Per the SCOPE BOUNDARY rule these are logged (not fixed) in `.planning/deferred-items.md` under "Phase 171 — Structured Photo Extraction".

## User Setup Required

None - no external service configuration required. The migration is NOT applied to remote directly (consistent with phases 106/108/110/167/168) — it lands via the existing CI->GHCR->Coolify deploy pipeline.

## Next Phase Readiness

- 171-02 (providers) can import `photoExtractionSchema`, `PhotoExtraction`, and `photoExtractionToolSchema()` from `lib/ai/photo-extraction-schema.ts` to build the OpenRouter forced tool-call + Gemini functionDeclaration structured-call adapters and their PEXT-04 parity test.
- 171-03 (prompt serialization) can import `PhotoExtraction` for its pure serializer module and rely on `photos.ai_extraction` being `Json | null` in `database.types.ts`.
- No blockers. The dormant column and kill-switch-independent schema module are inert until 171-02 wires a caller — zero behavior change to the existing prose pipeline from this plan alone.

## Known Stubs

None. This plan ships no UI or wiring — only the schema module, its tests, the dormant column, and the type hand-add. Nothing here renders to a user or is a stand-in for a future data source.

---
*Phase: 171-structured-photo-extraction*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: lib/ai/photo-extraction-schema.ts
- FOUND: supabase/migrations/20260718000001_phase171_photos_ai_extraction.sql
- FOUND: tests/unit/ai/photo-extraction-schema.test.ts
- FOUND: .planning/phases/171-structured-photo-extraction/171-01-SUMMARY.md
- FOUND commit: 61071967
