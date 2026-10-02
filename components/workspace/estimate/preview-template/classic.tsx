// components/workspace/estimate/preview-template/classic.tsx
//
// The Classic look of PaginatedPreview: brand-filled title banner and section
// bands, zebra rows, tinted terms/signature cards. Mirrors
// components/pdf/estimate-pdf.tsx's structure. The sheet itself supplies the
// page margins (PaginatedPreview pads it from ESTIMATE_PAGE_GEOMETRY), so no
// block here carries its own horizontal page gutter — every band spans the
// content width exactly like the PDF's.
import Image from 'next/image'
import { formatPhoneForDisplay } from '@/lib/phone/format'
import { isPercentageDiscount } from '@/lib/estimate/discount-display'
import { formatDate } from '@/lib/estimate/document/format'
import { cardTintFill, PX_PER_PT } from '@/lib/estimate/document/tokens'
import { ReadOnlyPhotoThumb } from './shared'
import type { PreviewTemplate, RenderCtx } from './types'

// components/pdf/estimate-pdf.tsx styles.sectionHeader.paddingHorizontal: the
// title text sits 10pt inside a brand band that spans the content width. The
// pagination engine wraps the title at the same inset
// (TEMPLATE_LITERALS.classic.sectionTitleHorizontalPaddingPt) — keep in step.
const SECTION_TITLE_INSET_PT = 10
const SECTION_TITLE_INSET_PX = SECTION_TITLE_INSET_PT * PX_PER_PT

function InfoGridBlock({ ctx }: { ctx: RenderCtx }) {
  const { data, L, lang, client, clientAddr, projectName, projectType, estimateCreatedAt, defaultEstimateNumber } = ctx
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 py-8 border-b border-border/50">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 select-none">
          {L.project}
        </p>
        <p className="text-xl font-bold">{projectName}</p>
        {projectType && (
          <p className="text-base text-muted-foreground mt-2 capitalize">{projectType.replace(/_/g, ' ')}</p>
        )}
        <p className="text-base text-muted-foreground mt-3">
          {L.date}: {formatDate(data.estimate_date ?? estimateCreatedAt, lang)}
        </p>
        <p className="text-base text-muted-foreground mt-2 tabular-nums">
          {L.estimateNum}{data.estimate_number ?? defaultEstimateNumber}
        </p>
      </div>
      {client && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 select-none">
            {L.billTo}
          </p>
          <div className="space-y-0.5">
            <p className="text-xl font-bold">{client.name}</p>
            {client.email && <p className="text-base text-muted-foreground mt-1">{client.email}</p>}
            {client.phone && (
              <p className="text-base text-muted-foreground">{formatPhoneForDisplay(client.phone)}</p>
            )}
            {clientAddr && <p className="text-base text-muted-foreground whitespace-pre-line">{clientAddr}</p>}
          </div>
        </div>
      )}
    </div>
  )
}

function TotalsBlockView({ ctx }: { ctx: RenderCtx }) {
  const { data, L, brandText, fmt, dep } = ctx
  return (
    <div data-page-block-id="totals" className="flex justify-end py-6 border-t border-border/50">
      <div className="w-full max-w-xs space-y-2">
        <div className="flex justify-between text-base">
          <span className="text-muted-foreground select-none">{L.subtotal}</span>
          <span className="tabular-nums font-medium">{fmt(data.subtotal)}</span>
        </div>
        {data.discount_amount > 0 && (
          <div className="flex justify-between text-base">
            <span className="text-muted-foreground select-none">
              {L.discount}
              {isPercentageDiscount(data.discount_type) ? ` (${data.discount_value}%)` : ''}
            </span>
            <span className="tabular-nums text-destructive font-medium">-{fmt(data.discount_amount)}</span>
          </div>
        )}
        {data.tax_amount > 0 && (
          <div className="flex justify-between text-base">
            <span className="text-muted-foreground select-none">
              {L.tax} ({(data.tax_rate * 100).toFixed(2)}%)
            </span>
            <span className="tabular-nums font-medium">{fmt(data.tax_amount)}</span>
          </div>
        )}
        <div className="flex justify-between items-baseline pt-3 border-t-2" style={{ borderTopColor: brandText }}>
          <span className="text-3xl font-extrabold select-none">{L.grandTotal}</span>
          <span className="text-3xl font-extrabold tabular-nums" style={{ color: brandText }}>
            {fmt(data.total)}
          </span>
        </div>
        {dep.showDeposit && (
          <div className="flex justify-between text-base pt-2">
            <span className="text-muted-foreground select-none">{L.deposit}</span>
            <span className="tabular-nums text-muted-foreground font-medium">-{fmt(dep.depositAmount)}</span>
          </div>
        )}
        {dep.showDeposit && (
          <div className="flex justify-between items-baseline">
            <span className="text-base font-semibold text-muted-foreground select-none">{L.balanceDue}</span>
            <span className="text-base font-semibold tabular-nums">{fmt(dep.balanceDue)}</span>
          </div>
        )}
      </div>
    </div>
  )
}

