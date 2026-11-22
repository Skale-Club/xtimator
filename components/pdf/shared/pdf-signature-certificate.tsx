// components/pdf/shared/pdf-signature-certificate.tsx
//
// The LAST page of a signed estimate's PDF: a "Signature certificate" that records
// how and when the estimate was signed online (signer, email, time, IP, device,
// amount, signature image, integrity verdict, SHA-256 fingerprint, consent text).
//
// It lives OUTSIDE the pagination engine: the engine plans the estimate's own
// pages, this page is appended after them by each template and is a single
// `wrap={false}` view, so it can never spill onto a second page of its own.
// The shared footer prints "Page N of M" with react-pdf's render prop, so the
// extra page is counted in M automatically.
//
// Rendered only when `evidence` is non-null (signed after evidence existed).
//
// NOTE on invocation style: see pdf-header.tsx's top comment — both templates
// call this as a PLAIN FUNCTION (`{PdfSignatureCertificate({...})}`), not JSX.

import type { ReactNode } from 'react'
import { Page, View, Text, Image } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import type { SignatureEvidence } from '@/lib/estimate/signature-evidence'
import type { DocumentLabels } from '@/lib/estimate/document/labels'
import type { EstimateLanguage } from '@/lib/i18n/resolve-estimate-language'
import { formatMoney } from '@/lib/money/currency'
import { PdfCompactHeader, type PdfCompactHeaderProps } from './pdf-compact-header'
import { PdfFooter, type PdfFooterProps } from './pdf-footer'

export interface PdfSignatureCertificateProps {
  evidence: SignatureEvidence
  L: DocumentLabels
  language: EstimateLanguage
  /** The template's own `styles.page` (padding, base font, colour). */
  pageStyle: Style
  /** The compact header both templates draw on pages 2+ (same props as their own call). */
  header: PdfCompactHeaderProps
  /** The template's footer (same props as their own call). */
  footer: PdfFooterProps
  /** The template's own palette and fonts. */
  theme: {
    ink: string
    body: string
    label: string
    secondary: string
    rule: string
    fontFamily: string
    fontFamilyBold: string
    fontFamilyTitle: string
    /** Classic only: subtle brand-tint card behind the list. Modern omits it (fill-free). */
    cardFill?: string
  }
}

const LOCALES: Record<EstimateLanguage, string> = { en: 'en-US', pt: 'pt-BR', es: 'es-US' }

/** "Nov 21, 2026, 3:25 PM (UTC)". Always UTC: the server has no viewer time zone to honour. */
export function formatCertificateDateTime(iso: string, language: EstimateLanguage): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const text = new Intl.DateTimeFormat(LOCALES[language] ?? 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  }).format(d)
  return `${text} (UTC)`
}

export function PdfSignatureCertificate({
  evidence,
  L,
  language,
  pageStyle,
  header,
  footer,
  theme,
}: PdfSignatureCertificateProps) {
  const integrityText =
    evidence.integrity === 'verified'
      ? L.certIntegrityVerified
      : evidence.integrity === 'mismatch'
        ? L.certIntegrityMismatch
        : L.certIntegrityUnavailable

  const labelStyle: Style = {
    width: 120,
    flexShrink: 0,
    fontSize: 8,
    fontFamily: theme.fontFamilyBold,
    color: theme.label,
    textTransform: 'uppercase',
    letterSpacing: 1,
    paddingTop: 1,
  }
  const valueStyle: Style = { flexGrow: 1, flexShrink: 1, fontSize: 10, color: theme.ink, lineHeight: 1.4 }
  const rowStyle: Style = {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: theme.rule,
  }

  const row = (key: string, label: string, value: ReactNode) => (
    <View key={key} style={rowStyle} wrap={false}>
      <Text style={labelStyle}>{label}</Text>
      {/* flexBasis 0 + minWidth 0: the value column takes exactly the room left by the
          label, so a long unbroken user agent wraps instead of widening the row. */}
      <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 }}>{value}</View>
    </View>
  )

  const textValue = (text: string, muted = false) => (
    <Text style={[valueStyle, muted ? { color: theme.secondary } : {}]}>{text}</Text>
  )

  return (
    <Page key="signature-certificate" size="LETTER" style={pageStyle}>
      {PdfCompactHeader(header)}

      <View wrap={false}>
        <Text
          style={{
            fontSize: 20,
            fontFamily: theme.fontFamilyTitle,
            color: theme.ink,
            marginTop: 8,
            marginBottom: 6,
          }}
        >
          {L.certTitle}
        </Text>
        <Text style={{ fontSize: 9, lineHeight: 1.5, color: theme.secondary, marginBottom: 16 }}>{L.certIntro}</Text>

        <View
          style={{
            borderTopWidth: 0.75,
            borderTopColor: theme.rule,
            ...(theme.cardFill ? { backgroundColor: theme.cardFill, paddingHorizontal: 12, borderRadius: 4 } : {}),
          }}
        >
          {row('signer', L.signedBy, textValue(evidence.signerName))}
          {row('email', L.certEmail, textValue(evidence.signerEmail ?? L.certNotProvided, !evidence.signerEmail))}
          {row('signedOn', L.certSignedOn, textValue(formatCertificateDateTime(evidence.signedAt, language)))}
          {row('ip', L.certIpAddress, textValue(evidence.ipAddress ?? L.certNotRecorded, !evidence.ipAddress))}
          {row(
            'device',
            L.certDevice,
            <>
              <Text style={[valueStyle, evidence.device ? {} : { color: theme.secondary }]}>
                {evidence.device ?? L.certNotRecorded}
              </Text>
              {evidence.userAgent ? (
                <Text style={{ fontSize: 7, lineHeight: 1.4, color: theme.label, marginTop: 2 }}>{evidence.userAgent}</Text>
              ) : null}
            </>
          )}
          {evidence.signedTotal != null
            ? row(
                'amount',
                L.certAmountSigned,
                <Text style={[valueStyle, { fontFamily: theme.fontFamilyBold }]}>
                  {formatMoney(evidence.signedTotal, evidence.currencyCode)}
                </Text>
              )
            : null}
          {row(
            'signature',
            L.certSignature,
            // eslint-disable-next-line jsx-a11y/alt-text
            // Left-anchored so a signature whose image is not 3.75:1 (older captures)
            // still starts at the value column like every other value.
            <Image
              src={evidence.signatureDataUrl}
              style={{ width: 150, height: 40, objectFit: 'contain', objectPositionX: 0, objectPositionY: 0 }}
            />
          )}
          {row('integrity', L.certIntegrity, textValue(integrityText))}
          {evidence.sha256
            ? row(
                'sha',
                L.certFingerprint,
                <>
                  <Text style={{ fontFamily: 'Courier', fontSize: 8, lineHeight: 1.4, color: theme.ink }}>{evidence.sha256}</Text>
                  <Text style={{ fontSize: 7, lineHeight: 1.4, color: theme.label, marginTop: 2 }}>{L.certFingerprintNote}</Text>
                </>
              )
            : null}
          {evidence.consentStatement ? row('consent', L.certConsent, textValue(evidence.consentStatement)) : null}
        </View>
      </View>

      {PdfFooter(footer)}
    </Page>
  )
}
