# Quick 260806-pgv — Paginated view redesign: read-only preview on real page containers

## Completed

- **T1** — New `components/workspace/estimate/paginated-preview.tsx`: a
  read-only `PaginatedPreview` component that consumes the same
  `PageAssignment[]` the PDF pipeline consumes (`lib/estimate/pagination/**`,
  untouched) and resolves each `PageBlock.ref` against the document model
  directly to DOM, mirroring `components/pdf/estimate-pdf.tsx`'s
  block-dispatch pattern. Real per-page `<div>` sheets (white paper,
  `LETTER_WIDTH_PX` wide, `minHeight: LETTER_HEIGHT_PX`, light tokens pinned
  per sheet), fit-width/manual zoom via `transform: scale()` (never CSS
  `zoom`), thumbnail rail with `IntersectionObserver` active-page tracking,
  "Page N of M" caption. Zero inputs, zero dnd, zero dispatch.
- **T2** — `components/workspace/estimate/estimate-editor.tsx`: `viewMode ===
  'page'` renders `<PaginatedPreview>`; removed the old CSS `zoom` style, the
  height/width auto-fit effect, and the retired zoom-pill JSX (zoom now lives
  inside `PaginatedPreview`). Forced full-width below `lg` via a
  `matchMedia('(min-width: 1024px)')` effect. `project-header.tsx` sticky
  z-index raised so it's never covered by document content. Editor's document
  region wrapped `isolate` so document-internal z-indexes can't compete with
  app chrome. `usePaginatedPreview` wiring unchanged.
- **T3** — Deleted `components/workspace/estimate/paginated-document-overlay.tsx`.
  `estimate-document.tsx`'s `pageView` prop and every conditional branch
  removed, keeping only the full-width (editable) behavior everywhere
  (`pageView`/`hideChrome` threading removed from `SortableDocumentItemRow`,
  `DocumentSectionBlock`, `SortableDocumentSection`, terms wiring, etc.).
- **T4** — Deleted the overlay-era tests (`derive-page-offsets.test.ts`,
  `paginated-preview-canvas.test.tsx`, `paginated-editing-preserved.test.tsx`,
  `document-page-view.test.tsx`). Rewrote
  `tests/unit/estimate/paginated-view-engine-parity.test.tsx` to render
  `PaginatedPreview` against a real `blocksFromModel()->computePageBreaks()`
  pipeline output (`tests/unit/pdf/_pages-for-fixture.ts`), asserting sheet
  count, continuation-header placement, and page captions per template. Added
  `tests/unit/estimate/paginated-preview.test.tsx`: block resolution, read-only
  affordance sweep, light-token pinning, null-pages skeleton, zebra-striping
  parity across a page boundary. `share-webview-pagination-boundary.test.ts`
  and `use-paginated-preview.test.ts` kept as-is (engine/hook untouched).

## Fix round (post-validation)

Adversarial validation flagged 8 issues; all fixed in
`components/workspace/estimate/paginated-preview.tsx` unless noted:

1. **Fit-width zoom never ran** — the fit-measure effect's dependency array
   was `[]`, so it fired once on mount while `measureRef`'s element didn't
   exist yet (still under the `pages === null` skeleton branch) and never
   re-ran. Changed deps to `[pages]`, matching the sibling
   `naturalHeightPx`/thumbnail-rail effects, so it re-registers once the real
   tree mounts.
2. **Continuation-page column misalignment** — a `continuesTable` page used
   to render its repeated column header as a separate sibling `<table>` from
   the rows table (which had no `<thead>` and no width hints), so
   `table-layout: auto` sized each independently and columns drifted.
   Every item table (headed or not, new-section or continuation) now shares
   one `ItemTableColgroup` (40/12/13/17/18%) under `table-fixed`, and the
   continuation page's repeated header now renders as the `<thead>` of the
   continuation slice's OWN first table (`data-testid="continuation-header"`
   stays on that `<thead>`, still exactly one per `continuesTable` page).
