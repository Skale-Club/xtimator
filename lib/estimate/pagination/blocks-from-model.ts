// lib/estimate/pagination/blocks-from-model.ts
//
// Phase 184 Plan 03 (PGBRK-01) — turns a real estimate's document model into
// the PageBlock[] lib/estimate/pagination/engine.ts consumes. Pure structure
// + height-formula computation ONLY — no text measurement happens here.
// Every text-bearing block carries a `measurement` descriptor the caller
// resolves via a MeasurementProvider (measure/estimator.ts, this same plan,
// or Phase 185's future DOM provider). Client-safe: zero imports of
// fontkit/linebreak/@react-pdf/renderer/react/components/* — see
// tests/unit/pagination/pagination-engine-boundary.test.ts.
//
// Every geometry/line-height/design/chunking number that the shared
// lib/estimate/document/tokens.ts module already centralizes
// (contentWidthPt, tableCellFontSizePt, sectionTitleFontSizePt,
// termsTextFontSizePt, summaryFontSizePt, proseLineHeightMultiplier,
// LINE_HEIGHT[family], fontFamily/fontFamilyBold, photosPerRow) is READ from
// there — never re-typed as a bare literal here. The remaining pt literals
// below (paddingVertical, marginTop/Bottom, borderWidth, and the handful of
// fontSizePt values with no shared token, e.g. the title-banner/terms-title/
// grand-total sizes) are NOT part of that shared module (they're private
// layout constants of each PDF template's own StyleSheet) and are hand-cited
// here to the exact source: components/pdf/estimate-pdf.tsx (classic) /
// components/pdf/estimate-pdf-modern.tsx (modern).
import type { DocumentSection, DocumentSignature } from '@/lib/estimate/document/model'
import type { DepositDisplay } from '@/lib/estimate/deposit-display'
import type { DocumentLabels } from '@/lib/estimate/document/labels'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import {
  CLASSIC_CARD_BOX,
  ESTIMATE_DESIGN_TOKENS,
  ESTIMATE_PAGE_GEOMETRY,
  LINE_HEIGHT,
  photoTileWidthPt,
  photosPerRow,
} from '@/lib/estimate/document/tokens'
import { visibleSectionItems } from '@/lib/estimate/document/visible-items'
// PDF-PHOTO-01 — the SAME gate the render sites apply. Pure and browser-safe
// (lib/pdf/pdf-image-support.ts imports nothing but lib/storage/asset-url), so
// it does not breach this module's client-safety contract.
import { drawablePdfPhotos } from '@/lib/pdf/pdf-image-support'
import { isSectionVisible, type ResolvedPresentationSettings } from '@/lib/estimate/presentation-settings'
import type { PageBlock } from './types'

export interface BlocksFromModelPhoto {
  url: string
  caption: string | null
  /** PDF-PHOTO-01 — optional, for the callers that measure BEFORE any URL
   *  exists (the web paginated preview resolves its own signed URLs inside
   *  each thumbnail). `willPdfRenderPhoto` reads it so a photo that provably
   *  exists in storage is still charged page budget. */
  storage_path?: string | null
}

export interface BlocksFromModelCompany {
  estimate_terms_enabled?: boolean
  estimate_terms_text?: string | null
}

export interface BlocksFromModelInput {
  /** Accessed defensively as `input.sections ?? []` — never throws on undefined/omitted. */
  sections?: DocumentSection[]
  summary: string | null
  timeline: string | null
  payment_terms: string | null
  warranty_terms: string | null
  notes: string | null
  company: BlocksFromModelCompany
  discount_amount: number
  tax_amount: number
  dep: DepositDisplay
  signature: DocumentSignature | null
  photos: BlocksFromModelPhoto[]
  resolvedSettings: ResolvedPresentationSettings
  preparedBy: string | null
  /** Only `L.estimate` (title-banner label) is read here — every other
   *  label (paymentTerms/timeline/warranty/notes titles) is looked up by
   *  Plan 184-05's renderer from `ref.termsKey`, not here: blocksFromModel
   *  only needs to know WHICH terms are present, not their display titles. */
  L: DocumentLabels
  templateId: EstimateTemplateId
}

/** Per-template layout constants that are NOT part of the shared
 *  lib/estimate/document/tokens.ts module (private StyleSheet values, one
 *  per template) — hand-cited inline to their exact source below. */
