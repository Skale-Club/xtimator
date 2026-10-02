// components/workspace/estimate/preview-template/modern.tsx
//
// The Modern look of PaginatedPreview. STRUCTURE and ORDER mirror
// components/pdf/estimate-pdf-modern.tsx (+ components/pdf/shared/*), which is
// the source of truth; the Tailwind vocabulary (font-serif = Lora via
// --font-serif, hairline rules, no brand fills, brand colour only as text /
// short rules) follows components/share/estimate-document-modern.tsx. Type
// sizes and spacing are the PDF's pt values converted at the sheet's 96dpi
// scale, so wrapping inside the (PDF-margined) sheet approximates the PDF.
//
// Modern is fill-free by design (ESTIMATE_DESIGN_TOKENS.modern
// .solidHeaderFill === false): brandOnFill / cardTintFill are intentionally
// never read here.
import Image from 'next/image'
import { formatPhoneForDisplay } from '@/lib/phone/format'
import { isPercentageDiscount } from '@/lib/estimate/discount-display'
import { formatDate } from '@/lib/estimate/document/format'
import { PHOTO_TILE_GAP_PT, PX_PER_PT } from '@/lib/estimate/document/tokens'
import { ReadOnlyPhotoThumb } from './shared'
import type { PreviewTemplate, RenderCtx } from './types'

// Neutral palette — the same literals the Modern PDF's StyleSheet uses.
const INK = 'text-[#1f2937]'
const MUTED = 'text-[#6b7280]'
const LABEL = 'text-[#9ca3af]'
const RULE = 'border-[#d1d5db]'

// components/pdf/estimate-pdf-modern.tsx styles.infoLabel / termsTitle: 8pt
// bold, light grey, uppercase, 1.5pt letter-spacing. One eyebrow style for the
// whole document, exactly like the PDF.
const EYEBROW = `text-[11px] leading-[1.28] font-bold uppercase tracking-[0.15em] ${LABEL} select-none`

const pt = (v: number) => v * PX_PER_PT
// styles.termsTitle.marginBottom (7pt) / termsText.marginBottom (14pt) / the
// first terms card's topMarginPt (32pt).
const TERMS_TITLE_GAP_PT = 7
const TERMS_TEXT_GAP_PT = 14
const FIRST_TERMS_CARD_TOP_PT = 32

function InfoGridBlock({ ctx }: { ctx: RenderCtx }) {
  const { data, L, lang, client, clientAddr, projectName, projectType, estimateCreatedAt, defaultEstimateNumber } = ctx
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4" style={{ marginBottom: pt(28) }}>
      <div>
        <p className={`${EYEBROW} mb-1.5`}>{L.project}</p>
        <p className={`text-xl font-bold leading-snug ${INK}`}>{projectName}</p>
        {projectType && (
          <p className={`text-[13px] leading-[1.6] ${MUTED} capitalize`}>{projectType.replace(/_/g, ' ')}</p>
        )}
        <p className={`text-[13px] leading-[1.6] ${MUTED} mt-1`}>
          {L.date}: {formatDate(data.estimate_date ?? estimateCreatedAt, lang)}
        </p>
        <p className={`text-[13px] leading-[1.6] ${MUTED} tabular-nums`}>
          {L.estimateNum}
          {data.estimate_number ?? defaultEstimateNumber}
        </p>
      </div>
      {client && (
        <div>
          <p className={`${EYEBROW} mb-1.5`}>{L.billTo}</p>
          <p className={`text-xl font-bold leading-snug ${INK}`}>{client.name}</p>
          {client.email && <p className={`text-[13px] leading-[1.6] ${MUTED}`}>{client.email}</p>}
          {client.phone && (
            <p className={`text-[13px] leading-[1.6] ${MUTED}`}>{formatPhoneForDisplay(client.phone)}</p>
          )}
          {clientAddr && (
            <p className={`text-[13px] leading-[1.6] ${MUTED} whitespace-pre-line`}>{clientAddr}</p>
          )}
        </div>
      )}
    </div>
  )
}

