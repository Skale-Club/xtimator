// components/workspace/estimate/preview-template/classic.tsx
//
// The Classic look of PaginatedPreview: brand-filled title banner and section
// bands, zebra rows, tinted terms/signature cards. STRUCTURE, type sizes and
// spacings follow components/pdf/estimate-pdf.tsx's StyleSheet (+
// components/pdf/shared/*) converted pt -> px with PX_PER_PT — the same
// approach modern.tsx uses — so a sheet's content is about as tall as the PDF
// page's and stays within Letter height. The sheet itself supplies the page
// margins (PaginatedPreview pads it from ESTIMATE_PAGE_GEOMETRY), so no block
// carries its own page gutter: every band spans the content width like the
// PDF's. Colours stay on the app's muted/border tokens (the preview's
// light-pinned theme) rather than the PDF's hex literals.
import Image from 'next/image'
import { formatPhoneForDisplay } from '@/lib/phone/format'
import { isPercentageDiscount } from '@/lib/estimate/discount-display'
import { formatDate } from '@/lib/estimate/document/format'
import { CLASSIC_CARD_BOX, PHOTO_TILE_GAP_PT, PX_PER_PT, cardTintFill } from '@/lib/estimate/document/tokens'
import type { CSSProperties } from 'react'
import { ReadOnlyPhotoThumb } from './shared'
import type { PreviewTemplate, RenderCtx } from './types'

// components/pdf/estimate-pdf.tsx styles.sectionHeader.paddingHorizontal: the
// title text sits 10pt inside a brand band that spans the content width. The
// pagination engine wraps the title at the same inset
// (TEMPLATE_LITERALS.classic.sectionTitleHorizontalPaddingPt) — keep in step.
const SECTION_TITLE_INSET_PT = 10
const SECTION_TITLE_INSET_PX = SECTION_TITLE_INSET_PT * PX_PER_PT

const pt = (v: number) => v * PX_PER_PT
/** font-size (+ optional line-height) in the PDF's pt, as px. */
const font = (sizePt: number, lineHeight?: number): CSSProperties => ({
  fontSize: pt(sizePt),
  ...(lineHeight ? { lineHeight } : {}),
})

// styles.infoLabel / termsTitle: 8pt bold, uppercase, 1pt tracking. ONE eyebrow
// for the whole document, like the PDF.
const EYEBROW = 'font-semibold uppercase text-muted-foreground select-none'
const eyebrowStyle = (marginBottomPt: number): CSSProperties => ({
  ...font(8, 1.21),
  letterSpacing: pt(1),
  marginBottom: pt(marginBottomPt),
})
// styles.infoValue: 10pt / 1.5.
const INFO_VALUE = font(10, 1.5)
// styles.termsText: 9pt / 1.5.
const TERMS_TEXT = font(9, 1.5)
// styles.tableCellText: 9pt / Inter's 1.21.
const CELL = font(9, 1.21)

/** The tinted card box terms + signature share (tokens.ts CLASSIC_CARD_BOX). */
const cardBoxStyle = (brandColor: string): CSSProperties => ({
  backgroundColor: cardTintFill(brandColor),
  padding: pt(CLASSIC_CARD_BOX.paddingPt),
  borderRadius: pt(CLASSIC_CARD_BOX.radiusPt),
  marginBottom: pt(CLASSIC_CARD_BOX.marginBottomPt),
})
const FIRST_TERMS_CARD_TOP_PT = 24

