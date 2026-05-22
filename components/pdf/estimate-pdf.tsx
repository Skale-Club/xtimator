import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'
import type { EstimateWithSections } from '@/lib/queries/estimate'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { formatMoney } from '@/lib/money/currency'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'

// ---------------------------------------------------------------------------
// Phase 73-02: Static label maps for PDF i18n.
// @react-pdf/renderer runs server-side with no React context — plain lookups.
// Labels mirror lib/whatsapp/formatter.ts LABELS map (Phase 52).
// ---------------------------------------------------------------------------

interface PdfLabels {
  estimate: string
  project: string
  billTo: string
  summary: string
  description: string
  qty: string
  unit: string
  unitPrice: string
  total: string
  sectionSubtotal: string
  subtotal: string
  discount: string
  tax: string
  grandTotal: string
  paymentTerms: string
  timeline: string
  warranty: string
  notes: string
  page: string
  of: string
  date: string
  estimateNum: string
}

const PDF_LABELS: Record<EstimateLanguage, PdfLabels> = {
  en: {
    estimate: 'ESTIMATE',
    project: 'Project',
    billTo: 'Bill To',
    summary: 'Summary',
    description: 'Description',
    qty: 'Qty',
    unit: 'Unit',
    unitPrice: 'Unit Price',
    total: 'Total',
    sectionSubtotal: 'Section Subtotal',
    subtotal: 'Subtotal',
    discount: 'Discount',
    tax: 'Tax',
    grandTotal: 'Total',
    paymentTerms: 'Payment Terms',
    timeline: 'Timeline',
    warranty: 'Warranty',
    notes: 'Notes',
    page: 'Page',
    of: 'of',
    date: 'Date',
    estimateNum: 'Estimate #',
  },
  pt: {
    estimate: 'ORÇAMENTO',
    project: 'Projeto',
    billTo: 'Faturar Para',
    summary: 'Resumo',
    description: 'Descrição',
    qty: 'Qtd',
    unit: 'Unidade',
    unitPrice: 'Preço Unitário',
    total: 'Total',
    sectionSubtotal: 'Subtotal da Seção',
    subtotal: 'Subtotal',
    discount: 'Desconto',
    tax: 'Imposto',
    grandTotal: 'Total',
    paymentTerms: 'Condições de Pagamento',
    timeline: 'Prazo',
    warranty: 'Garantia',
    notes: 'Observações',
    page: 'Página',
    of: 'de',
    date: 'Data',
    estimateNum: 'Orçamento Nº',
  },
  es: {
    estimate: 'PRESUPUESTO',
    project: 'Proyecto',
    billTo: 'Facturar A',
    summary: 'Resumen',
    description: 'Descripción',
    qty: 'Cant',
    unit: 'Unidad',
    unitPrice: 'Precio Unitario',
    total: 'Total',
    sectionSubtotal: 'Subtotal de Sección',
    subtotal: 'Subtotal',
    discount: 'Descuento',
    tax: 'Impuesto',
    grandTotal: 'Total',
    paymentTerms: 'Términos de Pago',
    timeline: 'Plazo',
    warranty: 'Garantía',
    notes: 'Notas',
    page: 'Página',
    of: 'de',
    date: 'Fecha',
    estimateNum: 'Presupuesto Nº',
  },
}

const DATE_LOCALE: Record<EstimateLanguage, string> = {
  en: 'en-US',
  pt: 'pt-BR',
  es: 'es-MX',
}

// Text-based language indicator for PDF header.
// @react-pdf/renderer does not support SVG flags — plain text chip is used instead.
const LANG_INDICATOR: Record<EstimateLanguage, string> = {
  en: 'EN',
  pt: 'PT',
  es: 'ES',
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
}

function formatAddress(obj: {
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
}): string | null {
  const parts: string[] = []
  if (obj.address) parts.push(obj.address)
  const cityStateZip = [obj.city, obj.state].filter(Boolean).join(', ')
  if (cityStateZip && obj.zip) {
    parts.push(`${cityStateZip} ${obj.zip}`)
  } else if (cityStateZip) {
    parts.push(cityStateZip)
  } else if (obj.zip) {
    parts.push(obj.zip)
  }
  return parts.length > 0 ? parts.join('\n') : null
}

