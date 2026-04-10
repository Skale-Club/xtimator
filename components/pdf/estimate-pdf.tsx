import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from '@react-pdf/renderer'
import type { EstimateWithSections } from '@/lib/queries/estimate'

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
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
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

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', {
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
}: EstimatePDFProps) {
  const brandColor = company.brand_primary_color ?? '#2563EB'
  const companyAddress = formatAddress(company)
  const clientAddress = client ? formatAddress(client) : null

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
        </View>

        {/* Title */}
        <Text style={[styles.estimateTitle, { color: brandColor }]}>
          ESTIMATE
        </Text>

        {/* Project & Client Info */}
        <View style={styles.infoRow}>
          <View style={styles.infoBlock}>
            <Text style={styles.infoLabel}>Project</Text>
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
              Date: {formatDate(estimate.created_at)}
            </Text>
            <Text style={[styles.infoValue, { color: '#6b7280' }]}>
              Estimate #{estimate.version}
            </Text>
          </View>

          {client && (
            <View style={styles.infoBlock}>
              <Text style={styles.infoLabel}>Bill To</Text>
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
            <Text style={styles.infoLabel}>Summary</Text>
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
                Description
              </Text>
              <Text style={[styles.tableHeaderText, styles.colQty]}>
                Qty
              </Text>
              <Text style={[styles.tableHeaderText, styles.colUnit]}>
                Unit
              </Text>
              <Text style={[styles.tableHeaderText, styles.colUnitPrice]}>
                Unit Price
              </Text>
              <Text style={[styles.tableHeaderText, styles.colTotal]}>
                Total
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
                  {formatCurrency(item.unit_price)}
                </Text>
                <Text style={[styles.tableCellText, styles.colTotal]}>
                  {formatCurrency(item.total)}
                </Text>
              </View>
            ))}

            {/* Section Subtotal */}
            <View style={styles.sectionSubtotal}>
              <Text style={styles.sectionSubtotalLabel}>
                Section Subtotal
              </Text>
              <Text style={styles.sectionSubtotalValue}>
                {formatCurrency(section.subtotal)}
              </Text>
            </View>
          </View>
        ))}

        {/* Totals */}
        <View style={styles.totalsContainer}>
          <View style={styles.totalsBlock}>
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>Subtotal</Text>
              <Text style={styles.totalsValue}>
                {formatCurrency(estimate.subtotal)}
              </Text>
            </View>

            {estimate.discount_amount > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>
                  Discount
                  {estimate.discount_type === 'percentage'
                    ? ` (${estimate.discount_value}%)`
                    : ''}
                </Text>
                <Text style={[styles.totalsValue, { color: '#dc2626' }]}>
                  -{formatCurrency(estimate.discount_amount)}
                </Text>
              </View>
            )}

            {estimate.tax_amount > 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>
                  Tax ({(estimate.tax_rate * 100).toFixed(2)}%)
                </Text>
                <Text style={styles.totalsValue}>
                  {formatCurrency(estimate.tax_amount)}
                </Text>
              </View>
            )}

            <View style={styles.grandTotalRow}>
              <Text
                style={[styles.grandTotalLabel, { color: brandColor }]}
              >
                Total
              </Text>
              <Text
                style={[styles.grandTotalValue, { color: brandColor }]}
              >
                {formatCurrency(estimate.total)}
              </Text>
            </View>
          </View>
        </View>

        {/* Terms */}
        {(estimate.payment_terms ||
          estimate.warranty_terms ||
          estimate.timeline ||
          estimate.notes) && (
          <View style={styles.termsSection}>
            {estimate.payment_terms && (
              <>
                <Text style={styles.termsTitle}>Payment Terms</Text>
                <Text style={styles.termsText}>
                  {estimate.payment_terms}
                </Text>
              </>
            )}
            {estimate.timeline && (
              <>
                <Text style={styles.termsTitle}>Timeline</Text>
                <Text style={styles.termsText}>{estimate.timeline}</Text>
              </>
            )}
            {estimate.warranty_terms && (
              <>
                <Text style={styles.termsTitle}>Warranty</Text>
                <Text style={styles.termsText}>
                  {estimate.warranty_terms}
                </Text>
              </>
            )}
            {estimate.notes && (
              <>
                <Text style={styles.termsTitle}>Notes</Text>
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
            `Page ${pageNumber} of ${totalPages}`
          }
        />
      </Page>
    </Document>
  )
}
