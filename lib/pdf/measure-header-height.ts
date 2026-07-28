// lib/pdf/measure-header-height.ts
//
// Phase 184 Plan 05 (PGBRK-01/03/04) — data-dependent header-row height,
// computed PER RENDER from the exact live layout
// components/pdf/shared/pdf-header.tsx renders: a flex ROW with a LEFT
// column (company name always; ONE contact line joined by "  |  " only if
// any of phone/email/website is present; ONE address line only if
// formatAddress() is truthy) and a RIGHT column (langBadge always; +logo
// ONLY if logo_url is set, stacked below the badge with its own gap). A
// react-pdf flex row's rendered height is max(leftColumnHeight,
// rightColumnHeight) — NEVER the sum of both columns (Plan-checker warning
// 8) — so NO `headerLeft.gap` term is added here (the prior draft
// incorrectly summed it in).
//
// Consumed by lib/pdf/render-estimate-pdf.ts to derive
// PageConstraints.contentHeightPt (the header repeats via `fixed` on every
// page, so its height is subtracted from every page's usable content height,
// page 1 included) — see lib/estimate/pagination/types.ts's doc comment.
import { LINE_HEIGHT, ESTIMATE_PAGE_GEOMETRY } from '@/lib/estimate/document/tokens'
import { formatAddress } from '@/lib/estimate/document/format'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import type { PdfHeaderCompany } from '@/components/pdf/shared/pdf-header'

/** Per-template header layout constants — hand-cited to the exact live
 *  StyleSheet key in each template file. These are each template's OWN
 *  private header StyleSheet values, NOT part of the shared
 *  lib/estimate/document/tokens.ts module. */
interface HeaderLayoutConstants {
  /** styles.companyName.fontSize */
  companyNameFontSizePt: number
  /** styles.companyName.fontFamily (the Bold variant) — keys LINE_HEIGHT. */
  companyNameFontFamilyBold: string
  /** styles.companyName.marginBottom */
  companyNameMarginBottomPt: number
  /** styles.companyContact.fontSize — shared by both the contact line and the address line (both use styles.companyContact). */
  contactFontSizePt: number
  /** styles.langBadge.fontSize */
  langBadgeFontSizePt: number
  /** styles.headerRight.gap — charged ONLY when a logo is present (stacks langBadge above the logo). */
  headerRightGapPt: number
  /** styles.logo.height */
  logoHeightPt: number
  /** styles.header.paddingBottom */
  headerPaddingBottomPt: number
  /** styles.header.marginBottom */
  headerMarginBottomPt: number
  /** styles.header.borderBottomWidth */
  headerBorderBottomWidthPt: number
}

const HEADER_LAYOUT: Record<EstimateTemplateId, HeaderLayoutConstants> = {
  // Cited to components/pdf/estimate-pdf.tsx's StyleSheet.
  classic: {
    companyNameFontSizePt: 18, // styles.companyName.fontSize
    companyNameFontFamilyBold: 'Inter-Bold', // styles.companyName.fontFamily
    companyNameMarginBottomPt: 4, // styles.companyName.marginBottom
    contactFontSizePt: 9, // styles.companyContact.fontSize
    langBadgeFontSizePt: 9, // styles.langBadge.fontSize
    headerRightGapPt: 6, // styles.headerRight.gap
    logoHeightPt: 72, // styles.logo.height
    headerPaddingBottomPt: 16, // styles.header.paddingBottom
    headerMarginBottomPt: 24, // styles.header.marginBottom
    headerBorderBottomWidthPt: 2, // styles.header.borderBottomWidth
  },
  // Cited to components/pdf/estimate-pdf-modern.tsx's StyleSheet.
  modern: {
    companyNameFontSizePt: 15, // styles.companyName.fontSize
    companyNameFontFamilyBold: 'Lora-Bold', // styles.companyName.fontFamily
    companyNameMarginBottomPt: 5, // styles.companyName.marginBottom
    contactFontSizePt: 9, // styles.companyContact.fontSize
    langBadgeFontSizePt: 8.5, // styles.langBadge.fontSize
    headerRightGapPt: 8, // styles.headerRight.gap
    logoHeightPt: 64, // styles.logo.height
    headerPaddingBottomPt: 20, // styles.header.paddingBottom
    headerMarginBottomPt: 32, // styles.header.marginBottom
    headerBorderBottomWidthPt: 0.75, // styles.header.borderBottomWidth
  },
}

/**
 * Data-dependent header-row height in pt, computed per render (never a
 * hardcoded literal) — see this file's top comment for the corrected
 * max(leftColumn, rightColumn) formula.
 */
export function measureHeaderHeightPt(company: PdfHeaderCompany, templateId: EstimateTemplateId): number {
  const layout = HEADER_LAYOUT[templateId]
  const prose = ESTIMATE_PAGE_GEOMETRY[templateId].proseLineHeightMultiplier

  const hasContactLine = !!(company.phone || company.email || company.website)
  const hasAddressLine = !!formatAddress(company)

  const leftColumnHeightPt =
    layout.companyNameFontSizePt * LINE_HEIGHT[layout.companyNameFontFamilyBold] +
    layout.companyNameMarginBottomPt +
    (hasContactLine ? layout.contactFontSizePt * prose : 0) +
    (hasAddressLine ? layout.contactFontSizePt * prose : 0)

  const rightColumnHeightPt =
    layout.langBadgeFontSizePt * prose + (company.logo_url ? layout.headerRightGapPt + layout.logoHeightPt : 0)

  const headerRowHeightPt = Math.max(leftColumnHeightPt, rightColumnHeightPt)

  return (
    headerRowHeightPt + layout.headerPaddingBottomPt + layout.headerMarginBottomPt + layout.headerBorderBottomWidthPt
  )
}

/**
 * Continuation-page items-table column-header row height in pt — feeds
 * PageConstraints.continuationTableHeaderHeightPt (the reservation charged
 * when a page's first placed chain begins with an 'item-row', i.e. PGBRK-03's
 * repeated table header). The 5 column labels (Description/Qty/Unit/Unit
 * Price/Total) are always short, static, single-line strings that never
 * wrap, so — mirroring lib/estimate/pagination/blocks-from-model.ts's own
 * `sectionSubtotalBaseHeightPt` treatment of other fixed, never-wrapping
 * label cells (padding contribution + fontSize as a single-line proxy, no
 * LINE_HEIGHT multiplier) — no fontkit measurement is needed here either.
 * Cited to components/pdf/shared/pdf-section-block.tsx's
 * PdfTableHeaderOnly, reading each template's OWN tableHeader/tableHeaderText
 * StyleSheet values (components/pdf/estimate-pdf.tsx / -modern.tsx).
 */
export const CONTINUATION_TABLE_HEADER_HEIGHT_PT: Record<EstimateTemplateId, number> = {
  // tableHeader.paddingVertical(6)×2 + borderBottomWidth(1) + tableHeaderText.fontSize(9)
  classic: 6 * 2 + 1 + 9,
  // tableHeader.paddingVertical(8)×2 + borderBottomWidth(0.5) + tableHeaderText.fontSize(8.5)
  modern: 8 * 2 + 0.5 + 8.5,
}
