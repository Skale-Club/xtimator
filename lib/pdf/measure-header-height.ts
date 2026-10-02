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
import { LINE_HEIGHT, ESTIMATE_PAGE_GEOMETRY, ESTIMATE_DESIGN_TOKENS } from '@/lib/estimate/document/tokens'
import { formatAddress } from '@/lib/estimate/document/format'
import { willPdfRenderLogo } from '@/lib/pdf/pdf-image-support'
import { showsLanguageBadge } from '@/lib/pdf/language-badge'
import { formatPhoneForDisplay } from '@/lib/phone/format'
import type { MeasurementProvider } from '@/lib/estimate/pagination/measure/types'
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
  /** styles.logo.width — the right column's width when a logo is drawn (it bounds the left column). */
  logoWidthPt: number
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

/** Over-estimate of the language chip's width ("EN"/"PT"/"ES" at 8.5-9pt is ~14pt). */
const BADGE_WIDTH_UPPER_BOUND_PT = 30

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
    logoWidthPt: 72, // styles.logo.width
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
    logoWidthPt: 64, // styles.logo.width
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
  language: EstimateLanguage,
  provider: MeasurementProvider
): number {
  const layout = HEADER_LAYOUT[templateId]
  const prose = ESTIMATE_PAGE_GEOMETRY[templateId].proseLineHeightMultiplier

  const contactParts = [
    company.phone ? formatPhoneForDisplay(company.phone) : null,
    company.email,
    company.website,
  ].filter(Boolean) as string[]
  const addressText = formatAddress(company)
  const addressLineTexts = addressText ? addressText.split('\n') : []

  // The right column (language chip stacked over the logo) is as wide as its widest child
  // (alignItems flex-end), and the space-between row leaves the left column the REST of the
  // content width — which is where the company name / contact / address WRAP. A long company
  // name ("BrightPath Residential Remodeling & Custom Carpentry Services of Central Texas
  // LLC") wraps onto a 2nd line there; measuring it as one line under-charged the header and
  // overflowed page 1 (found by the randomized fuzz: every failure had an 82-char name).
  // The chip is a 2-letter 8.5-9pt Text; BADGE_WIDTH_UPPER_BOUND_PT over-estimates it so a
  // borderline name is measured as wrapping rather than not.
  const drawsLogo = willPdfRenderLogo(company.logo_url)
  const drawsBadge = showsLanguageBadge(language)
  const rightColumnWidthPt = drawsLogo ? layout.logoWidthPt : drawsBadge ? BADGE_WIDTH_UPPER_BOUND_PT : 0
  const leftColumnWidthPt = ESTIMATE_PAGE_GEOMETRY[templateId].contentWidthPt - rightColumnWidthPt
  const tokens = ESTIMATE_DESIGN_TOKENS[templateId]
  const wrapped = (text: string, family: string, fontSizePt: number) =>
    Math.max(1, provider.lineCount(text, family, fontSizePt, leftColumnWidthPt))

  // companyName / companyContact: name has no lineHeight (natural bold line); contact + address
  // share styles.companyContact (explicit lineHeight = the template's prose multiplier).
  const nameLines = wrapped(company.name ?? '', tokens.fontFamilyBold, layout.companyNameFontSizePt)
  const contactLines = contactParts.length > 0 ? wrapped(contactParts.join('  |  '), tokens.fontFamily, layout.contactFontSizePt) : 0
  const addressLines = addressLineTexts.reduce(
    (sum, line) => sum + wrapped(line, tokens.fontFamily, layout.contactFontSizePt),
    0
  )

  const leftColumnHeightPt =
    nameLines * layout.companyNameFontSizePt * LINE_HEIGHT[layout.companyNameFontFamilyBold] +
    layout.companyNameMarginBottomPt +
    (contactLines + addressLines) * layout.contactFontSizePt * prose

  // PDF-LOGO-01: charge the logo block only when a logo will ACTUALLY BE DRAWN.
  // This previously keyed on `company.logo_url` being a non-empty string, which
  // is a different question: every logo writer stores WebP and @react-pdf/image
  // decodes only jpg/jpeg/png, so the header reserved 64-72pt + the gap for a
  // logo that never appeared. `willPdfRenderLogo` is the SAME predicate
  // components/pdf/shared/pdf-header.tsx gates its <Image> on — measurement and
  // render now answer one question, not two.
  // The language chip is drawn only for non-English documents
  // (showsLanguageBadge — the SAME predicate pdf-header.tsx gates it on). When
  // it is hidden neither its line nor the headerRight gap (which only exists
  // BETWEEN the chip and the logo) is charged.
  const rightColumnHeightPt =
    (drawsBadge ? layout.langBadgeFontSizePt * prose : 0) +
    (drawsLogo ? (drawsBadge ? layout.headerRightGapPt : 0) + layout.logoHeightPt : 0)

  const headerRowHeightPt = Math.max(leftColumnHeightPt, rightColumnHeightPt)

  return (
    headerRowHeightPt + layout.headerPaddingBottomPt + layout.headerMarginBottomPt + layout.headerBorderBottomWidthPt
  )
}

