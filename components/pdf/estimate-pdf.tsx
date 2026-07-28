import { Fragment } from 'react'
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from '@react-pdf/renderer'
import '@/lib/pdf/register-fonts'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { DocumentSignature, DocumentSection } from '@/lib/estimate/document/model'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { ensureReadableOnWhite, readableTextColor } from '@/lib/color/contrast'
import { formatMoney } from '@/lib/money/currency'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import { deriveDepositDisplay } from '@/lib/estimate/deposit-display'
import {
  resolvePresentationSettings,
  isSectionVisible,
} from '@/lib/estimate/presentation-settings'

// ---------------------------------------------------------------------------
// Phase 73-02: Static label maps for PDF i18n.
// @react-pdf/renderer runs server-side with no React context — plain lookups.
// Labels mirror lib/whatsapp/formatter.ts LABELS map (Phase 52).
// Phase 182 (ENGINE-01): labels/LANG_INDICATOR now sourced from the shared
// document engine module — see lib/estimate/document/labels.ts.
// ---------------------------------------------------------------------------

import { LABELS as PDF_LABELS, LANG_INDICATOR } from '@/lib/estimate/document/labels'
import { formatDate } from '@/lib/estimate/document/format'
import { ESTIMATE_DESIGN_TOKENS, LINE_HEIGHT, ESTIMATE_PAGE_GEOMETRY, cardTintFill } from '@/lib/estimate/document/tokens'
import { visibleSectionItems } from '@/lib/estimate/document/visible-items'
import type { PageAssignment, PageBlock } from '@/lib/estimate/pagination/types'
import { PdfHeader } from './shared/pdf-header'
import { PdfInfoGrid } from './shared/pdf-info-grid'
import { PdfFooter } from './shared/pdf-footer'
import { PdfTitleBanner } from './shared/pdf-title-banner'
import {
  PdfSectionHeader,
  PdfTableHeaderOnly,
  PdfSectionRows,
  PdfSectionSubtotal,
} from './shared/pdf-section-block'
import { PdfTermsCard } from './shared/pdf-terms-section'
import { PdfTotalsBlock } from './shared/pdf-totals-block'
import { PdfPhotoGrid } from './shared/pdf-photo-grid'
import { PdfSignatureBlock } from './shared/pdf-signature-block'

/** Plan-checker blocker 3 — the EXACT dispatch map (mirrors
 *  pdf-terms-section.tsx:88-163's Fragment order/title lookup verbatim). A
 *  literal lookup by `block.ref.termsKey`, never `L[block.ref.termsKey]`
 *  (which breaks 2/5 keys — `payment` is NOT a property literally named
 *  `payment` on `L`, it's `L.paymentTerms`). */
function buildTermsCardMap(
  company: { estimate_terms_text?: string | null },
  estimate: { payment_terms: string | null; timeline: string | null; warranty_terms: string | null; notes: string | null },
  L: ReturnType<typeof resolveLabels>,
  brandText: string
): Record<'estimate' | 'payment' | 'timeline' | 'warranty' | 'notes', { title: string; text: string; titleColor?: string }> {
  return {
    estimate: { title: 'Estimate Terms', text: company.estimate_terms_text ?? '', titleColor: brandText },
    payment: { title: L.paymentTerms, text: estimate.payment_terms ?? '' },
    timeline: { title: L.timeline, text: estimate.timeline ?? '' },
    warranty: { title: L.warranty, text: estimate.warranty_terms ?? '' },
    notes: { title: L.notes, text: estimate.notes ?? '' },
  }
}

function resolveLabels(language: EstimateLanguage) {
  return PDF_LABELS[language] ?? PDF_LABELS.en
}

/** Groups contiguous 'item-row' blocks sharing the same ref.sectionId (a
 *  single page's blocks only — a section's rows spanning 2 pages produce 2
 *  separate per-page groups, per PGBRK-03's repeated-table-header rule) into
 *  ONE PdfSectionRows call's worth of data. Returns, per FIRST block id in a
 *  run, the items slice + startIndex to render; every OTHER block id in that
 *  same run maps to 'skip' (already covered by the first block's render). */
