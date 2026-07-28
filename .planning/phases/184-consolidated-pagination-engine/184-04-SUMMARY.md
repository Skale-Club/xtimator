---
phase: 184-consolidated-pagination-engine
plan: 04
subsystem: pdf-templates
tags: [react-pdf, pagination, atomicity, pdf-section-block, pdf-photo-grid, pdf-terms-section, pdf-totals-block]

# Dependency graph
requires:
  - phase: 184-consolidated-pagination-engine
    provides: "184-01: LINE_HEIGHT, ESTIMATE_PAGE_GEOMETRY, photosPerRow(contentWidthPt) (lib/estimate/document/tokens.ts); visibleSectionItems(section) (lib/estimate/document/visible-items.ts)"
provides:
  - "PdfSectionHeader/PdfTableHeaderOnly/PdfSectionRows/PdfSectionSubtotal — 4 independently-placeable, sectionId-keyed pieces replacing the monolithic PdfSectionBlock"
  - "PdfPhotoGrid row-chunked via the shared photosPerRow(contentWidthPt) — one wrap={false} View per visual row instead of one wrap={false} around the whole grid"
  - "PdfTermsCard — one exported, individually wrap={false}, optionally topMarginPt-margined terms card; PdfTermsSection composes 5 of these in fixed order"
  - "PdfTotalsBlock's outer totalsContainer is wrap={false} in both classic and modern branches"
  - "2 new structural regression tests (photo-grid + terms/totals atomicity) guarding these invariants going forward"
affects: [184-05-render-wiring-dispatcher]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "sectionId-keyed sibling pieces: when one JSX call site is split into N independently-callable functions returned as sibling array items (not JSX), each piece sets its OWN root element's key (via a shared id prop + fixed suffix convention, e.g. `${sectionId}-header`/`-thead`/`-rows`/`-subtotal`) instead of relying on a since-removed single outer wrapper's key"
    - "row-chunking via a shared token-derived formula: PdfPhotoGrid imports photosPerRow from lib/estimate/document/tokens.ts rather than re-deriving the tile-width/gap arithmetic locally, keeping the chunking formula in the one client-safe module Plan 184-03's blocks-from-model.ts also reads from"
    - "closure-tracked 'first emitted' flag for margin placement: PdfTermsSection composes 5 conditionally-rendered PdfTermsCard calls in JSX children order and uses a local boolean (flipped inside a `nextTopMargin()` helper called only when a condition is truthy) to apply topMarginPt to whichever card actually renders first — order-dependent side effects are safe here because JS evaluates array/JSX children left-to-right"
    - "structural atomicity tests via content-based node disambiguation: rather than rendering to a real PDF buffer, a DFS walker over the directly-invoked template's returned element tree finds wrap={false} View nodes and disambiguates which structural block each belongs to via an unambiguous marker (descendant <Image> for photo-grid rows, first-child title <Text> for terms cards, descendant 'Subtotal' <Text> for the totals container) — adapted from estimate-pdf-banner-fill.test.tsx's style-aware walker pattern"

key-files:
  created:
    - tests/unit/pdf/estimate-pdf-photo-grid-atomicity.test.tsx
    - tests/unit/pdf/estimate-pdf-terms-atomicity.test.tsx
  modified:
    - components/pdf/shared/pdf-section-block.tsx
    - components/pdf/shared/pdf-photo-grid.tsx
    - components/pdf/shared/pdf-terms-section.tsx
    - components/pdf/shared/pdf-totals-block.tsx
    - components/pdf/estimate-pdf.tsx
    - components/pdf/estimate-pdf-modern.tsx

key-decisions:
  - "PdfSectionRows takes an explicit `fmt: (v: number) => string` prop (not listed in the plan's abbreviated <behavior> signature) — required to format unit_price/total money values; documented here as the actual shipped signature for Plan 184-05 to wire against"
  - "PdfSectionSubtotal takes pre-formatted `label: string` + `value: string` (not `L`/`fmt`+`section`) — caller passes `L.sectionSubtotal` and `fmt(section.subtotal)` directly, keeping the piece itself free of formatting/label-lookup concerns"
  - "PdfTermsSection gained a new required `topMarginPt: number` prop (24 Classic / 32 Modern, matching the removed termsSection.marginTop StyleSheet values byte-for-byte) since the outer termsSection container is no longer margined — the value must reach whichever PdfTermsCard renders first"
  - "PdfPhotoGrid's row-chunk marginTop placement (topMargin on row 0 only, 8pt between subsequent rows in place of the old flex-wrap `gap`'s implicit row spacing) is a structural change Plan 184-04 itself calls out as acceptable ('only the wrap/grouping/margin-placement structure changes') — no test asserts exact pt spacing, only text content/order (unchanged) and wrap-count (new, asserted)"

