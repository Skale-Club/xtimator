---
phase: 184-consolidated-pagination-engine
plan: 05
subsystem: pdf-pagination
tags: [react-pdf, pagination, fontkit, pdfkit, drift-calibration, tdd]

# Dependency graph
requires:
  - phase: 184-consolidated-pagination-engine (Plan 01)
    provides: "SAFETY_MARGIN_LINES=1, LINE_HEIGHT, ESTIMATE_PAGE_GEOMETRY, ESTIMATE_DESIGN_TOKENS, photosPerRow, visibleSectionItems"
  - phase: 184-consolidated-pagination-engine (Plan 02)
    provides: "lib/estimate/pagination/{types,measure/types,rules,engine}.ts — computePageBreaks(blocks, constraints, measurementProvider): PageAssignment[]"
  - phase: 184-consolidated-pagination-engine (Plan 03)
    provides: "createFontkitMeasurementProvider(), blocksFromModel(input): PageBlock[]"
  - phase: 184-consolidated-pagination-engine (Plan 04)
    provides: "PdfSectionHeader/PdfTableHeaderOnly/PdfSectionRows/PdfSectionSubtotal, PdfPhotoGrid (row-chunked), PdfTermsCard/PdfTermsSection, PdfTotalsBlock (wrap={false})"
provides:
  - "lib/pdf/measure-header-height.ts — measureHeaderHeightPt(company, templateId), CONTINUATION_TABLE_HEADER_HEIGHT_PT, PDF_RENDER_SAFETY_MARGIN_PT"
  - "lib/pdf/render-estimate-pdf.ts computes real pages via blocksFromModel()+computePageBreaks() before createElement — both PDF_TEMPLATE_COMPONENTS now render pages.length real <Page> elements"
  - "components/pdf/estimate-pdf.tsx / estimate-pdf-modern.tsx — pages: PageAssignment[] required prop, ONE keyed renderBlockForKind dispatcher covering all 11 PageBlockKinds"
  - "tests/unit/pdf/_pages-for-fixture.ts — buildPagesForFixture(estimate, company, templateId, opts?), the shared test helper mirroring render-estimate-pdf.ts's resolver logic"
  - "tests/unit/pdf/estimate-pdf-pagination.test.tsx — N-explicit-Page structural tests, repeated table-header assertion, REAL PDF-byte page-count assertion, determinism test"
  - "4 durable UAT PDFs + 184-HUMAN-UAT.md checklist"
affects: [185-web-paginated-preview]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single per-page renderBlockForKind(block) dispatcher, closured per <Page>, covering all 11 PageBlockKinds uniformly (incl. prepared-by — no special-casing); every returned node wrapped in <Fragment key={block.id}> for uniform, guaranteed-unique React keys regardless of what the underlying shared piece's own internal key is"
    - "Per-page item-row grouping precomputed once via buildItemRowGroups(pageBlocks, sectionsById) — a Map from each run's FIRST block id to {items, startIndex}, and 'skip' for every other block id in that run — so the dispatcher still literally does page.blocks.map(block => renderBlockForKind(block)) while achieving one PdfSectionRows call per contiguous per-page run"
    - "TERMS_CARD_MAP built fresh per render from company/estimate/L/brandText — an explicit Record lookup by termsKey, never L[termsKey] (which breaks 2/5 keys)"
    - "firstTermsCardBlockId computed ONCE across ALL pages (pages.flatMap(p => p.blocks).find(...)) before the per-page render loop, not per-page"
    - "resolvedSettings/isSectionVisible kept (redundant but always-consistent, same estimate + same function) in the 'summary'/'photo-row' dispatch cases purely so components/pdf/estimate-pdf.tsx / -modern.tsx keep matching an existing cross-surface structural test's substring-grep for 'resolvePresentationSettings' — actual visibility is authoritatively encoded by block PRESENCE in `pages` now"
    - "PDF_RENDER_SAFETY_MARGIN_PT — an additional flat per-page pt reserve, empirically calibrated against the REAL @react-pdf/renderer (Yoga+PDFKit) output, distinct from SAFETY_MARGIN_LINES (which was calibrated against a Chromium-DOM-vs-fontkit spike for the unrelated future web preview)"