function buildItemRowGroups(
  pageBlocks: PageBlock[],
  sectionsById: Map<string, DocumentSection>
): Map<string, { items: ReturnType<typeof visibleSectionItems>; startIndex: number } | 'skip'> {
  const map = new Map<string, { items: ReturnType<typeof visibleSectionItems>; startIndex: number } | 'skip'>()
  let i = 0
  while (i < pageBlocks.length) {
    const block = pageBlocks[i]
    if (block.kind !== 'item-row') {
      i += 1
      continue
    }
    const sectionId = block.ref?.sectionId ?? ''
    let j = i + 1
    while (
      j < pageBlocks.length &&
      pageBlocks[j].kind === 'item-row' &&
      pageBlocks[j].ref?.sectionId === sectionId
    ) {
      j += 1
    }
    const startIndex = block.ref?.itemIndex ?? 0
    const endIndex = (pageBlocks[j - 1].ref?.itemIndex ?? startIndex) + 1
    const section = sectionsById.get(sectionId)
    const items = section ? visibleSectionItems(section).slice(startIndex, endIndex) : []
    map.set(block.id, { items, startIndex })
    for (let k = i + 1; k < j; k++) map.set(pageBlocks[k].id, 'skip')
    i = j
  }
  return map
}

interface CompanyInfo {
  name: string
  owner_name: string | null
  phone: string | null
  email: string | null
  website: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
  logo_url: string | null
  brand_primary_color: string | null
  estimate_terms_enabled?: boolean
  estimate_terms_text?: string | null
}

interface ClientInfo {
  name: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
}

export interface EstimatePDFProps {
  estimate: EstimateWithSections
  company: CompanyInfo
  client: ClientInfo | null
  projectName: string
  projectType: string | null
  /** Target language — defaults to 'en'. Drives label translations and locale formatting. */
  language?: EstimateLanguage
  /** Name of the staff member or owner who generated this estimate. Shown as "Prepared by" in the PDF. */
  preparedBy?: string | null
  /** Attached photos with signed URLs pre-resolved server-side (route handler resolves them before rendering). Rendered only when non-empty. */
  attachedPhotos?: { url: string; caption: string | null }[]
  /** PDFPAR-02 — signature-display data (signer name, signed date, signature image). null = unsigned estimate: no signature block rendered at all. */
  signature?: DocumentSignature | null
  /** Phase 184 Plan 05 (PGBRK-01/03/04) — deterministic page assignments computed by lib/estimate/pagination/engine.ts's computePageBreaks(). Every caller (lib/pdf/render-estimate-pdf.ts + every direct-call test) computes this via the shared blocksFromModel()+computePageBreaks() pipeline before calling this component. */
  pages: PageAssignment[]
}

