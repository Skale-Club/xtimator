# Quick 260806-pgv — Paginated view redesign: read-only preview on real page containers

## Why (owner-reported, 2026-08-06)

The paginated estimate view (Phase 185's editable overlay) is visually broken in
production use — owner screenshot shows:

- Dark translucent bands over the white sheets (dark-mode `bg-muted/50`
  continuation-header ghost drawn OUTSIDE the document's pinned-light token
  scope: `paginated-document-overlay.tsx:414`).
- Rows floating in the dark inter-page gap ("Page 1 of 4" label mid-content) —
  the measure-then-inject-marginTop anchoring desyncs from the decorative
  sheets whenever layout changes without a correct remeasure (late fonts, CSS
  `zoom`, missed anchors → `offsetTop ?? 0` at overlay L249).
- Sticky project header translucent AND not clickable — z-index tie
  (`project-header.tsx:30` `sticky z-10` vs overlay content layer `relative
  z-10` later in DOM) plus CSS `zoom` hit-testing quirks
  (`estimate-editor.tsx:782`).
- Mobile: below `sm` the document renders `ItemCardMobile` stacked cards while
  the engine paginates desktop-table letter geometry — structurally divergent;
  auto-fit floor 0.45 → ~7px text; fontkit + TTF fetch + full-tree reflows on
  device.

## Decision

Paginated mode becomes a **read-only preview rendered as real per-page
containers** (like a PDF viewer). Editing happens ONLY in full-width mode
(unchanged). No decorative overlay, no marginTop injection, no ghost headers,
no CSS `zoom`. Mobile (< lg) gets full-width only — the toggle is hidden and
mode is forced back to 'width'.

The shared pagination engine (`lib/estimate/pagination/**`) and the PDF
pipeline (`lib/pdf/**`, `components/pdf/**`) are UNTOUCHED. The web preview
consumes the same `PageAssignment[]` the PDF templates consume, resolving each
`PageBlock.ref` (sectionId / itemId / itemIndex / termsKey / photoRange —
`lib/estimate/pagination/types.ts:44-53`) against the document model, exactly
like `components/pdf/estimate-pdf.tsx` does with its `pages` prop.

## Architecture after this change

```
EstimateEditor (viewMode state, 'width' default)
├─ viewMode 'width'  → EstimateDocument (editable, unchanged markup, no pageView prop)
└─ viewMode 'page'   → PaginatedPreview (NEW, read-only)
     ├─ usePaginatedPreview (existing hook, unchanged) → PageAssignment[]
     ├─ thumbnail rail (lg+, kept from old overlay, IntersectionObserver highlight)
     ├─ N real sheet <div>s: white paper, LETTER_WIDTH_PX wide,
     │    min-height LETTER_HEIGHT_PX, light tokens pinned INSIDE each sheet,
     │    natural document flow inside (no absolute positioning of content)
     │    ├─ page 1: company header markup (mirror EstimateDocument's header)
     │    ├─ pages 2+: compact repeated company header (name + rule)
     │    ├─ continuesTable pages: real in-flow repeated column-header row
     │    └─ blocks of that page, resolved via block.ref → read-only JSX
     └─ zoom: transform: scale() + width compensation (fit-width default,
          manual ±0.1 clamped [0.5, 1.5], pill fixed bottom-right z-30)
```

## Tasks

### T1 — New `PaginatedPreview` component (new files only)

Create `components/workspace/estimate/paginated-preview.tsx` (+ optionally
small colocated helpers). Props (all already available at the editor call
site, see `estimate-editor.tsx:784-815`):

```
{ data: DocumentData, pages: PageAssignment[] | null, company, templateId,
  language, brandColor?, client, projectName, projectType, preparedBy,
  estimateVersion, estimateSeq, estimateCreatedAt, companyTerms }
```

- `pages === null` (engine still computing / fonts loading): render a neutral
  centered skeleton sheet — never fall back to the editable tree.
- Resolve blocks per page: `section-header` → section title bar;
  `item-row` → table row (zebra via `ref.itemIndex % 2`, matching
  `estimate-document.tsx:675`); `section-subtotal`; `totals`; `terms-card` via
  `ref.termsKey`; `photo-row` via `ref.photoRange`; `signature`;
  `prepared-by`; page-1-only `title-banner` / `info-grid` / `summary`.
  Mirror the visual style of `EstimateDocument`'s pageView rendering (fonts,
  paddings, `SECTION_PX`, table column widths 40/12/13/17/18%) so the preview
  matches what Phase 185 shipped, minus the editing chrome.
- A section whose rows continue onto a later page renders its `<table>` slice
  per page; `continuesTable` pages open with the repeated column-header row
  (real in-flow element).
- Light theme: pin the same CSS variables `estimate-document.tsx:1486-1500`
  pins, on EACH sheet root, plus `colorScheme: 'light'` — the preview must be
  immune to app dark mode.
