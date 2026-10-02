// lib/pdf/measure-header-height.ts
//
// Phase 184 Plan 05 (PGBRK-01/03/04) — data-dependent header-row height,
// computed PER RENDER from the exact live layout
// components/pdf/shared/pdf-header.tsx renders: a flex ROW with a LEFT
// column (company name always; ONE contact line joined by "  |  " only if
// any of phone/email/website is present; an ADDRESS block — 1 or 2 lines,
// see measureHeaderHeightPt's inline comment — only if formatAddress() is
// truthy) and a RIGHT column (langBadge ONLY for a non-English document —
// showsLanguageBadge(language); +logo ONLY if willPdfRenderLogo(logo_url) —
// PDF-LOGO-01, NOT mere truthiness — stacked below the badge, with its own
// gap charged only when the badge is also drawn). A react-pdf flex row's
// rendered height is max(leftColumnHeight, rightColumnHeight) — NEVER the
// sum of both columns (Plan-checker warning 8) — so NO `headerLeft.gap`
// term is added here (the prior draft incorrectly summed it in).
//
// Consumed (via lib/estimate/pagination/page-constraints.ts) to derive
// PageConstraints.contentHeightPt — PAGE 1 only, which draws this full header.
// Pages 2..N draw the one-line COMPACT header instead
// (components/pdf/shared/pdf-compact-header.tsx), measured by
// measureCompactHeaderHeightPt below and feeding
// PageConstraints.continuationContentHeightPt — see
// lib/estimate/pagination/types.ts's doc comments.
import { LINE_HEIGHT, ESTIMATE_PAGE_GEOMETRY } from '@/lib/estimate/document/tokens'
import { formatAddress } from '@/lib/estimate/document/format'
import { willPdfRenderLogo } from '@/lib/pdf/pdf-image-support'
import { showsLanguageBadge } from '@/lib/pdf/language-badge'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
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
  /** styles.headerRight.gap — charged ONLY when BOTH the langBadge and a logo are drawn (the gap sits between them). */
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

/** Per-template COMPACT-header (pages 2+) layout constants — cited to each
 *  template's compact* StyleSheet keys. The compact header is a single row
 *  (name left, estimate # right), so its height is the taller of the two
 *  one-line Texts plus the row's padding/margin/rule. */
