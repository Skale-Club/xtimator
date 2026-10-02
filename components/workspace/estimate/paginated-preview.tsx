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
//
// TEMPLATE LOOK: this file owns everything template-agnostic (page walking,
// visibility gates, which terms card / photos / signature a block resolves
// to, sheet chrome, zoom, thumbnail rail). The LOOK of every block comes from
// ONE PreviewTemplate picked once from PREVIEW_TEMPLATES by `templateId` —
// Classic (preview-template/classic.tsx) or Modern (preview-template/
// modern.tsx), mirroring components/pdf/estimate-pdf.tsx and
// estimate-pdf-modern.tsx respectively. Each sheet is padded with the chosen
// template's own PDF page margins (ESTIMATE_PAGE_GEOMETRY), so wrapping
// inside the sheet approximates the PDF's.
'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import { formatMoney } from '@/lib/money/currency'
import { deriveDepositDisplay } from '@/lib/estimate/deposit-display'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { ensureReadableOnWhite, readableTextColor } from '@/lib/color/contrast'
import { resolvePresentationSettings, isSectionVisible } from '@/lib/estimate/presentation-settings'
import { LABELS as DOC_LABELS } from '@/lib/estimate/document/labels'
import { formatAddress } from '@/lib/estimate/document/format'
import {
  ESTIMATE_PAGE_GEOMETRY,
  LETTER_WIDTH_PT,
  LETTER_WIDTH_PX,
  LETTER_HEIGHT_PX,
  PX_PER_PT,
} from '@/lib/estimate/document/tokens'
// PDF-PHOTO-01 — the same gate blocksFromModel measures with, applied to the
// FULL array before photoRange slices it (see the helper's docblock). A no-op
// for a real workspace photo (it always has a storage_path), but it is what
// keeps this preview's index domain identical to the engine's.
import { drawablePdfPhotos } from '@/lib/pdf/pdf-image-support'
import { visibleSectionItems } from '@/lib/estimate/document/visible-items'
import type {
  DocumentCompany,
  DocumentClient,
  DocumentItem,
  EstimateDocumentData,
} from '@/lib/estimate/document/model'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type { EstimateTemplateId } from '@/lib/estimate/templates/registry'
import type { PageAssignment, PageBlock } from '@/lib/estimate/pagination/types'
import { classicTemplate } from './preview-template/classic'
import { modernTemplate } from './preview-template/modern'
import { ItemTableColgroup } from './preview-template/shared'
import type { PreviewTemplate, RenderCtx, ResolvedTermsCard } from './preview-template/types'

// 185-UI-SPEC.md §2's page-gap between sheets — kept as the same design
// constant the old overlay used.
const PAGE_GAP_PX = 32

// The ONE place a template id picks its look.
const PREVIEW_TEMPLATES: Record<EstimateTemplateId, PreviewTemplate> = {
  classic: classicTemplate,
  modern: modernTemplate,
}

/** The sheet's inner padding for a template, in px — the PDF page margins
 *  (top/bottom from ESTIMATE_PAGE_GEOMETRY, horizontal = the half of the page
 *  width the content box leaves over), so the content box is exactly
 *  contentWidthPt wide like the PDF's. */
function sheetPaddingPx(templateId: EstimateTemplateId) {
  const g = ESTIMATE_PAGE_GEOMETRY[templateId]
  return {
    paddingTop: g.topPaddingPt * PX_PER_PT,
    paddingBottom: g.bottomPaddingPt * PX_PER_PT,
    paddingLeft: ((LETTER_WIDTH_PT - g.contentWidthPt) / 2) * PX_PER_PT,
    paddingRight: ((LETTER_WIDTH_PT - g.contentWidthPt) / 2) * PX_PER_PT,
  }
}

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

