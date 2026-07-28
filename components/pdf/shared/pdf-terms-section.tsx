// components/pdf/shared/pdf-terms-section.tsx
//
// Phase 183 Plan 04 (ENGINE-03) — shared Estimate Terms / Payment Terms /
// Timeline / Warranty / Notes block for both PDF templates. Byte-identical
// structure (outer visibility gate + 5-block conditional); only StyleSheet
// VALUES differ, expressed here as props. Both templates pass `brandText` —
// it colors ONLY the "Estimate Terms" title, on both templates identically
// (not a Classic-only divergence).
//
// NOTE on invocation style: see pdf-header.tsx's top comment — both templates
// call this as a PLAIN FUNCTION (`{PdfTermsSection({...})}`), not JSX.

import { Fragment } from 'react'
import { View, Text } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import {
  isSectionVisible,
  type ResolvedPresentationSettings,
} from '@/lib/estimate/presentation-settings'
import type { DocumentLabels } from '@/lib/estimate/document/labels'

export interface PdfTermsSectionCompany {
  estimate_terms_enabled?: boolean
  estimate_terms_text?: string | null
}

export interface PdfTermsSectionEstimate {
  payment_terms: string | null
  warranty_terms: string | null
  timeline: string | null
  notes: string | null
}

export interface PdfTermsSectionStyles {
  termsSection: Style
  termsTitle: Style
  termsText: Style
}

export interface PdfTermsSectionProps {
  company: PdfTermsSectionCompany
  estimate: PdfTermsSectionEstimate
  resolvedSettings: ResolvedPresentationSettings
  L: DocumentLabels
  brandText: string
  styles: PdfTermsSectionStyles
}

export function PdfTermsSection({
  company,
  estimate,
  resolvedSettings,
  L,
  brandText,
  styles,
}: PdfTermsSectionProps) {
  const visible =
    (company.estimate_terms_enabled && company.estimate_terms_text) ||
    (isSectionVisible(resolvedSettings, 'payment_terms') && estimate.payment_terms) ||
    (isSectionVisible(resolvedSettings, 'warranty_terms') && estimate.warranty_terms) ||
    (isSectionVisible(resolvedSettings, 'timeline') && estimate.timeline) ||
    (isSectionVisible(resolvedSettings, 'notes') && estimate.notes)

  if (!visible) return null

  return (
    <View style={styles.termsSection}>
      {company.estimate_terms_enabled && company.estimate_terms_text && (
        <Fragment>
          <Text style={[styles.termsTitle, { color: brandText }]}>
            Estimate Terms
          </Text>
          <Text style={styles.termsText}>{company.estimate_terms_text}</Text>
        </Fragment>
      )}
      {isSectionVisible(resolvedSettings, 'payment_terms') && estimate.payment_terms && (
        <Fragment>
          <Text style={styles.termsTitle}>{L.paymentTerms}</Text>
          <Text style={styles.termsText}>{estimate.payment_terms}</Text>
        </Fragment>
      )}
      {isSectionVisible(resolvedSettings, 'timeline') && estimate.timeline && (
        <Fragment>
          <Text style={styles.termsTitle}>{L.timeline}</Text>
          <Text style={styles.termsText}>{estimate.timeline}</Text>
        </Fragment>
      )}
      {isSectionVisible(resolvedSettings, 'warranty_terms') && estimate.warranty_terms && (
        <Fragment>
          <Text style={styles.termsTitle}>{L.warranty}</Text>
          <Text style={styles.termsText}>{estimate.warranty_terms}</Text>
        </Fragment>
      )}
      {isSectionVisible(resolvedSettings, 'notes') && estimate.notes && (
        <Fragment>
          <Text style={styles.termsTitle}>{L.notes}</Text>
          <Text style={styles.termsText}>{estimate.notes}</Text>
        </Fragment>
      )}
    </View>
  )
}
