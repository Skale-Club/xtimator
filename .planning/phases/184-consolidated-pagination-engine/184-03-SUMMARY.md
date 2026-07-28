---
phase: 184-consolidated-pagination-engine
plan: 03
subsystem: pdf-pagination
tags: [fontkit, linebreak, pagination, react-pdf, server-only, document-model]

# Dependency graph
requires:
  - phase: 184-consolidated-pagination-engine (Plan 01)
    provides: "SAFETY_MARGIN_LINES, LINE_HEIGHT, ESTIMATE_PAGE_GEOMETRY, ESTIMATE_DESIGN_TOKENS, photosPerRow(contentWidthPt), visibleSectionItems(section) in lib/estimate/document/"
  - phase: 184-consolidated-pagination-engine (Plan 02)
    provides: "lib/estimate/pagination/types.ts (PageBlock/PageBlockRef/PageBlockKind contract), lib/estimate/pagination/measure/types.ts (MeasurementProvider interface), computePageBreaks() in engine.ts"
provides:
  - "lib/estimate/pagination/measure/estimator.ts — createFontkitMeasurementProvider() + estimateLineCount(), the real server-only MeasurementProvider backed by fontkit + linebreak, byte-identical formula to Plan 184-01's hand-validated arithmetic"
  - "lib/estimate/pagination/blocks-from-model.ts — blocksFromModel(input): PageBlock[], turning a real estimate's document model into fully ref-populated, height-computed blocks the engine consumes"
  - "PageBlockRef population rules + exact ID-naming convention (`${sectionId}-header`/`-rows-${itemId}`/`-subtotal`) every later plan can rely on"
  - "Pinned terms-card emission order (estimate→payment→timeline→warranty→notes) via a fixed iteration array, independent of which subset is present"
affects: [184-05-render-wiring-dispatcher, 185-web-paginated-preview]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "buildTemplateLiterals factory: per-template StyleSheet primitives (paddingVertical, marginTop/Bottom, borderWidth, fontSize) named ONCE per template and passed into one deriving function, so summary/info-grid/prepared-by's shared infoLabel/infoValue contributions are computed from a single source rather than duplicated as bare literals across each derived baseHeightPt field"
    - "Fixed iteration-order array (TERMS_ORDER) drives BOTH presence-gating and emission order in one pass — pins the terms-card order regardless of which subset of the 5 fields is actually present, mirroring pdf-terms-section.tsx's own Fragment order 1:1"
    - "Local 'first emitted' boolean tracked while building each list (terms-cards, photo-rows) applies a one-time height bonus to whichever block is actually first — mirrors PdfTermsSection's own `nextTopMargin()` closure pattern from Plan 184-04, kept consistent across the client-safe pagination core and the PDF template layer"

key-files:
  created:
    - lib/estimate/pagination/measure/estimator.ts
    - lib/estimate/pagination/measure/linebreak.d.ts
    - lib/estimate/pagination/blocks-from-model.ts
    - tests/unit/pagination/measure/estimator.test.ts
    - tests/unit/pagination/blocks-from-model.test.ts
    - .planning/phases/184-consolidated-pagination-engine/deferred-items.md
  modified:
    - tests/unit/pagination/pagination-engine-boundary.test.ts
    - tests/unit/estimate/pt-px-conversion-source.test.ts

key-decisions:
  - "info-grid is a FIXED block (no `measurement` field) — blocksFromModel's own input contract (per the plan's explicit <action> field list) carries no project name/client text at all, so there is no real text to measure; baseHeightPt uses a conservative fixed estimate for the documented 'up to 4 lines' case instead"
  - "terms-card/photo-row first-block bonuses are additive on top of a uniform per-block base (not a base that already includes some non-first spacing term) — the only reading of the plan's <behavior> section consistent with its own mandated exact-diff assertions (24pt/32pt terms, 16pt/20pt photos)"
  - "fontkit's openSync() return type (Font | FontCollection) is narrowed via an `in` check on 'layout' (only present on Font) rather than a cast — a real TS7016/TS2339 compile error Task 1 hit under tsconfig.ci.json's scoped typecheck, fixed as a Rule 3 (blocking) deviation"
  - "PGBRK-01 is NOT marked complete in REQUIREMENTS.md despite being listed in this plan's frontmatter — matching Plan 184-02's own established precedent (its frontmatter also listed PGBRK-01, and REQUIREMENTS.md still shows it Pending). PGBRK-01's own requirement text demands consumption by BOTH the web preview (Phase 185) and the PDF renderer (Plan 184-05, not yet wired) — marking it complete now would misrepresent status. PGBRK-05 was re-marked (no-op; already Complete from Plan 184-01)."

