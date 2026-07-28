// components/pdf/shared/pdf-terms-section.tsx
//
// Phase 183 Plan 04 (ENGINE-03) — shared Estimate Terms / Payment Terms /
// Timeline / Warranty / Notes block for both PDF templates. Byte-identical
// structure (outer visibility gate + 5-block conditional); only StyleSheet
// VALUES differ, expressed here as props. Both templates pass `brandText` —
// it colors ONLY the "Estimate Terms" title, on both templates identically
// (not a Classic-only divergence).
//
// Phase 184 Plan 04 (PGBRK-02) — each terms card (Estimate Terms/Payment/
// Timeline/Warranty/Notes) is now individually `wrap={false}` atomic via the
// new exported `PdfTermsCard`, so a card never splits across a page boundary
// but the outer `termsSection` container itself is NOT atomic (a later card
// CAN start on a new page — Plan 184-05 wires the real per-page placement).
// The outer container no longer carries its own `marginTop` — that spacing
// moves onto whichever card is emitted FIRST (`topMarginPt`, tracked via a
// local "already emitted one" flag while composing, in the fixed emission
// order: estimate -> payment -> timeline -> warranty -> notes).
//
// NOTE on invocation style: see pdf-header.tsx's top comment — both templates
// call this as a PLAIN FUNCTION (`{PdfTermsSection({...})}`), not JSX.

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

export interface PdfTermsCardProps {
  title: string
  text: string
  /** Only "Estimate Terms" passes this (brandText) — every other card uses styles.termsTitle unmodified. */
  titleColor?: string
  /** Extra marginTop on this card's own wrap={false} View — used ONLY for the first-emitted card (Plan 184-03's height-bonus rule). */
  topMarginPt?: number
  /** Phase 186 Plan 02 (POLISH-01) — optional subtle brand-tint background,
   * sourced from lib/estimate/document/tokens.ts's cardTintFill(). Classic
   * only; Modern's call sites never pass this, keeping Modern fill-free by
   * omission. background-color ONLY — never touches padding/margin/border-
   * width/font-size (those drive lib/estimate/pagination/blocks-from-model.ts's
   * termsCardBaseHeightPt formula; this prop must stay geometry-inert). */
  cardFill?: string
  styles: Pick<PdfTermsSectionStyles, 'termsTitle' | 'termsText'>
}

/** One atomic terms card — never splits across a page boundary. Exported for
 * direct per-card rendering by Plan 184-05's dispatcher; PdfTermsSection
 * composes it internally below for single-page reproduction. */
export function PdfTermsCard({ title, text, titleColor, topMarginPt, cardFill, styles }: PdfTermsCardProps) {
  return (
    <View
      key={title}
      wrap={false}
      style={{
        ...(topMarginPt ? { marginTop: topMarginPt } : {}),
        ...(cardFill ? { backgroundColor: cardFill } : {}),
      }}
    >
      <Text style={titleColor ? [styles.termsTitle, { color: titleColor }] : styles.termsTitle}>
        {title}
      </Text>
      <Text style={styles.termsText}>{text}</Text>
    </View>
  )
}

export interface PdfTermsSectionProps {
  company: PdfTermsSectionCompany
  estimate: PdfTermsSectionEstimate
  resolvedSettings: ResolvedPresentationSettings
  L: DocumentLabels
  brandText: string
  /** Applied ONLY to whichever card ends up being emitted first — 24 Classic / 32 Modern (replaces the removed termsSection.marginTop). */
  topMarginPt: number
  styles: PdfTermsSectionStyles
}

export function PdfTermsSection({
  company,
  estimate,
  resolvedSettings,
  L,
  brandText,
  topMarginPt,
  styles,
}: PdfTermsSectionProps) {
  const visible =
    (company.estimate_terms_enabled && company.estimate_terms_text) ||
    (isSectionVisible(resolvedSettings, 'payment_terms') && estimate.payment_terms) ||
    (isSectionVisible(resolvedSettings, 'warranty_terms') && estimate.warranty_terms) ||
    (isSectionVisible(resolvedSettings, 'timeline') && estimate.timeline) ||
    (isSectionVisible(resolvedSettings, 'notes') && estimate.notes)

  if (!visible) return null

  const cardStyles = { termsTitle: styles.termsTitle, termsText: styles.termsText }

  // Tracks whether a card has already been emitted, so topMarginPt lands on
  // the FIRST one actually rendered (not necessarily "Estimate Terms" —
  // depends on which of the 5 conditions is true first).
  let firstCardEmitted = false
  const nextTopMargin = (): number | undefined => {
    if (firstCardEmitted) return undefined
    firstCardEmitted = true
    return topMarginPt
  }

  return (
    <View style={styles.termsSection}>
      {company.estimate_terms_enabled &&
        company.estimate_terms_text &&
        PdfTermsCard({
          title: 'Estimate Terms',
          text: company.estimate_terms_text,
          titleColor: brandText,
          topMarginPt: nextTopMargin(),
          styles: cardStyles,
        })}
      {isSectionVisible(resolvedSettings, 'payment_terms') &&
        estimate.payment_terms &&
        PdfTermsCard({
          title: L.paymentTerms,
          text: estimate.payment_terms,
          topMarginPt: nextTopMargin(),
          styles: cardStyles,
        })}
      {isSectionVisible(resolvedSettings, 'timeline') &&
        estimate.timeline &&
        PdfTermsCard({
          title: L.timeline,
          text: estimate.timeline,
          topMarginPt: nextTopMargin(),
          styles: cardStyles,
        })}
      {isSectionVisible(resolvedSettings, 'warranty_terms') &&
        estimate.warranty_terms &&
        PdfTermsCard({
          title: L.warranty,
          text: estimate.warranty_terms,
          topMarginPt: nextTopMargin(),
          styles: cardStyles,
        })}
      {isSectionVisible(resolvedSettings, 'notes') &&
        estimate.notes &&
        PdfTermsCard({
          title: L.notes,
          text: estimate.notes,
          topMarginPt: nextTopMargin(),
          styles: cardStyles,
        })}
    </View>
  )
}
