// components/workspace/estimate/paginated-preview.tsx
//
// Quick 260806-pgv Task T1 — a READ-ONLY, real-page-container replacement for
// the decorative PaginatedDocumentOverlay (Phase 185). Consumes the SAME
// PageAssignment[] the PDF pipeline consumes (lib/estimate/pagination/**,
// UNTOUCHED by this task) and resolves each PageBlock.ref against the
// document model directly to DOM, mirroring components/pdf/estimate-pdf.tsx's
// block-dispatch pattern instead of the old overlay's measure-then-anchor
// approach. Zero inputs, zero dnd, zero dispatch — every editable affordance
// EstimateDocument has in pageView mode is intentionally absent here.
'use client'

import Image from 'next/image'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { createClient } from '@/lib/supabase/client'
import { createStorage } from '@/lib/storage'
import { formatMoney } from '@/lib/money/currency'
import { deriveDepositDisplay } from '@/lib/estimate/deposit-display'
import { isPercentageDiscount } from '@/lib/estimate/discount-display'
import { formatPhoneForDisplay } from '@/lib/phone/format'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { ensureReadableOnWhite, readableTextColor } from '@/lib/color/contrast'
import { resolvePresentationSettings, isSectionVisible } from '@/lib/estimate/presentation-settings'
import { LABELS as DOC_LABELS, type DocumentLabels } from '@/lib/estimate/document/labels'
import { formatAddress, formatDate } from '@/lib/estimate/document/format'
import { LETTER_WIDTH_PX, LETTER_HEIGHT_PX, cardTintFill } from '@/lib/estimate/document/tokens'
import { visibleSectionItems } from '@/lib/estimate/document/visible-items'
import type {
  DocumentCompany,
  DocumentClient,
  DocumentItem,
  DocumentPhoto,
  DocumentSection,
  EstimateDocumentData,
} from '@/lib/estimate/document/model'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type { DepositDisplay } from '@/lib/estimate/deposit-display'
import type { ResolvedPresentationSettings } from '@/lib/estimate/presentation-settings'
import type { PageAssignment, PageBlock } from '@/lib/estimate/pagination/types'

// 185-UI-SPEC.md §2's page-gap between sheets — kept as the same design
// constant the old overlay used.
const PAGE_GAP_PX = 32

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

export interface PaginatedPreviewProps {
  data: EstimateDocumentData
  /** null = engine still computing / fonts loading — renders the skeleton, never the editable tree. */
  pages: PageAssignment[] | null
  company: DocumentCompany
  language?: EstimateLanguage | null
  /** Override brand color (mirrors EstimateDocumentProps — falls back to company.brand_primary_color). */
  brandColor?: string
  client: DocumentClient | null
  projectName: string
  projectType: string | null
  preparedBy?: string | null
  estimateVersion: number
  estimateSeq?: number
  estimateCreatedAt: string
  companyTerms?: { enabled: boolean; text: string | null } | null
}

// ---------------------------------------------------------------------------
// RenderCtx — everything a block resolver needs, built once per render
// ---------------------------------------------------------------------------

interface RenderCtx {
  data: EstimateDocumentData
  L: DocumentLabels
  lang: EstimateLanguage
  company: DocumentCompany
  brandColor: string
  brandText: string
  brandOnFill: string
  fmt: (v: number) => string
  dep: DepositDisplay
  resolvedSettings: ResolvedPresentationSettings
  itemsBySection: Map<string, DocumentItem[]>
  sectionsById: Map<string, DocumentSection>
  client: DocumentClient | null
  companyAddr: string | null
  clientAddr: string | null
  projectName: string
  projectType: string | null
  preparedBy: string | null
  estimateCreatedAt: string
  defaultEstimateNumber: string
  companyTerms: { enabled: boolean; text: string | null } | null
  hasCompanyTerms: boolean
}