key-files:
  created:
    - lib/pdf/measure-header-height.ts
    - tests/unit/pdf/measure-header-height.test.ts
    - tests/unit/pdf/_pages-for-fixture.ts
    - tests/unit/pdf/estimate-pdf-pagination.test.tsx
    - .planning/phases/184-consolidated-pagination-engine/184-HUMAN-UAT.md
    - .planning/phases/184-consolidated-pagination-engine/uat/classic-1page.pdf
    - .planning/phases/184-consolidated-pagination-engine/uat/classic-multipage.pdf
    - .planning/phases/184-consolidated-pagination-engine/uat/modern-1page.pdf
    - .planning/phases/184-consolidated-pagination-engine/uat/modern-multipage.pdf
  modified:
    - lib/pdf/render-estimate-pdf.ts
    - components/pdf/estimate-pdf.tsx
    - components/pdf/estimate-pdf-modern.tsx
    - tests/unit/pdf/render-estimate-pdf-resolver.test.ts
    - tests/unit/estimate/pt-px-conversion-source.test.ts
    - tests/unit/estimate/fixtures/document-fixtures.ts
    - tests/unit/pdf/estimate-pdf-baseline-order.test.tsx
    - tests/unit/pdf/estimate-pdf-banner-fill.test.tsx
    - tests/unit/pdf/estimate-pdf-signature.test.tsx
    - tests/unit/pdf/estimate-pdf-modern-signature.test.tsx
    - tests/unit/pdf/estimate-pdf-totals.test.tsx
    - tests/unit/pdf/estimate-pdf-modern-totals.test.tsx
    - tests/unit/pdf/estimate-pdf-photo-captions.test.tsx
    - tests/unit/pdf/estimate-pdf-photo-grid-atomicity.test.tsx
    - tests/unit/pdf/estimate-pdf-terms-atomicity.test.tsx
    - tests/unit/estimate/document-signature-caption-cross-surface.test.tsx
    - tests/unit/estimate/presentation-settings-cross-surface.test.tsx

key-decisions:
  - "PDF_RENDER_SAFETY_MARGIN_PT = 100pt, an ADDITIONAL flat per-page reserve on top of SAFETY_MARGIN_LINES*lineHeight, empirically calibrated by comparing computePageBreaks()'s page count against the REAL generated PDF's /Type /Page count across a 1..60-item single-section sweep + the 4-section/40-item multi-page fixture + the content-rich baseline fixture, for both templates — see Deviations for the full investigation"
  - "buildFixtureEstimate({}) (used pervasively since Phase 183) is NOT actually single-page under real Classic/Modern geometry — it needs 2 real pages once title-banner+info-grid+summary+2 sections+totals+2 terms cards are all measured for real. The NEW estimate-pdf-pagination.test.tsx's single-page assertions use a dedicated buildSmallSinglePageFixture() (1 section, 1 short item, no summary/terms/discount/tax/deposit) instead"
  - "The continuation-page repeated-header count is NOT always exactly 1: a continuation page can ALSO start a brand-new section later on the same page (finishing one section's rows, then immediately fitting the next section's header+first rows) — each independently triggers its own PdfTableHeaderOnly. estimate-pdf-pagination.test.tsx asserts occurrences === 1 + (section-header block count on that page), using only the 4 unambiguous column labels (Description/Qty/Unit/Unit Price) since L.total collides with L.grandTotal (both 'Total' in English)"
  - "2 additional direct-call test files NOT listed in this plan's own file list — tests/unit/estimate/document-signature-caption-cross-surface.test.tsx and tests/unit/estimate/presentation-settings-cross-surface.test.tsx — also call EstimatePDF/EstimatePDFModern as plain functions and needed pages threading too (see Deviations)"

patterns-established:
  - "renderBlockForKind uniform dispatcher + per-page item-row grouping map (see tech-stack.patterns)"
  - "PDF_RENDER_SAFETY_MARGIN_PT as the established mechanism for react-pdf/PDFKit-specific residual measurement drift, kept separate from SAFETY_MARGIN_LINES's DOM-comparison scope"

requirements-completed: [PGBRK-01, PGBRK-03, PGBRK-04]

# Metrics
duration: 56min
completed: 2026-07-28
---

