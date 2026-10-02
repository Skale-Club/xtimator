// components/pdf/shared/pdf-footer.tsx
//
// Phase 183 Plan 04 (ENGINE-03) — shared footer for both PDF templates:
// "{company name} · Estimate #{number} · Page N of M". Byte-identical
// structure; only StyleSheet VALUES differ.
//
// The footer is absolutely positioned inside the page's bottom padding, so it
// consumes none of the pagination budget — but it must never wrap into a second
// line (it would collide with the page edge). It is therefore a centred ROW of
// two Texts: the company name is `maxLines: 1` (+ ellipsis) with an explicit
// `maxWidth: 55%`, so an over-long name is ellipsized, while the tail
// "· Estimate #<n> · Page N of M" is `flexShrink: 0` and is NEVER truncated.
//
// NOTE on invocation style: see pdf-header.tsx's top comment — both templates
// call this as a PLAIN FUNCTION (`{PdfFooter({...})}`), not JSX.

import { View, Text } from '@react-pdf/renderer'
import type { Style } from '@react-pdf/types'
import type { DocumentLabels } from '@/lib/estimate/document/labels'

export interface PdfFooterStyles {
  footer: Style
}

export interface PdfFooterProps {
  styles: PdfFooterStyles
  L: DocumentLabels
  companyName: string
  /** Output of formatEstimateNumber() — the label ("Estimate #") is added here. */
  estimateNumber: string
}

export function PdfFooter({ styles, L, companyName, estimateNumber }: PdfFooterProps) {
  return (
    <View style={[styles.footer, { flexDirection: 'row', justifyContent: 'center' }]} fixed>
      {/* Company name: capped at 55% of the footer width, one line, ellipsized. react-pdf
          takes maxLines/textOverflow as STYLE props (@react-pdf/layout getMaxLines). A
          flexShrink alone does NOT work — a react-pdf Text never shrinks below its
          unwrapped width, so the cap must be an explicit maxWidth. */}
      <Text style={{ maxWidth: '55%', maxLines: 1, textOverflow: 'ellipsis' }}>{companyName}</Text>
      {/* Tail: " · Estimate #<n> · Page N of M" — short, never truncated, never shrunk.
          Leading NBSP (not a plain space): a plain leading space is dropped at the start of a flex child's text. */}
      <Text
        style={{ flexShrink: 0 }}
        render={({ pageNumber, totalPages }) =>
          `\u00A0· ${L.estimateNum}${estimateNumber} · ${L.page} ${pageNumber} ${L.of} ${totalPages}`
        }
      />
    </View>
  )
}