// ---------------------------------------------------------------------------
// TableHead — the shared column-header row (Description/Qty/Unit/Unit
// Price/Total at 40/12/13/17/18%), reused for a section's own table AND the
// page-opening repeated header on a continuesTable page — same markup as
// estimate-document.tsx's read-only table head (L661-669). `testId`, when
// given, is stamped on the <thead> itself (only the continuation slice's own
// first table passes one — see renderPageBlocks).
// ---------------------------------------------------------------------------

function TableHead({ L, testId }: { L: DocumentLabels; testId?: string }) {
  return (
    <thead data-testid={testId}>
      <tr className="bg-muted/50 text-xs text-muted-foreground border-b border-border/50">
        <th className="py-1.5 px-3 text-left font-medium">{L.description}</th>
        <th className="py-1.5 px-2 text-center font-medium">{L.qty}</th>
        <th className="py-1.5 px-2 text-center font-medium">{L.unit}</th>
        <th className="py-1.5 px-2 text-right font-medium">{L.unitPrice}</th>
        <th className="py-1.5 px-3 text-right font-medium">{L.total}</th>
      </tr>
    </thead>
  )
}

// ItemTableColgroup — the ONE source of the 40/12/13/17/18% column geometry,
// applied via <col> (not per-<th> width classes) so EVERY item table on
// EVERY page — headed or headless, new-section or continuation slice — sizes
// its 5 columns identically under table-fixed layout. Without this, a
// continuation page's headless rows table and a headed table elsewhere would
// auto-size independently and columns would drift out of alignment.
function ItemTableColgroup() {
  return (
    <colgroup>
      <col style={{ width: '40%' }} />
      <col style={{ width: '12%' }} />
      <col style={{ width: '13%' }} />
      <col style={{ width: '17%' }} />
      <col style={{ width: '18%' }} />
    </colgroup>
  )
}

// ---------------------------------------------------------------------------
// ReadOnlyPhotoThumb — mirrors estimate-document.tsx's private
// AttachedPhotoThumb (not exported, so re-implemented here against the same
// createClient/createStorage utilities) minus the onRemove affordance.
// ---------------------------------------------------------------------------