interface TemplateLiterals {
  /** styles.infoLabel.fontSize (8, both templates: infoLabel/summary/prepared-by all share it). */
  labelFontSizePt: number
  /** styles.infoLabel.marginBottom (4 classic / 5 modern). */
  labelMarginBottomPt: number
  /** styles.infoValue.fontSize (10, both templates). */
  valueFontSizePt: number
  /** styles.estimateTitle.fontSize (24 classic / 13 modern). */
  titleBannerFontSizePt: number
  /** Classic: banner paddingVertical(16)×2 + estimateTitle/banner marginBottom(20) = 52.
   *  Modern: estimateTitle marginBottom(6) + estimateTitleRule marginBottom(28) = 34. */
  titleBannerBaseHeightPt: number
  /** blocksFromModel's input carries no project/client text (see
   *  BlocksFromModelInput) — this is a conservative FIXED estimate for
   *  info-grid's "up to 5 lines" (project name/type/date/estimate# or
   *  client name/email/phone/2-line address), not a real text measurement. */
  infoGridBaseHeightPt: number
  /** infoLabel line + labelMarginBottom + the space BELOW the summary text (classic: termsText.marginBottom 12; modern: the summary Text's own marginBottom override 6, see estimate-pdf-modern.tsx's summary case) — the non-measured part of the summary block. */
  summaryBaseHeightPt: number
  /** The section band PLUS the column-header row PdfTableHeaderOnly draws right under it
   *  (both are rendered by the section-header block's Fragment).
   *  Band — Classic: sectionHeader padding(8)×2 + marginTop(16) = 32.
   *        Modern: sectionHeader paddingVertical(6)×2 + marginTop(22) + borderBottomWidth(1) = 35.
   *  Column header — Classic: tableHeader paddingVertical(6)×2 + borderBottomWidth(1) + tableHeaderText 9 × 1.21 = 23.89.
   *                  Modern: paddingVertical(8)×2 + borderBottomWidth(0.5) + tableHeaderText 8.5 × 1.28 = 27.38. */
  sectionHeaderBaseHeightPt: number
  /** sectionHeader paddingHorizontal (classic 10, modern 0). The band itself spans
   *  the full content width, so the section title's real text box is
   *  contentWidthPt - 2 x this — the width the title is measured (wrapped) at. */
  sectionTitleHorizontalPaddingPt: number
  /** tableRow paddingVertical×2 + borderBottomWidth(0.5) (classic 6×2+0.5=12.5, modern 8×2+0.5=16.5). */
  itemRowBaseHeightPt: number
  /** sectionSubtotal paddingVertical×2 + borderTopWidth + ONE label line (9 × the bold family's natural line height). */
  sectionSubtotalBaseHeightPt: number
  /** totalsContainer.marginTop (20 classic / 28 modern). */
  totalsContainerMarginTopPt: number
  /** totalsRow paddingVertical×2 + borderBottomWidth + ONE text line (totalsLabel/Value
   *  fontSize 10 × the family's natural line height: classic 4×2+0.5+12.1=20.6, modern
   *  6×2+0.5+12.8=25.3) — per subtotal/discount/tax/deposit/balance-due row. Verified
   *  against real PDF text positions (row pitch 20.6 / 25.3). 2026-10-02: the text line
   *  was previously omitted entirely (only padding + border were charged), under-measuring
   *  every row by 12.1 / 12.8pt. */
  totalsRowHeightPt: number
  /** Classic: grandTotalRow paddingVertical(8)×2 + borderTopWidth(2) + marginTop(4) +
   *  grandTotalLabel/Value 14 × 1.21 (Inter-Bold) = 38.94.
   *  Modern: grandTotalBlock marginTop(16) + grandTotalLabel marginBottom(4) +
   *  label 9 × 1.28 + value 30 × 1.28 (Lora-Bold) = 69.92. Verified against real PDF text
   *  positions (Tax -> Deposit pitch 111.22 = row 25.3 + this 69.92 + deposit marginTop 16).
   *  2026-10-02: the text line heights were previously charged as bare font sizes (9 + 30
   *  = 39 vs 49.92; Classic's 14pt line not at all). */
  grandTotalHeightPt: number
  /** pdf-totals-block.tsx Modern-only: the FIRST deposit row (when
   *  `dep.showDeposit`) carries an extra inline `marginTop: 16` not present on
   *  Classic's equivalent row (`{...styles.totalsRow, marginTop: 16}` vs
   *  Classic's plain `styles.totalsRow`) — 0 for Classic, 16 for Modern. Phase
   *  185 pre-flight verification finding (GAP 1b, 2026-07-28): previously
   *  uncharged entirely. */
  depositRowFirstBonusPt: number
  /** termsTitle.fontSize (8, both templates). The title's real line is this × the bold
   *  family's natural line height (termsTitle sets no lineHeight). */
  termsTitleFontSizePt: number
  /** Per-card uniform base (NO first/non-first difference): termsTitle line (8 × bold
   *  natural line height) + marginBottom + the card's text marginBottom + (Classic only) the card box's
   *  vertical padding (2 x 10) + marginBottom (8). */
  termsCardBaseHeightPt: number
  /** Horizontal inset of a terms card's text from the content box — Classic's card
   *  padding (CLASSIC_CARD_BOX.paddingPt 10, each side), Modern 0 (box-less). The
   *  card text wraps at contentWidthPt - 2 x this. */
  termsCardHorizontalPaddingPt: number
  /** The one-time termsSection.marginTop the outer container used to carry
   *  before Plan 184-04's per-card restructure — now applied ONLY to
   *  whichever card is emitted first (24 classic / 32 modern). */
  termsCardFirstBonusPt: number
  /** signatureBlock marginTop(16) + termsTitle line (8 × bold line height) + termsTitle.marginBottom + Image height(40) + signer Text marginTop(4) + 2 text lines (9 × regular line height each) + (Classic only) the card box's vertical padding (2 x 10) + marginBottom (8). */
  signatureBaseHeightPt: number
  /** pdf-photo-grid.tsx's row-View marginTop for every NON-first chunk (PHOTO_TILE_GAP_PT = 8, both templates) — the gap between consecutive photo rows. */
  photoRowGapPt: number
  /** The first chunk's "Photos" label INSIDE the row View: termsTitle.fontSize x
   *  LINE_HEIGHT[bold family] + termsTitle.marginBottom (the label is the same
   *  eyebrow style as termsTitle). Charged on the first chunk only. */
  photoLabelHeightPt: number
  /** pdf-photo-grid.tsx caption Text marginTop (2), added only when any photo in the chunk has a caption. The caption's own height is MEASURED per photo (wrapped at the tile width) and the row takes the tallest — see the photo-row block's `parallelMeasurements`. */
  photoCaptionMarginTopPt: number
  /** pdf-photo-grid.tsx caption Text fontSize (8). */
  photoCaptionFontSizePt: number
  /** The first chunk's row-View marginTop (16 classic / 20 modern) — the space
   *  ABOVE the "Photos" label, i.e. the gap between the signature / terms card
   *  and the label. Applied ONLY to the first row-chunk. */
  photoRowFirstBonusPt: number
  /** marginTop(16 classic / 20 modern) + labelFontSize line + labelMarginBottom — the non-measured part of prepared-by. */
  preparedByBaseHeightPt: number
}