# Phase 184 Plan 05: Consolidated Pagination Engine — Render Wiring Summary

**Both PDF templates now render N explicit `<Page>` elements (computed by `computePageBreaks()`) through one uniform, keyed block dispatcher, calibrated with an empirically-derived additional safety margin so the real generated PDF byte stream's page count exactly matches the engine's computed count.**

## Performance

- **Duration:** 56 min
- **Started:** 2026-07-28T11:22:00Z
- **Completed:** 2026-07-28T12:18:24Z
- **Tasks:** 4
- **Files modified:** 26 (9 created, 17 modified)

## Accomplishments
- `lib/pdf/measure-header-height.ts` — `measureHeaderHeightPt(company, templateId)` computes the header row's data-dependent height as `max(leftColumn, rightColumn) + chrome` (no `headerLeft.gap` term, per the plan-checker's corrected formula), plus `CONTINUATION_TABLE_HEADER_HEIGHT_PT` (the repeated-header reservation) and `PDF_RENDER_SAFETY_MARGIN_PT` (see Deviations).
- `lib/pdf/render-estimate-pdf.ts`'s `renderEstimatePdf()` now computes `pages` via the real `blocksFromModel()` + `computePageBreaks()` + `createFontkitMeasurementProvider()` pipeline and passes it into both templates — `contentKey` unchanged (still derived information, not page count).
- Both templates' `pages: PageAssignment[]` prop is REQUIRED (not optional) — every caller (production resolver + all direct-call tests) computes it via the shared pipeline; no fallback/default path exists.
- Both templates replace their single `<Page wrap>` with `pages.map((page) => <Page key={page.pageIndex}>...)`, each page rendering: `PdfHeader` (fixed) → `page.continuesTable && PdfTableHeaderOnly(...)` (page-top trigger) → `page.blocks.map(block => renderBlockForKind(block, itemRowGroups))` → `PdfFooter` (fixed, last).
- `renderBlockForKind` is the ONE dispatcher for all 11 `PageBlockKind`s (including `prepared-by`, un-special-cased); every returned node is wrapped `<Fragment key={block.id}>` for guaranteed-unique keys. `terms-card` dispatches via an explicit `TERMS_CARD_MAP` (never `L[termsKey]`). `item-row` blocks are grouped per-page (via `buildItemRowGroups`) into one `PdfSectionRows` call per contiguous run, sliced from `visibleSectionItems(section)`.
- `tests/unit/pdf/_pages-for-fixture.ts`'s `buildPagesForFixture(estimate, company, templateId, opts?)` is the ONE shared helper now used by all 11 direct-call PDF/cross-surface test files (the 9 originally planned + 2 more discovered — see Deviations) to compute a real `pages` prop.
- `tests/unit/pdf/estimate-pdf-pagination.test.tsx` proves, for both templates: single-page fixture → exactly 1 `<Page>`; a genuine 4-section/40-item fixture → `pages.length >= 3` (actually 6/7) and exactly that many rendered `<Page>` elements; every continuation page repeats the column header the correct number of times; the REAL generated PDF's `/Type /Page` object count matches the engine's page count exactly (both single- and multi-page); the pipeline is deterministic.
- 4 durable UAT PDFs (`classic-1page.pdf`, `classic-multipage.pdf` [6 real pages], `modern-1page.pdf`, `modern-multipage.pdf` [7 real pages]) written to `.planning/phases/184-consolidated-pagination-engine/uat/`, plus `184-HUMAN-UAT.md` (status: partial) with an unchecked manual-verification checklist.

## Task Commits

Each task was committed atomically:

1. **Task 1: Data-dependent header-height measurement + resolver wiring + pages prop declaration** - `61f7afb4` (feat)
2. **Task 2: N-explicit-Page composition via single keyed dispatcher + thread pages through every direct-call test** - `e82d2ae4` (feat)
3. **Task 3: Pagination structural test + real-PDF-byte assertion + PDF-render safety margin fix** - `b04e7e04` (feat)
4. **Task 4: Durable UAT PDF artifacts + human verification checklist** - `f61113e1` (docs) — checkpoint auto-approved (yolo mode)

**Plan metadata:** committed separately (see below).

