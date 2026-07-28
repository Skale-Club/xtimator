// lib/estimate/document/tokens.ts
//
// ENGINE-02 — LETTER page geometry defined ONCE. react-pdf's <Page
// size="LETTER"> resolves 612x792pt (72dpi) internally; the webview's
// print-preview (estimate-document.tsx pageView, estimate-editor.tsx page
// mode) approximates the same page at 96dpi CSS px. This is the ONE place
// both numbers are derived from — no second hand-copied literal is allowed
// anywhere else (tests/unit/estimate/pt-px-conversion-source.test.ts
// enforces this via static grep).
export const PT_PER_PX = 72 / 96
export const PX_PER_PT = 96 / 72
export const LETTER_WIDTH_PT = 612
export const LETTER_HEIGHT_PT = 792
export const LETTER_WIDTH_PX = LETTER_WIDTH_PT * PX_PER_PT // 816
export const LETTER_HEIGHT_PX = LETTER_HEIGHT_PT * PX_PER_PT // 1056

// ENGINE-03 — per-template design tokens. Plain string/numeric values ONLY —
// never a StyleSheet or Tailwind-class object (Pattern 1: DOM and react-pdf
// are not interchangeable interpreters of a shared style object). Scoped
// this phase to the font-family pair, the one StyleSheet value cleanly
// shared-by-template-identity across both PDF renderers today.
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'

export interface EstimateDesignTokens {
  fontFamily: string
  fontFamilyBold: string
  /** Correction 1 (183-RESEARCH.md) — Classic gives its title banner and
   *  section headers a solid backgroundColor: brandColor fill; Modern uses
   *  a hairline/accent-only treatment with NO fill, by design. Static per
   *  template — consumed by components/pdf/shared/pdf-section-block.tsx
   *  and the title-banner component (Plan 183-04) instead of each call
   *  site re-deciding which template it is. */
  solidHeaderFill: boolean
}

export const ESTIMATE_DESIGN_TOKENS: Record<EstimateTemplateId, EstimateDesignTokens> = {
  classic: { fontFamily: 'Inter', fontFamilyBold: 'Inter-Bold', solidHeaderFill: true },
  modern: { fontFamily: 'Lora', fontFamilyBold: 'Lora-Bold', solidHeaderFill: false },
}

// Phase 184 Plan 01 (PGBRK-05) — font-metrics-derived line-height multiplier,
// keyed by the registered font family name (matches
// ESTIMATE_DESIGN_TOKENS[*].fontFamily/fontFamilyBold above, and
// lib/pdf/register-fonts.ts's Font.register family names). Derived via
// `(ascent - descent + lineGap) / unitsPerEm` per font, replicating
// @react-pdf/pdfkit's own internal lineHeight() formula
// (node_modules/@react-pdf/pdfkit/lib/pdfkit.js:37651-37657) — see
// .planning/phases/184-consolidated-pagination-engine/184-DRIFT-REPORT.md /
// 184-01-PLAN.md for the source computation against the real vendored TTFs.
// Used ONLY for tableCellText/sectionTitle (the 2 measurement-critical
// styles with NO prior explicit lineHeight) and their measurement recipes
// (Plan 184-03) — every OTHER measured field (summary, terms-card,
// info-grid, prepared-by) uses ESTIMATE_PAGE_GEOMETRY[template]
// .proseLineHeightMultiplier below, which mirrors termsText/infoValue's
// OWN already-explicit lineHeight (1.5 Classic / 1.6 Modern).
export const LINE_HEIGHT: Record<string, number> = {
  Inter: 1.21,
  'Inter-Bold': 1.21,
  Lora: 1.28,
  'Lora-Bold': 1.28,
}

/** Phase 184 Plan 01 (ENGINE-02/PGBRK-05) — per-template page geometry, read
 * directly from the live estimate-pdf.tsx/estimate-pdf-modern.tsx
 * StyleSheets. The ONE source every later pagination plan reads instead of
 * re-deriving these numbers per-file. */
export interface EstimatePageGeometry {
  contentWidthPt: number
  topPaddingPt: number
  bottomPaddingPt: number
  colDescriptionWidthPt: number
  tableCellFontSizePt: number
  sectionTitleFontSizePt: number
  termsTextFontSizePt: number
  summaryFontSizePt: number
  /** termsText/infoValue's OWN already-explicit lineHeight (1.5 Classic,
   * 1.6 Modern) — used for every measured field OTHER than
   * tableCellText/sectionTitle (which use LINE_HEIGHT above instead). */
  proseLineHeightMultiplier: number
}

export const ESTIMATE_PAGE_GEOMETRY: Record<EstimateTemplateId, EstimatePageGeometry> = {
  classic: {
    contentWidthPt: 532, // 612 - 40*2 (estimate-pdf.tsx styles.page paddingHorizontal)
    topPaddingPt: 40,
    bottomPaddingPt: 60,
    colDescriptionWidthPt: 532 * 0.4, // matches styles.colDescription: { width: '40%' }
    tableCellFontSizePt: 9,
    sectionTitleFontSizePt: 11,
    termsTextFontSizePt: 9,
    summaryFontSizePt: 9,
    proseLineHeightMultiplier: 1.5,
  },
  modern: {
    contentWidthPt: 508, // 612 - 52*2 (estimate-pdf-modern.tsx styles.page paddingHorizontal)
    topPaddingPt: 52,
    bottomPaddingPt: 68,
    colDescriptionWidthPt: 508 * 0.4, // matches styles.colDescription: { width: '40%' }
    tableCellFontSizePt: 9.5,
    sectionTitleFontSizePt: 11,
    termsTextFontSizePt: 9,
    summaryFontSizePt: 9,
    proseLineHeightMultiplier: 1.6,
  },
}

// Plan-checker blocker 1 (184-01-PLAN.md revision note) — relocated here
// from components/pdf/shared/pdf-photo-grid.tsx so the client-safe
// pagination core (lib/estimate/pagination/blocks-from-model.ts, Plan
// 184-03) never has to import from components/pdf/* — both that file AND
// pdf-photo-grid.tsx (Plan 184-04) import this same function instead of
// each re-deriving the 150pt-tile/8pt-gap chunking formula.
const PHOTO_TILE_WIDTH_PT = 150
const PHOTO_TILE_GAP_PT = 8
export function photosPerRow(contentWidthPt: number): number {
  return Math.floor(contentWidthPt / (PHOTO_TILE_WIDTH_PT + PHOTO_TILE_GAP_PT))
}