requirements-completed: [PGBRK-01, PGBRK-05]

# Metrics
duration: 42min
completed: 2026-07-28
---

# Phase 184 Plan 03: Estimator + blocksFromModel Summary

**Server-only fontkit/linebreak MeasurementProvider byte-identical to Plan 184-01's hand-validated formula, plus `blocksFromModel()` turning a real estimate document model into fully `ref`-populated `PageBlock[]` with every visibility gate, the shared empty-description filter, and a pinned 5-card terms order.**

## Performance

- **Duration:** 42 min (approximate — reading/context gathering + 2 tasks + 1 blocking-deviation fix)
- **Started:** 2026-07-28T10:40:00Z
- **Completed:** 2026-07-28T11:22:00Z
- **Tasks:** 2
- **Files modified:** 8 (6 created, 2 modified)

## Accomplishments
- `lib/estimate/pagination/measure/estimator.ts` exports `createFontkitMeasurementProvider()` + `estimateLineCount()` — the EXACT greedy line-packer Plan 184-01 hand-validated against the real vendored `Inter-Regular.ttf`, with a module-scope font cache keyed by family name (`Inter`/`Inter-Bold`/`Lora`/`Lora-Bold`, mirroring `lib/pdf/register-fonts.ts`'s paths verbatim) and a `server-only` guard.
- `lib/estimate/pagination/blocks-from-model.ts` exports `blocksFromModel(input): PageBlock[]`, turning `DocumentSection[]` + summary/terms/photos/signature/preparedBy into the engine's full block list: the shared `visibleSectionItems()` empty-description filter, all 3 presentation-settings visibility gates (sections/summary/photos), `PageBlockRef` population on every section/item/terms/photo block, the exact ID-naming convention, and a fixed 5-key terms-card iteration order that pins emission order regardless of which subset is present.
- Every per-kind `baseHeightPt`/`measurement` formula is built from named per-template StyleSheet primitives (`buildTemplateLiterals`) cited to the exact `estimate-pdf.tsx`/`estimate-pdf-modern.tsx` StyleSheet keys — never a re-derived/duplicated bare literal for the numbers `lib/estimate/document/tokens.ts` already centralizes (`contentWidthPt`, `tableCellFontSizePt`, `sectionTitleFontSizePt`, `termsTextFontSizePt`, `summaryFontSizePt`, `proseLineHeightMultiplier`, `LINE_HEIGHT[family]`).
- The first-emitted terms-card and the first photo-row (`ref.photoRange[0] === 0`) each get their one-time removed-container-margin bonus (24pt/32pt terms, 16pt/20pt photos) applied via a simple local "already emitted" boolean while building each list — every other card/row in the same list gets `+0`.
- Extended `tests/unit/pagination/pagination-engine-boundary.test.ts`'s `ENGINE_FILES` and `tests/unit/estimate/pt-px-conversion-source.test.ts`'s `CLEAN_SOURCES` to cover `blocks-from-model.ts`, confirming it stays client-safe (zero `fontkit`/`linebreak`/`@react-pdf/renderer`/`react`/`components/*` imports) and never re-derives LETTER page geometry.

## Task Commits

Each task was committed atomically:

1. **Task 1: Server-only fontkit measurement provider** - `b11aeced` (feat)
2. **Task 1 fix: narrow fontkit Font|FontCollection union + add linebreak ambient types** - `7a6b9e9e` (fix — Rule 3, blocking, see Deviations below)
3. **Task 2: blocksFromModel() — document model to PageBlock[]** - `ec4f1644` (feat)

**Plan metadata:** committed separately (see below).

## Files Created/Modified
- `lib/estimate/pagination/measure/estimator.ts` - `createFontkitMeasurementProvider()` + `estimateLineCount()`, the real fontkit+linebreak line-packer
- `lib/estimate/pagination/measure/linebreak.d.ts` - minimal ambient module declaration for `'linebreak'` (no `@types/linebreak` package exists)
- `lib/estimate/pagination/blocks-from-model.ts` - `blocksFromModel(input): PageBlock[]` — document model to engine-consumable blocks
- `tests/unit/pagination/measure/estimator.test.ts` - 8 assertions confirming zero drift from Plan 184-01's hand-calculated fixture, determinism, cross-font safety, unknown-family error
- `tests/unit/pagination/blocks-from-model.test.ts` - 33 assertions covering every `<behavior>` case from the plan (filter, gates, ref population, defensive input, ID naming, pinned order + bonuses, full document order)
- `tests/unit/pagination/pagination-engine-boundary.test.ts` - adds `blocks-from-model.ts` to the client-safe import-purity check
- `tests/unit/estimate/pt-px-conversion-source.test.ts` - adds `blocks-from-model.ts` to `CLEAN_SOURCES`
- `.planning/phases/184-consolidated-pagination-engine/deferred-items.md` - logs an out-of-scope pre-existing `scripts/pagination-drift-spike.ts` typecheck issue (Plan 184-01's own file) found while verifying, not fixed (scope boundary)

## blocksFromModel — Input Shape (for Plan 184-05)

```ts
interface BlocksFromModelInput {
  sections?: DocumentSection[]              // defaults to [] if omitted/undefined
  summary: string | null
  timeline: string | null
  payment_terms: string | null
  warranty_terms: string | null
  notes: string | null
  company: { estimate_terms_enabled?: boolean; estimate_terms_text?: string | null }
  discount_amount: number
  tax_amount: number
  dep: DepositDisplay                       // from lib/estimate/deposit-display
  signature: DocumentSignature | null
  photos: { url: string; caption: string | null }[]
  resolvedSettings: ResolvedPresentationSettings
  preparedBy: string | null
  L: DocumentLabels                         // only L.estimate is read (title-banner label)
  templateId: EstimateTemplateId            // 'classic' | 'modern'
}
```

## ref Population Rules (per PageBlockKind)

| Kind | `ref` fields set |
|---|---|
| `section-header` | `sectionId` |
| `item-row` | `sectionId`, `itemId`, `itemIndex` (0-based, WITHIN the section's `visibleSectionItems`-filtered list) |
| `section-subtotal` | `sectionId` |
| `terms-card` | `termsKey` (`'estimate'\|'payment'\|'timeline'\|'warranty'\|'notes'`) |
| `photo-row` | `photoRange` (`[start, end)` into the full `photos` array) |
| everything else (title-banner/info-grid/summary/totals/signature/prepared-by) | no `ref` |

## ID-Naming Convention

- Section header: `` `${section.id}-header` ``
- Item row: `` `${section.id}-rows-${item.id}` ``
- Section subtotal: `` `${section.id}-subtotal` ``
- Terms card: `` `terms-${termsKey}` `` (e.g. `terms-payment`)
- Photo row: `` `photo-row-${rangeStart}` `` (e.g. `photo-row-0`, `photo-row-3`)
- Fixed singletons: `'title-banner'`, `'info-grid'`, `'summary'`, `'totals'`, `'signature'`, `'prepared-by'`

## Pinned Terms-Card Order + Title/Text Mapping (for Plan 184-05's title lookup)

Fixed iteration order regardless of which subset is present: **estimate → payment → timeline → warranty → notes**.

| `termsKey` | Gate | Title (Plan 184-05 looks this up, NOT read from `blocksFromModel`) | Text field |
|---|---|---|---|
| `estimate` | `company.estimate_terms_enabled && company.estimate_terms_text` | `'Estimate Terms'` | `company.estimate_terms_text` |
| `payment` | `isSectionVisible(resolvedSettings, 'payment_terms') && estimate.payment_terms` | `L.paymentTerms` | `estimate.payment_terms` |
| `timeline` | `isSectionVisible(resolvedSettings, 'timeline') && estimate.timeline` | `L.timeline` | `estimate.timeline` |
| `warranty` | `isSectionVisible(resolvedSettings, 'warranty_terms') && estimate.warranty_terms` | `L.warranty` | `estimate.warranty_terms` |
| `notes` | `isSectionVisible(resolvedSettings, 'notes') && estimate.notes` | `L.notes` | `estimate.notes` |

## createFontkitMeasurementProvider() Signature

```ts
export function estimateLineCount(text: string, fontFamily: string, fontSizePt: number, maxWidthPt: number): number
export function createFontkitMeasurementProvider(): MeasurementProvider  // { lineCount: estimateLineCount }
```

`fontFamily` (the `styleKey` in `MeasurementProvider`) must be one of `'Inter' | 'Inter-Bold' | 'Lora' | 'Lora-Bold'` — matches `lib/pdf/register-fonts.ts`'s `Font.register` family names exactly. SERVER ONLY (`import 'server-only'`) — Plan 184-05's PDF resolver imports this directly; a future Phase 185 DOM provider implements the same `MeasurementProvider` interface independently.

## Decisions Made
See `key-decisions` in the frontmatter above — summarized: (1) info-grid is a fixed (non-measured) block since `blocksFromModel`'s input contract carries no project/client text; (2) terms-card/photo-row first-block bonuses are purely additive on a uniform base, matching the plan's own exact-diff test mandate; (3) fontkit's `Font | FontCollection` union narrowed via an `in` check; (4) PGBRK-01 intentionally left un-marked in REQUIREMENTS.md, matching Plan 184-02's precedent, since it genuinely isn't complete until Plan 184-05 + Phase 185 both consume this module.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] fontkit's `openSync()` return type and missing `linebreak` type declarations broke `tsconfig.ci.json`'s scoped typecheck**
- **Found during:** Task 1's own done-criteria verification (`npx tsc -p tsconfig.ci.json --noEmit`)
- **Issue:** `fontkit.openSync()` returns `Font | FontCollection`; `unitsPerEm`/`layout()` only exist on `Font`, so referencing them without narrowing produced TS2339 errors. Separately, no `@types/linebreak` package exists, producing a TS7016 implicit-`any` error on `import LineBreaker from 'linebreak'`.
- **Fix:** Added an `'layout' in opened` type guard in `getFont()` (throws a clear error for the — with our vendored single-font TTFs, unreachable — collection case) and a minimal ambient `lib/estimate/pagination/measure/linebreak.d.ts` declaration scoped to the one shape actually used (`new LineBreaker(text).nextBreak()`), co-located under `lib/**` so `tsconfig.ci.json`'s own `include` array (which does NOT list `types/**`) picks it up.
- **Files modified:** `lib/estimate/pagination/measure/estimator.ts`, `lib/estimate/pagination/measure/linebreak.d.ts` (new)
- **Verification:** `npx tsc -p tsconfig.ci.json --noEmit` clean; `npx vitest run tests/unit/pagination/measure/estimator.test.ts tests/unit/pagination/measure/fontkit-arithmetic.test.ts` — 15/15 pass
- **Commit:** `7a6b9e9e`

---

**Total deviations:** 1 auto-fixed (1 blocking — the fix was required for Task 1's own stated done-criteria typecheck to pass; no scope creep beyond the 2 files listed).
**Impact on plan:** Necessary for correctness of this plan's own verification step. No behavior change to the line-packer formula itself (byte-identical to Plan 184-01's hand-validated arithmetic, confirmed by the shared 15/15 passing assertions across both test files).

## Issues Encountered

- **Out-of-scope discovery (logged, not fixed):** `scripts/pagination-drift-spike.ts` (Plan 184-01's own file, already committed before this plan started) has the identical `Font | FontCollection` narrowing gap and missing `linebreak` types — confirmed via a full-repo (bare, non-CI-scoped) `npx tsc --noEmit`. Not fixed here per the scope-boundary rule (not part of this plan's `files_modified`, and `scripts/` is excluded from `tsconfig.ci.json`'s CI gate so it does not block anything). Logged to `.planning/phases/184-consolidated-pagination-engine/deferred-items.md` for a future cleanup pass.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `createFontkitMeasurementProvider()` and `blocksFromModel()` are both committed and fully test-covered (69/69 green across `tests/unit/pagination/`, 511/511 green across `tests/unit/pdf` + `tests/unit/estimate`, 4802/4823 green across the full `tests/unit` + `tests/eval` suite, `tsc -p tsconfig.ci.json --noEmit` clean).
- Plan 184-05 can wire both directly: call `blocksFromModel()` with the real estimate's document model + `resolvePresentationSettings()` output + `templateId`, pass the result plus `createFontkitMeasurementProvider()` into Plan 184-02's `computePageBreaks()`, then dispatch each `PageAssignment`'s blocks to the per-kind renderers Plan 184-04 already exported (`PdfSectionHeader`/`PdfTableHeaderOnly`/`PdfSectionRows`/`PdfSectionSubtotal`, `PdfPhotoGrid`, `PdfTermsCard`, `PdfTotalsBlock`, `PdfSignatureBlock`) using each block's `ref` to look up the right data/title.
- No blockers for Plan 184-05. PGBRK-01 remains intentionally un-marked (see Decisions) until that plan wires this module into the real PDF renderer — Phase 185 will complete it fully once the web preview also consumes it.

---
*Phase: 184-consolidated-pagination-engine*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 7 created files confirmed present on disk (`lib/estimate/pagination/measure/estimator.ts`, `lib/estimate/pagination/measure/linebreak.d.ts`, `lib/estimate/pagination/blocks-from-model.ts`, `tests/unit/pagination/measure/estimator.test.ts`, `tests/unit/pagination/blocks-from-model.test.ts`, `.planning/phases/184-consolidated-pagination-engine/deferred-items.md`, this SUMMARY.md). All 3 task commits confirmed present in `git log` (`b11aeced`, `7a6b9e9e`, `ec4f1644`).
