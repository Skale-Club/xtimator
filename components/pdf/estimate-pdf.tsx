import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from '@react-pdf/renderer'
import '@/lib/pdf/register-fonts'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import type { DocumentSignature } from '@/lib/estimate/document/model'
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
import { ESTIMATE_DESIGN_TOKENS, LINE_HEIGHT, ESTIMATE_PAGE_GEOMETRY } from '@/lib/estimate/document/tokens'
import { visibleSectionItems } from '@/lib/estimate/document/visible-items'
import type { PageAssignment } from '@/lib/estimate/pagination/types'
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
import { PdfTermsSection } from './shared/pdf-terms-section'
import { PdfTotalsBlock } from './shared/pdf-totals-block'
import { PdfPhotoGrid } from './shared/pdf-photo-grid'
import { PdfSignatureBlock } from './shared/pdf-signature-block'

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
  /** Phase 184 Plan 05 (PGBRK-01/03/04) — deterministic page assignments computed by lib/estimate/pagination/engine.ts's computePageBreaks(). Optional here (Task 1, type-only, additive no-op); Task 2 wires the actual N-explicit-<Page> composition consuming this. */
  pages?: PageAssignment[]
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
}: EstimatePDFProps) {
  // SENDHUB-04 (Phase 163): resolve once at the render boundary. Cast-with-fallback
  // mirrors components/share/estimate-view.tsx:157-161 — the query type may lag the
  // dormant-first Phase 161 column, so we defensively cast without breaking
  // EstimateWithSections's stable type surface.
  const resolvedSettings = resolvePresentationSettings(
    (estimate as { presentation_settings?: unknown }).presentation_settings
  )

  const brandColor = company.brand_primary_color ?? SYSTEM_COLORS.primary
  // Render-time WCAG adaptation of the brand color (stored value never mutated):
  //   brandText   → brand color darkened to reach 4.5:1 as text on white
  //   brandOnFill → black/white foreground with max contrast over a brand fill
  const brandText = ensureReadableOnWhite(brandColor)
  const brandOnFill = readableTextColor(brandColor)
  const L = PDF_LABELS[language] ?? PDF_LABELS.en
  const fmt = (v: number) => formatMoney(v, estimate.currency_code)
  // PUI-02 (v4.11): READ the persisted deposit/balance-due from the server row (GUARD-03 —
  // never recompute). showDeposit is false for legacy / deposit_type 'none' rows.
  const dep = deriveDepositDisplay(estimate)
  const fmtDate = (s: string) => formatDate(s, language)
  const langLabel = LANG_INDICATOR[language] ?? 'EN'

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
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

        {/* Title. Called as a plain function (not JSX) — see
            components/pdf/shared/pdf-header.tsx's top comment for why. */}
        {PdfTitleBanner({
          label: L.estimate,
          solidFill: ESTIMATE_DESIGN_TOKENS.classic.solidHeaderFill,
          brandColor,
          brandText,
          brandOnFill,
          styles: { estimateTitle: styles.estimateTitle },
        })}

        {/* Project & Client Info. Called as a plain function (not JSX) —
            see components/pdf/shared/pdf-header.tsx's top comment for why. */}
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

        {/* Summary — SENDHUB-04 (Phase 163): resolver-gated */}
        {isSectionVisible(resolvedSettings, 'summary') && estimate.summary && (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.infoLabel}>{L.summary}</Text>
            <Text style={styles.termsText}>{estimate.summary}</Text>
          </View>
        )}

        {/* Sections with Line Items — SENDHUB-04 (Phase 163): resolver-gated.
            Phase 184 Plan 04 (PGBRK-02): each section now renders as 4
            independently-placeable, individually-keyed pieces (header,
            table header, rows, subtotal) instead of one monolithic block —
            reproduces today's single-page tree byte-for-byte (startIndex: 0).
            Called as plain functions (not JSX) per section — see
            components/pdf/shared/pdf-header.tsx's top comment for why. */}
        {isSectionVisible(resolvedSettings, 'sections') && estimate.sections
          .map((section) => ({
            ...section,
            items: visibleSectionItems(section),
          }))
          .filter((section) => section.items.length > 0)
          .map((section) => [
            PdfSectionHeader({
              sectionId: section.id,
              title: section.title,
              solidFill: ESTIMATE_DESIGN_TOKENS.classic.solidHeaderFill,
              brandColor,
              brandOnFill,
              styles: {
                sectionHeader: styles.sectionHeader,
                sectionTitle: styles.sectionTitle,
              },
            }),
            PdfTableHeaderOnly({
              sectionId: section.id,
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
            }),
            PdfSectionRows({
              sectionId: section.id,
              items: section.items,
              startIndex: 0,
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
            }),
            PdfSectionSubtotal({
              sectionId: section.id,
              label: L.sectionSubtotal,
              value: fmt(section.subtotal),
              styles: {
                sectionSubtotal: styles.sectionSubtotal,
                sectionSubtotalLabel: styles.sectionSubtotalLabel,
                sectionSubtotalValue: styles.sectionSubtotalValue,
              },
            }),
          ])}

        {/* Totals. Called as a plain function (not JSX) — see
            components/pdf/shared/pdf-header.tsx's top comment for why. */}
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

        {/* Estimate Terms, Payment Terms, Warranty, Timeline, Notes.
            SENDHUB-04 (Phase 163): each block gated on its resolver key; the
            outer wrapper stays hidden when every gated term is invisible OR
            null. Called as a plain function (not JSX) — see
            components/pdf/shared/pdf-header.tsx's top comment for why. */}
        {PdfTermsSection({
          company,
          estimate,
          resolvedSettings,
          L,
          brandText,
          topMarginPt: 24,
          styles: {
            termsSection: styles.termsSection,
            termsTitle: styles.termsTitle,
            termsText: styles.termsText,
          },
        })}

        {/* Signature — PDFPAR-02, net-new. Data-presence gated only (no
            presentation_settings key exists for it, per CONTEXT.md's locked
            rule). Position: Terms -> Signature -> Photos, matching the
            webview's Plan 183-05 placement. Called as a plain function (not
            JSX) — see components/pdf/shared/pdf-header.tsx's top comment for why. */}
        {PdfSignatureBlock({
          signature: signature ?? null,
          L,
          fmtDate,
          styles: { termsTitle: styles.termsTitle },
        })}

        {/* Attached photos — SENDHUB-04 (Phase 163): resolver-gated. Called
            as a plain function (not JSX) — see
            components/pdf/shared/pdf-header.tsx's top comment for why. */}
        {isSectionVisible(resolvedSettings, 'photos') && attachedPhotos && attachedPhotos.length > 0 &&
          PdfPhotoGrid({
            photos: attachedPhotos,
            L,
            topMargin: 16,
            contentWidthPt: ESTIMATE_PAGE_GEOMETRY.classic.contentWidthPt,
            showLabel: true,
            styles: { termsTitle: styles.termsTitle },
          })}

        {/* Prepared by */}
        {preparedBy && (
          <View style={{ marginTop: 16 }}>
            <Text style={styles.infoLabel}>{L.preparedBy}</Text>
            <Text style={styles.infoValue}>{preparedBy}</Text>
          </View>
        )}

        {/* Footer - Page numbers on every page. Called as a plain function
            (not JSX) — see components/pdf/shared/pdf-header.tsx's top comment for why. */}
        {PdfFooter({ styles: { footer: styles.footer }, L })}
      </Page>
    </Document>
  )
}
