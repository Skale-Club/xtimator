// components/pdf/shared/pdf-compact-header.tsx
//
// The header drawn on pages 2..N of an estimate PDF (page 1 keeps the full
// PdfHeader: logo, contacts, address, language chip). One single line —
// company name on the left, "Estimate #<number>" on the right — followed by
// a bottom rule in the same style as the full header's but slimmer.
//
// A SEPARATE component rather than a `compact` prop on PdfHeader: the two share
// no structure (the full header is a two-column logo/contact/badge layout; this
// is a one-line row), a prop would turn PdfHeader into a switch over two
// unrelated trees, and each variant needs its OWN StyleSheet keys that
// lib/pdf/measure-header-height.ts cites (measureHeaderHeightPt vs
// measureCompactHeaderHeightPt).
//
// Single line by construction: the name has `maxLines: 1` (+ ellipsis) with `maxWidth: 70%` so a
// very long company name ellipsizes instead of wrapping into a second line the
// pagination budget has not reserved. It never shows the language chip.
//
// Called as a PLAIN FUNCTION by both templates — see pdf-header.tsx's top comment.
import { View, Text } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'

export interface PdfCompactHeaderStyles {
  compactHeader: Style
  compactCompanyName: Style
  compactEstimateId: Style
}

export interface PdfCompactHeaderProps {
  companyName: string
  /** Fully formatted identifier, e.g. "Estimate #EST-1042" (label + formatEstimateNumber()). */
  estimateIdentifier: string
  /** Classic passes brandColor (dynamic border-bottom colour). Modern passes undefined — its rule is static. */
  headerBorderColor?: string
  /** Classic passes brandText (company-name colour). Modern passes undefined — its name colour is static. */
  companyNameColor?: string
  styles: PdfCompactHeaderStyles
}

export function PdfCompactHeader({
  companyName,
  estimateIdentifier,
  headerBorderColor,
  companyNameColor,
  styles,
}: PdfCompactHeaderProps) {
  return (
    <View
      style={
        headerBorderColor
          ? [styles.compactHeader, { borderBottomColor: headerBorderColor }]
          : styles.compactHeader
      }
      fixed
    >
      <Text
        style={[
          styles.compactCompanyName,
          // react-pdf takes maxLines/textOverflow as STYLE props (@react-pdf/layout getMaxLines).
          // maxWidth is load-bearing: a react-pdf Text never shrinks below its unwrapped
          // width (flexShrink alone does nothing), so without an explicit cap a long
          // name would run underneath the estimate identifier.
          { maxWidth: '70%', maxLines: 1, textOverflow: 'ellipsis' },
          ...(companyNameColor ? [{ color: companyNameColor }] : []),
        ]}
      >
        {companyName}
      </Text>
      <Text style={styles.compactEstimateId}>{estimateIdentifier}</Text>
    </View>
  )
}
