---
phase: 185-paginated-editable-editor-mode
plan: 03
subsystem: ui
tags: [pagination, react, dom-measurement, fontkit, playwright, estimate-editor]

# Dependency graph
requires:
  - phase: 185-paginated-editable-editor-mode (Plan 01)
    provides: computeEstimatePageConstraints(company, templateId) + createBrowserFontkitMeasurementProvider(fontFamilies?) — the shared browser measurement substrate this plan wires into a real UI for the first time
  - phase: 185-paginated-editable-editor-mode (Plan 02)
    provides: viewMode state (VersionSlot.viewMode/onViewModeChange) — the existing toggle this plan's canvas mounts on, zero new plumbing needed
provides:
  - estimateTemplateId + preparedBy threaded server -> ProjectWorkspace -> OverviewTab -> EstimateTab -> EstimateEditor (identical resolution to the PDF pipeline)
  - usePaginatedPreview() hook — computes PageAssignment[] client-side via the identical blocksFromModel()+computePageBreaks() pipeline, called unconditionally every render
  - derivePageOffsets() — a genuinely pure, cascade-corrected, two-pass page-offset algorithm + PaginatedDocumentOverlay's reset-then-snapshot measurement shell
  - estimate-document.tsx data-page-block-id/data-item-id anchors on every block-kind-bearing element, plus preparedBy/companyTerms rendering (editor-only, share-webview-safe)
  - scripts/pagination-binding-check.ts — a standalone Playwright script proving real positional binding, run and PASSED against real Chromium during this plan's execution
