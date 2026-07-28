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
  ESTIMATE_DESIGN_TOKENS,
  ESTIMATE_PAGE_GEOMETRY,
  LINE_HEIGHT,
  photosPerRow,
} from '@/lib/estimate/document/tokens'
import { visibleSectionItems } from '@/lib/estimate/document/visible-items'
import { isSectionVisible, type ResolvedPresentationSettings } from '@/lib/estimate/presentation-settings'
import type { PageBlock } from './types'

export interface BlocksFromModelPhoto {
  url: string
  caption: string | null
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
   *  info-grid's "up to 4 lines" (project name/type/date/estimate# or
   *  client name/email/phone/address), not a real text measurement. */
  infoGridBaseHeightPt: number
  /** infoLabel line + labelMarginBottom + termsText.marginBottom (12 classic / 14 modern) — the non-measured part of the summary block. */
  summaryBaseHeightPt: number
  /** Classic: sectionHeader padding(8)×2 + marginTop(16) = 32.
   *  Modern: sectionHeader paddingVertical(6)×2 + marginTop(22) + borderBottomWidth(1) = 35. */
  sectionHeaderBaseHeightPt: number
  /** tableRow paddingVertical×2 (classic 6×2=12, modern 8×2=16). */
  itemRowBaseHeightPt: number
  /** sectionSubtotal paddingVertical×2 + borderTopWidth + labelFontSize (single-line proxy). */
  sectionSubtotalBaseHeightPt: number
  /** totalsContainer.marginTop (20 classic / 28 modern). */
  totalsContainerMarginTopPt: number
  /** totalsRow paddingVertical×2 + borderBottomWidth (classic 4×2+0.5=8.5, modern
   *  6×2+0.5=12.5) — per subtotal/discount/tax/deposit/balance-due row. Phase 185
   *  pre-flight verification finding (GAP 1b, 2026-07-28): the prior formula
   *  omitted totalsRow's own borderBottomWidth(0.5), under-measuring by 0.5pt
   *  per row. */
  totalsRowHeightPt: number
  /** Classic: grandTotalRow paddingVertical(8)×2 + borderTopWidth(2) + marginTop(4) = 22.
   *  Modern: grandTotalBlock marginTop(16) + grandTotalLabel marginBottom(4) +
   *  label fontSize(9) + value fontSize(30) = 59. Phase 185 pre-flight
   *  verification finding (GAP 1b, 2026-07-28): the prior formula omitted
   *  Classic's grandTotalRow.marginTop(4) and Modern's grandTotalLabel.marginBottom(4). */
  grandTotalHeightPt: number
  /** pdf-totals-block.tsx Modern-only: the FIRST deposit row (when
   *  `dep.showDeposit`) carries an extra inline `marginTop: 16` not present on
   *  Classic's equivalent row (`{...styles.totalsRow, marginTop: 16}` vs
   *  Classic's plain `styles.totalsRow`) — 0 for Classic, 16 for Modern. Phase
   *  185 pre-flight verification finding (GAP 1b, 2026-07-28): previously
   *  uncharged entirely. */
  depositRowFirstBonusPt: number
  /** termsTitle.fontSize (11 classic / 10.5 modern) — the card title's own single-line height proxy. */
  termsTitleFontSizePt: number
  /** Per-card uniform base (NO first/non-first difference): termsTitle line
   *  + marginBottom + paddingBottom + borderBottomWidth + termsText.marginBottom. */
  termsCardBaseHeightPt: number
  /** The one-time termsSection.marginTop the outer container used to carry
   *  before Plan 184-04's per-card restructure — now applied ONLY to
   *  whichever card is emitted first (24 classic / 32 modern). */
  termsCardFirstBonusPt: number
  /** signatureBlock marginTop(16) + termsTitle line + Image height(40) + 2 text lines (fontSize9 each). */
  signatureBaseHeightPt: number
  /** pdf-photo-grid.tsx Image style (150, both templates). */
  photoImageHeightPt: number
  /** pdf-photo-grid.tsx's row `gap: 8` / non-first-row `marginTop: 8` (both templates). */
  photoRowGapPt: number
  /** pdf-photo-grid.tsx caption Text (fontSize 8 + marginTop 2 = 10), added only when any photo in the chunk has a caption. */
  photoCaptionHeightPt: number
  /** The topMargin that used to sit on the shared outer grid wrapper before
   *  Plan 184-04's row-chunking — now applied ONLY to the first row-chunk
   *  (16 classic / 20 modern). */
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
  itemRowPaddingContributionPt: number
  sectionSubtotalPaddingContributionPt: number
  sectionSubtotalLabelFontSizePt: number
  totalsContainerMarginTopPt: number
  totalsRowHeightPt: number
  grandTotalHeightPt: number
  depositRowFirstBonusPt: number
  termsTitleFontSizePt: number
  termsTitleSpacingContributionPt: number
  termsCardFirstBonusPt: number
  signatureMarginTopPt: number
  signatureImageHeightPt: number
  signatureLineFontSizePt: number
  photoImageHeightPt: number
  photoRowGapPt: number
  photoCaptionHeightPt: number
  photoRowFirstBonusPt: number
  preparedByMarginTopPt: number
}): TemplateLiterals {
  const infoGridMaxLines = 4 // "up to 4 lines" — see BlocksFromModelInput/infoGridBaseHeightPt doc

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
      p.labelFontSizePt * p.proseLineHeightMultiplier + p.labelMarginBottomPt + p.termsTextMarginBottomPt,
    sectionHeaderBaseHeightPt: p.sectionHeaderPaddingContributionPt,
    itemRowBaseHeightPt: p.itemRowPaddingContributionPt,
    sectionSubtotalBaseHeightPt: p.sectionSubtotalPaddingContributionPt + p.sectionSubtotalLabelFontSizePt,
    totalsContainerMarginTopPt: p.totalsContainerMarginTopPt,
    totalsRowHeightPt: p.totalsRowHeightPt,
    grandTotalHeightPt: p.grandTotalHeightPt,
    depositRowFirstBonusPt: p.depositRowFirstBonusPt,
    termsTitleFontSizePt: p.termsTitleFontSizePt,
    termsCardBaseHeightPt:
      p.termsTitleFontSizePt + p.termsTitleSpacingContributionPt + p.termsTextMarginBottomPt,
    termsCardFirstBonusPt: p.termsCardFirstBonusPt,
    signatureBaseHeightPt:
      p.signatureMarginTopPt + p.termsTitleFontSizePt + p.signatureImageHeightPt + p.signatureLineFontSizePt * 2,
    photoImageHeightPt: p.photoImageHeightPt,
    photoRowGapPt: p.photoRowGapPt,
    photoCaptionHeightPt: p.photoCaptionHeightPt,
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
    itemRowPaddingContributionPt: 6 * 2, // styles.tableRow.paddingVertical×2
    sectionSubtotalPaddingContributionPt: 6 * 2 + 1, // styles.sectionSubtotal.paddingVertical×2 + borderTopWidth
    sectionSubtotalLabelFontSizePt: 9, // styles.sectionSubtotalLabel/Value.fontSize
    totalsContainerMarginTopPt: 20, // styles.totalsContainer.marginTop
    totalsRowHeightPt: 4 * 2 + 0.5, // styles.totalsRow.paddingVertical×2 + borderBottomWidth
    grandTotalHeightPt: 8 * 2 + 2 + 4, // styles.grandTotalRow.paddingVertical×2 + borderTopWidth + marginTop
    depositRowFirstBonusPt: 0, // Classic's deposit row carries no extra margin (unlike Modern)
    termsTitleFontSizePt: 11, // styles.termsTitle.fontSize
    termsTitleSpacingContributionPt: 6 + 4 + 1, // styles.termsTitle.marginBottom + paddingBottom + borderBottomWidth
    termsCardFirstBonusPt: 24, // removed styles.termsSection.marginTop, now PdfTermsSection topMarginPt
    signatureMarginTopPt: 16, // PdfSignatureBlock outer View marginTop
    signatureImageHeightPt: 40, // PdfSignatureBlock Image height
    signatureLineFontSizePt: 9, // PdfSignatureBlock's 2 Text lines fontSize
    photoImageHeightPt: 150, // PdfPhotoGrid Image width/height
    photoRowGapPt: 8, // PdfPhotoGrid row gap / non-first-row marginTop
    photoCaptionHeightPt: 8 + 2, // PdfPhotoGrid caption Text fontSize + marginTop
    photoRowFirstBonusPt: 16, // estimate-pdf.tsx's PdfPhotoGrid topMargin call-site value
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
    itemRowPaddingContributionPt: 8 * 2, // styles.tableRow.paddingVertical×2
    sectionSubtotalPaddingContributionPt: 8 * 2 + 0.5, // paddingVertical×2 + borderTopWidth
    sectionSubtotalLabelFontSizePt: 9, // styles.sectionSubtotalLabel/Value.fontSize
    totalsContainerMarginTopPt: 28, // styles.totalsContainer.marginTop
    totalsRowHeightPt: 6 * 2 + 0.5, // styles.totalsRow.paddingVertical×2 + borderBottomWidth
    grandTotalHeightPt: 16 + 4 + 9 + 30, // grandTotalBlock.marginTop + grandTotalLabel.marginBottom + grandTotalLabel.fontSize + grandTotalValue.fontSize
    depositRowFirstBonusPt: 16, // pdf-totals-block.tsx Modern-only: {...styles.totalsRow, marginTop: 16} on the FIRST deposit row
    termsTitleFontSizePt: 10.5, // styles.termsTitle.fontSize
    termsTitleSpacingContributionPt: 7 + 5 + 0.5, // marginBottom + paddingBottom + borderBottomWidth
    termsCardFirstBonusPt: 32, // removed styles.termsSection.marginTop, now PdfTermsSection topMarginPt
    signatureMarginTopPt: 16, // PdfSignatureBlock outer View marginTop (shared component)
    signatureImageHeightPt: 40, // PdfSignatureBlock Image height (shared component)
    signatureLineFontSizePt: 9, // PdfSignatureBlock's 2 Text lines fontSize (shared component)
    photoImageHeightPt: 150, // PdfPhotoGrid Image width/height (shared component)
    photoRowGapPt: 8, // PdfPhotoGrid row gap / non-first-row marginTop (shared component)
    photoCaptionHeightPt: 8 + 2, // PdfPhotoGrid caption Text fontSize + marginTop (shared component)
    photoRowFirstBonusPt: 20, // estimate-pdf-modern.tsx's PdfPhotoGrid topMargin call-site value
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
          maxWidthPt: geometry.contentWidthPt,
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
        maxWidthPt: geometry.contentWidthPt,
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

  // --- photo-rows (gated on 'photos' visibility, chunked via the shared photosPerRow) ---
  if (isSectionVisible(resolvedSettings, 'photos') && photos.length > 0) {
    const perRow = Math.max(1, photosPerRow(geometry.contentWidthPt))
    for (let start = 0; start < photos.length; start += perRow) {
      const chunk = photos.slice(start, start + perRow)
      const isFirstRow = start === 0
      const hasCaption = chunk.some((photo) => !!photo.caption)

      blocks.push({
        kind: 'photo-row',
        id: `photo-row-${start}`,
        baseHeightPt:
          lit.photoImageHeightPt +
          lit.photoRowGapPt +
          (hasCaption ? lit.photoCaptionHeightPt : 0) +
          (isFirstRow ? lit.photoRowFirstBonusPt : 0),
        atomic: true,
        ref: { photoRange: [start, start + chunk.length] },
      })
    }
  }

  // --- prepared-by (ordinary atomic flowing block — NOT page1Only) ---
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

  return blocks
}