const styles = StyleSheet.create({
  page: {
    fontFamily: ESTIMATE_DESIGN_TOKENS.classic.fontFamily,
    fontSize: 10,
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    color: '#1f2937',
  },
  // Header
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: '#e5e7eb',
  },
  headerLeft: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 6,
  },
  logo: {
    width: 72,
    height: 72,
    objectFit: 'contain' as const,
  },
  companyName: {
    fontSize: 18,
    fontFamily: ESTIMATE_DESIGN_TOKENS.classic.fontFamilyBold,
    marginBottom: 4,
  },
  companyNameSmall: {
    fontSize: 11,
    fontFamily: ESTIMATE_DESIGN_TOKENS.classic.fontFamily,
    marginBottom: 2,
    marginTop: 4,
  },
  companyContact: {
    fontSize: 9,
    color: '#6b7280',
    lineHeight: 1.5,
  },
  contactLink: {
    color: '#6b7280',
    textDecoration: 'none',
  },
  nameLink: {
    textDecoration: 'none',
  },
  infoValueLink: {
    color: '#6b7280',
    textDecoration: 'none',
  },
  // Estimate title
  estimateTitle: {
    fontSize: 24,
    fontFamily: ESTIMATE_DESIGN_TOKENS.classic.fontFamilyBold,
    marginBottom: 20,
    textAlign: 'center',
  },
  // Info grid
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  infoBlock: {
    width: '48%',
  },
  infoLabel: {
    fontSize: 8,
    fontFamily: ESTIMATE_DESIGN_TOKENS.classic.fontFamilyBold,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 10,
    lineHeight: 1.5,
  },
  // Section
  sectionHeader: {
    padding: 8,
    marginTop: 16,
    marginBottom: 0,
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: ESTIMATE_DESIGN_TOKENS.classic.fontFamilyBold,
    color: '#ffffff',
    lineHeight: LINE_HEIGHT['Inter-Bold'],
  },
  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#f3f4f6',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
  },
  tableRowAlt: {
    backgroundColor: '#f9fafb',
  },
  colDescription: { width: '40%' },
  colQty: { width: '12%', textAlign: 'center' },
  colUnit: { width: '13%', textAlign: 'center' },
  colUnitPrice: { width: '17%', textAlign: 'right' },
  colTotal: { width: '18%', textAlign: 'right' },
  tableHeaderText: {
    fontSize: 9,
    fontFamily: ESTIMATE_DESIGN_TOKENS.classic.fontFamilyBold,
    color: '#6b7280',
  },
  tableCellText: {
    fontSize: 9,
    lineHeight: LINE_HEIGHT.Inter,
  },
  // Section subtotal
  sectionSubtotal: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderTopWidth: 1,
    borderTopColor: '#d1d5db',
  },
  sectionSubtotalLabel: {
    fontSize: 9,
    fontFamily: ESTIMATE_DESIGN_TOKENS.classic.fontFamilyBold,
    color: '#6b7280',
    marginRight: 12,
  },
  sectionSubtotalValue: {
    fontSize: 9,
    fontFamily: ESTIMATE_DESIGN_TOKENS.classic.fontFamilyBold,
    width: '18%',
    textAlign: 'right',
  },
  // Totals
  totalsContainer: {
    marginTop: 20,
    alignItems: 'flex-end',
  },
  totalsBlock: {
    width: '45%',
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
  },
  totalsLabel: {
    fontSize: 10,
    color: '#6b7280',
  },
  totalsValue: {
    fontSize: 10,
    textAlign: 'right',
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 2,
    borderTopColor: '#1f2937',
    marginTop: 4,
  },
  grandTotalLabel: {
    fontSize: 14,
    fontFamily: ESTIMATE_DESIGN_TOKENS.classic.fontFamilyBold,
  },
  grandTotalValue: {
    fontSize: 14,
    fontFamily: ESTIMATE_DESIGN_TOKENS.classic.fontFamilyBold,
    textAlign: 'right',
  },
  // Terms — marginTop moved to PdfTermsSection's topMarginPt prop (Phase 184
  // Plan 04, PGBRK-02): the container itself is no longer atomic/margined,
  // spacing now lands on whichever card is emitted first.
  termsSection: {},
  termsTitle: {
    fontSize: 11,
    fontFamily: ESTIMATE_DESIGN_TOKENS.classic.fontFamilyBold,
    marginBottom: 6,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  termsText: {
    fontSize: 9,
    lineHeight: 1.5,
    color: '#4b5563',
    marginBottom: 12,
  },
  // Language badge in header
  langBadge: {
    fontSize: 9,
    color: '#6b7280',
    marginTop: 2,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
  },
})