function ReadOnlyPhotoThumb({ photo }: { photo: DocumentPhoto }) {
  const [imageUrl, setImageUrl] = useState<string | null>(photo.url ?? null)

  useEffect(() => {
    if (photo.url) {
      setImageUrl(photo.url)
      return
    }
    const supabase = createClient()
    createStorage(supabase)
      .getSignedUrl('photos', photo.storage_path, 3600)
      .then((signedUrl) => setImageUrl(signedUrl))
      .catch(() => {
        // signed URL failed — leave skeleton in place
      })
  }, [photo.url, photo.storage_path])

  return (
    <div>
      <div className="aspect-square overflow-hidden rounded-lg relative ring-1 ring-border/50">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imageUrl} alt={photo.caption ?? ''} className="object-cover w-full h-full" />
        ) : (
          <Skeleton className="w-full h-full" />
        )}
      </div>
      {photo.caption && <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">{photo.caption}</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Single-block resolvers — mirror EstimateDocument's read-only (isEditable
// = false) branches, minus every edit affordance.
// ---------------------------------------------------------------------------

function InfoGridBlock({ ctx }: { ctx: RenderCtx }) {
  const { data, L, lang, client, clientAddr, projectName, projectType, estimateCreatedAt, defaultEstimateNumber } = ctx
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 px-10 py-8 border-b border-border/50">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 select-none">
          {L.project}
        </p>
        <p className="text-2xl font-bold">{projectName}</p>
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
            <p className="text-2xl font-bold">{client.name}</p>
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
    <div data-page-block-id="totals" className="flex justify-end px-10 py-6 border-t border-border/50">
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

function renderSectionHeaderBar(sectionId: string, ctx: RenderCtx) {
  const section = ctx.sectionsById.get(sectionId)
  return (
    <div
      key={`${sectionId}-header`}
      data-page-block-id={`${sectionId}-header`}
      className="flex items-center gap-2 px-10 py-2"
      style={{ backgroundColor: ctx.brandColor }}
    >
      <span className="flex-1 font-semibold text-base tracking-wide select-none" style={{ color: ctx.brandOnFill }}>
        {section?.title ?? ''}
      </span>
    </div>
  )
}

/** Renders one contiguous run of item-row blocks (same section, same page) as
 *  ONE <table>. `withHead` is true when this run was immediately preceded on
 *  this page by its section's own section-header block, OR when this run
 *  IS the continuation slice opening a continuesTable page (in which case
 *  `headTestId="continuation-header"` is passed so the page-level repeated
 *  column header renders as this table's own <thead> instead of a separate
 *  sibling table — keeping every item table's column geometry identical via
 *  ItemTableColgroup + table-fixed, headed or not). */
function renderItemTable(
  sectionId: string,
  rowBlocks: PageBlock[],
  ctx: RenderCtx,
  withHead: boolean,
  key: string,
  headTestId?: string
) {
  const items = ctx.itemsBySection.get(sectionId) ?? []
  return (
    <table key={key} className="w-full table-fixed">
      <ItemTableColgroup />
      {withHead && <TableHead L={ctx.L} testId={headTestId} />}
      <tbody>
        {rowBlocks.map((block) => {
          const itemIndex = block.ref?.itemIndex
          const item = itemIndex !== undefined ? items[itemIndex] : undefined
          if (!item) return null
          const zebra = (itemIndex ?? 0) % 2 === 1
          return (
            <tr
              key={block.id}
              data-page-block-id={block.id}
              data-item-id={item.id}
              className={`border-b border-border/50 ${zebra ? 'bg-muted/40' : ''}`}
            >
              <td className="py-2 px-3 text-base">{item.description}</td>
              <td className="py-2 px-2 text-base text-center tabular-nums">{item.quantity}</td>
              <td className="py-2 px-2 text-base text-center">{item.unit ?? ''}</td>
              <td className="py-2 px-2 text-base text-right tabular-nums">{ctx.fmt(item.unit_price)}</td>
              <td className="py-2 px-3 text-base text-right tabular-nums font-medium">{ctx.fmt(item.total)}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

function renderSectionSubtotal(block: PageBlock, ctx: RenderCtx) {
  const sectionId = block.ref?.sectionId ?? ''
  const section = ctx.sectionsById.get(sectionId)
  return (
    <div
      key={block.id}
      data-page-block-id={block.id}
      className="flex justify-end items-center gap-3 px-10 py-2 border-t border-border/50 bg-muted/10"
    >
      <span className="text-sm text-muted-foreground select-none">{ctx.L.sectionSubtotal}</span>
      <span className="text-sm font-semibold tabular-nums">{ctx.fmt(section?.subtotal ?? 0)}</span>
    </div>
  )
}

function renderTermsCard(block: PageBlock, ctx: RenderCtx) {
  const key = block.ref?.termsKey
  if (!key) return null

  if (key === 'estimate') {
    if (!ctx.hasCompanyTerms) return null
    return (
      <div key={block.id} data-page-block-id="terms-estimate" className="px-10 py-6 border-t border-border/50">
        <div className="rounded-lg border border-border/50 p-4" style={{ backgroundColor: cardTintFill(ctx.brandColor) }}>
          <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground select-none mb-1.5">
            {ctx.L.estimateTerms}
          </p>
          <p className="text-base text-muted-foreground whitespace-pre-line leading-relaxed">
            {ctx.companyTerms?.text}
          </p>
        </div>
      </div>
    )
  }

  const fields: Record<'payment' | 'timeline' | 'warranty' | 'notes', { label: string; value: string | null }> = {
    payment: { label: ctx.L.paymentTerms, value: ctx.data.payment_terms },
    timeline: { label: ctx.L.timeline, value: ctx.data.timeline },
    warranty: { label: ctx.L.warranty, value: ctx.data.warranty_terms },
    notes: { label: ctx.L.notes, value: ctx.data.notes },
  }
  const entry = fields[key]
  if (!entry || !entry.value) return null

  return (
    <div key={block.id} data-page-block-id={`terms-${key}`} className="px-10 py-6 border-t border-border/50">
      <div className="rounded-lg border border-border/50 p-4" style={{ backgroundColor: cardTintFill(ctx.brandColor) }}>
        <p className="text-sm font-semibold uppercase tracking-wider text-muted-foreground select-none mb-1.5">
          {entry.label}
        </p>
        <p className="text-base text-muted-foreground whitespace-pre-line leading-relaxed">{entry.value}</p>
      </div>
    </div>
  )
}

function renderSignature(block: PageBlock, ctx: RenderCtx) {
  if (!ctx.data.signature) return null
  return (
    <div key={block.id} data-page-block-id="signature" className="px-10 py-6 border-t border-border/50">
      <div className="rounded-lg border border-border/50 p-4" style={{ backgroundColor: cardTintFill(ctx.brandColor) }}>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 select-none">
          {ctx.L.signedBy}
        </p>
        <div className="flex items-start gap-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ctx.data.signature.signatureDataUrl}
            alt={ctx.L.signedBy}
            className="h-16 w-auto max-w-[240px] object-contain"
          />
          <div>
            <p className="text-base font-semibold">{ctx.data.signature.signerName}</p>
            <p className="text-sm text-muted-foreground">{formatDate(ctx.data.signature.signedAt, ctx.lang)}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function renderPhotoRow(block: PageBlock, ctx: RenderCtx) {
  const range = block.ref?.photoRange
  if (!range) return null
  if (!isSectionVisible(ctx.resolvedSettings, 'photos')) return null
  const photos = (ctx.data.attachedPhotos ?? []).slice(range[0], range[1])
  if (photos.length === 0) return null
  const showLabel = range[0] === 0
  return (
    <div key={block.id} data-page-block-id={block.id} className="px-10 py-6 border-t border-border/50">
      {showLabel && (
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 select-none">
          {ctx.L.photos}
        </p>
      )}
      {/* Fixed grid-cols-3 — matches the engine's photosPerRow chunk size
          (lib/estimate/document/tokens.ts's photosPerRow, always 3 for both
          templates' contentWidthPt) exactly, so a 3-photo chunk never lands
          in a wider grid with a dead trailing cell. Sheets are always
          LETTER_WIDTH_PX wide — no viewport breakpoint applies here. */}
      <div className="grid grid-cols-3 gap-3">
        {photos.map((photo) => (
          <ReadOnlyPhotoThumb key={photo.id} photo={photo} />
        ))}
      </div>
    </div>
  )
}

function renderPreparedBy(block: PageBlock, ctx: RenderCtx) {
  if (!ctx.preparedBy) return null
  return (
    <div key={block.id} data-page-block-id="prepared-by" className="px-10 py-6 border-t border-border/50">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 select-none">
        {ctx.L.preparedBy}
      </p>
      <p className="text-base text-muted-foreground">{ctx.preparedBy}</p>
    </div>
  )
}

function renderSingleBlock(block: PageBlock, ctx: RenderCtx) {
  switch (block.kind) {
    case 'title-banner':
      return (
        <div key={block.id} className="py-6 px-10 text-center" style={{ backgroundColor: ctx.brandColor }}>
          <h1
            className="text-4xl font-bold tracking-widest select-none"
            style={{ color: ctx.brandOnFill }}
          >
            {ctx.L.estimate}
          </h1>
        </div>
      )
    case 'info-grid':
      return <InfoGridBlock key={block.id} ctx={ctx} />
    case 'summary':
      return isSectionVisible(ctx.resolvedSettings, 'summary') && ctx.data.summary ? (
        <div key={block.id} className="px-10 py-4 border-b border-border/50">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-1.5 select-none">
            {ctx.L.summary}
          </p>
          <p className="text-base text-muted-foreground whitespace-pre-line leading-relaxed">{ctx.data.summary}</p>
        </div>
      ) : null
    case 'section-subtotal':
      return renderSectionSubtotal(block, ctx)
    case 'totals':
      return <TotalsBlockView key={block.id} ctx={ctx} />
    case 'terms-card':
      return renderTermsCard(block, ctx)
    case 'signature':
      return renderSignature(block, ctx)
    case 'photo-row':
      return renderPhotoRow(block, ctx)
    case 'prepared-by':
      return renderPreparedBy(block, ctx)
    default:
      return null
  }
}

/** Walks one page's blocks in order, grouping consecutive item-row blocks of
 *  the same section (with the section-header block, when present on this
 *  same page) into ONE <table> slice — mirrors
 *  components/pdf/estimate-pdf.tsx's buildItemRowGroups, but DOM-shaped: no
 *  slicing needed since each item-row PageBlock already maps to one item.
 *  `continuesTable` (PageAssignment.continuesTable, true iff blocks[0].kind
 *  === 'item-row') marks that the very first group is a continuation slice —
 *  it gets the repeated column header as its OWN <thead> (headTestId=
 *  'continuation-header'), never a separate sibling table. */
function renderPageBlocks(blocks: PageBlock[], ctx: RenderCtx, continuesTable: boolean): React.ReactNode[] {
  const out: React.ReactNode[] = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]

    if (block.kind === 'section-header') {
      const sectionId = block.ref?.sectionId ?? ''
      let j = i + 1
      while (j < blocks.length && blocks[j].kind === 'item-row' && blocks[j].ref?.sectionId === sectionId) j += 1
      const rowBlocks = blocks.slice(i + 1, j)
      out.push(
        <div key={block.id}>
          {renderSectionHeaderBar(sectionId, ctx)}
          {rowBlocks.length > 0 && renderItemTable(sectionId, rowBlocks, ctx, true, `${block.id}-table`)}
        </div>
      )
      i = j
      continue
    }

    if (block.kind === 'item-row') {
      const sectionId = block.ref?.sectionId ?? ''
      let j = i
      while (j < blocks.length && blocks[j].kind === 'item-row' && blocks[j].ref?.sectionId === sectionId) j += 1
      const rowBlocks = blocks.slice(i, j)
      const isContinuationSlice = continuesTable && i === 0
      out.push(
        renderItemTable(
          sectionId,
          rowBlocks,
          ctx,
          isContinuationSlice,
          `${sectionId}-continued-${i}`,
          isContinuationSlice ? 'continuation-header' : undefined
        )
      )
      i = j
      continue
    }

    out.push(renderSingleBlock(block, ctx))
    i += 1
  }
  return out
}

// ---------------------------------------------------------------------------
// PageSheet — one real page container: full company header on page 1, a
// compact repeated header on pages 2+, and (when continuesTable) a real
// in-flow repeated column-header row before the page's own blocks.
// ---------------------------------------------------------------------------

// Pinned-light CSS-variable object, copied verbatim from
// estimate-document.tsx's pageView-root style (L1486-1500) — makes every
// sheet immune to the app's dark mode regardless of ambient theme.
const LIGHT_PIN_STYLE = {
  colorScheme: 'light',
  '--foreground': '240 10% 3.9%',
  '--muted-foreground': '240 3.8% 46.1%',
  '--muted': '240 4.8% 95.9%',
  '--border': '240 5.9% 90%',
  '--card': '0 0% 100%',
  '--card-foreground': '240 10% 3.9%',
  '--glass-bg': 'rgba(255, 255, 255, 0.65)',
  '--glass-bg-strong': 'rgba(255, 255, 255, 0.97)',
  '--glass-border': 'rgba(15, 23, 42, 0.08)',
  color: 'hsl(240 10% 3.9%)',
} as React.CSSProperties

function FullCompanyHeader({ ctx }: { ctx: RenderCtx }) {
  const { company, brandColor, brandText, companyAddr } = ctx
  return (
    <div
      className="flex items-start justify-between gap-4 p-6 border-b border-border"
      style={{ borderTopWidth: 3, borderTopStyle: 'solid', borderTopColor: brandColor }}
    >
      <div className="min-w-0">
        <p className="font-bold text-lg leading-tight" style={{ color: brandText }}>
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
}

function CompactHeader({ ctx }: { ctx: RenderCtx }) {
  return (
    <div className="flex flex-col justify-center px-10 py-3 select-none">
      <span className="text-sm font-semibold leading-tight" style={{ color: ctx.brandColor }}>
        {ctx.company.name}
      </span>
      <span className="mt-1 block border-b border-zinc-200" />
    </div>
  )
}

function PageSheet({
  page,
  pageIndex,
  totalPages,
  ctx,
}: {
  page: PageAssignment
  pageIndex: number
  totalPages: number
  ctx: RenderCtx
}) {
  return (
    <div className="flex flex-col items-center" style={{ marginTop: pageIndex === 0 ? 0 : PAGE_GAP_PX }}>
      <div
        data-page-sheet={pageIndex}
        className="bg-white shadow-xl"
        style={{ width: LETTER_WIDTH_PX, minHeight: LETTER_HEIGHT_PX, scrollMarginTop: 140, ...LIGHT_PIN_STYLE }}
      >
        {pageIndex === 0 ? <FullCompanyHeader ctx={ctx} /> : <CompactHeader ctx={ctx} />}
        {renderPageBlocks(page.blocks, ctx, page.continuesTable)}
      </div>
      <p className="select-none pt-2 text-center text-xs text-muted-foreground" style={{ width: LETTER_WIDTH_PX }}>
        {ctx.L.page} {pageIndex + 1} {ctx.L.of} {totalPages}
      </p>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Skeleton — pages === null (engine still computing / fonts loading)
// ---------------------------------------------------------------------------

function SkeletonSheet() {
  return (
    <div className="flex justify-center">
      <div
        className="bg-white shadow-xl animate-pulse"
        style={{ width: LETTER_WIDTH_PX, minHeight: LETTER_HEIGHT_PX, ...LIGHT_PIN_STYLE }}
      >
        <div className="p-10 space-y-6">
          <div className="flex items-center justify-between">
            <div className="h-6 w-40 rounded bg-zinc-200" />
            <div className="h-16 w-16 rounded bg-zinc-100" />
          </div>
          <div className="h-10 w-full rounded bg-zinc-100" />
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <div className="h-3 w-16 rounded bg-zinc-200" />
              <div className="h-6 w-32 rounded bg-zinc-100" />
            </div>
            <div className="space-y-2">
              <div className="h-3 w-16 rounded bg-zinc-200" />
              <div className="h-6 w-32 rounded bg-zinc-100" />
            </div>
          </div>
          <div className="space-y-2">
            <div className="h-8 w-full rounded bg-zinc-200" />
            <div className="h-6 w-full rounded bg-zinc-100" />
            <div className="h-6 w-full rounded bg-zinc-100" />
            <div className="h-6 w-2/3 rounded bg-zinc-100" />
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PaginatedPreview — main export
// ---------------------------------------------------------------------------

export function PaginatedPreview({
  data,
  pages,
  company,
  language,
  brandColor: brandColorProp,
  client,
  projectName,
  projectType,
  preparedBy,
  estimateVersion,
  estimateSeq,
  estimateCreatedAt,
  companyTerms,
}: PaginatedPreviewProps) {
  const lang = (language ?? 'en') as EstimateLanguage
  const L = DOC_LABELS[lang] ?? DOC_LABELS.en
  const brandColor = brandColorProp ?? company.brand_primary_color ?? SYSTEM_COLORS.primary
  const brandText = ensureReadableOnWhite(brandColor)
  const brandOnFill = readableTextColor(brandColor)
  const resolvedSettings = resolvePresentationSettings(data.presentation_settings)
  const dep = deriveDepositDisplay({
    total: data.total,
    deposit_type: data.deposit_type,
    deposit_value: data.deposit_value,
    balance_due: data.balance_due,
  })
  const hasCompanyTerms = !!(companyTerms?.enabled && companyTerms.text)
  const companyAddr = formatAddress(company)
  const clientAddr = client ? formatAddress(client) : null
  const defaultEstimateNumber =
    estimateSeq && estimateSeq > 0 ? String(estimateSeq).padStart(4, '0') : String(estimateVersion)

  const itemsBySection = useMemo(() => {
    const m = new Map<string, DocumentItem[]>()
    for (const section of data.sections) m.set(section.id, visibleSectionItems(section))
    return m
  }, [data.sections])
  const sectionsById = useMemo(() => new Map(data.sections.map((s) => [s.id, s])), [data.sections])

  const ctx: RenderCtx = {
    data,
    L,
    lang,
    company,
    brandColor,
    brandText,
    brandOnFill,
    fmt: (v: number) => formatMoney(v, data.currency_code),
    dep,
    resolvedSettings,
    itemsBySection,
    sectionsById,
    client,
    companyAddr,
    clientAddr,
    projectName,
    projectType,
    preparedBy: preparedBy ?? null,
    estimateCreatedAt,
    defaultEstimateNumber,
    companyTerms: companyTerms ?? null,
    hasCompanyTerms,
  }

  // ---------------------------------------------------------------------
  // Zoom — fit-width by default, manual override via the pill. Applied via
  // transform: scale() (NEVER CSS zoom), with both width AND height
  // compensation so the scroll extent always matches the scaled content
  // exactly (mirrors the "width-wrapper technique" — a compensated sizer
  // div reserves the SCALED footprint, the unscaled content is absolutely
  // positioned + pre-centered inside it so `transform-origin: top center`
  // lands the painted result exactly on the sizer's bounds at any zoom).
  // ---------------------------------------------------------------------
  const measureRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [fitZoom, setFitZoom] = useState(1)
  const [manualZoom, setManualZoom] = useState<number | null>(null)
  const [naturalHeightPx, setNaturalHeightPx] = useState<number | null>(null)
  const zoom = manualZoom ?? fitZoom

  useEffect(() => {
    const el = measureRef.current
    if (!el) return
    // el (measureRef) carries the px-4 (16px each side = 32px total) padding
    // applied to its own className below, so getBoundingClientRect().width
    // already INCLUDES that padding — dividing by (LETTER_WIDTH_PX + 32)
    // means zoom hits 1 exactly when avail equals the sheet's natural width
    // plus its own padding, i.e. the sheet fits snug WITHOUT touching el's
    // edges. Formula and layout must always describe the same 32px.
    const compute = () => {
      const avail = el.getBoundingClientRect().width || window.innerWidth
      setFitZoom(Math.min(1, avail / (LETTER_WIDTH_PX + 32)))
    }
    compute()
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', compute)
      return () => window.removeEventListener('resize', compute)
    }
    const ro = new ResizeObserver(compute)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pages])

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!el) return
    const measure = () => setNaturalHeightPx(el.offsetHeight)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [pages])

  const zoomStep = (delta: number) =>
    setManualZoom((prev) => {
      const base = prev ?? fitZoom
      return Math.min(1.5, Math.max(0.5, Math.round((base + delta) * 10) / 10))
    })

  // -----------------------------------------------------------------------
  // Thumbnail rail — ported from paginated-document-overlay.tsx L329-362.
  // -----------------------------------------------------------------------
  const [activePage, setActivePage] = useState(0)

  useLayoutEffect(() => {
    if (!pages || pages.length < 2) return
    // jsdom (unit tests) has no IntersectionObserver — the rail keeps page 1
    // active; navigation still works, only highlight tracking is browser-tier.
    if (typeof IntersectionObserver === 'undefined') return
    const sheets = document.querySelectorAll<HTMLElement>('[data-page-sheet]')
    if (!sheets.length) return
    const visibility = new Map<number, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.pageSheet)
          visibility.set(idx, entry.intersectionRatio)
        }
        let best = 0
        let bestRatio = -1
        visibility.forEach((ratio, idx) => {
          if (ratio > bestRatio) {
            bestRatio = ratio
            best = idx
          }
        })
        setActivePage(best)
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] }
    )
    sheets.forEach((s) => io.observe(s))
    return () => io.disconnect()
  }, [pages])

  const scrollToPage = (idx: number) => {
    document.querySelector(`[data-page-sheet="${idx}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  if (pages === null) {
    return <SkeletonSheet />
  }

  const sizerHeightPx = naturalHeightPx !== null ? naturalHeightPx * zoom : undefined

  return (
    <div className="flex justify-center gap-6">
      {pages.length > 1 && (
        <nav
          aria-label="Pages"
          className="hidden lg:flex flex-col gap-3 sticky top-24 self-start shrink-0 max-h-[70vh] overflow-y-auto py-1 pr-1"
        >
          {pages.map((page) => (
            <button
              key={page.pageIndex}
              type="button"
              onClick={() => scrollToPage(page.pageIndex)}
              aria-label={`${L.page} ${page.pageIndex + 1}`}
              aria-current={activePage === page.pageIndex ? 'page' : undefined}
              className="group flex flex-col items-center gap-1"
            >
              <span
                className={`block w-14 rounded-[3px] bg-white shadow-md transition-all ${
                  activePage === page.pageIndex
                    ? 'ring-2 ring-primary'
                    : 'ring-1 ring-black/10 opacity-70 group-hover:opacity-100'
                }`}
                style={{ aspectRatio: '8.5 / 11' }}
              >
                {/* skeleton page lines — a lightweight thumbnail placeholder */}
                <span className="mx-2 mt-2 block h-1 rounded-sm bg-zinc-300/80" />
                <span className="mx-2 mt-1 block h-1 rounded-sm bg-zinc-200" />
                <span className="mx-2 mt-1 block h-1 w-2/3 rounded-sm bg-zinc-200" />
              </span>
              <span
                className={`text-[11px] tabular-nums ${
                  activePage === page.pageIndex ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {page.pageIndex + 1}
              </span>
            </button>
          ))}
        </nav>
      )}

      {/* px-4 = 16px each side, the real geometry the fit-zoom effect's
          "+ 32" compensates for — see the comment on that effect above. */}
      <div ref={measureRef} className="min-w-0 flex-1 flex justify-center px-4">
        <div style={{ position: 'relative', width: LETTER_WIDTH_PX * zoom, height: sizerHeightPx, margin: '0 auto' }}>
          <div
            ref={contentRef}
            style={{
              position: 'absolute',
              top: 0,
              left: '50%',
              marginLeft: -LETTER_WIDTH_PX / 2,
              width: LETTER_WIDTH_PX,
              transform: `scale(${zoom})`,
              transformOrigin: 'top center',
            }}
          >
            {pages.map((page, idx) => (
              <PageSheet key={page.pageIndex} page={page} pageIndex={idx} totalPages={pages.length} ctx={ctx} />
            ))}
          </div>
        </div>
      </div>

      {/* PDF-viewer-style zoom pill — mirrors estimate-editor.tsx's retired
          pill (L743-777) visually, now self-contained inside this component. */}
      <div className="fixed bottom-24 right-8 z-30 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full bg-zinc-900/90 px-2 py-1 text-zinc-100 shadow-lg backdrop-blur border border-white/10">
          <button
            type="button"
            aria-label="Zoom out"
            className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40"
            disabled={zoom <= 0.5}
            onClick={() => zoomStep(-0.1)}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Fit width"
            title="Fit width"
            className="min-w-[3.25rem] rounded-full px-1 text-center text-xs tabular-nums hover:bg-white/10"
            onClick={() => setManualZoom(null)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-40"
            disabled={zoom >= 1.5}
            onClick={() => zoomStep(0.1)}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
