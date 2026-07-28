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
// 260705-8u0-02: "Modern" editorial PDF template.
// Same data/props/helpers as EstimatePDF (Classic) — only StyleSheet/JSX differ.
// Serif (ESTIMATE_DESIGN_TOKENS.modern built-in fonts), thin rule dividers, brand color
// as accent-only (never a fill), large standalone hero total, more whitespace.
// @react-pdf/renderer runs server-side with no React context — plain lookups.
// Labels mirror lib/whatsapp/formatter.ts LABELS map (Phase 52).
// Phase 182 (ENGINE-01): labels/LANG_INDICATOR now sourced from the shared
// document engine module — see lib/estimate/document/labels.ts.
// ---------------------------------------------------------------------------

import { LABELS as PDF_LABELS, LANG_INDICATOR } from '@/lib/estimate/document/labels'
import { formatDate } from '@/lib/estimate/document/format'
import { ESTIMATE_DESIGN_TOKENS } from '@/lib/estimate/document/tokens'
import { PdfHeader } from './shared/pdf-header'
import { PdfInfoGrid } from './shared/pdf-info-grid'
import { PdfFooter } from './shared/pdf-footer'
import { PdfTitleBanner } from './shared/pdf-title-banner'
import { PdfSectionBlock } from './shared/pdf-section-block'
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
}

const styles = StyleSheet.create({
  page: {
    fontFamily: ESTIMATE_DESIGN_TOKENS.modern.fontFamily,
    fontSize: 10,
    paddingTop: 52,
    paddingBottom: 68,
    paddingHorizontal: 52,
    color: '#1f2937',
  },
  // Header — thin neutral hairline instead of a bold brand-colored border-bottom letterhead.
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 32,
    paddingBottom: 20,
    borderBottomWidth: 0.75,
    borderBottomColor: '#d1d5db',
  },
  headerLeft: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    gap: 4,
  },
  headerRight: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 8,
  },
  logo: {
    width: 64,
    height: 64,
    objectFit: 'contain' as const,
  },
  companyName: {
    fontSize: 15,
    fontFamily: ESTIMATE_DESIGN_TOKENS.modern.fontFamilyBold,
    marginBottom: 5,
    color: '#1f2937',
  },
  companyContact: {
    fontSize: 9,
    color: '#6b7280',
    lineHeight: 1.6,
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
  // Estimate title — smaller, letter-spaced, left-aligned accent text with a thin rule
  // underneath, instead of Classic's large centered bold headline.
  estimateTitle: {
    fontSize: 13,
    fontFamily: ESTIMATE_DESIGN_TOKENS.modern.fontFamilyBold,
    letterSpacing: 2,
    marginBottom: 6,
    textAlign: 'left',
  },
  estimateTitleRule: {
    borderBottomWidth: 0.75,
    marginBottom: 28,
    width: 60,
  },
  // Info grid
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  infoBlock: {
    width: '48%',
  },
  infoLabel: {
    fontSize: 8,
    fontFamily: ESTIMATE_DESIGN_TOKENS.modern.fontFamilyBold,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 5,
  },
  infoValue: {
    fontSize: 10,
    lineHeight: 1.6,
  },
  // Section — plain thin bottom-border rule instead of a brand-colored filled bar.
  sectionHeader: {
    paddingVertical: 6,
    marginTop: 22,
    marginBottom: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#1f2937',
  },
  sectionTitle: {
    fontSize: 11,
    fontFamily: ESTIMATE_DESIGN_TOKENS.modern.fontFamilyBold,
    color: '#1f2937',
    letterSpacing: 0.5,
  },
  // Table — lighter/thinner divider rules, no filled header background, airier feel.
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#d1d5db',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#f0f1f3',
  },
  tableRowAlt: {},
  colDescription: { width: '40%' },
  colQty: { width: '12%', textAlign: 'center' },
  colUnit: { width: '13%', textAlign: 'center' },
  colUnitPrice: { width: '17%', textAlign: 'right' },
  colTotal: { width: '18%', textAlign: 'right' },
  tableHeaderText: {
    fontSize: 8.5,
    fontFamily: ESTIMATE_DESIGN_TOKENS.modern.fontFamilyBold,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableCellText: {
    fontSize: 9.5,
    fontFamily: ESTIMATE_DESIGN_TOKENS.modern.fontFamily,
  },
  // Section subtotal
  sectionSubtotal: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderTopWidth: 0.5,
    borderTopColor: '#d1d5db',
  },
  sectionSubtotalLabel: {
    fontSize: 9,
    fontFamily: ESTIMATE_DESIGN_TOKENS.modern.fontFamilyBold,
    color: '#6b7280',
    marginRight: 12,
  },
  sectionSubtotalValue: {
    fontSize: 9,
    fontFamily: ESTIMATE_DESIGN_TOKENS.modern.fontFamilyBold,
    width: '18%',
    textAlign: 'right',
  },
  // Totals — thin hairline-divided rows instead of a boxed/bordered table.
  totalsContainer: {
    marginTop: 28,
    alignItems: 'flex-end',
  },
  totalsBlock: {
    width: '48%',
  },
  totalsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
  },
  totalsLabel: {
    fontSize: 10,
    color: '#6b7280',
    fontFamily: ESTIMATE_DESIGN_TOKENS.modern.fontFamily,
  },
  totalsValue: {
    fontSize: 10,
    textAlign: 'right',
    fontFamily: ESTIMATE_DESIGN_TOKENS.modern.fontFamily,
  },
  // Hero total — large standalone block, own margin, no border-top table row.
  grandTotalBlock: {
    marginTop: 16,
    alignItems: 'flex-end',
  },
  grandTotalLabel: {
    fontSize: 9,
    fontFamily: ESTIMATE_DESIGN_TOKENS.modern.fontFamilyBold,
    color: '#9ca3af',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  grandTotalValue: {
    fontSize: 30,
    fontFamily: ESTIMATE_DESIGN_TOKENS.modern.fontFamilyBold,
    textAlign: 'right',
  },
  // Terms
  termsSection: {
    marginTop: 32,
  },
  termsTitle: {
    fontSize: 10.5,
    fontFamily: ESTIMATE_DESIGN_TOKENS.modern.fontFamilyBold,
    marginBottom: 7,
    paddingBottom: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: '#d1d5db',
  },
  termsText: {
    fontSize: 9,
    lineHeight: 1.6,
    color: '#4b5563',
    marginBottom: 14,
  },
  // Language badge in header
  langBadge: {
    fontSize: 8.5,
    color: '#9ca3af',
    marginTop: 2,
    letterSpacing: 1,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 34,
    left: 52,
    right: 52,
    textAlign: 'center',
    fontSize: 8,
    color: '#9ca3af',
  },
})