interface CompactHeaderLayoutConstants {
  /** styles.compactCompanyName.fontSize */
  nameFontSizePt: number
  /** styles.compactCompanyName.fontFamily — keys LINE_HEIGHT. */
  nameFontFamily: string
  /** styles.compactEstimateId.fontSize */
  idFontSizePt: number
  /** styles.compactEstimateId.fontFamily — keys LINE_HEIGHT. */
  idFontFamily: string
  /** styles.compactHeader.paddingBottom */
  paddingBottomPt: number
  /** styles.compactHeader.marginBottom */
  marginBottomPt: number
  /** styles.compactHeader.borderBottomWidth */
  borderBottomWidthPt: number
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

const COMPACT_HEADER_LAYOUT: Record<EstimateTemplateId, CompactHeaderLayoutConstants> = {
  // Cited to components/pdf/estimate-pdf.tsx's StyleSheet.
  classic: {
    nameFontSizePt: 11, // styles.compactCompanyName.fontSize
    nameFontFamily: 'Inter-Bold', // styles.compactCompanyName.fontFamily
    idFontSizePt: 9, // styles.compactEstimateId.fontSize
    idFontFamily: 'Inter', // styles.compactEstimateId.fontFamily
    paddingBottomPt: 6, // styles.compactHeader.paddingBottom
    marginBottomPt: 14, // styles.compactHeader.marginBottom
    borderBottomWidthPt: 1, // styles.compactHeader.borderBottomWidth
  },
  // Cited to components/pdf/estimate-pdf-modern.tsx's StyleSheet.
  modern: {
    nameFontSizePt: 11, // styles.compactCompanyName.fontSize
    nameFontFamily: 'Lora-Bold', // styles.compactCompanyName.fontFamily
    idFontSizePt: 8.5, // styles.compactEstimateId.fontSize
    idFontFamily: 'Lora', // styles.compactEstimateId.fontFamily
    paddingBottomPt: 8, // styles.compactHeader.paddingBottom
    marginBottomPt: 18, // styles.compactHeader.marginBottom
    borderBottomWidthPt: 0.75, // styles.compactHeader.borderBottomWidth
  },
}

/**
 * Height in pt of the COMPACT header drawn on pages 2..N
 * (components/pdf/shared/pdf-compact-header.tsx): one row holding the company
 * name (left) and the estimate identifier (right), both forced to a SINGLE
 * line (`maxLines={1}` on the name; the identifier is a short static string),
 * so — unlike the full header — it is data-independent: no fontkit
 * measurement, no company/logo/language inputs. Neither Text sets an explicit
 * lineHeight, so each line is fontSize × LINE_HEIGHT[family] (the same
 * natural-line-height token the full header charges companyName with); the
 * row is as tall as the taller of the two (alignItems: 'center'), then
 * paddingBottom + marginBottom + the rule. Never includes the language chip.
 */
export function measureCompactHeaderHeightPt(templateId: EstimateTemplateId): number {
  const layout = COMPACT_HEADER_LAYOUT[templateId]
  const nameLinePt = layout.nameFontSizePt * LINE_HEIGHT[layout.nameFontFamily]
  const idLinePt = layout.idFontSizePt * LINE_HEIGHT[layout.idFontFamily]
  return Math.max(nameLinePt, idLinePt) + layout.paddingBottomPt + layout.marginBottomPt + layout.borderBottomWidthPt
}

/**
 * Data-dependent header-row height in pt of the FULL (page 1) header, computed
 * per render (never a hardcoded literal) — see this file's top comment for the
 * corrected max(leftColumn, rightColumn) formula. `language` is REQUIRED (no
 * default) so no caller can silently measure a language chip the renderer
 * does not draw, or vice versa.
 */
export function measureHeaderHeightPt(
  company: PdfHeaderCompany,
  templateId: EstimateTemplateId,
  language: EstimateLanguage
): number {
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

  // PDF-LOGO-01: charge the logo block only when a logo will ACTUALLY BE DRAWN.
  // This previously keyed on `company.logo_url` being a non-empty string, which
  // is a different question: every logo writer stores WebP and @react-pdf/image
  // decodes only jpg/jpeg/png, so the header reserved 64-72pt + the gap for a
  // logo that never appeared. `willPdfRenderLogo` is the SAME predicate
  // components/pdf/shared/pdf-header.tsx gates its <Image> on — measurement and
  // render now answer one question, not two.
  const drawsLogo = willPdfRenderLogo(company.logo_url)
  // The language chip is drawn only for non-English documents
  // (showsLanguageBadge — the SAME predicate pdf-header.tsx gates it on). When
  // it is hidden neither its line nor the headerRight gap (which only exists
  // BETWEEN the chip and the logo) is charged.
  const drawsBadge = showsLanguageBadge(language)
  const rightColumnHeightPt =
    (drawsBadge ? layout.langBadgeFontSizePt * prose : 0) +
    (drawsLogo ? (drawsBadge ? layout.headerRightGapPt : 0) + layout.logoHeightPt : 0)

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
 * Calibrated via `scripts/pagination-render-calibration.ts`: comparing
 * `computePageBreaks()`'s page count against the REAL generated PDF's
 * `/Type /Page` object count across a single-section 1..60-item sweep, a
 * 4-section/40-item multi-page fixture (>= 3 pages — the script asserts it, so
 * the CONTINUATION budget / compact header is genuinely exercised), the
 * content-rich baseline fixture (summary + 2 terms cards + discount/tax/
 * deposit), and an isolated "summary + deposit only" worst-case-boundary
 * fixture — for BOTH templates.
 *
 * Re-run 2026-10-02, after pages 2+ switched to the compact header
 * (`measureCompactHeaderHeightPt` / `PageConstraints.continuationContentHeightPt`),
 * the language chip became non-English-only, hyphenation was disabled and the
 * line packer began breaking only at spaces: the coarse sweep (0,10,...,70,78,80,
 * 90,100) gave 8,7,3,2,2,2,1,1,0,0,0,0 mismatches (marginPt 70 -> 1, 78 -> 0);
 * the 71..77 refinement gave mismatches=1 for 71..76 and mismatches=0 at 77
 * (verbatim: "marginPt=76 mismatches=1 / classic summary + deposit only
 * (worst-case boundary combo): engine=1 real=2", then "marginPt=77
 * mismatches=0"). The smallest zero-mismatch value is therefore **77pt** (the
 * single failing fixture at 76 is the page-1-only "summary + deposit"
 * boundary combo; every multi-page fixture — the continuation-page-driven ones —
 * is already clean from 60pt). **89pt** is used here (77pt + 12pt buffer) for
 * headroom against real-world content this exact sweep didn't cover. (The
 * previous run, 2026-07-28, had a coarser grid and reported 78pt as smallest
 * with 76pt failing.) Re-run that script (`CAL_CANDIDATES=` narrows the sweep) and
 * update this comment + the constant if `blocks-from-model.ts` /
 * `measure-header-height.ts` / either template's StyleSheet ever changes.
 */
export const PDF_RENDER_SAFETY_MARGIN_PT = 89