/** Builds a template's derived TemplateLiterals from its named primitive
 *  StyleSheet values (one source per number, no duplicated magic literals
 *  across derived fields). Params map 1:1 to the exact source StyleSheet
 *  key cited in each comment. */
function buildTemplateLiterals(p: {
  labelFontSizePt: number
  labelMarginBottomPt: number
  valueFontSizePt: number
  titleBannerFontSizePt: number
  titleBannerBaseHeightPt: number
  proseLineHeightMultiplier: number
  infoRowMarginBottomPt: number
  termsTextMarginBottomPt: number
  sectionHeaderPaddingContributionPt: number
  tableHeaderHeightPt: number
  sectionTitleHorizontalPaddingPt: number
  itemRowPaddingContributionPt: number
  sectionSubtotalPaddingContributionPt: number
  sectionSubtotalLabelLinePt: number
  totalsContainerMarginTopPt: number
  totalsRowHeightPt: number
  grandTotalHeightPt: number
  depositRowFirstBonusPt: number
  termsTitleFontSizePt: number
  termsTitleSpacingContributionPt: number
  termsTitleLineHeightMultiplier: number
  termsCardFirstBonusPt: number
  termsCardPaddingPt: number
  termsCardMarginBottomPt: number
  termsCardTextMarginBottomPt: number
  summaryBottomSpacingPt: number
  signatureMarginTopPt: number
  signatureImageHeightPt: number
  signatureLineFontSizePt: number
  signatureLineHeightMultiplier: number
  signatureNameMarginTopPt: number
  photoRowGapPt: number
  photoCaptionMarginTopPt: number
  photoCaptionFontSizePt: number
  photoRowFirstBonusPt: number
  preparedByMarginTopPt: number
}): TemplateLiterals {
  // "up to 5 lines" — see BlocksFromModelInput/infoGridBaseHeightPt doc. The taller column is
  // Bill To for a fully-populated client: name + email + phone + a 2-line street/city-state-zip
  // address (formatAddress joins the two with '\n') = 5 value lines. The Project column is 4 lines
  // (+ a 4pt marginTop on the date line), so 5 bounds both. Verified against a real render with a
  // full client (calibration rich fixture): real Classic 108.7pt / Modern 123.2pt vs charged
  // 111 / 125.8 — it was 4 lines (96 / 109.8, i.e. 12-13pt short) until 2026-10-02.
  const infoGridMaxLines = 5

  return {
    labelFontSizePt: p.labelFontSizePt,
    labelMarginBottomPt: p.labelMarginBottomPt,
    valueFontSizePt: p.valueFontSizePt,
    titleBannerFontSizePt: p.titleBannerFontSizePt,
    titleBannerBaseHeightPt: p.titleBannerBaseHeightPt,
    infoGridBaseHeightPt:
      p.infoRowMarginBottomPt +
      p.labelFontSizePt * p.proseLineHeightMultiplier +
      p.labelMarginBottomPt +
      p.valueFontSizePt * p.proseLineHeightMultiplier * infoGridMaxLines,
    summaryBaseHeightPt:
      p.labelFontSizePt * p.proseLineHeightMultiplier + p.labelMarginBottomPt + p.summaryBottomSpacingPt,
    sectionHeaderBaseHeightPt: p.sectionHeaderPaddingContributionPt + p.tableHeaderHeightPt,
    sectionTitleHorizontalPaddingPt: p.sectionTitleHorizontalPaddingPt,
    itemRowBaseHeightPt: p.itemRowPaddingContributionPt,
    sectionSubtotalBaseHeightPt: p.sectionSubtotalPaddingContributionPt + p.sectionSubtotalLabelLinePt,
    totalsContainerMarginTopPt: p.totalsContainerMarginTopPt,
    totalsRowHeightPt: p.totalsRowHeightPt,
    grandTotalHeightPt: p.grandTotalHeightPt,
    depositRowFirstBonusPt: p.depositRowFirstBonusPt,
    termsTitleFontSizePt: p.termsTitleFontSizePt,
    termsCardBaseHeightPt:
      p.termsTitleFontSizePt * p.termsTitleLineHeightMultiplier +
      p.termsTitleSpacingContributionPt +
      p.termsCardTextMarginBottomPt +
      p.termsCardPaddingPt * 2 +
      p.termsCardMarginBottomPt,
    termsCardHorizontalPaddingPt: p.termsCardPaddingPt,
    termsCardFirstBonusPt: p.termsCardFirstBonusPt,
    signatureBaseHeightPt:
      p.signatureMarginTopPt +
      p.termsTitleFontSizePt * p.termsTitleLineHeightMultiplier +
      p.termsTitleSpacingContributionPt +
      p.signatureImageHeightPt +
      p.signatureNameMarginTopPt +
      p.signatureLineFontSizePt * p.signatureLineHeightMultiplier * 2 +
      p.termsCardPaddingPt * 2 +
      p.termsCardMarginBottomPt,
    photoRowGapPt: p.photoRowGapPt,
    photoLabelHeightPt:
      p.termsTitleFontSizePt * p.termsTitleLineHeightMultiplier + p.termsTitleSpacingContributionPt,
    photoCaptionMarginTopPt: p.photoCaptionMarginTopPt,
    photoCaptionFontSizePt: p.photoCaptionFontSizePt,
    photoRowFirstBonusPt: p.photoRowFirstBonusPt,
    preparedByBaseHeightPt:
      p.preparedByMarginTopPt + p.labelFontSizePt * p.proseLineHeightMultiplier + p.labelMarginBottomPt,
  }
}