function InfoGridBlock({ ctx }: { ctx: RenderCtx }) {
  const { data, L, lang, client, clientAddr, projectName, projectType, estimateCreatedAt, defaultEstimateNumber } = ctx
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4" style={{ marginBottom: pt(20) }}>
      <div>
        <p className={EYEBROW} style={eyebrowStyle(4)}>
          {L.project}
        </p>
        <p className="text-xl font-bold leading-snug">{projectName}</p>
        {projectType && (
          <p className="text-muted-foreground capitalize" style={INFO_VALUE}>
            {projectType.replace(/_/g, ' ')}
          </p>
        )}
        <p className="text-muted-foreground" style={{ ...INFO_VALUE, marginTop: pt(4) }}>
          {L.date}: {formatDate(data.estimate_date ?? estimateCreatedAt, lang)}
        </p>
        <p className="text-muted-foreground tabular-nums" style={INFO_VALUE}>
          {L.estimateNum}{data.estimate_number ?? defaultEstimateNumber}
        </p>
      </div>
      {client && (
        <div>
          <p className={EYEBROW} style={eyebrowStyle(4)}>
            {L.billTo}
          </p>
          <p className="text-xl font-bold leading-snug">{client.name}</p>
          {client.email && (
            <p className="text-muted-foreground" style={INFO_VALUE}>
              {client.email}
            </p>
          )}
          {client.phone && (
            <p className="text-muted-foreground" style={INFO_VALUE}>
              {formatPhoneForDisplay(client.phone)}
            </p>
          )}
          {clientAddr && (
            <p className="text-muted-foreground whitespace-pre-line" style={INFO_VALUE}>
              {clientAddr}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// styles.totalsRow: 10pt, 4pt vertical padding, 0.5pt rule. Deposit / balance
// rows use the same row (locked order: Subtotal -> Discount -> Tax -> Total ->
// Deposit -> Balance Due).
const TOTALS_ROW = 'flex justify-between border-b border-border/50'
const totalsRowStyle: CSSProperties = { ...font(10, 1.21), paddingTop: pt(4), paddingBottom: pt(4) }

function TotalsBlockView({ ctx }: { ctx: RenderCtx }) {
  const { data, L, brandText, fmt, dep } = ctx
  return (
    <div data-page-block-id="totals" className="flex justify-end" style={{ marginTop: pt(20) }}>
      <div className="w-[45%]">
        <div className={TOTALS_ROW} style={totalsRowStyle}>
          <span className="text-muted-foreground select-none">{L.subtotal}</span>
          <span className="tabular-nums">{fmt(data.subtotal)}</span>
        </div>
        {data.discount_amount > 0 && (
          <div className={TOTALS_ROW} style={totalsRowStyle}>
            <span className="text-muted-foreground select-none">
              {L.discount}
              {isPercentageDiscount(data.discount_type) ? ` (${data.discount_value}%)` : ''}
            </span>
            <span className="tabular-nums text-destructive">-{fmt(data.discount_amount)}</span>
          </div>
        )}
        {data.tax_amount > 0 && (
          <div className={TOTALS_ROW} style={totalsRowStyle}>
            <span className="text-muted-foreground select-none">
              {L.tax} ({(data.tax_rate * 100).toFixed(2)}%)
            </span>
            <span className="tabular-nums">{fmt(data.tax_amount)}</span>
          </div>
        )}
        <div
          className="flex justify-between items-baseline border-t-2 font-bold"
          style={{
            ...font(14, 1.21),
            borderTopColor: brandText,
            paddingTop: pt(8),
            paddingBottom: pt(8),
            marginTop: pt(4),
          }}
        >
          <span className="select-none">{L.grandTotal}</span>
          <span className="tabular-nums" style={{ color: brandText }}>
            {fmt(data.total)}
          </span>
        </div>
        {dep.showDeposit && (
          <div className={TOTALS_ROW} style={totalsRowStyle}>
            <span className="text-muted-foreground select-none">{L.deposit}</span>
            <span className="tabular-nums">-{fmt(dep.depositAmount)}</span>
          </div>
        )}
        {dep.showDeposit && (
          <div className={TOTALS_ROW} style={totalsRowStyle}>
            <span className="text-muted-foreground select-none">{L.balanceDue}</span>
            <span className="tabular-nums">{fmt(dep.balanceDue)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export const classicTemplate: PreviewTemplate = {
  sheetClassName: '',

  // PdfHeader (classic): 18pt bold company name in the brand colour, 9pt
  // contact lines, a brand-coloured 2pt rule underneath (16pt below the text,
  // 24pt above the next block). 18pt = 24px = text-2xl.
  header(ctx) {
    const { company, brandColor, brandText, companyAddr } = ctx
    return (
      <div
        className="flex items-start justify-between gap-4 border-b-2"
        style={{ borderBottomColor: brandColor, paddingBottom: pt(16), marginBottom: pt(24) }}
      >
        <div className="min-w-0">
          <p className="font-bold text-2xl leading-tight" style={{ color: brandText }}>
            {company.name}
          </p>
          {company.owner_name && (
            <p className="text-muted-foreground" style={{ ...font(9, 1.5), marginTop: pt(2) }}>
              {company.owner_name}
            </p>
          )}
          <p className="text-muted-foreground" style={font(9, 1.5)}>
            {[company.phone && formatPhoneForDisplay(company.phone), company.email, company.website]
              .filter(Boolean)
              .join('  ·  ')}
          </p>
          {companyAddr && (
            <p className="text-muted-foreground whitespace-pre-line" style={font(9, 1.5)}>
              {companyAddr}
            </p>
          )}
        </div>
        {company.logo_url && (
          <div className="flex-shrink-0">
            <Image
              src={company.logo_url}
              alt={company.name}
              width={Math.round(pt(72))}
              height={Math.round(pt(72))}
              className="object-contain"
            />
          </div>
        )}
      </div>
    )
  },

  // Mirrors the PDF's pages-2+ compact header (components/pdf/shared/
  // pdf-compact-header.tsx): ONE line — company name left, "Estimate #<number>"
  // right (same label + number the info grid shows) — over a bottom rule.
  compactHeader(ctx) {
    const { company, brandText, L, data, defaultEstimateNumber } = ctx
    return (
      <div className="select-none" style={{ marginBottom: pt(14) }}>
        <div
          className="flex items-center justify-between gap-3 border-b border-zinc-200"
          style={{ paddingBottom: pt(6) }}
        >
          <span className="min-w-0 truncate font-semibold leading-tight" style={{ ...font(11), color: brandText }}>
            {company.name}
          </span>
          <span className="flex-shrink-0 text-muted-foreground" style={font(9)}>
            {L.estimateNum}
            {data.estimate_number ?? defaultEstimateNumber}
          </span>
        </div>
      </div>
    )
  },

  // PdfTitleBanner (classic): brand-filled band, 16pt vertical padding, centred
  // 24pt bold title, 20pt below.
  titleBanner(key, ctx) {
    return (
      <div
        key={key}
        className="text-center"
        style={{ backgroundColor: ctx.brandColor, paddingTop: pt(16), paddingBottom: pt(16), marginBottom: pt(20) }}
      >
        <h1
          className="font-bold tracking-widest select-none"
          style={{ ...font(24, 1.21), color: ctx.brandOnFill }}
        >
          {ctx.L.estimate}
        </h1>
      </div>
    )
  },

  infoGrid(key, ctx) {
    return <InfoGridBlock key={key} ctx={ctx} />
  },

  summary(key, text, ctx) {
    return (
      <div key={key} style={{ marginBottom: pt(16) }}>
        <p className={EYEBROW} style={eyebrowStyle(4)}>
          {ctx.L.summary}
        </p>
        <p className="text-muted-foreground whitespace-pre-line" style={TERMS_TEXT}>
          {text}
        </p>
      </div>
    )
  },

  sectionHeader(key, sectionId, ctx, continued) {
    const section = ctx.sectionsById.get(sectionId)
    // styles.sectionHeader: the band spans the sheet's content width (no
    // full-bleed) with the PDF's 10pt title inset on both sides, 8pt vertical
    // padding, 16pt above (the continuation band drops the margin — the compact
    // header above already carries its own).
    const bandStyle: CSSProperties = {
      backgroundColor: ctx.brandColor,
      paddingLeft: SECTION_TITLE_INSET_PX,
      paddingRight: SECTION_TITLE_INSET_PX,
      paddingTop: pt(8),
      paddingBottom: pt(8),
      ...font(11, 1.21),
    }
    if (continued) {
      // PGBRK-03 continuation title — mirrors the PDF's PdfSectionHeader with
      // `continuedLabel`: the section title (single line, ellipsised) followed by
      // the localized "(cont.)" suffix, on the same brand band as a normal section
      // header. Deliberately NO data-page-block-id: it is not an engine block (its
      // height is the continuation reservation), and `${sectionId}-header`
      // already names the section's real header block on an earlier page.
      return (
        <div key={key} data-testid="continuation-title" className="flex items-center gap-1" style={bandStyle}>
          <span className="min-w-0 truncate font-bold select-none" style={{ color: ctx.brandOnFill }}>
            {section?.title ?? ''}
          </span>
          <span className="flex-shrink-0 font-bold select-none" style={{ color: ctx.brandOnFill }}>
            {ctx.L.continued}
          </span>
        </div>
      )
    }
    return (
      <div
        key={key}
        data-page-block-id={`${sectionId}-header`}
        className="flex items-center gap-2"
        style={{ ...bandStyle, marginTop: pt(16) }}
      >
        <span className="flex-1 font-bold select-none" style={{ color: ctx.brandOnFill }}>
          {section?.title ?? ''}
        </span>
      </div>
    )
  },

  // styles.tableHeader: tinted band, 6pt vertical padding, 9pt bold labels.
  tableHead(ctx, testId) {
    const { L } = ctx
    const th = 'font-bold'
    const thStyle: CSSProperties = { ...font(9, 1.21), paddingTop: pt(6), paddingBottom: pt(6) }
    return (
      <thead data-testid={testId}>
        <tr className="bg-muted/50 text-muted-foreground border-b border-border/50">
          <th className={`${th} pl-0 pr-2 text-left`} style={thStyle}>{L.description}</th>
          <th className={`${th} px-2 text-center`} style={thStyle}>{L.qty}</th>
          <th className={`${th} px-2 text-center`} style={thStyle}>{L.unit}</th>
          <th className={`${th} px-2 text-right`} style={thStyle}>{L.unitPrice}</th>
          <th className={`${th} pl-0 pr-0 text-right`} style={thStyle}>{L.total}</th>
        </tr>
      </thead>
    )
  },

  // styles.tableRow: 6pt vertical padding, 9pt cells, 0.5pt rule, zebra on odd
  // GLOBAL item index.
  itemRow(block, item, itemIndex, ctx) {
    const zebra = itemIndex % 2 === 1
    const cell: CSSProperties = { ...CELL, paddingTop: pt(6), paddingBottom: pt(6) }
    return (
      <tr
        key={block.id}
        data-page-block-id={block.id}
        data-item-id={item.id}
        className={`border-b border-border/50 ${zebra ? 'bg-muted/40' : ''}`}
      >
        <td className="pl-0 pr-2" style={cell}>{item.description}</td>
        <td className="px-2 text-center tabular-nums" style={cell}>{item.quantity}</td>
        <td className="px-2 text-center" style={cell}>{item.unit ?? ''}</td>
        <td className="px-2 text-right tabular-nums whitespace-nowrap" style={cell}>{ctx.fmt(item.unit_price)}</td>
        <td className="pl-0 pr-0 text-right tabular-nums whitespace-nowrap" style={cell}>{ctx.fmt(item.total)}</td>
      </tr>
    )
  },

  // styles.sectionSubtotal: 6pt padding, 1pt top rule, 9pt bold label + value
  // (value in the Total column's 18%).
  sectionSubtotal(block, subtotal, ctx) {
    return (
      <div
        key={block.id}
        data-page-block-id={block.id}
        className="flex justify-end items-baseline border-t border-border bg-muted/10"
        style={{ ...font(9, 1.21), paddingTop: pt(6), paddingBottom: pt(6) }}
      >
        <span className="font-bold text-muted-foreground select-none" style={{ marginRight: pt(12) }}>
          {ctx.L.sectionSubtotal}
        </span>
        <span className="font-bold tabular-nums text-right w-[18%]">{ctx.fmt(subtotal)}</span>
      </div>
    )
  },

  totals(key, ctx) {
    return <TotalsBlockView key={key} ctx={ctx} />
  },

  // PdfTermsCard with CLASSIC_CARD_BOX + brand tint; the first card of the
  // document gets 24pt above it.
  termsCard(block, card, ctx) {
    return (
      <div
        key={block.id}
        data-page-block-id={`terms-${card.key}`}
        data-card-box=""
        style={{ ...cardBoxStyle(ctx.brandColor), ...(card.isFirst ? { marginTop: pt(FIRST_TERMS_CARD_TOP_PT) } : {}) }}
      >
        <p className={EYEBROW} style={eyebrowStyle(6)}>
          {card.label}
        </p>
        <p className="text-muted-foreground whitespace-pre-line" style={TERMS_TEXT}>
          {card.text}
        </p>
      </div>
    )
  },

  // PdfSignatureBlock with the same card box: eyebrow, 150x40pt image, name
  // and date stacked (9pt).
  signature(block, signature, ctx) {
    return (
      <div
        key={block.id}
        data-page-block-id="signature"
        data-card-box=""
        style={{ ...cardBoxStyle(ctx.brandColor), marginTop: pt(16) }}
      >
        <p className={EYEBROW} style={eyebrowStyle(6)}>
          {ctx.L.signedBy}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={signature.signatureDataUrl}
          alt={ctx.L.signedBy}
          className="object-contain"
          style={{ width: pt(150), height: pt(40) }}
        />
        <p style={{ ...font(9, 1.21), marginTop: pt(4) }}>{signature.signerName}</p>
        <p className="text-muted-foreground" style={font(9, 1.21)}>
          {formatDate(signature.signedAt, ctx.lang)}
        </p>
      </div>
    )
  },

  // PdfPhotoGrid: 16pt above the first row, one tile gap between later rows,
  // square tiles, 8pt captions. grid-cols-3 matches the engine's photosPerRow
  // chunk size (always 3 for both templates' contentWidthPt).
  photoRow(block, photos, showLabel, ctx) {
    return (
      <div
        key={block.id}
        data-page-block-id={block.id}
        style={{ marginTop: pt(showLabel ? 16 : PHOTO_TILE_GAP_PT) }}
      >
        {showLabel && (
          <p className={EYEBROW} style={eyebrowStyle(6)}>
            {ctx.L.photos}
          </p>
        )}
        <div className="grid grid-cols-3" style={{ gap: pt(PHOTO_TILE_GAP_PT) }}>
          {photos.map((photo) => (
            <ReadOnlyPhotoThumb
              key={photo.id}
              photo={photo}
              frameClassName="aspect-square overflow-hidden rounded relative ring-1 ring-border/50"
              captionClassName="text-muted-foreground line-clamp-2 text-[11px] mt-0.5"
            />
          ))}
        </div>
      </div>
    )
  },

  preparedBy(block, name, ctx) {
    return (
      <div key={block.id} data-page-block-id="prepared-by" style={{ marginTop: pt(16) }}>
        <p className={EYEBROW} style={eyebrowStyle(4)}>
          {ctx.L.preparedBy}
        </p>
        <p className="text-muted-foreground" style={INFO_VALUE}>
          {name}
        </p>
      </div>
    )
  },
}