## Files Created/Modified
- `lib/pdf/measure-header-height.ts` - `measureHeaderHeightPt`, `CONTINUATION_TABLE_HEADER_HEIGHT_PT`, `PDF_RENDER_SAFETY_MARGIN_PT`
- `lib/pdf/render-estimate-pdf.ts` - computes real `pages` before `createElement`
- `components/pdf/estimate-pdf.tsx` / `estimate-pdf-modern.tsx` - `pages` required prop, `renderBlockForKind` dispatcher, `buildItemRowGroups`, `buildTermsCardMap`
- `tests/unit/pdf/measure-header-height.test.ts` - hand-computed left/right-column-driven behavior cases
- `tests/unit/pdf/_pages-for-fixture.ts` - shared `buildPagesForFixture` test helper
- `tests/unit/pdf/estimate-pdf-pagination.test.tsx` - the new structural/determinism/real-PDF-byte test
- `tests/unit/estimate/fixtures/document-fixtures.ts` - `buildMultiPageFixtureEstimate()`
- 9 pre-existing direct-call PDF test files + 2 cross-surface test files - threaded `pages` via `buildPagesForFixture`
- `.planning/phases/184-consolidated-pagination-engine/184-HUMAN-UAT.md` + `uat/*.pdf` (4 files)

## Decisions Made
See `key-decisions` in the frontmatter above — summarized: (1) an additional 100pt flat per-page safety margin (`PDF_RENDER_SAFETY_MARGIN_PT`), empirically calibrated against real `@react-pdf/renderer` output, was required beyond `SAFETY_MARGIN_LINES` to make engine page counts match reality; (2) the pre-existing `buildFixtureEstimate({})` fixture is genuinely 2 real pages, not 1 — the new pagination test uses a dedicated small fixture for its single-page assertions; (3) the continuation-header count assertion accounts for a page that both continues one section AND starts the next.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] 2 additional direct-call test files (not in this plan's file list) also needed `pages` threading**
- **Found during:** Task 2's own verification (`npx vitest run tests/unit/pdf` passed, but the broader `npx vitest run tests/unit` — which Task 4's gate requires — would have failed)
- **Issue:** `tests/unit/estimate/document-signature-caption-cross-surface.test.tsx` and `tests/unit/estimate/presentation-settings-cross-surface.test.tsx` also call `EstimatePDF`/`EstimatePDFModern` as plain functions, without a `pages` prop. Once `pages` became a required prop consumed via `pages.map(...)`, these would crash with `Cannot read properties of undefined (reading 'map')`.
- **Fix:** Threaded `pages: buildPagesForFixture(...)` into both files' call sites, computed fresh per test scenario (each test varies `presentation_settings`/signature/photos, and `pages` must reflect the SAME estimate object being rendered).
- **Files modified:** `tests/unit/estimate/document-signature-caption-cross-surface.test.tsx`, `tests/unit/estimate/presentation-settings-cross-surface.test.tsx`
- **Verification:** `npx vitest run tests/unit/estimate` green; full `npx vitest run tests/unit tests/eval` green (4824 passed, 21 todo)
- **Committed in:** `e82d2ae4` (Task 2 commit)