const TEMPLATE_LITERALS: Record<EstimateTemplateId, TemplateLiterals> = {
  // Every primitive below is cited to components/pdf/estimate-pdf.tsx's StyleSheet.
  classic: buildTemplateLiterals({
    labelFontSizePt: 8, // styles.infoLabel.fontSize
    labelMarginBottomPt: 4, // styles.infoLabel.marginBottom
    valueFontSizePt: 10, // styles.infoValue.fontSize
    titleBannerFontSizePt: 24, // styles.estimateTitle.fontSize
    titleBannerBaseHeightPt: 16 * 2 + 20, // PdfTitleBanner solid-fill: paddingVertical×2 + marginBottom
    proseLineHeightMultiplier: ESTIMATE_PAGE_GEOMETRY.classic.proseLineHeightMultiplier,
    infoRowMarginBottomPt: 20, // styles.infoRow.marginBottom
    termsTextMarginBottomPt: 12, // styles.termsText.marginBottom
    sectionHeaderPaddingContributionPt: 8 * 2 + 16, // styles.sectionHeader.padding×2 + marginTop
    tableHeaderHeightPt: 6 * 2 + 1 + 9 * LINE_HEIGHT['Inter-Bold'], // PdfTableHeaderOnly: styles.tableHeader.paddingVertical×2 + borderBottomWidth + tableHeaderText.fontSize × Inter-Bold line height
    sectionTitleHorizontalPaddingPt: 10, // styles.sectionHeader.paddingHorizontal (title text box = contentWidthPt - 2×10)
    itemRowPaddingContributionPt: 6 * 2 + 0.5, // styles.tableRow.paddingVertical×2 + borderBottomWidth
    sectionSubtotalPaddingContributionPt: 6 * 2 + 1, // styles.sectionSubtotal.paddingVertical×2 + borderTopWidth
    sectionSubtotalLabelLinePt: 9 * LINE_HEIGHT['Inter-Bold'], // styles.sectionSubtotalLabel/Value.fontSize × Inter-Bold line height
    totalsContainerMarginTopPt: 20, // styles.totalsContainer.marginTop
    totalsRowHeightPt: 4 * 2 + 0.5 + 10 * LINE_HEIGHT.Inter, // styles.totalsRow.paddingVertical×2 + borderBottomWidth + totalsLabel/Value.fontSize(10) × Inter line height
    grandTotalHeightPt: 8 * 2 + 2 + 4 + 14 * LINE_HEIGHT['Inter-Bold'], // styles.grandTotalRow.paddingVertical×2 + borderTopWidth + marginTop + grandTotalLabel/Value.fontSize(14) × Inter-Bold line height
    depositRowFirstBonusPt: 0, // Classic's deposit row carries no extra margin (unlike Modern)
    termsTitleFontSizePt: 8, // styles.termsTitle.fontSize
    termsTitleSpacingContributionPt: 6, // styles.termsTitle.marginBottom (the paddingBottom + rule were dropped when the title became an eyebrow label)
    termsTitleLineHeightMultiplier: LINE_HEIGHT[ESTIMATE_DESIGN_TOKENS.classic.fontFamilyBold], // styles.termsTitle.fontFamily (Inter-Bold) natural line height — the "Photos" label line
    termsCardFirstBonusPt: 24, // removed styles.termsSection.marginTop, now PdfTermsSection topMarginPt
    termsCardPaddingPt: CLASSIC_CARD_BOX.paddingPt, // PdfTermsCard / PdfSignatureBlock `box.paddingPt` (10, all four sides) — estimate-pdf.tsx passes CLASSIC_CARD_BOX
    termsCardMarginBottomPt: CLASSIC_CARD_BOX.marginBottomPt, // box.marginBottomPt (8) — gap between consecutive cards
    termsCardTextMarginBottomPt: 0, // PdfTermsCard drops styles.termsText.marginBottom (12) inside a boxed card — the padding is the bottom inset
    summaryBottomSpacingPt: 12 + 16, // styles.termsText.marginBottom (the summary Text keeps it) + the summary wrapper View's marginBottom (16, estimate-pdf.tsx summary case)
    signatureMarginTopPt: 16, // PdfSignatureBlock outer View marginTop
    signatureImageHeightPt: 40, // PdfSignatureBlock Image height
    signatureLineFontSizePt: 9, // PdfSignatureBlock's 2 Text lines fontSize
    signatureLineHeightMultiplier: LINE_HEIGHT.Inter, // those Texts set no lineHeight: Inter natural line height
    signatureNameMarginTopPt: 4, // PdfSignatureBlock signer-name Text marginTop
    photoRowGapPt: 8, // PdfPhotoGrid non-first-row marginTop (PHOTO_TILE_GAP_PT); the tile edge itself is photoTileWidthPt(contentWidthPt), read in blocksFromModel
    photoCaptionMarginTopPt: 2, // PdfPhotoGrid caption Text marginTop
    photoCaptionFontSizePt: 8, // PdfPhotoGrid caption Text fontSize (line height = Inter natural, applied at measurement)
    photoRowFirstBonusPt: 16, // estimate-pdf.tsx's PdfPhotoGrid topMargin call-site value (first chunk: marginTop ABOVE the Photos label)
    preparedByMarginTopPt: 16, // Prepared-by View marginTop
  }),
  // Every primitive below is cited to components/pdf/estimate-pdf-modern.tsx's StyleSheet.
  modern: buildTemplateLiterals({
    labelFontSizePt: 8, // styles.infoLabel.fontSize
    labelMarginBottomPt: 5, // styles.infoLabel.marginBottom
    valueFontSizePt: 10, // styles.infoValue.fontSize
    titleBannerFontSizePt: 13, // styles.estimateTitle.fontSize
    titleBannerBaseHeightPt: 6 + 28, // estimateTitle.marginBottom + estimateTitleRule.marginBottom
    proseLineHeightMultiplier: ESTIMATE_PAGE_GEOMETRY.modern.proseLineHeightMultiplier,
    infoRowMarginBottomPt: 28, // styles.infoRow.marginBottom
    termsTextMarginBottomPt: 14, // styles.termsText.marginBottom
    sectionHeaderPaddingContributionPt: 6 * 2 + 22 + 1, // paddingVertical×2 + marginTop + borderBottomWidth
    tableHeaderHeightPt: 8 * 2 + 0.5 + 8.5 * LINE_HEIGHT['Lora-Bold'], // PdfTableHeaderOnly: styles.tableHeader.paddingVertical×2 + borderBottomWidth + tableHeaderText.fontSize × Lora-Bold line height
    sectionTitleHorizontalPaddingPt: 0, // styles.sectionHeader has no paddingHorizontal (title text box = full contentWidthPt)
    itemRowPaddingContributionPt: 8 * 2 + 0.5, // styles.tableRow.paddingVertical×2 + borderBottomWidth
    sectionSubtotalPaddingContributionPt: 8 * 2 + 0.5, // paddingVertical×2 + borderTopWidth
    sectionSubtotalLabelLinePt: 9 * LINE_HEIGHT['Lora-Bold'], // styles.sectionSubtotalLabel/Value.fontSize × Lora-Bold line height
    totalsContainerMarginTopPt: 28, // styles.totalsContainer.marginTop
    totalsRowHeightPt: 6 * 2 + 0.5 + 10 * LINE_HEIGHT.Lora, // styles.totalsRow.paddingVertical×2 + borderBottomWidth + totalsLabel/Value.fontSize(10) × Lora line height
    grandTotalHeightPt: 16 + 4 + 9 * LINE_HEIGHT['Lora-Bold'] + 30 * LINE_HEIGHT['Lora-Bold'], // grandTotalBlock.marginTop + grandTotalLabel.marginBottom + grandTotalLabel.fontSize(9) × Lora-Bold line height + grandTotalValue.fontSize(30) × Lora-Bold line height
    depositRowFirstBonusPt: 16, // pdf-totals-block.tsx Modern-only: {...styles.totalsRow, marginTop: 16} on the FIRST deposit row
    termsTitleFontSizePt: 8, // styles.termsTitle.fontSize
    termsTitleSpacingContributionPt: 7, // styles.termsTitle.marginBottom (the paddingBottom + rule were dropped when the title became an eyebrow label)
    termsTitleLineHeightMultiplier: LINE_HEIGHT[ESTIMATE_DESIGN_TOKENS.modern.fontFamilyBold], // styles.termsTitle.fontFamily (Lora-Bold) natural line height — the "Photos" label line
    termsCardFirstBonusPt: 32, // removed styles.termsSection.marginTop, now PdfTermsSection topMarginPt
    termsCardPaddingPt: 0, // Modern cards are box-less (no `box` prop passed): no padding
    termsCardMarginBottomPt: 0, // ...and no inter-card margin
    termsCardTextMarginBottomPt: 14, // styles.termsText.marginBottom (unchanged for Modern)
    summaryBottomSpacingPt: 6, // estimate-pdf-modern.tsx summary case: Text style [termsText, { marginBottom: 6 }] and a margin-less wrapper View (was termsText 14 + wrapper 20, of which only 14 was ever charged)
    signatureMarginTopPt: 16, // PdfSignatureBlock outer View marginTop (shared component)
    signatureImageHeightPt: 40, // PdfSignatureBlock Image height (shared component)
    signatureLineFontSizePt: 9, // PdfSignatureBlock's 2 Text lines fontSize (shared component)
    signatureLineHeightMultiplier: LINE_HEIGHT.Lora, // those Texts set no lineHeight: Lora natural line height
    signatureNameMarginTopPt: 4, // PdfSignatureBlock signer-name Text marginTop (shared component)
    photoRowGapPt: 8, // PdfPhotoGrid non-first-row marginTop (PHOTO_TILE_GAP_PT, shared component); the tile edge itself is photoTileWidthPt(contentWidthPt), read in blocksFromModel
    photoCaptionMarginTopPt: 2, // PdfPhotoGrid caption Text marginTop (shared component)
    photoCaptionFontSizePt: 8, // PdfPhotoGrid caption Text fontSize (shared component; line height = Lora natural, applied at measurement)
    photoRowFirstBonusPt: 20, // estimate-pdf-modern.tsx's PdfPhotoGrid topMargin call-site value (first chunk: marginTop ABOVE the Photos label)
    preparedByMarginTopPt: 20, // Prepared-by View marginTop
  }),
}

