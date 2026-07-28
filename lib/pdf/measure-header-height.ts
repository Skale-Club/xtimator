// lib/pdf/measure-header-height.ts
//
// Phase 184 Plan 05 (PGBRK-01/03/04) — data-dependent header-row height,
// computed PER RENDER from the exact live layout
// components/pdf/shared/pdf-header.tsx renders: a flex ROW with a LEFT
// column (company name always; ONE contact line joined by "  |  " only if
// any of phone/email/website is present; an ADDRESS block — 1 or 2 lines,
// see measureHeaderHeightPt's inline comment — only if formatAddress() is
// truthy) and a RIGHT column (langBadge always; +logo ONLY if logo_url is
// set, stacked below the badge with its own gap). A react-pdf flex row's
// rendered height is max(leftColumnHeight, rightColumnHeight) — NEVER the
// sum of both columns (Plan-checker warning 8) — so NO `headerLeft.gap`
// term is added here (the prior draft incorrectly summed it in).
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

  // Phase 185 pre-flight verification finding (2026-07-28, GAP 1): the
  // contact line is genuinely single-line by construction — phone/email/
  // website are joined with the literal separator "  |  " (no embedded
  // newline), see pdf-header.tsx's companyContact Text. The ADDRESS line is
  // NOT: lib/estimate/document/format.ts:30's formatAddress() joins the
  // street part and the city/state/zip part with '\n' when BOTH exist, and
  // pdf-header.tsx renders the whole (possibly 2-line) string in ONE <Text>
  // — so charging it as a flat single line under-measured the header by
  // exactly one prose line (13.5pt Classic / 14.4pt Modern) for any company
  // with a full US street + city/state/zip address. Derive the real line
  // count from the actual formatted string instead of assuming 1.
  const hasContactLine = !!(company.phone || company.email || company.website)
  const addressText = formatAddress(company)
  const addressLines = addressText ? addressText.split('\n').length : 0

  const leftColumnHeightPt =
    layout.companyNameFontSizePt * LINE_HEIGHT[layout.companyNameFontFamilyBold] +
    layout.companyNameMarginBottomPt +
    (hasContactLine ? layout.contactFontSizePt * prose : 0) +
    addressLines * layout.contactFontSizePt * prose

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

/**
 * Phase 184 Plan 05 (PGBRK-01/03/04) — an ADDITIONAL flat per-page pt
 * reserve, empirically calibrated against the REAL `@react-pdf/renderer`
 * (Yoga layout + `@react-pdf/pdfkit`) rendering pipeline — distinct from
 * `SAFETY_MARGIN_LINES` (Plan 184-01), which was derived from a
 * Chromium-DOM-vs-fontkit spike for the FUTURE web preview (Phase 185), not
 * from this PDF renderer's own layout engine.
 *
 * Root cause: `blocksFromModel()`'s per-block height formulas (Plan 184-03)
 * are simple additive box-model sums (padding + border + measured text);
 * per-line text measurement itself was verified byte-identical against
 * `@react-pdf/pdfkit`'s own `heightOfString()` (zero drift, multiple
 * fixtures/fonts/widths — Task 3's own diagnostic). Two concrete formula
 * bugs were found and fixed in `blocks-from-model.ts` during the Phase 185
 * pre-flight verification pass (2026-07-28, GAP 1b): `totalsRowHeightPt` and
 * `grandTotalHeightPt` both omitted real border/margin StyleSheet terms, and
 * Modern's first-deposit-row `marginTop: 16` (`pdf-totals-block.tsx`) was
 * uncharged entirely — see `blocks-from-model.ts`'s `TemplateLiterals`
 * comments for the exact corrections. The REMAINING residual is not
 * attributable to any single further formula bug: isolated fixture testing
 * showed a summary block and a deposit-bearing totals block each
 * independently fit their own page's budget, but COMBINED land almost
 * exactly on a page-capacity boundary — an inherent consequence of additive
 * height estimation vs. Yoga's real flexbox layout at a discrete page-break
 * threshold, which per-field accuracy fixes alone cannot fully eliminate
 * (there will always exist SOME content combination near the boundary).
 *
 * Calibrated via `scripts/pagination-render-calibration.ts`, run AFTER the
 * GAP-1 header-address-line-count fix (`measureHeaderHeightPt`) and the
 * GAP-1b totals-formula fixes above (2026-07-28): comparing
 * `computePageBreaks()`'s page count against the REAL generated PDF's
 * `/Type /Page` object count across a single-section 1..60-item sweep, a
 * 4-section/40-item multi-page fixture, the content-rich baseline fixture
 * (summary + 2 terms cards + discount/tax/deposit), and an isolated
 * "summary + deposit only" worst-case-boundary fixture — for BOTH
 * templates — the smallest zero-mismatch value was **78pt** (76pt still had
 * 1 mismatch: Classic's "summary + deposit only" fixture, engine=1
 * page/real=2 pages). **90pt** is used here (78pt + 12pt buffer) for
 * headroom against real-world content this exact sweep didn't cover. Re-run
 * that script and update this comment + the constant if
 * `blocks-from-model.ts` / `measure-header-height.ts` / either template's
 * StyleSheet ever changes.
 */
export const PDF_RENDER_SAFETY_MARGIN_PT = 90
