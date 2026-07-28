// components/pdf/shared/pdf-title-banner.tsx
//
// Phase 183 Plan 04 (ENGINE-03, Correction 1) — the ESTIMATE title. Classic
// gains a solid brand-fill banner here (the ONE verified PDFPAR-01 gap,
// matching Classic webview's benchmark — components/workspace/estimate/
// estimate-document.tsx:1476-1486). Modern's hairline/accent-only title is
// reproduced UNCHANGED — no fill, ever (Pitfall 1 guard).
//
// NOTE on invocation style: see pdf-header.tsx's top comment — both templates
// call this as a PLAIN FUNCTION (`{PdfTitleBanner({...})}`), not JSX.

import { Fragment } from 'react'
import { View, Text } from '@react-pdf/renderer'

export interface PdfTitleBannerStyles {
  estimateTitle: object
  /** Modern-only — the thin rule under the title. Omit for Classic. */
  estimateTitleRule?: object
}

export interface PdfTitleBannerProps {
  label: string
  /** Drives the solid-fill-vs-hairline branch. Pass ESTIMATE_DESIGN_TOKENS.<template>.solidHeaderFill — never hardcode. */
  solidFill: boolean
  brandColor: string
  brandText: string
  brandOnFill: string
  styles: PdfTitleBannerStyles
}

export function PdfTitleBanner({
  label,
  solidFill,
  brandColor,
  brandText,
  brandOnFill,
  styles,
}: PdfTitleBannerProps) {
  if (solidFill) {
    // Classic — NEW: a solid brand-color banner wrapping the title, matching
    // Classic webview's benchmark treatment (py-6 px-6 sm:px-10 text-center
    // block with backgroundColor: brandColor, heading colored brandOnFill).
    return (
      <View
        style={{
          backgroundColor: brandColor,
          paddingVertical: 16,
          paddingHorizontal: 24,
          marginBottom: 20,
        }}
      >
        <Text style={[styles.estimateTitle, { color: brandOnFill, marginBottom: 0 }]}>
          {label}
        </Text>
      </View>
    )
  }

  // Modern — UNCHANGED: accent-colored text with a thin rule underneath, no fill.
  return (
    <Fragment>
      <Text style={[styles.estimateTitle, { color: brandText }]}>{label}</Text>
      {styles.estimateTitleRule && (
        <View style={[styles.estimateTitleRule, { borderBottomColor: brandColor }]} />
      )}
    </Fragment>
  )
}
