import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'
import '@/lib/pdf/register-fonts'
import type { EstimateWithSections } from '@/lib/queries/estimate'
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
import { ESTIMATE_DESIGN_TOKENS } from '@/lib/estimate/document/tokens'
import { PdfHeader } from './shared/pdf-header'
import { PdfInfoGrid } from './shared/pdf-info-grid'
import { PdfFooter } from './shared/pdf-footer'

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
  // Terms
  termsSection: {
    marginTop: 24,
  },
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

        {/* Title */}
        <Text style={[styles.estimateTitle, { color: brandText }]}>
          {L.estimate}
        </Text>

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

        {/* Sections with Line Items — SENDHUB-04 (Phase 163): resolver-gated */}
        {isSectionVisible(resolvedSettings, 'sections') && estimate.sections
          .map((section) => ({
            ...section,
            items: section.items.filter((i) => i.description.trim() !== ''),
          }))
          .filter((section) => section.items.length > 0)
          .map((section) => (
          <View key={section.id} wrap>
            <View
              style={[
                styles.sectionHeader,
                { backgroundColor: brandColor },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: brandOnFill }]}>{section.title}</Text>
            </View>

            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colDescription]}>
                {L.description}
              </Text>
              <Text style={[styles.tableHeaderText, styles.colQty]}>
                {L.qty}
              </Text>
              <Text style={[styles.tableHeaderText, styles.colUnit]}>
                {L.unit}
              </Text>
              <Text style={[styles.tableHeaderText, styles.colUnitPrice]}>
                {L.unitPrice}
              </Text>
              <Text style={[styles.tableHeaderText, styles.colTotal]}>
                {L.total}
              </Text>
            </View>

            {/* Table Rows */}
            {section.items.map((item, idx) => (
              <View
                key={item.id}
                style={[
                  styles.tableRow,
                  idx % 2 === 1 ? styles.tableRowAlt : {},
                ]}
              >
                <Text style={[styles.tableCellText, styles.colDescription]}>
                  {item.description}
                </Text>
                <Text style={[styles.tableCellText, styles.colQty]}>
                  {item.quantity}
                </Text>
                <Text style={[styles.tableCellText, styles.colUnit]}>
                  {item.unit ?? ''}
                </Text>
                <Text style={[styles.tableCellText, styles.colUnitPrice]}>
                  {fmt(item.unit_price)}
                </Text>
                <Text style={[styles.tableCellText, styles.colTotal]}>
                  {fmt(item.total)}
                </Text>
              </View>
            ))}

            {/* Section Subtotal */}
            <View style={styles.sectionSubtotal}>
              <Text style={styles.sectionSubtotalLabel}>
                {L.sectionSubtotal}
              </Text>
              <Text style={styles.sectionSubtotalValue}>
                {fmt(section.subtotal)}
              </Text>
            </View>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>{L.subtotal}</Text>
              <Text style={styles.totalsValue}>
                {fmt(estimate.subtotal)}
              </Text>
            </View>

            {estimate.discount_amount > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>
                  {L.discount}
                  {estimate.discount_type === 'percentage'
                    ? ` (${estimate.discount_value}%)`
                    : ''}
                </Text>
                <Text style={[styles.totalsValue, { color: '#dc2626' }]}>
                  -{fmt(estimate.discount_amount)}
                </Text>
              </View>
            )}

            {estimate.tax_amount > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>
                  {L.tax} ({(estimate.tax_rate * 100).toFixed(2)}%)
                </Text>
                <Text style={styles.totalsValue}>
                  {fmt(estimate.tax_amount)}
                </Text>
              </View>
            )}

            <View style={styles.grandTotalRow}>
              <Text
                style={[styles.grandTotalLabel, { color: brandText }]}
              >
                {L.grandTotal}
              </Text>
              <Text
                style={[styles.grandTotalValue, { color: brandText }]}
              >
                {fmt(estimate.total)}
              </Text>
            </View>

            {/* PUI-02 (v4.11): deposit + balance due — only when a deposit is set.
                Locked order: Subtotal → Discount → Tax → Total → Deposit → Balance Due. */}
            {dep.showDeposit && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>{L.deposit}</Text>
                <Text style={styles.totalsValue}>-{fmt(dep.depositAmount)}</Text>
              </View>
            )}

            {dep.showDeposit && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>{L.balanceDue}</Text>
                <Text style={styles.totalsValue}>{fmt(dep.balanceDue)}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Estimate Terms, Payment Terms, Warranty, Timeline, Notes.
            SENDHUB-04 (Phase 163): each block gated on its resolver key; the
            outer wrapper stays hidden when every gated term is invisible OR null. */}
        {(company.estimate_terms_enabled && company.estimate_terms_text ||
          (isSectionVisible(resolvedSettings, 'payment_terms') && estimate.payment_terms) ||
          (isSectionVisible(resolvedSettings, 'warranty_terms') && estimate.warranty_terms) ||
          (isSectionVisible(resolvedSettings, 'timeline') && estimate.timeline) ||
          (isSectionVisible(resolvedSettings, 'notes') && estimate.notes)) && (
          <View style={styles.termsSection}>
            {company.estimate_terms_enabled && company.estimate_terms_text && (
              <>
                <Text style={[styles.termsTitle, { color: brandText }]}>
                  Estimate Terms
                </Text>
                <Text style={styles.termsText}>
                  {company.estimate_terms_text}
                </Text>
              </>
            )}
            {isSectionVisible(resolvedSettings, 'payment_terms') && estimate.payment_terms && (
              <>
                <Text style={styles.termsTitle}>{L.paymentTerms}</Text>
                <Text style={styles.termsText}>
                  {estimate.payment_terms}
                </Text>
              </>
            )}
            {isSectionVisible(resolvedSettings, 'timeline') && estimate.timeline && (
              <>
                <Text style={styles.termsTitle}>{L.timeline}</Text>
                <Text style={styles.termsText}>{estimate.timeline}</Text>
              </>
            )}
            {isSectionVisible(resolvedSettings, 'warranty_terms') && estimate.warranty_terms && (
              <>
                <Text style={styles.termsTitle}>{L.warranty}</Text>
                <Text style={styles.termsText}>
                  {estimate.warranty_terms}
                </Text>
              </>
            )}
            {isSectionVisible(resolvedSettings, 'notes') && estimate.notes && (
              <>
                <Text style={styles.termsTitle}>{L.notes}</Text>
                <Text style={styles.termsText}>{estimate.notes}</Text>
              </>
            )}
          </View>
        )}

        {/* Attached photos — SENDHUB-04 (Phase 163): resolver-gated */}
        {isSectionVisible(resolvedSettings, 'photos') && attachedPhotos && attachedPhotos.length > 0 && (
          <View style={{ marginTop: 16 }} wrap={false}>
            <Text style={styles.termsTitle}>{L.photos}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {attachedPhotos.map((photo, i) => (
                // eslint-disable-next-line jsx-a11y/alt-text
                <Image
                  key={i}
                  src={photo.url}
                  style={{ width: 150, height: 150, objectFit: 'cover' as const }}
                />
              ))}
            </View>
          </View>
        )}

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