/**
 * Continuation-page SECTION TITLE band height in pt: the one-line
 * "<Section title> (cont.)" header drawn above the repeated column header at the
 * top of a page that opens mid-section (components/pdf/shared/
 * pdf-section-block.tsx's PdfSectionHeader with `continuedLabel`). It is that
 * template's own sectionHeader style with `marginTop` forced to 0 (the compact
 * page header above already carries its marginBottom), so the height is the
 * band's padding + (Modern) its bottom rule + ONE title line. The title is
 * truncated to a single line in the renderer (maxLines 1 + ellipsis), so this
 * never grows with the title text — which is why it can be a constant and needs
 * no fontkit measurement. Title line = sectionTitle.fontSize x LINE_HEIGHT[bold
 * family] (sectionTitle sets lineHeight: LINE_HEIGHT[...] explicitly).
 */
export const CONTINUATION_SECTION_TITLE_HEIGHT_PT: Record<EstimateTemplateId, number> = {
  // sectionHeader.paddingVertical(8)×2 + sectionTitle.fontSize(11) × LINE_HEIGHT['Inter-Bold']
  classic:
    8 * 2 +
    ESTIMATE_PAGE_GEOMETRY.classic.sectionTitleFontSizePt * LINE_HEIGHT[ESTIMATE_DESIGN_TOKENS.classic.fontFamilyBold],
  // sectionHeader.paddingVertical(6)×2 + borderBottomWidth(1) + sectionTitle.fontSize(11) × LINE_HEIGHT['Lora-Bold']
  modern:
    6 * 2 +
    1 +
    ESTIMATE_PAGE_GEOMETRY.modern.sectionTitleFontSizePt * LINE_HEIGHT[ESTIMATE_DESIGN_TOKENS.modern.fontFamilyBold],
}

/**
 * Continuation-page items-table column-header row height in pt (ONLY the column
 * labels — see CONTINUATION_TABLE_HEADER_HEIGHT_PT below for the full reservation).
 * The 5 column labels (Description/Qty/Unit/Unit Price/Total) are always short,
 * static, single-line strings that never wrap, so one natural line (fontSize ×
 * LINE_HEIGHT[bold family], tableHeaderText sets no lineHeight) is charged and no
 * fontkit measurement is needed. (Until 2026-10-02 this charged the bare fontSize,
 * 1.9 / 2.4pt short of the real row.) Cited to components/pdf/shared/
 * pdf-section-block.tsx's PdfTableHeaderOnly, reading each template's OWN
 * tableHeader/tableHeaderText StyleSheet values (components/pdf/estimate-pdf.tsx
 * / -modern.tsx).
 */
const CONTINUATION_COLUMN_HEADER_HEIGHT_PT: Record<EstimateTemplateId, number> = {
  // tableHeader.paddingVertical(6)×2 + borderBottomWidth(1) + tableHeaderText.fontSize(9) × LINE_HEIGHT['Inter-Bold'] (= blocks-from-model.ts's classic tableHeaderHeightPt)
  classic: 6 * 2 + 1 + 9 * LINE_HEIGHT['Inter-Bold'],
  // tableHeader.paddingVertical(8)×2 + borderBottomWidth(0.5) + tableHeaderText.fontSize(8.5) × LINE_HEIGHT['Lora-Bold'] (= blocks-from-model.ts's modern tableHeaderHeightPt)
  modern: 8 * 2 + 0.5 + 8.5 * LINE_HEIGHT['Lora-Bold'],
}

/**
 * Continuation-page repeated-header reservation in pt — feeds
 * PageConstraints.continuationTableHeaderHeightPt (the reservation charged when a
 * page's first placed chain begins with an 'item-row', i.e. PGBRK-03's repeated
 * table header). A continuation page now repeats TWO things above its first
 * row, both drawn by the templates when `page.continuesTable`: the one-line
 * "<Section title> (cont.)" band (CONTINUATION_SECTION_TITLE_HEIGHT_PT) and the
 * column-label row (CONTINUATION_COLUMN_HEADER_HEIGHT_PT). The reservation is
 * their sum. Classic 23.89 + 29.31, Modern 27.38 + 27.08.
 */
