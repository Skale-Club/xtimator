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
   * omission. background-color ONLY — geometry (padding/radius/margin) comes
   * from `box` below, which drives blocks-from-model.ts's termsCardBaseHeightPt. */
  cardFill?: string
  /** Classic-only inner card box (tokens.ts CLASSIC_CARD_BOX): `padding` on all
   * four sides, a corner `borderRadius`, and a `marginBottom` separating this
   * card from the next so consecutive cards read as separate cards. Because the
   * padding already supplies the bottom inset, the card's text drops
   * styles.termsText.marginBottom (12) — otherwise the bottom inset would be
   * 22pt against 10pt on the other sides. Modern omits this prop (fill-free,
   * box-less), keeping its original geometry. Independent of `cardFill`: a
   * malformed brand colour omits the tint but must not change the geometry
   * blocks-from-model.ts measured. These values feed that file's
   * termsCardBaseHeightPt / terms text width — keep them in step. */
  box?: { paddingPt: number; radiusPt: number; marginBottomPt: number }
  styles: Pick<PdfTermsSectionStyles, 'termsTitle' | 'termsText'>
}

/** One atomic terms card — never splits across a page boundary. Exported for
 * direct per-card rendering by Plan 184-05's dispatcher; PdfTermsSection
 * composes it internally below for single-page reproduction. */
export function PdfTermsCard({ title, text, titleColor, topMarginPt, cardFill, box, styles }: PdfTermsCardProps) {
  return (
    <View
      key={title}
      wrap={false}
      style={{
        ...(topMarginPt ? { marginTop: topMarginPt } : {}),
        ...(cardFill ? { backgroundColor: cardFill } : {}),
        ...(box ? { padding: box.paddingPt, borderRadius: box.radiusPt, marginBottom: box.marginBottomPt } : {}),
      }}
    >
      <Text style={titleColor ? [styles.termsTitle, { color: titleColor }] : styles.termsTitle}>
        {title}
      </Text>
      <Text style={box ? [styles.termsText, { marginBottom: 0 }] : styles.termsText}>{text}</Text>
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