patterns-established:
  - "sectionId-keyed sibling pieces (see tech-stack.patterns above)"
  - "closure-tracked first-emitted-card margin placement (see tech-stack.patterns above)"

requirements-completed: [PGBRK-02]

# Metrics
duration: 20min
completed: 2026-07-28
---

# Phase 184 Plan 04: PDF Template Atomicity Restructure Summary

**Split the monolithic PdfSectionBlock into 4 sectionId-keyed pieces (PdfSectionHeader/PdfTableHeaderOnly/PdfSectionRows/PdfSectionSubtotal), row-chunked PdfPhotoGrid via the shared photosPerRow token, made every terms card + the totals container independently wrap={false}, with zero change to today's single-page rendered output.**

## Performance

- **Duration:** 20 min
- **Started:** 2026-07-28T10:26:00Z
- **Completed:** 2026-07-28T10:45:40Z
- **Tasks:** 3
- **Files modified:** 8 (2 created, 6 modified)

## Accomplishments
- `pdf-section-block.tsx` no longer exports a single `PdfSectionBlock` — it exports `PdfSectionHeader`, `PdfTableHeaderOnly`, `PdfSectionRows` (zebra striping via `(idx + startIndex) % 2` so a mid-section continuation slice stays correctly alternating), and `PdfSectionSubtotal`, each keying its own root element off a `sectionId` prop (`${sectionId}-header`/`-thead`/`-rows`/`-subtotal`).
- Both templates' section call sites now call all 4 pieces per section (`startIndex: 0`) and filter items via the shared `visibleSectionItems` instead of an inline filter chain — reproduces today's tree byte-for-byte (baseline-order + banner-fill tests unchanged).
- `tableCellText`/`sectionTitle` in both templates now pin `lineHeight` from the shared `LINE_HEIGHT` token (Inter/Inter-Bold Classic, Lora/Lora-Bold Modern) — additive, font-metrics-derived, no visible change.
- `pdf-photo-grid.tsx`'s `PdfPhotoGrid` row-chunks via the imported `photosPerRow(contentWidthPt)` (from `lib/estimate/document/tokens.ts`, not redefined locally), rendering one `wrap={false}` View **per row** instead of one `wrap={false}` around the whole grid; only the first row-chunk carries `marginTop: topMargin`; the "Photos" label renders exactly once via a new `showLabel` prop.
- `pdf-terms-section.tsx` gained an exported `PdfTermsCard` — one independently `wrap={false}` card; `PdfTermsSection` composes 5 of these in the fixed order (Estimate Terms → Payment Terms → Timeline → Warranty → Notes), applying a new `topMarginPt` prop only to whichever card is actually emitted first (tracked via a closure flag).
- `pdf-totals-block.tsx`'s outer `totalsContainer` is now `wrap={false}` in both the `classic` and `modern` branches, closing a real pre-existing atomicity gap (previously relied on default Yoga wrap).
- Both templates' `PdfPhotoGrid` call sites now read `contentWidthPt` from `ESTIMATE_PAGE_GEOMETRY` (no bare `532`/`508` literal) and pass `showLabel: true`; `PdfTermsSection` call sites pass `topMarginPt` (24 Classic / 32 Modern), replacing the removed `termsSection.marginTop` StyleSheet value.
- 2 new structural regression tests (`estimate-pdf-photo-grid-atomicity.test.tsx`, `estimate-pdf-terms-atomicity.test.tsx`) assert exactly 3 wrap-false photo-grid row-Views (7-photo fixture) and exactly 5 wrap-false terms cards + a wrap-false totals container (all-5-terms fixture), for both templates.

## Task Commits

Each task was committed atomically:

1. **Task 1: Split PdfSectionBlock into 4 independently-placeable, individually-keyed pieces + pin measurement-critical lineHeight + use the shared item filter** - `b1626de3` (feat)
2. **Task 2: Row-chunk PdfPhotoGrid via the shared photosPerRow (+ first-row topMargin) + per-card-atomic PdfTermsSection (+ exported PdfTermsCard with optional topMarginPt) + wrap={false} on totals container + token-sourced call sites** - `fe3ea961` (feat)
3. **Task 3: Structural atomicity regression tests (photo grid + terms + totals) + full existing PDF suite verification** - `0dbd5633` (test)

**Plan metadata:** committed separately (see below).

