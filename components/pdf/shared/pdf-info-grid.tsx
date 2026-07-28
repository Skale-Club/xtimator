// components/pdf/shared/pdf-info-grid.tsx
//
// Phase 183 Plan 04 (ENGINE-03) — shared Project / Bill To info grid for both
// PDF templates. Structure is byte-identical between Classic/Modern; only
// StyleSheet VALUES and the client-name bold font-family token differ,
// expressed here as props.
//
// NOTE on invocation style: see pdf-header.tsx's top comment — both templates
// call this as a PLAIN FUNCTION (`{PdfInfoGrid({...})}`), not JSX, so the
// direct-call tests (estimate-pdf-baseline-order.test.tsx etc.) see a fully
// resolved tree without needing to invoke nested custom components.

import { View, Text, Link } from '@react-pdf/renderer'
import { formatAddress } from '@/lib/estimate/document/format'
import { formatPhoneForDisplay } from '@/lib/phone/format'
import type { DocumentLabels } from '@/lib/estimate/document/labels'

export interface PdfInfoGridClient {
  name: string
  email: string | null
  phone: string | null
  address: string | null
  city: string | null
  state: string | null
  zip: string | null
}

export interface PdfInfoGridEstimate {
  estimate_date: string | null
  created_at: string
  estimate_number: string | null
  estimate_seq: number
}

export interface PdfInfoGridStyles {
  infoRow: object
  infoBlock: object
  infoLabel: object
  infoValue: object
  infoValueLink: object
}

export interface PdfInfoGridProps {
  L: DocumentLabels
  projectName: string
  projectType: string | null
  estimate: PdfInfoGridEstimate
  client: PdfInfoGridClient | null
  fmtDate: (s: string) => string
  styles: PdfInfoGridStyles
  /** ESTIMATE_DESIGN_TOKENS.<template>.fontFamilyBold — overrides the client-name Text's font family. */
  clientNameFontFamily: string
}

export function PdfInfoGrid({
  L,
  projectName,
  projectType,
  estimate,
  client,
  fmtDate,
  styles,
  clientNameFontFamily,
}: PdfInfoGridProps) {
  const clientAddress = client ? formatAddress(client) : null

  return (
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
          {L.estimateNum}
          {estimate.estimate_number ?? String(estimate.estimate_seq).padStart(4, '0')}
        </Text>
      </View>

      {client && (
        <View style={styles.infoBlock}>
          <Text style={styles.infoLabel}>{L.billTo}</Text>
          <Text
            style={[styles.infoValue, { fontFamily: clientNameFontFamily }]}
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
  )
}