// PdfTotalsBlock variant 'modern': hairline-divided rows, then a standalone
// hero total in the brand colour (no table row, no border above it), then the
// deposit / balance-due rows. Locked order: Subtotal → Discount → Tax → Total →
// Deposit → Balance Due.
function TotalsBlockView({ ctx }: { ctx: RenderCtx }) {
  const { data, L, brandText, fmt, dep } = ctx
  const row = `flex justify-between py-2 border-b border-[#e5e7eb] text-[13px] leading-[1.28]`
  return (
    <div data-page-block-id="totals" className="flex justify-end" style={{ marginTop: pt(28) }}>
      <div className="w-[48%]">
        <div className={row}>
          <span className={`${MUTED} select-none`}>{L.subtotal}</span>
          <span className="tabular-nums">{fmt(data.subtotal)}</span>
        </div>
        {data.discount_amount > 0 && (
          <div className={row}>
            <span className={`${MUTED} select-none`}>
              {L.discount}
              {isPercentageDiscount(data.discount_type) ? ` (${data.discount_value}%)` : ''}
            </span>
            <span className="tabular-nums text-[#dc2626]">-{fmt(data.discount_amount)}</span>
          </div>
        )}
        {data.tax_amount > 0 && (
          <div className={row}>
            <span className={`${MUTED} select-none`}>
              {L.tax} ({(data.tax_rate * 100).toFixed(2)}%)
            </span>
            <span className="tabular-nums">{fmt(data.tax_amount)}</span>
          </div>
        )}
        <div className="flex flex-col items-end" style={{ marginTop: pt(16) }}>
          <p className={`text-xs font-bold uppercase tracking-[0.15em] ${LABEL} mb-1.5 select-none`}>{L.grandTotal}</p>
          <p className="text-[40px] leading-none font-bold tabular-nums" style={{ color: brandText }}>
            {fmt(data.total)}
          </p>
        </div>
        {dep.showDeposit && (
          <div className={row} style={{ marginTop: pt(16) }}>
            <span className={`${MUTED} select-none`}>{L.deposit}</span>
            <span className="tabular-nums">-{fmt(dep.depositAmount)}</span>
          </div>
        )}
        {dep.showDeposit && (
          <div className={row}>
            <span className={`${MUTED} select-none`}>{L.balanceDue}</span>
            <span className="tabular-nums">{fmt(dep.balanceDue)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

const SECTION_TITLE = 'min-w-0 font-bold text-sm tracking-[0.04em] leading-[1.28] select-none'

export const modernTemplate: PreviewTemplate = {
  sheetClassName: 'font-serif',

  // PdfHeader (modern): name bold, one contact line joined by "|", address,
  // logo right; a neutral hairline underneath instead of Classic's brand strip.
  // The PDF draws no owner-name line, so neither does this.
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
          <p className={`font-bold text-2xl leading-tight mb-1 ${INK}`}>{company.name}</p>
          {contacts.length > 0 && <p className={`text-xs leading-[1.6] ${MUTED}`}>{contacts.join('  |  ')}</p>}
          {companyAddr && <p className={`text-xs leading-[1.6] ${MUTED} whitespace-pre-line`}>{companyAddr}</p>}
        </div>
        {company.logo_url && (
          <div className="flex-shrink-0">
            <Image src={company.logo_url} alt={company.name} width={64} height={64} className="object-contain" />
          </div>
        )}
      </div>
    )
  },

  // PdfCompactHeader (modern): name bold left, "Estimate #<n>" right, hairline
  // under it, 18pt of air below.
  compactHeader(ctx) {
    const { company, L, data, defaultEstimateNumber } = ctx
    return (
      <div
        className={`flex items-center justify-between gap-3 border-b ${RULE} select-none`}
        style={{ paddingBottom: pt(8), marginBottom: pt(18) }}
      >
        <span className={`min-w-0 truncate text-sm font-bold leading-tight ${INK}`}>{company.name}</span>
        <span className={`flex-shrink-0 text-[11px] ${MUTED}`}>
          {L.estimateNum}
          {data.estimate_number ?? defaultEstimateNumber}
        </span>
      </div>
    )
  },

  // PdfTitleBanner (modern): small letter-spaced brand-coloured title, left
  // aligned, over a SHORT brand rule — no fill.
  titleBanner(key, ctx) {
    return (
      <div key={key}>
        <h1
          className="text-[17px] leading-[1.28] font-bold tracking-[0.15em] select-none"
          style={{ color: ctx.brandText, marginBottom: pt(6) }}
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
        <p className={`${EYEBROW} mb-1.5`}>{ctx.L.summary}</p>
        <p className="text-xs leading-[1.6] text-[#4b5563] whitespace-pre-line mb-2">{text}</p>
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
          <span className={`${SECTION_TITLE} truncate max-w-[80%]`} style={{ color: ctx.brandText }}>
            {title}
          </span>
          <span className={`${SECTION_TITLE} flex-shrink-0`} style={{ color: ctx.brandText }}>
            {ctx.L.continued}
          </span>
        </div>
      )
    }
    return (
      <div
        key={key}
        data-page-block-id={`${sectionId}-header`}
        className="flex items-center border-b border-[#1f2937]"
        style={{ marginTop: pt(22), paddingTop: pt(6), paddingBottom: pt(6) }}
      >
        <span className={`${SECTION_TITLE} flex-1`} style={{ color: ctx.brandText }}>
          {title}
        </span>
      </div>
    )
  },

  // Light uppercase column labels over a hairline; no fill.
  tableHead(ctx, testId) {
    const { L } = ctx
    return (
      <thead data-testid={testId}>
        <tr className={`border-b ${RULE} text-[11px] font-bold uppercase tracking-[0.05em] ${LABEL}`}>
          <th className="py-2.5 pl-0 pr-2 text-left font-bold">{L.description}</th>
          <th className="py-2.5 px-2 text-center font-bold">{L.qty}</th>
          <th className="py-2.5 px-2 text-center font-bold">{L.unit}</th>
          <th className="py-2.5 px-2 text-right font-bold">{L.unitPrice}</th>
          <th className="py-2.5 pl-0 pr-0 text-right font-bold">{L.total}</th>
        </tr>
      </thead>
    )
  },

  // Hairline row rules, no zebra (the PDF's tableRowAlt is empty).
  itemRow(block, item, _itemIndex, ctx) {
    return (
      <tr
        key={block.id}
        data-page-block-id={block.id}
        data-item-id={item.id}
        className="border-b border-[#f0f1f3] text-[13px] leading-[1.28]"
      >
        <td className="py-2.5 pl-0 pr-2">{item.description}</td>
        <td className="py-2.5 px-2 text-center tabular-nums">{item.quantity}</td>
        <td className="py-2.5 px-2 text-center">{item.unit ?? ''}</td>
        <td className="py-2.5 px-2 text-right tabular-nums whitespace-nowrap">{ctx.fmt(item.unit_price)}</td>
        <td className="py-2.5 pl-0 pr-0 text-right tabular-nums whitespace-nowrap">{ctx.fmt(item.total)}</td>
      </tr>
    )
  },

  sectionSubtotal(block, subtotal, ctx) {
    return (
      <div
        key={block.id}
        data-page-block-id={block.id}
        className={`flex justify-end items-baseline py-2.5 border-t ${RULE}`}
      >
        <span className={`text-xs font-bold ${MUTED} mr-4 select-none`}>{ctx.L.sectionSubtotal}</span>
        <span className="text-xs font-bold tabular-nums text-right w-[18%]">{ctx.fmt(subtotal)}</span>
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
            marginBottom: pt(TERMS_TITLE_GAP_PT),
            ...(card.key === 'estimate' ? { color: ctx.brandText } : {}),
          }}
        >
          {card.label}
        </p>
        <p
          className="text-xs leading-[1.6] text-[#4b5563] whitespace-pre-line"
          style={{ marginBottom: pt(TERMS_TEXT_GAP_PT) }}
        >
          {card.text}
        </p>
      </div>
    )
  },

  // PdfSignatureBlock (modern, box-less): eyebrow, 150x40pt image, name, date.
  signature(block, signature, ctx) {
    return (
      <div key={block.id} data-page-block-id="signature" style={{ marginTop: pt(16) }}>
        <p className={EYEBROW} style={{ marginBottom: pt(TERMS_TITLE_GAP_PT) }}>
          {ctx.L.signedBy}
        </p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={signature.signatureDataUrl}
          alt={ctx.L.signedBy}
          className="object-contain"
          style={{ width: pt(150), height: pt(40) }}
        />
        <p className="text-xs mt-1">{signature.signerName}</p>
        <p className={`text-xs ${MUTED}`}>{formatDate(signature.signedAt, ctx.lang)}</p>
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
          <p className={EYEBROW} style={{ marginBottom: pt(TERMS_TITLE_GAP_PT) }}>
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
              captionClassName={`mt-0.5 text-[11px] ${MUTED} line-clamp-2`}
            />
          ))}
        </div>
      </div>
    )
  },

  preparedBy(block, name, ctx) {
    return (
      <div key={block.id} data-page-block-id="prepared-by" style={{ marginTop: pt(20) }}>
        <p className={`${EYEBROW} mb-1.5`}>{ctx.L.preparedBy}</p>
        <p className="text-[13px] leading-[1.6]">{name}</p>
      </div>
    )
  },
}