- Sheets: `width: LETTER_WIDTH_PX`, `minHeight: LETTER_HEIGHT_PX`, white bg,
  shadow, 32px gap, "Page N of M" caption under each sheet (i18n via
  `LABELS[language]` like the old overlay did).
- Zoom: wrapper `transform: scale(z)`, `transform-origin: top center`, and
  height/width compensation so scroll extents are correct (outer wrapper sized
  `LETTER_WIDTH_PX * z` / content height * z). NO CSS `zoom` property.
- Thumbnail rail: port from `paginated-document-overlay.tsx:329-362`
  (skeleton-line thumbnails are fine), `hidden lg:flex`, scroll-to-page,
  IntersectionObserver active tracking (guard `typeof IntersectionObserver`).
- Read-only: zero inputs, zero dnd, zero dispatch. Use the same formatters/
  labels the document uses (`lib/estimate/document/labels.ts`, money/qty
  formatting as in `estimate-document.tsx`).

### T2 — Editor integration + header/stacking fixes

- `estimate-editor.tsx`: `viewMode === 'page'` renders `<PaginatedPreview>`
  (data = `documentData`, pages = `paginatedPages`); DELETE the CSS `zoom`
  style (L779-782), the height/width auto-fit effect (L336-357) and the zoom
  pill JSX (L743-778) — zoom now lives inside PaginatedPreview. Keep
  `usePaginatedPreview` wiring as-is (`enabled: viewMode === 'page'`).
- Force full-width below lg: `matchMedia('(min-width: 1024px)')` effect — when
  it does not match and viewMode is 'page', `setViewMode('width')`.
- `view-mode-toggle.tsx` (or its render site in `project-header.tsx`): hide
  below lg (`hidden lg:...`).
- `project-header.tsx:30`: `z-10` → `z-30` (stays below the z-40 floating
  action pill).
- Wrap the editor's document region (the div at `estimate-editor.tsx:779`) with
  `isolation: isolate` (Tailwind `isolate`) so document-internal z-indexes can
  never compete with the app chrome again.
- Remove the now-dead `pageView` prop from BOTH `EstimateDocument` call sites
  in the editor.

### T3 — Strip the overlay machinery

- Delete `components/workspace/estimate/paginated-document-overlay.tsx`.
- `estimate-document.tsx`: remove the `pageView` prop and every `pageView`
  conditional, keeping the **full-width (pageView=false) behavior** everywhere:
  restore card chrome unconditionally (L1483-1501), keep line-discount/taxable
  columns, keep the plain textarea description editing (DELETE the aria-hidden
  wrapped-text + overlapping absolute input hack, L317-352), keep the always-
  visible add-item affordance (drop the `opacity-0 group-hover` pageView
  branch), drop `hideChrome={pageView}` (pass `false` / remove per prop
  default).
- Remove `pageView` from any other component signatures it threads through
  (`SortableDocumentItemRow`, `DocumentSectionBlock`, `SortableDocumentSection`,
  terms/`hideChrome` wiring) — grep for `pageView` and `hideChrome` across
  `components/` after.
- `use-paginated-preview.ts` stays (the preview consumes it).

### T4 — Tests

- DELETE (architecture removed by decision): `tests/unit/estimate/
  derive-page-offsets.test.ts`, `paginated-preview-canvas.test.tsx`,
  `paginated-editing-preserved.test.tsx`, `document-page-view.test.tsx`.
- REWRITE `tests/unit/estimate/paginated-view-engine-parity.test.tsx`: render
  `PaginatedPreview` with a fixture → asserts exactly `pages.length` sheets,
  continuation column-header only on `continuesTable` pages, "Page N of M"
  captions.
- ADD `tests/unit/estimate/paginated-preview.test.tsx`: block resolution
  (item rows land on the right sheets per `PageAssignment`), read-only (no
  `input`/`textarea`/`button` editing affordances inside sheets), light-token
  pinning present on sheet roots, null-pages skeleton state.
- KEEP: all `tests/unit/pagination/**` (engine untouched), `tests/unit/pdf/**`
  (untouched), `share-webview-pagination-boundary.test.ts` (preview is
  workspace-side; boundary must still hold).
- `use-paginated-preview.test.ts` stays (hook unchanged).

## Verification gates (every executor runs before finishing)

```
npx tsc -p tsconfig.json --noEmit
npx vitest run tests/unit
```

CI parity: `.github/workflows/test.yml` runs typecheck + `vitest run
tests/unit tests/eval` — eval suite is unaffected but must not be broken.

## Guardrails

- DO NOT touch `lib/estimate/pagination/**`, `lib/pdf/**`, `components/pdf/**`,
  `app/estimate/[token]/**`, `components/share/**`.
- DO NOT reintroduce CSS `zoom`, marginTop injection, or `pointer-events-none`
  content layering.
- No secrets in any file (repo-wide rule, see CLAUDE.md).
- Branch: `claude/paginated-budgets-screen-imc3kd` only.