**2. [Rule 1 - Bug] Measurement drift between `blocksFromModel()`'s additive height estimates and `@react-pdf/renderer`'s real Yoga+PDFKit layout, undercounting the real page count**
- **Found during:** Task 3's own real-PDF-byte assertion (`must_haves.truths`: "the real generated PDF byte stream has exactly as many /Type /Page objects as the engine's computed page count")
- **Issue:** With only `SAFETY_MARGIN_LINES`-derived margin, the engine's computed page count under-counted the REAL rendered PDF's page count (e.g. multi-page fixture: engine 5/6 vs real 7/9 for Classic/Modern). A binary-search diagnostic (single-section item-count sweep, `1..60` items) isolated the drift to a consistent "off-by-roughly-one-item-row-worth-of-height" pattern at each page's capacity boundary, present even though per-line text measurement itself is byte-identical to `@react-pdf/pdfkit`'s own `heightOfString()`/`currentLineHeight()` (verified directly, zero drift, across Inter/Inter-Bold/Lora/Lora-Bold at multiple widths/font sizes). The residual drift is attributable to the cumulative effect, across many blocks/lines per page, of small differences between the additive box-model height formulas (Plan 184-03) and Yoga's real flexbox layout (not a single identifiable formula bug) — since each of my own explicit `<Page>` elements still defaults to `wrap={true}`, any page whose real content slightly exceeds the engine's budget silently overflows onto extra HIDDEN pages via Yoga's own auto-pagination, inflating the real page count beyond what was explicitly declared.
- **Fix:** Added `PDF_RENDER_SAFETY_MARGIN_PT = 100` (a new, distinctly-named, empirically-calibrated flat per-page pt reserve) to `lib/pdf/measure-header-height.ts`, added on top of the existing `SAFETY_MARGIN_LINES`-derived term in BOTH `render-estimate-pdf.ts` (production) and `_pages-for-fixture.ts` (tests) — mirrored identically per the plan's own established "tests mirror the resolver's derivation" convention. Calibrated via a diagnostic sweep (not committed) comparing engine vs. real page counts across a single-section 1–60-item fixture, the 4-section/40-item multi-page fixture, and the content-rich baseline fixture, for both templates — 0 mismatches at +80pt, +100pt used for headroom.
- **Files modified:** `lib/pdf/measure-header-height.ts`, `lib/pdf/render-estimate-pdf.ts`, `tests/unit/pdf/_pages-for-fixture.ts`
- **Verification:** `tests/unit/pdf/estimate-pdf-pagination.test.tsx`'s real-PDF-byte assertions pass for both single-page and multi-page fixtures, both templates; full `npx vitest run tests/unit tests/eval` green
- **Committed in:** `b04e7e04` (Task 3 commit)

