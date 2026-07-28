// lib/estimate/pagination/page-constraints.ts
//
// Phase 185 Plan 01 (PGBRK-01/04) — the ONE shared function that derives
// PageConstraints for BOTH the PDF renderer (lib/pdf/render-estimate-pdf.ts)
// and its own test fixture helper (tests/unit/pdf/_pages-for-fixture.ts),
// and (starting Plan 185-03) the web paginated preview. Extracted verbatim,
// byte-identical, from the formula those two call sites duplicated
// independently — see 185-RESEARCH.md's "constraints-parity finding": a
// second, independently-derived margin (e.g. a "web-specific" safety margin)
// would silently diverge from the PDF near page-capacity boundaries. This
// function is the single guard against that failure mode.
//
// PdfHeaderCompany is imported type-only (erased at compile time) — safe for
// client bundles even though the path lives under components/pdf/ (see
// 185-RESEARCH.md Open Question 3).
import type { PdfHeaderCompany } from '@/components/pdf/shared/pdf-header'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import { ESTIMATE_DESIGN_TOKENS, ESTIMATE_PAGE_GEOMETRY, LINE_HEIGHT, LETTER_HEIGHT_PT } from '@/lib/estimate/document/tokens'
import {
  measureHeaderHeightPt,
  CONTINUATION_TABLE_HEADER_HEIGHT_PT,
  PDF_RENDER_SAFETY_MARGIN_PT,
} from '@/lib/pdf/measure-header-height'
import { SAFETY_MARGIN_LINES } from '@/lib/estimate/pagination/measure/safety-margin'
import type { PageConstraints } from './types'

/**
 * Computes PageConstraints (contentHeightPt/continuationTableHeaderHeightPt/
 * safetyMarginPt) for a given company + templateId — a pure relocation of
 * the formula that used to be hand-copied at BOTH render-estimate-pdf.ts and
 * _pages-for-fixture.ts. Not a single number changed by this extraction.
 */
export function computeEstimatePageConstraints(
  company: PdfHeaderCompany,
  templateId: EstimateTemplateId
): PageConstraints {
  const geometry = ESTIMATE_PAGE_GEOMETRY[templateId]
  const headerHeightPt = measureHeaderHeightPt(company, templateId)
  const fontFamily = ESTIMATE_DESIGN_TOKENS[templateId].fontFamily
  const safetyMarginPt =
    SAFETY_MARGIN_LINES * (geometry.tableCellFontSizePt * LINE_HEIGHT[fontFamily]) + PDF_RENDER_SAFETY_MARGIN_PT
  return {
    contentHeightPt: LETTER_HEIGHT_PT - geometry.topPaddingPt - geometry.bottomPaddingPt - headerHeightPt,
    continuationTableHeaderHeightPt: CONTINUATION_TABLE_HEADER_HEIGHT_PT[templateId],
    safetyMarginPt,
  }
}