## Files Created/Modified
- `components/pdf/shared/pdf-section-block.tsx` - exports `PdfSectionHeader`/`PdfTableHeaderOnly`/`PdfSectionRows`/`PdfSectionSubtotal` (replacing `PdfSectionBlock`)
- `components/pdf/shared/pdf-photo-grid.tsx` - row-chunked `PdfPhotoGrid` via imported `photosPerRow`, new `contentWidthPt`/`showLabel` props
- `components/pdf/shared/pdf-terms-section.tsx` - new exported `PdfTermsCard`; `PdfTermsSection` composes it, new `topMarginPt` prop
- `components/pdf/shared/pdf-totals-block.tsx` - `wrap={false}` added to both variant branches' outer container
- `components/pdf/estimate-pdf.tsx` - updated imports/call sites (4-piece section calls, `visibleSectionItems`, `LINE_HEIGHT`, `ESTIMATE_PAGE_GEOMETRY`, `PdfTermsSection.topMarginPt: 24`, `PdfPhotoGrid.contentWidthPt`/`showLabel`), `termsSection` StyleSheet entry emptied
- `components/pdf/estimate-pdf-modern.tsx` - same call-site updates (`topMarginPt: 32`), `termsSection` StyleSheet entry emptied
- `tests/unit/pdf/estimate-pdf-photo-grid-atomicity.test.tsx` - new: 7-photo fixture asserts exactly 3 wrap-false row-Views per template
- `tests/unit/pdf/estimate-pdf-terms-atomicity.test.tsx` - new: all-5-terms fixture asserts exactly 5 wrap-false terms cards + wrap-false totals container per template

## Decisions Made
- `PdfSectionRows` needs `fmt` to format `unit_price`/`total` — added as an explicit required prop beyond the plan's abbreviated `<behavior>` signature list; this is the actual shipped signature.
- `PdfSectionSubtotal` takes pre-formatted `label`/`value` strings rather than `L`/`fmt`/`section`, keeping the piece itself free of label-lookup/formatting concerns — caller passes `L.sectionSubtotal` / `fmt(section.subtotal)`.
- `PdfTermsSection` gained a new required `topMarginPt: number` prop (24 Classic / 32 Modern) since the outer `termsSection` container's `marginTop` StyleSheet value was removed (moved onto whichever card renders first).
- Photo-grid row spacing (topMargin on row 0 only, 8pt between subsequent rows) is a structural change the plan itself calls acceptable ("only the wrap/grouping/margin-placement structure changes") — no test asserts exact pt spacing.

## Deviations from Plan

None - plan executed exactly as written. The only additions beyond the plan's abbreviated prop-signature sketches (`PdfSectionRows.fmt`, `PdfSectionSubtotal.label`/`value`, `PdfTermsSection.topMarginPt`) were necessary for the pieces to actually format/position content correctly — not scope creep, and documented above under Decisions Made / key-decisions for Plan 184-05 to wire against directly.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 184-05 can now wire real per-page composition directly against: `PdfSectionHeader({sectionId, title, solidFill, brandColor, brandOnFill, styles})`, `PdfTableHeaderOnly({sectionId, L, styles})`, `PdfSectionRows({sectionId, items, startIndex, fmt, styles})`, `PdfSectionSubtotal({sectionId, label, value, styles})`, `PdfPhotoGrid({photos, L, topMargin, contentWidthPt, showLabel, styles})` (now row-chunked), `PdfTermsCard({title, text, titleColor?, topMarginPt?, styles})` (individually atomic), and `PdfTotalsBlock` (now `wrap={false}` in both variants).
- Every gap identified in the plan's `must_haves.truths` is closed and test-covered: sections can span a page boundary (4 independently-placeable pieces), the photo grid breaks only between rows (row-chunked, not whole-grid), each terms card is individually atomic (`PdfTermsCard`), and the totals block is explicitly atomic (`wrap={false}`).
- No blockers. Baseline-order, banner-fill, photo-captions, totals, modern-totals, and the 2 new atomicity tests are all green (510 tests / 74 files in `tests/unit/pdf` + `tests/unit/estimate`); `tsc -p tsconfig.ci.json --noEmit` is clean.

---
*Phase: 184-consolidated-pagination-engine*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 6 modified files + 2 created test files confirmed present on disk (`components/pdf/shared/pdf-section-block.tsx`, `pdf-photo-grid.tsx`, `pdf-terms-section.tsx`, `pdf-totals-block.tsx`, `components/pdf/estimate-pdf.tsx`, `estimate-pdf-modern.tsx`, `tests/unit/pdf/estimate-pdf-photo-grid-atomicity.test.tsx`, `estimate-pdf-terms-atomicity.test.tsx`) and this SUMMARY.md. All 3 task commits confirmed present in `git log` (`b1626de3`, `fe3ea961`, `0dbd5633`).