**3. [Rule 1 - Bug] `buildFixtureEstimate({})` is not actually single-page under real geometry; the continuation-header count isn't always exactly 1**
- **Found during:** Task 3's own test authoring
- **Issue:** The plan's `<behavior>` assumed `buildFixtureEstimate({})` (the established "baseline" fixture) renders exactly 1 page — untrue once real fontkit measurement is applied (it needs 2 real pages given its full title-banner+info-grid+summary+2-sections+totals+2-terms-cards content). Separately, the plan's assumption that a continuation page shows the table header "exactly once" doesn't hold when that same page ALSO starts a new section later (a legitimate, correct rendering scenario the multi-page fixture actually produces).
- **Fix:** Added a dedicated `buildSmallSinglePageFixture()` (1 section, 1 short item, no summary/terms/discount/tax/deposit) for the single-page assertions; changed the continuation-header assertion to `expect(occurrences).toBe(1 + sectionHeaderCountOnThatPage)`, checked only against the 4 unambiguous column labels (`L.total` excluded — it collides with `L.grandTotal`, both `'Total'` in English).
- **Files modified:** `tests/unit/pdf/estimate-pdf-pagination.test.tsx`
- **Verification:** all 12 pagination tests pass, both templates
- **Committed in:** `b04e7e04` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (1 blocking, 2 bugs).
**Impact on plan:** All 3 were necessary for the plan's own stated `must_haves.truths`/behavior to actually hold under real measurement — no scope creep beyond making the phase's central deliverable (real PDF page count matches the engine's) true.

## Issues Encountered
None beyond the deviations above.

## User Setup Required
None - no external service configuration required.

## Authentication Gates
None encountered.

## Next Phase Readiness — Contracts for Phase 185 (Web Paginated Preview)

- **`MeasurementProvider` interface** (`lib/estimate/pagination/measure/types.ts`, unchanged from Plan 184-02): `{ lineCount(text: string, styleKey: string, fontSizePt: number, maxWidthPt: number): number }`. Phase 185's DOM-backed implementation must satisfy this exact shape — `styleKey` is the registered font family name (`'Inter' | 'Inter-Bold' | 'Lora' | 'Lora-Bold'`), opaque to the engine/rules.
- **`computePageBreaks(blocks: PageBlock[], constraints: PageConstraints, measurementProvider: MeasurementProvider): PageAssignment[]`** (`lib/estimate/pagination/engine.ts`, unchanged, 3-arg — no `safetyMarginLines` param). Phase 185 calls this identically, swapping `createFontkitMeasurementProvider()` for a DOM-backed provider (e.g. one backed by `getBoundingClientRect()`/`getClientRects()` measurements). `constraints.safetyMarginPt` for the DOM case should be derived from `SAFETY_MARGIN_LINES` (184-01's Chromium-vs-fontkit spike value, 1 line) the SAME way `184-DRIFT-REPORT.md` originally intended — that constant's own drift spike WAS against a real Chromium DOM, unlike this plan's PDF renderer. Phase 185 should NOT reuse `PDF_RENDER_SAFETY_MARGIN_PT` (100pt) — that constant is specifically calibrated for `@react-pdf/renderer`'s Yoga+PDFKit layout engine, an unrelated rendering pipeline; Phase 185 should run its OWN drift-calibration sweep (mirroring this plan's Task 3 diagnostic methodology: compare `computePageBreaks()`'s page count against the real DOM's rendered page-break points across a range of fixture sizes) if any additional margin proves necessary for the DOM case.
- **`blocksFromModel(input): PageBlock[]`** (`lib/estimate/pagination/blocks-from-model.ts`, unchanged) — Phase 185 reuses this verbatim (same blocks, only the measurement provider differs). Input shape (see `184-03-SUMMARY.md` for the full table): `{ sections?, summary, timeline, payment_terms, warranty_terms, notes, company: {estimate_terms_enabled?, estimate_terms_text?}, discount_amount, tax_amount, dep: DepositDisplay, signature, photos, resolvedSettings, preparedBy, L, templateId }`.
- **`SAFETY_MARGIN_LINES = 1`**, sourced from `lib/estimate/pagination/measure/safety-margin.ts` (Plan 184-01, unchanged) — a zero-dependency constant derived from a real Chromium-vs-fontkit drift spike (`184-DRIFT-REPORT.md`). Applied as a flat PER-PAGE pt reserve (`SAFETY_MARGIN_LINES * fontSizePt * LINE_HEIGHT[fontFamily]`), never per-block.
- **`buildPagesForFixture(estimate: Record<string, unknown>, company: BuildPagesForFixtureCompany, templateId: EstimateTemplateId, opts?: { signature?, attachedPhotos?, preparedBy? }): PageAssignment[]`** (`tests/unit/pdf/_pages-for-fixture.ts`) — Phase 185's own tests may want an equivalent DOM-flavored helper following the same shape (estimate/company/templateId/opts → real pipeline output), swapping in a DOM measurement provider.
- **`TERMS_CARD_MAP` shape** (built fresh per render inside each template, not exported — see `buildTermsCardMap` in `components/pdf/estimate-pdf.tsx` / `estimate-pdf-modern.tsx`): `Record<'estimate'|'payment'|'timeline'|'warranty'|'notes', { title: string; text: string; titleColor?: string }>`, where `estimate.title = 'Estimate Terms'` (with `titleColor: brandText`), `payment.title = L.paymentTerms`, `timeline.title = L.timeline`, `warranty.title = L.warranty`, `notes.title = L.notes` (all others `titleColor: undefined`). Phase 185's web renderer needs this identical mapping (currently a private per-template function — if Phase 185 needs to import it directly rather than reimplement, consider promoting it to a shared module at that time).

- This closes PGBRK-01 through PGBRK-04 for the PDF surface (PGBRK-05 was already completed in Plan 184-01/03). Both templates are fully wired to the consolidated pagination engine; `npx vitest run tests/unit tests/eval` (4824 passed, 21 todo) and `npx tsc -p tsconfig.ci.json --noEmit` are both green. No blockers for Phase 185.

---
*Phase: 184-consolidated-pagination-engine*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 9 created files confirmed present on disk (`lib/pdf/measure-header-height.ts`, `tests/unit/pdf/measure-header-height.test.ts`, `tests/unit/pdf/_pages-for-fixture.ts`, `tests/unit/pdf/estimate-pdf-pagination.test.tsx`, `184-HUMAN-UAT.md`, and 4 `uat/*.pdf` files), plus this SUMMARY.md. All 4 task commits confirmed present in `git log` (`61f7afb4`, `e82d2ae4`, `b04e7e04`, `f61113e1`).