3. **Removed the dead `templateId` prop** — `PaginatedPreviewProps` declared
   it but the component never read it (visuals mirror `EstimateDocument`'s
   classic look for both templates, same as the old overlay). Dropped from
   the interface, from the `<PaginatedPreview>` call site in
   `estimate-editor.tsx` (the hook's own `templateId` wiring is untouched),
   and from the two test files that passed it as a JSX prop
   (`paginated-view-engine-parity.test.tsx`,
   `paginated-preview.test.tsx`) — their own `templateId`-typed fixture
   helpers, which still drive the real engine per template, were left as-is.
4. **Static guards retargeted** —
   `tests/unit/estimate/pt-px-conversion-source.test.ts`: added
   `paginated-preview.tsx` to `CLEAN_SOURCES` (it only imports
   `LETTER_WIDTH_PX`/`LETTER_HEIGHT_PX` from tokens.ts — no bare
   612/792/816/1056 literals, including in comments).
   `tests/unit/estimate/share-webview-pagination-boundary.test.ts`: added a
   `paginated-preview` forbidden-import pattern to both the static and
   dynamic pattern lists (kept the old `paginated-document-overlay` pattern
   too, now dead but harmless).
5. **Fit formula now matches real layout** — the fit computation's
   `(LETTER_WIDTH_PX + 32)` divisor used to be a relic of the deleted
   overlay's `px-4` canvas with no matching padding in the new component.
   Added real `px-4` (16px each side) to the preview's sheet column
   (`measureRef`'s own element), kept the `+ 32` compensation, and tied both
   together with a comment on the effect.
6. **Photo-row grid + other viewport-conditional classes** — the engine
   chunks `photoRange` at `photosPerRow` (always 3 for both templates'
   `contentWidthPt`, `lib/estimate/document/tokens.ts`), but the preview
   rendered chunks in `grid-cols-2 sm:grid-cols-3 lg:grid-cols-4`, leaving a
   dead cell at `lg+` (the only viewport paginated mode renders at). Changed
   to a fixed `grid-cols-3`. Swept the rest of the file for the same class of
   bug — sheets are always `LETTER_WIDTH_PX` regardless of browser viewport,
   so every `sm:`/`lg:` responsive class inside a sheet (info-grid columns,
   `sm:px-10` paddings, `sm:py-*`, the title-banner heading size, the company
   header's `flex-col sm:flex-row` stack) was collapsed to its unconditional
   lg-resolved value. Left the thumbnail rail's `hidden lg:flex` alone — it's
   a legitimate show/hide of a nav element outside the sheet, not
   sheet-internal sizing.
7. **Row hairlines** — replaced `last:border-0` on item rows with an
   unconditional bottom border; the PDF draws `borderBottom` on every row,
   and the per-slice `last:` rule dropped the hairline at mid-section page
   breaks (a continuation slice's last row on a page looked different from
   the PDF's).
8. This file.

## Verification

- `npx tsc -p tsconfig.json --noEmit` — clean.
- `npx vitest run tests/unit` — pass.
- `npx vitest run tests/eval` — pass.

## Accepted deviations

- **Sheet height is approximate, not exact PDF pixel geometry.** Sheets use
  `minHeight: LETTER_HEIGHT_PX` and can grow past the letter aspect ratio
  (web fonts/px metrics vs. the PDF's pt metrics don't line up exactly). The
  preview's contract is "which blocks land on which page" (matching the PDF's
  `PageAssignment[]` exactly), not pixel-identical page geometry.
- **Compact header on continuation pages.** Pages 2+ show a compact
  `CompactHeader` (company name + rule) instead of the PDF's full fixed
  header repeated on every page — a deliberate simplification for the web
  preview, not a parity bug.
- **Template-aware preview styling deferred.** The preview mirrors the
  classic-look web document (`EstimateDocument`'s read-only rendering) for
  BOTH `classic` and `modern` templates, same as the overlay it replaces.
  Modern-template-specific preview visuals are out of scope for this quick.
- **`--destructive` not pinned on sheets.** The `LIGHT_PIN_STYLE` CSS-variable
  set intentionally omits `--destructive`, matching `EstimateDocument`'s own
  pinned-light style — not a gap introduced by this component.
- **`scripts/pagination-binding-check.ts` left in place.** It documents/checks
  bindings for the overlay architecture this quick superseded. Removing or
  rewriting it is a separate cleanup decision, out of scope here.