export const classicTemplate: PreviewTemplate = {
  sheetClassName: '',

  header(ctx) {
    const { company, brandColor, brandText, companyAddr } = ctx
    return (
      <div
        className="flex items-start justify-between gap-4 py-6 border-b border-border"
        style={{ borderTopWidth: 3, borderTopStyle: 'solid', borderTopColor: brandColor }}
      >
        <div className="min-w-0">
          <p className="font-bold text-2xl leading-tight" style={{ color: brandText }}>
            {company.name}
          </p>
          {company.owner_name && <p className="text-xs text-muted-foreground mt-0.5">{company.owner_name}</p>}
          <p className="text-xs text-muted-foreground mt-0.5">
            {[company.phone && formatPhoneForDisplay(company.phone), company.email, company.website]
              .filter(Boolean)
              .join('  ·  ')}
          </p>
          {companyAddr && <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">{companyAddr}</p>}
        </div>
        {company.logo_url && (
          <div className="flex-shrink-0">
            <Image src={company.logo_url} alt={company.name} width={64} height={64} className="rounded object-contain" />
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
      <div className="select-none">
        <div className="flex items-center justify-between gap-3 border-b border-zinc-200 pb-1.5">
          <span className="min-w-0 truncate text-sm font-semibold leading-tight" style={{ color: brandText }}>
            {company.name}
          </span>
          <span className="flex-shrink-0 text-xs text-muted-foreground">
            {L.estimateNum}
            {data.estimate_number ?? defaultEstimateNumber}
          </span>
        </div>
      </div>
    )
  },

  titleBanner(key, ctx) {
    return (
      <div key={key} className="py-6 text-center" style={{ backgroundColor: ctx.brandColor }}>
        <h1 className="text-4xl font-bold tracking-widest select-none" style={{ color: ctx.brandOnFill }}>
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
      <div key={key} className="py-4 border-b border-border/50">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 select-none">
          {ctx.L.summary}
        </p>
        <p className="text-base text-muted-foreground whitespace-pre-line leading-relaxed">{text}</p>
      </div>
    )
  },

  sectionHeader(key, sectionId, ctx, continued) {
    const section = ctx.sectionsById.get(sectionId)
    // The band spans the sheet's content width (no full-bleed) with the PDF's
    // 10pt title inset on both sides.
    const bandStyle = {
      backgroundColor: ctx.brandColor,
      paddingLeft: SECTION_TITLE_INSET_PX,
      paddingRight: SECTION_TITLE_INSET_PX,
    }
    if (continued) {
      // PGBRK-03 continuation title — mirrors the PDF's PdfSectionHeader with
      // `continuedLabel`: the section title (single line, ellipsised) followed by
      // the localized "(cont.)" suffix, on the same brand band as a normal section
      // header. Deliberately NO data-page-block-id: it is not an engine block (its
      // height is the continuation reservation), and `${sectionId}-header`
      // already names the section's real header block on an earlier page.
      return (
        <div key={key} data-testid="continuation-title" className="flex items-center gap-1 py-2" style={bandStyle}>
          <span
            className="min-w-0 truncate font-semibold text-base tracking-wide select-none"
            style={{ color: ctx.brandOnFill }}
          >
            {section?.title ?? ''}
          </span>
          <span
            className="flex-shrink-0 font-semibold text-base tracking-wide select-none"
            style={{ color: ctx.brandOnFill }}
          >
            {ctx.L.continued}
          </span>
        </div>
      )
    }
    return (
      <div
        key={key}
        data-page-block-id={`${sectionId}-header`}
        className="flex items-center gap-2 py-2"
        style={bandStyle}
      >
        <span className="flex-1 font-semibold text-base tracking-wide select-none" style={{ color: ctx.brandOnFill }}>
          {section?.title ?? ''}
        </span>
      </div>
    )
  },

  tableHead(ctx, testId) {
    const { L } = ctx
    return (
      <thead data-testid={testId}>
        <tr className="bg-muted/50 text-xs text-muted-foreground border-b border-border/50">
          <th className="py-1.5 pl-0 pr-2 text-left font-medium">{L.description}</th>
          <th className="py-1.5 px-2 text-center font-medium">{L.qty}</th>
          <th className="py-1.5 px-2 text-center font-medium">{L.unit}</th>
          <th className="py-1.5 px-2 text-right font-medium">{L.unitPrice}</th>
          <th className="py-1.5 pl-0 pr-0 text-right font-medium">{L.total}</th>
        </tr>
      </thead>
    )
  },

  itemRow(block, item, itemIndex, ctx) {
    const zebra = itemIndex % 2 === 1
    return (
      <tr
        key={block.id}
        data-page-block-id={block.id}
        data-item-id={item.id}
        className={`border-b border-border/50 ${zebra ? 'bg-muted/40' : ''}`}
      >
        <td className="py-2 pl-0 pr-2 text-base">{item.description}</td>
        <td className="py-2 px-2 text-base text-center tabular-nums">{item.quantity}</td>
        <td className="py-2 px-2 text-base text-center">{item.unit ?? ''}</td>
        <td className="py-2 px-2 text-base text-right tabular-nums whitespace-nowrap">{ctx.fmt(item.unit_price)}</td>
        <td className="py-2 pl-0 pr-0 text-base text-right tabular-nums font-medium whitespace-nowrap">{ctx.fmt(item.total)}</td>
      </tr>
    )
  },

  sectionSubtotal(block, subtotal, ctx) {
    return (
      <div
        key={block.id}
        data-page-block-id={block.id}
        className="flex justify-end items-center gap-3 py-2 border-t border-border/50 bg-muted/10"
      >
        <span className="text-sm text-muted-foreground select-none">{ctx.L.sectionSubtotal}</span>
        <span className="text-sm font-semibold tabular-nums">{ctx.fmt(subtotal)}</span>
      </div>
    )
  },

  totals(key, ctx) {
    return <TotalsBlockView key={key} ctx={ctx} />
  },

  termsCard(block, card, ctx) {
    return (
      <div key={block.id} data-page-block-id={`terms-${card.key}`} className="py-6 border-t border-border/50">
        <div className="rounded-lg border border-border/50 p-4" style={{ backgroundColor: cardTintFill(ctx.brandColor) }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground select-none mb-1.5">
            {card.label}
          </p>
          <p className="text-base text-muted-foreground whitespace-pre-line leading-relaxed">{card.text}</p>
        </div>
      </div>
    )
  },

  signature(block, signature, ctx) {
    return (
      <div key={block.id} data-page-block-id="signature" className="py-6 border-t border-border/50">
        <div className="rounded-lg border border-border/50 p-4" style={{ backgroundColor: cardTintFill(ctx.brandColor) }}>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 select-none">
            {ctx.L.signedBy}
          </p>
          <div className="flex items-start gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={signature.signatureDataUrl}
              alt={ctx.L.signedBy}
              className="h-16 w-auto max-w-[240px] object-contain"
            />
            <div>
              <p className="text-base font-semibold">{signature.signerName}</p>
              <p className="text-sm text-muted-foreground">{formatDate(signature.signedAt, ctx.lang)}</p>
            </div>
          </div>
        </div>
      </div>
    )
  },

  photoRow(block, photos, showLabel, ctx) {
    return (
      <div key={block.id} data-page-block-id={block.id} className="py-6 border-t border-border/50">
        {showLabel && (
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 select-none">
            {ctx.L.photos}
          </p>
        )}
        {/* Fixed grid-cols-3 — matches the engine's photosPerRow chunk size
            (lib/estimate/document/tokens.ts's photosPerRow, always 3 for both
            templates' contentWidthPt) exactly, so a 3-photo chunk never lands
            in a wider grid with a dead trailing cell. Sheets are fixed-width —
            no viewport breakpoint applies here. */}
        <div className="grid grid-cols-3 gap-3">
          {photos.map((photo) => (
            <ReadOnlyPhotoThumb
              key={photo.id}
              photo={photo}
              frameClassName="aspect-square overflow-hidden rounded-lg relative ring-1 ring-border/50"
              captionClassName="mt-1.5 text-xs text-muted-foreground line-clamp-2"
            />
          ))}
        </div>
      </div>
    )
  },

  preparedBy(block, name, ctx) {
    return (
      <div key={block.id} data-page-block-id="prepared-by" className="py-6 border-t border-border/50">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 select-none">
          {ctx.L.preparedBy}
        </p>
        <p className="text-base text-muted-foreground">{name}</p>
      </div>
    )
  },
}