export const CONTINUATION_TABLE_HEADER_HEIGHT_PT: Record<EstimateTemplateId, number> = {
  classic: CONTINUATION_SECTION_TITLE_HEIGHT_PT.classic + CONTINUATION_COLUMN_HEADER_HEIGHT_PT.classic,
  modern: CONTINUATION_SECTION_TITLE_HEIGHT_PT.modern + CONTINUATION_COLUMN_HEADER_HEIGHT_PT.modern,
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
 * Re-run 2026-10-02 (earlier the same day), after pages 2+ switched to the
 * compact header (`measureCompactHeaderHeightPt` /
 * `PageConstraints.continuationContentHeightPt`), the language chip became
 * non-English-only, hyphenation was disabled and the line packer began breaking
 * only at spaces: the coarse sweep (0,10,...,70,78,80,90,100) gave
 * 8,7,3,2,2,2,1,1,0,0,0,0 mismatches; the 71..77 refinement gave mismatches=1
 * for 71..76 and mismatches=0 at 77 (that run's fixtures: single-section 1..60
 * sweep, 4x10 multi-page, baseline, summary + deposit boundary combo). Smallest
 * zero-mismatch value then: 77pt, used as 89pt (77 + 12).
 *
 * Re-run 2026-10-02 (final), after the Classic card padding, full-width photo
 * tiles, photo label inside its row View, "Prepared by" before the photos, the
 * Modern summary spacing, the "<Section> (cont.)" continuation title, AND a
 * correction of the height model itself, and with the sweep EXTENDED by a rich
 * fixture (summary + all 5 terms cards + discount/tax/deposit + signature +
 * prepared-by + full Bill To client + 3 or 7 photos, first section growing
 * 1..30 items so signature / terms cards / photo rows land on every page
 * boundary and rows spill onto a continuation page). Why the old 77/89 was
 * never a "residual drift": that fixture failed at 89 on the COMMITTED code
 * (HEAD a0efe64: marginPt=89 mismatches=16, all Classic rich) and, on the first
 * version of this change, on Modern at 89/90/91 (mismatches=6, e.g.
 * "modern rich (3 photos) n=5: engine=4 real=5"; clean from 92). Ablation
 * (drop one feature at a time) localised it to the TOTALS block: real PDF text
 * positions showed the totals block was charged 165.5pt (Modern) / 84.5pt
 * (Classic) against a real 240.42pt / 161.94pt — totalsRow charged padding +
 * border but NO text line (12.8 / 12.1pt per row), grandTotal charged bare font
 * sizes instead of line heights, and a section's PdfTableHeaderOnly column row,
 * item-row/-subtotal borders, terms/signature/caption/label line heights and
 * margins and Classic's summary wrapper margin (16) were uncharged or charged
 * as bare font sizes. The flat margin was silently absorbing ~75-80pt per
 * totals block. All of those are now charged from their StyleSheet values
 * (blocks-from-model.ts, each with a cite-the-style comment); the info-grid's
 * fixed estimate is 5 lines (a full Bill To client) instead of 4.
 * Result of the sweep on the corrected model: marginPt=-30 mismatches=122,
 * marginPt=-20 mismatches=107, marginPt=-10 mismatches=0, marginPt=0
 * mismatches=0, marginPt=12 mismatches=0 (earlier coarse run: 0,6,12,16,20,40,
 * 60,77 all mismatches=0). The smallest non-negative zero-mismatch value is
 * therefore **0pt** (negative values only matter for the fixed one-line
 * SAFETY_MARGIN_LINES term, which stays) — that is what the CALIBRATION FIXTURES alone said.
 * The fuzz below is stricter and sets the final value (24).
 * Randomized engine-vs-renderer fuzz (600 renders per seed — random sections/items,
 * description and section-title lengths, summary/terms on/off, company terms, 0-9
 * photos with 1-16 word captions, signature, logo, long company name/address, long
 * project name, long client name/address, null client, en/es/pt, discount/tax/deposit,
 * both templates; engine page count vs real PDF page count) found, in turn:
 *   1. wrapping photo captions (Modern, 8-9 photos): the photo-row charged ONE caption
 *      line -> each caption is now measured at the tile width and the row takes the
 *      tallest (`PageBlock.parallelMeasurements`);
 *   2. a long company name (82 chars) in the page-1 header: the name WRAPS in the left
 *      column (right column = logo / language chip) but was charged as one line, so
 *      page 1 overflowed and react-pdf split the `fixed` header onto an extra page
 *      (seeds 4242 c38, 8675309 c2, 123 c70 — the photos in those cases were a red
 *      herring) -> measureHeaderHeightPt now measures name / contact / address at the
 *      left-column width (it takes the MeasurementProvider).
 * After both: seeds 7, 99, 2026, 31337 (N=150) 0 mismatches, and with seeds
 * 11, 222, 3333, 44444, 555555, 6666666 (N=150 each, 1800 renders) swept over the
 * extra margin (harness MARGIN override = this constant's value for the run):
 *   margin  0: mismatches 2,2,4,1,0,1 = 10  (every one has a Bill To client: the info-grid's
 *                                            FIXED 5-line estimate under-measures a client name /
 *                                            address that wraps)
 *   margin 12: 0,0,0,0,0,0 = 0
 *   margin 24: 0,0,0,0,0,0 = 0
 *   margin 36: 0,0,0,0,0,0 = 0
 * and the calibration script gave marginPt=0 mismatches=0, marginPt=12 mismatches=0. The
 * smallest margin clean in BOTH is 12pt, so the constant is **24pt** (12 + 12). Production
 * additionally runs lib/pdf/render-with-page-guard.ts: a real page count that still differs
 * from the plan is re-planned with +48pt, then +96pt, and reported to Sentry. Re-run
 * that script (`CAL_CANDIDATES=` narrows the sweep) and the fuzz, and update this comment +
 * the constant, if `blocks-from-model.ts` / `measure-header-height.ts` / either
 * template's StyleSheet ever changes.
 */
export const PDF_RENDER_SAFETY_MARGIN_PT = 24