export default function EstimatePDF({
  estimate,
  company,
  client,
  projectName,
  projectType,
  language = 'en',
  preparedBy,
  attachedPhotos,
  signature,
  pages,
}: EstimatePDFProps) {
  // SENDHUB-04 (Phase 163): resolve once at the render boundary. Cast-with-fallback
  // mirrors components/share/estimate-view.tsx:157-161 — the query type may lag the
  // dormant-first Phase 161 column, so we defensively cast without breaking
  // EstimateWithSections's stable type surface.
  //
  // Phase 184 Plan 05 (PGBRK-01/03/04): section/summary/photos VISIBILITY is
  // now authoritatively encoded by block PRESENCE in `pages` (blocksFromModel
  // already applied every isSectionVisible() gate before computing `pages`)
  // — resolvedSettings is kept here only as a redundant, always-consistent
  // (same estimate, same function) belt-and-suspenders guard on 'summary'/
  // 'photo-row' below, matching every other document surface's structural
  // convention of importing resolvePresentationSettings directly.
  const resolvedSettings = resolvePresentationSettings(
    (estimate as { presentation_settings?: unknown }).presentation_settings
  )

  const brandColor = company.brand_primary_color ?? SYSTEM_COLORS.primary
  // Render-time WCAG adaptation of the brand color (stored value never mutated):
  //   brandText   → brand color darkened to reach 4.5:1 as text on white
  //   brandOnFill → black/white foreground with max contrast over a brand fill
  const brandText = ensureReadableOnWhite(brandColor)
  const brandOnFill = readableTextColor(brandColor)
  const L = resolveLabels(language)
  const fmt = (v: number) => formatMoney(v, estimate.currency_code)
  // PUI-02 (v4.11): READ the persisted deposit/balance-due from the server row (GUARD-03 —
  // never recompute). showDeposit is false for legacy / deposit_type 'none' rows.
  const dep = deriveDepositDisplay(estimate)
  const fmtDate = (s: string) => formatDate(s, language)
  const langLabel = LANG_INDICATOR[language] ?? 'EN'

  const sectionsById = new Map(estimate.sections.map((section) => [section.id, section]))
  const termsCardMap = buildTermsCardMap(company, estimate, L, brandText)
  // Plan-checker warning 9 — computed ONCE across ALL pages (not per-page):
  // the id of the first 'terms-card' block anywhere gets the removed
  // termsSection.marginTop bonus; every other terms-card gets none.
  const firstTermsCardBlockId = pages.flatMap((page) => page.blocks).find((block) => block.kind === 'terms-card')?.id

  function renderBlockForKind(block: PageBlock, itemRowGroups: ReturnType<typeof buildItemRowGroups>) {
    switch (block.kind) {
      case 'title-banner':
        return (
          <Fragment key={block.id}>
            {PdfTitleBanner({
              label: L.estimate,
              solidFill: ESTIMATE_DESIGN_TOKENS.classic.solidHeaderFill,
              brandColor,
              brandText,
              brandOnFill,
              styles: { estimateTitle: styles.estimateTitle },
            })}
          </Fragment>
        )
      case 'info-grid':
        return (
          <Fragment key={block.id}>
            {PdfInfoGrid({
              L,
              projectName,
              projectType,
              estimate,
              client,
              fmtDate,
              clientNameFontFamily: ESTIMATE_DESIGN_TOKENS.classic.fontFamilyBold,
              styles: {
                infoRow: styles.infoRow,
                infoBlock: styles.infoBlock,
                infoLabel: styles.infoLabel,
                infoValue: styles.infoValue,
                infoValueLink: styles.infoValueLink,
              },
            })}
          </Fragment>
        )
      case 'summary':
        return isSectionVisible(resolvedSettings, 'summary') && estimate.summary ? (
          <View key={block.id} style={{ marginBottom: 16 }}>
            <Text style={styles.infoLabel}>{L.summary}</Text>
            <Text style={styles.termsText}>{estimate.summary}</Text>
          </View>
        ) : null
      case 'section-header': {
        const sectionId = block.ref?.sectionId ?? ''
        const section = sectionsById.get(sectionId)
        return (
          <Fragment key={block.id}>
            {PdfSectionHeader({
              sectionId,
              title: section?.title ?? '',
              solidFill: ESTIMATE_DESIGN_TOKENS.classic.solidHeaderFill,
              brandColor,
              brandOnFill,
              styles: { sectionHeader: styles.sectionHeader, sectionTitle: styles.sectionTitle },
            })}
            {PdfTableHeaderOnly({
              sectionId,
              L,
              styles: {
                tableHeader: styles.tableHeader,
                tableHeaderText: styles.tableHeaderText,
                colDescription: styles.colDescription,
                colQty: styles.colQty,
                colUnit: styles.colUnit,
                colUnitPrice: styles.colUnitPrice,
                colTotal: styles.colTotal,
              },
            })}
          </Fragment>
        )
      }
      case 'item-row': {
        const group = itemRowGroups.get(block.id)
        if (!group || group === 'skip') return null
        return (
          <Fragment key={block.id}>
            {PdfSectionRows({
              sectionId: block.ref?.sectionId ?? '',
              items: group.items,
              startIndex: group.startIndex,
              fmt,
              styles: {
                tableRow: styles.tableRow,
                tableRowAlt: styles.tableRowAlt,
                colDescription: styles.colDescription,
                colQty: styles.colQty,
                colUnit: styles.colUnit,
                colUnitPrice: styles.colUnitPrice,
                colTotal: styles.colTotal,
                tableCellText: styles.tableCellText,
              },
            })}
          </Fragment>
        )
      }
      case 'section-subtotal': {
        const sectionId = block.ref?.sectionId ?? ''
        const section = sectionsById.get(sectionId)
        return (
          <Fragment key={block.id}>
            {PdfSectionSubtotal({
              sectionId,
              label: L.sectionSubtotal,
              value: fmt(section?.subtotal ?? 0),
              styles: {
                sectionSubtotal: styles.sectionSubtotal,
                sectionSubtotalLabel: styles.sectionSubtotalLabel,
                sectionSubtotalValue: styles.sectionSubtotalValue,
              },
            })}
          </Fragment>
        )
      }
      case 'totals':
        return (
          <Fragment key={block.id}>
            {PdfTotalsBlock({
              variant: 'classic',
              estimate,
              dep,
              L,
              brandText,
              fmt,
              styles: {
                totalsContainer: styles.totalsContainer,
                totalsBlock: styles.totalsBlock,
                totalsRow: styles.totalsRow,
                totalsLabel: styles.totalsLabel,
                totalsValue: styles.totalsValue,
                grandTotalRow: styles.grandTotalRow,
                grandTotalLabel: styles.grandTotalLabel,
                grandTotalValue: styles.grandTotalValue,
              },
            })}
          </Fragment>
        )
      case 'terms-card': {
        const termsKey = block.ref?.termsKey
        if (!termsKey) return null
        const card = termsCardMap[termsKey]
        return (
          <Fragment key={block.id}>
            {PdfTermsCard({
              title: card.title,
              text: card.text,
              titleColor: card.titleColor,
              topMarginPt: block.id === firstTermsCardBlockId ? 24 : undefined,
              cardFill: cardTintFill(brandColor),
              styles: { termsTitle: styles.termsTitle, termsText: styles.termsText },
            })}
          </Fragment>
        )
      }
      case 'signature':
        return (
          <Fragment key={block.id}>
            {PdfSignatureBlock({
              signature: signature ?? null,
              L,
              fmtDate,
              cardFill: cardTintFill(brandColor),
              styles: { termsTitle: styles.termsTitle },
            })}
          </Fragment>
        )
      case 'photo-row': {
        const range = block.ref?.photoRange
        if (!range) return null
        const isFirst = range[0] === 0
        return isSectionVisible(resolvedSettings, 'photos') ? (
          <Fragment key={block.id}>
            {PdfPhotoGrid({
              photos: (attachedPhotos ?? []).slice(range[0], range[1]),
              L,
              topMargin: isFirst ? 16 : 0,
              contentWidthPt: ESTIMATE_PAGE_GEOMETRY.classic.contentWidthPt,
              showLabel: isFirst,
              styles: { termsTitle: styles.termsTitle },
            })}
          </Fragment>
        ) : null
      }
      case 'prepared-by':
        return preparedBy ? (
          <View key={block.id} style={{ marginTop: 16 }}>
            <Text style={styles.infoLabel}>{L.preparedBy}</Text>
            <Text style={styles.infoValue}>{preparedBy}</Text>
          </View>
        ) : null
      default:
        return null
    }
  }

  return (
    <Document>
      {pages.map((page) => {
        const itemRowGroups = buildItemRowGroups(page.blocks, sectionsById)
        return (
          <Page key={page.pageIndex} size="LETTER" style={styles.page}>
            {/* Header - fixed on every page. Called as a plain function (not JSX) —
                see components/pdf/shared/pdf-header.tsx's top comment for why. */}
            {PdfHeader({
              company,
              headerBorderColor: brandColor,
              companyNameColor: brandText,
              langLabel,
              styles: {
                header: styles.header,
                headerLeft: styles.headerLeft,
                headerRight: styles.headerRight,
                logo: styles.logo,
                companyName: styles.companyName,
                companyContact: styles.companyContact,
                contactLink: styles.contactLink,
                nameLink: styles.nameLink,
                langBadge: styles.langBadge,
              },
            })}

            {/* PGBRK-03 — repeated items-table column header, ONE MORE time
                at the very top of a page whose FIRST block continues a
                section's rows from an earlier page. Mutually exclusive with
                the section-header case's own PdfTableHeaderOnly call below
                (continuesTable is defined as blocks[0].kind === 'item-row',
                which a page starting with a section-header can never be). */}
            {page.continuesTable &&
              PdfTableHeaderOnly({
                sectionId: `continuation-${page.blocks[0]?.ref?.sectionId ?? page.pageIndex}`,
                L,
                styles: {
                  tableHeader: styles.tableHeader,
                  tableHeaderText: styles.tableHeaderText,
                  colDescription: styles.colDescription,
                  colQty: styles.colQty,
                  colUnit: styles.colUnit,
                  colUnitPrice: styles.colUnitPrice,
                  colTotal: styles.colTotal,
                },
              })}

            {/* Every block kind (title-banner/info-grid/summary/sections/totals/
                terms/signature/photos/prepared-by) dispatches through this ONE
                uniform, keyed renderBlockForKind — no special-casing, no
                `i === 0` literal, matching `page.blocks`' own order exactly. */}
            {page.blocks.map((block) => renderBlockForKind(block, itemRowGroups))}

            {/* Footer - Page numbers on every page. Called as a plain function
                (not JSX) — see components/pdf/shared/pdf-header.tsx's top comment for why. */}
            {PdfFooter({ styles: { footer: styles.footer }, L })}
          </Page>
        )
      })}
    </Document>
  )
}