export interface PaginatedPreviewProps {
  data: EstimateDocumentData
  /** null = engine still computing / fonts loading — renders the skeleton, never the editable tree. */
  pages: PageAssignment[] | null
  company: DocumentCompany
  /** The company's estimate template — the SAME id usePaginatedPreview paginates with. Picks the look drawn on the sheets. */
  templateId: EstimateTemplateId
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
// Block resolution — decides WHAT a block shows (visibility gates, which terms
// card, which photos) and hands the resolved values to the template, which
// only decides how it looks. Returns null for a block that draws nothing.
// ---------------------------------------------------------------------------

function resolveTermsCard(block: PageBlock, ctx: RenderCtx, firstTermsCardBlockId: string | undefined): ResolvedTermsCard | null {
  const key = block.ref?.termsKey
  if (!key) return null
  const isFirst = block.id === firstTermsCardBlockId
  if (key === 'estimate') {
    if (!ctx.hasCompanyTerms) return null
    return { key, label: ctx.L.estimateTerms, text: ctx.companyTerms?.text ?? '', isFirst }
  }
  const fields: Record<'payment' | 'timeline' | 'warranty' | 'notes', { label: string; value: string | null }> = {
    payment: { label: ctx.L.paymentTerms, value: ctx.data.payment_terms },
    timeline: { label: ctx.L.timeline, value: ctx.data.timeline },
    warranty: { label: ctx.L.warranty, value: ctx.data.warranty_terms },
    notes: { label: ctx.L.notes, value: ctx.data.notes },
  }
  const entry = fields[key]
  if (!entry || !entry.value) return null
  return { key, label: entry.label, text: entry.value, isFirst }
}

function renderSingleBlock(
  block: PageBlock,
  ctx: RenderCtx,
  tpl: PreviewTemplate,
  firstTermsCardBlockId: string | undefined
): React.ReactNode {
  switch (block.kind) {
    case 'title-banner':
      return tpl.titleBanner(block.id, ctx)
    case 'info-grid':
      return tpl.infoGrid(block.id, ctx)
    case 'summary':
      return isSectionVisible(ctx.resolvedSettings, 'summary') && ctx.data.summary
        ? tpl.summary(block.id, ctx.data.summary, ctx)
        : null
    case 'section-subtotal': {
      const section = ctx.sectionsById.get(block.ref?.sectionId ?? '')
      return tpl.sectionSubtotal(block, section?.subtotal ?? 0, ctx)
    }
    case 'totals':
      return tpl.totals(block.id, ctx)
    case 'terms-card': {
      const card = resolveTermsCard(block, ctx, firstTermsCardBlockId)
      return card ? tpl.termsCard(block, card, ctx) : null
    }
    case 'signature':
      return ctx.data.signature ? tpl.signature(block, ctx.data.signature, ctx) : null
    case 'photo-row': {
      const range = block.ref?.photoRange
      if (!range) return null
      if (!isSectionVisible(ctx.resolvedSettings, 'photos')) return null
      const photos = drawablePdfPhotos(ctx.data.attachedPhotos ?? []).slice(range[0], range[1])
      if (photos.length === 0) return null
      return tpl.photoRow(block, photos, range[0] === 0, ctx)
    }
    case 'prepared-by':
      return ctx.preparedBy ? tpl.preparedBy(block, ctx.preparedBy, ctx) : null
    default:
      return null
  }
}

/** Renders one contiguous run of item-row blocks (same section, same page) as
 *  ONE <table>. `withHead` is true when this run was immediately preceded on
 *  this page by its section's own section-header block, OR when this run
 *  IS the continuation slice opening a continuesTable page (in which case
 *  `headTestId="continuation-header"` is passed so the page-level repeated
 *  column header renders as this table's own <thead> instead of a separate
 *  sibling table — keeping every item table's column geometry identical via
 *  ItemTableColgroup + table-fixed, headed or not). The table spans the sheet's
 *  content box, so the Description text starts and the Total text ends on the
 *  same page rail every other block sits on. */
function renderItemTable(
  sectionId: string,
  rowBlocks: PageBlock[],
  ctx: RenderCtx,
  tpl: PreviewTemplate,
  withHead: boolean,
  key: string,
  headTestId?: string
) {
  const items = ctx.itemsBySection.get(sectionId) ?? []
  return (
    <table key={key} className="w-full table-fixed">
      <ItemTableColgroup />
      {withHead && tpl.tableHead(ctx, headTestId)}
      <tbody>
        {rowBlocks.map((block) => {
          const itemIndex = block.ref?.itemIndex
          const item: DocumentItem | undefined = itemIndex !== undefined ? items[itemIndex] : undefined
          if (!item) return null
          return tpl.itemRow(block, item, itemIndex ?? 0, ctx)
        })}
      </tbody>
    </table>
  )
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
function renderPageBlocks(
  blocks: PageBlock[],
  ctx: RenderCtx,
  tpl: PreviewTemplate,
  continuesTable: boolean,
  firstTermsCardBlockId: string | undefined
): React.ReactNode[] {
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
          {tpl.sectionHeader(`${sectionId}-header`, sectionId, ctx, false)}
          {rowBlocks.length > 0 && renderItemTable(sectionId, rowBlocks, ctx, tpl, true, `${block.id}-table`)}
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
      const table = renderItemTable(
        sectionId,
        rowBlocks,
        ctx,
        tpl,
        isContinuationSlice,
        `${sectionId}-continued-${i}`,
        isContinuationSlice ? 'continuation-header' : undefined
      )
      out.push(
        isContinuationSlice ? (
          // The continuation slice opens the page: section title + "(cont.)" band
          // ABOVE the repeated column header, as the PDF draws them.
          <div key={`${sectionId}-continued-${i}-group`}>
            {tpl.sectionHeader(`${sectionId}-continued-title`, sectionId, ctx, true)}
            {table}
          </div>
        ) : (
          table
        )
      )
      i = j
      continue
    }

    out.push(renderSingleBlock(block, ctx, tpl, firstTermsCardBlockId))
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

function PageSheet({
  page,
  pageIndex,
  totalPages,
  ctx,
  templateId,
  tpl,
  firstTermsCardBlockId,
}: {
  page: PageAssignment
  pageIndex: number
  totalPages: number
  ctx: RenderCtx
  templateId: EstimateTemplateId
  tpl: PreviewTemplate
  firstTermsCardBlockId: string | undefined
}) {
  return (
    <div className="flex flex-col items-center" style={{ marginTop: pageIndex === 0 ? 0 : PAGE_GAP_PX }}>
      <div
        data-page-sheet={pageIndex}
        className={`bg-white shadow-xl ${tpl.sheetClassName}`.trim()}
        style={{
          width: LETTER_WIDTH_PX,
          minHeight: LETTER_HEIGHT_PX,
          scrollMarginTop: 140,
          ...sheetPaddingPx(templateId),
          ...LIGHT_PIN_STYLE,
        }}
      >
        {pageIndex === 0 ? tpl.header(ctx) : tpl.compactHeader(ctx)}
        {renderPageBlocks(page.blocks, ctx, tpl, page.continuesTable, firstTermsCardBlockId)}
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
  templateId,
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
  // Defensive: a stale/garbage persisted template id falls back to Classic,
  // like the PDF pipeline does.
  const resolvedTemplateId: EstimateTemplateId = templateId in PREVIEW_TEMPLATES ? templateId : 'classic'
  const tpl = PREVIEW_TEMPLATES[resolvedTemplateId]
  // Computed ONCE across ALL pages (not per-page), like estimate-pdf-modern.tsx:
  // the id of the first terms-card block anywhere is the one that may carry the
  // PDF's extra top spacing.
  const firstTermsCardBlockId = pages
    ?.flatMap((page) => page.blocks)
    .find((block) => block.kind === 'terms-card')?.id

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
    // already INCLUDES that padding — the 32px is subtracted BEFORE dividing
    // so the scaled sheet always fits inside el's content box without
    // touching the padding at any zoom level. Formula and layout must always
    // describe the same 32px.
    const compute = () => {
      const avail = el.getBoundingClientRect().width || window.innerWidth
      setFitZoom(Math.min(1, Math.max(avail - 32, 0) / LETTER_WIDTH_PX))
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
              <PageSheet
                key={page.pageIndex}
                page={page}
                pageIndex={idx}
                totalPages={pages.length}
                ctx={ctx}
                templateId={resolvedTemplateId}
                tpl={tpl}
                firstTermsCardBlockId={firstTermsCardBlockId}
              />
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
