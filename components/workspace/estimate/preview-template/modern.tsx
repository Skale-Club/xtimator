// components/workspace/estimate/preview-template/modern.tsx
//
// The Modern look of PaginatedPreview. This is a PRINT preview: STRUCTURE,
// ORDER, type sizes, weights, letter-spacing and spacings all mirror
// components/pdf/estimate-pdf-modern.tsx (+ components/pdf/shared/*) — the pt
// values converted with PX_PER_PT (units.ts), weights only 400 / 700 (Lora /
// Lora-Bold), so wrapping inside the (PDF-margined) sheet approximates the
// PDF. The Tailwind vocabulary (font-serif = Lora via --font-serif, hairline
// rules, no brand fills, brand colour only as text / short rules) follows
// components/share/estimate-document-modern.tsx.
//
// Modern is fill-free by design (ESTIMATE_DESIGN_TOKENS.modern
// .solidHeaderFill === false): brandOnFill / cardTintFill are intentionally
// never read here.
import Image from 'next/image'
import type { CSSProperties } from 'react'
import { formatPhoneForDisplay } from '@/lib/phone/format'
import { isPercentageDiscount } from '@/lib/estimate/discount-display'
import { formatDate, formatPercent, formatProjectType } from '@/lib/estimate/document/format'
import { PHOTO_TILE_GAP_PT } from '@/lib/estimate/document/tokens'
import { ReadOnlyPhotoThumb } from './shared'
import { LORA_LH, font, pt, tracking } from './units'
import {
  EditableDate,
  EditableDescription,
  EditableEstimateNumber,
  EditableNumber,
  EditableProjectName,
  EditableSectionTitle,
  EditableSummary,
  EditableTermsText,
  EditableUnit,
  ItemRowActions,
  NewItemSlot,
  SectionActions,
} from './editable'
import type { PreviewTemplate, RenderCtx } from './types'

// Neutral palette — the same literals the Modern PDF's StyleSheet uses.
const INK = 'text-[#1f2937]'
const MUTED = 'text-[#6b7280]'
const LABEL = 'text-[#9ca3af]'
const RULE = 'border-[#d1d5db]'

// styles.infoLabel / termsTitle: 8pt Lora-Bold, light grey, uppercase, 1.5pt
// letter-spacing. One eyebrow for the whole document, exactly like the PDF.
const EYEBROW = `font-bold uppercase ${LABEL} select-none`
const eyebrowStyle = (marginBottomPt: number): CSSProperties => ({
  ...font(8, LORA_LH),
  ...tracking(1.5),
  marginBottom: pt(marginBottomPt),
})
// styles.infoValue: 10pt / 1.6.
const INFO_VALUE = font(10, 1.6)
// styles.termsText: 9pt / 1.6, #4b5563.
const TERMS_TEXT = font(9, 1.6)
// styles.tableCellText: 9.5pt / Lora's 1.28.
const CELL = font(9.5, LORA_LH)
// styles.termsTitle.marginBottom (7pt) / termsText.marginBottom (14pt) / the
// first terms card's topMarginPt (32pt).
const TERMS_TITLE_GAP_PT = 7
const TERMS_TEXT_GAP_PT = 14
const FIRST_TERMS_CARD_TOP_PT = 32
// styles.sectionTitle: 11pt bold, 0.5pt tracking, Lora-Bold line-height.
const SECTION_TITLE_CLASS = 'min-w-0 font-bold select-none'
const SECTION_TITLE_STYLE: CSSProperties = { ...font(11, LORA_LH), ...tracking(0.5) }

