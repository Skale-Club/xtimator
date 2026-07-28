// components/pdf/shared/pdf-footer.tsx
//
// Phase 183 Plan 04 (ENGINE-03) — shared "Page N of M" footer for both PDF
// templates. Byte-identical structure; only StyleSheet VALUES differ.
//
// NOTE on invocation style: see pdf-header.tsx's top comment — both templates
// call this as a PLAIN FUNCTION (`{PdfFooter({...})}`), not JSX.

import { Text } from '@react-pdf/renderer'
import type { DocumentLabels } from '@/lib/estimate/document/labels'

export interface PdfFooterStyles {
  footer: object
}

export interface PdfFooterProps {
  styles: PdfFooterStyles
  L: DocumentLabels
}

export function PdfFooter({ styles, L }: PdfFooterProps) {
  return (
    <Text
      style={styles.footer}
      fixed
      render={({ pageNumber, totalPages }) =>
        `${L.page} ${pageNumber} ${L.of} ${totalPages}`
      }
    />
  )
}
