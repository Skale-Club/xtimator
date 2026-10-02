// components/workspace/estimate/preview-template/types.ts
//
// The seam between PaginatedPreview (page walking, sheet chrome, zoom — all
// template-agnostic) and the two per-template look implementations
// (classic.tsx, modern.tsx). PaginatedPreview resolves WHAT a block shows
// (visibility gates, which terms card, which photos, the signature data) and
// hands the already-resolved values to exactly one PreviewTemplate, selected
// once per render from PREVIEW_TEMPLATES — so a template is purely
// presentational and no call site ever re-decides "which template am I?".
import type { ReactNode } from 'react'
import type {
  DocumentClient,
  DocumentCompany,
  DocumentItem,
  DocumentPhoto,
  DocumentSection,
  DocumentSignature,
  EstimateDocumentData,
} from '@/lib/estimate/document/model'
import type { DocumentLabels } from '@/lib/estimate/document/labels'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import type { DepositDisplay } from '@/lib/estimate/deposit-display'
import type { ResolvedPresentationSettings } from '@/lib/estimate/presentation-settings'
import type { PageBlock } from '@/lib/estimate/pagination/types'

/** Everything a block renderer needs, built once per PaginatedPreview render. */
export interface RenderCtx {
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

/** One resolved terms card. `key` drives the data-page-block-id
 *  (`terms-<key>`); `isFirst` is true only for the first terms-card block of
 *  the whole document (the PDF gives that one card — and only that one — extra
 *  top spacing, which a template may mirror). */
export interface ResolvedTermsCard {
  key: 'estimate' | 'payment' | 'timeline' | 'warranty' | 'notes'
  label: string
  text: string
  isFirst: boolean
}

export interface PreviewTemplate {
  /** Extra class names for the sheet root (e.g. Modern's `font-serif`). */
  sheetClassName: string
  /** Page-1 company header. */
  header(ctx: RenderCtx): ReactNode
  /** Pages 2+ one-line header. */
  compactHeader(ctx: RenderCtx): ReactNode
  titleBanner(key: string, ctx: RenderCtx): ReactNode
  infoGrid(key: string, ctx: RenderCtx): ReactNode
  summary(key: string, text: string, ctx: RenderCtx): ReactNode
  /** A section's own header band. `continued` renders the PGBRK-03 "(cont.)"
   *  title that opens a continuation page (no data-page-block-id: it is not an
   *  engine block). */
  sectionHeader(key: string, sectionId: string, ctx: RenderCtx, continued: boolean): ReactNode
  /** The column-header <thead> of an item table; `testId` is stamped on the
   *  <thead> itself when given. */
  tableHead(ctx: RenderCtx, testId?: string): ReactNode
  /** One item <tr>. `itemIndex` is the item's index in the section's FULL
   *  visible list (zebra parity must follow it, not slice position). */
  itemRow(block: PageBlock, item: DocumentItem, itemIndex: number, ctx: RenderCtx): ReactNode
  sectionSubtotal(block: PageBlock, subtotal: number, ctx: RenderCtx): ReactNode
  totals(key: string, ctx: RenderCtx): ReactNode
  termsCard(block: PageBlock, card: ResolvedTermsCard, ctx: RenderCtx): ReactNode
  signature(block: PageBlock, signature: DocumentSignature, ctx: RenderCtx): ReactNode
  /** `showLabel` is true on the first photo row only. */
  photoRow(block: PageBlock, photos: DocumentPhoto[], showLabel: boolean, ctx: RenderCtx): ReactNode
  preparedBy(block: PageBlock, name: string, ctx: RenderCtx): ReactNode
}