function InfoGridBlock({ ctx }: { ctx: RenderCtx }) {
  const { data, L, lang, client, clientAddr, projectType, estimateCreatedAt } = ctx
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4" style={{ marginBottom: pt(28) }}>
      <div>
        <p className={EYEBROW} style={eyebrowStyle(5)}>
          {L.project}
        </p>
        <p className={`font-normal ${INK}`} style={INFO_VALUE}>
          <EditableProjectName ctx={ctx} />
        </p>
        {formatProjectType(projectType) && (
          <p className={`font-normal ${MUTED}`} style={INFO_VALUE}>
            {formatProjectType(projectType)}
          </p>
        )}
        <p className={`font-normal ${MUTED}`} style={{ ...INFO_VALUE, marginTop: pt(4) }}>
          {L.date}:{' '}
          <EditableDate
            ctx={ctx}
            value={data.estimate_date}
            display={formatDate(data.estimate_date ?? estimateCreatedAt, lang)}
          />
        </p>
        <p className={`font-normal ${MUTED}`} style={INFO_VALUE}>
          {L.estimateNum}
          <EditableEstimateNumber ctx={ctx} />
        </p>
      </div>
      {client && (
        <div>
          <p className={EYEBROW} style={eyebrowStyle(5)}>
            {L.billTo}
          </p>
          <p className={`font-bold ${INK}`} style={INFO_VALUE}>
            {client.name}
          </p>
          {client.email && (
            <p className={`font-normal ${MUTED}`} style={INFO_VALUE}>
              {client.email}
            </p>
          )}
          {client.phone && (
            <p className={`font-normal ${MUTED}`} style={INFO_VALUE}>
              {formatPhoneForDisplay(client.phone)}
            </p>
          )}
          {clientAddr && (
            <p className={`font-normal ${MUTED} whitespace-pre-line`} style={INFO_VALUE}>
              {clientAddr}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

// PdfTotalsBlock variant 'modern': hairline-divided rows (10pt, 6pt vertical
// padding, 0.5pt rule), then a standalone hero total in the brand colour (no
// table row, no border above it), then the deposit / balance-due rows. Locked
// order: Subtotal → Discount → Tax → Total → Deposit → Balance Due.
const TOTALS_ROW = 'flex justify-between font-normal border-b border-[#e5e7eb]'
const totalsRowStyle: CSSProperties = { ...font(10, LORA_LH), paddingTop: pt(6), paddingBottom: pt(6) }

function TotalsBlockView({ ctx }: { ctx: RenderCtx }) {
  const { data, L, brandText, fmt, dep } = ctx
  return (
    <div data-page-block-id="totals" className="flex justify-end" style={{ marginTop: pt(28) }}>
      <div className="w-[48%]">
        <div className={TOTALS_ROW} style={totalsRowStyle}>
          <span className={`${MUTED} select-none`}>{L.subtotal}</span>
          <span>{fmt(data.subtotal)}</span>
        </div>
        {data.discount_amount > 0 && (
          <div className={TOTALS_ROW} style={totalsRowStyle}>
            <span className={`${MUTED} select-none`}>
              {L.discount}
              {isPercentageDiscount(data.discount_type) ? ` (${formatPercent(data.discount_value)})` : ''}
            </span>
            <span className="text-[#dc2626]">-{fmt(data.discount_amount)}</span>
          </div>
        )}
        {data.tax_amount > 0 && (
          <div className={TOTALS_ROW} style={totalsRowStyle}>
            <span className={`${MUTED} select-none`}>
              {L.tax} ({formatPercent(data.tax_rate * 100)})
            </span>
            <span>{fmt(data.tax_amount)}</span>
          </div>
        )}
        <div className="flex flex-col items-end" style={{ marginTop: pt(16) }}>
          <p className={`font-bold uppercase ${LABEL} select-none`} style={{ ...font(9, LORA_LH), ...tracking(1.5), marginBottom: pt(4) }}>
            {L.grandTotal}
          </p>
          <p className="font-bold" style={{ ...font(30, LORA_LH), color: brandText }}>
            {fmt(data.total)}
          </p>
        </div>
        {dep.showDeposit && (
          <div className={TOTALS_ROW} style={{ ...totalsRowStyle, marginTop: pt(16) }}>
            <span className={`${MUTED} select-none`}>{L.depositRequired}</span>
            <span>-{fmt(dep.depositAmount)}</span>
          </div>
        )}
        {dep.showDeposit && (
          <div className={TOTALS_ROW} style={totalsRowStyle}>
            <span className={`${MUTED} select-none`}>{L.balanceDue}</span>
            <span>{fmt(dep.balanceDue)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export const modernTemplate: PreviewTemplate = {
  sheetClassName: 'font-serif',

  // PdfHeader (modern): 15pt bold name, 9pt contact line joined by "|",
  // address, logo right; a neutral hairline underneath instead of Classic's
  // brand rule. The PDF draws no owner-name line, so neither does this.
  header(ctx) {
    const { company, companyAddr } = ctx
    const contacts = [company.phone && formatPhoneForDisplay(company.phone), company.email, company.website].filter(
      Boolean
    )
    return (
      <div
        className={`flex items-start justify-between gap-4 border-b ${RULE}`}
        style={{ paddingBottom: pt(20), marginBottom: pt(32) }}
      >
        <div className="min-w-0">
          <p className={`font-bold ${INK}`} style={{ ...font(15, LORA_LH), marginBottom: pt(5) }}>
            {company.name}
          </p>
          {contacts.length > 0 && (
            <p className={`font-normal ${MUTED} whitespace-pre-wrap`} style={font(9, 1.6)}>
              {contacts.join('  |  ')}
            </p>
          )}
          {companyAddr && (
            <p className={`font-normal ${MUTED} whitespace-pre-line`} style={font(9, 1.6)}>
              {companyAddr}
            </p>
          )}
        </div>
        {company.logo_url && (
          <div className="flex-shrink-0">
            <Image
              src={company.logo_url}
              alt={company.name}
              width={Math.round(pt(64))}
              height={Math.round(pt(64))}
              className="object-contain"
            />
          </div>
        )}
      </div>
    )
  },

  // PdfCompactHeader (modern): 11pt bold name left, 8.5pt "Estimate #<n>" right,
  // hairline under it, 18pt of air below.
  compactHeader(ctx) {
    const { company, L, data, defaultEstimateNumber } = ctx
    return (
      <div
        className={`flex items-center justify-between gap-3 border-b ${RULE} select-none`}
        style={{ paddingBottom: pt(8), marginBottom: pt(18) }}
      >
        <span className={`min-w-0 truncate font-bold ${INK}`} style={font(11, LORA_LH)}>
          {company.name}
        </span>
        <span className={`flex-shrink-0 font-normal ${MUTED}`} style={font(8.5, LORA_LH)}>
          {L.estimateNum}
          {data.estimate_number ?? defaultEstimateNumber}
        </span>
      </div>
    )
  },

  // PdfTitleBanner (modern): 13pt bold, 2pt-tracked, brand-coloured title, left
  // aligned, over a SHORT (60pt) brand rule — no fill.
  titleBanner(key, ctx) {
    return (
      <div key={key}>
        <h1
          className="font-bold select-none"
          style={{ ...font(13, LORA_LH), ...tracking(2), color: ctx.brandText, marginBottom: pt(6) }}
        >
          {ctx.L.estimate}
        </h1>
        <div
          className="border-b"
          style={{ borderBottomColor: ctx.brandColor, width: pt(60), marginBottom: pt(28) }}
        />
      </div>
    )
  },

  infoGrid(key, ctx) {
    return <InfoGridBlock key={key} ctx={ctx} />
  },

  // Eyebrow + text; the PDF trims the text's bottom margin to 6pt here.
  summary(key, text, ctx) {
    return (
      <div key={key}>
        <p className={EYEBROW} style={eyebrowStyle(5)}>
          {ctx.L.summary}
        </p>
        <p className="font-normal text-[#4b5563] whitespace-pre-line" style={{ ...TERMS_TEXT, marginBottom: pt(6) }}>
          <EditableSummary ctx={ctx} text={text} />
        </p>
      </div>
    )
  },

  // Section title in the readable brand colour over a DARK 1pt rule — no
  // fill. The continuation band drops the leading margin (the compact header
  // above already carries its own).
  sectionHeader(key, sectionId, ctx, continued) {
    const section = ctx.sectionsById.get(sectionId)
    const title = section?.title ?? ''
    if (continued) {
      return (
        <div
          key={key}
          data-testid="continuation-title"
          className="flex items-baseline gap-1 border-b border-[#1f2937]"
          style={{ paddingTop: pt(6), paddingBottom: pt(6) }}
        >
          <span className={`${SECTION_TITLE_CLASS} truncate max-w-[80%]`} style={{ ...SECTION_TITLE_STYLE, color: ctx.brandText }}>
            {title}
          </span>
          <span className={`${SECTION_TITLE_CLASS} flex-shrink-0`} style={{ ...SECTION_TITLE_STYLE, color: ctx.brandText }}>
            {ctx.L.continued}
          </span>
        </div>
      )
    }
    return (
      <div
        key={key}
        data-page-block-id={`${sectionId}-header`}
        className="group relative flex items-center border-b border-[#1f2937]"
        style={{ marginTop: pt(22), paddingTop: pt(6), paddingBottom: pt(6) }}
      >
        <span className={`${SECTION_TITLE_CLASS} flex-1`} style={{ ...SECTION_TITLE_STYLE, color: ctx.brandText }}>
          <EditableSectionTitle ctx={ctx} sectionId={sectionId} title={title} />
        </span>
        <SectionActions ctx={ctx} sectionId={sectionId} />
      </div>
    )
  },

  // styles.tableHeader: light 8.5pt bold uppercase labels (0.5pt tracking) over
  // a hairline, 8pt vertical padding; no fill.
  tableHead(ctx, testId) {
    const { L } = ctx
    const th = `font-bold ${LABEL}`
    const thStyle: CSSProperties = {
      ...font(8.5, LORA_LH),
      ...tracking(0.5),
      paddingTop: pt(8),
      paddingBottom: pt(8),
    }
    return (
      <thead data-testid={testId}>
        <tr className={`border-b ${RULE} uppercase`}>
          <th className={`${th} px-0 text-left`} style={thStyle}>{L.description}</th>
          <th className={`${th} px-0 text-center`} style={thStyle}>{L.qty}</th>
          <th className={`${th} px-0 text-center`} style={thStyle}>{L.unit}</th>
          <th className={`${th} px-0 text-right`} style={thStyle}>{L.unitPrice}</th>
          <th className={`${th} px-0 text-right`} style={thStyle}>{L.total}</th>
        </tr>
      </thead>
    )
  },

  // styles.tableRow: 8pt vertical padding, 9.5pt cells, hairline rule, no zebra
  // (the PDF's tableRowAlt is empty).
  itemRow(block, item, _itemIndex, ctx) {
    const cell: CSSProperties = { ...CELL, paddingTop: pt(8), paddingBottom: pt(8) }
    const sectionId = block.ref?.sectionId ?? ''
    return (
      <tr
        key={block.id}
        data-page-block-id={block.id}
        data-item-id={item.id}
        className="group border-b border-[#f0f1f3] font-normal"
      >
        <td className="relative px-0" style={cell}>
          <ItemRowActions ctx={ctx} sectionId={sectionId} item={item} />
          <EditableDescription ctx={ctx} sectionId={sectionId} item={item} />
        </td>
        <td className="px-0 text-center" style={cell}>
          <EditableNumber
            ctx={ctx}
            value={item.quantity}
            ariaLabel={ctx.L.qty}
            onCommit={(v) => ctx.edit?.dispatch({ type: 'UPDATE_ITEM', sectionId, itemId: item.id, field: 'quantity', value: v })}
          />
        </td>
        <td className="px-0 text-center" style={cell}>
          <EditableUnit ctx={ctx} sectionId={sectionId} item={item} />
        </td>
        <td className="px-0 text-right whitespace-nowrap" style={cell}>
          <EditableNumber
            ctx={ctx}
            value={item.unit_price}
            format={ctx.fmt}
            ariaLabel={ctx.L.unitPrice}
            onCommit={(v) => ctx.edit?.dispatch({ type: 'UPDATE_ITEM', sectionId, itemId: item.id, field: 'unit_price', value: v })}
          />
        </td>
        <td className="px-0 text-right whitespace-nowrap" style={cell}>{ctx.fmt(item.total)}</td>
      </tr>
    )
  },

  // styles.sectionSubtotal: 8pt padding, 0.5pt top rule, 9pt bold label (12pt
  // right margin) + value in the Total column's 18%.
  sectionSubtotal(block, subtotal, ctx) {
    return (
      <div
        key={block.id}
        data-page-block-id={block.id}
        className={`group relative flex justify-end items-baseline border-t ${RULE}`}
        style={{ ...font(9, LORA_LH), paddingTop: pt(8), paddingBottom: pt(8) }}
      >
        <NewItemSlot ctx={ctx} sectionId={block.ref?.sectionId ?? ''} />
        <span className={`font-bold ${MUTED} select-none`} style={{ marginRight: pt(12) }}>
          {ctx.L.sectionSubtotal}
        </span>
        <span className="font-bold text-right w-[18%]">{ctx.fmt(subtotal)}</span>
      </div>
    )
  },

  totals(key, ctx) {
    return <TotalsBlockView key={key} ctx={ctx} />
  },

  // Eyebrow label + text — NO tinted card, no border. The first card of the
  // document gets 32pt of air above it (the PDF's topMarginPt); "Estimate
  // Terms" carries its eyebrow in the brand colour.
  termsCard(block, card, ctx) {
    return (
      <div
        key={block.id}
        data-page-block-id={`terms-${card.key}`}
        style={card.isFirst ? { marginTop: pt(FIRST_TERMS_CARD_TOP_PT) } : undefined}
      >
        <p
          className={EYEBROW}
          style={{
            ...eyebrowStyle(TERMS_TITLE_GAP_PT),
            ...(card.key === 'estimate' ? { color: ctx.brandText } : {}),
          }}
        >
          {card.label}
        </p>
        <p
          className="font-normal text-[#4b5563] whitespace-pre-line"
          style={{ ...TERMS_TEXT, marginBottom: pt(TERMS_TEXT_GAP_PT) }}
        >
          <EditableTermsText ctx={ctx} card={card} />
        </p>
      </div>
    )
  },

  // PdfSignatureBlock (modern, box-less): eyebrow, 150x40pt image, 9pt name and
  // date.
  signature(block, signature, ctx) {
    return (
      <div key={block.id} data-page-block-id="signature" style={{ marginTop: pt(16) }}>
        <p className={EYEBROW} style={eyebrowStyle(TERMS_TITLE_GAP_PT)}>
          {ctx.L.signedBy}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={signature.signatureDataUrl}
          alt={ctx.L.signedBy}
          className="object-contain"
          style={{ width: pt(150), height: pt(40) }}
        />
        <p className="font-normal" style={{ ...font(9, LORA_LH), marginTop: pt(4) }}>
          {signature.signerName}
        </p>
        <p className={`font-normal ${MUTED}`} style={font(9, LORA_LH)}>
          {formatDate(signature.signedAt, ctx.lang)}
        </p>
      </div>
    )
  },

  // PdfPhotoGrid (modern): 20pt above the first row, one tile gap between
  // later rows; square tiles, no frame, 8pt captions.
  photoRow(block, photos, showLabel, ctx) {
    return (
      <div
        key={block.id}
        data-page-block-id={block.id}
        style={{ marginTop: pt(showLabel ? 20 : PHOTO_TILE_GAP_PT) }}
      >
        {showLabel && (
          <p className={EYEBROW} style={eyebrowStyle(TERMS_TITLE_GAP_PT)}>
            {ctx.L.photos}
          </p>
        )}
        {/* grid-cols-3 matches the engine's photosPerRow chunk size (always 3
            for both templates' contentWidthPt); the gap is the PDF's tile gap. */}
        <div className="grid grid-cols-3" style={{ gap: pt(PHOTO_TILE_GAP_PT) }}>
          {photos.map((photo) => (
            <ReadOnlyPhotoThumb
              key={photo.id}
              photo={photo}
              frameClassName="aspect-square overflow-hidden relative bg-[#f3f4f6]"
              captionClassName={`font-normal ${MUTED} line-clamp-2`}
              captionStyle={{ ...font(8, LORA_LH), marginTop: pt(2) }}
            />
          ))}
        </div>
      </div>
    )
  },

  preparedBy(block, name, ctx) {
    return (
      <div key={block.id} data-page-block-id="prepared-by" style={{ marginTop: pt(20) }}>
        <p className={EYEBROW} style={eyebrowStyle(5)}>
          {ctx.L.preparedBy}
        </p>
        <p className="font-normal" style={INFO_VALUE}>
          {name}
        </p>
      </div>
    )
  },
}
