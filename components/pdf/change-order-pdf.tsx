// components/pdf/change-order-pdf.tsx
//
// Change order document (Classic look, kept simple): company header + logo,
// brand band "CHANGE ORDER #n", reference line, reason, lines table (credits as
// negative red amounts), totals block, signature block when signed, footer
// "{company} · Change order {SK-1045-CO1} · Page N of M".
//
// A plain function component over PublicChangeOrderData, like EstimatePDF: the
// route resolves the logo to a drawable data URI first (resolvePdfLogo) and
// hands the document in. There is no pagination engine here: a change order is
// a handful of lines, so react-pdf's own `wrap` flow is enough; the table rows
// and the signature block are `wrap={false}` so none is ever split.
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer'
import '@/lib/pdf/register-fonts'
import { SYSTEM_COLORS } from '@/lib/system-colors'
import { ensureReadableOnWhite, readableTextColor } from '@/lib/color/contrast'
import { formatMoney } from '@/lib/money/currency'
import { formatDate } from '@/lib/estimate/document/format'
import { formatPhoneForDisplay } from '@/lib/phone/format'
import { willPdfRenderLogo } from '@/lib/pdf/pdf-image-support'
import { ESTIMATE_DESIGN_TOKENS } from '@/lib/estimate/document/tokens'
import { isSupportedLanguage, type EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import { formatChangeOrderNumber, formatTaxRatePercent, type PublicChangeOrderData } from '@/lib/change-orders/types'

interface PdfCopy {
  title: string
  estimate: string
  project: string
  client: string
  acceptedOn: string
  reason: string
  description: string
  qty: string
  unitPrice: string
  total: string
  currentContract: string
  thisChangeOrder: string
  tax: string
  newTotal: string
  extraTime: string
  day: string
  days: string
  signedBy: string
  page: string
  of: string
  changeOrder: string
}

const COPY: Record<EstimateLanguage, PdfCopy> = {
  en: {
    title: 'CHANGE ORDER', estimate: 'Estimate', project: 'Project', client: 'Client', acceptedOn: 'Estimate accepted on',
    reason: 'Reason for the change', description: 'Description', qty: 'Qty', unitPrice: 'Unit price', total: 'Total',
    currentContract: 'Current contract', thisChangeOrder: 'This change order', tax: 'Tax', newTotal: 'New total',
    extraTime: 'Extra time', day: 'day', days: 'days', signedBy: 'Approved and signed by', page: 'Page', of: 'of',
    changeOrder: 'Change order',
  },
  pt: {
    title: 'ADITIVO', estimate: 'Orçamento', project: 'Projeto', client: 'Cliente', acceptedOn: 'Orçamento aceito em',
    reason: 'Motivo da alteração', description: 'Descrição', qty: 'Qtd', unitPrice: 'Preço unit.', total: 'Total',
    currentContract: 'Contrato atual', thisChangeOrder: 'Este aditivo', tax: 'Imposto', newTotal: 'Novo total',
    extraTime: 'Prazo extra', day: 'dia', days: 'dias', signedBy: 'Aprovado e assinado por', page: 'Página', of: 'de',
    changeOrder: 'Aditivo',
  },
  es: {
    title: 'ORDEN DE CAMBIO', estimate: 'Presupuesto', project: 'Proyecto', client: 'Cliente', acceptedOn: 'Presupuesto aceptado el',
    reason: 'Motivo del cambio', description: 'Descripción', qty: 'Cant.', unitPrice: 'Precio unit.', total: 'Total',
    currentContract: 'Contrato actual', thisChangeOrder: 'Esta orden de cambio', tax: 'Impuesto', newTotal: 'Nuevo total',
    extraTime: 'Plazo adicional', day: 'día', days: 'días', signedBy: 'Aprobado y firmado por', page: 'Página', of: 'de',
    changeOrder: 'Orden de cambio',
  },
}

const FONT = ESTIMATE_DESIGN_TOKENS.classic.fontFamily
const FONT_BOLD = ESTIMATE_DESIGN_TOKENS.classic.fontFamilyBold
const FONT_TITLE = ESTIMATE_DESIGN_TOKENS.classic.fontFamilyTitle
const CREDIT_RED = '#b91c1c'

const styles = StyleSheet.create({
  page: { fontFamily: FONT, fontSize: 10, paddingTop: 40, paddingBottom: 60, paddingHorizontal: 40, color: '#1f2937' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', marginBottom: 20, paddingBottom: 14,
    borderBottomWidth: 2, borderBottomColor: '#e5e7eb',
  },
  companyName: { fontSize: 18, fontFamily: FONT_BOLD, marginBottom: 4 },
  contact: { fontSize: 9, color: '#6b7280', lineHeight: 1.5 },
  logo: { width: 72, height: 72, objectFit: 'contain' },
  band: { paddingVertical: 14, paddingHorizontal: 24, marginBottom: 16 },
  bandText: { fontSize: 22, fontFamily: FONT_TITLE, textAlign: 'center' },
  refRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  refBlock: { width: '48%' },
  label: { fontSize: 8, fontFamily: FONT_BOLD, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 },
  value: { fontSize: 10, lineHeight: 1.5 },
  reasonText: { fontSize: 10, lineHeight: 1.5, color: '#4b5563', marginBottom: 16 },
  tableHeader: { flexDirection: 'row', backgroundColor: '#f3f4f6', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tableRow: { flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  colDescription: { width: '44%' },
  colQty: { width: '14%', textAlign: 'center' },
  colUnitPrice: { width: '20%', textAlign: 'right' },
  colTotal: { width: '22%', textAlign: 'right' },
  th: { fontSize: 9, fontFamily: FONT_BOLD, color: '#6b7280' },
  td: { fontSize: 9, lineHeight: 1.4 },
  totals: { marginTop: 16, alignItems: 'flex-end' },
  totalsBlock: { width: '55%' },
  totalsRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#e5e7eb' },
  totalsLabel: { fontSize: 10, color: '#6b7280' },
  totalsValue: { fontSize: 10, textAlign: 'right' },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderTopWidth: 2, borderTopColor: '#1f2937', marginTop: 4 },
  grandText: { fontSize: 13, fontFamily: FONT_BOLD },
  signature: { marginTop: 22 },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, fontSize: 8, color: '#9ca3af', flexDirection: 'row', justifyContent: 'center' },
})

export interface ChangeOrderPdfProps {
  data: PublicChangeOrderData
  /** Defaults to the estimate's language. */
  language?: string | null
}

export default function ChangeOrderPDF({ data, language }: ChangeOrderPdfProps) {
  const { changeOrder, company, estimate, contract } = data
  const lang: EstimateLanguage = isSupportedLanguage(language ?? estimate.language)
    ? ((language ?? estimate.language) as EstimateLanguage)
    : 'en'
  const L = COPY[lang]
  const currency = changeOrder.currency_code || 'USD'
  const money = (v: number) => formatMoney(v, currency)
  const amountStyle = (v: number) => (v < 0 ? { color: CREDIT_RED } : {})

  const brandColor = company.brand_primary_color ?? SYSTEM_COLORS.primary
  const brandText = ensureReadableOnWhite(brandColor)
  const brandOnFill = readableTextColor(brandColor, { largeText: true })

  const number = formatChangeOrderNumber(estimate.estimateNumber, changeOrder.number)
  const countedInSummary = contract.changeOrders.some((r) => r.id === changeOrder.id && r.status === 'accepted')
  const liveBefore = Math.round((countedInSummary ? contract.contractTotal - changeOrder.total : contract.contractTotal) * 100) / 100
  const hasSignature = Boolean(changeOrder.hasSignature || changeOrder.signature)
  const documentContract = hasSignature ? changeOrder.signedContract : data.signingContract
  // Legacy signatures have no historical totals to display.
  const currentContract = documentContract?.before ?? (hasSignature ? null : liveBefore)
  const newTotal = documentContract?.after ?? (hasSignature ? null : Math.round((liveBefore + changeOrder.total) * 100) / 100)
  const extraDays = changeOrder.extra_days && changeOrder.extra_days > 0 ? changeOrder.extra_days : null
  const contactParts = [
    company.phone ? formatPhoneForDisplay(company.phone) : null,
    company.email,
  ].filter(Boolean) as string[]
  const signature = changeOrder.signature

  return (
    <Document title={`${L.changeOrder} ${number}`}>
      <Page size="LETTER" style={styles.page} wrap>
        <View style={[styles.header, { borderBottomColor: '#e5e7eb' }]}>
          <View>
            <Text style={styles.companyName}>{company.name}</Text>
            {contactParts.length > 0 && <Text style={styles.contact}>{contactParts.join('  |  ')}</Text>}
          </View>
          {willPdfRenderLogo(company.logo_url) && (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={company.logo_url as string} style={styles.logo} />
          )}
        </View>

        <View style={[styles.band, { backgroundColor: brandColor }]}>
          <Text style={[styles.bandText, { color: brandOnFill }]}>{`${L.title} #${changeOrder.number}`}</Text>
        </View>

        <View style={styles.refRow}>
          <View style={styles.refBlock}>
            <Text style={styles.label}>{L.changeOrder}</Text>
            <Text style={[styles.value, { fontFamily: FONT_BOLD }]}>{number}</Text>
            {changeOrder.title ? <Text style={styles.value}>{changeOrder.title}</Text> : null}
            <Text style={styles.value}>{`${L.estimate} ${estimate.estimateNumber}`}</Text>
            {estimate.acceptedAt ? (
              <Text style={[styles.value, { color: '#6b7280' }]}>
                {`${L.acceptedOn} ${formatDate(estimate.acceptedAt, lang)}`}
              </Text>
            ) : null}
          </View>
          <View style={styles.refBlock}>
            <Text style={styles.label}>{L.project}</Text>
            <Text style={styles.value}>{estimate.projectName}</Text>
            {estimate.clientName ? (
              <>
                <Text style={[styles.label, { marginTop: 8 }]}>{L.client}</Text>
                <Text style={styles.value}>{estimate.clientName}</Text>
              </>
            ) : null}
          </View>
        </View>

        {changeOrder.reason ? (
          <View>
            <Text style={styles.label}>{L.reason}</Text>
            <Text style={styles.reasonText}>{changeOrder.reason}</Text>
          </View>
        ) : null}

        <View style={styles.tableHeader}>
          <View style={styles.colDescription}><Text style={styles.th}>{L.description}</Text></View>
          <View style={styles.colQty}><Text style={styles.th}>{L.qty}</Text></View>
          <View style={styles.colUnitPrice}><Text style={styles.th}>{L.unitPrice}</Text></View>
          <View style={styles.colTotal}><Text style={styles.th}>{L.total}</Text></View>
        </View>
        {changeOrder.items.map((item) => (
          <View key={item.id} style={styles.tableRow} wrap={false}>
            <View style={styles.colDescription}><Text style={styles.td}>{item.description}</Text></View>
            <View style={styles.colQty}>
              <Text style={styles.td}>{`${item.quantity}${item.unit ? ` ${item.unit}` : ''}`}</Text>
            </View>
            <View style={styles.colUnitPrice}>
              <Text style={[styles.td, amountStyle(item.unit_price)]}>{money(item.unit_price)}</Text>
            </View>
            <View style={styles.colTotal}>
              <Text style={[styles.td, amountStyle(item.total)]}>{money(item.total)}</Text>
            </View>
          </View>
        ))}

        <View style={styles.totals} wrap={false}>
          <View style={styles.totalsBlock}>
            {currentContract !== null && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>{L.currentContract}</Text>
                <Text style={styles.totalsValue}>{money(currentContract)}</Text>
              </View>
            )}
            <View style={styles.totalsRow}>
              <Text style={styles.totalsLabel}>{L.thisChangeOrder}</Text>
              <Text style={[styles.totalsValue, amountStyle(changeOrder.subtotal)]}>{money(changeOrder.subtotal)}</Text>
            </View>
            {changeOrder.tax_amount !== 0 && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>{`${L.tax} (${formatTaxRatePercent(changeOrder.tax_rate)})`}</Text>
                <Text style={[styles.totalsValue, amountStyle(changeOrder.tax_amount)]}>{money(changeOrder.tax_amount)}</Text>
              </View>
            )}
            {extraDays !== null && (
              <View style={styles.totalsRow}>
                <Text style={styles.totalsLabel}>{L.extraTime}</Text>
                <Text style={styles.totalsValue}>{`+${extraDays} ${extraDays === 1 ? L.day : L.days}`}</Text>
              </View>
            )}
            {newTotal !== null && (
              <View style={styles.grandRow}>
                <Text style={styles.grandText}>{L.newTotal}</Text>
                <Text style={[styles.grandText, { color: brandText }]}>{money(newTotal)}</Text>
              </View>
            )}
          </View>
        </View>

        {signature ? (
          <View style={styles.signature} wrap={false}>
            <Text style={styles.label}>{L.signedBy}</Text>
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            <Image src={signature.signature_data} style={{ width: 150, height: 40, objectFit: 'contain' }} />
            <Text style={{ fontSize: 9, marginTop: 4 }}>{signature.signer_name}</Text>
            <Text style={{ fontSize: 9, color: '#6b7280' }}>{formatDate(signature.signed_at, lang)}</Text>
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          <Text style={{ maxWidth: '50%', maxLines: 1, textOverflow: 'ellipsis' }}>{company.name}</Text>
          <Text
            style={{ flexShrink: 0 }}
            render={({ pageNumber, totalPages }) =>
              ` · ${L.changeOrder} ${number} · ${L.page} ${pageNumber} ${L.of} ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  )
}