affects: [185-04 (modifies use-paginated-preview.ts AND paginated-document-overlay.tsx directly for debounce/structural-edit refinements)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Reset-then-snapshot measurement shell: Phase A resets every anchor's marginTop, forces one reflow, snapshots the fully natural layout; Phase B runs pure arithmetic from that fixed snapshot and writes ONE batched marginTop update per anchor — a ResizeObserver guard (isApplyingRef) ignores callbacks the shell's own writes trigger"
    - "Cascade-corrected spacer math: when multiple elements' marginTop are all computed against the SAME reset baseline but applied simultaneously, each later spacer must subtract the sum of every earlier spacer already applied (appliedShiftPx) — otherwise real CSS block-flow cascading double-counts every earlier page's shift"
    - "Pure-function/thin-shell split for anything jsdom cannot prove: derivePageOffsets() is 100% plain-number-array arithmetic (unit-testable, zero DOM); the useLayoutEffect+ResizeObserver wrapper around it is deliberately untested in jsdom, proven instead by a standalone Playwright script (184-spike precedent)"

key-files:
  created:
    - components/workspace/estimate/use-paginated-preview.ts
    - components/workspace/estimate/paginated-document-overlay.tsx
    - scripts/pagination-binding-check.ts
    - tests/unit/estimate/document-prepared-by-terms.test.tsx
    - tests/unit/estimate/derive-page-offsets.test.ts
    - tests/unit/estimate/paginated-preview-canvas.test.tsx
    - .planning/phases/185-paginated-editable-editor-mode/deferred-items.md
  modified:
    - app/(app)/projects/[id]/page.tsx
    - components/workspace/project-workspace.tsx
    - components/workspace/overview-tab.tsx
    - components/workspace/estimate/estimate-tab.tsx
    - components/workspace/estimate/estimate-editor.tsx
    - components/workspace/estimate/estimate-document.tsx
    - lib/estimate/document/model.ts
    - lib/estimate/document/labels.ts
    - tests/unit/workspace/estimate-editor-conflict.test.tsx
    - tests/unit/estimate/document-label-parity.test.ts
    - tests/unit/estimate/pt-px-conversion-source.test.ts
    - tests/unit/estimate/__snapshots__/document-alignment.test.tsx.snap
    - tests/unit/estimate/__snapshots__/document-label-parity.test.ts.snap

key-decisions:
  - "PaginatedDocumentOverlay accepts company/templateId/language props (beyond the plan interfaces block's abbreviated {pages, children} sketch) — required to compute topReservationPx/bottomReservationPx/continuationHeaderPx from measureHeaderHeightPt()/ESTIMATE_PAGE_GEOMETRY/CONTINUATION_TABLE_HEADER_HEIGHT_PT, mirroring exactly what usePaginatedPreview() already derives from the same 2 inputs for the engine's own PageConstraints"
  - "[Rule 1 - Bug] Fixed a real cascading double-count in derivePageOffsets()'s spacer math, found by actually running scripts/pagination-binding-check.ts against real Chromium — see Deviations below"

requirements-completed: [PGMODE-02, PGMODE-03]

# Metrics
duration: 51min
completed: 2026-07-28
---

# Phase 185 Plan 03: Paginated Canvas — Real DOM-Measurement Pass + Editor Content Parity Summary

**A genuinely pure, cascade-corrected `derivePageOffsets()` two-pass algorithm drives a reset-then-snapshot DOM-measurement overlay that anchors decorative page-sheet boundaries onto the SAME editable `EstimateDocument` tree — proven positionally correct against real Chromium via a standalone Playwright script that caught and fixed a real spacer-math bug during this plan's own execution.**

## Performance

- **Duration:** ~51 min
- **Started:** ~2026-07-28T15:10:00Z (estimated — file reads preceded the first commit)
- **Completed:** 2026-07-28T16:01:43Z
- **Tasks:** 4 completed (1, 2, 3a, 3b)
- **Files modified:** 20 (7 created, 13 modified)

## Accomplishments
- `estimateTemplateId: EstimateTemplateId` and `preparedBy: string | null` now flow from `app/(app)/projects/[id]/page.tsx` (resolved identically to `lib/pdf/render-estimate-pdf.ts`'s own `resolveEstimatePdfContext`/`renderEstimatePdf` logic) through `ProjectWorkspace` → `OverviewTab` → `EstimateTab` → `EstimateEditor`, as two new required props at every hop.
- `DocumentCompany` widened with optional `estimate_terms_enabled`/`estimate_terms_text` (additive, zero breakage to any of its 13 existing import sites).
- `usePaginatedPreview({ data, company, templateId, preparedBy, language, enabled })` — called **unconditionally** every render of `estimate-editor.tsx` (rules-of-hooks safe), internally gated on `enabled`. Dynamically imports `browser-estimator.ts` only on first activation, caches the resolved `MeasurementProvider` per template in a module-scope `Map`, and runs the identical `blocksFromModel()` → `computePageBreaks()` pipeline the PDF renderer uses.
- `documentData = useMemo(() => stateToDocumentData(state), [state])` — load-bearing memoization so the hook's dependency array can detect genuine content changes vs. unrelated re-renders.
- `estimate-document.tsx` now carries `data-page-block-id` anchors on every block-kind-bearing element (see the anchor table below) plus `data-item-id={item.id}` on every item row, and renders `preparedBy`/`companyTerms` as real content in **both** editor view modes — matching the PDF's content order (Terms(estimate-first) → Signature → Photos → Prepared-by) — while the public share webview's exact call pattern (`mode="view"`, neither prop supplied) stays byte-identical, proven by a dedicated test.
- `lib/estimate/document/labels.ts` gained a new `estimateTerms` key (en/pt/es) — the shared `LABELS` map now carries 47 keys (was 46); the pre-existing "locked" parity test and its snapshot were deliberately updated to reflect this legitimate addition.
- `PaginatedDocumentOverlay` renders the PDF-preview-styled canvas (`bg-muted rounded-xl py-8 px-4`, 848px wide, `mx-auto`) via a genuinely pure `derivePageOffsets()` (two acyclic passes: sheet heights, then content-tops/spacers) plus a thin `useLayoutEffect`+`ResizeObserver` shell that resets every anchor's `marginTop`, snapshots the natural layout, computes offsets, and writes ONE batched update — guarded against its own `ResizeObserver` echoes via `isApplyingRef`.
- `estimate-editor.tsx`'s canvas wrapper now contains ONLY the paginated/full-width document; `IssuedInvoicesPanel`/`GenerateInvoiceDialog` render as siblings in **both** view modes (never inside the paginated tray); the `pageZoom` fit calculation was widened to also gate on available width.
- `scripts/pagination-binding-check.ts` — a standalone Playwright script (mirroring `scripts/pagination-drift-spike.ts`'s pattern) that renders a hardcoded 4-page fixture, runs the exact same Phase A/B algorithm inside `page.evaluate()`, and asserts every page's first-block anchor lands inside its own decorative sheet's real `getBoundingClientRect()` — **run during this plan's execution and it PASSED** (all 4 anchors bind correctly, no block straddles a sheet boundary) after the cascade-correction fix below.

## Task Commits

Each task was committed atomically:

1. **Task 1: Thread estimateTemplateId + preparedBy + company terms fields from server to EstimateEditor** - `bd82dbb5` (feat)
2. **Task 2: usePaginatedPreview hook — pure engine pipeline, unconditional call, memoized document data** - `381f1b8a` (feat)
3. **Task 3a: estimate-document.tsx anchors + prepared-by/companyTerms rendering (+ share-mode byte-compatibility proof)** - `2ed51616` (feat)
4. **Task 3b: Real DOM-measurement overlay (pure derivePageOffsets + reset-then-snapshot shell) + canvas restructure + Playwright binding check** - `ba7d6211` (feat)

**Plan metadata:** committed alongside this SUMMARY (see final commit).

## Files Created/Modified
- `components/workspace/estimate/use-paginated-preview.ts` - `usePaginatedPreview()` hook (pure engine pipeline, module-scope provider cache keyed by template)
- `components/workspace/estimate/paginated-document-overlay.tsx` - `derivePageOffsets()` (pure) + `PaginatedDocumentOverlay` (the measurement shell + decorative canvas)
- `scripts/pagination-binding-check.ts` - standalone Playwright real-positional-binding proof (run + PASSED)
- `tests/unit/estimate/document-prepared-by-terms.test.tsx` - preparedBy/companyTerms rendering + share-webview byte-compatibility proof
- `tests/unit/estimate/derive-page-offsets.test.ts` - pure-function proof, incl. the cascade-correctness fix
- `tests/unit/estimate/paginated-preview-canvas.test.tsx` - jsdom structure/chrome/fail-soft proof
- `.planning/phases/185-paginated-editable-editor-mode/deferred-items.md` - out-of-scope `next build` TS-check finding (see Deviations)
- `app/(app)/projects/[id]/page.tsx` - resolves + threads estimateTemplateId/preparedBy, widened companyPromise select
- `components/workspace/project-workspace.tsx`, `overview-tab.tsx`, `estimate-tab.tsx` - prop-drilling for the 2 new props
- `components/workspace/estimate/estimate-editor.tsx` - documentData memo, usePaginatedPreview call, canvas restructure, widened pageZoom
- `components/workspace/estimate/estimate-document.tsx` - anchors, preparedBy/companyTerms rendering, widened hasTerms
- `lib/estimate/document/model.ts` - DocumentCompany widened (estimate_terms_enabled/text)
- `lib/estimate/document/labels.ts` - new `estimateTerms` label (en/pt/es)
- `tests/unit/workspace/estimate-editor-conflict.test.tsx` - updated for the now-required props
- `tests/unit/estimate/document-label-parity.test.ts` (+ its snapshot) - 46→47 key count, regenerated snapshot
- `tests/unit/estimate/pt-px-conversion-source.test.ts` - registered the new overlay file in CLEAN_SOURCES
- `tests/unit/estimate/__snapshots__/document-alignment.test.tsx.snap` - regenerated for the new anchors

## Data-page-block-id anchor table (as implemented)

| Block kind | `data-page-block-id` | Anchor element |
|---|---|---|
| `section-header` | `${section.id}-header` | Section header bar `<div>` |
| `item-row` | `${section.id}-rows-${item.id}` | `SortableDocumentItemRow`'s `<tr>` (also carries `data-item-id={item.id}`) |
| `section-subtotal` | `${section.id}-subtotal` | Section-subtotal `<div>` |
| `totals` | `totals` | `DocumentTotals`'s root `<div>` |
| `terms-card` (estimate/payment/timeline/warranty/notes) | `terms-{key}` | A thin `<div>` wrapping the company-terms card or each `<TermsBlock>` |
| `signature` | `signature` | Signature block `<div>` |
| `photo-row` (first only) | `photo-row-0` | Photos container `<div>` (per-row N>0 anchors out of scope this phase, documented inline) |
| `prepared-by` | `prepared-by` | New prepared-by block, after photos |

## Decisions Made
- **`PaginatedDocumentOverlay` accepts `company`/`templateId`/`language` props.** The plan's `<interfaces>` block sketched `{ pages, children }`, but the reservation math (`topReservationPx`/`bottomReservationPx`/`continuationHeaderPx`) genuinely depends on `measureHeaderHeightPt(company, templateId)` + `ESTIMATE_PAGE_GEOMETRY[templateId]` + `CONTINUATION_TABLE_HEADER_HEIGHT_PT[templateId]` — there is no way to compute them without these inputs. `estimate-editor.tsx` already has `company`/`estimateTemplateId`/`language` in scope, so threading them into the overlay is a zero-risk completion of an abbreviated sketch, not an architectural change.
- **`estimateTerms` label bumped `LABELS` from 46 to 47 keys.** `tests/unit/estimate/document-label-parity.test.ts`'s hard "locked" 46-key assertion and its committed snapshot were deliberately updated — this is the exact, plan-mandated new key (`lib/estimate/document/labels.ts`'s `<interfaces>` entry), not drift.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Cascade-corrected `derivePageOffsets()`'s spacer math**
- **Found during:** Task 3b, while running `scripts/pagination-binding-check.ts` against real Chromium (the script's FIRST run legitimately failed: 4 of 16 fixture blocks reported straddling a sheet boundary).
- **Issue:** The plan's own literal reference implementation computes every page's `spacerMarginTopPx` as `contentTopPx[i] - naturalOffsetsPx[i]`, comparing against the SAME fully-reset (zero-margin) baseline for every page, then writes all resulting margins to the DOM simultaneously in one batched pass. In real CSS block flow, an EARLIER anchor's `marginTop` also pushes every LATER anchor down (normal flow cascading) — so by the time a later page's own margin is applied, it lands on top of an anchor that has ALREADY shifted down by every earlier page's margin. The naive formula double-counts this: verified analytically (hand-derived a 3-page example showing exactly a `spacer[i-1]`-sized overshoot at page 2+) and empirically (the Playwright script's first run showed rendered blocks landing past their intended sheet boundaries starting at page 2).
- **Fix:** Added a running `appliedShiftPx` accumulator in `derivePageOffsets()`'s Pass 2 loop — `spacerMarginTopPx = Math.max(0, contentTopPx - naturalOffsetsPx[i] - appliedShiftPx)`, then `appliedShiftPx += spacerMarginTopPx`. This makes each page's own margin contribute only the REMAINING delta needed to reach `contentTopPx[i]` after accounting for every earlier page's already-applied cascade. `contentTopPx`/`sheetHeightPx`'s own formulas and documented meaning are unchanged — only how `spacerMarginTopPx` is derived.
- **Files modified:** `components/workspace/estimate/paginated-document-overlay.tsx`, `scripts/pagination-binding-check.ts` (its hand-transcribed copy, kept in lockstep), `tests/unit/estimate/derive-page-offsets.test.ts` (new "cascade correctness" test simulating real cascading arithmetically).
- **Verification:** Re-ran `scripts/pagination-binding-check.ts` after the fix — all 4 page anchors now bind correctly within their own sheet, and all 16 fixture blocks pass the no-straddle check. All pure-function unit tests still pass (the fix doesn't change `contentTopPx`/`sheetHeightPx`, only `spacerMarginTopPx`, so no prior test's `contentTopPx` assertions needed updating; the "spacer clamping" test's expected value of 0 was independently re-verified to still hold).
- **Committed in:** `ba7d6211` (Task 3b commit)

---

**Total deviations:** 1 auto-fixed (1 bug, caught by actually running the plan's own required Playwright proof — exactly what that script exists to catch)
**Impact on plan:** Necessary for the plan's own core correctness claim (PGMODE-02: visual break points must genuinely match the engine's `PageAssignment[]`). No scope creep — the fix is confined to `derivePageOffsets()`'s spacer derivation.

## Issues Encountered

**`npx next build` — pre-existing, out-of-scope TypeScript-check failure (not a regression, not a real blocker).** The plan's verification step requires a clean `npx next build` to prove the bare `'fontkit'` specifier resolves under real webpack. Webpack compilation succeeds cleanly (`✓ Compiled successfully`) — proving the exact claim this step exists for — but Next's SEPARATE, later "Running TypeScript..." project-wide check phase then fails on pre-existing errors in `scripts/pagination-drift-spike.ts`, `scripts/pagination-render-calibration.ts`, and several `tests/**` files, none of which this plan touched. Confirmed via: (1) bare `npx tsc --noEmit` reproduces the identical error list independent of any 185-03 change; (2) `.dockerignore` excludes both `scripts/` and `tests/` from the actual production Docker build context, so these files never reach the real `next build` the deploy pipeline runs; (3) `gh run list --workflow="Build and Deploy"` confirms the most recent production deploy succeeded; (4) CI's real gate (`npx tsc -p tsconfig.ci.json --noEmit`, which DOES cover every file this plan touches) is clean. Logged to `.planning/phases/185-paginated-editable-editor-mode/deferred-items.md` per the scope-boundary protocol — not fixed, not blocking.

## Known Stubs

None. Every prop/field this plan introduces is wired to real data (no hardcoded empty values, no placeholder text, no unwired mock data).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `usePaginatedPreview()`'s exact signature (`{ data, company, templateId, preparedBy, language, enabled } -> { pages }`) and `PaginatedDocumentOverlay`'s exact props (`{ pages, company, templateId, language, children }`) are both stable and ready for Plan 185-04 to modify directly (debounce/structural-edit-counter refinements, per this plan's `<output>` requirement).
- `derivePageOffsets()`'s pure signature, two-pass algorithm, and the cascade-correction fix are fully documented in `paginated-document-overlay.tsx`'s own doc comments — Plan 185-04 should NOT re-introduce the naive (non-cascade-corrected) formula.
- The full `data-page-block-id` anchor table above is the contract Plan 185-04 (and any future measurement refinement) must keep in sync with `blocksFromModel()`'s own id-generation convention.
- `scripts/pagination-binding-check.ts` is a durable, repeatable, manually-run proof (`npx tsx scripts/pagination-binding-check.ts`) — re-run it after any future change to `derivePageOffsets()` or the measurement shell.
- No blockers for 185-04.

---
*Phase: 185-paginated-editable-editor-mode*
*Completed: 2026-07-28*

## Self-Check: PASSED

All 7 created files verified present on disk (`use-paginated-preview.ts`, `paginated-document-overlay.tsx`, `pagination-binding-check.ts`, `document-prepared-by-terms.test.tsx`, `derive-page-offsets.test.ts`, `paginated-preview-canvas.test.tsx`, `deferred-items.md`), plus this SUMMARY.md. All 4 task commits (`bd82dbb5`, `381f1b8a`, `2ed51616`, `ba7d6211`) verified present in `git log`.
