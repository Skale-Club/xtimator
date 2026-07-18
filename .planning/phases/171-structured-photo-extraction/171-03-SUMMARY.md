---
phase: 171-structured-photo-extraction
plan: 03
subsystem: ai
tags: [zod, prompt-engineering, photos, estimate-generation, sanitization]

# Dependency graph
requires:
  - phase: 171-structured-photo-extraction (plan 01)
    provides: "photoExtractionSchema (zod), PhotoExtraction type, photos.ai_extraction JSONB column"
provides:
  - "serializePhotoContext(photo, index) — pure serializer turning one photo row into the photoDescriptions string"
  - "Compact structured-extraction prompt suffix (Measurements/Materials/Damage/Trade signals/Access), sanitized through the existing sanitizeField boundary"
  - "safeParse guard: invalid/malformed stored ai_extraction degrades to prose-only output, never throws"
affects: [171-structured-photo-extraction (phase-complete gate, pending 171-02)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure serializer module feeding an EXISTING sanitize boundary — no new prompt surface. serializePhotoContext returns RAW text; prompt-builder.ts's sanitizeField remains the ONE escaping point (asserted end-to-end, not just unit-level)."
    - "Optional/unknown escape hatch on a serializer param (ai_extraction?: unknown) to keep a hand-written interface (Photo, lib/queries/photo.ts) assignable without widening that interface — the runtime shape is validated internally via safeParse rather than trusted from the type system."

key-files:
  created:
    - lib/estimate/photo-context.ts
    - tests/unit/estimate/photo-context.test.ts
  modified:
    - lib/services/generate-estimate.ts

key-decisions:
  - "ai_extraction typed ai_extraction?: unknown on PhotoContextInput (not PhotoExtraction | null) — lib/queries/photo.ts's hand-written Photo interface has no ai_extraction field (171-01 only extended database.types.ts), so a required/typed field would fail tsc when photos.ts's Photo[] is passed in. The safeParse guard is the real gate; the type system only needs to not reject the call."
  - "serializePhotoContext reproduces generate-estimate.ts's exact pre-existing caption-fold logic (cap = caption?.trim(); ternary; raw untrimmed ai_description; Photo ${index+1}) rather than reimplementing it differently — byte-identity was verified by keeping the pre-existing service-level test suite (generate-estimate-captions.test.ts) unmodified and green."
  - "Extraction suffix section order is fixed: Measurements, Materials, Damage, Trade signals, Access — each omitted independently when its source array/string is empty, so no dangling ' | ' separators appear regardless of which subset of sections is present."
  - "The serializer emits raw (unescaped) text by design — escaping happens exactly once, downstream, at prompt-builder.ts's sanitizeField/<photo_description> boundary. Verified with an explicit end-to-end test that feeds a photo WITH extraction through buildUserContent and asserts single-escaping (no &amp;lt; double-escape artifact)."

patterns-established:
  - "Photo-row serializer as a pure function taking a minimal duck-typed input shape (PhotoContextInput) rather than the full Photo interface — decouples the serializer from lib/queries/photo.ts so future query-layer changes don't ripple into this module's type surface."

requirements-completed: [PEXT-02]

# Metrics
duration: ~25min
completed: 2026-07-17
---

# Phase 171 Plan 03: Structured Photo Extraction Prompt Serialization Summary

**Pure `serializePhotoContext` module folds typed photo-extraction data (measurements, materials, damage, trade signals, access notes) into the existing `photoDescriptions` prompt string — byte-identical to today's format when no extraction exists, with a `safeParse` guard so a malformed stored value degrades to prose, never throws.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-07-17T23:49:00Z
- **Tasks:** 1 (of 1)
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments

- `lib/estimate/photo-context.ts`: `serializePhotoContext(photo, index)` — a pure function that reproduces generate-estimate.ts's exact 168-02 caption-fold logic for the null/absent/invalid-extraction case (`Photo N (caption: X): desc` / `Photo N: desc`, raw untrimmed `ai_description`, post-filter index), and appends a compact `' | Measurements: … | Materials: … | Damage: … | Trade signals: … | Access: …'` suffix when `photoExtractionSchema.safeParse` succeeds on a non-null `ai_extraction`. Each section is independently omitted when its source array/string is empty — no dangling separators.
- Wired into `lib/services/generate-estimate.ts`: the inline caption-fold body of the `photoDescriptions` map was replaced by `serializePhotoContext(p, i)`; the surrounding filter (non-empty `ai_description`) is untouched.
- Type gate honored: `PhotoContextInput.ai_extraction` is `unknown` and optional, so the hand-written `Photo` interface (`lib/queries/photo.ts`, unmodified — out of scope) remains assignable; `photoExtractionSchema.safeParse` is the real runtime gate, never the type system.
- Raw-output contract verified explicitly: the serializer never escapes; a dedicated end-to-end test feeds a photo WITH extraction (containing `<b>`/`&` in a materials entry) through `buildUserContent` and asserts single-escaping (`&lt;b&gt;`/`&amp;`, and explicitly asserts the ABSENCE of a `&amp;lt;` double-escape artifact) — sanitizeField (prompt-builder.ts:159) remains the one escaping boundary.
- 22 new tests in `tests/unit/estimate/photo-context.test.ts` covering all seven plan-required cases (a–g: caption byte-identity, no-caption byte-identity, full extraction with all sections, empty-array section omission, measurement phrasing with subject/value/unit/confidence, invalid-JSONB prose-only fallback with a never-throws assertion, and raw/no-double-escape) plus the end-to-end sanitization case and extra edge cases (absent `ai_extraction` key, count-dimension measurements, trade_signals/access_notes rendering).
- `tests/unit/services/generate-estimate-captions.test.ts` — the byte-identical contract lock — is UNMODIFIED and green (4 caption-folding cases + 2 sanitization cases, all passing).

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure serializer (TDD) + wire into photoDescriptions** - `89702543` (feat)

**Plan metadata:** commit pending (this SUMMARY + STATE/ROADMAP/REQUIREMENTS docs commit, see below)

## Files Created/Modified

- `lib/estimate/photo-context.ts` - `serializePhotoContext`, `PhotoContextInput` type, internal `renderMeasurement`/`renderDamage`/`renderExtractionSuffix` helpers
- `tests/unit/estimate/photo-context.test.ts` - 22 tests covering byte-identity, full-extraction rendering, empty-array omission, measurement phrasing, safeParse guard, raw-output/no-double-escape, and end-to-end sanitization
- `lib/services/generate-estimate.ts` - `photoDescriptions` map body replaced by `serializePhotoContext(p, i)`; added the import

## Decisions Made

See `key-decisions` in frontmatter. Summary: the serializer's `ai_extraction` param is intentionally `unknown`/optional (not `PhotoExtraction | null`) so `lib/queries/photo.ts`'s hand-written `Photo` interface — untouched, out of scope — stays assignable and `tsc --noEmit -p tsconfig.ci.json` passes; the exact pre-existing caption-fold string logic was reproduced rather than reimplemented to guarantee byte-identity; extraction sections render in a fixed order with independent per-section omission; escaping is deliberately absent from the serializer (verified end-to-end, not just asserted) since `sanitizeField` is the single hardened boundary downstream.

## Deviations from Plan

None — plan executed exactly as written, including all Opus plan-check fixes: the type gate (`ai_extraction?: unknown`), the byte-identity reproduction of the exact 217-224 format, the raw/no-double-escape contract, the safeParse guard, the compact `' | '`-separated format, and the scope fences (only `generate-estimate.ts`'s prompt-assembly region + the new pure module touched; `prompt-builder.ts`, `lib/queries/photo.ts`, and all of 171-02's files — `lib/ai/openrouter-client.ts`, `lib/ai/providers/gemini.ts`, `lib/inngest/functions/analyze-photos.ts` and their tests — were not touched).

## Issues Encountered

None blocking. `tests/unit/estimate/__snapshots__/document-alignment.test.tsx.snap` showed as modified in `git status` after running the full suite (a CRLF/LF line-ending touch from an unrelated snapshot test in the same run) — `git diff` on that file shows no content change, it was not staged, and it is unrelated to this plan's scope.

A full `npm test` was run twice (once in the foreground, once backgrounded to double-check) — both runs produced the IDENTICAL result: `2 failed | 505 passed | 1 skipped (508 files)`, `2 failed | 3799 passed | 2 skipped | 23 todo (3826 tests)`. Both failures are the SAME two pre-existing, already-documented, unrelated flakes that appear throughout this milestone's prior plan notes (165-01/165-02/168-02/170-01 STATE.md notes all list the identical pair): `tests/unit/actions/recording-early-return-events.test.ts` (1 test) and `tests/unit/components/landing-page.test.tsx` (1 test, a `findByRole` timeout under heavy parallel load). Neither file is touched by this plan. `landing-page.test.tsx` was re-run in complete isolation and passed 5/5 cleanly, confirming the load-flake diagnosis. This matches the plan's own acceptance criteria: "`npm test` GREEN (or targeted + regression green + documented load-flake)."

## User Setup Required

None - no external service configuration required. This plan makes no infrastructure or environment changes; it consumes the dormant `photos.ai_extraction` column 171-01 already migrated.

## Next Phase Readiness

- PEXT-02 is complete. Once 171-02 (providers: OpenRouter forced tool-call + Gemini functionDeclaration structured extraction) lands and starts writing `photos.ai_extraction`, this serializer activates automatically — no further wiring needed, since `getProjectPhotos` already does `select('*')`.
- Phase 171 is NOT yet complete: 171-02 (PEXT-03/04/05: fallback ladder, provider parity, cost capture) is still in progress in this same working tree. Per the plan's `<output>` instruction, only PEXT-02 is marked complete here; the phase-wide traceability row and ROADMAP Plans line update are deferred to whichever of 171-02/171-03 finishes last.
- No blockers.

## Known Stubs

None. This plan wires real data through a real prompt path — no placeholder/mock rendering. The compact extraction suffix only appears once 171-02 populates `ai_extraction`; until then, output is provably byte-identical to today (verified, not assumed).

---
*Phase: 171-structured-photo-extraction*
*Completed: 2026-07-17*

## Self-Check: PASSED

- FOUND: lib/estimate/photo-context.ts
- FOUND: tests/unit/estimate/photo-context.test.ts
- FOUND: .planning/phases/171-structured-photo-extraction/171-03-SUMMARY.md
- FOUND commit: 89702543