/** Fixed, pinned emission order (Plan-checker blocker 3) — mirrors
 *  components/pdf/shared/pdf-terms-section.tsx:88-163's Fragment order
 *  exactly. Iterating this fixed array (rather than any data-driven order)
 *  is what pins the order regardless of which subset of terms is present. */
const TERMS_ORDER = ['estimate', 'payment', 'timeline', 'warranty', 'notes'] as const

export function blocksFromModel(input: BlocksFromModelInput): PageBlock[] {
  const {
    summary,
    timeline,
    payment_terms,
    warranty_terms,
    notes,
    company,
    discount_amount,
    tax_amount,
    dep,
    signature,
    photos,
    resolvedSettings,
    preparedBy,
    templateId,
  } = input
  const sections = input.sections ?? []

  const geometry = ESTIMATE_PAGE_GEOMETRY[templateId]
  const design = ESTIMATE_DESIGN_TOKENS[templateId]
  const lit = TEMPLATE_LITERALS[templateId]
  const prose = geometry.proseLineHeightMultiplier

  const blocks: PageBlock[] = []

  // --- title-banner (page1Only) ---
  blocks.push({
    kind: 'title-banner',
    id: 'title-banner',
    baseHeightPt: lit.titleBannerBaseHeightPt,
    measurement: {
      text: input.L.estimate,
      styleKey: design.fontFamilyBold,
      fontSizePt: lit.titleBannerFontSizePt,
      lineHeightMultiplier: prose,
      maxWidthPt: geometry.contentWidthPt,
    },
    atomic: true,
    page1Only: true,
  })

  // --- info-grid (page1Only, fixed — see TemplateLiterals.infoGridBaseHeightPt doc) ---
  blocks.push({
    kind: 'info-grid',
    id: 'info-grid',
    baseHeightPt: lit.infoGridBaseHeightPt,
    atomic: true,
    page1Only: true,
  })

  // --- summary (page1Only, gated on BOTH visibility AND presence) ---
  if (isSectionVisible(resolvedSettings, 'summary') && summary) {
    blocks.push({
      kind: 'summary',
      id: 'summary',
      baseHeightPt: lit.summaryBaseHeightPt,
      measurement: {
        text: summary,
        styleKey: design.fontFamily,
        fontSizePt: geometry.summaryFontSizePt,
        lineHeightMultiplier: prose,
        maxWidthPt: geometry.contentWidthPt,
      },
      atomic: true,
      page1Only: true,
    })
  }

  // --- sections (gated on 'sections' visibility BEFORE per-section filtering) ---
  if (isSectionVisible(resolvedSettings, 'sections')) {
    for (const section of sections) {
      const items = visibleSectionItems(section)
      if (items.length === 0) continue

      const headerId = `${section.id}-header`
      const rowIds = items.map((item) => `${section.id}-rows-${item.id}`)
      const subtotalId = `${section.id}-subtotal`

      blocks.push({
        kind: 'section-header',
        id: headerId,
        baseHeightPt: lit.sectionHeaderBaseHeightPt,
        measurement: {
          text: section.title,
          styleKey: design.fontFamilyBold,
          fontSizePt: geometry.sectionTitleFontSizePt,
          lineHeightMultiplier: LINE_HEIGHT[design.fontFamilyBold],
          // The title sits inside the section band's horizontal padding, so it
          // wraps at the band's INNER width, not the full content width.
          maxWidthPt: geometry.contentWidthPt - 2 * lit.sectionTitleHorizontalPaddingPt,
        },
        keepWithNextId: rowIds[0],
        atomic: true,
        ref: { sectionId: section.id },
      })

      items.forEach((item, itemIndex) => {
        blocks.push({
          kind: 'item-row',
          id: rowIds[itemIndex],
          baseHeightPt: lit.itemRowBaseHeightPt,
          measurement: {
            text: item.description,
            styleKey: design.fontFamily,
            fontSizePt: geometry.tableCellFontSizePt,
            lineHeightMultiplier: LINE_HEIGHT[design.fontFamily],
            maxWidthPt: geometry.colDescriptionWidthPt,
          },
          atomic: true,
          ref: { sectionId: section.id, itemId: item.id, itemIndex },
        })
      })

      blocks.push({
        kind: 'section-subtotal',
        id: subtotalId,
        baseHeightPt: lit.sectionSubtotalBaseHeightPt,
        keepWithPreviousId: rowIds[rowIds.length - 1],
        atomic: true,
        ref: { sectionId: section.id },
      })
    }
  }

  // --- totals (fixed, no measurement — row count driven by discount/tax/deposit gates) ---
  const totalsRowCount =
    1 /* subtotal */ +
    (discount_amount > 0 ? 1 : 0) +
    (tax_amount > 0 ? 1 : 0) +
    (dep.showDeposit ? 2 : 0) /* deposit + balance due */
  blocks.push({
    kind: 'totals',
    id: 'totals',
    baseHeightPt:
      lit.totalsContainerMarginTopPt +
      lit.totalsRowHeightPt * totalsRowCount +
      lit.grandTotalHeightPt +
      (dep.showDeposit ? lit.depositRowFirstBonusPt : 0),
    atomic: true,
  })

  // --- terms-cards (pinned order, fixed iteration regardless of which subset is present) ---
  const termsFields: Record<(typeof TERMS_ORDER)[number], { include: boolean; text: string }> = {
    estimate: {
      include: !!(company.estimate_terms_enabled && company.estimate_terms_text),
      text: company.estimate_terms_text ?? '',
    },
    payment: {
      include: isSectionVisible(resolvedSettings, 'payment_terms') && !!payment_terms,
      text: payment_terms ?? '',
    },
    timeline: {
      include: isSectionVisible(resolvedSettings, 'timeline') && !!timeline,
      text: timeline ?? '',
    },
    warranty: {
      include: isSectionVisible(resolvedSettings, 'warranty_terms') && !!warranty_terms,
      text: warranty_terms ?? '',
    },
    notes: {
      include: isSectionVisible(resolvedSettings, 'notes') && !!notes,
      text: notes ?? '',
    },
  }

  let firstTermsCardEmitted = false
  for (const key of TERMS_ORDER) {
    const field = termsFields[key]
    if (!field.include) continue
    const isFirst = !firstTermsCardEmitted
    firstTermsCardEmitted = true

    blocks.push({
      kind: 'terms-card',
      id: `terms-${key}`,
      baseHeightPt: lit.termsCardBaseHeightPt + (isFirst ? lit.termsCardFirstBonusPt : 0),
      measurement: {
        text: field.text,
        styleKey: design.fontFamily,
        fontSizePt: geometry.termsTextFontSizePt,
        lineHeightMultiplier: prose,
        // The card text sits inside the card box's horizontal padding (Classic
        // 10 each side), so it wraps at the INNER width; Modern's box-less card
        // uses the full content width.
        maxWidthPt: geometry.contentWidthPt - 2 * lit.termsCardHorizontalPaddingPt,
      },
      atomic: true,
      ref: { termsKey: key },
    })
  }

  // --- signature (fixed, data-presence gated only) ---
  if (signature) {
    blocks.push({
      kind: 'signature',
      id: 'signature',
      baseHeightPt: lit.signatureBaseHeightPt,
      atomic: true,
    })
  }

  // --- prepared-by (ordinary atomic flowing block — NOT page1Only) ---
  //
  // Emitted right after the signature block (or after the last terms card when
  // there is no signature) and BEFORE the photos — it belongs with the document's
  // sign-off, not as a footnote after a photo grid. Both PDF templates and the
  // paginated preview render `page.blocks` in order, so block order is the only
  // thing that decides this.
  if (preparedBy) {
    blocks.push({
      kind: 'prepared-by',
      id: 'prepared-by',
      baseHeightPt: lit.preparedByBaseHeightPt,
      measurement: {
        text: preparedBy,
        styleKey: design.fontFamily,
        fontSizePt: lit.valueFontSizePt,
        lineHeightMultiplier: prose,
        maxWidthPt: geometry.contentWidthPt,
      },
      atomic: true,
    })
  }

  // --- photo-rows (gated on 'photos' visibility, chunked via the shared photosPerRow) ---
  //
  // PDF-PHOTO-01: `photos.length > 0` was NOT the right question. Every photo is
  // stored as WebP, which @react-pdf/image cannot decode by either of its
  // resolution paths, so this block reserved a full tile height per row for a grid the
  // renderer then drew blank — the same measure-vs-render desync PDF-LOGO-01
  // closed in the header. The question is "will this photo be DRAWN", and it is
  // asked with the identical `drawablePdfPhotos` the render sites use, over the
  // identical array, so `photoRange`'s index domain is shared by construction.
  const drawablePhotos = drawablePdfPhotos(photos)
  if (isSectionVisible(resolvedSettings, 'photos') && drawablePhotos.length > 0) {
    const perRow = Math.max(1, photosPerRow(geometry.contentWidthPt))
    // Square tile edge — the SAME photoTileWidthPt pdf-photo-grid.tsx draws (a row
    // of perRow tiles + gaps spans the content width), so the photo-row height is
    // charged from the one number the renderer uses.
    const tilePt = photoTileWidthPt(geometry.contentWidthPt)
    for (let start = 0; start < drawablePhotos.length; start += perRow) {
      const chunk = drawablePhotos.slice(start, start + perRow)
      const isFirstRow = start === 0
      const captioned = chunk.filter((photo) => !!photo.caption)

      blocks.push({
        kind: 'photo-row',
        id: `photo-row-${start}`,
        // Every chunk is ONE wrap={false} View (pdf-photo-grid.tsx): marginTop +
        // [first chunk only: the "Photos" label line + its marginBottom] + the
        // square tile row + [any caption in the chunk]. The first chunk's
        // marginTop is the space above the label (16/20); later chunks' is the
        // inter-row gap (8). Previously the label sat OUTSIDE the View and its
        // height was uncharged, and the 16/20 margin landed between label and
        // tiles instead of above the label.
        baseHeightPt:
          tilePt +
          (isFirstRow ? lit.photoRowFirstBonusPt + lit.photoLabelHeightPt : lit.photoRowGapPt) +
          (captioned.length > 0 ? lit.photoCaptionMarginTopPt : 0),
        // Each caption is a Text of the tile's width (it WRAPS — a long caption is 2+ lines);
        // tiles are side by side, so the row grows by the tallest caption (engine: max).
        // Caption Text sets no lineHeight, so it is the page font's natural line height.
        parallelMeasurements: captioned.map((photo) => ({
          text: photo.caption as string,
          styleKey: design.fontFamily,
          fontSizePt: lit.photoCaptionFontSizePt,
          lineHeightMultiplier: LINE_HEIGHT[design.fontFamily],
          maxWidthPt: tilePt,
        })),
        atomic: true,
        ref: { photoRange: [start, start + chunk.length] },
      })
    }
  }

  return blocks
}