function formatDate(dateStr: string, locale = 'en-US'): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  logo: {
    width: 60,
    height: 60,
    objectFit: 'contain' as const,
  },
  companyName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 4,
  },
  companyContact: {
    fontSize: 9,
    color: '#6b7280',
    lineHeight: 1.5,
  },
  // Estimate title
  estimateTitle: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
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
    fontFamily: 'Helvetica-Bold',
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
    fontFamily: 'Helvetica-Bold',
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
    fontFamily: 'Helvetica-Bold',
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
    fontFamily: 'Helvetica-Bold',
    color: '#6b7280',
    marginRight: 12,
  },
  sectionSubtotalValue: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
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
    fontFamily: 'Helvetica-Bold',
  },
  grandTotalValue: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
  },
  // Terms
  termsSection: {
    marginTop: 24,
  },
  termsTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
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
}: EstimatePDFProps) {
  const brandColor = company.brand_primary_color ?? SYSTEM_COLORS.primary
  const companyAddress = formatAddress(company)
  const clientAddress = client ? formatAddress(client) : null
  const L = PDF_LABELS[language] ?? PDF_LABELS.en
  const dateLocale = DATE_LOCALE[language] ?? 'en-US'
  const fmt = (v: number) => formatMoney(v, estimate.currency_code)
  const fmtDate = (s: string) => formatDate(s, dateLocale)
  const langLabel = LANG_INDICATOR[language] ?? 'EN'

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header - fixed on every page */}
        <View
          style={[styles.header, { borderBottomColor: brandColor }]}
          fixed
        >
          <View style={styles.headerLeft}>
            {company.logo_url && (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={company.logo_url} style={styles.logo} />
            )}
            <View>
              <Text style={[styles.companyName, { color: brandColor }]}>
                {company.name}
              </Text>
              <Text style={styles.companyContact}>
                {[company.phone, company.email, company.website]
                  .filter(Boolean)
                  .join('  |  ')}
              </Text>
              {companyAddress && (
                <Text style={styles.companyContact}>{companyAddress}</Text>
              )}
            </View>
          </View>
          {/* Language indicator chip — text-based (SVG flags not supported in react-pdf) */}
          <Text style={styles.langBadge}>{langLabel}</Text>
        </View>

        {/* Title */}
        <Text style={[styles.estimateTitle, { color: brandColor }]}>
          {L.estimate}
        </Text>

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
              {L.date}: {fmtDate(estimate.created_at)}
            </Text>
            <Text style={[styles.infoValue, { color: '#6b7280' }]}>
              {L.estimateNum}{estimate.version}
            </Text>
          </View>

          {client && (
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>{L.billTo}</Text>
              <Text
                style={[styles.infoValue, { fontFamily: 'Helvetica-Bold' }]}
              >
                {client.name}
              </Text>
              {client.email && (
                <Text style={[styles.infoValue, { color: '#6b7280' }]}>
                  {client.email}
                </Text>
              )}
              {client.phone && (
                <Text style={[styles.infoValue, { color: '#6b7280' }]}>
                  {client.phone}
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

        {/* Summary */}
        {estimate.summary && (
          <View style={{ marginBottom: 16 }}>
            <Text style={styles.infoLabel}>{L.summary}</Text>
            <Text style={styles.termsText}>{estimate.summary}</Text>
          </View>
        )}

        {/* Sections with Line Items */}
        {estimate.sections.map((section) => (
          <View key={section.id} wrap>
            <View
              style={[
                styles.sectionHeader,
                { backgroundColor: brandColor },
              ]}
            >
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
                  {item.unit ?? '-'}
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
                style={[styles.grandTotalLabel, { color: brandColor }]}
              >
                {L.grandTotal}
              </Text>
              <Text
                style={[styles.grandTotalValue, { color: brandColor }]}
              >
                {fmt(estimate.total)}
              </Text>
            </View>
          </View>
        </View>

        {/* Estimate Terms, Payment Terms, Warranty, Timeline, Notes */}
        {(company.estimate_terms_enabled && company.estimate_terms_text ||
          estimate.payment_terms ||
          estimate.warranty_terms ||
          estimate.timeline ||
          estimate.notes) && (
          <View style={styles.termsSection}>
            {company.estimate_terms_enabled && company.estimate_terms_text && (
              <>
                <Text style={[styles.termsTitle, { color: brandColor }]}>
                  Estimate Terms
                </Text>
                <Text style={styles.termsText}>
                  {company.estimate_terms_text}
                </Text>
              </>
            )}
            {estimate.payment_terms && (
              <>
                <Text style={styles.termsTitle}>{L.paymentTerms}</Text>
                <Text style={styles.termsText}>
                  {estimate.payment_terms}
                </Text>
              </>
            )}
            {estimate.timeline && (
              <>
                <Text style={styles.termsTitle}>{L.timeline}</Text>
                <Text style={styles.termsText}>{estimate.timeline}</Text>
              </>
            )}
            {estimate.warranty_terms && (
              <>
                <Text style={styles.termsTitle}>{L.warranty}</Text>
                <Text style={styles.termsText}>
                  {estimate.warranty_terms}
                </Text>
              </>
            )}
            {estimate.notes && (
              <>
                <Text style={styles.termsTitle}>{L.notes}</Text>
                <Text style={styles.termsText}>{estimate.notes}</Text>
              </>
            )}
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
