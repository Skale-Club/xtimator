import {
  Document,
  Page,
  View,
  Text,
  Image,
  Link,
  StyleSheet,
} from '@react-pdf/renderer'
import '@/lib/pdf/register-fonts'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { ensureReadableOnWhite, readableTextColor } from '@/lib/color/contrast'
import { formatMoney } from '@/lib/money/currency'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import { formatPhoneForDisplay } from '@/lib/phone/format'
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
import { formatAddress, formatDate } from '@/lib/estimate/document/format'
import { ESTIMATE_DESIGN_TOKENS } from '@/lib/estimate/document/tokens'

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
  const companyAddress = formatAddress(company)
  const clientAddress = client ? formatAddress(client) : null
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
        {/* Header - fixed on every page */}
        <View style={styles.header} fixed>
          <View style={styles.headerLeft}>
            <View>
              <Text style={styles.companyName}>
                {company.website ? (
                  <Link src={company.website} style={styles.nameLink}>
                    {company.name}
                  </Link>
                ) : (
                  company.name
                )}
              </Text>
              <Text style={styles.companyContact}>
                {(
                  [
                    company.phone && (
                      <Link
                        key="phone"
                        src={`tel:${company.phone.replace(/[^\d+]/g, '')}`}
                        style={styles.contactLink}
                      >
                        {formatPhoneForDisplay(company.phone)}
                      </Link>
                    ),
                    company.email && (
                      <Link
                        key="email"
                        src={`mailto:${company.email}`}
                        style={styles.contactLink}
                      >
                        {company.email}
                      </Link>
                    ),
                    company.website && (
                      <Link
                        key="website"
                        src={company.website}
                        style={styles.contactLink}
                      >
                        {company.website}
                      </Link>
                    ),
                  ].filter(Boolean) as React.ReactNode[]
                ).reduce<React.ReactNode[]>(
                  (acc, node, i) => (i === 0 ? [node] : [...acc, '  |  ', node]),
                  [],
                )}
              </Text>
              {companyAddress && (
                <Text style={styles.companyContact}>{companyAddress}</Text>
              )}
            </View>
          </View>
          {/* RIGHT — language badge stacked above logo (Quick-260526-jo4) */}
          <View style={styles.headerRight}>
            {/* Language indicator chip — text-based (SVG flags not supported in react-pdf) */}
            <Text style={styles.langBadge}>{langLabel}</Text>
            {company.logo_url && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={company.logo_url} style={styles.logo} />
            )}
          </View>
        </View>

        {/* Title — accent-colored but smaller/letter-spaced, with a thin rule underneath */}
        <Text style={[styles.estimateTitle, { color: brandText }]}>
          {L.estimate}
        </Text>
        <View style={[styles.estimateTitleRule, { borderBottomColor: brandColor }]} />

        {/* Project & Client Info */}
        <View style={styles.infoRow}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>{L.project}</Text>
            <Text style={styles.infoValue}>{projectName}</Text>
            {projectType && (
              <Text style={[styles.infoValue, { color: '#6b7280' }]}>
                {projectType}
              </Text>
            )}
            <Text
              style={[
                styles.infoValue,
                { color: '#6b7280', marginTop: 4 },
              ]}
            >
              {L.date}: {fmtDate(estimate.estimate_date ?? estimate.created_at)}
            </Text>
            <Text style={[styles.infoValue, { color: '#6b7280' }]}>
              {L.estimateNum}{estimate.estimate_number ?? String(estimate.estimate_seq).padStart(4, '0')}
            </Text>
          </View>

          {client && (
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>{L.billTo}</Text>
              <Text
                style={[styles.infoValue, { fontFamily: ESTIMATE_DESIGN_TOKENS.modern.fontFamilyBold }]}
              >
                {client.name}
              </Text>
              {client.email && (
                <Text style={[styles.infoValue, { color: '#6b7280' }]}>
                  <Link src={`mailto:${client.email}`} style={styles.infoValueLink}>
                    {client.email}
                  </Link>
                </Text>
              )}
              {client.phone && (
                <Text style={[styles.infoValue, { color: '#6b7280' }]}>
                  <Link
                    src={`tel:${client.phone.replace(/[^\d+]/g, '')}`}
                    style={styles.infoValueLink}
                  >
                    {formatPhoneForDisplay(client.phone)}
                  </Link>
                </Text>
              )}
              {clientAddress && (
                <Text style={[styles.infoValue, { color: '#6b7280' }]}>
                  {clientAddress}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Summary — SENDHUB-04 (Phase 163): resolver-gated */}
        {isSectionVisible(resolvedSettings, 'summary') && estimate.summary && (
          <View style={{ marginBottom: 20 }}>
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
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
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

            {/* Hero total — large standalone number, own block, no border-top table row */}
            <View style={styles.grandTotalBlock}>
              <Text style={styles.grandTotalLabel}>{L.grandTotal}</Text>
              <Text style={[styles.grandTotalValue, { color: brandText }]}>
                {fmt(estimate.total)}
              </Text>
            </View>

            {/* PUI-02 (v4.11): deposit + balance due — only when a deposit is set.
                Locked order: Subtotal → Discount → Tax → Total → Deposit → Balance Due. */}
            {dep.showDeposit && (
              <View style={[styles.totalsRow, { marginTop: 16 }]}>
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
          <View style={{ marginTop: 20 }} wrap={false}>
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
          <View style={{ marginTop: 20 }}>
            <Text style={styles.infoLabel}>{L.preparedBy}</Text>
            <Text style={styles.infoValue}>{preparedBy}</Text>
          </View>
        )}

        {/* Footer - Page numbers on every page */}
        <Text
          style={styles.footer}
          fixed
          render={({ pageNumber, totalPages }) =>
            `${L.page} ${pageNumber} ${L.of} ${totalPages}`
          }
        />
      </Page>
    </Document>
  )
}
