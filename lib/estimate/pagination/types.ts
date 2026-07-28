// lib/estimate/pagination/types.ts
//
// Phase 184 Plan 02 (PGBRK-01/02) — the ONE type contract every other Plan
// 184 file (estimator/blocks-from-model in 184-03, PDF template restructure
// in 184-04, render wiring in 184-05) and Phase 185's future web preview
// build against. Pure data shapes — zero imports, zero framework
// dependency. See tests/unit/pagination/pagination-engine-boundary.test.ts
// for the static import-purity enforcement.

/** The 11-value block taxonomy (verbatim from 184-RESEARCH.md's "Block
 *  Inventory" table, live post-183 code, components/pdf/estimate-pdf.tsx).
 *  `header` (fixed chrome, order 1) and `footer` (fixed chrome, order 11)
 *  are deliberately EXCLUDED — both are `fixed`-position elements outside
 *  the flowing block list, never modeled as placeable blocks. */
export type PageBlockKind =
  | 'title-banner'
  | 'info-grid'
  | 'summary'
  | 'section-header'
  | 'item-row'
  | 'section-subtotal'
  | 'totals'
  | 'terms-card'
  | 'signature'
  | 'photo-row'
  | 'prepared-by'

export interface TextMeasurement {
  text: string
  /** Registered react-pdf font family name (e.g. 'Inter', 'Inter-Bold', 'Lora',
   *  'Lora-Bold' — matches lib/pdf/register-fonts.ts's Font.register calls
   *  exactly). The engine/rules never resolve this to a file path — only
   *  measure/estimator.ts (Plan 184-03) does. */
  styleKey: string
  fontSizePt: number
  lineHeightMultiplier: number
  maxWidthPt: number
}

/** Which document entity a block refers to — populated by Plan 184-03's
 *  blocksFromModel, consumed by Plan 184-05's renderer to look up exactly
 *  what to render for a given block (no more guessing "which of the 5 terms
 *  does this card mean" from the id string alone). */
export interface PageBlockRef {
  sectionId?: string
  itemId?: string
  /** Index of this item WITHIN ITS SECTION'S FILTERED (empty-description-
   *  removed) item list — used for zebra-striping continuation slices. */
  itemIndex?: number
  termsKey?: 'estimate' | 'payment' | 'timeline' | 'warranty' | 'notes'
  /** [startIndex, endIndex) into the full attachedPhotos array, for a photo-row block. */
  photoRange?: [number, number]
}

export interface PageBlock {
  kind: PageBlockKind
  /** Stable, deterministic id (never Math.random()/array-index-only). Naming
   *  convention (Plan 184-03 enforces): `${section.id}-header`,
   *  `${section.id}-rows-${item.id}`, `${section.id}-subtotal`. */
  id: string
  /** Height contribution that does NOT require text measurement (padding,
   *  borders, fixed-size images/rows). For text-bearing blocks this is
   *  "everything except the wrapped line height". */
  baseHeightPt: number
  /** Present only for blocks whose height depends on wrapped line count
   *  (item-row's description, terms-card's text, summary, title-banner,
   *  info-grid's client name/address). Absent for fixed-height blocks
   *  (section-subtotal, totals, signature, photo-row, prepared-by). */
  measurement?: TextMeasurement
  /** Set ONLY on 'section-header' blocks: the id of the item-row block that
   *  MUST land on the same page (the section's first row). */
  keepWithNextId?: string
  /** Set ONLY on 'section-subtotal' blocks: the id of the item-row block
   *  that MUST land on the same page (the section's last row). When a
   *  section has exactly 1 item, this id EQUALS the id the section-header's
   *  keepWithNextId points at — the engine must then treat header+row+
   *  subtotal as ONE maximal 3-block chain (see engine algorithm below). */
  keepWithPreviousId?: string
  /** true = this block can never be split by the engine; if it doesn't fit
   *  in the remaining space of the current page, the ENTIRE block (or its
   *  whole keep-together chain) moves to a fresh page. True for every kind
   *  except (rarely-wrapping) chrome. */
  atomic: boolean
  /** true for EXACTLY 'title-banner' | 'info-grid' | 'summary' — the engine
   *  forces these onto pageIndex 0 only, in input order, regardless of
   *  remaining space, and their height IS charged against page 0's budget
   *  (they are not "free" — see engine algorithm). 'prepared-by' does NOT
   *  set this (it is an ordinary atomic flowing block). */
  page1Only?: boolean
  /** Which document entity this block refers to — see PageBlockRef. */
  ref?: PageBlockRef
}

export interface PageConstraints {
  /** Usable content height on EVERY page, points — pageHeightPt minus
   *  top/bottom padding minus the (data-dependent, per-render-computed)
   *  header height. The header repeats via `fixed` on every page, so it
   *  always consumes this budget, page 1 included. */
  contentHeightPt: number
  /** Extra height a page must reserve when its first placed chain begins with
   *  an 'item-row' continuing a section whose header was on an earlier page
   *  (i.e., PGBRK-03's repeated table header). 0 otherwise. This reservation
   *  MUST be persisted into the page's running heightUsed once accepted, not
   *  merely applied transiently to the first chain's fit-check. */
  continuationTableHeaderHeightPt: number
  /** FLAT reserve subtracted ONCE from every page's usable height (NOT
   *  added per-block/per-measured-field) — derived by the caller (Plan
   *  184-05) from Plan 184-01's SAFETY_MARGIN_LINES. See Plan 184-01's
   *  184-DRIFT-REPORT.md "Margin Application Semantics" section for why
   *  per-page (not per-block) was chosen. 0 is valid (no observed drift). */
  safetyMarginPt: number
}

export interface PageAssignment {
  pageIndex: number
  blocks: PageBlock[]
  /** true iff blocks[0].kind === 'item-row' (this page opens mid-section —
   *  the resolver must render the repeated items-table column header). */
  continuesTable: boolean
}