export default function EstimatePDFModern({
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
  // brandOnFill → black/white foreground with max contrast over a brand fill. Computed
  // for interface parity with EstimatePDF (Classic uses it for section-header text over
  // a brand-color fill); Modern has no fill backgrounds, so it is unused in JSX here.
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

        {/* Title — accent-colored but smaller/letter-spaced, with a thin rule
            underneath. Called as a plain function (not JSX) — see
            components/pdf/shared/pdf-header.tsx's top comment for why. */}
        {PdfTitleBanner({
          label: L.estimate,
          solidFill: ESTIMATE_DESIGN_TOKENS.modern.solidHeaderFill,
          brandColor,
          brandText,
          brandOnFill,
          styles: {
            estimateTitle: styles.estimateTitle,
            estimateTitleRule: styles.estimateTitleRule,
          },
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
          clientNameFontFamily: ESTIMATE_DESIGN_TOKENS.modern.fontFamilyBold,
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
          <View style={{ marginBottom: 20 }}>
            <Text style={styles.infoLabel}>{L.summary}</Text>
            <Text style={styles.termsText}>{estimate.summary}</Text>
          </View>
        )}

        {/* Sections with Line Items — SENDHUB-04 (Phase 163): resolver-gated.
            Called as a plain function (not JSX) per section — see
            components/pdf/shared/pdf-header.tsx's top comment for why. */}
        {isSectionVisible(resolvedSettings, 'sections') && estimate.sections
          .map((section) => ({
            ...section,
            items: section.items.filter((i) => i.description.trim() !== ''),
          }))
          .filter((section) => section.items.length > 0)
          .map((section) =>
            PdfSectionBlock({
              section,
              solidFill: ESTIMATE_DESIGN_TOKENS.modern.solidHeaderFill,
              brandColor,
              brandOnFill,
              L,
              fmt,
              styles: {
                sectionHeader: styles.sectionHeader,
                sectionTitle: styles.sectionTitle,
                tableHeader: styles.tableHeader,
                tableRow: styles.tableRow,
                tableRowAlt: styles.tableRowAlt,
                colDescription: styles.colDescription,
                colQty: styles.colQty,
                colUnit: styles.colUnit,
                colUnitPrice: styles.colUnitPrice,
                colTotal: styles.colTotal,
                tableHeaderText: styles.tableHeaderText,
                tableCellText: styles.tableCellText,
                sectionSubtotal: styles.sectionSubtotal,
                sectionSubtotalLabel: styles.sectionSubtotalLabel,
                sectionSubtotalValue: styles.sectionSubtotalValue,
              },
            })
          )}

        {/* Totals. Called as a plain function (not JSX) — see
            components/pdf/shared/pdf-header.tsx's top comment for why. */}
        {PdfTotalsBlock({
          variant: 'modern',
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
            grandTotalBlock: styles.grandTotalBlock,
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
            topMargin: 20,
            styles: { termsTitle: styles.termsTitle },
          })}

        {/* Prepared by */}
        {preparedBy && (
          <View style={{ marginTop: 20 }}>
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
